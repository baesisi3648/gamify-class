/**
 * simulate.ts — 밸런스 시뮬레이션 (DESIGN §10-5). `npm run simulate [-- 판수]`
 *
 * ■ 정보 제한: 봇의 결정 함수는 TeamView(팀 화면에 허용된 정보)만 받는다 —
 *   자기 덫, 자기 정찰 결과(9칸 전부: 빈 칸은 0), 자기 센서 값, 자기 위치·방문 기록.
 * ■ 대응 비교: 같은 판(같은 출발 구역·덫·정답 난수)을 정책 배정만 4가지로 돌려 4번 플레이한다.
 *   판 단위로 정책별 평균을 내고, 판들 사이의 분산으로 95% 신뢰구간을 계산한다.
 * ■ 난수 흐름 분리: 판 구성 / 팀별 결정 / 시간 / 팀별 정답 — 한 정책의 난수 소비가 다른 조건을 바꾸지 않게.
 * ■ 확정 규칙(+1, 30/20/15)은 고정. 난이도 기준(LEVEL_RULE)만 비교한다.
 */
import { CELLS, isOasis, movesToOasis, neighbors, reconArea, zoneOf, type Cell } from '../src/game/board.ts';
import { makeRng, randInt, shuffle } from '../src/game/rng.ts';
import { autoPlace, canPlace, drawZones, newGame, TRAP_TYPES } from '../src/game/setup.ts';
import { applyRecon, correctPoints, isBound, land, rankTeams, resolve, teamSensor, validMove, wrongPoints } from '../src/game/rules.ts';
import type { Committed, Level, Trap } from '../src/game/types.ts';

type R = () => number;
const GAMES = Number(process.argv[2] ?? 1000);
const DURATION = 15 * 60;
const ACC: Record<Level, number> = { 쉬움: 0.85, 보통: 0.65, 어려움: 0.45 };
type Policy = 'random' | 'safe' | 'bold' | 'rush';
const POLICIES: Policy[] = ['random', 'safe', 'bold', 'rush'];
const LABEL: Record<Policy, string> = { random: '무작위      ', safe: '덫 회피     ', bold: '덫 감수     ', rush: '오아시스 직행' };

type LevelRule = (n: number) => Level;
const RULES: Record<string, LevelRule> = {
  '기획서(1~2 쉬움 / 3~4 보통 / 5+ 어려움)': (n) => (n <= 2 ? '쉬움' : n <= 4 ? '보통' : '어려움'),
  '대안(1 쉬움 / 2 보통 / 3+ 어려움)': (n) => (n <= 1 ? '쉬움' : n === 2 ? '보통' : '어려움')
};

// ── 팀 화면 정보 ──────────────────────────────────────────────
interface TeamView { pos: Cell; options: Cell[]; visited: Set<Cell>; zone: number; opponentZones: Set<number>; oasisDone: boolean; own: Map<Cell, number>; recon: Map<Cell, number>; sensor: number | null }
function teamView(g: Committed, team: number): TeamView {
  const t = g.teams[team];
  const own = new Map<Cell, number>();
  for (const x of g.traps) if (x.active && x.owner === team) own.set(x.cell, 1);
  const recon = new Map<Cell, number>();
  if (t.recon) {
    for (const cell of reconArea(t.recon.topLeft)) recon.set(cell, 0); // 정찰로 확인한 빈 칸도 기억
    const byId = new Map(g.traps.map((x) => [x.id, x]));
    for (const c of t.recon.cells) recon.set(c.cell, c.trapIds.filter((id) => byId.get(id)?.active).length); // '제거됨' 반영(화면과 동일)
  }
  return { pos: t.pos, options: neighbors(t.pos).filter((c) => validMove(g, team, c)), visited: new Set(t.visited), zone: t.zone,
    opponentZones: new Set(t.opponentZones), oasisDone: t.oasisRound !== null, own, recon, sensor: teamSensor(g, null, team, 'move') };
}

function estimate(v: TeamView, c: Cell): number {
  if (isOasis(c)) return 0;
  const own = v.own.get(c) ?? 0;
  if (v.recon.has(c)) return own + (v.recon.get(c) as number);
  const prior = 104 / 252;
  if (v.sensor === null) return own + prior;
  const around = neighbors(v.pos);
  const knownAround = around.reduce((s, x) => s + (v.own.get(x) ?? 0) + (v.recon.get(x) ?? 0), 0);
  const unknown = around.filter((x) => !v.recon.has(x)).length || 1;
  return own + Math.max(0, v.sensor - knownAround) / unknown;
}

function value(v: TeamView, c: Cell, mode: 'avoid' | 'ev', rule: LevelRule): number {
  let gain = 0;
  if (isOasis(c)) gain += v.oasisDone ? 0 : 25;
  const z = zoneOf(c);
  if (z !== -1 && z !== v.zone && !v.opponentZones.has(z)) gain += 10;
  const n = estimate(v, c);
  if (!isOasis(c) && (z === -1 || z === v.zone) && !v.visited.has(c)) gain += Math.max(0, 1 - n);
  const nn = Math.max(1, Math.round(n)), lvl = rule(nn);
  const quizEV = Math.min(1, n) * (ACC[lvl] * correctPoints(nn) + (1 - ACC[lvl]) * wrongPoints(nn));
  gain += mode === 'avoid' ? -Math.min(1, n) * 4 : quizEV;
  if (!v.oasisDone) gain -= movesToOasis(c) * 0.6;
  return gain;
}

function decide(policy: Policy, v: TeamView, rng: R, rule: LevelRule): Cell | null {
  if (!v.options.length) return null;
  if (policy === 'random') return v.options[randInt(rng, v.options.length)];
  if (policy === 'rush' && !v.oasisDone) {
    const best = Math.min(...v.options.map(movesToOasis));
    const pool = v.options.filter((c) => movesToOasis(c) === best);
    return pool[randInt(rng, pool.length)];
  }
  const scored = shuffle(rng, v.options).map((c) => ({ c, s: value(v, c, policy === 'safe' ? 'avoid' : 'ev', rule) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].c;
}

function strategicPlace(rng: R, zones: number[]): Trap[] {
  const traps: Trap[] = [];
  zones.forEach((zone, team) => {
    const allowed = [...Array(CELLS).keys()].filter((c) => canPlace(zone, c));
    const weighted = allowed.flatMap((c) => { const d = movesToOasis(c); return Array(d >= 1 && d <= 4 ? 6 : 1).fill(c); });
    const chosen = new Set<Cell>();
    while (chosen.size < TRAP_TYPES.length) chosen.add(weighted[randInt(rng, weighted.length)]);
    const types = shuffle(rng, TRAP_TYPES);
    [...chosen].forEach((cell, i) => traps.push({ id: traps.length, owner: team, cell, type: types[i], active: true }));
  });
  return traps;
}

interface GameResult { rounds: number; quizzes: number[]; levels: Record<Level, number>; nDist: number[]; oasis: (number | null)[]; scores: number[]; ranks: number[]; policies: Policy[] }

function playOnce(seed: number, scenario: 'uniform' | 'strategic', rotation: number, rule: LevelRule): GameResult {
  const board = makeRng(seed);
  const zones = drawZones(board);
  const traps = scenario === 'uniform' ? autoPlace(board, zones) : strategicPlace(board, zones);
  let g = newGame(board, zones, traps);
  const policies = [...Array(8).keys()].map((t) => POLICIES[(t + rotation) % 4]);
  const decideRng = [...Array(8).keys()].map((t) => makeRng(seed * 31 + t + 1000 * rotation));
  const answerRng = [...Array(8).keys()].map((t) => makeRng(seed * 37 + t + 7));
  const reconRng = makeRng(seed * 41 + 3), timeRng = makeRng(seed * 43 + 5);
  const U = (a: number, b: number) => a + timeRng() * (b - a);
  const quizzes = Array(8).fill(0), levels: Record<Level, number> = { 쉬움: 0, 보통: 0, 어려움: 0 }, nDist = Array(8).fill(0);
  let clock = 0;
  while (true) {
    const movable = g.teams.filter((t) => !isBound(t, g.round + 1)).length;
    const moveEnd = clock + Math.max(4, ...Array.from({ length: movable }, () => U(8, 20)));
    if (moveEnd >= DURATION) break; // MOVE_OPEN 중 만료 → 그 라운드 폐기 (D13)
    const moves = g.teams.map((_, t) => decide(policies[t], teamView(g, t), decideRng[t], rule));
    const pending = land(g, moves, () => 'q');
    for (const l of pending.landings) if (l.questionId) l.level = rule(l.snapshot.length); // 난이도 기준 비교
    clock = moveEnd + 4;
    const quizTeams = pending.landings.filter((l) => l.questionId);
    if (quizTeams.length) clock += Math.max(...quizTeams.map(() => U(12, 45)));
    const correct = pending.landings.map((l, t) => (l.level ? answerRng[t]() < ACC[l.level] : null));
    for (const l of quizTeams) { quizzes[l.team]++; levels[l.level as Level]++; nDist[Math.min(7, l.snapshot.length)]++; }
    g = resolve(g, pending, correct).committed;
    g.teams.forEach((t, team) => { if (t.reconAvailable) { const r = applyRecon(g, team, randInt(reconRng, 14) * 16 + randInt(reconRng, 14)); if (typeof r !== 'string') g = r; } });
    clock += 6;
    if (clock >= DURATION) break;
  }
  const scores = g.teams.map((t) => t.score);
  return { rounds: g.round, quizzes, levels, nDist, oasis: g.teams.map((t) => t.oasisRound), scores, ranks: rankTeams(scores), policies };
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = (x: number) => x.toFixed(1);
const ci = (a: number[]) => 1.96 * sd(a) / Math.sqrt(a.length);

for (const [ruleName, rule] of Object.entries(RULES)) {
  for (const scenario of ['uniform', 'strategic'] as const) {
    const rounds: number[] = [], quizPerTeam: number[] = [], levels: Record<Level, number> = { 쉬움: 0, 보통: 0, 어려움: 0 }, nDist = Array(8).fill(0);
    const reached: number[] = [], oasisRound: number[] = [];
    const perBoard: Record<Policy, number[]> = { random: [], safe: [], bold: [], rush: [] };
    const winBoard: Record<Policy, number[]> = { random: [], safe: [], bold: [], rush: [] };
    const diffBoldSafe: number[] = [];
    for (let i = 0; i < GAMES; i++) {
      const seed = 1000 + i, sums: Record<Policy, number[]> = { random: [], safe: [], bold: [], rush: [] }, wins: Record<Policy, number> = { random: 0, safe: 0, bold: 0, rush: 0 };
      for (let rot = 0; rot < 4; rot++) {
        const r = playOnce(seed, scenario, rot, rule);
        rounds.push(r.rounds); r.quizzes.forEach((q) => quizPerTeam.push(q));
        (Object.keys(levels) as Level[]).forEach((k) => (levels[k] += r.levels[k])); r.nDist.forEach((c, n) => (nDist[n] += c));
        reached.push(r.oasis.filter((x) => x !== null).length / 8); r.oasis.forEach((x) => x !== null && oasisRound.push(x));
        const tops = r.ranks.filter((x) => x === 1).length;
        r.policies.forEach((p, t) => { sums[p].push(r.scores[t]); if (r.ranks[t] === 1) wins[p] += 1 / tops; });
      }
      for (const p of POLICIES) { perBoard[p].push(mean(sums[p])); winBoard[p].push(wins[p] / 4); }
      diffBoldSafe.push(mean(sums.bold) - mean(sums.safe));
    }
    const totalQ = levels.쉬움 + levels.보통 + levels.어려움, plays = GAMES * 4;
    console.log(`\n=== 난이도 ${ruleName} · ${scenario === 'uniform' ? '덫 균등 자동 배치' : '오아시스 길목 집중 배치'} (${GAMES}판 × 정책 배정 4가지) ===`);
    console.log(`라운드 수(15분): 평균 ${f1(mean(rounds))} (10~90%: ${pct(rounds, 0.1)}~${pct(rounds, 0.9)})`);
    console.log(`팀당 문제 수: 평균 ${f1(mean(quizPerTeam))} (10~90%: ${pct(quizPerTeam, 0.1)}~${pct(quizPerTeam, 0.9)}), 판당 ${f1(totalQ / plays)}문항`);
    console.log(`난이도: 쉬움 ${f1(100 * levels.쉬움 / totalQ)}% · 보통 ${f1(100 * levels.보통 / totalQ)}% · 어려움 ${f1(100 * levels.어려움 / totalQ)}%  (판당 보통 ${f1(levels.보통 / plays)} · 어려움 ${f1(levels.어려움 / plays)}문항)`);
    console.log(`문제 칸 덫 수: ${nDist.map((c, n) => (c ? `n=${n} ${f1(100 * c / totalQ)}%` : '')).filter(Boolean).join(' · ')}`);
    console.log(`오아시스 도착: 팀의 ${f1(100 * mean(reached))}%, 도착 라운드 평균 ${f1(mean(oasisRound))}`);
    console.log('정책별 점수 (같은 판 대응 비교, 평균 ± 95% CI · 우승 비율):');
    for (const p of POLICIES) console.log(`  ${LABEL[p]}: ${f1(mean(perBoard[p]))} ± ${f1(ci(perBoard[p]))}점 · 우승 ${f1(100 * mean(winBoard[p]))}%`);
    console.log(`  덫 감수 − 덫 회피 차이: ${f1(mean(diffBoldSafe))} ± ${f1(ci(diffBoldSafe))}점 (양수면 문제를 푸는 쪽이 유리)`);
  }
}
