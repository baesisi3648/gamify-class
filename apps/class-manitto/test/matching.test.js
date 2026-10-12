import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseReceiver, findCompletion } from '../src/matching.js';
import { normalizeName } from '../src/index.js';

test('선생님 호칭과 공동 표기를 빼고도 같은 이름으로 로그인한다', () => {
  assert.equal(normalizeName('배성용'), '배성용');
  assert.equal(normalizeName('배성용 선생님'), '배성용');
  assert.equal(normalizeName('홍길동(공동)'), '홍길동');
});

test('28명 모두 자기 자신과 중복 없이 배정된다', () => {
  const ids = Array.from({ length: 28 }, (_, index) => index + 1);
  const result = findCompletion(ids, ids, new Map(), true, () => 0.37);
  assert.ok(result);
  assert.equal(result.size, 28);
  assert.equal(new Set(result.values()).size, 28);
  for (const [giver, receiver] of result) {
    assert.notEqual(giver, receiver);
    assert.notEqual(result.get(receiver), giver);
  }
});

test('지정한 두 학생은 어느 방향으로도 서로 배정되지 않는다', () => {
  const ids = Array.from({ length: 29 }, (_, index) => index + 1);
  const forbiddenPairs = new Set(['3:24', '24:3']);

  for (let seed = 1; seed <= 40; seed += 1) {
    let value = seed;
    const random = () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x100000000;
    };
    const order = [...ids].sort(() => random() - 0.5);
    const fixedPairs = new Map();
    const availableReceivers = new Set(ids);

    for (const giverId of order) {
      const receiver = chooseReceiver({
        giverId,
        remainingGivers: order.filter((id) => !fixedPairs.has(id)),
        remainingReceivers: [...availableReceivers],
        fixedPairs,
        preventMutual: true,
        random,
        forbiddenPairs,
      });
      assert.ok(receiver, `seed ${seed}, giver ${giverId}`);
      fixedPairs.set(giverId, receiver);
      availableReceivers.delete(receiver);
    }

    assert.notEqual(fixedPairs.get(3), 24);
    assert.notEqual(fixedPairs.get(24), 3);
  }
});

test('이미 진행된 뽑기를 유지하면서 안전한 다음 상대를 고른다', () => {
  const fixedPairs = new Map([[1, 2], [3, 4]]);
  const receiver = chooseReceiver({
    giverId: 2,
    remainingGivers: [2, 4, 5, 6],
    remainingReceivers: [1, 3, 5, 6],
    fixedPairs,
    preventMutual: true,
    random: () => 0.21,
  });
  assert.ok(receiver);
  assert.notEqual(receiver, 2);
  assert.notEqual(receiver, 1);
});

test('한 명만 남아도 가능한 경우 정상 처리한다', () => {
  const result = findCompletion([8], [7], new Map([[7, 6]]), true);
  assert.equal(result.get(8), 7);
});

test('28명이 여러 순서로 한 장씩 뽑아도 끝까지 안전하다', () => {
  const ids = Array.from({ length: 28 }, (_, index) => index + 1);
  for (let seed = 1; seed <= 40; seed += 1) {
    let value = seed;
    const random = () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x100000000;
    };
    const order = [...ids].sort(() => random() - 0.5);
    const fixedPairs = new Map();
    const availableReceivers = new Set(ids);
    for (const giverId of order) {
      const receiver = chooseReceiver({
        giverId,
        remainingGivers: order.filter((id) => !fixedPairs.has(id)),
        remainingReceivers: [...availableReceivers],
        fixedPairs,
        preventMutual: true,
        random,
      });
      assert.ok(receiver, `seed ${seed}, giver ${giverId}`);
      fixedPairs.set(giverId, receiver);
      availableReceivers.delete(receiver);
    }
    assert.equal(new Set(fixedPairs.values()).size, 28);
    for (const [giver, receiver] of fixedPairs) {
      assert.notEqual(giver, receiver);
      assert.notEqual(fixedPairs.get(receiver), giver);
    }
  }
});
