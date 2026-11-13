/**
 * rules.ts — 라운드 규칙 (DESIGN §4-3). 순수 함수: 입력 상태를 바꾸지 않고 새 상태를 돌려준다.
 *
 *   land(committed, moves, pick)     MOVE_OPEN 마감 → Pending(착지·스냅샷·문항 배정, 아직 확정 아님)
 *   resolve(committed, pending, ans) RESOLVE → 새 Committed + 이벤트 (점수·덫 제거·특수효과·오아시스 일괄)
 *   sensor / applyRecon / rankTeams / displayPositions
 *
 * ⚠️ 확정 규칙(사용자 2026-11-13): 안전 칸 최초 방문 +1, 오아시스 30/20/15.
 * ⚠️ land 는 Committed 를 바꾸지 않는다. Pending 을 버리면 그 라운드는 없던 일이 된다 (D5·D13).
 */
import { isNeighbor, isOasis, neighbors, reconArea, validReconTopLeft, zoneOf, isCell } from './board.ts';
import type { Cell } from './board.ts';
import { levelFor } from './questions.ts';
import type { Committed, Landing, Level, Pending, Phase, ReconResult, RoundEvent, TeamState, Trap } from './types.ts';

export const SAFE_BONUS = 1;
export const ZONE_BONUS = 10;
export const OASIS_POINTS = (rank: number): number => (rank === 1 ? 30 : rank === 2 ? 20 : 15);
export const correctPoints = (n: number): number => n + 2;
export const wrongPoints = (n: number): number => -(n + 1);

const EFFECT_RANK = { return: 3, bind: 2, confuse: 1 } as const;

const clone = <T>(v: T): T => structuredClone(v);
const insertSorted = (arr: number[], v: number): number[] => (arr.includes(v) ? arr : [...arr, v].sort((a, b) => a - b));

export const activeTrapsAt = (traps: readonly Trap[], cell: Cell): Trap[] => traps.filter((t) => t.active && t.cell === cell);
export const isBound = (team: TeamState, round: number): boolean => team.bindRounds.includes(round);
export const isConfused = (team: TeamState, round: number): boolean => team.confuseRounds.includes(round);

/** 이동 검증: 8방향 1칸, 보드 안. 속박 라운드면 불가 */
export function validMove(committed: Committed, team: number, to: unknown): to is Cell {
  const t = committed.teams[team];
  return !!t && isCell(to) && isNeighbor(t.pos, to) && !isBound(t, committed.round + 1);
}

export type QuestionPicker = (team: number, level: Level, asked: readonly string[]) => string;

/**
 * MOVE_OPEN 마감. moves[t] = 목적지 셀 또는 null(미제출). 잘못된 이동·속박 팀은 제자리로 처리.
 */
export function land(committed: Committed, moves: readonly (Cell | null | undefined)[], pick: QuestionPicker): Pending {
  const round = committed.round + 1;
  const landings: Landing[] = committed.teams.map((t, team) => {
    const to = moves[team];
    const moved = to != null && validMove(committed, team, to);
    const base: Landing = { team, from: t.pos, to: t.pos, moved: false, snapshot: [], kind: 'stay', bonus: 0, zoneBonus: null,
      firstVisit: false, oasisNew: false, level: null, questionId: null };
    if (!moved) return base;
    const dest = to as Cell;
    const snapshot = activeTrapsAt(committed.traps, dest).map((x) => x.id);
    const firstVisit = !t.visited.includes(dest);
    const zone = zoneOf(dest);
    const landing: Landing = { ...base, to: dest, moved: true, snapshot, firstVisit };
    if (isOasis(dest)) {
      landing.kind = 'oasis';
      landing.oasisNew = t.oasisRound === null;
    } else if (zone !== -1 && zone !== t.zone) {
      landing.kind = 'zone';
      if (!t.opponentZones.includes(zone)) { landing.bonus = ZONE_BONUS; landing.zoneBonus = zone; }
    } else {
      landing.kind = snapshot.length ? 'trap' : firstVisit ? 'safe' : 'empty';
      if (!snapshot.length && firstVisit) landing.bonus = SAFE_BONUS;
    }
    // 덫이 있으면 지역 칸이어도 문제를 낸다 (기획서 8.3)
    if (snapshot.length) {
      landing.level = levelFor(snapshot.length);
      landing.questionId = pick(team, landing.level as Level, t.asked);
    }
    return landing;
  });
  return { round, landings };
}

/** 현재 표시 위치: pending 이 있으면 착지 위치(이동은 공개 정보), 없으면 확정 위치 */
export function displayPositions(committed: Committed, pending: Pending | null): Cell[] {
  return committed.teams.map((t, i) => (pending ? pending.landings[i].to : t.pos));
}

/**
 * RESOLVE. correct[t] = true/false (문항이 배정된 팀만 본다. 없으면 = 시간 초과 = 오답).
 * 같은 Pending 으로 두 번 부르지 않게 하는 것은 호출자(DO)의 round.settled 몫.
 */
export function resolve(committed: Committed, pending: Pending, correct: readonly (boolean | null | undefined)[]): { committed: Committed; events: RoundEvent[] } {
  if (pending.round !== committed.round + 1) throw new Error('ROUND_MISMATCH');
  const next = clone(committed);
  const R = pending.round;
  const events: RoundEvent[] = [];
  const removeCells = new Set<number>(); // 정답이 나온 칸의 스냅샷 덫 id
  const removeIds = new Set<number>();

  // 1~4. 이동·방문·보너스·문제 점수
  for (const l of pending.landings) {
    const t = next.teams[l.team];
    if (!l.moved) { events.push({ type: 'stay', team: l.team, reason: isBound(committed.teams[l.team], R) ? 'bound' : 'noMove' }); continue; }
    events.push({ type: 'move', team: l.team, from: l.from, to: l.to });
    t.pos = l.to;
    t.visited = insertSorted(t.visited, l.to); // 모든 실제 착지는 방문 기록 (덫 칸 포함)
    if (l.kind === 'safe' && l.bonus) { t.score += l.bonus; events.push({ type: 'safe', team: l.team, cell: l.to, points: l.bonus }); }
    if (l.zoneBonus !== null) { t.score += l.bonus; t.opponentZones = insertSorted(t.opponentZones, l.zoneBonus); events.push({ type: 'zone', team: l.team, zone: l.zoneBonus, points: l.bonus }); }
    if (l.questionId) {
      t.asked = [...t.asked.filter((q) => q !== l.questionId), l.questionId];
      const n = l.snapshot.length, ok = correct[l.team] === true, timeout = correct[l.team] == null;
      const pts = ok ? correctPoints(n) : wrongPoints(n);
      t.score += pts;
      events.push({ type: 'quiz', team: l.team, level: l.level as Level, n, correct: ok, timeout, points: pts });
      next.quizLog.push({ round: R, team: l.team, questionId: l.questionId, level: l.level as Level, n, correct: ok, timeout });
      if (ok) { removeCells.add(l.to); l.snapshot.forEach((id) => removeIds.add(id)); }
    }
  }

  // 5. 덫 제거: 한 팀이라도 정답인 칸의 스냅샷 덫 집합을 한 번만
  for (const cell of removeCells) {
    const ids = pending.landings.find((l) => l.to === cell && l.questionId && correct[l.team] === true)!.snapshot;
    let count = 0;
    for (const trap of next.traps) if (ids.includes(trap.id) && trap.active) { trap.active = false; count++; }
    events.push({ type: 'trapsRemoved', cell, count });
  }

  // 6. 특수 효과: 오답 팀만, 스냅샷의 특수 덫 중 가장 강한 1개 (귀환 > 속박 > 혼란)
  for (const l of pending.landings) {
    if (!l.questionId || correct[l.team] === true) continue;
    const specials = l.snapshot.map((id) => committed.traps.find((x) => x.id === id)!).filter((x) => x.type !== 'normal');
    if (!specials.length) continue;
    const strongest = specials.sort((a, b) => EFFECT_RANK[b.type as keyof typeof EFFECT_RANK] - EFFECT_RANK[a.type as keyof typeof EFFECT_RANK])[0].type as 'return' | 'bind' | 'confuse';
    const t = next.teams[l.team];
    if (strongest === 'return') t.pos = t.spawn; // 그 칸에서 판정·보상·방문 기록 없음
    // 현재 라운드 R 기록은 유지(R 결과 화면에서도 숨김), 앞으로 2라운드 추가 = max(남은, 2)
    const future = (rounds: number[]) => [...new Set([...rounds.filter((r) => r >= R), R + 1, R + 2])].sort((a, b) => a - b);
    if (strongest === 'bind') t.bindRounds = future(t.bindRounds);
    if (strongest === 'confuse') t.confuseRounds = future(t.confuseRounds);
    events.push({ type: 'effect', team: l.team, effect: strongest });
  }

  // 7. 오아시스: 이번 라운드 신규 도착 전원 공동 순위 (경쟁 순위)
  const arrivals = pending.landings.filter((l) => l.moved && l.oasisNew);
  if (arrivals.length) {
    const rank = 1 + committed.oasisArrivals;
    for (const l of arrivals) {
      const t = next.teams[l.team];
      t.oasisRound = R; t.oasisRank = rank; t.reconAvailable = true;
      t.score += OASIS_POINTS(rank);
      events.push({ type: 'oasis', team: l.team, rank, points: OASIS_POINTS(rank) });
    }
    next.oasisArrivals += arrivals.length;
  }

  // 8. 확정: 이미 끝난 라운드의 상태이상 기록만 정리. **현재 라운드 R 은 남긴다** —
  //    R 의 결과 화면(summary)에서도 R 이 혼란 라운드면 센서를 숨겨야 한다.
  for (const t of next.teams) { t.bindRounds = t.bindRounds.filter((r) => r >= R); t.confuseRounds = t.confuseRounds.filter((r) => r >= R); }
  next.round = R;
  return { committed: next, events };
}

/**
 * 센서 (DESIGN §4-3). 위치·적용 라운드를 **안에서** 정한다 — 호출자가 임의 좌표·라운드를 넣을 수 없다.
 *   move    : 다음 라운드(committed.round+1) 이동 단계. 확정 위치
 *   landed  : 착지~정산 전(pending.round). 착지 위치, 덫은 스냅샷 시점(=확정 상태, 제거 전)
 *   summary : 정산 후 결과 화면(committed.round). 확정 위치(귀환 반영), 제거 반영
 * 혼란 라운드면 null.
 */
export function teamSensor(committed: Committed, pending: Pending | null, team: number, phase: Phase): number | null {
  const t = committed.teams[team];
  if (phase === 'landed' && !pending) throw new Error('PENDING_REQUIRED');
  const round = phase === 'move' ? committed.round + 1 : phase === 'landed' ? pending!.round : committed.round;
  const pos = phase === 'landed' ? pending!.landings[team].to : t.pos;
  if (isConfused(t, round)) return null;
  return neighbors(pos).reduce((sum, c) => sum + activeTrapsAt(committed.traps, c).length, 0);
}

export type ReconError = 'NO_RECON' | 'BAD_AREA';
/** 정찰: 3×3 영역 안 상대 덫 칸·개수를 그 팀에 저장하고 정찰권 소멸 */
export function applyRecon(committed: Committed, team: number, topLeft: Cell): Committed | ReconError {
  const t = committed.teams[team];
  if (!t?.reconAvailable) return 'NO_RECON';
  if (!validReconTopLeft(topLeft)) return 'BAD_AREA';
  const next = clone(committed);
  const cells: ReconResult['cells'] = [];
  for (const cell of reconArea(topLeft)) {
    const others = activeTrapsAt(committed.traps, cell).filter((x) => x.owner !== team);
    if (others.length) cells.push({ cell, count: others.length, trapIds: others.map((x) => x.id) });
  }
  next.teams[team].recon = { topLeft, round: committed.round, cells };
  next.teams[team].reconAvailable = false;
  return next;
}

/** 경쟁 순위: 점수 내림차순, 같은 점수 같은 순위, 다음 순위 건너뜀 (1,1,3) */
export function rankTeams(scores: readonly number[]): number[] {
  return scores.map((s) => 1 + scores.filter((o) => o > s).length);
}
