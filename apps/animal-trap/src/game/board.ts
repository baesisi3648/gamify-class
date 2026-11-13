/**
 * board.ts — 16×16 보드의 고정 지형 (DESIGN §4-1). 순수 함수만.
 *
 * 셀 id = r*16 + c (0..255). 좌표는 (r, c), 각 0..15.
 */

export const SIZE = 16;
export const CELLS = SIZE * SIZE;
export const TEAMS = 8;

export type Cell = number;

export const cellOf = (r: number, c: number): Cell => r * SIZE + c;
export const rowOf = (cell: Cell): number => Math.floor(cell / SIZE);
export const colOf = (cell: Cell): number => cell % SIZE;
export const inBoard = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
export const isCell = (v: unknown): v is Cell => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CELLS;

/** 중앙 2×2 오아시스 */
export const OASIS: readonly Cell[] = [cellOf(7, 7), cellOf(7, 8), cellOf(8, 7), cellOf(8, 8)];
const OASIS_SET = new Set(OASIS);
export const isOasis = (cell: Cell): boolean => OASIS_SET.has(cell);

/** 출발 구역 8곳 (2×2) — 좌상단 좌표. 인덱스가 구역 id(0..7) */
export const ZONE_NAMES = ['NW', 'N', 'NE', 'W', 'E', 'SW', 'S', 'SE'] as const;
const ZONE_TOP_LEFT: readonly [number, number][] = [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]];
export const ZONES: readonly (readonly Cell[])[] = ZONE_TOP_LEFT.map(([r, c]) => [cellOf(r, c), cellOf(r, c + 1), cellOf(r + 1, c), cellOf(r + 1, c + 1)]);

const ZONE_OF = new Map<Cell, number>();
ZONES.forEach((cells, z) => cells.forEach((cell) => ZONE_OF.set(cell, z)));
/** 셀이 속한 출발 구역 id, 없으면 -1 */
export const zoneOf = (cell: Cell): number => ZONE_OF.get(cell) ?? -1;

/** 오아시스 중심(7.5, 7.5)에 가장 가까운(유클리드) 칸 = 그 구역의 출발 칸. 같으면 작은 셀 id (결정적) */
const dist2Center = (cell: Cell) => (rowOf(cell) - 7.5) ** 2 + (colOf(cell) - 7.5) ** 2;
export const SPAWN_CELL: readonly Cell[] = ZONES.map((cells) => [...cells].sort((a, b) => dist2Center(a) - dist2Center(b) || a - b)[0]);

/** 8방향 이웃 (보드 밖 제외) */
export const DIRS: readonly [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
export function neighbors(cell: Cell): Cell[] {
  const r = rowOf(cell), c = colOf(cell), out: Cell[] = [];
  for (const [dr, dc] of DIRS) if (inBoard(r + dr, c + dc)) out.push(cellOf(r + dr, c + dc));
  return out;
}
export const isNeighbor = (a: Cell, b: Cell): boolean => a !== b && Math.abs(rowOf(a) - rowOf(b)) <= 1 && Math.abs(colOf(a) - colOf(b)) <= 1;

/** 오아시스까지 최소 이동 횟수(8방향 = 체비셰프 거리) */
export const movesToOasis = (cell: Cell): number => Math.min(...OASIS.map((o) => Math.max(Math.abs(rowOf(o) - rowOf(cell)), Math.abs(colOf(o) - colOf(cell)))));

/** 3×3 정찰 영역(좌상단)이 보드 안에 완전히 들어오는가 */
export const validReconTopLeft = (cell: Cell): boolean => isCell(cell) && rowOf(cell) <= SIZE - 3 && colOf(cell) <= SIZE - 3;
export function reconArea(topLeft: Cell): Cell[] {
  const r = rowOf(topLeft), c = colOf(topLeft), out: Cell[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(cellOf(r + i, c + j));
  return out;
}
