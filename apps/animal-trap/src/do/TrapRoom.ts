/**
 * TrapRoom.ts — 판 하나 = Durable Object 인스턴스 하나 (DESIGN §2·§3·§5·§6).
 *
 * 규칙·상태 머신은 src/game/room.ts(handle), 인증은 src/game/access.ts, 뷰는 src/game/views.ts.
 * 이 클래스는 ① 저장소 복원 ② 인증 확인 후 handle 호출 ③ **저장이 끝난 뒤에** 응답·푸시 ④ alarm 예약만 한다.
 *
 * 저장 키: 'state' · 'bank'(판 생성 때 고정, 1회) · 'events:<seq>'. 상태·이벤트·alarm 은 한 트랜잭션(persist.ts).
 * 소켓: 첫 메시지 hello 로 역할 인증. attachment 에 역할·자격 세대를 넣고, 깨어날 때·매 메시지·매 푸시마다
 *       현재 세대와 비교해 다르면 끊거나(TV·PIN 재발급) 관람자로 강등(조작권 해제) — DESIGN §5-5.
 * 인터넷에서 닿는 문은 Worker 라우트뿐이고, Worker 는 D1 에 있는 판 코드만 이 DO 로 넘긴다.
 */
import { DurableObject } from 'cloudflare:workers';
import { attemptPin, checkController, checkTeacher, checkTv, handleAccess, join, makeCreds } from '../game/access.ts';
import { isAccessCommand, parseTeacherCommand, parseTeamCommand } from '../game/commands.ts';
import type { BankQuestion } from '../game/questions.ts';
import { createRoom, handle, nextAlarm, type HandleOut, type RoomConfig, type RoomState } from '../game/room.ts';
import { teacherView, teamView, tvView } from '../game/views.ts';
import { randomKey, safeEqual } from '../server/auth.ts';
import type { Envelope, ViewRole } from '../server/router.ts';
import { commit, syncAlarm, type StoreLike } from './persist.ts';

export interface Env {
  TRAP_ROOM: DurableObjectNamespace<TrapRoom>;
  DB: D1Database;
  ASSETS: Fetcher;
  /** 비어 있으면 관리자 통로(판 생성·문제은행)는 전부 닫힌다 */
  ADMIN_PASSWORD?: string;
}

type Tag =
  | { role: 'pending'; at: number }
  | { role: 'teacher' }
  | { role: 'tv'; tvGen: number }
  | { role: 'team'; team: number; pinGen: number; controller: boolean; controlGen: number };

const MAX_SOCKETS = 64;      // 인증된 소켓
const MAX_PENDING = 16;      // hello 전 소켓 (넘으면 가장 오래된 것부터 닫는다)
const HELLO_TIMEOUT_MS = 10_000;
const MAX_MESSAGE = 4096;
const ok = (data: unknown): Envelope => ({ ok: true, data });
const no = (error: string): Envelope => ({ ok: false, error });
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

export class TrapRoom extends DurableObject<Env> {
  private state: RoomState | null = null;
  private bank: BankQuestion[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<RoomState>('state')) ?? null;
      this.bank = (await ctx.storage.get<BankQuestion[]>('bank')) ?? [];
      // 예약이 빠진 채로 남았을 가능성까지 복구
      if (this.state) await ctx.storage.transaction((txn) => syncAlarm(txn, nextAlarm(this.state as RoomState)));
      // hibernation 에서 깨어나면 남아 있던 소켓의 자격 세대를 바로 검사한다 (DESIGN §5-5)
      if (this.state) for (const ws of ctx.getWebSockets()) this.currentTag(ws);
    });
  }

  // ── RPC (Worker 만 부를 수 있다) ─────────────────────────────
  async create(input: { code: string; title: string; setName: string; config: RoomConfig; createId: string }, bank: BankQuestion[]): Promise<Envelope> {
    if (this.state) {
      // 같은 생성 요청의 재전송(응답 유실)이면 같은 자격을 돌려준다. 다른 요청이면 코드 충돌
      if (input.createId && this.state.createId === input.createId) return ok({ hostKey: this.state.creds.hostKey, tvKey: this.state.creds.tvKey, pins: [...this.state.creds.pins], warnings: [] });
      return no('EXISTS');
    }
    const creds = makeCreds(randomKey, rand);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const r = createRoom({ ...input, seed, creds }, bank, Date.now());
    if ('error' in r) return no(r.error);
    await this.ctx.storage.put({ state: r.state, bank });
    this.state = r.state; this.bank = bank;
    return ok({ hostKey: creds.hostKey, tvKey: creds.tvKey, pins: creds.pins, warnings: r.warnings });
  }

  async lobby(): Promise<Envelope> {
    const s = this.state; if (!s) return no('NO_ROOM');
    return ok({ title: s.title, phase: s.phase, joined: s.creds.controlToken.map((t) => t !== null) });
  }

  async view(who: ViewRole): Promise<Envelope> {
    const s = this.state; if (!s) return no('NO_ROOM');
    const now = Date.now();
    if (who.role === 'teacher') return (await checkTeacher(s, who.key, safeEqual)) ? ok(teacherView(s, this.bank, now)) : no('BAD_KEY');
    if (who.role === 'tv') return (await checkTv(s, who.key, safeEqual)) ? ok(tvView(s, this.bank, now)) : no('BAD_KEY');
    const auth = await this.teamAuth(who.team, who.pin, who.token);
    if (auth.error) return no(auth.error);
    return ok(teamView(this.state as RoomState, this.bank, who.team, now, { controller: auth.controller }));
  }

  async teacher(key: string, raw: unknown, requestId: string | undefined): Promise<Envelope> {
    const s = this.state; if (!s) return no('NO_ROOM');
    if (!(await checkTeacher(s, key, safeEqual))) return no('BAD_KEY');
    const cmd = parseTeacherCommand(raw);
    if (!cmd) return no('BAD_REQUEST');
    if (isAccessCommand(cmd)) {
      const r = handleAccess(s, cmd, requestId, rand, randomKey); // 같은 requestId 재전송 = 같은 결과(재발급·해제 한 번만)
      if (!r.replay) await this.save(r.state);
      return ok(r.data);
    }
    const out = await this.run({ kind: 'teacher' }, { ...cmd, requestId });
    return out.result.ok ? ok(out.result.data ?? null) : no(out.result.error);
  }

  async join(team: number, pin: string): Promise<Envelope> {
    const s = this.state; if (!s) return no('NO_ROOM');
    const r = await join(s, team, pin, Date.now(), safeEqual, randomKey);
    if (r.state !== s) {
      // 실패 횟수는 조용히 저장. 조작권 발급·잠금 시작처럼 교사 화면이 바뀌는 경우만 버전을 올려 푸시
      const t = Number.isInteger(team) && team >= 0 && team < 8 ? team : 0;
      const visible = r.state.creds.controlToken[t] !== s.creds.controlToken[t] || (r.state.creds.pinFails[t].until > 0) !== (s.creds.pinFails[t].until > 0);
      await this.save(r.state, visible);
    }
    if (!r.ok) return no(r.error);
    return ok({ role: r.role, token: r.token, view: teamView(this.state as RoomState, this.bank, team, Date.now(), { controller: r.role === 'controller' }) });
  }

  async team(team: number, pin: string, token: string, raw: unknown, requestId: string | undefined): Promise<Envelope> {
    const s = this.state; if (!s) return no('NO_ROOM');
    const e = await checkController(s, team, pin, token, safeEqual);
    if (e) return no(e);
    const cmd = parseTeamCommand(raw);
    if (!cmd) return no('BAD_REQUEST');
    const out = await this.run({ kind: 'team', team }, { ...cmd, requestId });
    return out.result.ok ? ok(out.result.data ?? null) : no(out.result.error);
  }

  override async alarm(): Promise<void> {
    if (!this.state) return;
    await this.run({ kind: 'system' }, { type: 'tick' }); // 재실행돼도 이미 적용된 마감은 무시(멱등)
  }

  // ── 저장·푸시 ──────────────────────────────────────────────
  private async run(actor: Parameters<typeof handle>[2], cmd: Parameters<typeof handle>[3]): Promise<HandleOut> {
    const out = handle(this.state as RoomState, this.bank, actor, cmd, Date.now());
    await commit(this.ctx.storage as unknown as StoreLike, out); // 실패하면 예외 → 메모리·푸시 없음
    if (out.changed) { this.state = out.state; this.pushAll(); }
    return out;
  }

  /** 자격 변경처럼 handle 밖에서 바뀐 상태 저장 */
  private async save(next: RoomState, bump = true): Promise<void> {
    const state = bump ? { ...next, stateVersion: next.stateVersion + 1 } : next;
    await commit(this.ctx.storage as unknown as StoreLike, { state, result: { ok: true }, changed: true, alarmAt: nextAlarm(state), events: [] });
    this.state = state;
    if (bump) this.pushAll();
  }

  // ── 소켓 ──────────────────────────────────────────────────
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!this.state) return new Response('no room', { status: 404 });
    this.closeStalePending();
    const all = this.ctx.getWebSockets();
    const pending = all.filter((w) => (w.deserializeAttachment() as Tag | null)?.role === 'pending');
    if (all.length - pending.length >= MAX_SOCKETS) return new Response('too many sockets', { status: 429 });
    if (pending.length >= MAX_PENDING) { // 인증 전 소켓이 자리를 다 차지하지 못하게: 가장 오래된 것부터 닫는다
      const oldest = pending.sort((a, b) => (a.deserializeAttachment() as { at: number }).at - (b.deserializeAttachment() as { at: number }).at)[0];
      try { oldest.close(1008, 'too many pending'); } catch { /* */ }
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: 'pending', at: Date.now() } satisfies Tag);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (bytes > MAX_MESSAGE) { ws.close(1009, 'too big'); return; }
    let msg: Record<string, unknown> | null = null;
    try { const v = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); msg = v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { /* 아래에서 거절 */ }
    if (!msg || !this.state) { ws.close(1003, 'bad message'); return; }
    const tag = this.currentTag(ws);
    if (!tag) return; // 무효화되어 닫힘
    if (tag.role === 'pending') {
      if (msg.type !== 'hello') { ws.close(1008, 'hello first'); return; }
      const next = await this.authSocket(msg);
      if (!next) { ws.close(1008, 'unauthorized'); return; }
      // 인증 소켓 한도를 전환 직전에 다시 센다(await 이후라 다른 소켓이 먼저 인증됐을 수 있다). 세고 바꾸는 사이에 await 없음
      const authed = this.ctx.getWebSockets().filter((w) => w !== ws && (w.deserializeAttachment() as Tag | null)?.role !== 'pending').length;
      if (authed >= MAX_SOCKETS) { ws.close(1013, 'too many sockets'); return; }
      ws.serializeAttachment(next);
      this.send(ws, next);
      return;
    }
    if (msg.type === 'resync') this.send(ws, tag);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try { ws.close(code, 'bye'); } catch { /* 이미 닫힘 */ }
  }

  /**
   * 팀 인증 (상태 조회·소켓 hello 공통). 유효한 조작권 토큰+PIN 이면 실패 제한과 무관하게 통과(이미 인증된 기기).
   * 아니면 실패 제한이 걸린 PIN 시도 — 실패 횟수는 저장한다(공격자가 무한히 추측하지 못하게).
   */
  private async teamAuth(team: unknown, pin: string, token: string): Promise<{ error: string | null; controller: boolean }> {
    const s = this.state as RoomState;
    if (token && !(await checkController(s, team, pin, token, safeEqual))) return { error: null, controller: true };
    const a = await attemptPin(s, team, pin, Date.now(), safeEqual);
    if (a.state !== s) {
      const t = team as number;
      const lockChanged = (a.state.creds.pinFails[t].until > 0) !== (s.creds.pinFails[t].until > 0);
      await this.save(a.state, lockChanged);
    }
    return { error: a.error, controller: false };
  }

  private async authSocket(msg: Record<string, unknown>): Promise<Tag | null> {
    const s = this.state as RoomState;
    const key = typeof msg.key === 'string' ? msg.key : '', pin = typeof msg.pin === 'string' ? msg.pin : '', token = typeof msg.token === 'string' ? msg.token : '';
    if (msg.role === 'teacher') return (await checkTeacher(s, key, safeEqual)) ? { role: 'teacher' } : null;
    if (msg.role === 'tv') return (await checkTv(s, key, safeEqual)) ? { role: 'tv', tvGen: s.creds.tvGen } : null;
    if (msg.role === 'team') {
      const team = Number.isInteger(msg.team) ? (msg.team as number) : -1;
      const auth = await this.teamAuth(team, pin, token);
      if (auth.error) return null;
      const cur = this.state as RoomState;
      return { role: 'team', team, pinGen: cur.creds.pinGen[team], controller: auth.controller, controlGen: cur.creds.controlGen[team] };
    }
    return null;
  }

  /** attachment 를 현재 자격 세대와 비교: TV·PIN 재발급이면 끊고, 조작권 해제면 관람자로 강등 */
  private currentTag(ws: WebSocket): Tag | null {
    const s = this.state as RoomState;
    const tag = ws.deserializeAttachment() as Tag | null;
    if (!tag) { ws.close(1008, 'no tag'); return null; }
    if (tag.role === 'pending' && Date.now() - tag.at > HELLO_TIMEOUT_MS) { ws.close(1008, 'hello timeout'); return null; }
    if (tag.role === 'tv' && tag.tvGen !== s.creds.tvGen) { ws.close(4001, 'tv key reissued'); return null; }
    if (tag.role === 'team') {
      if (tag.pinGen !== s.creds.pinGen[tag.team]) { ws.close(4002, 'pin reissued'); return null; }
      if (tag.controller && tag.controlGen !== s.creds.controlGen[tag.team]) {
        const demoted: Tag = { ...tag, controller: false, controlGen: s.creds.controlGen[tag.team] };
        ws.serializeAttachment(demoted);
        return demoted;
      }
    }
    return tag;
  }

  private send(ws: WebSocket, tag: Tag) {
    const s = this.state as RoomState, now = Date.now();
    const data = tag.role === 'teacher' ? teacherView(s, this.bank, now) : tag.role === 'tv' ? tvView(s, this.bank, now)
      : tag.role === 'team' ? teamView(s, this.bank, tag.team, now, { controller: tag.controller }) : null;
    if (!data) return;
    try { ws.send(JSON.stringify({ type: 'state', data })); } catch { /* 끊긴 소켓 */ }
  }

  private pushAll() {
    for (const ws of this.ctx.getWebSockets()) {
      const tag = this.currentTag(ws);
      if (tag && tag.role !== 'pending') this.send(ws, tag);
    }
  }

  private closeStalePending() {
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as Tag | null;
      if (tag?.role === 'pending' && Date.now() - tag.at > HELLO_TIMEOUT_MS) { try { ws.close(1008, 'hello timeout'); } catch { /* */ } }
    }
  }
}
