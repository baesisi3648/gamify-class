/**
 * auth.ts — 인증 보조. Worker·DO·Node 테스트가 같이 쓴다(런타임 전용 import 없음).
 */
const enc = new TextEncoder();

/**
 * 비밀값 비교. 두 값을 SHA-256 으로 고정 길이(32바이트)로 만든 뒤 비교한다 →
 * 길이가 시간에 드러나지 않는다. Workers 에서는 네이티브 crypto.subtle.timingSafeEqual 을 쓰고,
 * 없는 환경(Node 테스트)에서는 고정 길이 전체를 도는 XOR 비교로 대신한다.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const native = (crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean }).timingSafeEqual;
  if (typeof native === 'function') return native.call(crypto.subtle, x, y);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

/** 128비트 무작위 열쇠(교사 열쇠·TV 열쇠·조작권 토큰). base32 26자, 헷갈리는 글자(0 O 1 I) 없음 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomKey(bits = 128): string {
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  crypto.getRandomValues(bytes);
  let out = '', acc = 0, n = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff; n += 8;
    while (n >= 5) { out += ALPHABET[(acc >> (n - 5)) & 31]; n -= 5; }
  }
  if (n > 0) out += ALPHABET[(acc << (5 - n)) & 31];
  return out;
}
