/**
 * smoke.ts — 배포된(또는 wrangler dev) 앱에서 D1·DO SQLite·alarm·WebSocket 이 실제로 도는지 확인.
 *   BASE=https://animal-trap.<계정>.workers.dev ADMIN_PASSWORD=... node scripts/smoke.ts
 * (서버에 SMOKE_ENABLED=1 이 켜져 있어야 한다. 확인이 끝나면 끈다 — README)
 * 비밀번호는 환경 변수로만 받는다(명령줄 인자는 셸 기록에 남는다).
 */
export {};
const base = process.env.BASE ?? 'http://localhost:8787';
const pw = process.env.ADMIN_PASSWORD ?? '';
if (!pw) { console.error('ADMIN_PASSWORD 환경 변수가 필요합니다'); process.exit(2); }
const H = { 'X-Admin-Password': pw };
const fail = (m: string): never => { console.error('✖ ' + m); process.exit(1); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(base + path, { ...init, signal: AbortSignal.timeout(10000) });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};

// 1. 공개 경로
const v = await get('/api/version');
if (!v.body?.ok) fail('version ' + v.status);
console.log('✔ version', v.body.data.v);

// 2. 인증: 없음 / 틀림 / 쿼리로 보냄 → 전부 거부
for (const [label, path, init] of [
  ['비밀번호 없음', '/api/_smoke', { method: 'POST' }],
  ['틀린 비밀번호', '/api/_smoke', { method: 'POST', headers: { 'X-Admin-Password': pw + 'x' } }],
  ['쿼리로 보낸 비밀번호', '/api/_smoke?admin=' + encodeURIComponent(pw), { method: 'POST' }]
] as const) {
  const r = await get(path, init as RequestInit);
  if (r.status !== 401) fail(`${label}인데 ${r.status}`);
  console.log(`✔ ${label} → 401`);
}

// 3. D1 실제 테이블 + DO SQLite 카운터
const r1 = await get('/api/_smoke', { method: 'POST', headers: H });
if (!r1.body?.ok) fail('점검 통로 ' + r1.status + ' (SMOKE_ENABLED=1 인가?) ' + JSON.stringify(r1.body));
if (typeof r1.body.data.d1Questions !== 'number') fail('D1 questions 테이블 없음 — migration 적용 필요');
const r2 = await get('/api/_smoke', { method: 'POST', headers: H });
if (r2.body.data.room.count !== r1.body.data.room.count + 1) fail('SQLite 카운터가 이어지지 않음');
console.log(`✔ D1 questions 테이블(${r1.body.data.d1Questions}행), DO SQLite 카운터 ${r1.body.data.room.count} → ${r2.body.data.room.count}`);

// 4. alarm: 이번에 예약한 시각 이후의 발화를 최대 15초 기다린다
const alarmAt = r2.body.data.room.alarmAt as number;
let fired: number | null = null;
const alarmDeadline = Date.now() + 15000;
while (fired === null && Date.now() < alarmDeadline) {
  await sleep(500);
  const left = Math.max(500, alarmDeadline - Date.now());
  const st = await fetch(base + '/api/_smoke', { headers: H, signal: AbortSignal.timeout(left) }).then((r) => r.json() as Promise<any>).catch(() => null);
  if (st?.data?.lastAlarmAt >= alarmAt) fired = st.data.lastAlarmAt;
}
if (fired === null) fail("alarm 이 15초 안에 발화하지 않음");
console.log(`✔ alarm 발화 (예약보다 ${(fired as number) - alarmAt}ms 늦게)`);

// 5. WebSocket: 헤더 없는 연결 거부, 헤더 있는 연결은 welcome·pong
const wsUrl = base.replace(/^http/, 'ws') + '/ws/_smoke';
const openSocket = (headers: Record<string, string>) => new Promise<{ ws: WebSocket; first: any } | { rejected: true }>((res) => {
  const ws = new (WebSocket as any)(wsUrl, { headers }) as WebSocket;
  const t = setTimeout(() => { try { ws.close(); } catch {} res({ rejected: true }); }, 8000);
  ws.onmessage = (e) => { clearTimeout(t); res({ ws, first: JSON.parse(String(e.data)) }); };
  ws.onerror = () => { clearTimeout(t); res({ rejected: true }); };
  ws.onclose = () => { clearTimeout(t); res({ rejected: true }); };
});
const noAuth = await openSocket({});
if (!('rejected' in noAuth)) fail('인증 없는 소켓이 열림');
console.log('✔ 인증 없는 소켓 거부');
const opened = await openSocket(H);
if ('rejected' in opened || opened.first.type !== 'welcome') fail('관리자 소켓 연결 실패');
const { ws, first } = opened as { ws: WebSocket; first: any };
const ask = () => new Promise<any>((res, rej) => {
  const t = setTimeout(() => rej(new Error('pong 시간 초과')), 8000);
  ws.onmessage = (e) => { clearTimeout(t); res(JSON.parse(String(e.data))); };
  ws.send(JSON.stringify({ type: 'ping' }));
});
const p1 = await ask();
if (p1.type !== 'pong') fail('ping → ' + p1.type);
console.log('✔ WebSocket welcome·pong');

// 6. hibernation: 쉬었다가 같은 소켓으로 ping. bootId 가 바뀌었으면 인스턴스가 새로 떠서 복원된 것
const idleMs = Number(process.env.IDLE_MS ?? 20000);
await sleep(idleMs);
const p2 = await ask().catch((e) => fail(String(e)));
if (p2.type !== 'pong') fail('유휴 후 ping 실패');
const c3 = (await get('/api/_smoke', { method: 'POST', headers: H })).body.data.room.count;
if (c3 !== r2.body.data.room.count + 1) fail('유휴 후 SQLite 값이 이어지지 않음');
if (p2.bootId !== first.bootId) console.log(`✔ ${idleMs / 1000}초 유휴 동안 인스턴스가 새로 떴고(bootId 변경) 같은 소켓·attachment·SQLite 가 복원됨 = hibernation 확인`);
else {
  ws.close();
  console.error(`✖ ${idleMs / 1000}초 동안 인스턴스가 잠들지 않아(bootId 같음) hibernation 을 확인하지 못함 — 소켓·SQLite 는 정상. IDLE_MS 를 늘려 다시 실행`);
  process.exit(3); // 실패가 아니라 '미확인' — 0 으로 끝내지 않는다
}
ws.close();
console.log('\n점검 통과');
