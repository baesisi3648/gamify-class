/**
 * clock.ts — 메인 타이머·단계 타이머 (DESIGN §5-3). 순수 함수, 시각은 ms.
 *
 * 저장 값: durationMs, activeElapsedMs, runningSince(진행 중일 때만), 단계 마감은
 * phaseEndsAt(진행 중) 또는 phaseRemainingMs(일시정지 중) 중 하나만.
 */
export interface Clock {
  durationMs: number;
  activeElapsedMs: number;
  /** 메인 타이머가 흐르기 시작한 시각. 멈춰 있으면 null (RUNNING 이 아니거나 일시정지) */
  runningSince: number | null;
  phaseEndsAt: number | null;
  phaseRemainingMs: number | null;
  paused: boolean;
}

export const newClock = (durationMs: number): Clock => ({ durationMs, activeElapsedMs: 0, runningSince: null, phaseEndsAt: null, phaseRemainingMs: null, paused: false });

export const elapsed = (c: Clock, now: number): number => c.activeElapsedMs + (c.runningSince === null ? 0 : Math.max(0, now - c.runningSince));
export const mainRemaining = (c: Clock, now: number): number => Math.max(0, c.durationMs - elapsed(c, now));
/** 메인 타이머가 끝나는 절대 시각 (흐르지 않으면 null) */
export const mainEndsAt = (c: Clock): number | null => (c.runningSince === null ? null : c.runningSince + (c.durationMs - c.activeElapsedMs));
export const phaseRemaining = (c: Clock, now: number): number | null =>
  c.paused ? c.phaseRemainingMs : c.phaseEndsAt === null ? null : Math.max(0, c.phaseEndsAt - now);

/** 메인 타이머 시작(RUNNING 진입) */
export const startMain = (c: Clock, now: number): Clock => ({ ...c, runningSince: c.paused ? null : now });
/** 메인 타이머 정지(종료 시) — 누적만 남긴다 */
export const stopMain = (c: Clock, now: number): Clock => ({ ...c, activeElapsedMs: Math.min(c.durationMs, elapsed(c, now)), runningSince: null });

export const setPhase = (c: Clock, now: number, ms: number | null): Clock =>
  c.paused ? { ...c, phaseEndsAt: null, phaseRemainingMs: ms } : { ...c, phaseEndsAt: ms === null ? null : now + ms, phaseRemainingMs: null };

export function pause(c: Clock, now: number, mainRunning: boolean): Clock {
  if (c.paused) return c;
  return { ...c, paused: true, activeElapsedMs: mainRunning ? elapsed(c, now) : c.activeElapsedMs, runningSince: null,
    phaseRemainingMs: c.phaseEndsAt === null ? null : Math.max(0, c.phaseEndsAt - now), phaseEndsAt: null };
}

export function resume(c: Clock, now: number, mainRunning: boolean): Clock {
  if (!c.paused) return c;
  return { ...c, paused: false, runningSince: mainRunning ? now : null,
    phaseEndsAt: c.phaseRemainingMs === null ? null : now + c.phaseRemainingMs, phaseRemainingMs: null };
}
