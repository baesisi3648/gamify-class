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
import { CODE_RE, route, type ApiRequest, type Ports, type RoomPort } from './router.ts';

export { TrapRoom };

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
    eq: safeEqual,
    now: () => Date.now(),
    randomCode,
    randomId: () => crypto.randomUUID()
  };
}

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
      const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.json().catch(() => undefined);
      const req: ApiRequest = { method: request.method, path: url.pathname, headers, body };
      const res = await route(req, portsOf(env));
      return json(res.status, res.body);
    }
    if (url.pathname.startsWith('/ws/')) return json(404, { ok: false, error: 'NOT_FOUND' });
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
