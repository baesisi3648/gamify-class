/**
 * questions.ts — 난이도별 문항 고르기 (DESIGN D7).
 * 같은 팀에는 같은 문항을 다시 내지 않는다. 그 난이도를 다 썼으면 그 팀이 가장 오래전에 푼 것부터 재사용.
 * 팀 간 중복은 허용.
 */
type Rng = () => number;
import type { Level } from './types.ts';

export interface BankQuestion {
  id: string;
  level: Level;
  text: string;
  choices: string[];   // 4지선다
  answer: number;      // 1~4
  explanation: string;
}

export const LEVELS: readonly Level[] = ['쉬움', '보통', '어려움'];

/**
 * 덫 개수 n → 난이도. n=0 이면 문제 없음.
 * 사용자 확정(2026-11-13): 1개 쉬움 / 2개 보통 / 3개 이상 어려움.
 * (기획서의 1~2/3~4/5+ 는 시뮬레이션에서 보통 2%·어려움 0% 라 3단계 문제은행이 쓰이지 않았다)
 * 점수 공식(정답 n+2, 오답 −(n+1))은 그대로.
 */
export const levelFor = (n: number): Level | null => (n <= 0 ? null : n === 1 ? '쉬움' : n === 2 ? '보통' : '어려움');

export function pickQuestion(bank: readonly BankQuestion[], level: Level, asked: readonly string[], rng: Rng): string {
  const pool = bank.filter((q) => q.level === level);
  if (!pool.length) throw new Error('NO_QUESTION_FOR_LEVEL:' + level); // 판 생성 때 막는다 (DESIGN §5-6)
  const fresh = pool.filter((q) => !asked.includes(q.id));
  if (fresh.length) return fresh[Math.floor(rng() * fresh.length)].id;
  // 다 썼으면 이 팀이 가장 오래전에 받은 것
  const oldest = [...pool].sort((a, b) => asked.indexOf(a.id) - asked.indexOf(b.id))[0];
  return oldest.id;
}
