/**
 * e2e.ts — 실제 Worker+DO+D1 에서 한 판을 끝까지 (교사 1 · TV 1 · 팀 8, HTTP + 소켓).
 *   BASE=http://localhost:8787 ADMIN_PASSWORD=... node scripts/e2e.ts
 * 문제은행 세트 'E2E' 가 D1 에 있어야 한다(scripts/e2e-seed.sql).
 */
export {};
const base = process.env.BASE ?? 'http://localhost:8787';
const admin = process.env.ADMIN_PASSWORD ?? '';
const fail = (m: string): never => { console.error('✖ ' + m); process.exit(1); };
const okc = (m: string) => console.log('✔ ' + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let rid = 0;
async function api(path: string, headers: Record<string, string>, body?: unknown, method = 'POST') {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: r.status, body: await r.json() as any };
}

// 1. 판 생성
const created = await api('/api/game', { 'X-Admin-Password': admin }, { title: 'E2E 판', setName: 'E2E', durationMin: 5, moveSec: 10, quizSec: 20, setupSec: 60 });
if (!created.body.ok) fail('판 생성 ' + JSON.stringify(created.body));
const { code, hostKey, tvKey, pins } = created.body.data;
okc(`판 생성 ${code} (경고 ${created.body.data.warnings.length}개)`);
const H = { 'X-Host-Key': hostKey };
const teacher = (cmd: unknown) => api(`/api/game/${code}/teacher`, H, { cmd, requestId: 'r' + (++rid) });

// 2. 소켓: 교사·TV·팀 8
const latest: Record<string, any> = {};
const sockets: Record<string, WebSocket> = {};
function connect(name: string, hello: unknown) {
  return new Promise<void>((res, rej) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws/' + code);
    sockets[name] = ws;
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.type === 'state') { latest[name] = m.data; res(); } };
    ws.onclose = (e) => { latest[name + ':closed'] = e.code; rej(new Error(name + ' closed ' + e.code)); };
    setTimeout(() => rej(new Error(name + ' timeout')), 8000);
  });
}
await connect('teacher', { type: 'hello', role: 'teacher', key: hostKey });
await connect('tv', { type: 'hello', role: 'tv', key: tvKey });
const tokens: string[] = [];
for (let t = 0; t < 8; t++) {
  const j = await api(`/api/game/${code}/join`, { 'X-Team-Pin': pins[t] }, { team: t });
  if (!j.body.ok || j.body.data.role !== 'controller') fail('입장 ' + t);
  tokens[t] = j.body.data.token;
  await connect('team' + t, { type: 'hello', role: 'team', team: t, pin: pins[t], token: tokens[t] });
}
okc('교사·TV·팀 8 소켓 연결, 팀 8 조작권 획득');
const viewer = await api(`/api/game/${code}/join`, { 'X-Team-Pin': pins[0] }, { team: 0 });
if (viewer.body.data.role !== 'viewer') fail('두 번째 기기는 관람자여야 함');
okc('같은 팀 두 번째 기기 = 관람자');
const badPin = await api(`/api/game/${code}/join`, { 'X-Team-Pin': '0000' === pins[1] ? '1111' : '0000' }, { team: 1 });
if (badPin.body.ok) fail('틀린 PIN 입장');
const team = (t: number, cmd: unknown) => api(`/api/game/${code}/team`, { 'X-Team-Pin': pins[t], 'X-Control-Token': tokens[t] }, { team: t, cmd, requestId: 't' + t + '-' + (++rid) });

// 3. 추첨·설치·시작
for (const c of [{ type: 'draw' }, { type: 'startSetup' }]) { const r = await teacher(c); if (!r.body.ok) fail(JSON.stringify(c) + JSON.stringify(r.body)); }
await sleep(300);
const myTraps = latest.team0.me.traps;
if (myTraps.length !== 13) fail('팀0 자기 덫 13개가 아님');
const others = JSON.stringify(latest.team0).match(/"traps":\[[^\]]*\]/g) ?? [];
if (others.length !== 1) fail('팀 뷰에 덫 목록이 하나만 있어야 함');
if (JSON.stringify(latest.tv).includes('"traps"')) fail('TV 뷰에 덫 목록');
okc('설치 단계: 팀은 자기 덫 13개만, TV 에는 덫 없음');
for (let t = 0; t < 8; t++) await team(t, { type: 'trapConfirm' });
const start = await teacher({ type: 'startGame' });
if (!start.body.ok) fail('시작 ' + JSON.stringify(start.body));
await sleep(300);
if (latest.tv.phase !== 'RUNNING' || latest.tv.step !== 'MOVE_OPEN') fail('TV 가 진행 상태를 못 받음');
okc('시작 → 모든 화면에 푸시');

// 4. 라운드 3개: 덫 칸 우선 이동, 문제는 전원 1번 답
const neighbors = (c: number) => { const r = Math.floor(c / 16), cc = c % 16, out: number[] = []; for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) { const a = r + dr, b = cc + dc; if (a >= 0 && a < 16 && b >= 0 && b < 16) out.push(a * 16 + b); } return out; };
let quizzes = 0;
for (let r = 0; r < 3; r++) {
  const round = latest.teacher.round;
  for (let t = 0; t < 8; t++) {
    const pos = latest['team' + t].teams[t].pos;
    const res = await team(t, { type: 'move', round, to: neighbors(pos)[0] });
    if (!res.body.ok && res.body.error !== 'BOUND') fail('이동 ' + JSON.stringify(res.body));
  }
  await sleep(300);
  if (latest.teacher.step === 'QUESTION_OPEN') {
    const qround = latest.teacher.round;
    for (let t = 0; t < 8; t++) if (latest['team' + t].me.question) {
      quizzes++;
      if (JSON.stringify(latest['team' + t]).includes('"answer":1') && !latest['team' + t].me.answer) fail('정답 키가 문항과 함께 샘');
      await team(t, { type: 'answer', round: qround, choice: 1 });
    }
    await sleep(300);
  }
  if (latest.teacher.step !== 'ROUND_SUMMARY') fail('결과 단계가 아님: ' + latest.teacher.step);
  await teacher({ type: 'next', round: latest.teacher.round });
  await sleep(200);
}
okc(`3라운드 진행(문제 ${quizzes}개), 모든 화면 동기화`);

// 5. 자격: TV 열쇠 재발급 → TV 소켓 끊김 / 조작권 해제 → 이전 토큰 거부
const tvClosed = new Promise<number>((res) => { sockets.tv.onclose = (e) => res(e.code); });
await teacher({ type: 'reissueTv' });
if ((await Promise.race([tvClosed, sleep(3000).then(() => -1)])) !== 4001) fail('TV 재발급 후 소켓이 끊기지 않음');
okc('TV 열쇠 재발급 → 기존 TV 소켓 끊김(4001)');
await teacher({ type: 'releaseControl', team: 2 });
const stale = await team(2, { type: 'move', round: latest.teacher.round, to: 0 });
if (stale.body.error !== 'NOT_CONTROLLER') fail('해제 후 이전 토큰이 통함: ' + JSON.stringify(stale.body));
await sleep(200);
if (latest.team2.me.controller !== false) fail('해제 후 소켓이 관람자로 강등되지 않음');
okc('조작권 해제 → 이전 토큰 거부, 소켓은 관람자로 강등');

// 6. 일시정지·종료·복습
await teacher({ type: 'pause' }); await sleep(200);
if (!latest.teacher.paused) fail('일시정지');
await teacher({ type: 'finish' }); await sleep(200);
if (latest.teacher.phase !== 'FINISHED' || !latest.teacher.final) fail('종료 후 교사 최종 기록');
if (latest.team0.trapMap !== null) fail('공개 전 팀에 덫 지도');
await teacher({ type: 'review' }); await teacher({ type: 'revealTraps' }); await sleep(200);
if (!Array.isArray(latest.team0.trapMap) || latest.team0.trapMap.length !== 104) fail('공개 후 덫 지도 104개');
okc('일시정지·종료·덫 지도 공개');
for (const ws of Object.values(sockets)) { try { ws.close(); } catch {} }
console.log('\nE2E 통과');
process.exit(0);
