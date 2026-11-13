import test from 'node:test';
import assert from 'node:assert/strict';
import { safeEqual, randomKey } from '../src/server/auth.ts';

test('safeEqual: 같을 때만 참, 길이가 달라도 거짓', async () => {
  assert.equal(await safeEqual('teacher-1234', 'teacher-1234'), true);
  assert.equal(await safeEqual('teacher-1234', 'teacher-1235'), false);
  assert.equal(await safeEqual('abc', 'abcd'), false);
  assert.equal(await safeEqual('', 'x'), false);
  assert.equal(await safeEqual('한글열쇠', '한글열쇠'), true);
});

test('randomKey: 128비트 = 26자, 매번 다름, 헷갈리는 글자 없음', () => {
  const keys = new Set(Array.from({ length: 500 }, () => randomKey()));
  assert.equal(keys.size, 500);
  for (const k of keys) { assert.equal(k.length, 26); assert.match(k, /^[A-HJ-NP-Z2-9]+$/); }
});
