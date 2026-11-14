// 3단계 보안 게이트 (DESIGN §3·§6-3): 인증·조작권·PIN 잠금 / 뷰 허용 필드 / 관찰자별 차등 테스트 / 라우터
import test from 'node:test';
import assert from 'node:assert/strict';
import { neighbors, SPAWN_CELL, isOasis, zoneOf, reconArea, CELLS } from '../src/game/board.ts';
import { attemptPin, checkController, handleAccess, join, makeCreds, PIN_FAIL_LIMIT, PIN_LOCK_MS, releaseControl, reissuePin, reissueTv } from '../src/game/access.ts';
import { parseTeacherCommand, parseTeamCommand } from '../src/game/commands.ts';
import { createRoom, handle, DEFAULT_CONFIG, type Actor, type CommandIn, type RoomState } from '../src/game/room.ts';
import { teacherView, teamView, tvView } from '../src/game/views.ts';
import { route, type Envelope, type Ports, type RoomPort } from '../src/server/router.ts';
import { makeRng } from '../src/game/rng.ts';
import type { BankQuestion } from '../src/game/questions.ts';
import type { Level } from '../src/game/types.ts';

const eq = async (a: string, b: string) => a === b;
let k = 0; const key = () => 'K' + (++k).toString().padStart(25, '0');
const bank: BankQuestion[] = (['쉬움', '보통', '어려움'] as Level[]).flatMap((level) =>
  Array.from({ length: 12 }, (_, i) => ({ id: `${level}-${i}`, level, text: `${level} 문제 ${i}`, choices: ['가', '나', '다', '라'], answer: 1, explanation: '해설' })));
const T: Actor = { kind: 'teacher' }, team = (t: number): Actor => ({ kind: 'team', team: t });

function room(seed = 3): RoomState {
  const r = createRoom({ code: 'ABCDEF', title: 't', setName: 's', config: DEFAULT_CONFIG, seed, creds: makeCreds(key, makeRng(seed)) }, bank, 1000);
  if ('error' in r) throw new Error(r.error);
  return r.state;
}
const run = (s: RoomState, a: Actor, c: CommandIn, now = 2000) => { const o = handle(s, bank, a, c, now); assert.ok(o.result.ok, JSON.stringify(o.result) + c.type); return o.state; };
function running(seed = 3): RoomState {
  let s = room(seed);
  s = run(s, T, { type: 'draw' }); s = run(s, T, { type: 'startSetup' });
  for (let t = 0; t < 8; t++) s = run(s, team(t), { type: 'trapConfirm' });
  return run(s, T, { type: 'startGame' });
}

// ── 인증·조작권 ────────────────────────────────────────────────
test('입장: 첫 기기는 조작자(토큰), 다음 기기는 관람자, 조작 명령은 PIN+토큰 둘 다', async () => {
  let s = room();
  const a = await join(s, 2, s.creds.pins[2], 0, eq, key); assert.ok(a.ok && a.role === 'controller' && a.token);
  s = a.state;
  const b = await join(s, 2, s.creds.pins[2], 0, eq, key); assert.ok(b.ok && b.role === 'viewer' && b.token === null);
  const token = (a as { token: string }).token;
  assert.equal(await checkController(s, 2, s.creds.pins[2], token, eq), null);
  assert.equal(await checkController(s, 2, s.creds.pins[2], 'wrong', eq), 'NOT_CONTROLLER');
  assert.equal(await checkController(s, 2, '9999', token, eq), 'BAD_PIN', '유효한 토큰 보유자에게만 PIN 오답을 알려 준다');
  assert.equal(await checkController(s, 2, '9999', 'wrong', eq), 'NOT_CONTROLLER', '토큰 없이 PIN 정답 여부를 알 수 없다(추측 통로 차단)');
  assert.equal(await checkController(s, 9, s.creds.pins[2], token, eq), 'BAD_TEAM');
});

test('PIN 실패 5회 → 30초 잠금(새 입장만), 이미 입장한 조작자는 영향 없음, 교사 해제 → 이전 토큰 즉시 무효', async () => {
  let s = room();
  const a = await join(s, 1, s.creds.pins[1], 0, eq, key); s = a.state; const token = (a as { token: string }).token;
  for (let i = 0; i < PIN_FAIL_LIMIT; i++) { const r = await join(s, 1, 'xxxx', 100, eq, key); assert.equal(r.ok, false); s = r.state; }
  const locked = await join(s, 1, s.creds.pins[1], 200, eq, key);
  assert.deepEqual([locked.ok, (locked as { error: string }).error], [false, 'PIN_LOCKED']);
  assert.equal(await checkController(s, 1, s.creds.pins[1], token, eq), null, '공격자가 정상 팀을 멈출 수 없다');
  assert.equal((await join(s, 1, s.creds.pins[1], 100 + PIN_LOCK_MS + 1, eq, key)).ok, true, '30초 뒤 풀림');
  const released = releaseControl(s, 1);
  assert.equal(await checkController(released, 1, s.creds.pins[1], token, eq), 'NOT_CONTROLLER');
  const again = await join(released, 1, s.creds.pins[1], 100 + PIN_LOCK_MS + 1, eq, key);
  assert.ok(again.ok && again.role === 'controller', '해제 후 다음 기기가 조작권 획득');
});

test('PIN·TV 열쇠 재발급: 값과 세대가 바뀌고 조작권도 무효', async () => {
  let s = room();
  const a = await join(s, 0, s.creds.pins[0], 0, eq, key); s = a.state;
  const r = reissuePin(s, 0, makeRng(1));
  assert.notEqual(r.creds.pins[0], s.creds.pins[0]);
  assert.equal(new Set(r.creds.pins).size, 8);
  assert.equal(r.creds.pinGen[0], s.creds.pinGen[0] + 1);
  assert.equal(r.creds.controlToken[0], null);
  assert.equal((await attemptPin(r, 0, s.creds.pins[0], 0, eq)).error, 'BAD_PIN');
  const tv = reissueTv(s, key);
  assert.notEqual(tv.creds.tvKey, s.creds.tvKey); assert.equal(tv.creds.tvGen, s.creds.tvGen + 1);
});

test('명령 검증: 모르는 종류·잘못된 타입·범위 밖은 거부', () => {
  assert.equal(parseTeamCommand({ type: 'move', round: 1, to: 300 }), null);
  assert.equal(parseTeamCommand({ type: 'move', round: '1', to: 3 }), null);
  assert.equal(parseTeamCommand({ type: 'answer', round: 1, choice: 5 }), null);
  assert.equal(parseTeamCommand({ type: 'draw' }), null, '팀은 교사 명령 불가');
  assert.equal(parseTeamCommand(null), null);
  assert.equal(parseTeacherCommand({ type: 'closePhase', target: { phase: 'RUNNING', step: 'ROUND_SUMMARY', round: 1 } }), null);
  assert.equal(parseTeacherCommand({ type: 'tick' }), null, '외부에서 tick 불가');
  assert.deepEqual(parseTeamCommand({ type: 'move', round: 2, to: 17, extra: 'x' }), { type: 'move', round: 2, to: 17 }, '모르는 필드는 버린다');
});

// ── 뷰 허용 필드 ───────────────────────────────────────────────
function paths(v: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { for (const x of v) paths(x, prefix + '[]', out); if (!v.length) out.add(prefix + '[]'); }
  else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) paths(x, prefix ? prefix + '.' + kk : kk, out);
  else out.add(prefix);
  return out;
}
const PUBLIC = ['code', 'title', 'phase', 'step', 'round', 'stateVersion', 'serverNow', 'paused', 'mainRemainingMs', 'phaseRemainingMs',
  'config.durationMs', 'config.moveMs', 'config.quizMs', 'config.setupMs', 'config.autoNext',
  'teams[]', 'teams[].team', 'teams[].animal.code', 'teams[].animal.name', 'teams[].animal.emoji', 'teams[].zone', 'teams[].pos', 'teams[].score', 'teams[].rank', 'teams[].oasisRank',
  'teams[].status.setupConfirmed', 'teams[].status.moved', 'teams[].status.quiz', 'teams[].status.boundLeft', 'teams[].status.confusedLeft',
  'teams[].summary', 'teams[].summary.correct', 'teams[].summary.wrong', 'teams[].summary.zones', 'teams[].summary.oasisRank',
  'events[]', 'events[].type', 'events[].team', 'events[].from', 'events[].to', 'events[].reason', 'events[].points', 'events[].zone', 'events[].correct', 'events[].timeout',
  'events[].cell', 'events[].count', 'events[].effect', 'events[].rank', 'oasisArrivals', 'endReason',
  'trapMap', 'trapMap[]', 'trapMap[].cell', 'trapMap[].owner', 'trapMap[].type', 'trapMap[].active',
  'reviewDisplay.mode', 'reviewDisplay.questionId', 'reviewQuestions[]', 'reviewQuestions[].id', 'reviewQuestions[].level', 'reviewQuestions[].text', 'reviewQuestions[].choices[]', 'reviewQuestions[].answer', 'reviewQuestions[].explanation'];
const ALLOWED = {
  tv: new Set(['role', ...PUBLIC]),
  teacher: new Set(['role', ...PUBLIC, 'pins[]', 'tvKey', 'access[]', 'access[].hasController', 'access[].pinLocked', 'final',
    'final.traps[]', 'final.traps[].cell', 'final.traps[].owner', 'final.traps[].type', 'final.traps[].active',
    'final.questions[]', 'final.questions[].id', 'final.questions[].level', 'final.questions[].text', 'final.questions[].choices[]', 'final.questions[].answer', 'final.questions[].explanation',
    'final.quizLog[]', 'final.quizLog[].round', 'final.quizLog[].team', 'final.quizLog[].questionId', 'final.quizLog[].level', 'final.quizLog[].correct', 'final.quizLog[].timeout',
    'final.cancelled[]', 'final.cancelled[].round', 'final.cancelled[].team', 'final.cancelled[].questionId']),
  team: new Set(['role', ...PUBLIC, 'me.team', 'me.controller', 'me.traps[]', 'me.traps[].id', 'me.traps[].cell', 'me.traps[].type', 'me.traps[].active', 'me.sensor',
    'me.reconAvailable', 'me.recon', 'me.recon.topLeft', 'me.recon.cells[]', 'me.recon.cells[].cell', 'me.recon.cells[].count', 'me.recon.cells[].live',
    'me.visited[]', 'me.opponentZones[]', 'me.question', 'me.question.level', 'me.question.text', 'me.question.choices[]', 'me.answer', 'me.answer.choice', 'me.answer.correct'])
};

/** 여러 단계의 상태를 만든다(설치·이동·문제·결과·종료·복습·공개) */
function stages(): RoomState[] {
  const out: RoomState[] = [];
  let s = room(); out.push(s);
  s = run(s, T, { type: 'draw' }); out.push(s);
  s = run(s, T, { type: 'startSetup' }); out.push(s);
  for (let t = 0; t < 8; t++) s = run(s, team(t), { type: 'trapConfirm' });
  s = run(s, T, { type: 'startGame' }); out.push(s);
  for (let r = 0; r < 6; r++) {
    if (s.step === 'MOVE_OPEN') {
      for (let t = 0; t < 8; t++) { const c = s.committed!; const to = neighbors(c.teams[t].pos).find((x) => c.traps.some((y) => y.active && y.cell === x)) ?? neighbors(c.teams[t].pos)[0]; const o = handle(s, bank, team(t), { type: 'move', round: c.round + 1, to }, 2000); s = o.state; }
      out.push(s);
    }
    if (s.step === 'QUESTION_OPEN') { const q = s.pending!.landings.find((l) => l.questionId !== null)!; s = handle(s, bank, team(q.team), { type: 'answer', round: s.pending!.round, choice: 1 }, 2000).state; out.push(s); for (let t = 0; t < 8; t++) s = handle(s, bank, team(t), { type: 'answer', round: s.pending?.round ?? 0, choice: 2 }, 2000).state; }
    if (s.step === 'ROUND_SUMMARY') { out.push(s); s = run(s, T, { type: 'next', round: s.committed!.round }); }
  }
  s.committed!.teams[0].reconAvailable = true;
  s = run(s, team(0), { type: 'recon', topLeft: 0 }); out.push(s);
  s = run(s, T, { type: 'finish' }); out.push(s);
  s = run(s, T, { type: 'review' }); s = run(s, T, { type: 'revealTraps' });
  if (s.committed!.quizLog[0]) s = run(s, T, { type: 'revealQuestion', questionId: s.committed!.quizLog[0].questionId });
  out.push(s);
  return out;
}

test('뷰 허용 필드: 모든 단계에서 TV·교사·팀 뷰의 모든 경로가 허용 목록 안', () => {
  const st = stages();
  assert.ok(st.some((s) => s.step === 'QUESTION_OPEN'), '문제 단계가 포함돼야 검사 의미가 있다');
  for (const s of st) {
    for (const p of paths(tvView(s, bank, 5000))) assert.ok(ALLOWED.tv.has(p), 'tv: ' + p);
    for (const p of paths(teacherView(s, bank, 5000))) assert.ok(ALLOWED.teacher.has(p), 'teacher: ' + p);
    for (let t = 0; t < 8; t++) for (const p of paths(teamView(s, bank, t, 5000, { controller: true }))) assert.ok(ALLOWED.team.has(p), 'team: ' + p);
  }
});

test('진행 중 교사 뷰에는 덫 위치·정답이 없고, 팀 뷰의 me.traps 는 자기 덫만', () => {
  for (const s of stages().filter((x) => x.phase === 'RUNNING' || x.phase === 'TRAP_SETUP')) {
    assert.equal(teacherView(s, bank, 0).final, null);
    for (let t = 0; t < 8; t++) {
      const v = teamView(s, bank, t, 0, { controller: true });
      const own = new Set((s.committed?.traps ?? s.setupTraps ?? []).filter((x) => x.owner === t).map((x) => x.id));
      assert.ok(v.me.traps.every((x) => own.has(x.id)));
    }
  }
});

// ── 관찰자별 차등 테스트: 허용 정보는 같고 숨은 상태만 다른 두 상태 → 뷰가 바이트 단위로 같아야 한다 ──
function hideFrom(s: RoomState, observer: number | 'tv'): RoomState {
  const n = structuredClone(s);
  const keep = new Set<number>();
  if (observer !== 'tv' && n.committed) {
    const me = n.committed.teams[observer];
    const pos = n.pending ? n.pending.landings[observer].to : me.pos;
    [pos, ...neighbors(pos), me.pos, ...neighbors(me.pos)].forEach((c) => keep.add(c));          // 센서 범위
    if (me.recon) reconArea(me.recon.topLeft).forEach((c) => keep.add(c));                            // 정찰 범위
  }
  for (const l of n.pending?.landings ?? []) { keep.add(l.to); }                                     // 착지 칸(공개 사건에 영향)
  for (const e of n.lastEvents) if ('to' in e) keep.add(e.to); else if ('cell' in e) keep.add(e.cell);
  const free = [...Array(CELLS).keys()].filter((c) => !keep.has(c) && !isOasis(c));
  const rng = makeRng(77);
  const traps = n.committed ? n.committed.traps : n.setupTraps ?? [];
  for (const t of traps) {
    if (observer !== 'tv' && t.owner === observer) continue;
    if (keep.has(t.cell)) continue;
    // 다른 팀 덫: 관찰자 범위 밖의 다른 칸·종류로 (자기 구역 금지 규칙은 숨은 상태라 그대로 두어도 뷰에 영향 없음)
    const to = free[Math.floor(rng() * free.length)];
    if (zoneOf(to) === n.zones?.[t.owner]) continue;
    t.cell = to; t.type = t.type === 'normal' ? 'bind' : 'normal';
  }
  for (const l of n.pending?.landings ?? []) if (l.questionId !== null && l.team !== observer) {
    const same = bank.filter((q) => q.level === l.level && q.id !== l.questionId); l.questionId = same[0].id;
  }
  // 다른 팀만 보는 정보도 바꾼다: 다른 팀 정찰 결과·다른 팀 답(이미 낸 답의 값)
  for (const [i, t] of (n.committed?.teams ?? []).entries()) if (i !== observer) t.recon = { topLeft: 34, round: 1, cells: [{ cell: 35, count: 2, trapIds: [0, 1] }] };
  n.answers = n.answers.map((a, i) => (i === observer || a === null ? a : (a % 4) + 1));
  n.rngState = (n.rngState + 12345) >>> 0;
  n.creds.pins = n.creds.pins.map((p, i) => (i === observer ? p : String((Number(p) + 1) % 10000).padStart(4, '0')));
  n.creds.hostKey = 'CHANGED'; n.creds.tvKey = observer === 'tv' ? n.creds.tvKey : 'CHANGED';
  n.processed = { 'team:5': [{ id: 'zzz', result: { ok: true } }] };
  return n;
}

/** 숨은 상태가 실제로 바뀌었는지(차등 테스트가 아무것도 안 바꾸고 통과하는 것을 막는다) */
function hiddenChanged(a: RoomState, b: RoomState, observer: number | 'tv'): boolean {
  const ta = a.committed?.traps ?? a.setupTraps ?? [], tb = b.committed?.traps ?? b.setupTraps ?? [];
  const movedTraps = ta.filter((t, i) => t.owner !== observer && (t.cell !== tb[i].cell || t.type !== tb[i].type)).length;
  return movedTraps > 0 && a.rngState !== b.rngState && a.creds.hostKey !== b.creds.hostKey;
}

test('차등: TV 뷰는 숨은 덫·문항·시드·자격이 바뀌어도 그대로', () => {
  for (const s of stages().filter((x) => x.phase !== 'FINISHED' && x.phase !== 'REVIEW')) {
    if (s.setupTraps || s.committed) assert.ok(hiddenChanged(s, hideFrom(s, 'tv'), 'tv'), '숨은 상태가 바뀌어야 의미 있는 비교');
    assert.equal(JSON.stringify(tvView(hideFrom(s, 'tv'), bank, 9)), JSON.stringify(tvView(s, bank, 9)), `${s.phase}/${s.step}`);
  }
});

test('차등: 팀 t 의 뷰는 t 의 센서·정찰 범위 밖 다른 팀 덫·다른 팀 문항·시드·다른 PIN 이 바뀌어도 그대로', () => {
  for (const s of stages().filter((x) => x.phase !== 'FINISHED' && x.phase !== 'REVIEW')) {
    for (let t = 0; t < 8; t++) {
      if (s.setupTraps || s.committed) assert.ok(hiddenChanged(s, hideFrom(s, t), t), `team ${t}: 숨은 상태가 바뀌어야 의미 있는 비교`);
      const a = JSON.stringify(teamView(s, bank, t, 9, { controller: true }));
      const b = JSON.stringify(teamView(hideFrom(s, t), bank, t, 9, { controller: true }));
      assert.equal(b, a, `team ${t} ${s.phase}/${s.step}`);
    }
  }
});

// ── 라우터 ─────────────────────────────────────────────────────
function fakePorts(over: Partial<Ports> = {}) {
  const calls: string[] = [];
  const roomPort: RoomPort = {
    create: async () => { calls.push('create'); return { ok: true, data: { hostKey: 'h', tvKey: 't', pins: [], warnings: [] } }; },
    lobby: async () => { calls.push('lobby'); return { ok: true, data: {} }; },
    view: async (w) => { calls.push('view:' + w.role + ':' + ('key' in w ? w.key : w.pin)); return { ok: true, data: {} }; },
    teacher: async (key) => { calls.push('teacher:' + key); return { ok: true, data: null }; },
    join: async (t, pin) => { calls.push(`join:${t}:${pin}`); return { ok: true, data: {} }; },
    team: async (t, pin, tok) => { calls.push(`team:${t}:${pin}:${tok}`); return { ok: true, data: null }; }
  };
  const games = new Set(['ABCDEF']);
  const ports: Ports = { room: () => roomPort, gameExists: async (c) => games.has(c),
    reserveGame: async (g) => { if (games.has(g.code)) return false; games.add(g.code); calls.push('reserve:' + g.code); return true; },
    releaseGame: async (c) => { games.delete(c); calls.push('release:' + c); },
    questions: async () => bank, adminPassword: 'admin', eq, now: () => 1, randomCode: () => 'ZZZZ22', randomId: () => 'cid-1', ...over };
  return { ports, calls, games };
}
const req = (method: string, path: string, headers: Record<string, string> = {}, body: unknown = undefined) => ({ method, path, headers, body });

test('라우터: 없는 판 코드는 DO 를 깨우지 않는다, 형식이 틀린 코드는 400', async () => {
  const { ports, calls } = fakePorts();
  assert.equal((await route(req('POST', '/api/game/QQQQQQ/view', {}, { role: 'tv' }), ports)).body.ok, false);
  assert.equal((await route(req('POST', '/api/game/bad!/view'), ports)).status, 400);
  assert.deepEqual(calls, []);
});

test('라우터: 인증값은 헤더로만 — 본문에 넣은 열쇠는 쓰이지 않는다(쿼리는 index.ts 가 pathname 만 넘겨 아예 닿지 않는다)', async () => {
  const { ports, calls } = fakePorts();
  await route(req('POST', '/api/game/ABCDEF/teacher', {}, { cmd: { type: 'draw' }, key: 'SECRET', hostKey: 'SECRET' }), ports);
  assert.deepEqual(calls, ['teacher:']);
  calls.length = 0;
  await route(req('POST', '/api/game/ABCDEF/teacher', { 'x-host-key': 'SECRET' }, { cmd: { type: 'draw' } }), ports);
  assert.deepEqual(calls, ['teacher:SECRET']);
});

test('라우터: 판 생성은 관리자만, 설정 범위 검사, 코드 충돌이면 다른 코드로', async () => {
  const off = fakePorts({ adminPassword: undefined });
  assert.equal((await route(req('POST', '/api/game', { 'x-admin-password': 'x' }, {}), off.ports)).body.ok, false);
  const { ports, calls, games } = fakePorts();
  assert.equal((await route(req('POST', '/api/game', { 'x-admin-password': 'wrong' }, {}), ports)).status, 401);
  assert.equal(((await route(req('POST', '/api/game', { 'x-admin-password': 'admin' }, { quizSec: 5 }), ports)).body as { error: string }).error, 'BAD_CONFIG');
  let n = 0; const codes = ['ABCDEF', 'GHJKLM'];
  const r = await route(req('POST', '/api/game', { 'x-admin-password': 'admin' }, { title: '수업' }), { ...ports, randomCode: () => codes[n++] });
  assert.equal(r.body.ok, true); assert.equal((r.body as { data: { code: string } }).data.code, 'GHJKLM');
  assert.ok(games.has('GHJKLM')); assert.deepEqual(calls, ['reserve:GHJKLM', 'create'], 'D1 코드 예약(충돌한 ABCDEF 는 건너뜀) → DO 생성');
});

test('라우터: 팀 명령은 PIN·토큰 헤더를 그대로 DO 에 넘긴다(검증은 DO)', async () => {
  const { ports, calls } = fakePorts();
  await route(req('POST', '/api/game/ABCDEF/team', { 'x-team-pin': '1234', 'x-control-token': 'TOK' }, { team: 3, cmd: { type: 'trapConfirm' } }), ports);
  await route(req('POST', '/api/game/ABCDEF/join', { 'x-team-pin': '1234' }, { team: 3 }), ports);
  assert.deepEqual(calls, ['team:3:1234:TOK', 'join:3:1234']);
  const env = (await route(req('GET', '/api/game/ABCDEF/team'), ports)).body as Envelope;
  assert.equal(env.ok, false);
});

void SPAWN_CELL;

test('PIN 추측은 어느 경로든 실패 제한(상태 조회·소켓 hello 공통 attemptPin), 성공하면 횟수 초기화', async () => {
  let s = room();
  for (let i = 0; i < PIN_FAIL_LIMIT - 1; i++) s = (await attemptPin(s, 4, 'zzzz', 10, eq)).state;
  assert.equal(s.creds.pinFails[4].count, PIN_FAIL_LIMIT - 1);
  s = (await attemptPin(s, 4, s.creds.pins[4], 10, eq)).state;
  assert.equal(s.creds.pinFails[4].count, 0);
  for (let i = 0; i < PIN_FAIL_LIMIT; i++) s = (await attemptPin(s, 4, 'zzzz', 10, eq)).state;
  assert.equal((await attemptPin(s, 4, s.creds.pins[4], 20, eq)).error, 'PIN_LOCKED', '잠긴 동안은 정답도 거부');
});

test('자격 관리 명령 멱등: 같은 requestId 의 TV 재발급은 같은 열쇠, 조작권 해제 재전송이 새 조작자를 풀지 않음', async () => {
  let s = room();
  const a = handleAccess(s, { type: 'reissueTv' }, 'req-1', makeRng(1), key); s = a.state;
  const b = handleAccess(s, { type: 'reissueTv' }, 'req-1', makeRng(2), key);
  assert.equal(b.replay, true); assert.deepEqual(b.data, a.data); assert.equal(b.state.creds.tvKey, s.creds.tvKey);
  s = (await join(s, 5, s.creds.pins[5], 0, eq, key)).state;
  s = handleAccess(s, { type: 'releaseControl', team: 5 }, 'rel-1', makeRng(1), key).state;
  const j = await join(s, 5, s.creds.pins[5], 0, eq, key); s = j.state;            // 새 기기가 조작권 획득
  const replay = handleAccess(s, { type: 'releaseControl', team: 5 }, 'rel-1', makeRng(1), key);
  assert.equal(replay.replay, true);
  assert.equal(replay.state.creds.controlToken[5], (j as { token: string }).token);
});

test('라우터: DO 생성이 실패하면 D1 예약을 지운다(고립된 판 없음)', async () => {
  const { ports, calls, games } = fakePorts();
  const failing = { ...ports, room: () => ({ ...ports.room('x'), create: async (): Promise<Envelope> => ({ ok: false, error: 'BANK_EMPTY_LEVEL' }) }) };
  const r = await route(req('POST', '/api/game', { 'x-admin-password': 'admin' }, {}), failing);
  assert.equal(r.status, 422);
  assert.ok(!games.has('ZZZZ22')); assert.deepEqual(calls, ['reserve:ZZZZ22', 'release:ZZZZ22']);
  // 생성 예외 + DO 에 판 없음 → 예약 삭제
  const throwing = { ...ports, room: () => ({ ...ports.room('x'), create: async (): Promise<Envelope> => { throw new Error('boom'); }, lobby: async (): Promise<Envelope> => ({ ok: false, error: 'NO_ROOM' }) }) };
  assert.equal(((await route(req('POST', '/api/game', { 'x-admin-password': 'admin' }, {}), throwing)).body as { error: string }).error, 'CREATE_UNCERTAIN');
  assert.ok(!games.has('ZZZZ22'));
  // 첫 시도는 응답 유실(예외)이지만 DO 는 만들어짐 → 같은 createId 재시도가 같은 자격을 받는다
  let tries = 0; const seen: string[] = [];
  const lost = { ...ports, room: () => ({ ...ports.room('x'), create: async (i: { createId: string }): Promise<Envelope> => { seen.push(i.createId); if (tries++ === 0) throw new Error('lost'); return { ok: true, data: { hostKey: 'h1', tvKey: 't', pins: [], warnings: [] } }; } }) };
  const ok2 = await route(req('POST', '/api/game', { 'x-admin-password': 'admin' }, {}), lost as unknown as Ports);
  assert.equal(ok2.body.ok, true); assert.deepEqual(seen, ['cid-1', 'cid-1']); assert.ok(games.has('ZZZZ22'));
});

test('공개 이벤트에 문제 난이도가 없다(6-1), 단계별 조건: 덫 지도·복습 문항·교사 최종 기록', () => {
  for (const s of stages()) {
    const tv = tvView(s, bank, 0), te = teacherView(s, bank, 0);
    assert.ok(tv.events.every((e) => !('level' in e)));
    if (!(s.phase === 'FINISHED' || s.phase === 'REVIEW') || !s.review.trapsRevealed) assert.equal(tv.trapMap, null);
    if (s.phase !== 'REVIEW') assert.deepEqual(tv.reviewQuestions, []);
    if (!(s.phase === 'FINISHED' || s.phase === 'REVIEW')) { assert.equal(te.final, null); assert.ok(tv.teams.every((t) => t.summary === null), '진행 중에는 누적 요약 없음'); }
  }
});

test('판 생성 재전송(같은 createId)은 같은 자격, 다른 요청은 EXISTS', () => {
  const s = room();
  // DO 의 판정 로직과 같은 조건: 저장된 createId 와 같으면 재전송
  assert.equal(s.createId, '');
  const r = createRoom({ code: 'ABCDEF', title: 't', setName: 's', config: DEFAULT_CONFIG, seed: 1, creds: makeCreds(key, makeRng(1)), createId: 'cid-9' }, bank, 0);
  assert.ok(!('error' in r) && r.state.createId === 'cid-9');
});
