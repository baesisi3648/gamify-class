/**
 * setup.ts — 출발 구역 추첨과 덫 설치 (DESIGN §4-2, 사용자 확정: 자동 배치 후 수정).
 */
import { CELLS, OASIS, SPAWN_CELL, TEAMS, ZONES, isCell, isOasis, zoneOf } from './board.ts';
import type { Cell } from './board.ts';
import { shuffle } from './rng.ts';
type Rng = () => number;
import type { Committed, TeamState, Trap, TrapType } from './types.ts';

export const NORMAL_TRAPS = 10;
export const TRAP_TYPES: readonly TrapType[] = [...Array<TrapType>(NORMAL_TRAPS).fill('normal'), 'return', 'bind', 'confuse'];
export const TRAPS_PER_TEAM = TRAP_TYPES.length; // 13

/** 팀 t 가 덫을 놓을 수 있는 칸: 오아시스 아님, 자기 출발 구역 아님 */
export const canPlace = (zone: number, cell: Cell): boolean => isCell(cell) && !isOasis(cell) && zoneOf(cell) !== zone;

/** 8팀에 출발 구역을 중복 없이 무작위 배정. 결과[t] = 구역 id */
export const drawZones = (rng: Rng): number[] => shuffle(rng, [...Array(TEAMS).keys()]);

export function newTeam(zone: number): TeamState {
  const spawn = SPAWN_CELL[zone];
  return { zone, spawn, pos: spawn, score: 0, visited: [spawn], opponentZones: [], oasisRound: null, oasisRank: null,
    reconAvailable: false, recon: null, bindRounds: [], confuseRounds: [], asked: [] };
}

/** 팀마다 가능한 칸에서 균등 무작위 13칸 + 종류 무작위 */
export function autoPlace(rng: Rng, zones: readonly number[]): Trap[] {
  const traps: Trap[] = [];
  zones.forEach((zone, team) => {
    const allowed = [...Array(CELLS).keys()].filter((c) => canPlace(zone, c));
    const cells = shuffle(rng, allowed).slice(0, TRAPS_PER_TEAM);
    const types = shuffle(rng, TRAP_TYPES);
    cells.forEach((cell, i) => traps.push({ id: traps.length, owner: team, cell, type: types[i], active: true }));
  });
  return traps;
}

export function newGame(rng: Rng, zones = drawZones(rng), traps?: Trap[]): Committed {
  return { round: 0, teams: zones.map(newTeam), traps: traps ?? autoPlace(rng, zones), oasisArrivals: 0, quizLog: [] };
}

export type SetupError = 'NOT_YOURS' | 'BAD_CELL' | 'OCCUPIED_BY_YOU';

/** 설치 수정: 내 덫 하나를 다른 칸으로. 한 팀은 한 칸에 1개 */
export function moveTrap(traps: Trap[], zones: readonly number[], team: number, trapId: number, to: Cell): Trap[] | SetupError {
  const trap = traps.find((t) => t.id === trapId);
  if (!trap || trap.owner !== team) return 'NOT_YOURS';
  if (!canPlace(zones[team], to)) return 'BAD_CELL';
  if (traps.some((t) => t.owner === team && t.cell === to && t.id !== trapId)) return 'OCCUPIED_BY_YOU';
  return traps.map((t) => (t.id === trapId ? { ...t, cell: to } : t));
}

/** 설치 수정: 내 덫 두 개의 위치 교환(= 종류 바꾸기) */
export function swapTraps(traps: Trap[], team: number, a: number, b: number): Trap[] | SetupError {
  const ta = traps.find((t) => t.id === a), tb = traps.find((t) => t.id === b);
  if (!ta || !tb || ta.owner !== team || tb.owner !== team || a === b) return 'NOT_YOURS';
  return traps.map((t) => (t.id === a ? { ...t, cell: tb.cell } : t.id === b ? { ...t, cell: ta.cell } : t));
}

/** 설치 결과 검증 (서버가 확정 전에 항상 부른다): 구역 배정·총 개수·소유자·id 유일성·활성·칸·종류 */
export function validPlacement(traps: readonly Trap[], zones: readonly number[]): boolean {
  if (zones.length !== TEAMS || [...zones].sort().join() !== [...Array(TEAMS).keys()].join()) return false;
  if (traps.length !== TEAMS * TRAPS_PER_TEAM) return false;
  if (new Set(traps.map((t) => t.id)).size !== traps.length) return false;
  if (traps.some((t) => !Number.isInteger(t.id) || !Number.isInteger(t.owner) || t.owner < 0 || t.owner >= TEAMS || t.active !== true)) return false;
  for (let team = 0; team < TEAMS; team++) {
    const mine = traps.filter((t) => t.owner === team);
    if (mine.length !== TRAPS_PER_TEAM) return false;
    if (new Set(mine.map((t) => t.cell)).size !== mine.length) return false;
    if (mine.some((t) => !canPlace(zones[team], t.cell))) return false;
    if (mine.map((t) => t.type).sort().join() !== [...TRAP_TYPES].sort().join()) return false;
  }
  return true;
}

export { OASIS, ZONES };
