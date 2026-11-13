/**
 * rng.ts — 시드 고정 난수 (mulberry32). 같은 시드면 같은 결과 → 테스트·시뮬레이션·재현에 쓴다.
 *
 * DO 는 판이 재시작돼도 난수열이 처음부터 반복되지 않도록 **현재 상태(state)** 를 저장한다:
 *   const rng = makeRng(saved.rngState); ... ; saved.rngState = rng.state();
 * 시드·상태는 서버에만 두고 어떤 뷰에도 내보내지 않는다 (DESIGN §4-2).
 */
export interface Rng { (): number; state(): number }

export function makeRng(seedOrState: number): Rng {
  let a = seedOrState >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.state = () => a;
  return next;
}

export const randInt = (rng: () => number, n: number): number => Math.floor(rng() * n);

export function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
