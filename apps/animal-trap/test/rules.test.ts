// 기획서 20절 필수 체크리스트 + DESIGN 1절 확정 변경 (+1, 30/20/15, 자동 배치) + 상태이상 라운드 집합
import test from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, OASIS, SPAWN_CELL, ZONES, cellOf, isNeighbor, movesToOasis, neighbors, zoneOf } from '../src/game/board.ts';
import { makeRng } from '../src/game/rng.ts';
import { TRAPS_PER_TEAM, autoPlace, canPlace, drawZones, moveTrap, newGame, swapTraps, validPlacement } from '../src/game/setup.ts';
import { levelFor, pickQuestion, type BankQuestion } from '../src/game/questions.ts';
import { OASIS_POINTS, applyRecon, displayPositions, land, rankTeams, resolve, teamSensor, validMove } from '../src/game/rules.ts';
import type { Committed, Trap, TrapType } from '../src/game/types.ts';

const ZONES8 = [0, 1, 2, 3, 4, 5, 6, 7]; // 팀 t = 구역 t (테스트 편의)
const pick = (_t: number, level: string) => 'q-' + level;
/** 덫을 직접 지정한 판 */
function game(traps: [owner: number, cell: number, type?: TrapType][] = []): Committed {
  const list: Trap[] = traps.map(([owner, cell, type], id) => ({ id, owner, cell, type: type ?? 'normal', active: true }));
  return newGame(makeRng(1), ZONES8, list);
}
/** 팀 t 만 이동, 나머지 미제출 */
const only = (team: number, to: number): (number | null)[] => ZONES8.map((t) => (t === team ? to : null));
/** 팀 0 을 원하는 칸 옆에 세워 둔다 */
function placeTeam(g: Committed, team: number, at: number): Committed { const n = structuredClone(g); n.teams[team].pos = at; n.teams[team].visited = [...new Set([...n.teams[team].visited, at])].sort((a, b) => a - b); return n; }
const step = (g: Committed, moves: (number | null)[], correct: (boolean | null)[] = []) => resolve(g, land(g, moves, pick), correct);

// ── 보드·이동·설치 ─────────────────────────────────────────────
test('보드: 256칸, 중앙 2×2 오아시스, 8곳 2×2 출발 구역', () => {
  assert.equal(CELLS, 256);
  assert.deepEqual(OASIS, [cellOf(7, 7), cellOf(7, 8), cellOf(8, 7), cellOf(8, 8)]);
  assert.equal(ZONES.length, 8);
  const tl = [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]];
  ZONES.forEach((z, i) => { assert.equal(z.length, 4); assert.equal(z[0], cellOf(tl[i][0], tl[i][1])); });
  assert.equal(new Set(ZONES.flat()).size, 32);
  SPAWN_CELL.forEach((c, z) => assert.equal(zoneOf(c), z));
  assert.ok(SPAWN_CELL.every((c) => movesToOasis(c) >= 6 && movesToOasis(c) <= 7));
});

test('이동: 8방향 1칸만, 보드 밖·제자리·두 칸 거부', () => {
  const g = placeTeam(game(), 0, cellOf(0, 0));
  assert.equal(neighbors(cellOf(0, 0)).length, 3);
  assert.equal(neighbors(cellOf(5, 5)).length, 8);
  assert.ok(validMove(g, 0, cellOf(1, 1)));
  assert.ok(!validMove(g, 0, cellOf(0, 0)));
  assert.ok(!validMove(g, 0, cellOf(2, 2)));
  assert.ok(!validMove(g, 0, -1));
  assert.ok(!validMove(g, 0, 256));
  assert.ok(!validMove(g, 0, 1.5));
  const p = land(g, only(0, cellOf(2, 2)), pick);
  assert.equal(p.landings[0].moved, false, '잘못된 이동은 제자리');
});

test('설치: 팀당 13개(일반 10·귀환·속박·혼란), 오아시스·자기 구역 금지, 한 칸 1개, 타 팀과 중첩 허용', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = makeRng(seed), zones = drawZones(rng);
    assert.deepEqual([...zones].sort(), ZONES8, '구역 중복 없이 배정');
    const traps = autoPlace(rng, zones);
    assert.ok(validPlacement(traps, zones));
    assert.equal(traps.length, 8 * TRAPS_PER_TEAM);
  }
  assert.ok(!canPlace(0, OASIS[0]));
  assert.ok(!canPlace(0, ZONES[0][0]));
  assert.ok(canPlace(0, ZONES[1][0]), '다른 팀 구역에는 설치 가능');
  const traps = autoPlace(makeRng(3), ZONES8);
  const mine = traps.filter((t) => t.owner === 0);
  const other = traps.find((t) => t.owner === 1)!;
  const moved = moveTrap(traps, ZONES8, 0, mine[0].id, other.cell);
  assert.ok(Array.isArray(moved), '다른 팀 덫과 같은 칸 허용');
  assert.equal(moveTrap(traps, ZONES8, 0, mine[0].id, mine[1].cell), 'OCCUPIED_BY_YOU');
  assert.equal(moveTrap(traps, ZONES8, 0, other.id, cellOf(5, 5)), 'NOT_YOURS');
  assert.equal(moveTrap(traps, ZONES8, 0, mine[0].id, OASIS[0]), 'BAD_CELL');
  const swapped = swapTraps(traps, 0, mine[0].id, mine[1].id) as Trap[];
  assert.equal(swapped.find((t) => t.id === mine[0].id)!.cell, mine[1].cell);
});

// ── 점수·문제·덫 ───────────────────────────────────────────────
test('n=0 일반 칸: 팀별 최초 방문만 +1 (확정 변경), 재방문 0, 출발 칸은 처음부터 방문 처리', () => {
  let g = placeTeam(game(), 0, cellOf(5, 5));
  const a = step(g, only(0, cellOf(5, 6)));
  assert.equal(a.committed.teams[0].score, 1);
  g = a.committed;
  g = step(g, only(0, cellOf(5, 5))).committed; // 이미 방문(placeTeam)
  const back = step(g, only(0, cellOf(5, 6)));
  assert.equal(back.committed.teams[0].score, 1, '같은 칸 다시 와도 0');
  assert.ok(game().teams[0].visited.includes(SPAWN_CELL[0]));
});

test('난이도(확정 변경): n=1 쉬움, 2 보통, 3 이상 어려움, 0 이면 문제 없음', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(levelFor), [null, '쉬움', '보통', '어려움', '어려움', '어려움', '어려움']);
});

test('특수 덫만 1개인 칸도 n=1 쉬움, 정답 +3·제거 / 오답 -2·유지·효과', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[1, at, 'bind']]), 0, cellOf(5, 5));
  const p = land(g, only(0, at), pick);
  assert.equal(p.landings[0].level, '쉬움');
  const ok = resolve(g, p, [true]);
  assert.equal(ok.committed.teams[0].score, 3);
  assert.equal(ok.committed.traps[0].active, false);
  const no = resolve(g, p, [false]);
  assert.equal(no.committed.teams[0].score, -2);
  assert.equal(no.committed.traps[0].active, true);
  assert.deepEqual(no.committed.teams[0].bindRounds, [2, 3]);
});

test('일반 2 + 특수 2 = n=4 어려움, 정답 +6 / 오답 -5, 정답이면 4개 모두 제거', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[1, at], [2, at], [3, at, 'confuse'], [0, at, 'return']]), 0, cellOf(5, 5));
  const p = land(g, only(0, at), pick);
  assert.equal(p.landings[0].level, '어려움');
  const ok = resolve(g, p, [true]);
  assert.equal(ok.committed.teams[0].score, 6);
  assert.ok(ok.committed.traps.every((t) => !t.active));
  const no = resolve(g, p, [false]);
  assert.equal(no.committed.teams[0].score, -5);
  assert.ok(no.committed.traps.every((t) => t.active));
});

test('자기 덫도 자기에게 발동', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[0, at]]), 0, cellOf(5, 5));
  assert.equal(land(g, only(0, at), pick).landings[0].level, '쉬움');
});

test('미응답(시간 초과) = 오답', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[1, at]]), 0, cellOf(5, 5));
  assert.equal(resolve(g, land(g, only(0, at), pick), []).committed.teams[0].score, -2);
});

test('오답으로 남은 칸 재진입: 그 시점 덫 수로 새 문항, 같은 팀 재출제 회피', () => {
  const bank: BankQuestion[] = ['a', 'b', 'c'].map((id) => ({ id, level: '쉬움', text: id, choices: ['1', '2', '3', '4'], answer: 1, explanation: '' }));
  const rng = makeRng(5);
  const picker = (_t: number, level: any, asked: readonly string[]) => pickQuestion(bank, level, asked, rng);
  const at = cellOf(5, 6);
  let g = placeTeam(game([[1, at]]), 0, cellOf(5, 5));
  const p1 = land(g, only(0, at), picker); g = resolve(g, p1, [false]).committed;
  g = step(g, only(0, cellOf(5, 5))).committed;
  const p2 = land(g, only(0, at), picker);
  assert.notEqual(p2.landings[0].questionId, p1.landings[0].questionId);
  // 다 쓰면 가장 오래된 것부터
  assert.equal(pickQuestion(bank, '쉬움', ['b', 'a', 'c'], rng), 'b');
});

test('같은 칸 동시 착지: 같은 n, 답 순서 무관, 한 팀이라도 정답이면 한 번만 제거, 오답 팀은 스냅샷 기준 효과', () => {
  const at = cellOf(6, 6);
  let g = game([[2, at], [3, at, 'return']]);
  g = placeTeam(placeTeam(g, 0, cellOf(5, 5)), 1, cellOf(5, 6));
  const p = land(g, ZONES8.map((t) => (t === 0 || t === 1 ? at : null)), pick);
  assert.equal(p.landings[0].snapshot.length, 2);
  assert.deepEqual(p.landings[0].snapshot, p.landings[1].snapshot);
  const r = resolve(g, p, [true, false]);
  assert.equal(r.committed.teams[0].score, 4);
  assert.equal(r.committed.teams[1].score, -3);
  assert.ok(r.committed.traps.every((t) => !t.active));
  assert.equal(r.events.filter((e) => e.type === 'trapsRemoved').length, 1);
  assert.equal(r.committed.teams[1].pos, r.committed.teams[1].spawn, '오답 팀은 귀환');
  const swapped = resolve(g, p, [false, true]);
  assert.equal(swapped.committed.teams[1].score, 4);
  assert.equal(swapped.committed.teams[0].score, -3);
});

test('센서: 현재 칸 제외 주변 8칸의 모든 덫(자기·상대·일반·특수) 합, 보드 밖 제외', () => {
  const c = cellOf(5, 5);
  const g = placeTeam(game([[0, cellOf(4, 4)], [1, cellOf(4, 4), 'bind'], [2, cellOf(6, 6), 'confuse'], [3, c], [4, cellOf(3, 3)]]), 0, c);
  assert.equal(teamSensor(g, null, 0, 'move'), 3);
  const corner = placeTeam(game([[1, cellOf(0, 1)], [2, cellOf(1, 1)]]), 7, cellOf(0, 0));
  assert.equal(teamSensor(corner, null, 7, 'move'), 2);
  // 착지 후에는 착지 위치 기준 (덫은 아직 제거 전)
  const p = land(g, only(0, cellOf(5, 6)), pick);
  assert.equal(teamSensor(g, p, 0, 'landed'), [cellOf(4, 5), cellOf(4, 6), cellOf(4, 7), cellOf(5, 5), cellOf(5, 7), cellOf(6, 5), cellOf(6, 6), cellOf(6, 7)].reduce((n, x) => n + g.traps.filter((t) => t.cell === x).length, 0));
  assert.throws(() => teamSensor(g, null, 0, 'landed'), /PENDING_REQUIRED/);
});

test('pending 동안 표시 위치는 착지 위치, 버리면 확정 위치로', () => {
  const g = placeTeam(game(), 0, cellOf(5, 5));
  const p = land(g, only(0, cellOf(5, 6)), pick);
  assert.equal(displayPositions(g, p)[0], cellOf(5, 6));
  assert.equal(displayPositions(g, null)[0], cellOf(5, 5));
  assert.equal(g.teams[0].pos, cellOf(5, 5), 'land 는 확정 상태를 바꾸지 않는다');
});

// ── 상태이상 ───────────────────────────────────────────────────
test('귀환: 출발 칸으로, 출발 칸에 덫이 있어도 연쇄 판정·문제·보상 없음', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[1, at, 'return'], [2, SPAWN_CELL[0], 'bind']]), 0, cellOf(5, 5)); // 다른 팀은 남의 구역에 설치 가능
  const r = resolve(g, land(g, only(0, at), pick), [false]);
  assert.equal(r.committed.teams[0].pos, SPAWN_CELL[0]);
  assert.equal(r.committed.teams[0].score, -2);
  assert.deepEqual(r.committed.teams[0].bindRounds, [], '출발 칸 속박 덫은 발동하지 않음');
  assert.equal(r.committed.quizLog.length, 1);
  assert.ok(r.committed.traps[1].active);
});

test('속박: 다음 2라운드 이동 불가(자동 제자리), 정확히 두 번', () => {
  const at = cellOf(5, 6);
  let g = placeTeam(game([[1, at, 'bind']]), 0, cellOf(5, 5));
  g = resolve(g, land(g, only(0, at), pick), [false]).committed;           // R1 오답
  assert.ok(!validMove(g, 0, cellOf(5, 7)));                                 // R2
  let r = step(g, only(0, cellOf(5, 7))); assert.equal(r.committed.teams[0].pos, at); g = r.committed;
  assert.ok(!validMove(g, 0, cellOf(5, 7)));                                 // R3
  r = step(g, only(0, cellOf(5, 7))); assert.equal(r.committed.teams[0].pos, at); g = r.committed;
  assert.ok(validMove(g, 0, cellOf(5, 7)));                                  // R4 풀림
  assert.deepEqual(g.teams[0].bindRounds.filter((r) => r > g.round), [], '앞으로 남은 속박 없음');
});

test('혼란: R 에 오답 → R+1·R+2 의 이동·착지·결과 화면 모두 센서 숨김, R+3 에 풀림, 재적용 시 max(남은, 2)', () => {
  const a = cellOf(5, 6), b = cellOf(5, 7);
  let g = placeTeam(game([[1, a, 'confuse'], [2, b, 'confuse']]), 0, cellOf(5, 5));
  g = resolve(g, land(g, only(0, a), pick), [false]).committed;           // R1 오답 → {2,3}
  assert.notEqual(teamSensor(g, null, 0, 'summary'), null, 'R1 결과 화면은 아직 보임');
  assert.equal(teamSensor(g, null, 0, 'move'), null, 'R2 이동');
  const p2 = land(g, only(0, cellOf(4, 6)), pick);
  assert.equal(teamSensor(g, p2, 0, 'landed'), null, 'R2 착지');
  g = resolve(g, p2, []).committed;
  assert.equal(teamSensor(g, null, 0, 'summary'), null, 'R2 결과 화면 (조기 해제 버그 회귀)');
  assert.equal(teamSensor(g, null, 0, 'move'), null, 'R3 이동');
  g = step(g, only(0, cellOf(4, 7))).committed;
  assert.equal(teamSensor(g, null, 0, 'summary'), null, 'R3 결과 화면');
  assert.notEqual(teamSensor(g, null, 0, 'move'), null, 'R4 풀림');
  // 재적용: R1 혼란 {2,3} → R2 에 또 혼란 → {3,4}
  let h = placeTeam(game([[1, a, 'confuse'], [2, b, 'confuse']]), 0, cellOf(5, 5));
  h = resolve(h, land(h, only(0, a), pick), [false]).committed;
  h = resolve(h, land(h, only(0, b), pick), [false]).committed;
  assert.deepEqual(h.teams[0].confuseRounds.filter((r) => r > 2), [3, 4]);
  assert.equal(teamSensor(h, null, 0, 'summary'), null, '재적용 직후 R2 결과 화면도 숨김');
  assert.equal(teamSensor(h, null, 0, 'move'), null, 'R3 이동');
});

test('특수 덫 여러 개 + 오답: 가장 강한 1개만 (귀환 > 속박 > 혼란)', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[1, at, 'confuse'], [2, at, 'bind'], [3, at, 'return']]), 0, cellOf(5, 5));
  const r = resolve(g, land(g, only(0, at), pick), [false]);
  assert.deepEqual(r.events.filter((e) => e.type === 'effect').map((e: any) => e.effect), ['return']);
  assert.deepEqual(r.committed.teams[0].bindRounds, []);
});

// ── 오아시스·정찰·상대 출발 구역 ─────────────────────────────────
function toOasis(g: Committed, team: number, from: number): Committed { return placeTeam(g, team, from); }

test('오아시스 30/20/15 (확정 변경), 팀당 최초 1회, 재방문 없음', () => {
  assert.deepEqual([1, 2, 3, 4].map(OASIS_POINTS), [30, 20, 15, 15]);
  let g = toOasis(game(), 0, cellOf(6, 6));
  let r = step(g, only(0, OASIS[0]));
  assert.equal(r.committed.teams[0].score, 30); assert.equal(r.committed.teams[0].oasisRank, 1);
  g = step(r.committed, only(0, cellOf(6, 6))).committed;
  r = step(g, only(0, OASIS[0]));
  assert.equal(r.committed.teams[0].score, 30, '재진입 추가 점수 없음');
});

test('A·C 동시 최초 도착 = 공동 1위 각 +30, 다음 B = 3위 +15', () => {
  let g = toOasis(toOasis(toOasis(game(), 0, cellOf(6, 6)), 2, cellOf(6, 9)), 1, cellOf(5, 5));
  let r = step(g, ZONES8.map((t) => (t === 0 ? OASIS[0] : t === 2 ? OASIS[1] : t === 1 ? cellOf(6, 6) : null)));
  assert.deepEqual([r.committed.teams[0].oasisRank, r.committed.teams[2].oasisRank], [1, 1]);
  assert.deepEqual([r.committed.teams[0].score, r.committed.teams[2].score], [30, 30]);
  r = step(r.committed, only(1, OASIS[0]));
  assert.equal(r.committed.teams[1].oasisRank, 3); assert.equal(r.committed.teams[1].score, 1 + 15, '오는 길 안전 칸 +1 + 3위 15');
});

test('A 단독 1위, 다음 라운드 B·C 공동 2위 각 +20, 그다음은 4위', () => {
  let g = toOasis(toOasis(toOasis(toOasis(game(), 0, cellOf(6, 6)), 1, cellOf(6, 9)), 2, cellOf(9, 6)), 3, cellOf(9, 9));
  g = step(g, only(0, OASIS[0])).committed;
  const r = step(g, ZONES8.map((t) => (t === 1 ? OASIS[1] : t === 2 ? OASIS[2] : null)));
  assert.deepEqual([r.committed.teams[1].oasisRank, r.committed.teams[2].oasisRank], [2, 2]);
  assert.deepEqual([r.committed.teams[1].score, r.committed.teams[2].score], [20, 20]);
  const r2 = step(r.committed, only(3, OASIS[3]));
  assert.equal(r2.committed.teams[3].oasisRank, 4); assert.equal(r2.committed.teams[3].score, 15);
});

test('정찰: 3×3 1회, 상대 덫 칸·개수만(자기 덫 제외·종류 없음), 보드 밖 영역 거부, 정찰권 없으면 거부', () => {
  let g = toOasis(game([[1, cellOf(0, 0)], [2, cellOf(1, 1), 'bind'], [3, cellOf(1, 1)], [0, cellOf(2, 2)]]), 0, cellOf(6, 6));
  assert.equal(applyRecon(g, 0, cellOf(0, 0)), 'NO_RECON');
  g = step(g, only(0, OASIS[0])).committed;
  assert.equal(applyRecon(g, 0, cellOf(14, 14)), 'BAD_AREA');
  const after = applyRecon(g, 0, cellOf(0, 0)) as Committed;
  assert.deepEqual(after.teams[0].recon!.cells.map((c) => [c.cell, c.count]), [[cellOf(0, 0), 1], [cellOf(1, 1), 2]]);
  assert.ok(!JSON.stringify(after.teams[0].recon).includes('bind'), '종류는 공개하지 않음');
  assert.equal(applyRecon(after, 0, cellOf(0, 0)), 'NO_RECON', '1회만');
});

test('상대 출발 구역: 구역당 최초 1회 +10, 자기 구역 없음, 안전 +1 없음, 덫 있으면 문제도', () => {
  const zone1 = ZONES[1][2]; // (1,7)
  let g = placeTeam(game(), 0, cellOf(2, 7));
  let r = step(g, only(0, zone1));
  assert.equal(r.committed.teams[0].score, 10);
  g = step(r.committed, only(0, ZONES[1][3])).committed;
  assert.equal(g.teams[0].score, 10, '같은 상대 구역 재방문·구역 내 이동 0');
  const own = placeTeam(game(), 0, cellOf(2, 0));
  const ownCell = ZONES[0].find((c) => c !== SPAWN_CELL[0] && isNeighbor(c, cellOf(2, 0)))!;
  assert.ok(ownCell !== undefined);
  assert.equal(step(own, only(0, ownCell)).committed.teams[0].score, 1, '자기 구역 칸: +10 은 없고, 처음 밟은 빈 칸이면 안전 +1 (출발 칸만 제외)');
  const trapped = placeTeam(game([[2, zone1, 'return']]), 0, cellOf(2, 7));
  const tr = resolve(trapped, land(trapped, only(0, zone1), pick), [false]);
  assert.equal(tr.committed.teams[0].score, 10 - 2, '+10 은 착지 기준, 오답 -2, 귀환해도 +10 유지 (D6)');
  assert.equal(tr.committed.teams[0].pos, SPAWN_CELL[0]);
});

// ── 순위 ───────────────────────────────────────────────────────
test('순위: 점수 내림차순, 동점 공동 순위, 다음 순위 건너뜀', () => {
  assert.deepEqual(rankTeams([10, 30, 30, 5, 10]), [3, 1, 1, 5, 3]);
  assert.deepEqual(rankTeams([-3, -3, 0]), [2, 2, 1]);
});

test('40점을 넘어도 규칙 엔진에는 종료 조건이 없다(종료는 타이머·교사만)', () => {
  let g = toOasis(game(), 0, cellOf(6, 6));
  g.teams[0].score = 45;
  const r = step(g, only(0, OASIS[0]));
  assert.equal(r.committed.teams[0].score, 75);
  assert.ok(!('finished' in r.committed));
});

test('인접 판정 대칭', () => { assert.ok(isNeighbor(cellOf(3, 3), cellOf(4, 4))); assert.ok(!isNeighbor(cellOf(3, 3), cellOf(3, 3))); });

// ── 순수성·결정성·직렬화·검증 ───────────────────────────────────
function deepFreeze<T>(o: T): T { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; }

test('land·resolve·applyRecon 은 입력을 바꾸지 않는다(동결 입력), 결과는 JSON 왕복 후에도 같다', () => {
  const at = cellOf(6, 6);
  const g = deepFreeze(placeTeam(game([[1, at, 'return'], [2, at]]), 0, cellOf(5, 5)));
  const before = JSON.stringify(g);
  const p = deepFreeze(land(g, only(0, at), pick));
  const r = resolve(g, p, [false]);
  assert.equal(JSON.stringify(g), before);
  assert.deepEqual(JSON.parse(JSON.stringify(r.committed)), r.committed);
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
});

test('pending 을 버리면 그 라운드는 없던 일(확정 상태 전부 그대로), 같은 pending 두 번 정산 불가', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[1, at, 'bind']]), 0, cellOf(5, 5));
  const snapshot = JSON.stringify(g);
  const p = land(g, only(0, at), pick);
  assert.equal(JSON.stringify(g), snapshot, 'land 후에도 확정 상태 불변 = 폐기 시 복원할 것이 없음');
  const r = resolve(g, p, [true]);
  assert.throws(() => resolve(r.committed, p, [true]), /ROUND_MISMATCH/);
});

test('같은 시드 = 같은 판, 난수 상태를 저장했다가 이어 쓰면 이어지는 수열', () => {
  const a = newGame(makeRng(42)), b = newGame(makeRng(42));
  assert.deepEqual(a, b);
  const r1 = makeRng(7); r1(); r1();
  const resumed = makeRng(r1.state());
  assert.equal(resumed(), r1());
});

test('설치 검증: 개수 초과·소유자 범위 밖·id 중복·비활성·구역 배정 오류를 거부', () => {
  const traps = autoPlace(makeRng(9), ZONES8);
  assert.ok(validPlacement(traps, ZONES8));
  assert.ok(!validPlacement([...traps, { id: 999, owner: 99, cell: 5, type: 'normal', active: true }], ZONES8));
  assert.ok(!validPlacement(traps.map((t) => ({ ...t, id: 0 })), ZONES8));
  assert.ok(!validPlacement(traps.map((t, i) => (i === 0 ? { ...t, active: false } : t)), ZONES8));
  assert.ok(!validPlacement(traps, [0, 0, 2, 3, 4, 5, 6, 7]));
  assert.ok(!validPlacement(traps.map((t, i) => (i === 0 ? { ...t, owner: 1 } : t)), ZONES8));
});

test('문항 기록(서버 전용): 라운드·팀·문항·정오·시간초과', () => {
  const at = cellOf(5, 6);
  const g = placeTeam(game([[1, at]]), 0, cellOf(5, 5));
  const timeout = resolve(g, land(g, only(0, at), pick), []).committed.quizLog[0];
  assert.deepEqual(timeout, { round: 1, team: 0, questionId: 'q-쉬움', level: '쉬움', n: 1, correct: false, timeout: true });
  const answered = resolve(g, land(g, only(0, at), pick), [false]).committed.quizLog[0];
  assert.equal(answered.timeout, false);
});
