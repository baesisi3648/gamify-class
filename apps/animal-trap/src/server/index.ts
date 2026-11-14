/**
 * index.ts — Worker 진입점. **런타임을 꽂는 일만 한다** — 라우팅·인증 판단은 router.ts(포트만 안다)와 DO.
 *
 *   1. Request → ApiRequest (헤더 소문자, JSON 본문)
 *   2. env → Ports (DO RPC · D1 · ADMIN_PASSWORD · 시계 · 난수)
 *   3. /ws/:code 는 D1 에 있는 판 코드만 DO 로 업그레이드를 넘긴다(인증은 DO 가 hello 에서)
 *
 * ⚠️ Worker 진입 모듈은 핸들러·DO 클래스 말고는 내보내면 안 된다(workerd 가 시작을 거부한다).
 */
import { TrapRoom } from '../do/TrapRoom.ts';
import type { Env } from '../do/TrapRoom.ts';
import type { BankQuestion } from '../game/questions.ts';
import { safeEqual } from './auth.ts';
import { LIMITS, type QuestionRow } from './bank.ts';
import { adminGate, isAdminPath, type StoredQuestion } from './admin.ts';
import type { Level } from '../game/types.ts';
import { CODE_RE, route, type ApiRequest, type Ports, type RoomPort } from './router.ts';

export { TrapRoom };

function rowToStored(r: Record<string, unknown>): StoredQuestion {
  return { id: Number(r.id), setName: String(r.set_name), level: r.level as Level, text: String(r.text), choices: [r.choice1, r.choice2, r.choice3, r.choice4].map(String), answer: Number(r.answer), explanation: String(r.explanation ?? '') };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => CODE_ALPHABET[x % 32]).join('');
}

const stub = (env: Env, code: string) => env.TRAP_ROOM.get(env.TRAP_ROOM.idFromName(code));

function portsOf(env: Env): Ports {
  return {
    room: (code): RoomPort => {
      const s = stub(env, code);
      return {
        create: (i, b) => s.create(i, b), lobby: () => s.lobby(), view: (w) => s.view(w),
        teacher: (k, c, r) => s.teacher(k, c, r), join: (t, p) => s.join(t, p), team: (t, p, tok, c, r) => s.team(t, p, tok, c, r)
      };
    },
    gameExists: async (code) => !!(await env.DB.prepare('SELECT 1 AS x FROM games WHERE code = ?').bind(code).first()),
    reserveGame: async (g) => {
      const r = await env.DB.prepare('INSERT INTO games (code, title, set_name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING').bind(g.code, g.title, g.setName, g.createdAt).run();
      return (r.meta?.changes ?? 0) === 1;
    },
    releaseGame: async (code) => { await env.DB.prepare('DELETE FROM games WHERE code = ?').bind(code).run(); },
    questions: async (setName) => {
      const q = setName
        ? env.DB.prepare('SELECT * FROM questions WHERE set_name = ? ORDER BY id').bind(setName)
        : env.DB.prepare('SELECT * FROM questions ORDER BY id');
      const rows = (await q.all<Record<string, unknown>>()).results;
      return rows.map((r): BankQuestion => ({ id: String(r.id), level: r.level as BankQuestion['level'], text: String(r.text),
        choices: [r.choice1, r.choice2, r.choice3, r.choice4].map(String), answer: Number(r.answer), explanation: String(r.explanation ?? '') }));
    },
    adminPassword: env.ADMIN_PASSWORD || undefined,
    adminAttempt: env.ADMIN_LIMITER ? async (ip) => (await env.ADMIN_LIMITER!.limit({ key: 'admin:' + ip })).success : undefined,
    listSets: async () => {
      const rows = (await env.DB.prepare('SELECT set_name, level, COUNT(*) AS n FROM questions GROUP BY set_name, level ORDER BY set_name').all<{ set_name: string; level: Level; n: number }>()).results;
      const map = new Map<string, Record<Level, number>>();
      for (const r of rows) { const c = map.get(r.set_name) ?? { 쉬움: 0, 보통: 0, 어려움: 0 }; c[r.level] = r.n; map.set(r.set_name, c); }
      return [...map].map(([name, counts]) => ({ name, counts }));
    },
    listQuestions: async (setName) => (await env.DB.prepare('SELECT * FROM questions WHERE set_name = ? ORDER BY id').bind(setName).all<Record<string, unknown>>()).results.map(rowToStored),
    importRows: async (setName, mode, rows: QuestionRow[]) => {
      const ins = env.DB.prepare('INSERT INTO questions (set_name, level, text, choice1, choice2, choice3, choice4, answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const stmts = rows.map((r) => ins.bind(setName, r.level, r.text, r.choices[0], r.choices[1], r.choices[2], r.choices[3], r.answer, r.explanation));
      // 한 batch = 한 트랜잭션. replace 는 지우기+넣기, 마지막에 세트 총량을 다시 센다 —
      // 300 을 넘으면 json() 오류로 batch 전체가 되돌아간다(동시에 두 번 추가해도 넘치지 않게)
      const guard = env.DB.prepare(`SELECT CASE WHEN (SELECT COUNT(*) FROM questions WHERE set_name = ?) > ${LIMITS.perImport} THEN json('SET_FULL') END AS x`).bind(setName);
      try {
        await env.DB.batch([...(mode === 'replace' ? [env.DB.prepare('DELETE FROM questions WHERE set_name = ?').bind(setName)] : []), ...stmts, guard]);
      } catch (e) {
        if (/malformed JSON/i.test(String((e as Error)?.message ?? e))) return 'FULL';
        throw e;
      }
      return rows.length;
    },
    deleteSet: async (setName) => (await env.DB.prepare('DELETE FROM questions WHERE set_name = ?').bind(setName).run()).meta?.changes ?? 0,
    deleteQuestion: async (id) => ((await env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(id).run()).meta?.changes ?? 0) === 1,
    eq: safeEqual,
    now: () => Date.now(),
    randomCode,
    randomId: () => crypto.randomUUID()
  };
}

/** 본문은 정해진 바이트까지만 읽는다(Content-Length 를 믿지 않고 실제로 센다). 넘치면 'TOO_LARGE' */
async function readJson(request: Request, max: number): Promise<unknown | 'TOO_LARGE'> {
  if (!request.body) return undefined;
  if (Number(request.headers.get('content-length') ?? 0) > max) return 'TOO_LARGE';
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return 'TOO_LARGE'; }
    parts.push(value);
  }
  const all = new Uint8Array(size); let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(all)); } catch { return undefined; }
}
const BODY_MAX = 32 * 1024, ADMIN_BODY_MAX = 1024 * 1024; // 300문항×(500+4×150+1000자)×UTF-8 3바이트 ≈ 1.9MB 가 이론상 최대지만 실제 세트는 수백 KB

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const ws = url.pathname.match(/^\/ws\/([^/]+)$/);
    if (ws) {
      const code = ws[1].toUpperCase();
      if (!CODE_RE.test(code)) return json(400, { ok: false, error: 'BAD_CODE' });
      if (!(await portsOf(env).gameExists(code))) return json(404, { ok: false, error: 'NO_ROOM' });
      return stub(env, code).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) {
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      const ports = portsOf(env);
      // 관리 경로는 비밀번호·시도 제한을 먼저 — 틀린 요청은 본문을 읽지도 않는다
      const admin = isAdminPath(url.pathname);
      if (admin) { const denied = await adminGate(headers, ports); if (denied) return json(denied.ok ? 200 : denied.error === 'ADMIN_RATE_LIMITED' ? 429 : denied.error === 'ADMIN_DENIED' ? 401 : 403, denied); }
      const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readJson(request, admin ? ADMIN_BODY_MAX : BODY_MAX);
      if (body === 'TOO_LARGE') return json(413, { ok: false, error: 'TOO_LARGE', message: admin ? '파일이 너무 커요 (1MB까지). 세트를 나눠서 넣어 주세요.' : undefined });
      const req: ApiRequest = { method: request.method, path: url.pathname, headers, body, adminChecked: admin || undefined };
      const res = await route(req, ports);
      return json(res.status, res.body);
    }
    if (url.pathname.startsWith('/ws/')) return json(404, { ok: false, error: 'NOT_FOUND' });
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
