/**
 * views.ts — 화면별 뷰 (DESIGN §6). **허용 필드만 조립한다** — 원본 상태를 복사한 뒤 지우는 방식 금지.
 *
 *   tvView(s, bank, now)             공용 TV: 공개 정보 + (종료 후 교사가 공개한) 덫 지도·복습 문항
 *   teacherView(s, bank, now)        교사: 공개 정보 + PIN·TV 열쇠·조작권 상태 + 종료 후 전체 덫·문항 기록
 *   teamView(s, bank, team, now, c)  팀: 공개 정보 + 자기 덫·센서·정찰·자기 문항·자기 정오
 *
 * 비밀 정책 6-1: 숨은 원본(다른 팀 덫·시드·정답 키·다른 팀 문항·센서·정찰·자격)은 허용된 관찰자 외에는 보내지 않는다.
 * 공개 관측값(위치·이동·문제 풀이 여부·정오·점수 변동·특수효과·오아시스 도착)에서 가능한 추론은 허용(D12).
 */
import { SPAWN_CELL, type Cell } from './board.ts';
import { mainRemaining, phaseRemaining } from './clock.ts';
import type { BankQuestion } from './questions.ts';
import { rankTeams, teamSensor } from './rules.ts';
import type { RoomPhase, RoomState, RoundStep } from './room.ts';
import type { Level, Phase, RoundEvent, TrapType } from './types.ts';

export const ANIMALS = [
  { code: 'A', name: '치타', emoji: '🐆' }, { code: 'B', name: '호랑이', emoji: '🐅' }, { code: 'C', name: '얼룩말', emoji: '🦓' },
  { code: 'D', name: '말', emoji: '🐎' }, { code: 'E', name: '기린', emoji: '🦒' }, { code: 'F', name: '캥거루', emoji: '🦘' },
  { code: 'G', name: '토끼', emoji: '🐇' }, { code: 'H', name: '거북이', emoji: '🐢' }
] as const;

export type PublicEvent =
  | { type: 'move'; team: number; from: Cell; to: Cell } | { type: 'stay'; team: number; reason: 'bound' | 'noMove' }
  | { type: 'safe'; team: number; points: number } | { type: 'zone'; team: number; zone: number; points: number }
  | { type: 'quiz'; team: number; correct: boolean; timeout: boolean; points: number }
  | { type: 'trapsRemoved'; cell: Cell; count: number } | { type: 'effect'; team: number; effect: 'return' | 'bind' | 'confuse' }
  | { type: 'oasis'; team: number; rank: number; points: number };

export interface PublicTeam {
  team: number; animal: { code: string; name: string; emoji: string };
  zone: number | null; pos: Cell | null; score: number; rank: number; oasisRank: number | null;
  status: { setupConfirmed: boolean; moved: boolean; quiz: 'none' | 'pending' | 'done'; boundLeft: number; confusedLeft: number };
  /** 종료 후에만: 공개 사건(정오·상대 구역·오아시스)의 누적 요약 */
  summary: null | { correct: number; wrong: number; zones: number; oasisRank: number | null };
}
export interface RevealedQuestion { id: string; level: Level; text: string; choices: string[]; answer: number; explanation: string }
export interface FullTrap { cell: Cell; owner: number; type: TrapType; active: boolean }

export interface PublicView {
  code: string; title: string; phase: RoomPhase; step: RoundStep | null; round: number; stateVersion: number;
  serverNow: number; paused: boolean; mainRemainingMs: number; phaseRemainingMs: number | null;
  config: { durationMs: number; moveMs: number; quizMs: number; setupMs: number; autoNext: boolean };
  teams: PublicTeam[]; events: PublicEvent[]; oasisArrivals: number; endReason: 'time' | 'manual' | null;
  trapMap: FullTrap[] | null;              // 종료 후 교사가 '덫 지도 공개'를 눌렀을 때만
  reviewQuestions: RevealedQuestion[];     // 복습에서 교사가 공개한 문항만
  /** 종료 후 TV 에 띄울 것(교사 선택): 순위 / 덫 지도 / 공개한 문항 하나 */
  reviewDisplay: { mode: 'ranking' | 'map' | 'question'; questionId: string | null };
}
export interface TvView extends PublicView { role: 'tv' }
export interface TeacherView extends PublicView {
  role: 'teacher';
  pins: string[]; tvKey: string;
  access: { hasController: boolean; pinLocked: boolean }[];
  /** 종료 후(FINISHED·REVIEW)에만: 전체 덫·사용 문항(정답 포함)·문항 기록 */
  final: null | { traps: FullTrap[]; questions: RevealedQuestion[]; quizLog: { round: number; team: number; questionId: string; level: Level; correct: boolean; timeout: boolean }[]; cancelled: { round: number; team: number; questionId: string }[] };
}
export interface TeamView extends PublicView {
  role: 'team';
  me: {
    team: number; controller: boolean;
    traps: { id: number; cell: Cell; type: TrapType; active: boolean }[];
    sensor: number | null;
    reconAvailable: boolean;
    recon: null | { topLeft: Cell; cells: { cell: Cell; count: number; live: number }[] };
    visited: Cell[]; opponentZones: number[];
    question: null | { level: Level; text: string; choices: string[] };
    answer: null | { choice: number; correct: boolean };
  };
}

/** 지금 화면에 보이는 라운드 번호 */
export function displayRound(s: RoomState): number {
  const done = s.committed?.round ?? 0;
  if (s.phase !== 'RUNNING') return done;
  return s.step === 'MOVE_OPEN' ? done + 1 : s.step === 'QUESTION_OPEN' ? (s.pending?.round ?? done + 1) : done;
}

function publicEvent(e: RoundEvent): PublicEvent {
  switch (e.type) {
    case 'move': return { type: 'move', team: e.team, from: e.from, to: e.to };
    case 'stay': return { type: 'stay', team: e.team, reason: e.reason };
    case 'safe': return { type: 'safe', team: e.team, points: e.points };
    case 'zone': return { type: 'zone', team: e.team, zone: e.zone, points: e.points };
    case 'quiz': return { type: 'quiz', team: e.team, correct: e.correct, timeout: e.timeout, points: e.points }; // 난이도는 비공개(6-1)
    case 'trapsRemoved': return { type: 'trapsRemoved', cell: e.cell, count: e.count };
    case 'effect': return { type: 'effect', team: e.team, effect: e.effect };
    case 'oasis': return { type: 'oasis', team: e.team, rank: e.rank, points: e.points };
  }
}

const revealQ = (q: BankQuestion): RevealedQuestion => ({ id: q.id, level: q.level, text: q.text, choices: [...q.choices], answer: q.answer, explanation: q.explanation });
const fullTraps = (s: RoomState): FullTrap[] => (s.committed?.traps ?? s.setupTraps ?? []).map((t) => ({ cell: t.cell, owner: t.owner, type: t.type, active: t.active }));
const finished = (s: RoomState) => s.phase === 'FINISHED' || s.phase === 'REVIEW';

function publicView(s: RoomState, bank: readonly BankQuestion[], now: number): PublicView {
  const c = s.committed, R = displayRound(s);
  // 시작 전에는 추첨된 출발 칸(공개 정보)에 서 있다
  const positions: (Cell | null)[] = c ? c.teams.map((t, i) => (s.pending ? s.pending.landings[i].to : t.pos)) : s.zones ? s.zones.map((z) => SPAWN_CELL[z]) : Array(8).fill(null);
  const scores = c ? c.teams.map((t) => t.score) : Array(8).fill(0);
  const ranks = rankTeams(scores);
  const teams: PublicTeam[] = ANIMALS.map((animal, team) => {
    const t = c?.teams[team];
    const l = s.pending?.landings[team];
    return {
      team, animal: { ...animal }, zone: s.zones ? s.zones[team] : null, pos: positions[team], score: scores[team], rank: ranks[team],
      oasisRank: t?.oasisRank ?? null,
      status: {
        setupConfirmed: s.confirmed[team],
        moved: s.phase === 'RUNNING' && s.step === 'MOVE_OPEN' && s.moves[team] !== null,
        quiz: s.step === 'QUESTION_OPEN' && l && l.questionId !== null ? (s.answers[team] !== null ? 'done' : 'pending') : 'none',
        boundLeft: t ? t.bindRounds.filter((r) => r >= Math.max(R, (c?.round ?? 0) + 1)).length : 0,
        confusedLeft: t ? t.confuseRounds.filter((r) => r >= R).length : 0
      },
      summary: finished(s) && c && t ? {
        correct: c.quizLog.filter((q) => q.team === team && q.correct).length,
        wrong: c.quizLog.filter((q) => q.team === team && !q.correct).length,
        zones: t.opponentZones.length, oasisRank: t.oasisRank
      } : null
    };
  });
  return {
    code: s.code, title: s.title, phase: s.phase, step: s.step, round: R, stateVersion: s.stateVersion,
    serverNow: now, paused: s.clock.paused, mainRemainingMs: mainRemaining(s.clock, now), phaseRemainingMs: phaseRemaining(s.clock, now),
    config: { durationMs: s.config.durationMs, moveMs: s.config.moveMs, quizMs: s.config.quizMs, setupMs: s.config.setupMs, autoNext: s.config.autoNext },
    teams, events: s.lastEvents.map(publicEvent), oasisArrivals: c?.oasisArrivals ?? 0, endReason: s.endReason,
    trapMap: finished(s) && s.review.trapsRevealed ? fullTraps(s) : null,
    reviewQuestions: s.review.revealed.map((id) => bank.find((q) => q.id === id)).filter((q): q is BankQuestion => !!q).map(revealQ),
    reviewDisplay: finished(s) ? { mode: s.review.display, questionId: s.review.display === 'question' ? s.review.focus : null } : { mode: 'ranking', questionId: null }
  };
}

export function tvView(s: RoomState, bank: readonly BankQuestion[], now: number): TvView {
  return { role: 'tv', ...publicView(s, bank, now) };
}

export function teacherView(s: RoomState, bank: readonly BankQuestion[], now: number): TeacherView {
  const used = finished(s) ? [...new Set([...(s.committed?.quizLog ?? []).map((q) => q.questionId), ...s.cancelled.map((q) => q.questionId)])] : [];
  return {
    role: 'teacher', ...publicView(s, bank, now),
    pins: [...s.creds.pins], tvKey: s.creds.tvKey,
    access: s.creds.controlToken.map((tok, i) => ({ hasController: tok !== null, pinLocked: s.creds.pinFails[i].until > now })),
    final: finished(s) ? {
      traps: fullTraps(s),
      questions: used.map((id) => bank.find((q) => q.id === id)).filter((q): q is BankQuestion => !!q).map(revealQ),
      quizLog: (s.committed?.quizLog ?? []).map((q) => ({ round: q.round, team: q.team, questionId: q.questionId, level: q.level, correct: q.correct, timeout: q.timeout })),
      cancelled: s.cancelled.map((q) => ({ round: q.round, team: q.team, questionId: q.questionId }))
    } : null
  };
}

function sensorPhase(s: RoomState): Phase | null {
  if (!s.committed) return null;
  if (s.phase === 'RUNNING') return s.step === 'MOVE_OPEN' ? 'move' : s.step === 'QUESTION_OPEN' ? 'landed' : 'summary';
  return 'summary';
}

export function teamView(s: RoomState, bank: readonly BankQuestion[], team: number, now: number, ctx: { controller: boolean }): TeamView {
  const c = s.committed, t = c?.teams[team];
  const ownSource = c ? c.traps : s.setupTraps ?? [];
  const traps = ownSource.filter((x) => x.owner === team).map((x) => ({ id: x.id, cell: x.cell, type: x.type, active: x.active }));
  const phase = sensorPhase(s);
  const sensor = c && phase ? teamSensor(c, phase === 'landed' ? s.pending : null, team, phase) : null;
  const active = new Set((c?.traps ?? []).filter((x) => x.active).map((x) => x.id));
  const recon = t?.recon ? { topLeft: t.recon.topLeft, cells: t.recon.cells.map((x) => ({ cell: x.cell, count: x.count, live: x.trapIds.filter((id) => active.has(id)).length })) } : null;
  const l = s.pending?.landings[team];
  const q = s.step === 'QUESTION_OPEN' && l && l.questionId !== null ? bank.find((b) => b.id === l.questionId) : undefined;
  const choice = s.step === 'QUESTION_OPEN' ? s.answers[team] : null;
  return {
    role: 'team', ...publicView(s, bank, now),
    me: {
      team, controller: ctx.controller, traps, sensor,
      reconAvailable: t?.reconAvailable ?? false, recon,
      visited: t ? [...t.visited] : [], opponentZones: t ? [...t.opponentZones] : [],
      question: q ? { level: q.level, text: q.text, choices: [...q.choices] } : null,
      answer: q && choice !== null ? { choice, correct: q.answer === choice } : null
    }
  };
}
