/**
 * access.ts — 인증·조작권 (DESIGN §3). 순수 함수: 비교는 호출자가 넘겨 준 safeEqual 로, 난수는 makeKey 로.
 *
 *  - 교사 열쇠 / TV 열쇠: 128비트 무작위. TV 는 읽기 전용(쓰기 명령은 서버가 거부).
 *  - 팀 PIN(4자리) + 조작권 토큰: 입장(join)은 PIN 만으로. 조작권이 비어 있으면 원자적으로 획득해 토큰 발급.
 *    조작 명령은 PIN + 토큰 + controlGen 일치. 교사가 해제하면 controlGen+1 → 이전 토큰 즉시 무효.
 *  - PIN 실패 제한은 '새 입장 시도'에만(팀별 5회 실패 → 30초). 이미 입장한 소켓·토큰 보유자는 영향 없음.
 *  - 자격 세대: tvGen(TV 열쇠 재발급마다 +1), pinGen(PIN 재발급마다 +1). 소켓 attachment 와 비교해 무효화.
 */
import { TEAMS } from './board.ts';
import type { Creds, RoomState } from './room.ts';

export type Eq = (a: string, b: string) => Promise<boolean>;
export type KeyGen = () => string;

export const PIN_FAIL_LIMIT = 5;
export const PIN_LOCK_MS = 30_000;

export type AccessError = 'BAD_KEY' | 'BAD_PIN' | 'PIN_LOCKED' | 'BAD_TEAM' | 'NOT_CONTROLLER' | 'NO_ROOM';

/** 4자리 PIN 8개 (서로 다르게). rand() 는 [0,1) */
export function makePins(rand: () => number): string[] {
  const pins = new Set<string>();
  while (pins.size < TEAMS) pins.add(String(Math.floor(rand() * 10000)).padStart(4, '0'));
  return [...pins];
}

export function makeCreds(makeKey: KeyGen, rand: () => number): Creds {
  return { hostKey: makeKey(), tvKey: makeKey(), tvGen: 1, pins: makePins(rand), pinGen: Array(TEAMS).fill(1),
    controlToken: Array(TEAMS).fill(null), controlGen: Array(TEAMS).fill(1), pinFails: Array.from({ length: TEAMS }, () => ({ count: 0, until: 0 })) };
}

const validTeam = (t: unknown): t is number => Number.isInteger(t) && (t as number) >= 0 && (t as number) < TEAMS;

export async function checkTeacher(s: RoomState, key: string, eq: Eq): Promise<boolean> { return eq(key, s.creds.hostKey); }
export async function checkTv(s: RoomState, key: string, eq: Eq): Promise<boolean> { return eq(key, s.creds.tvKey); }

/**
 * PIN 시도(실패 제한 적용) — 새 인증이 필요한 **모든** 경로(입장·상태 조회·소켓 hello)가 이것만 쓴다.
 * 반환 state 는 실패 횟수가 바뀐 새 상태 — 호출자가 저장한다.
 */
export async function attemptPin(s: RoomState, team: unknown, pin: string, now: number, eq: Eq):
  Promise<{ state: RoomState; error: AccessError | null }> {
  if (!validTeam(team)) return { state: s, error: 'BAD_TEAM' };
  const fails = s.creds.pinFails[team];
  if (fails.until > now) return { state: s, error: 'PIN_LOCKED' };
  if (await eq(pin, s.creds.pins[team])) {
    if (fails.count === 0 && fails.until === 0) return { state: s, error: null };
    const next = structuredClone(s); next.creds.pinFails[team] = { count: 0, until: 0 };
    return { state: next, error: null };
  }
  const next = structuredClone(s);
  const count = fails.count + 1;
  next.creds.pinFails[team] = count >= PIN_FAIL_LIMIT ? { count: 0, until: now + PIN_LOCK_MS } : { count, until: 0 };
  return { state: next, error: 'BAD_PIN' };
}

/** 입장: PIN 시도. 조작권이 비어 있으면 원자적으로 획득해 토큰 발급, 아니면 관람자 */
export async function join(s: RoomState, team: unknown, pin: string, now: number, eq: Eq, makeKey: KeyGen):
  Promise<{ state: RoomState; ok: true; role: 'controller' | 'viewer'; token: string | null } | { state: RoomState; ok: false; error: AccessError }> {
  const a = await attemptPin(s, team, pin, now, eq);
  if (a.error) return { state: a.state, ok: false, error: a.error };
  const t = team as number;
  if (a.state.creds.controlToken[t] === null) {
    const next = a.state === s ? structuredClone(s) : a.state;
    const token = makeKey();
    next.creds.controlToken[t] = token;
    return { state: next, ok: true, role: 'controller', token };
  }
  return { state: a.state, ok: true, role: 'viewer', token: null };
}

/**
 * 조작 명령 자격: **토큰을 먼저** 본다. 토큰이 현재 조작권과 다르면 PIN 은 보지도 않고 NOT_CONTROLLER —
 * 그래서 이 경로로는 PIN 정답 여부를 알아낼 수 없다(추측은 attemptPin 경로에서만, 실패 제한 적용).
 */
export async function checkController(s: RoomState, team: unknown, pin: string, token: string, eq: Eq): Promise<AccessError | null> {
  if (!validTeam(team)) return 'BAD_TEAM';
  const current = s.creds.controlToken[team];
  if (current === null || !(await eq(token, current))) return 'NOT_CONTROLLER';
  if (!(await eq(pin, s.creds.pins[team]))) return 'BAD_PIN';
  return null;
}

// ── 교사 관리 명령 (자격 갱신) ────────────────────────────────────
export function releaseControl(s: RoomState, team: number): RoomState {
  const n = structuredClone(s);
  n.creds.controlToken[team] = null; n.creds.controlGen[team]++;
  return n;
}
export function unlockPin(s: RoomState, team: number): RoomState {
  const n = structuredClone(s); n.creds.pinFails[team] = { count: 0, until: 0 }; return n;
}
/** PIN 재발급: 기존 PIN·조작권 모두 무효(그 팀 소켓은 끊긴다) */
export function reissuePin(s: RoomState, team: number, rand: () => number): RoomState {
  const n = structuredClone(s);
  const others = new Set(n.creds.pins.filter((_, i) => i !== team));
  let pin: string;
  do pin = String(Math.floor(rand() * 10000)).padStart(4, '0'); while (others.has(pin) || pin === n.creds.pins[team]);
  n.creds.pins[team] = pin; n.creds.pinGen[team]++;
  n.creds.controlToken[team] = null; n.creds.controlGen[team]++;
  n.creds.pinFails[team] = { count: 0, until: 0 };
  return n;
}
export function reissueTv(s: RoomState, makeKey: KeyGen): RoomState {
  const n = structuredClone(s); n.creds.tvKey = makeKey(); n.creds.tvGen++; return n;
}

/** 교사 자격 관리 명령 처리 (멱등: 같은 requestId 는 같은 결과, 처리키는 상태와 함께 저장) */
export type AccessCmd = { type: 'releaseControl'; team: number } | { type: 'unlockPin'; team: number } | { type: 'reissuePin'; team: number } | { type: 'reissueTv' };
export function handleAccess(s: RoomState, cmd: AccessCmd, requestId: string | undefined, rand: () => number, makeKey: KeyGen):
  { state: RoomState; data: unknown; replay: boolean } {
  if (requestId) {
    const hit = s.processed.teacher?.find((p) => p.id === requestId);
    if (hit) return { state: s, data: hit.result.ok ? hit.result.data ?? null : null, replay: true };
  }
  const next = cmd.type === 'releaseControl' ? releaseControl(s, cmd.team) : cmd.type === 'unlockPin' ? unlockPin(s, cmd.team)
    : cmd.type === 'reissuePin' ? reissuePin(s, cmd.team, rand) : reissueTv(s, makeKey);
  const data = cmd.type === 'reissuePin' ? { pin: next.creds.pins[cmd.team] } : cmd.type === 'reissueTv' ? { tvKey: next.creds.tvKey } : null;
  if (requestId) {
    const list = (next.processed.teacher ??= []);
    list.push({ id: requestId, result: { ok: true, data } });
    if (list.length > 64) list.splice(0, list.length - 64);
  }
  return { state: next, data, replay: false };
}
