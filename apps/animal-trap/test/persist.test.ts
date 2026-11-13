// DO 저장 절차: 상태·이벤트·alarm 한 트랜잭션, 실패하면 전부 되돌림 (DESIGN §5-2)
import test from 'node:test';
import assert from 'node:assert/strict';
import { commit, eventKey, type StoreLike, type TxnLike } from '../src/do/persist.ts';
import type { HandleOut } from '../src/game/room.ts';

function fakeStore(failOn?: 'put' | 'setAlarm') {
  const data = new Map<string, unknown>(); let alarm: number | null = null;
  const store: StoreLike & { data: typeof data; alarm(): number | null } = {
    data, alarm: () => alarm,
    async transaction(fn) {
      const draft = new Map(data); let draftAlarm = alarm;
      const txn: TxnLike = {
        async put(e) { if (failOn === 'put') throw new Error('put failed'); for (const [k, v] of Object.entries(e)) draft.set(k, v); },
        async getAlarm() { return draftAlarm; },
        async setAlarm(at) { if (failOn === 'setAlarm') throw new Error('alarm failed'); draftAlarm = at; },
        async deleteAlarm() { draftAlarm = null; }
      };
      const r = await fn(txn);                 // 예외면 draft 를 버린다 = 롤백
      data.clear(); for (const [k, v] of draft) data.set(k, v); alarm = draftAlarm;
      return r;
    }
  };
  return store;
}
const out = (alarmAt: number | null): HandleOut => ({ state: { stateVersion: 2 } as any, result: { ok: true }, changed: true, alarmAt,
  events: [{ seq: 1, round: 1, events: [] }, { seq: 2, round: 2, events: [] }] });

test('상태·라운드별 이벤트·alarm 이 함께 저장된다', async () => {
  const s = fakeStore();
  await commit(s, out(5000));
  assert.ok(s.data.has('state') && s.data.has(eventKey(1)) && s.data.has(eventKey(2)));
  assert.equal(s.alarm(), 5000);
  await commit(s, { ...out(null), changed: false, events: [] });
  assert.equal(s.alarm(), null, '마감이 없으면 alarm 삭제');
});

test('alarm 예약이 실패하면 상태 저장도 되돌려지고 예외가 난다(메모리 갱신 금지)', async () => {
  for (const failOn of ['setAlarm', 'put'] as const) {
    const s = fakeStore(failOn);
    await assert.rejects(commit(s, out(5000)));
    assert.equal(s.data.size, 0);
    assert.equal(s.alarm(), null);
  }
});
