// 판 상태 머신 (DESIGN §5) — 가짜 시계로 단계 전이·시간 경계·일시정지·롤백·멱등·복원을 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPAWN_CELL, isOasis, neighbors, zoneOf } from '../src/game/board.ts';
import { createRoom, handle, nextAlarm, DEFAULT_CONFIG, type Actor, type CommandIn, type RoomConfig, type RoomState } from '../src/game/room.ts';
import { mainRemaining, phaseRemaining } from '../src/game/clock.ts';
import type { BankQuestion } from '../src/game/questions.ts';
import type { Level } from '../src/game/types.ts';

const bank: BankQuestion[] = (['쉬움', '보통', '어려움'] as Level[]).flatMap((level) =>
  Array.from({ length: 12 }, (_, i) => ({ id: `${level}-${i}`, level, text: `${level} 문제 ${i}`, choices: ['가', '나', '다', '라'], answer: 1, explanation: '해설' })));
const creds = { hostKey: 'H', tvKey: 'T', tvGen: 1, pins: Array(8).fill('0000'), pinGen: Array(8).fill(1), controlToken: Array(8).fill(null), controlGen: Array(8).fill(1) };
const T: Actor = { kind: 'teacher' };
const team = (t: number): Actor => ({ kind: 'team', team: t });
const SYS: Actor = { kind: 'system' };

class Sim {
  s: RoomState; now = 1_000_000;
  constructor(config: Partial<RoomConfig> = {}, seed = 7) {
    const r = createRoom({ code: 'ABCD', title: '테스트', setName: '세트', config: { ...DEFAULT_CONFIG, ...config }, seed, creds }, bank, this.now);
    if ('error' in r) throw new Error(r.error);
    this.s = r.state;
  }
  do(actor: Actor, cmd: CommandIn) { const o = handle(this.s, bank, actor, cmd, this.now); this.s = o.state; return o; }
  ok(actor: Actor, cmd: CommandIn) { const o = this.do(actor, cmd); assert.ok(o.result.ok, `${cmd.type}: ${JSON.stringify(o.result)}`); return o; }
  at(ms: number) { this.now += ms; return this.do(SYS, { type: 'tick' }); }
  /** 로비 → 진행(1라운드 이동 단계)까지 */
  start() { this.ok(T, { type: 'draw' }); this.ok(T, { type: 'startSetup' }); for (let t = 0; t < 8; t++) this.ok(team(t), { type: 'trapConfirm' }); this.ok(T, { type: 'startGame' }); return this; }
  pos(t: number) { return this.s.committed!.teams[t].pos; }
  /** 지금 열린 이동 라운드 / 문제 라운드 / 결과 라운드 */
  r() { return this.s.committed!.round + 1; }
  qr() { return this.s.pending!.round; }
  next() { return this.ok(T, { type: 'next', round: this.s.committed!.round }); }
  /** 덫 없는 이웃 칸 하나 (오아시스 제외) */
  safeNeighbor(t: number) { const traps = this.s.committed!.traps; return neighbors(this.pos(t)).find((c) => !isOasis(c) && !traps.some((x) => x.active && x.cell === c))!; }
  trapNeighbor(t: number) { const traps = this.s.committed!.traps; return neighbors(this.pos(t)).find((c) => traps.some((x) => x.active && x.cell === c)); }
  moveAll(pick: (t: number) => number | null) { for (let t = 0; t < 8; t++) { const to = pick(t); if (to !== null) this.do(team(t), { type: 'move', round: this.r(), to }); } }
}

/** 팀 0 이 1라운드에 덫을 밟도록 팀 1 의 덫 하나를 팀 0 출발 칸 옆으로 옮긴 판 */
function simWithTrapForTeam0(config: Partial<RoomConfig> = {}) {
  const sim = new Sim(config);
  sim.ok(T, { type: 'draw' }); sim.ok(T, { type: 'startSetup' });
  const zone0 = sim.s.zones![0], spawn0 = SPAWN_CELL[zone0];
  const target = neighbors(spawn0).find((c) => !isOasis(c) && zoneOf(c) !== sim.s.zones![1] && !sim.s.setupTraps!.some((x) => x.owner === 1 && x.cell === c))!;
  const t1 = sim.s.setupTraps!.find((x) => x.owner === 1)!;
  sim.ok(team(1), { type: 'trapMove', trapId: t1.id, to: target });
  for (let t = 0; t < 8; t++) sim.ok(team(t), { type: 'trapConfirm' });
  sim.ok(T, { type: 'startGame' });
  return { sim, target };
}

test('판 생성 검증: 난이도별 1문항 이상·300문항 이하·형식, 설정 범위, 12문항 미만 경고', () => {
  const mk = (b: BankQuestion[], c: RoomConfig = DEFAULT_CONFIG) => createRoom({ code: 'X', title: 't', setName: 's', config: c, seed: 1, creds }, b, 0);
  assert.deepEqual(mk(bank.filter((q) => q.level !== '어려움')), { error: 'BANK_EMPTY_LEVEL' });
  assert.deepEqual(mk(Array.from({ length: 301 }, (_, i) => ({ ...bank[0], id: 'q' + i }))), { error: 'BANK_TOO_LARGE' });
  assert.deepEqual(mk([...bank, { ...bank[0] }]), { error: 'BANK_INVALID' });
  assert.deepEqual(mk(bank.map((q, i) => (i === 0 ? { ...q, answer: 5 } : q))), { error: 'BANK_INVALID' });
  assert.deepEqual(mk(bank, { ...DEFAULT_CONFIG, quizMs: 5000 }), { error: 'BAD_CONFIG' });
  const few = mk(bank.filter((q) => q.level !== '보통' || q.id === '보통-0')) as { warnings: string[] };
  assert.equal(few.warnings.length, 1);
});

test('정상 흐름: 추첨 → 자동 배치·확정 → 시작 → 전원 이동 시 즉시 착지 → 결과 → 다음 라운드', () => {
  const sim = new Sim();
  assert.equal(sim.s.phase, 'LOBBY');
  sim.ok(T, { type: 'draw' }); assert.equal(sim.s.phase, 'DRAWN');
  sim.ok(T, { type: 'startSetup' }); assert.equal(sim.s.setupTraps!.length, 104);
  assert.equal(sim.do(T, { type: 'startGame' }).result.ok, false, '설치 끝나기 전 시작 불가');
  for (let t = 0; t < 8; t++) sim.ok(team(t), { type: 'trapConfirm' });
  assert.equal(sim.s.phase, 'READY');
  sim.ok(T, { type: 'startGame' });
  assert.deepEqual([sim.s.phase, sim.s.step], ['RUNNING', 'MOVE_OPEN']);
  sim.moveAll((t) => sim.safeNeighbor(t));
  assert.equal(sim.s.step, 'ROUND_SUMMARY', '덫 없는 칸만 → 문제 없이 바로 정산');
  assert.equal(sim.s.committed!.round, 1);
  sim.ok(T, { type: 'next', round: sim.s.committed!.round });
  assert.equal(sim.s.step, 'MOVE_OPEN');
});

test('설치 마감: 시간이 지나면 미확정 팀도 자동 확정 → READY, 확정 팀은 수정 불가', () => {
  const sim = new Sim();
  sim.ok(T, { type: 'draw' }); sim.ok(T, { type: 'startSetup' });
  sim.ok(team(0), { type: 'trapConfirm' });
  const mine = sim.s.setupTraps!.find((x) => x.owner === 0)!;
  assert.equal(sim.do(team(0), { type: 'trapMove', trapId: mine.id, to: 0 }).result.ok, false);
  assert.equal(nextAlarm(sim.s), sim.now + DEFAULT_CONFIG.setupMs);
  sim.at(DEFAULT_CONFIG.setupMs - 1); assert.equal(sim.s.phase, 'TRAP_SETUP');
  sim.at(1); assert.equal(sim.s.phase, 'READY');
});

test('이동 마감(D1): 미제출 팀은 제자리·판정 없음', () => {
  const sim = new Sim().start();
  const before = sim.pos(3);
  for (let t = 0; t < 8; t++) if (t !== 3) sim.do(team(t), { type: 'move', round: sim.r(), to: sim.safeNeighbor(t) });
  assert.equal(sim.s.step, 'MOVE_OPEN');
  sim.at(DEFAULT_CONFIG.moveMs);
  assert.equal(sim.s.step, 'ROUND_SUMMARY');
  assert.equal(sim.pos(3), before);
  assert.ok(sim.s.lastEvents.some((e) => e.type === 'stay' && e.team === 3));
});

test('문제: 첫 답 불변·정오만 응답, 미응답 팀은 마감 때 오답, 전원 답하면 즉시 정산', () => {
  const { sim, target } = simWithTrapForTeam0();
  sim.moveAll((t) => (t === 0 ? target : sim.safeNeighbor(t)));
  assert.equal(sim.s.step, 'QUESTION_OPEN');
  const r = sim.do(team(0), { type: 'answer', round: sim.qr(), choice: 2 });
  assert.deepEqual(r.result, { ok: true, data: { correct: false } });
  // 전원(=팀0)이 답했으므로 바로 정산됨
  assert.equal(sim.s.step, 'ROUND_SUMMARY');
  assert.equal(sim.do(team(0), { type: 'answer', round: 1, choice: 1 }).result.ok, false, '다시 답할 수 없음');
  assert.equal(sim.s.committed!.quizLog[0].correct, false);
  // 미응답
  const b = simWithTrapForTeam0();
  b.sim.moveAll((t) => (t === 0 ? b.target : b.sim.safeNeighbor(t)));
  b.sim.at(DEFAULT_CONFIG.quizMs);
  assert.equal(b.sim.s.step, 'ROUND_SUMMARY');
  assert.equal(b.sim.s.committed!.quizLog[0].timeout, true);
});

test('D13: 이동 단계 중 메인 타이머 만료 → 그 라운드 폐기 후 종료', () => {
  const sim = new Sim({ durationMs: 60_000, moveMs: 60_000 }).start();
  const before = JSON.stringify(sim.s.committed);
  sim.do(team(0), { type: 'move', round: sim.r(), to: sim.safeNeighbor(0) });
  assert.equal(nextAlarm(sim.s), sim.now + 60_000, '메인 만료와 이동 마감이 같은 시각');
  sim.at(60_000);
  assert.deepEqual([sim.s.phase, sim.s.endReason], ['FINISHED', 'time']);
  assert.equal(JSON.stringify(sim.s.committed), before, '같은 시각이면 메인 만료가 먼저 → 이동 반영 없음');
});

test('D13: 문제 단계 중 메인 만료 → 열린 문제는 마무리 후 정산하고 종료', () => {
  const { sim, target } = simWithTrapForTeam0({ durationMs: 60_000, quizMs: 120_000 });
  sim.at(10_000);
  sim.moveAll((t) => (t === 0 ? target : sim.safeNeighbor(t)));
  assert.equal(sim.s.step, 'QUESTION_OPEN');
  sim.at(50_000);                    // 메인 만료(누적 60초)
  assert.equal(sim.s.phase, 'RUNNING');
  assert.equal(sim.s.finishAfterRound, true);
  assert.equal(nextAlarm(sim.s), sim.s.clock.phaseEndsAt, '만료 후에는 문제 마감만 예약(즉시 재발화 없음)');
  assert.equal(sim.do(team(0), { type: 'answer', round: sim.qr(), choice: 1 }).result.ok, true, '만료 후에도 이미 받은 문제는 답할 수 있음');
  assert.deepEqual([sim.s.phase, sim.s.endReason], ['FINISHED', 'time']);
  assert.equal(sim.s.committed!.round, 1, '그 라운드는 정산됨');
});

test('D5: 문제 단계 중 수동 종료 → 진행 중 라운드 통째로 폐기, 확정 상태 그대로, 취소 문항 기록', () => {
  const { sim, target } = simWithTrapForTeam0();
  const before = JSON.stringify(sim.s.committed);
  sim.moveAll((t) => (t === 0 ? target : sim.safeNeighbor(t)));
  assert.equal(sim.s.step, 'QUESTION_OPEN');
  sim.ok(T, { type: 'finish' });
  assert.deepEqual([sim.s.phase, sim.s.endReason], ['FINISHED', 'manual']);
  assert.equal(JSON.stringify(sim.s.committed), before);
  assert.equal(sim.s.pending, null);
  assert.equal(sim.s.cancelled.length, 1);
  assert.equal(nextAlarm(sim.s), null);
});

test('D11 일시정지: 메인·단계 시간 정지, 학생 명령 거부, alarm 없음, 재개 시 남은 시간 그대로', () => {
  const sim = new Sim().start();
  sim.at(5_000);
  const mainBefore = mainRemaining(sim.s.clock, sim.now), phaseBefore = phaseRemaining(sim.s.clock, sim.now);
  sim.ok(T, { type: 'pause' });
  assert.equal(nextAlarm(sim.s), null);
  sim.at(10 * 60_000);                                     // 10분 멈춰 있음
  assert.equal(sim.s.step, 'MOVE_OPEN');
  assert.equal(mainRemaining(sim.s.clock, sim.now), mainBefore);
  assert.equal(phaseRemaining(sim.s.clock, sim.now), phaseBefore);
  assert.equal(sim.do(team(0), { type: 'move', round: sim.r(), to: sim.safeNeighbor(0) }).result.ok, false);
  assert.equal(sim.do(T, { type: 'next', round: sim.s.committed!.round }).result.ok, false);
  // 일시정지 중 서버 재시작(JSON 왕복) 후 재개
  sim.s = JSON.parse(JSON.stringify(sim.s));
  sim.ok(T, { type: 'resume' });
  assert.equal(phaseRemaining(sim.s.clock, sim.now), phaseBefore);
  assert.equal(nextAlarm(sim.s), sim.now + (phaseBefore as number));
});

test('멱등: 같은 requestId 재전송은 같은 결과(단계가 바뀐 뒤에도), 다른 requestId 두 번째 이동은 거부', () => {
  const sim = new Sim().start();
  const to = sim.safeNeighbor(0);
  const first = sim.do(team(0), { type: 'move', round: sim.r(), to, requestId: 'r1' });
  assert.equal(first.result.ok, true);
  for (let t = 1; t < 8; t++) sim.do(team(t), { type: 'move', round: sim.r(), to: sim.safeNeighbor(t) });
  assert.equal(sim.s.step, 'ROUND_SUMMARY');
  const again = sim.do(team(0), { type: 'move', round: sim.r(), to, requestId: 'r1' });
  assert.deepEqual(again.result, first.result);
  assert.equal(again.changed, false);
  sim.ok(T, { type: 'next', round: sim.s.committed!.round });
  sim.do(team(0), { type: 'move', round: sim.r(), to: sim.safeNeighbor(0), requestId: 'r2' });
  assert.equal(sim.do(team(0), { type: 'move', round: sim.r(), to: sim.safeNeighbor(0), requestId: 'r3' }).result.ok, false);
});

test('alarm 재실행·지연 발화: 같은 시각 tick 두 번째는 변화 없음, 늦게 와도 밀린 마감을 순서대로 적용', () => {
  const sim = new Sim({ autoNext: true }).start();
  const a = sim.at(DEFAULT_CONFIG.moveMs);
  assert.equal(a.changed, true);
  const b = sim.do(SYS, { type: 'tick' });
  assert.equal(b.changed, false);
  // 자동 진행: 결과 5초 뒤 다음 이동 단계. alarm 이 20초 늦게 와도 밀린 전이를 적용하되,
  // 새로 열린 단계의 시간은 **실제로 열린 시각부터** 센다(학생이 화면을 본 순간부터 20초)
  sim.at(25_000);
  assert.equal(sim.s.step, 'MOVE_OPEN');
  assert.equal(sim.s.committed!.round, 1);
  assert.equal(sim.s.clock.phaseEndsAt, sim.now + DEFAULT_CONFIG.moveMs);
});

test('전원 속박이면 이동 단계를 기다리지 않는다', () => {
  const sim = new Sim().start();
  const r = sim.s.committed!.round + 1;
  sim.s.committed!.teams.forEach((t) => (t.bindRounds = [r]));
  sim.moveAll(() => null);
  sim.ok(T, { type: 'closePhase', target: { phase: 'RUNNING', step: 'MOVE_OPEN', round: r } });
  assert.equal(sim.s.step, 'ROUND_SUMMARY');
  sim.s.committed!.teams.forEach((t) => (t.bindRounds = [r + 1]));
  sim.ok(T, { type: 'next', round: sim.s.committed!.round });
  assert.equal(sim.s.step, 'ROUND_SUMMARY', '다음 라운드가 열리자마자 자동 정산');
});

test('정찰은 종료 후에도 1회, 복습은 실제로 낸 문항만 공개', () => {
  const { sim, target } = simWithTrapForTeam0();
  sim.moveAll((t) => (t === 0 ? target : sim.safeNeighbor(t)));
  sim.do(team(0), { type: 'answer', round: sim.qr(), choice: 1 });
  sim.s.committed!.teams[0].reconAvailable = true;      // 마지막 라운드에 오아시스 도착한 상황
  sim.ok(T, { type: 'finish' });
  sim.ok(team(0), { type: 'recon', topLeft: 0 });
  assert.equal(sim.do(team(0), { type: 'recon', topLeft: 0 }).result.ok, false);
  assert.equal(sim.do(T, { type: 'revealQuestion', questionId: '쉬움-0' }).result.ok, false, '복습 단계 전');
  sim.ok(T, { type: 'review' });
  const used = sim.s.committed!.quizLog[0].questionId;
  sim.ok(T, { type: 'revealQuestion', questionId: used });
  const unused = bank.find((q) => q.id !== used)!.id;
  assert.equal(sim.do(T, { type: 'revealQuestion', questionId: unused }).result.ok, false);
  sim.ok(T, { type: 'revealTraps' });
  assert.equal(sim.s.review.trapsRevealed, true);
});

test('서버 재시작(매 명령 JSON 왕복)해도 결과가 같다 — 난수 상태 포함', () => {
  const play = (restart: boolean) => {
    const sim = new Sim({}, 99).start();
    for (let r = 0; r < 6 && sim.s.phase === 'RUNNING'; r++) {
      sim.moveAll((t) => sim.trapNeighbor(t) ?? sim.safeNeighbor(t));
      if (restart) sim.s = JSON.parse(JSON.stringify(sim.s));
      if (sim.s.step === 'QUESTION_OPEN') for (let t = 0; t < 8; t++) sim.do(team(t), { type: 'answer', round: sim.qr(), choice: (t % 4) + 1 });
      if (restart) sim.s = JSON.parse(JSON.stringify(sim.s));
      if (sim.s.step === 'ROUND_SUMMARY') sim.ok(T, { type: 'next', round: sim.s.committed!.round });
    }
    return JSON.stringify({ c: sim.s.committed, rng: sim.s.rngState });
  };
  assert.equal(play(true), play(false));
});

test('권한: 시스템은 명령 불가, 잘못된 팀 번호 거부, 팀은 교사 명령 불가', () => {
  const sim = new Sim();
  assert.equal(sim.do(SYS, { type: 'draw' }).result.ok, false);
  assert.equal(sim.do(team(9), { type: 'trapConfirm' }).result.ok, false);
  assert.equal(sim.do(team(0), { type: 'draw' }).result.ok, false);
});

// ── 2단계 Codex 검토 반영 회귀 테스트 ───────────────────────────
test('마감 경계: 이동 마감 시각의 교사 \'지금 마감\'은 새로 열린 문제를 닫지 않는다(STALE)', () => {
  const { sim, target } = simWithTrapForTeam0();
  sim.do(team(0), { type: 'move', round: sim.r(), to: target });
  const r = sim.r();
  sim.now += DEFAULT_CONFIG.moveMs;                    // 이동 마감 시각에 교사가 '지금 마감'을 누름
  const out = sim.do(T, { type: 'closePhase', target: { phase: 'RUNNING', step: 'MOVE_OPEN', round: r } });
  assert.deepEqual(out.result, { ok: false, error: 'STALE' });
  assert.equal(sim.s.step, 'QUESTION_OPEN', '문제는 열린 채로 남는다');
  assert.equal(sim.do(T, { type: 'next', round: 0 }).result.ok, false, '보고 있던 결과 라운드가 아니면 next 도 STALE');
});

test('지난 라운드의 늦은 이동·답안은 다음 라운드에 적용되지 않는다', () => {
  const { sim, target } = simWithTrapForTeam0();
  const r1 = sim.r();
  sim.moveAll((t) => (t === 0 ? target : sim.safeNeighbor(t)));
  sim.do(team(0), { type: 'answer', round: sim.qr(), choice: 2 });
  sim.next();
  assert.deepEqual(sim.do(team(1), { type: 'move', round: r1, to: sim.safeNeighbor(1) }).result, { ok: false, error: 'STALE' });
});

test('처리키가 밀려난 오래된 요청도 재실행되지 않는다(추첨은 로비에서 한 번)', () => {
  const sim = new Sim();
  sim.ok(T, { type: 'draw', requestId: 'D1' });
  const zones = JSON.stringify(sim.s.zones);
  for (let i = 0; i < 80; i++) sim.do(T, { type: 'pause', requestId: 'p' + i }); // 처리키 64개를 밀어낸다
  sim.do(T, { type: 'draw', requestId: 'D1' });
  assert.equal(JSON.stringify(sim.s.zones), zones, '재추첨 없음');
});

test('한 호출이 여러 라운드를 정산하면 이벤트도 라운드별로 따로 나온다', () => {
  const sim = new Sim({ autoNext: true }).start();
  sim.s.committed!.teams.forEach((t) => (t.bindRounds = [1, 2]));
  const out = sim.do(T, { type: 'closePhase', target: { phase: 'RUNNING', step: 'MOVE_OPEN', round: 1 } });
  assert.equal(out.result.ok, true);
  sim.now += 5000;
  const out2 = sim.do(SYS, { type: 'tick' });          // 결과 5초 → 2라운드 열림 → 전원 속박이라 즉시 정산
  const batches = [...out.events, ...out2.events];
  assert.deepEqual(batches.map((b) => b.round), [1, 2]);
  assert.equal(new Set(batches.map((b) => b.seq)).size, 2);
});

test('빈 문항 id 는 판 생성에서 거부', () => {
  const r = createRoom({ code: 'X', title: 't', setName: 's', config: DEFAULT_CONFIG, seed: 1, creds }, bank.map((q, i) => (i === 0 ? { ...q, id: '' } : q)), 0);
  assert.deepEqual(r, { error: 'BANK_INVALID' });
});

test('설치 중 일시정지: 설치 시간 정지, 학생 수정 거부, 재개하면 남은 시간 그대로', () => {
  const sim = new Sim();
  sim.ok(T, { type: 'draw' }); sim.ok(T, { type: 'startSetup' });
  sim.at(30_000);
  sim.ok(T, { type: 'pause' });
  sim.at(10 * 60_000);
  assert.equal(sim.s.phase, 'TRAP_SETUP');
  assert.equal(sim.do(team(0), { type: 'trapConfirm' }).result.ok, false);
  sim.ok(T, { type: 'resume' });
  assert.equal(phaseRemaining(sim.s.clock, sim.now), DEFAULT_CONFIG.setupMs - 30_000);
});

test('정찰 후 수동 종료해도 정찰 결과는 남는다(정보 조회는 즉시 확정)', () => {
  const sim = new Sim().start();
  sim.s.committed!.teams[2].reconAvailable = true;
  sim.ok(team(2), { type: 'recon', topLeft: 0 });
  sim.ok(T, { type: 'finish' });
  assert.ok(sim.s.committed!.teams[2].recon);
});
