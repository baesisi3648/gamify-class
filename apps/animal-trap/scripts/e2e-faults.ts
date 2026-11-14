/**
 * e2e-faults.ts — 실제 Worker+DO+D1(wrangler dev --local)에서 장애 상황을 재현한다 (DESIGN §11 7단계).
 *
 *   npm run build && node scripts/e2e-faults.ts
 *
 * 스크립트가 wrangler dev 를 **직접 띄우고, 판 중간에 프로세스를 죽였다가 다시 띄운다**(같은 --persist-to).
 * 문제 세트는 관리 API 로 넣는다(빈 임시 저장소에서 시작).
 *
 *  1. 덫 칸 착지 강제(팀0 덫을 출발 칸 옆으로 옮겨 그 칸으로 이동) → 같은 requestId 재전송은 상태 불변·성공,
 *     새 requestId 의 두 번째 이동은 ALREADY_MOVED, 나머지 7팀 동시 이동
 *  2. 문제 미제출 → 문제 시간이 지나면 서버 alarm 이 오답 처리(점수 −2)
 *  3. 소켓 강제 끊김 사이에 바뀐 상태를 재접속 즉시 받음, 조작권 유지
 *  4. 일시정지 중에는 이동 시간이 지나도 마감 안 됨, 재개 후 남은 시간 유지
 *  5. 아무도 안 움직이면 alarm 이 이동 단계를 스스로 마감
 *  6. wrangler 프로세스 재시작 → 같은 판·점수·위치·조작권 복원, 재시작 뒤 **새로 연** 이동 단계도 alarm 이 마감
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 8795);
const base = `http://localhost:${PORT}`;
const admin = 'fault-e2e-pass';
const persist = mkdtempSync(join(tmpdir(), 'at-fault-'));
const fail = (m: string): never => { console.error('✖ ' + m); stopServer(); process.exit(1); };
const okc = (m: string) => console.log('✔ ' + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: ChildProcess | null = null;
let boots = 0;
async function startServer() {
  server = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist, '--var', `ADMIN_PASSWORD:${admin}`], { stdio: 'ignore', detached: true });
  boots++;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/admin/sets', { headers: { 'X-Admin-Password': admin } })).ok) return; } catch { /* 아직 */ } await sleep(500); }
  fail('wrangler dev 가 뜨지 않음');
}
function stopServer() { if (server?.pid) { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* */ } } server = null; }
async function restartServer() {
  const old = server?.pid; stopServer();
  for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/admin/sets'); } catch { break; } await sleep(250); } // 정말 내려갔는지
  await startServer();
  if (server?.pid === old) fail('재시작 안 됨');
}

let rid = 0;
async function api(path: string, headers: Record<string, string>, body?: unknown) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: r.status, body: await r.json() as any };
}
const latest: Record<string, any> = {};
const sockets: Record<string, WebSocket> = {};
function connect(code: string, name: string, hello: unknown) {
  return new Promise<void>((res, rej) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws/' + code);
    sockets[name] = ws;
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.type === 'state') { latest[name] = m.data; res(); } };
    ws.onclose = (e) => rej(new Error(name + ' closed ' + e.code));
    setTimeout(() => rej(new Error(name + ' timeout')), 8000);
  });
}
const closeAll = () => { for (const ws of Object.values(sockets)) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* */ } } };
const until = async (what: string, cond: () => boolean, ms: number) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) fail(what + ' (시간 초과)'); await sleep(100); } };
const neighbors = (c: number) => { const r = Math.floor(c / 16), cc = c % 16, out: number[] = []; for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) { const a = r + dr, b = cc + dc; if (a >= 0 && a < 16 && b >= 0 && b < 16) out.push(a * 16 + b); } return out; };
const snapshot = (v: any) => JSON.stringify(v.teams.map((t: any) => [t.pos, t.score]));

try {
  const mig = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'animal-trap', '--local', '--persist-to', persist], { encoding: 'utf8' });
  if (mig.status !== 0) fail('마이그레이션 ' + mig.stderr);
  await startServer();
  const qs = Array.from({ length: 30 }, (_, i) => ({ difficulty: ['easy', 'medium', 'hard'][i % 3], question: '장애 문제 ' + i, choices: ['가', '나', '다', '라'], answer: 1 }));
  if (!(await api('/api/admin/import', { 'X-Admin-Password': admin }, { json: { title: 'FAULT', questions: qs }, mode: 'add' })).body.ok) fail('문제 넣기');

  const MOVE_SEC = 15, QUIZ_SEC = 20;
  const created = await api('/api/game', { 'X-Admin-Password': admin }, { title: '장애 E2E', setName: 'FAULT', durationMin: 15, moveSec: MOVE_SEC, quizSec: QUIZ_SEC, setupSec: 60 });
  if (!created.body.ok) fail('판 생성 ' + JSON.stringify(created.body));
  const { code, hostKey, pins } = created.body.data as { code: string; hostKey: string; pins: string[] };
  const teacher = (cmd: unknown) => api(`/api/game/${code}/teacher`, { 'X-Host-Key': hostKey }, { cmd, requestId: 'r' + (++rid) });
  await connect(code, 'teacher', { type: 'hello', role: 'teacher', key: hostKey });
  const tokens: string[] = [];
  for (let t = 0; t < 8; t++) {
    tokens[t] = (await api(`/api/game/${code}/join`, { 'X-Team-Pin': pins[t] }, { team: t })).body.data.token;
    await connect(code, 'team' + t, { type: 'hello', role: 'team', team: t, pin: pins[t], token: tokens[t] });
  }
  const team = (t: number, cmd: unknown, requestId = 't' + t + '-' + (++rid)) => api(`/api/game/${code}/team`, { 'X-Team-Pin': pins[t], 'X-Control-Token': tokens[t] }, { team: t, cmd, requestId });
  await teacher({ type: 'draw' }); await teacher({ type: 'startSetup' });
  await until('설치 단계', () => latest.team0?.phase === 'TRAP_SETUP', 3000);

  // 팀0 덫 하나를 출발 칸 옆으로 → 1라운드에 그 칸으로 가면 반드시 문제(자기 덫도 센다)
  const spawn0 = latest.team0.teams[0].pos as number;
  let trapCell = -1;
  for (const c of neighbors(spawn0)) {
    if (latest.team0.me.traps.some((x: any) => x.cell === c)) { trapCell = c; break; }
    const r = await team(0, { type: 'trapMove', trapId: latest.team0.me.traps[0].id, to: c });
    if (r.body.ok) { trapCell = c; break; }
  }
  if (trapCell < 0) fail('출발 칸 옆에 덫을 놓지 못함');
  await Promise.all(Array.from({ length: 8 }, (_, t) => team(t, { type: 'trapConfirm' })));
  if (!(await teacher({ type: 'startGame' })).body.ok) fail('시작');
  await until('진행 시작', () => latest.teacher?.step === 'MOVE_OPEN', 3000);

  // 1. 재전송·중복 이동
  const round = latest.teacher.round;
  const first = await team(0, { type: 'move', round, to: trapCell }, 'same-id');
  if (!first.body.ok) fail('팀0 이동 ' + JSON.stringify(first.body));
  await sleep(200);
  const sv = latest.teacher.stateVersion;
  const resend = await team(0, { type: 'move', round, to: neighbors(spawn0).find((c) => c !== trapCell) }, 'same-id');
  await sleep(300);
  if (!resend.body.ok) fail('같은 requestId 재전송이 오류: ' + JSON.stringify(resend.body));
  if (latest.teacher.stateVersion !== sv) fail('같은 requestId 재전송이 상태를 바꿈');
  const second = await team(0, { type: 'move', round, to: neighbors(spawn0).find((c) => c !== trapCell) });
  if (second.body.error !== 'ALREADY_MOVED') fail('새 requestId 두 번째 이동이 거절되지 않음: ' + JSON.stringify(second.body));
  okc('같은 requestId 재전송 = 성공·상태 불변, 새 requestId 두 번째 이동 = ALREADY_MOVED');
  const rest = await Promise.all(Array.from({ length: 7 }, (_, i) => team(i + 1, { type: 'move', round, to: neighbors(latest['team' + (i + 1)].teams[i + 1].pos)[0] })));
  if (rest.some((m) => !m.body.ok && m.body.error !== 'BOUND')) fail('동시 이동 ' + JSON.stringify(rest.map((m) => m.body)));
  okc('나머지 7팀 동시 이동 처리');

  // 2. 문제 미제출 → alarm 이 시간 초과 오답
  await until('문제 단계', () => latest.teacher.step === 'QUESTION_OPEN' || latest.teacher.step === 'ROUND_SUMMARY', 3000);
  if (latest.teacher.step !== 'QUESTION_OPEN' || !latest.team0.me.question) fail('덫 칸에 착지했는데 문제가 열리지 않음');
  const others = Array.from({ length: 7 }, (_, i) => i + 1).filter((t) => latest['team' + t].me.question);
  await Promise.all(others.map((t) => team(t, { type: 'answer', round, choice: 1 })));
  const tq = Date.now();
  await until('문제 시간 초과 자동 마감', () => latest.teacher.step === 'ROUND_SUMMARY', QUIZ_SEC * 1000 + 4000);
  const s0 = latest.teacher.teams[0].score;
  // 덫 n개 오답 = −(n+1). 그 칸에 다른 팀 자동 배치 덫이 겹칠 수 있어 n ≥ 1
  if (!Number.isInteger(s0) || s0 > -2) fail(`팀0 미제출 = 오답 −(n+1) 이어야 함 (지금 ${s0})`);
  okc(`팀0 문제 미제출 → ${((Date.now() - tq) / 1000).toFixed(1)}초 뒤 서버가 시간 초과 오답 처리(점수 ${s0})`);
  await teacher({ type: 'next', round: latest.teacher.round });
  await until('2라운드', () => latest.teacher.step === 'MOVE_OPEN', 3000);

  // 3. 소켓 강제 끊김
  const before = latest.team3.stateVersion;
  sockets.team3.onclose = null; sockets.team3.onmessage = null; sockets.team3.close();
  await teacher({ type: 'pause' }); await teacher({ type: 'resume' });
  await connect(code, 'team3', { type: 'hello', role: 'team', team: 3, pin: pins[3], token: tokens[3] });
  if (latest.team3.stateVersion <= before || latest.team3.me.controller !== true) fail('재접속 후 최신 상태·조작권');
  okc('소켓이 끊긴 사이 바뀐 상태를 재접속 즉시 받고, 조작권도 그대로');

  // 3-2. 한 팀이 소켓을 계속 열어도 교사·다른 팀 자리는 그대로 (팀당 7칸, 넘치면 그 팀의 가장 오래된 소켓이 4003)
  const kicked: number[] = [];
  const extra: WebSocket[] = [];
  for (let i = 0; i < 12; i++) {
    await new Promise<void>((res, rej) => {
      const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws/' + code); extra.push(ws);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'team', team: 1, pin: pins[1], token: '' }));
      ws.onmessage = () => res();
      ws.onclose = (e) => { if (e.code === 4003) kicked.push(i); };
      setTimeout(() => rej(new Error('extra socket timeout')), 5000);
    });
  }
  sockets.team1.onclose = (e) => { if (e.code === 4003) kicked.push(-1); };
  await sleep(500);
  const open1 = extra.filter((w) => w.readyState === WebSocket.OPEN).length;
  if (open1 > 7) fail(`팀1 소켓이 칸 한도를 넘음 (${open1})`);
  await connect(code, 'teacher2', { type: 'hello', role: 'teacher', key: hostKey });
  await connect(code, 'team6b', { type: 'hello', role: 'team', team: 6, pin: pins[6], token: '' });
  if (sockets.teacher.readyState !== WebSocket.OPEN || sockets.team2.readyState !== WebSocket.OPEN) fail('다른 역할 소켓이 밀려남');
  okc(`팀1이 소켓 12개를 더 열어도 추가분 중 ${open1}개만 열려 있고 나머지는 4003 으로 밀려남, 교사·다른 팀 접속 정상`);
  for (const w of extra) { w.onclose = null; try { w.close(); } catch { /* */ } }

  // 4. 일시정지
  await teacher({ type: 'pause' });
  await until('일시정지', () => latest.teacher.paused === true, 2000);
  const leftAtPause = latest.teacher.phaseRemainingMs as number;
  const r2 = latest.teacher.round;
  await sleep(leftAtPause + 1500);
  if (latest.teacher.step !== 'MOVE_OPEN' || latest.teacher.round !== r2) fail('일시정지 중에 마감됨');
  await teacher({ type: 'resume' });
  await until('재개', () => latest.teacher.paused === false, 2000);
  if (Math.abs((latest.teacher.phaseRemainingMs as number) - leftAtPause) > 1500) fail(`재개 후 남은 시간 ${leftAtPause} → ${latest.teacher.phaseRemainingMs}`);
  okc(`일시정지 동안(${((leftAtPause + 1500) / 1000).toFixed(0)}초) 마감 안 됨, 재개 후 남은 시간 유지`);

  // 5. 아무도 안 움직이면 alarm 이 이동 마감
  const t0 = Date.now();
  await until('alarm 이동 마감', () => latest.teacher.step === 'ROUND_SUMMARY', leftAtPause + 4000);
  okc(`아무도 안 움직여도 ${((Date.now() - t0) / 1000).toFixed(1)}초 뒤 서버가 이동 단계를 마감`);
  await teacher({ type: 'next', round: latest.teacher.round });
  await until('3라운드', () => latest.teacher.step === 'MOVE_OPEN', 3000);

  // 6. 프로세스 재시작
  const saved = { round: latest.teacher.round, sv: latest.teacher.stateVersion, snap: snapshot(latest.teacher) };
  closeAll();
  await restartServer();
  await connect(code, 'teacher', { type: 'hello', role: 'teacher', key: hostKey });
  const v = latest.teacher;
  if (v.round !== saved.round || v.stateVersion < saved.sv) fail(`복원: ${JSON.stringify({ saved, now: { round: v.round, sv: v.stateVersion, step: v.step } })}`);
  if (snapshot(v) !== saved.snap) fail('재시작 뒤 점수·위치가 다름');
  okc(`wrangler 재시작(${boots}번째 기동) 뒤 같은 판 복원: 라운드 ${v.round} ${v.step}, 점수·위치 동일`);
  await connect(code, 'team5', { type: 'hello', role: 'team', team: 5, pin: pins[5], token: tokens[5] });
  if (latest.team5.me.controller !== true) fail('재시작 뒤 조작권 토큰 무효');
  okc('재시작 뒤 팀 조작권 토큰 유지');
  if (v.step === 'MOVE_OPEN') await until('재시작 전 단계 마감', () => latest.teacher.step === 'ROUND_SUMMARY', MOVE_SEC * 1000 + 5000);
  await teacher({ type: 'next', round: latest.teacher.round });
  await until('재시작 뒤 새 라운드', () => latest.teacher.step === 'MOVE_OPEN', 3000);
  const t1 = Date.now();
  await until('재시작 뒤 새 alarm', () => latest.teacher.step === 'ROUND_SUMMARY', MOVE_SEC * 1000 + 4000);
  okc(`재시작 뒤 새로 연 이동 단계도 ${((Date.now() - t1) / 1000).toFixed(1)}초 뒤 alarm 이 마감`);

  closeAll();
  stopServer();
  try { rmSync(persist, { recursive: true, force: true }); } catch { /* */ }
  console.log('\n장애 E2E 통과');
  process.exit(0);
} catch (e) {
  fail(String((e as Error)?.stack ?? e));
}
