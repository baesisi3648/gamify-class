/**
 * commands.ts — 네트워크에서 온 명령을 검증해 Command 로 바꾼다. 모르는 종류·잘못된 타입은 null.
 * room.handle 은 여기를 통과한 명령만 받는다(형식은 믿고, 상태 규칙만 검사).
 */
import { isCell } from './board.ts';
import type { Command, Target } from './room.ts';

export type AccessCommand =
  | { type: 'releaseControl'; team: number } | { type: 'unlockPin'; team: number } | { type: 'reissuePin'; team: number } | { type: 'reissueTv' };

const o = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const int = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const roundNo = (v: unknown): v is number => int(v, 1, 10_000);
const team = (v: unknown): v is number => int(v, 0, 7);

function target(v: unknown): Target | null {
  const t = o(v); if (!t) return null;
  if (t.phase === 'TRAP_SETUP') return { phase: 'TRAP_SETUP' };
  if (t.phase === 'RUNNING' && (t.step === 'MOVE_OPEN' || t.step === 'QUESTION_OPEN') && roundNo(t.round)) return { phase: 'RUNNING', step: t.step, round: t.round };
  return null;
}

export function parseTeacherCommand(raw: unknown): Command | AccessCommand | null {
  const c = o(raw); if (!c) return null;
  switch (c.type) {
    case 'draw': case 'startSetup': case 'startGame': case 'pause': case 'resume': case 'finish': case 'review': case 'revealTraps': case 'showRanking':
      return { type: c.type };
    case 'next': return roundNo(c.round) ? { type: 'next', round: c.round } : null;
    case 'closePhase': { const t = target(c.target); return t ? { type: 'closePhase', target: t } : null; }
    case 'revealQuestion': return typeof c.questionId === 'string' && c.questionId.length > 0 && c.questionId.length <= 80 ? { type: 'revealQuestion', questionId: c.questionId } : null;
    case 'releaseControl': case 'unlockPin': case 'reissuePin': return team(c.team) ? { type: c.type, team: c.team } : null;
    case 'reissueTv': return { type: 'reissueTv' };
  }
  return null;
}

export function parseTeamCommand(raw: unknown): Command | null {
  const c = o(raw); if (!c) return null;
  switch (c.type) {
    case 'trapMove': return int(c.trapId, 0, 10_000) && isCell(c.to) ? { type: 'trapMove', trapId: c.trapId, to: c.to } : null;
    case 'trapSwap': return int(c.a, 0, 10_000) && int(c.b, 0, 10_000) ? { type: 'trapSwap', a: c.a, b: c.b } : null;
    case 'trapConfirm': return { type: 'trapConfirm' };
    case 'move': return roundNo(c.round) && isCell(c.to) ? { type: 'move', round: c.round, to: c.to } : null;
    case 'answer': return roundNo(c.round) && int(c.choice, 1, 4) ? { type: 'answer', round: c.round, choice: c.choice } : null;
    case 'recon': return isCell(c.topLeft) ? { type: 'recon', topLeft: c.topLeft } : null;
  }
  return null;
}

export const isAccessCommand = (c: Command | AccessCommand): c is AccessCommand =>
  c.type === 'releaseControl' || c.type === 'unlockPin' || c.type === 'reissuePin' || c.type === 'reissueTv';
