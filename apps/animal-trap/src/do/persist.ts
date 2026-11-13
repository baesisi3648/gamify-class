/**
 * persist.ts — DO 저장 절차 (Workers API 없이 테스트할 수 있게 분리).
 *
 * 상태·이벤트·alarm 을 **한 트랜잭션**으로 바꾼다. 하나라도 실패하면 전부 되돌려지고 예외가 난다 →
 * 호출자는 예외가 나면 메모리 상태를 바꾸지 않는다 (DESIGN §5-2: 저장 성공 후 응답·푸시).
 */
import type { HandleOut } from '../game/room.ts';

/** DurableObjectTransaction 중 여기서 쓰는 부분 */
export interface TxnLike {
  put(entries: Record<string, unknown>): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface StoreLike { transaction<T>(fn: (txn: TxnLike) => Promise<T>): Promise<T> }

export const eventKey = (seq: number) => 'events:' + String(seq).padStart(6, '0');

export async function commit(store: StoreLike, out: HandleOut): Promise<void> {
  await store.transaction(async (txn) => {
    if (out.changed) {
      const put: Record<string, unknown> = { state: out.state };
      for (const b of out.events) put[eventKey(b.seq)] = b; // 라운드마다 따로
      await txn.put(put);
    }
    await syncAlarm(txn, out.alarmAt);
  });
}

/** alarm 을 원하는 시각에 맞춘다 (같으면 그대로) */
export async function syncAlarm(txn: Pick<TxnLike, 'getAlarm' | 'setAlarm' | 'deleteAlarm'>, at: number | null): Promise<void> {
  const current = await txn.getAlarm();
  if (at === null) { if (current !== null) await txn.deleteAlarm(); }
  else if (current !== at) await txn.setAlarm(at);
}
