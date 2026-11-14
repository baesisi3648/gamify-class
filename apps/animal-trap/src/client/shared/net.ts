/**
 * net.ts — 서버 호출·실시간 소켓·서버 시계 (팀·교사·TV 공용).
 *
 * - HTTP: 인증값은 헤더로만. 명령마다 requestId 를 붙여, 응답이 유실돼 다시 보내도 서버가 한 번만 처리한다.
 * - 소켓: 끊기면 지수 백오프(1→2→4→8→15초) + 지터로 다시 붙고, 붙자마자 hello 로 인증해 전체 상태를 받는다.
 *   폴링하지 않는다 — 서버가 상태가 바뀔 때만 민다.
 * - 시계: 뷰에 실린 serverNow·남은 시간을 받은 순간 기준으로 줄여 표시(일시정지면 고정).
 */
export type Envelope<T = unknown> = { ok: true; data: T } | { ok: false; error: string; message?: string };

export async function call<T = unknown>(path: string, headers: Record<string, string>, body?: unknown, method = 'POST'): Promise<Envelope<T>> {
  try {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    const j = await r.json().catch(() => null);
    return j && typeof j === 'object' && 'ok' in j ? (j as Envelope<T>) : { ok: false, error: 'NETWORK' };
  } catch { return { ok: false, error: 'NETWORK' }; }
}

export const newRequestId = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);

/** 같은 명령의 재시도는 같은 requestId 로 (서버가 한 번만 처리) */
export async function command<T = unknown>(path: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<Envelope<T>> {
  const requestId = newRequestId();
  let r = await call<T>(path, headers, { ...body, requestId });
  if (!r.ok && r.error === 'NETWORK') r = await call<T>(path, headers, { ...body, requestId });
  return r;
}

const BACKOFF = [1000, 2000, 4000, 8000, 15000];

export interface LiveOptions<V> {
  code: string;
  hello: () => Record<string, unknown>;
  onState: (view: V) => void;
  onStatus: (up: boolean) => void;
  onClosedForGood?: (code: number) => void;
}

/** 판 하나에 붙는 소켓. 자격이 무효(4001·4002·1008)면 다시 붙지 않는다. close() 로 완전히 정리된다 */
export function live<V extends { stateVersion: number }>(o: LiveOptions<V>): { resync(): void; close(): void } {
  let ws: WebSocket | null = null, tries = 0, stopped = false, lastVersion = -1;
  let bannerTimer: number | undefined, retryTimer: number | undefined;
  const connect = () => {
    if (stopped || retryTimer !== undefined) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return; // 이미 붙어 있거나 붙는 중
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const sock = new WebSocket(`${proto}//${location.host}/ws/${o.code}`);
    ws = sock;
    sock.onopen = () => { tries = 0; sock.send(JSON.stringify({ type: 'hello', ...o.hello() })); };
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      let m: { type?: string; data?: V } | null = null;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m?.type !== 'state' || !m.data) return;
      clearTimeout(bannerTimer); o.onStatus(true);
      if (m.data.stateVersion < lastVersion) return; // 오래된 푸시는 버린다
      lastVersion = m.data.stateVersion;
      o.onState(m.data);
    };
    sock.onclose = (e) => {
      if (ws !== sock) return;                       // 이미 교체된 옛 소켓의 close 는 무시
      ws = null;
      if (stopped) return;
      if (e.code === 4001 || e.code === 4002 || e.code === 1008) { stopped = true; o.onClosedForGood?.(e.code); return; }
      clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => o.onStatus(false), 1500); // 짧은 재연결에 빨간 띠가 번쩍이지 않게
      const base = BACKOFF[Math.min(tries++, BACKOFF.length - 1)];
      retryTimer = window.setTimeout(() => { retryTimer = undefined; connect(); }, base * (0.7 + Math.random() * 0.6));
    };
  };
  const onVisible = () => { if (document.visibilityState === 'visible' && !ws && !stopped) { clearTimeout(retryTimer); retryTimer = undefined; connect(); } };
  document.addEventListener('visibilitychange', onVisible);
  connect();
  return {
    resync: () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resync' })); },
    close: () => { stopped = true; clearTimeout(retryTimer); clearTimeout(bannerTimer); document.removeEventListener('visibilitychange', onVisible); const w = ws; ws = null; w?.close(); }
  };
}

/** 서버 시각 기준 남은 시간. 메인 타이머는 진행 중(RUNNING)이고 멈추지 않았을 때만 흐른다 */
export class Countdown {
  private at = performance.now();
  constructor(private main: number, private phase: number | null, private paused: boolean, private mainRuns: boolean) {}
  static of(v: { mainRemainingMs: number; phaseRemainingMs: number | null; paused: boolean; phase: string }) {
    return new Countdown(v.mainRemainingMs, v.phaseRemainingMs, v.paused, v.phase === 'RUNNING');
  }
  private passed() { return this.paused ? 0 : performance.now() - this.at; }
  mainLeft() { return Math.max(0, this.main - (this.mainRuns ? this.passed() : 0)); }
  phaseLeft() { return this.phase === null ? null : Math.max(0, this.phase - this.passed()); }
}

export const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** 서버 오류 코드 → 학생·교사가 읽을 문장 */
export const ERROR_TEXT: Record<string, string> = {
  NETWORK: '연결이 불안정해요. 잠시 후 다시 눌러 주세요.', NO_ROOM: '판을 찾을 수 없어요. 코드를 확인해 주세요.', BAD_CODE: '판 코드가 올바르지 않아요.',
  BAD_PIN: 'PIN이 맞지 않아요.', PIN_LOCKED: '여러 번 틀려서 잠겼어요. 30초 뒤에 다시 해 주세요.', BAD_TEAM: '팀을 다시 골라 주세요.',
  NOT_CONTROLLER: '이 기기는 보기 전용이에요. 조작은 팀의 첫 기기에서 해 주세요.', BAD_KEY: '열쇠가 맞지 않아요.',
  STALE: '이미 다음 단계로 넘어갔어요.', PAUSED: '선생님이 잠시 멈췄어요.', BAD_PHASE: '지금은 할 수 없어요.',
  BAD_MOVE: '바로 옆 8칸 중에서만 고를 수 있어요.', ALREADY_MOVED: '이번 라운드 이동은 이미 정했어요.', BOUND: '속박 덫에 걸려 이번 라운드는 움직일 수 없어요.',
  ALREADY_ANSWERED: '이미 답을 냈어요.', NO_QUESTION: '풀 문제가 없어요.', BAD_CHOICE: '보기를 다시 골라 주세요.',
  NO_RECON: '정찰권이 없어요.', BAD_AREA: '정찰 구역은 보드 안 3×3이어야 해요.',
  BAD_CELL: '그 칸에는 덫을 놓을 수 없어요.', OCCUPIED_BY_YOU: '그 칸에는 이미 우리 덫이 있어요.', NOT_YOURS: '우리 팀 덫만 옮길 수 있어요.',
  ALREADY_CONFIRMED: '이미 설치를 확정했어요.', BAD_REQUEST: '요청이 올바르지 않아요.',
  ADMIN_DENIED: '관리자 비밀번호가 맞지 않아요.', ADMIN_DISABLED: '서버에 관리자 비밀번호가 설정되지 않았어요.', ADMIN_RATE_LIMITED: '비밀번호를 너무 여러 번 시도했어요. 1분 뒤 다시 해 주세요.',
  BAD_FILE: '파일 형식이 맞지 않아요.', TOO_LARGE: '보낸 내용이 너무 커요.', NOT_FOUND: '찾을 수 없어요.'
};
export const errText = (code: string) => ERROR_TEXT[code] ?? `문제가 생겼어요 (${code})`;
