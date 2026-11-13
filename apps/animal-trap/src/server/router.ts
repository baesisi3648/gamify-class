/**
 * router.ts — HTTP 라우터 (DESIGN §7). **env 를 모른다** — 포트(Ports)만 안다. 테스트는 가짜 포트로 돈다.
 *
 * 봉투: { ok: true, data } | { ok: false, error: 코드 }. 화면은 error 코드로 분기한다.
 * 인증값은 **헤더로만** 받는다(쿼리 금지 — 주소는 로그에 남는다):
 *   X-Admin-Password · X-Host-Key · X-Tv-Key · X-Team-Pin · X-Control-Token
 *
 *   GET  /api/version
 *   POST /api/game                      관리자  판 생성
 *   GET  /api/game/:code/lobby          없음    판 제목·단계
 *   POST /api/game/:code/view           역할별  현재 뷰 (body.role = teacher|tv|team, team)
 *   POST /api/game/:code/teacher        교사    { requestId?, cmd }
 *   POST /api/game/:code/join           PIN     { team } → 조작권 획득 시 토큰
 *   POST /api/game/:code/team           PIN+토큰 { team, requestId?, cmd }
 *   GET  /ws/:code                      소켓 업그레이드는 index.ts 가 DO 로 넘긴다(여기서는 코드 확인만)
 *
 * ⚠️ 판 코드는 비밀이 아니다. 존재 확인(D1)을 통과한 코드만 DO 를 깨운다.
 * 판 생성은 D1 코드 예약 → DO 생성 → (실패 시 예약 취소) 순서.
 */
import type { RoomConfig } from '../game/room.ts';
import { CONFIG_RANGE } from '../game/room.ts';
import type { BankQuestion } from '../game/questions.ts';

export type Envelope = { ok: true; data: unknown } | { ok: false; error: string };
export interface ApiRequest { method: string; path: string; headers: Record<string, string>; body: unknown }
export interface ApiResponse { status: number; body: Envelope }

export type ViewRole = { role: 'teacher'; key: string } | { role: 'tv'; key: string } | { role: 'team'; team: number; pin: string; token: string };

export interface CreateInput { code: string; title: string; setName: string; config: RoomConfig; createId: string }
export interface RoomPort {
  create(input: CreateInput, bank: BankQuestion[]): Promise<Envelope>;
  lobby(): Promise<Envelope>;
  view(who: ViewRole): Promise<Envelope>;
  teacher(key: string, cmd: unknown, requestId: string | undefined): Promise<Envelope>;
  join(team: number, pin: string): Promise<Envelope>;
  team(team: number, pin: string, token: string, cmd: unknown, requestId: string | undefined): Promise<Envelope>;
}
export interface Ports {
  room(code: string): RoomPort;
  gameExists(code: string): Promise<boolean>;
  /** 코드 예약(D1 PK). 이미 있으면 false — 코드 충돌을 원자적으로 막는다 */
  reserveGame(row: { code: string; title: string; setName: string; createdAt: number }): Promise<boolean>;
  /** 예약 취소 (DO 생성 실패 시) */
  releaseGame(code: string): Promise<void>;
  questions(setName: string): Promise<BankQuestion[]>;
  adminPassword: string | undefined;
  eq(a: string, b: string): Promise<boolean>;
  now(): number;
  randomCode(): string;
  /** 판 생성 요청 식별자(무작위) */
  randomId(): string;
}

/** 판 코드: 헷갈리는 글자 없는 6자 */
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const STATUS: Record<string, number> = {
  NOT_FOUND: 404, NO_ROOM: 404, METHOD: 405, BAD_REQUEST: 400, BAD_CODE: 400, ADMIN_DISABLED: 403, ADMIN_DENIED: 401,
  BAD_KEY: 401, BAD_PIN: 401, PIN_LOCKED: 429, NOT_CONTROLLER: 403, FORBIDDEN: 403, BAD_TEAM: 400, EXISTS: 409, CODE_BUSY: 503,
  CREATE_UNCERTAIN: 503, BAD_CONFIG: 400, BANK_EMPTY_LEVEL: 422, BANK_TOO_LARGE: 422, BANK_INVALID: 422, STALE: 409, BAD_PHASE: 409, PAUSED: 409
};
const reply = (env: Envelope): ApiResponse => ({ status: env.ok ? 200 : STATUS[env.error] ?? 409, body: env });
const err = (error: string) => reply({ ok: false, error });

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const reqId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined);
const teamNo = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 8 ? (v as number) : -1);

function configFrom(b: Record<string, unknown>): RoomConfig | null {
  const ms = (v: unknown, unit: number, def: number) => (v === undefined ? def : Number.isInteger(v) ? (v as number) * unit : NaN);
  const c: RoomConfig = {
    durationMs: ms(b.durationMin, 60_000, 15 * 60_000), moveMs: ms(b.moveSec, 1000, 20_000),
    quizMs: ms(b.quizSec, 1000, 45_000), setupMs: ms(b.setupSec, 1000, 120_000), autoNext: b.autoNext === true
  };
  for (const k of Object.keys(CONFIG_RANGE) as (keyof typeof CONFIG_RANGE)[]) if (!(c[k] >= CONFIG_RANGE[k][0] && c[k] <= CONFIG_RANGE[k][1])) return null;
  return c;
}

async function createGame(req: ApiRequest, p: Ports): Promise<ApiResponse> {
  if (!p.adminPassword) return err('ADMIN_DISABLED');
  if (!(await p.eq(req.headers['x-admin-password'] ?? '', p.adminPassword))) return err('ADMIN_DENIED');
  const b = obj(req.body);
  const title = str(b.title, 60) || '애니멀 트랩';
  const setName = str(b.setName, 60);
  const config = configFrom(b);
  if (!config) return err('BAD_CONFIG');
  const bank = await p.questions(setName);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = p.randomCode();
    if (!CODE_RE.test(code)) continue;
    // D1 에 먼저 코드를 예약한다(PK). DO 생성이 실패하면 예약을 지운다 → 고립된 DO·D1 행이 남지 않는다
    if (!(await p.reserveGame({ code, title, setName, createdAt: p.now() }))) continue;
    const input = { code, title, setName, config, createId: p.randomId() };
    let created: Envelope | null = null;
    // 결과가 불확실한 예외(DO 는 만들어졌는데 응답만 유실)에 대비해 같은 createId 로 한 번 더 —
    // DO 는 같은 createId 면 이미 만든 판의 자격을 그대로 돌려준다(멱등)
    for (let i = 0; i < 2 && !created; i++) { try { created = await p.room(code).create(input, bank); } catch { /* 아래에서 판단 */ } }
    if (!created) {
      const exists = await p.room(code).lobby().then((r) => r.ok, () => true); // 확인조차 실패하면 예약을 지우지 않는다
      if (!exists) await p.releaseGame(code);
      return err('CREATE_UNCERTAIN');
    }
    if (!created.ok) { await p.releaseGame(code); if (created.error === 'EXISTS') continue; return reply(created); }
    return reply({ ok: true, data: { code, ...(created.data as object) } });
  }
  return err('CODE_BUSY');
}

export async function route(req: ApiRequest, p: Ports): Promise<ApiResponse> {
  if (req.path === '/api/version') return reply({ ok: true, data: { app: 'animal-trap' } });
  if (req.path === '/api/game') return req.method === 'POST' ? createGame(req, p) : err('METHOD');

  const m = req.path.match(/^\/api\/game\/([^/]+)\/(lobby|view|teacher|join|team)$/);
  if (!m) return err('NOT_FOUND');
  const code = m[1].toUpperCase(), action = m[2];
  if (!CODE_RE.test(code)) return err('BAD_CODE');
  if (!(await p.gameExists(code))) return err('NO_ROOM');
  const room = p.room(code), h = req.headers, b = obj(req.body);

  if (action === 'lobby') return req.method === 'GET' ? reply(await room.lobby()) : err('METHOD');
  if (req.method !== 'POST') return err('METHOD');
  switch (action) {
    case 'view': {
      const role = b.role;
      if (role === 'teacher') return reply(await room.view({ role: 'teacher', key: h['x-host-key'] ?? '' }));
      if (role === 'tv') return reply(await room.view({ role: 'tv', key: h['x-tv-key'] ?? '' }));
      if (role === 'team') return reply(await room.view({ role: 'team', team: teamNo(b.team), pin: h['x-team-pin'] ?? '', token: h['x-control-token'] ?? '' }));
      return err('BAD_REQUEST');
    }
    case 'teacher': return reply(await room.teacher(h['x-host-key'] ?? '', b.cmd, reqId(b.requestId)));
    case 'join': return reply(await room.join(teamNo(b.team), h['x-team-pin'] ?? ''));
    case 'team': return reply(await room.team(teamNo(b.team), h['x-team-pin'] ?? '', h['x-control-token'] ?? '', b.cmd, reqId(b.requestId)));
  }
  return err('NOT_FOUND');
}
