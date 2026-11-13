/**
 * TrapRoom.ts — 판 하나 = Durable Object 인스턴스 하나 (DESIGN §2·§5).
 *
 * 규칙·상태 머신은 src/game/room.ts 의 순수 함수(handle)가 전부 한다. 이 클래스는
 *   ① 저장소에서 상태를 복원하고 ② handle 을 부르고 ③ **저장이 끝난 뒤에** 결과를 돌려주고
 *   ④ 다음 alarm 을 예약하는 일만 한다.
 * 판 안의 요청은 DO 가 한 줄로 처리하므로 잠금이 필요 없다.
 *
 * 저장 키: 'state'(RoomState) · 'bank'(판 생성 때 고정한 문항, 1회) · 'events:<seq>'(라운드별 이벤트 감사 로그)
 * ⚠️ 상태·이벤트·alarm 은 한 트랜잭션으로 바꾼다(persist.ts). 실패하면 메모리도 그대로.
 * ⚠️ 0단계 점검 코드는 2단계 시작 때 지웠다(README).
 * 인증·소켓은 3단계에서 붙는다. 여기 RPC 는 Worker(바인딩을 가진 코드)만 부를 수 있다.
 */
import { DurableObject } from 'cloudflare:workers';
import { createRoom, handle, nextAlarm, type Actor, type CommandIn, type CreateError, type Creds, type HandleOut, type RoomConfig, type RoomState } from '../game/room.ts';
import { commit, syncAlarm, type StoreLike } from './persist.ts';
import type { BankQuestion } from '../game/questions.ts';

export interface Env {
  TRAP_ROOM: DurableObjectNamespace<TrapRoom>;
  DB: D1Database;
  ASSETS: Fetcher;
  /** 비어 있으면 관리자 통로(판 생성·문제은행)는 전부 닫힌다 */
  ADMIN_PASSWORD?: string;
}

export class TrapRoom extends DurableObject<Env> {
  private state: RoomState | null = null;
  private bank: BankQuestion[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 복원이 끝나기 전에는 어떤 요청도 처리하지 않는다 (DESIGN §5-5)
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<RoomState>('state')) ?? null;
      this.bank = (await ctx.storage.get<BankQuestion[]>('bank')) ?? [];
      // 예약이 빠진 채로 남았을 가능성까지 복구: 저장된 상태가 원하는 alarm 과 맞춘다
      if (this.state) await ctx.storage.transaction((txn) => syncAlarm(txn, nextAlarm(this.state as RoomState)));
    });
  }

  /** 판 생성 (Worker 의 관리자 라우트만 부른다). 이미 있으면 거절 */
  async create(input: { code: string; title: string; setName: string; config: RoomConfig; seed: number; creds: Creds }, bank: BankQuestion[]): Promise<{ ok: true; warnings: string[] } | { ok: false; error: CreateError | 'EXISTS' }> {
    if (this.state) return { ok: false, error: 'EXISTS' };
    const r = createRoom(input, bank, Date.now());
    if ('error' in r) return { ok: false, error: r.error };
    await this.ctx.storage.put({ state: r.state, bank });
    this.state = r.state; this.bank = bank;
    return { ok: true, warnings: r.warnings };
  }

  /** 명령 처리. 저장 성공 후에만 반환한다 */
  async command(actor: Actor, cmd: CommandIn): Promise<HandleOut['result'] & { stateVersion?: number }> {
    if (!this.state) return { ok: false, error: 'NO_ROOM' };
    const out = await this.run(actor, cmd);
    return { ...out.result, stateVersion: out.state.stateVersion };
  }

  /** 3단계 전까지 내부 확인용: 전체 상태(비밀 포함) — Worker 바인딩만 부를 수 있다. 뷰 필터는 3단계 */
  async snapshot(): Promise<RoomState | null> { return this.state; }

  override async alarm(): Promise<void> {
    if (!this.state) return;
    await this.run({ kind: 'system' }, { type: 'tick' });  // 재실행돼도 이미 적용된 마감은 무시(멱등)
  }

  private async run(actor: Actor, cmd: CommandIn): Promise<HandleOut> {
    const out = handle(this.state as RoomState, this.bank, actor, cmd, Date.now());
    await commit(this.ctx.storage as unknown as StoreLike, out); // 실패하면 예외 → 아래 줄에 닿지 않는다
    if (out.changed) this.state = out.state;
    return out;
  }
}
