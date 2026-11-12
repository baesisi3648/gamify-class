import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { handle } from '../server/api.js';
import { passwordHash } from '../server/auth.js';
import { ReportSaver } from '../autosave.js';

// Regression tests for the "30 students log in at once" outage:
// each login must be a single storage round trip.
async function setup(extraEnv = {}) {
  const f = fixture(), calls = [];
  const env = { LAB_SESSION_SECRET:'concurrency-test-secret', LAB_ADMIN_HASH:await passwordHash('root-test-only'), ...extraEnv };
  const repo = { execute:async (a, p, u) => { calls.push(a); return f.run(a, p, u || {}); } };
  f.run('students.import', { students:[{ year:2026, grade:2, classNo:3, number:7, name:'동시학생', password:undefined, passwordHash:await passwordHash('4321') }] });
  const request = async (action, payload, headers = {}) => {
    const r = await handle(new Request('https://lab.test/api/lab/rpc', { method:'POST', headers:{ 'Content-Type':'application/json', Origin:'https://lab.test', ...headers }, body:JSON.stringify({ action, payload }) }), env, repo);
    return { status:r.status, body:await r.json(), cookie:(r.headers.get('Set-Cookie') || '').split(';')[0] };
  };
  return { f, calls, request };
}
const who = { year:2026, grade:2, classNo:3, number:7, name:'동시학생' };

test('학생 로그인은 저장소 왕복 1회이며 응답에 해시가 없다', async () => {
  const { calls, request } = await setup();
  const ok = await request('login', { ...who, password:'4321' });
  assert.equal(ok.status, 200); assert.deepEqual(calls, ['auth.login']);
  assert.equal(ok.body.result.name, '동시학생'); assert.equal(ok.body.result.groupId, 'legacy');
  assert.ok(!JSON.stringify(ok.body).includes('passwordHash'));
  calls.length = 0;
  assert.equal((await request('myReports', {}, { Cookie:ok.cookie })).status, 200);
  assert.equal((await request('login', { ...who, password:'0000' })).status, 401);
  assert.equal((await request('login', { ...who, name:'없는학생', password:'4321' })).status, 401);
});

test('(구 화면) PIN 등록 버튼 경로도 동작: 조회 1회 + 등록 1회', async () => {
  const { f, calls, request } = await setup();
  f.run('students.import', { students:[{ year:2026, grade:2, classNo:3, number:8, name:'새학생' }] });
  const base = { year:2026, grade:2, classNo:3, number:8, name:'새학생', password:'1111', pinConfirm:'1111', setupPin:true };
  const ok = await request('login', base);
  assert.equal(ok.status, 200); assert.deepEqual(calls, ['auth.login','auth.login']); assert.equal(ok.body.result.pinRegistered, true);
  assert.equal((await request('login', base)).status, 409);
  assert.equal((await request('login', { ...base, setupPin:false })).status, 200);
});

test('교사 로그인(전체·그룹)도 왕복 1회', async () => {
  const { f, calls, request } = await setup();
  const root = await request('login', { role:'teacher', password:'root-test-only' });
  assert.equal(root.status, 200); assert.equal(root.body.result.owner, true); assert.deepEqual(calls, ['auth.login']);
  f.run('groups.create', { year:2026, semester:'2', subject:'생명', school:'가상', passwordHash:await passwordHash('group-pass-1') }, { role:'teacher', owner:true, groupId:'legacy' });
  const id = f.db.all('Settings').find((r) => r.id.startsWith('group:')).value.id;
  calls.length = 0;
  const g = await request('login', { role:'teacher', groupId:id, password:'group-pass-1' });
  assert.equal(g.status, 200); assert.equal(g.body.result.owner, false); assert.deepEqual(calls, ['auth.login']);
  assert.equal((await request('login', { role:'teacher', groupId:id, password:'root-test-only' })).status, 401);
  assert.equal((await request('login', { role:'teacher', groupId:'missing-group', password:'x' })).status, 401);
});

test('Cloudflare 제한기가 있으면 Sheets 카운터를 쓰지 않고, 없으면 같은 요청에 포함', async () => {
  let allow = true;
  const limiter = { limit:async () => ({ success:allow }) };
  const a = await setup({ LOGIN_IP_LIMITER:limiter, LOGIN_ID_LIMITER:limiter });
  assert.equal((await a.request('login', { ...who, password:'4321' })).status, 200);
  assert.ok(!a.f.db.all('Settings').some((r) => r.id.startsWith('rate:')));
  allow = false;
  assert.equal((await a.request('login', { ...who, password:'4321' })).status, 429);
  const b = await setup();
  for (let i = 0; i < 10; i++) await b.request('login', { ...who, password:'0000' });
  const blocked = await b.request('login', { ...who, password:'4321' });
  assert.equal(blocked.status, 429); assert.ok(b.f.db.all('Settings').some((r) => r.id.startsWith('rate:')));
});

test('report.meta는 본인 보고서만, 교사는 같은 그룹만', () => {
  const f = fixture();
  const r = f.run('report.open', { assessmentId:'enzyme-structure' }, f.student);
  assert.deepEqual(Object.keys(f.run('report.meta', { id:r.id }, f.student)).sort(), ['id','status','studentId']);
  assert.throws(() => f.run('report.meta', { id:r.id }, f.other), /찾을 수 없/);
  assert.equal(f.run('report.meta', { id:r.id }, { role:'teacher', owner:true }).id, r.id);
  assert.throws(() => f.run('report.meta', { id:r.id }, { role:'teacher', groupId:'other' }), /그룹/);
});

test('자동저장: 입력 멈춘 뒤 저장, 검증 오류는 재시도하지 않음', async () => {
  let sends = 0;
  const saver = new ReportSaver({ id:'r', version:0, content:{} }, async () => { sends++; throw Object.assign(new Error('형식 오류'), { status:400 }); }, () => {}, () => {});
  saver.change({ a:'1' });
  assert.equal(sends, 0);
  assert.equal(await saver.flush(), false); saver.stop();
  assert.equal(sends, 1); assert.equal(saver.retries, 0);
  let fails = 0;
  const busy = new ReportSaver({ id:'r', version:0, content:{} }, async () => { fails++; throw Object.assign(new Error('혼잡'), { status:503 }); }, () => {}, () => {});
  busy.change({ a:'1' }); assert.equal(await busy.flush(), false); busy.stop();
  assert.equal(fails, 1); assert.equal(busy.retries, 1);
});

test('브라우저가 보낸 claimHash는 무시되고, 실패한 로그인은 PIN을 바꾸지 않음', async () => {
  const { f, request } = await setup();
  f.run('students.import', { students:[{ year:2026, grade:2, classNo:3, number:9, name:'공격대상' }] });
  const evil = await passwordHash('9999');
  const r = await request('login', { year:2026, grade:2, classNo:3, number:9, name:'공격대상', password:'abc', claimHash:evil, rateKeys:[] });
  assert.equal(r.status, 400);
  assert.equal(f.db.all('Students').find((s) => s.number === 9).passwordHash, null);
});

test('PIN 없는 학생은 일반 로그인에 입력한 숫자 4자리가 PIN이 됨', async () => {
  const { f, calls, request } = await setup();
  f.run('students.import', { students:[{ year:2026, grade:2, classNo:3, number:10, name:'첫학생' }] });
  const who10 = { year:2026, grade:2, classNo:3, number:10, name:'첫학생' };
  assert.equal((await request('login', { ...who10, password:'abcdefgh' })).status, 400);
  calls.length = 0;
  const first = await request('login', { ...who10, password:'2468' });
  assert.equal(first.status, 200); assert.equal(first.body.result.pinCreated, true); assert.equal(first.body.result.pinRegistered, true);
  assert.deepEqual(calls, ['auth.login', 'auth.login']);
  assert.equal((await request('login', { ...who10, password:'1357' })).status, 401);
  calls.length = 0;
  const again = await request('login', { ...who10, password:'2468' });
  assert.equal(again.status, 200); assert.equal(again.body.result.pinCreated, undefined); assert.deepEqual(calls, ['auth.login']);
});

test('30명 동시 로그인: 모두 성공, 학생당 왕복 1회', async () => {
  const { f, calls, request } = await setup();
  const hash = await passwordHash('1234');
  f.run('students.import', { students:Array.from({ length:30 }, (_, i) => ({ year:2026, grade:2, classNo:5, number:i + 1, name:'동시' + (i + 1), passwordHash:hash })) });
  calls.length = 0;
  const results = await Promise.all(Array.from({ length:30 }, (_, i) => request('login', { year:2026, grade:2, classNo:5, number:i + 1, name:'동시' + (i + 1), password:'1234' })));
  assert.ok(results.every((r) => r.status === 200)); assert.equal(calls.length, 30);
});
