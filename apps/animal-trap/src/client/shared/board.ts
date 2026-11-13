/**
 * board.ts — 16×16 보드를 Canvas 2D 로 그린다 (팀 폰·TV 공용). 화면은 받은 뷰를 그릴 뿐 규칙을 판단하지 않는다.
 *
 * 레이어: 풀밭 바둑판 → 출발 구역·오아시스 → 방문 흔적 → 정찰 칸 → 공개된 덫 지도 → 자기 덫(반짝임)
 *         → 이동 후보·선택 → 동물(겹치면 나눠 배치) → 센서 숫자
 */
export const SIZE = 16;
export const OASIS = [7 * 16 + 7, 7 * 16 + 8, 8 * 16 + 7, 8 * 16 + 8];
const ZONE_TL: [number, number][] = [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]];
export const ZONES = ZONE_TL.map(([r, c]) => [r * 16 + c, r * 16 + c + 1, (r + 1) * 16 + c, (r + 1) * 16 + c + 1]);
export const zoneOf = (cell: number) => ZONES.findIndex((z) => z.includes(cell));
export const TEAM_COLORS = ['#e4572e', '#f3a712', '#2e86ab', '#8e44ad', '#16a085', '#d35400', '#c2185b', '#5d6d7e'];

export const rowOf = (c: number) => Math.floor(c / SIZE), colOf = (c: number) => c % SIZE;
export function neighbors(cell: number): number[] {
  const r = rowOf(cell), c = colOf(cell), out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const a = r + dr, b = c + dc;
    if (a >= 0 && a < SIZE && b >= 0 && b < SIZE) out.push(a * SIZE + b);
  }
  return out;
}

export interface BoardModel {
  animals: { team: number; emoji: string; pos: number | null; highlight?: boolean }[];
  zones: (number | null)[];          // 팀 → 구역
  myTeam?: number;
  myTraps?: { id: number; cell: number; type: string; active: boolean }[];
  selectedTrap?: number | null;
  allowedCells?: Set<number>;        // 덫을 옮길 수 있는 칸
  candidates?: number[];             // 이동 후보
  pick?: number | null;              // 고른 칸
  visited?: number[];
  recon?: { cells: { cell: number; count: number; live: number }[]; topLeft: number } | null;
  reconPreview?: number | null;      // 3×3 좌상단
  trapMap?: { cell: number; owner: number; type: string; active: boolean }[] | null;
  sensor?: { cell: number; value: number | null } | null;
  /** 보이는 범위 (확대 시). 없으면 전체 */
  view?: { r0: number; c0: number; n: number };
}

export const TRAP_ICON: Record<string, string> = { normal: '🪤', return: '🌀', bind: '⛓️', confuse: '🌫️' };
export const TRAP_NAME: Record<string, string> = { normal: '일반 덫', return: '귀환 덫', bind: '속박 덫', confuse: '혼란 덫' };

export function draw(canvas: HTMLCanvasElement, m: BoardModel, t = performance.now()) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const css = canvas.clientWidth;
  if (canvas.width !== Math.round(css * dpr)) { canvas.width = Math.round(css * dpr); canvas.height = Math.round(css * dpr); }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const v = m.view ?? { r0: 0, c0: 0, n: SIZE };
  const cs = css / v.n;
  const xy = (cell: number) => [(colOf(cell) - v.c0) * cs, (rowOf(cell) - v.r0) * cs] as const;
  const visible = (cell: number) => rowOf(cell) >= v.r0 && rowOf(cell) < v.r0 + v.n && colOf(cell) >= v.c0 && colOf(cell) < v.c0 + v.n;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(t / 380);

  g.clearRect(0, 0, css, css);
  // 풀밭 바둑판
  for (let r = v.r0; r < v.r0 + v.n; r++) for (let c = v.c0; c < v.c0 + v.n; c++) {
    g.fillStyle = (r + c) % 2 ? '#a8d68a' : '#9ccf7c';
    g.fillRect((c - v.c0) * cs, (r - v.r0) * cs, cs + 0.5, cs + 0.5);
  }
  // 출발 구역 (팀 색 옅게, 구역 경계)
  m.zones.forEach((z, team) => {
    if (z === null) return;
    for (const cell of ZONES[z]) if (visible(cell)) { const [x, y] = xy(cell); g.fillStyle = TEAM_COLORS[team] + '40'; g.fillRect(x, y, cs, cs); }
  });
  ZONES.forEach((z) => { const [x, y] = xy(z[0]); g.strokeStyle = 'rgba(40,70,30,.55)'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.strokeRect(x + 1, y + 1, cs * 2 - 2, cs * 2 - 2); g.setLineDash([]); });
  // 오아시스
  { const [x, y] = xy(OASIS[0]); const grad = g.createRadialGradient(x + cs, y + cs, cs * 0.2, x + cs, y + cs, cs * 1.3);
    grad.addColorStop(0, '#7fe3f0'); grad.addColorStop(1, '#2aa3a0'); g.fillStyle = grad; g.beginPath(); g.roundRect(x + 1, y + 1, cs * 2 - 2, cs * 2 - 2, cs * 0.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `${cs * 0.9}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🌴', x + cs, y + cs); }
  // 격자선
  g.strokeStyle = 'rgba(30,60,25,.18)'; g.lineWidth = 1;
  for (let i = 0; i <= v.n; i++) { g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, css); g.moveTo(0, i * cs); g.lineTo(css, i * cs); g.stroke(); }
  // 방문 흔적
  for (const cell of m.visited ?? []) if (visible(cell)) { const [x, y] = xy(cell); g.fillStyle = 'rgba(255,255,230,.28)'; g.fillRect(x + 2, y + 2, cs - 4, cs - 4); }
  // 정찰 결과
  if (m.recon) {
    const [x, y] = xy(m.recon.topLeft); g.strokeStyle = '#1b5e8a'; g.lineWidth = 2.5; g.strokeRect(x + 1, y + 1, cs * 3 - 2, cs * 3 - 2);
    for (const c of m.recon.cells) if (visible(c.cell)) {
      const [cx, cy] = xy(c.cell);
      g.fillStyle = c.live ? 'rgba(170,30,40,.75)' : 'rgba(80,80,80,.35)';
      g.beginPath(); g.arc(cx + cs / 2, cy + cs / 2, cs * 0.34, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `bold ${cs * 0.42}px system-ui`; g.fillText(c.live ? String(c.live) : '×', cx + cs / 2, cy + cs / 2 + 1);
    }
  }
  if (m.reconPreview != null) { const [x, y] = xy(m.reconPreview); g.fillStyle = 'rgba(27,94,138,.18)'; g.fillRect(x, y, cs * 3, cs * 3); g.strokeStyle = '#1b5e8a'; g.setLineDash([5, 4]); g.lineWidth = 2.5; g.strokeRect(x + 1, y + 1, cs * 3 - 2, cs * 3 - 2); g.setLineDash([]); }
  // 공개된 덫 지도(종료 후)
  for (const tr of m.trapMap ?? []) if (visible(tr.cell)) {
    const [x, y] = xy(tr.cell); g.globalAlpha = tr.active ? 0.95 : 0.35;
    g.fillStyle = TEAM_COLORS[tr.owner]; g.beginPath(); g.arc(x + cs * 0.3, y + cs * 0.3, cs * 0.16, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  }
  // 자기 덫 (반짝임)
  for (const tr of m.myTraps ?? []) if (tr.active && visible(tr.cell)) {
    const [x, y] = xy(tr.cell);
    g.fillStyle = `rgba(255,236,120,${0.35 + 0.4 * pulse})`; g.beginPath(); g.arc(x + cs / 2, y + cs / 2, cs * 0.46, 0, Math.PI * 2); g.fill();
    if (m.selectedTrap === tr.id) { g.strokeStyle = '#1b3a8a'; g.lineWidth = 3; g.stroke(); }
    g.font = `${cs * 0.55}px system-ui`; g.fillStyle = '#5a3d00'; g.fillText(TRAP_ICON[tr.type] ?? '🪤', x + cs / 2, y + cs / 2 + 1);
  }
  // 옮길 수 있는 칸
  if (m.allowedCells && m.selectedTrap != null) for (const cell of m.allowedCells) if (visible(cell)) { const [x, y] = xy(cell); g.fillStyle = 'rgba(27,58,138,.10)'; g.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
  // 이동 후보
  for (const cell of m.candidates ?? []) if (visible(cell)) {
    const [x, y] = xy(cell); const chosen = m.pick === cell;
    g.fillStyle = chosen ? 'rgba(255,255,255,.85)' : `rgba(255,255,255,${0.25 + 0.25 * pulse})`;
    g.beginPath(); g.roundRect(x + 2, y + 2, cs - 4, cs - 4, cs * 0.2); g.fill();
    g.strokeStyle = chosen ? '#1b3a8a' : 'rgba(27,58,138,.6)'; g.lineWidth = chosen ? 3 : 1.5; g.stroke();
  }
  // 동물 (같은 칸이면 나눠 앉힌다)
  const byCell = new Map<number, typeof m.animals>();
  for (const a of m.animals) if (a.pos !== null && visible(a.pos)) byCell.set(a.pos, [...(byCell.get(a.pos) ?? []), a]);
  for (const [cell, list] of byCell) {
    const [x, y] = xy(cell);
    list.forEach((a, i) => {
      // 1마리: 가운데 / 2~4마리: 2×2 / 5마리 이상: 3×3 칸 나눠 앉히기
      const n = list.length, grid = n === 1 ? 1 : n <= 4 ? 2 : 3, size = cs * (n === 1 ? 0.78 : grid === 2 ? 0.48 : 0.34);
      const ox = cs * ((i % grid) + 0.5) / grid, oy = cs * (Math.floor(i / grid) + 0.5) / grid;
      if (a.highlight) { g.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * pulse})`; g.beginPath(); g.arc(x + ox, y + oy, size * 0.62, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = TEAM_COLORS[a.team]; g.lineWidth = n === 1 ? 3 : 2; g.beginPath(); g.arc(x + ox, y + oy, size * 0.55, 0, Math.PI * 2); g.stroke();
      g.font = `${size}px system-ui`; g.fillText(a.emoji, x + ox, y + oy + 1);
    });
  }
  // 센서 숫자 (내 위치 위)
  if (m.sensor && visible(m.sensor.cell)) {
    const [x, y] = xy(m.sensor.cell); const label = m.sensor.value === null ? '?' : String(m.sensor.value);
    g.fillStyle = m.sensor.value === null ? '#6b6b6b' : m.sensor.value === 0 ? '#2e7d32' : '#c62828';
    g.beginPath(); g.arc(x + cs * 0.92, y + cs * 0.08, cs * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `bold ${cs * 0.36}px system-ui`; g.fillText(label, x + cs * 0.92, y + cs * 0.09);
  }
}

/** 화면 좌표 → 셀 */
export function cellAt(canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }, view?: BoardModel['view']): number | null {
  const rect = canvas.getBoundingClientRect();
  const v = view ?? { r0: 0, c0: 0, n: SIZE };
  const cs = rect.width / v.n;
  const c = Math.floor((e.clientX - rect.left) / cs) + v.c0, r = Math.floor((e.clientY - rect.top) / cs) + v.r0;
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : null;
}
