/**
 * room.ts — 판 상태 머신 (DESIGN §5). **순수 함수**: Workers API 없음, 시각은 인자로 받는다.
 * DO(TrapRoom.ts)는 저장·alarm·소켓만 꽂는다. 테스트는 가짜 시계로 이 파일을 직접 돌린다.
 *
 *   handle(state, bank, actor, cmd, now) → { state, result, changed, alarmAt, events }
 *     ① 같은 행위자의 같은 requestId 면 저장된 결과를 그대로 (단계가 바뀐 뒤의 재전송도 성공)
 *     ② tick(now): 지난 마감을 먼저 적용 (메인 만료 → 단계 마감 순, D13)
 *     ③ 명령 적용 ④ 처리키 기록 ⑤ 바뀌었으면 stateVersion+1 ⑥ 다음 alarm 시각
 *   DO 는 결과 state 를 **저장한 뒤에** 응답·푸시한다.
 *
 * ⚠️ 인증(교사 열쇠·팀 PIN·조작권)은 3단계 게이트웨이가 확인하고 actor 로 넘긴다. 여기서는 actor 를 믿는다.
 */
import type { Cell } from './board.ts';
import { TEAMS } from './board.ts';
import { elapsed, mainEndsAt, mainRemaining, newClock, pause, resume, setPhase, startMain, stopMain, type Clock } from './clock.ts';
import { LEVELS, pickQuestion, type BankQuestion } from './questions.ts';
import { makeRng } from './rng.ts';
import { applyRecon, isBound, land, resolve, validMove } from './rules.ts';
import { autoPlace, drawZones, moveTrap, newGame, swapTraps, validPlacement } from './setup.ts';
import type { Committed, Pending, RoundEvent, Trap } from './types.ts';

export type RoomPhase = 'LOBBY' | 'DRAWN' | 'TRAP_SETUP' | 'READY' | 'RUNNING' | 'FINISHED' | 'REVIEW';
export type RoundStep = 'MOVE_OPEN' | 'QUESTION_OPEN' | 'ROUND_SUMMARY';

export interface RoomConfig { durationMs: number; moveMs: number; quizMs: number; setupMs: number; autoNext: boolean }
export const SUMMARY_AUTO_MS = 5000;
export const CONFIG_RANGE = {
  durationMs: [60_000, 60 * 60_000], moveMs: [10_000, 60_000], quizMs: [20_000, 120_000], setupMs: [60_000, 300_000]
} as const;
export const DEFAULT_CONFIG: RoomConfig = { durationMs: 15 * 60_000, moveMs: 20_000, quizMs: 45_000, setupMs: 120_000, autoNext: false };

/** 자격 정보 (3단계에서 검증에 쓴다). 어떤 학생·TV 뷰에도 나가지 않는다 */
export interface Creds {
  hostKey: string; tvKey: string; tvGen: number;
  pins: string[]; pinGen: number[];
  controlToken: (string | null)[]; controlGen: number[];
  /** 팀별 새 입장 PIN 실패 횟수·잠금 해제 시각 (DESIGN §3) */
  pinFails: { count: number; until: number }[];
}

export type CmdResult = { ok: true; data?: unknown } | { ok: false; error: string };

export interface RoomState {
  v: 1;
  code: string; title: string; setName: string; createdAt: number;
  /** 판 생성 요청 식별자 — 응답이 유실돼 다시 보낸 생성 요청에 같은 자격을 돌려주기 위해 */
  createId: string;
  config: RoomConfig;
  phase: RoomPhase;
  step: RoundStep | null;
  stateVersion: number;
  rngState: number;
  zones: number[] | null;
  setupTraps: Trap[] | null;
  confirmed: boolean[];
  committed: Committed | null;
  pending: Pending | null;
  moves: (Cell | null)[];
  answers: (number | null)[];          // 문항별 첫 답(1~4), 이후 불변
  clock: Clock;
  finishAfterRound: boolean;
  endReason: 'time' | 'manual' | null;
  lastEvents: RoundEvent[];
  eventSeq: number;
  cancelled: { round: number; team: number; questionId: string }[]; // 수동 종료로 취소된 문항(감사용)
  processed: Record<string, { id: string; result: CmdResult }[]>;
  creds: Creds;
  /** 복습: 공개한 문항·덫 지도, 그리고 지금 TV 에 띄울 것(교사가 고른다) */
  review: { revealed: string[]; trapsRevealed: boolean; display: 'ranking' | 'map' | 'question'; focus: string | null };
}

export type Actor = { kind: 'teacher' } | { kind: 'team'; team: number } | { kind: 'system' };
export type Command =
  | { type: 'draw' } | { type: 'startSetup' } | { type: 'startGame' }
  /** 교사 진행 버튼은 '지금 보고 있는 라운드·단계'를 함께 보낸다. 그사이 마감으로 단계가 바뀌었으면 STALE */
  | { type: 'next'; round: number } | { type: 'closePhase'; target: Target }
  | { type: 'pause' } | { type: 'resume' } | { type: 'finish' } | { type: 'review' } | { type: 'revealTraps' }
  | { type: 'revealQuestion'; questionId: string } | { type: 'showRanking' }
  | { type: 'trapMove'; trapId: number; to: Cell } | { type: 'trapSwap'; a: number; b: number } | { type: 'trapConfirm' }
  /** 이동·답안은 대상 라운드에 묶인다 — 지난 라운드의 늦은 재전송이 다음 라운드에 적용되지 않게 */
  | { type: 'move'; round: number; to: Cell } | { type: 'answer'; round: number; choice: number } | { type: 'recon'; topLeft: Cell }
  | { type: 'tick' };
export type Target = { phase: 'TRAP_SETUP' } | { phase: 'RUNNING'; step: 'MOVE_OPEN' | 'QUESTION_OPEN'; round: number };
export type CommandIn = Command & { requestId?: string };

/** 라운드 이벤트 묶음 — 한 호출이 여러 라운드를 정산해도(전원 속박·지연 alarm) 라운드별로 따로 저장한다 */
export interface EventBatch { seq: number; round: number; events: RoundEvent[] }

export interface HandleOut { state: RoomState; result: CmdResult; changed: boolean; alarmAt: number | null; events: EventBatch[] }

const PROCESSED_KEEP = 64;
const fail = (error: string): CmdResult => ({ ok: false, error });
const OK: CmdResult = { ok: true };

// ── 판 생성 ────────────────────────────────────────────────────
export type CreateError = 'BAD_CONFIG' | 'BANK_EMPTY_LEVEL' | 'BANK_TOO_LARGE' | 'BANK_INVALID';
export const BANK_MAX = 300;
export const BANK_WARN_PER_LEVEL = 12;

export function validateBank(bank: readonly BankQuestion[]): { error: CreateError | null; warnings: string[] } {
  if (bank.length > BANK_MAX) return { error: 'BANK_TOO_LARGE', warnings: [] };
  if (new Set(bank.map((q) => q.id)).size !== bank.length) return { error: 'BANK_INVALID', warnings: [] };
  if (bank.some((q) => typeof q.id !== 'string' || !q.id.trim() || !LEVELS.includes(q.level) || q.choices.length !== 4 || !Number.isInteger(q.answer) || q.answer < 1 || q.answer > 4 || !q.text)) return { error: 'BANK_INVALID', warnings: [] };
  const warnings: string[] = [];
  for (const level of LEVELS) {
    const n = bank.filter((q) => q.level === level).length;
    if (!n) return { error: 'BANK_EMPTY_LEVEL', warnings: [] };
    if (n < BANK_WARN_PER_LEVEL) warnings.push(`${level} ${n}문항: 한 팀에 같은 문제가 다시 나올 수 있습니다`);
  }
  return { error: null, warnings };
}

export function validConfig(c: RoomConfig): boolean {
  return (Object.keys(CONFIG_RANGE) as (keyof typeof CONFIG_RANGE)[]).every((k) => Number.isInteger(c[k]) && c[k] >= CONFIG_RANGE[k][0] && c[k] <= CONFIG_RANGE[k][1]) && typeof c.autoNext === 'boolean';
}

export function createRoom(input: { code: string; title: string; setName: string; config: RoomConfig; seed: number; creds: Creds; createId?: string }, bank: readonly BankQuestion[], now: number): { state: RoomState; warnings: string[] } | { error: CreateError } {
  if (!validConfig(input.config)) return { error: 'BAD_CONFIG' };
  const v = validateBank(bank);
  if (v.error) return { error: v.error };
  const state: RoomState = {
    v: 1, code: input.code, title: input.title, setName: input.setName, createdAt: now, createId: input.createId ?? '', config: input.config,
    phase: 'LOBBY', step: null, stateVersion: 1, rngState: input.seed >>> 0,
    zones: null, setupTraps: null, confirmed: Array(TEAMS).fill(false), committed: null, pending: null,
    moves: Array(TEAMS).fill(null), answers: Array(TEAMS).fill(null), clock: newClock(input.config.durationMs),
    finishAfterRound: false, endReason: null, lastEvents: [], eventSeq: 0, cancelled: [], processed: {}, creds: input.creds,
    review: { revealed: [], trapsRevealed: false, display: 'ranking', focus: null }
  };
  return { state, warnings: v.warnings };
}

// ── 내부 전이 (s 를 직접 고친다: handle 이 미리 복제해 둔다) ─────────────
type Ctx = { s: RoomState; bank: readonly BankQuestion[]; now: number; events: EventBatch[] };

const round = (s: RoomState) => (s.committed?.round ?? 0) + 1;

function finishSetup(c: Ctx) {
  c.s.confirmed = Array(TEAMS).fill(true);
  c.s.phase = 'READY';
  c.s.clock = setPhase(c.s.clock, c.now, null);
}

function openMove(c: Ctx) {
  c.s.step = 'MOVE_OPEN';
  c.s.moves = Array(TEAMS).fill(null);
  c.s.answers = Array(TEAMS).fill(null);
  c.s.clock = setPhase(c.s.clock, c.now, c.s.config.moveMs);
  if (!movableTeams(c.s).length) lockMoves(c); // 전원 속박이면 기다릴 이유가 없다
}

function finish(c: Ctx, reason: 'time' | 'manual') {
  const s = c.s;
  if (s.pending) {
    for (const l of s.pending.landings) if (l.questionId !== null) s.cancelled.push({ round: s.pending.round, team: l.team, questionId: l.questionId });
    s.pending = null; // 진행 중 라운드 전체 폐기 (D5): 확정 상태는 land 가 건드리지 않았으므로 복원할 것이 없다
  }
  s.moves = Array(TEAMS).fill(null);
  s.answers = Array(TEAMS).fill(null);
  if (s.phase === 'RUNNING') s.clock = stopMain(s.clock, c.now);
  s.clock = setPhase({ ...s.clock, paused: false, phaseRemainingMs: null }, c.now, null);
  s.phase = 'FINISHED'; s.step = null; s.endReason = reason; s.finishAfterRound = false;
}

function resolveRound(c: Ctx) {
  const s = c.s;
  if (!s.pending || !s.committed) return;
  const correct = s.pending.landings.map((l) => {
    if (l.questionId === null) return null;
    const choice = s.answers[l.team];
    if (choice === null) return null;                                   // 미응답 = 시간 초과 = 오답
    return c.bank.find((q) => q.id === l.questionId)?.answer === choice;
  });
  const r = resolve(s.committed, s.pending, correct);
  s.committed = r.committed; s.pending = null; s.lastEvents = r.events; s.eventSeq++;
  c.events.push({ seq: s.eventSeq, round: r.committed.round, events: r.events });
  if (s.finishAfterRound || mainRemaining(s.clock, c.now) <= 0) { finish(c, 'time'); return; }
  s.step = 'ROUND_SUMMARY';
  s.clock = setPhase(s.clock, c.now, s.config.autoNext ? SUMMARY_AUTO_MS : null);
}

function lockMoves(c: Ctx) {
  const s = c.s;
  if (!s.committed) return;
  const rng = makeRng(s.rngState);
  s.pending = land(s.committed, s.moves, (_team, level, asked) => pickQuestion(c.bank, level, asked, rng));
  s.rngState = rng.state();
  s.answers = Array(TEAMS).fill(null);
  if (s.pending.landings.some((l) => l.questionId !== null)) { s.step = 'QUESTION_OPEN'; s.clock = setPhase(s.clock, c.now, s.config.quizMs); }
  else resolveRound(c);
}

/** 지난 마감 적용. 메인 만료가 단계 마감보다 먼저 (D13). alarm 이 다시 불려도 이미 적용된 것은 무시 */
function tick(c: Ctx) {
  for (let guard = 0; guard < 8; guard++) {
    const s = c.s, k = s.clock;
    if (k.paused) return;
    const phaseDue = k.phaseEndsAt !== null && k.phaseEndsAt <= c.now;
    if (s.phase === 'TRAP_SETUP' && phaseDue) { finishSetup(c); continue; }
    if (s.phase !== 'RUNNING') return;
    const mainDue = mainRemaining(k, c.now) <= 0;
    if (s.step === 'MOVE_OPEN') {
      if (mainDue) { finish(c, 'time'); return; }      // MOVE_OPEN 중 만료 → 그 라운드 폐기
      if (phaseDue) { lockMoves(c); continue; }
      return;
    }
    if (s.step === 'QUESTION_OPEN') {
      if (mainDue && !s.finishAfterRound) s.finishAfterRound = true; // 이미 열린 문제는 마무리 후 종료
      if (phaseDue) { resolveRound(c); continue; }
      return;
    }
    if (s.step === 'ROUND_SUMMARY') {
      if (mainDue) { finish(c, 'time'); return; }
      if (phaseDue && s.config.autoNext) { openMove(c); continue; }
      return;
    }
    return;
  }
}

const movableTeams = (s: RoomState) => s.committed!.teams.map((t, i) => ({ t, i })).filter(({ t }) => !isBound(t, round(s))).map(({ i }) => i);
const quizTeams = (s: RoomState) => (s.pending?.landings ?? []).filter((l) => l.questionId !== null).map((l) => l.team);

function apply(c: Ctx, actor: Actor, cmd: Command): CmdResult {
  const s = c.s;
  if (cmd.type === 'tick') return OK;
  if (actor.kind === 'system') return fail('FORBIDDEN');

  if (actor.kind === 'teacher') {
    switch (cmd.type) {
      case 'draw': // 로비에서 한 번만 (다시 추첨을 허용하면 늦게 도착한 옛 요청이 재추첨할 수 있다)
        if (s.phase !== 'LOBBY') return fail('BAD_PHASE');
        { const rng = makeRng(s.rngState); s.zones = drawZones(rng); s.rngState = rng.state(); }
        s.phase = 'DRAWN'; return OK;
      case 'startSetup': {
        if (s.phase !== 'DRAWN' || !s.zones) return fail('BAD_PHASE');
        const rng = makeRng(s.rngState); s.setupTraps = autoPlace(rng, s.zones); s.rngState = rng.state();
        s.confirmed = Array(TEAMS).fill(false); s.phase = 'TRAP_SETUP';
        s.clock = setPhase(s.clock, c.now, s.config.setupMs); return OK;
      }
      case 'startGame':
        if (s.phase !== 'READY' || !s.zones || !s.setupTraps) return fail('BAD_PHASE');
        if (!validPlacement(s.setupTraps, s.zones)) return fail('BAD_PLACEMENT');
        s.committed = newGame(() => 0, s.zones, s.setupTraps);
        s.phase = 'RUNNING'; s.clock = startMain(s.clock, c.now); openMove(c); return OK;
      case 'next':
        if (s.phase !== 'RUNNING' || s.step !== 'ROUND_SUMMARY' || s.committed?.round !== cmd.round) return fail('STALE');
        if (s.clock.paused) return fail('PAUSED');
        openMove(c); return OK;
      case 'closePhase': { // 교사 '지금 마감': 보고 있던 단계만 끝낸다 (그사이 마감됐으면 STALE — 새 단계를 닫지 않는다)
        if (s.clock.paused) return fail('PAUSED');
        const t = cmd.target;
        if (t?.phase === 'TRAP_SETUP' && s.phase === 'TRAP_SETUP') { finishSetup(c); return OK; }
        if (t?.phase === 'RUNNING' && s.phase === 'RUNNING' && s.step === t.step && round(s) === t.round) {
          if (t.step === 'MOVE_OPEN') lockMoves(c); else resolveRound(c);
          return OK;
        }
        return fail('STALE');
      }
      case 'pause':
        if (s.phase !== 'RUNNING' && s.phase !== 'TRAP_SETUP') return fail('BAD_PHASE');
        if (s.clock.paused) return OK;
        s.clock = pause(s.clock, c.now, s.phase === 'RUNNING'); return OK;
      case 'resume':
        if (!s.clock.paused) return OK;
        s.clock = resume(s.clock, c.now, s.phase === 'RUNNING'); return OK;
      case 'finish':
        if (s.phase === 'FINISHED' || s.phase === 'REVIEW') return OK;
        finish(c, 'manual'); return OK;
      case 'review':
        if (s.phase !== 'FINISHED' && s.phase !== 'REVIEW') return fail('BAD_PHASE');
        s.phase = 'REVIEW'; return OK;
      case 'revealTraps':
        if (s.phase !== 'FINISHED' && s.phase !== 'REVIEW') return fail('BAD_PHASE');
        s.review.trapsRevealed = true; s.review.display = 'map'; return OK;
      case 'revealQuestion': {
        if (s.phase !== 'REVIEW') return fail('BAD_PHASE');
        const used = new Set([...(s.committed?.quizLog ?? []).map((q) => q.questionId), ...s.cancelled.map((q) => q.questionId)]);
        if (!used.has(cmd.questionId)) return fail('NOT_USED');
        if (!s.review.revealed.includes(cmd.questionId)) s.review.revealed.push(cmd.questionId);
        s.review.display = 'question'; s.review.focus = cmd.questionId; // 이미 공개한 문항을 다시 누르면 TV 에 다시 띄운다
        return OK;
      }
      case 'showRanking': {
        if (s.phase !== 'FINISHED' && s.phase !== 'REVIEW') return fail('BAD_PHASE');
        s.review.display = 'ranking'; s.review.focus = null; return OK;
      }
      default: return fail('FORBIDDEN');
    }
  }

  // 팀
  const team = actor.team;
  if (!Number.isInteger(team) || team < 0 || team >= TEAMS) return fail('BAD_TEAM');
  if (s.clock.paused) return fail('PAUSED');
  switch (cmd.type) {
    case 'trapMove': case 'trapSwap': {
      if (s.phase !== 'TRAP_SETUP' || !s.setupTraps || !s.zones) return fail('BAD_PHASE');
      if (s.confirmed[team]) return fail('ALREADY_CONFIRMED');
      const r = cmd.type === 'trapMove' ? moveTrap(s.setupTraps, s.zones, team, cmd.trapId, cmd.to) : swapTraps(s.setupTraps, team, cmd.a, cmd.b);
      if (typeof r === 'string') return fail(r);
      s.setupTraps = r; return OK;
    }
    case 'trapConfirm':
      if (s.phase !== 'TRAP_SETUP') return fail('BAD_PHASE');
      s.confirmed[team] = true;
      if (s.confirmed.every(Boolean)) finishSetup(c);
      return OK;
    case 'move':
      if (s.phase !== 'RUNNING' || s.step !== 'MOVE_OPEN' || !s.committed) return fail('BAD_PHASE');
      if (cmd.round !== round(s)) return fail('STALE');
      if (isBound(s.committed.teams[team], round(s))) return fail('BOUND');
      if (s.moves[team] !== null) return fail('ALREADY_MOVED');
      if (!validMove(s.committed, team, cmd.to)) return fail('BAD_MOVE');
      s.moves[team] = cmd.to;
      if (movableTeams(s).every((t) => s.moves[t] !== null)) lockMoves(c); // 전원 제출 → 바로 마감
      return OK;
    case 'answer': {
      if (s.phase !== 'RUNNING' || s.step !== 'QUESTION_OPEN' || !s.pending) return fail('BAD_PHASE');
      if (cmd.round !== s.pending.round) return fail('STALE');
      const l = s.pending.landings[team];
      if (l.questionId === null) return fail('NO_QUESTION');
      if (s.answers[team] !== null) return fail('ALREADY_ANSWERED');
      if (!Number.isInteger(cmd.choice) || cmd.choice < 1 || cmd.choice > 4) return fail('BAD_CHOICE');
      s.answers[team] = cmd.choice;                                         // 첫 답 불변 저장 후 정오만 알려 준다
      const correct = c.bank.find((q) => q.id === l.questionId)?.answer === cmd.choice;
      if (quizTeams(s).every((t) => s.answers[t] !== null)) resolveRound(c); // 전원 답 → 바로 정산
      return { ok: true, data: { correct } };
    }
    case 'recon': {
      const inRound = s.phase === 'RUNNING' && (s.step === 'ROUND_SUMMARY' || s.step === 'MOVE_OPEN');
      if (!inRound && s.phase !== 'FINISHED' && s.phase !== 'REVIEW') return fail('BAD_PHASE');
      if (!s.committed) return fail('BAD_PHASE');
      const r = applyRecon(s.committed, team, cmd.topLeft);
      if (typeof r === 'string') return fail(r);
      s.committed = r; return OK;                                           // 정보 조회 = 즉시 확정 (D5 롤백 대상 아님)
    }
    default: return fail('FORBIDDEN');
  }
}

/** 다음 alarm 시각: 유효한 마감들의 최솟값. 일시정지 중이면 없음 (DESIGN §5-4) */
export function nextAlarm(s: RoomState): number | null {
  if (s.clock.paused) return null;
  const at: number[] = [];
  if ((s.phase === 'TRAP_SETUP' || s.phase === 'RUNNING') && s.clock.phaseEndsAt !== null) at.push(s.clock.phaseEndsAt);
  if (s.phase === 'RUNNING' && !s.finishAfterRound) { const m = mainEndsAt(s.clock); if (m !== null) at.push(m); }
  return at.length ? Math.min(...at) : null;
}

const actorKey = (a: Actor) => (a.kind === 'team' ? 'team:' + a.team : a.kind);

export function handle(state: RoomState, bank: readonly BankQuestion[], actor: Actor, cmd: CommandIn, now: number): HandleOut {
  const key = actorKey(actor);
  if (cmd.requestId && actor.kind !== 'system') {
    const hit = state.processed[key]?.find((p) => p.id === cmd.requestId);
    if (hit) return { state, result: hit.result, changed: false, alarmAt: nextAlarm(state), events: [] };
  }
  const before = JSON.stringify(state);
  const c: Ctx = { s: structuredClone(state), bank, now, events: [] };
  tick(c);
  const result = apply(c, actor, cmd);
  tick(c); // 명령이 만든 즉시 마감(예: 전원 제출 후 시간이 이미 지난 경우)까지 정리
  // 성공한 명령만 기록한다(실패는 다시 보내도 같은 거절이거나 정당하게 성공할 수 있다).
  // 64개를 넘어 밀려난 오래된 요청은 라운드·단계 대상 검사(STALE)가 재실행을 막는다.
  if (cmd.requestId && actor.kind !== 'system' && result.ok) {
    const list = (c.s.processed[key] ??= []);
    list.push({ id: cmd.requestId, result });
    if (list.length > PROCESSED_KEEP) list.splice(0, list.length - PROCESSED_KEEP);
  }
  const changed = JSON.stringify(c.s) !== before;
  if (changed) c.s.stateVersion = state.stateVersion + 1;
  return { state: c.s, result, changed, alarmAt: nextAlarm(c.s), events: c.events };
}

export { elapsed };
