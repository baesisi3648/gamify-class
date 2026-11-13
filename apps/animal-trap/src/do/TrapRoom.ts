/**
 * TrapRoom.ts — 판 하나 = Durable Object 인스턴스 하나 (DESIGN §2·§5).
 *
 * 0단계(골격): 게임 규칙은 아직 없다. 이 설계가 기대는 Cloudflare 기능이 실제 계정에서
 * 동작하는지만 확인한다 — ① SQLite 백엔드 storage ② alarm ③ WebSocket Hibernation
 * (잠들었다 깨어나도 같은 소켓과 attachment 가 복원되는가).
 *
 * ⚠️ 점검(smoke) 코드는 **2단계(상태 머신) 연결 전에 이 파일에서 지운다** (DESIGN §11, README).
 *    게임과 점검이 alarm 하나를 같이 쓰면 안 되기 때문이다.
 * ⚠️ 이 클래스에는 규칙 판단을 넣지 않는다. 규칙은 src/game 의 순수 함수(2단계).
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  TRAP_ROOM: DurableObjectNamespace<TrapRoom>;
  DB: D1Database;
  ASSETS: Fetcher;
  /** 비어 있으면 관리자 통로(판 생성·문제은행·점검)는 전부 닫힌다 */
  ADMIN_PASSWORD?: string;
  /** "1" 일 때만 점검 통로가 열린다(기본 꺼짐). 원격 확인이 끝나면 지운다 */
  SMOKE_ENABLED?: string;
}

/** 소켓 꼬리표. hibernation 에서 깨어나면 메모리는 비고 이것만 남는다 */
interface SocketTag { kind: 'smoke' }

const MAX_MESSAGE = 4096;
const MAX_SOCKETS = 16;

export class TrapRoom extends DurableObject<Env> {
  /** 메모리 전용. 인스턴스가 새로 만들어질 때마다(= hibernation 복원 포함) 바뀐다 */
  private readonly bootId = crypto.randomUUID();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 저장소 준비가 끝나기 전에는 어떤 요청도 처리하지 않는다 (DESIGN §5-5)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS smoke (k TEXT PRIMARY KEY, v INTEGER NOT NULL)');
    });
  }

  private smokeOpen(): boolean { return this.env.SMOKE_ENABLED === '1' && !!this.env.ADMIN_PASSWORD; }

  /** 점검: SQLite 카운터 +1, 2초 뒤 alarm 예약 (Worker 가 관리자 인증 후에만 부른다) */
  async smoke(): Promise<{ count: number; alarmAt: number; bootId: string }> {
    const sql = this.ctx.storage.sql;
    sql.exec("INSERT INTO smoke (k, v) VALUES ('count', 1) ON CONFLICT(k) DO UPDATE SET v = v + 1");
    const count = Number(sql.exec("SELECT v FROM smoke WHERE k = 'count'").one().v);
    const alarmAt = Date.now() + 2000;
    await this.ctx.storage.setAlarm(alarmAt);
    return { count, alarmAt, bootId: this.bootId };
  }

  async smokeStatus(): Promise<{ lastAlarmAt: number | null; sockets: number; bootId: string }> {
    const row = this.ctx.storage.sql.exec("SELECT v FROM smoke WHERE k = 'alarm'").toArray()[0];
    return { lastAlarmAt: row ? Number(row.v) : null, sockets: this.ctx.getWebSockets().length, bootId: this.bootId };
  }

  override async alarm(): Promise<void> {
    // alarm 은 최소 1회 실행 보장일 뿐이라 다시 불릴 수 있다 — 덮어쓰기로 멱등
    this.ctx.storage.sql.exec("INSERT INTO smoke (k, v) VALUES ('alarm', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", Date.now());
  }

  /** Worker 가 **관리자 인증을 마친 뒤에만** 업그레이드를 넘긴다 */
  override async fetch(request: Request): Promise<Response> {
    if (!this.smokeOpen()) return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('too many sockets', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ kind: 'smoke' } satisfies SocketTag);
    server.send(JSON.stringify({ type: 'welcome', bootId: this.bootId }));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // 매 메시지마다 현재 설정을 다시 본다 — 점검 통로를 끄면 열려 있던 소켓도 끊긴다
    const tag = ws.deserializeAttachment() as SocketTag | null;
    if (!this.smokeOpen() || tag?.kind !== 'smoke') { ws.close(1008, 'closed'); return; }
    // 크기는 바이트로 잰다 (문자열 길이는 UTF-16 단위라 한글이면 실제보다 작게 잡힌다)
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (bytes > MAX_MESSAGE) { ws.close(1009, 'too big'); return; }
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let msg: unknown;
    try { msg = JSON.parse(text); } catch { ws.close(1003, 'bad json'); return; }
    if (typeof msg !== 'object' || msg === null || (msg as { type?: unknown }).type !== 'ping') { ws.close(1003, 'bad message'); return; }
    ws.send(JSON.stringify({ type: 'pong', bootId: this.bootId, at: Date.now() }));
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try { ws.close(code, 'bye'); } catch { /* 이미 닫힘 */ }
  }
}
