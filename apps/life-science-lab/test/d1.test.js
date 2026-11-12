import test from 'node:test';
import assert from 'node:assert/strict';
import { d1Shim } from './d1-shim.js';
import { handle } from '../server/api.js';
import { handleReportImage } from '../server/report-images.js';
import { d1Repository, exportAll, importAll } from '../server/d1-repository.js';
import { syncToSheets, migrateFromSheets } from '../server/sheets-sync.js';
import { passwordHash } from '../server/auth.js';

const ORIGIN = 'https://lab.test';
async function setup({ ready = true } = {}) {
  const db = d1Shim();
  if (ready) await importAll(db, {}); // = one-time migration of an empty sheet
  const env = { LAB_DB: db, LAB_SESSION_SECRET: 'd1-test-secret', LAB_ADMIN_HASH: await passwordHash('root-test-only'), LAB_SHEETS_URL: 'https://script.google.com/macros/s/test/exec', LAB_SHEETS_SECRET: 'sheet-secret' };
  const call = async (action, payload = {}, cookie = '') => {
    const r = await handle(new Request(ORIGIN + '/api/lab/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie }, body: JSON.stringify({ action, payload }) }), env);
    return { status: r.status, body: await r.json(), cookie: (r.headers.get('Set-Cookie') || '').split(';')[0] };
  };
  const teacher = (await call('login', { role: 'teacher', password: 'root-test-only' })).cookie;
  return { db, env, call, teacher };
}
const roster = (n, classNo = 1) => Array.from({ length: n }, (_, i) => ({ year: 2026, grade: 2, classNo, number: i + 1, name: '학생' + classNo + '-' + (i + 1) }));
const who = (i, classNo = 1) => ({ year: 2026, grade: 2, classNo, number: i, name: '학생' + classNo + '-' + i });
const text = (n) => '효소'.repeat(n);

test('D1: 빈 DB에서 효소 탐구가 자동 준비되고 전체 수행평가 흐름이 동작', async () => {
  const { call, teacher, db } = await setup();
  const boot = await call('bootstrap');
  assert.equal(boot.status, 200); assert.equal(boot.body.result.assessments[0].id, 'enzyme-structure'); assert.equal(boot.body.result.assessments[0].fields.length, 10);
  assert.equal((await call('students.import', { students: roster(2) }, teacher)).status, 200);
  const first = await call('login', { ...who(1), password: '1234' });
  assert.equal(first.status, 200); assert.equal(first.body.result.pinCreated, true);
  const s = first.cookie;
  const report = (await call('report.open', { assessmentId: 'enzyme-structure' }, s)).body.result;
  const fields = boot.body.result.assessments[0].fields;
  const content = Object.fromEntries(fields.map((f) => [f.id, f.type === 'references' ? [{ title: '자료', author: '기관', source: 'https://example.org' }] : text(5)]));
  const saved = await call('report.save', { id: report.id, version: 0, content }, s);
  assert.equal(saved.status, 200); assert.equal(saved.body.result.version, 1);
  assert.equal((await call('report.save', { id: report.id, version: 0, content }, s)).status, 409);
  assert.equal((await call('report.submit', { id: report.id, version: 1, content }, s)).status, 200);
  assert.equal((await call('myReports', {}, s)).body.result.reports[0].status, 'submitted');
  assert.equal((await call('review', { id: report.id, version: 2, status: 'approved', feedback: '좋아요' }, teacher)).status, 200);
  const pub = (await call('publication.generate', { id: report.id }, teacher)).body.result;
  assert.equal((await call('publication.publish', { id: pub.id, version: pub.version, consent: true }, teacher)).status, 200);
  assert.equal((await call('archive')).body.result.works.length, 1);
  assert.equal((await call('reports.list', {}, teacher)).body.result.reports.length, 1);
  assert.equal((await call('login', { ...who(1), password: '1234' })).status, 200);
  assert.equal((await call('login', { ...who(1), password: '9999' })).status, 401);
  const rows = db.raw.prepare('SELECT COUNT(*) c FROM Reports').get().c;
  assert.equal(rows, 1);
});

test('D1: 보고서 휴지통은 연결 기록과 사진을 보존하고 새 보고서와 충돌하지 않을 때 복원한다', async () => {
  const { call, teacher, db, env } = await setup();
  const deletedImages = [];
  env.REPORT_IMAGES = { delete: async (key) => deletedImages.push(key) };
  await call('students.import', { students: roster(1) }, teacher);
  const student = (await call('login', { ...who(1), password: '1234' })).cookie;
  const report = (await call('report.open', { assessmentId: 'enzyme-structure' }, student)).body.result;
  const content = Object.fromEntries(report.fields.map((f) => [f.id, f.type === 'references' ? [{ title: '자료', author: '기관', source: 'https://example.org' }] : '탐구 내용']));
  const submitted = (await call('report.submit', { id: report.id, version: report.version, content }, student)).body.result;
  const approved = (await call('review', { id: report.id, version: submitted.version, status: 'approved' }, teacher));
  assert.equal(approved.status, 200);
  const publication = (await call('publication.generate', { id: report.id }, teacher)).body.result;
  assert.equal((await call('publication.publish', { id: publication.id, version: publication.version, consent: true }, teacher)).status, 200);
  assert.equal((await call('report.delete', { id: report.id, version: submitted.version + 1 }, student)).status, 403);
  assert.equal((await call('report.delete', { id: report.id, version: submitted.version }, teacher)).status, 409);
  assert.equal((await call('report.delete', { id: report.id, version: submitted.version + 1 }, teacher)).status, 200);
  for (const table of ['Reports','Reviews','Publications','PublicationVersions']) assert.equal(db.raw.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c, 0);
  assert.equal((await call('archive')).body.result.works.length, 0);
  assert.equal((await call('myReports', {}, student)).body.result.reports.length, 0);
  assert.equal(deletedImages.length, 0);
  assert.equal((await call('report.trash.list', {}, student)).status, 403);
  const trash = await call('report.trash.list', {}, teacher);
  assert.equal(trash.status, 200); assert.equal(trash.body.result.reports[0].id, report.id);
  const reopened = (await call('report.open', { assessmentId: 'enzyme-structure' }, student)).body.result;
  assert.notEqual(reopened.id, report.id);
  assert.deepEqual(reopened.content, {});
  assert.equal((await call('report.restore', { id: report.id }, teacher)).status, 409);
  assert.equal((await call('report.delete', { id: reopened.id, version: reopened.version }, teacher)).status, 200);
  assert.equal((await call('report.restore', { id: report.id }, teacher)).status, 200);
  assert.equal((await call('myReports', {}, student)).body.result.reports[0].id, report.id);
  assert.equal((await call('archive')).body.result.works.length, 1);
  for (const table of ['Reports','Reviews','Publications','PublicationVersions']) assert.equal(db.raw.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c, 1);
  assert.equal((await call('report.trash.list', {}, teacher)).body.result.reports[0].id, reopened.id);
});

test('D1: 학생 요청은 자기 행만 읽고, 저장은 배치 1번', async () => {
  const { call, teacher, db } = await setup();
  await call('students.import', { students: roster(3) }, teacher);
  const s = (await call('login', { ...who(1), password: '1111' })).cookie;
  const report = (await call('report.open', { assessmentId: 'enzyme-structure' }, s)).body.result;
  db.stats.queries.length = 0; const before = db.stats.batches;
  assert.equal((await call('report.save', { id: report.id, version: 0, content: { topic: '카탈레이스' } }, s)).status, 200);
  assert.equal(db.stats.batches - before, 2, '읽기 1번 + 쓰기 1번');
  assert.ok(!db.stats.queries.some((q) => /FROM (Reports|Students|Reviews|Publications)$/.test(q.trim())), db.stats.queries.join('\n'));
});

test('D1: 30명이 동시에 로그인(첫 PIN)·보고서 열기·저장해도 전부 성공', async () => {
  const { call, teacher, db } = await setup();
  await call('students.import', { students: roster(30, 4) }, teacher);
  const logins = await Promise.all(Array.from({ length: 30 }, (_, i) => call('login', { ...who(i + 1, 4), password: String(1000 + i) })));
  assert.ok(logins.every((r) => r.status === 200), JSON.stringify(logins.filter((r) => r.status !== 200).map((r) => r.body)));
  const opened = await Promise.all(logins.map((l) => call('report.open', { assessmentId: 'enzyme-structure' }, l.cookie)));
  assert.ok(opened.every((r) => r.status === 200));
  const saves = await Promise.all(opened.map((o, i) => call('report.save', { id: o.body.result.id, version: 0, content: { topic: '효소 ' + i } }, logins[i].cookie)));
  assert.ok(saves.every((r) => r.status === 200), JSON.stringify(saves.filter((r) => r.status !== 200).map((r) => r.body)));
  assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM Reports').get().c, 30);
  assert.equal(db.raw.prepare("SELECT COUNT(*) c FROM Students WHERE json_extract(data,'$.passwordHash') IS NOT NULL").get().c, 30);
});

test('D1: 같은 학생이 두 창에서 동시에 열거나 저장해도 보고서는 1개, 덮어쓰기 없음', async () => {
  const { call, teacher, db } = await setup();
  await call('students.import', { students: roster(1) }, teacher);
  const s = (await call('login', { ...who(1), password: '2222' })).cookie;
  const opens = await Promise.all([1, 2, 3].map(() => call('report.open', { assessmentId: 'enzyme-structure' }, s)));
  assert.ok(opens.every((r) => r.status === 200));
  assert.equal(new Set(opens.map((r) => r.body.result.id)).size, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM Reports').get().c, 1);
  const id = opens[0].body.result.id;
  const both = await Promise.all(['창A', '창B'].map((t) => call('report.save', { id, version: 0, content: { topic: t } }, s)));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  const stored = JSON.parse(db.raw.prepare('SELECT data FROM Reports').get().data);
  assert.equal(stored.version, 1);
});

test('D1: 첫 PIN 동시 등록 경쟁은 한 명만 성공', async () => {
  const { call, teacher } = await setup();
  await call('students.import', { students: roster(1) }, teacher);
  const r = await Promise.all(['1111', '2222'].map((pin) => call('login', { ...who(1), password: pin })));
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
});

test('D1: 그룹 격리와 사진 권한(report.meta)', async () => {
  const { env, call, teacher } = await setup();
  const g = await call('groups.create', { year: 2026, semester: '2', subject: '생명', school: '가상', password: 'group-pass-1' }, teacher);
  assert.equal(g.status, 200);
  const gt = (await call('login', { role: 'teacher', groupId: g.body.result.id, password: 'group-pass-1' })).cookie;
  await call('students.import', { students: roster(1) }, teacher);
  const s = (await call('login', { ...who(1), password: '3333' })).cookie;
  const report = (await call('report.open', { assessmentId: 'enzyme-structure' }, s)).body.result;
  assert.equal((await call('students.list', {}, gt)).body.result.students.length, 0);
  assert.equal((await call('students.list', {}, teacher)).body.result.students.length, 1);
  const img = (cookie) => handleReportImage(new Request(ORIGIN + '/api/lab/report-image/' + report.id, { headers: { Cookie: cookie } }), { ...env, REPORT_IMAGES: { get: async () => null } }, d1Repository(env));
  assert.equal((await img(s)).status, 404);
  assert.equal((await img(teacher)).status, 404);
  assert.equal((await img(gt)).status, 404);
  assert.match((await (await img(gt)).json()).error, /보고서/);
  assert.match((await (await img(s)).json()).error, /사진/);
});

test('D1: 다른 연구 그룹의 교사는 휴지통 보고서를 보거나 복원할 수 없다', async () => {
  const { call, teacher } = await setup();
  const created = await call('groups.create', { year: 2026, semester: '2', subject: '생명', school: '가상', password: 'group-pass-1' }, teacher);
  const groupId = created.body.result.id;
  const groupTeacher = (await call('login', { role: 'teacher', groupId, password: 'group-pass-1' })).cookie;
  await call('students.import', { students: roster(1, 2) }, groupTeacher);
  const student = (await call('login', { ...who(1, 2), groupId, password: '1234' })).cookie;
  const assessment = (await call('assessments.list', {}, groupTeacher)).body.result.assessments[0];
  const report = (await call('report.open', { assessmentId: assessment.id }, student)).body.result;
  assert.equal((await call('report.delete', { id: report.id, version: report.version }, groupTeacher)).status, 200);
  assert.equal((await call('report.trash.list', {}, teacher)).body.result.reports.length, 0);
  assert.equal((await call('report.restore', { id: report.id }, teacher)).status, 404);
  assert.equal((await call('report.restore', { id: report.id }, groupTeacher)).status, 200);
});

test('D1 → 시트 복사: 리비전이 바뀔 때만, 카운터 제외, 실패 시 재시도', async () => {
  const { env, call, teacher } = await setup();
  await call('students.import', { students: roster(2) }, teacher);
  const sent = []; let fail = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(JSON.parse(init.body).body); sent.push(body);
    if (fail) return new Response('<html>error</html>', { status: 500 });
    return new Response(JSON.stringify({ ok: true, result: { views: { sheets: 7 }, viewsError: '' } }));
  };
  try {
    env.LAB_DB.raw.prepare("INSERT INTO Settings (id,grp,data) VALUES ('rate:abc','legacy','{\"id\":\"rate:abc\",\"value\":1}')").run();
    const first = await syncToSheets(env);
    assert.equal(first.views.sheets, 7); assert.equal(sent.at(-1).action, 'sync.replaceAll');
    assert.equal(sent.at(-1).payload.tables.Students.length, 2);
    assert.ok(!sent.at(-1).payload.tables.Settings.some((r) => r.id.startsWith('rate:')));
    assert.equal((await syncToSheets(env)).skipped, true);
    await call('students.import', { students: roster(3) }, teacher);
    fail = true;
    await assert.rejects(syncToSheets(env));
    fail = false;
    assert.equal((await syncToSheets(env)).views.sheets, 7, '실패한 복사는 다음 실행에서 다시 시도');
    const refresh = await call('sheets.refresh', {}, teacher);
    assert.equal(refresh.status, 200); assert.equal(refresh.body.result.views.sheets, 7);
  } finally { globalThis.fetch = realFetch; }
});

test('이전 전에는 학생 접속·시트 복사가 막히고, 이전은 전부 아니면 전무', async () => {
  const { env, call, teacher, db } = await setup({ ready: false });
  assert.ok(teacher, '전체 관리자는 이전 전에도 로그인 가능');
  assert.equal((await call('bootstrap')).status, 503);
  assert.equal((await call('login', { ...who(1), password: '1234' })).status, 503);
  await assert.rejects(syncToSheets(env), /먼저 구글 시트/);
  const realFetch = globalThis.fetch;
  const sheet = { Students: [{ id: 's-old', year: 2026, grade: 1, classNo: 1, number: 1, name: '이전학생', passwordHash: null, authVersion: 1, active: true, groupId: 'legacy' }], Settings: [{ id: 'rate:x', value: 1 }] };
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { tables: sheet } }));
  try {
    // A broken sheet (duplicate roster numbers) imports nothing and stays not-ready.
    const dup = structuredClone(sheet); dup.Students.push({ ...dup.Students[0], id: 's-dup' });
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { tables: dup } }));
    await assert.rejects(migrateFromSheets(env));
    assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM Students').get().c, 0);
    assert.equal((await call('bootstrap')).status, 503);
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { tables: sheet } }));
    const r = await call('migrate.fromSheets', {}, teacher);
    assert.equal(r.status, 200); assert.equal(r.body.result.imported.Students, 1); assert.equal(r.body.result.imported.Settings, 0);
    assert.equal((await call('bootstrap')).body.result.assessments[0].id, 'enzyme-structure', '탐구가 없으면 이전 직후 자동 준비');
    assert.equal((await call('migrate.fromSheets', {}, teacher)).status, 409);
    const { tables } = await exportAll(db);
    assert.equal(tables.Students[0].name, '이전학생');
    assert.equal((await call('login', { year: 2026, grade: 1, classNo: 1, number: 1, name: '이전학생', password: '1234' })).status, 200);
  } finally { globalThis.fetch = realFetch; }
});

test('D1: 시트 한 칸 한도(48,000자)를 넘는 저장은 시트와 똑같이 거부', async () => {
  const { call, teacher } = await setup();
  const a = (await call('assessments.list', {}, teacher)).body.result.assessments[0];
  const fields = Array.from({ length: 20 }, (_, i) => ({ id: 'f' + i, title: '항목' + i, guide: '"'.repeat(1500), type: 'text', required: false }));
  const r = await call('assessment.save', { ...a, fields, version: a.version }, teacher);
  assert.equal(r.status, 200);
  await call('students.import', { students: roster(1) }, teacher);
  const s = (await call('login', { ...who(1), password: '1212' })).cookie;
  const open = await call('report.open', { assessmentId: a.id }, s);
  assert.equal(open.status, 400); assert.match(open.body.error, /저장 한도/);
});

test('D1: 교사가 아닌 사용자는 이전·시트 갱신 불가', async () => {
  const { call, teacher } = await setup();
  await call('students.import', { students: roster(1) }, teacher);
  const s = (await call('login', { ...who(1), password: '4444' })).cookie;
  assert.equal((await call('migrate.fromSheets', {}, s)).status, 403);
  assert.equal((await call('sheets.refresh', {}, s)).status, 403);
});

test('이전을 동시에 두 번 실행해도 한 번만 적용되고, 이후 작성 자료는 지워지지 않음', async () => {
  const { env, call, teacher, db } = await setup({ ready: false });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { tables: { Students: [{ id: 's1', year: 2026, grade: 2, classNo: 1, number: 1, name: '학생1-1', passwordHash: null, authVersion: 1, active: true, groupId: 'legacy' }] } } }));
  try {
    const both = await Promise.allSettled([migrateFromSheets(env), migrateFromSheets(env)]);
    assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(String(both.find((r) => r.status === 'rejected').reason.message), /이미 옮겼/);
    await call('students.import', { students: roster(3) }, teacher);
    await assert.rejects(migrateFromSheets(env), /이미 옮겼/);
    assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM Students').get().c, 3);
  } finally { globalThis.fetch = realFetch; }
});

test('시트 복사: 동시에 두 번이면 하나는 대기 안내, 한글 탭 실패는 재시도 대상', async () => {
  const { env, call, teacher } = await setup();
  await call('students.import', { students: roster(1) }, teacher);
  const realFetch = globalThis.fetch; let views = { sheets: 7 }, viewsError = '', release;
  globalThis.fetch = async () => { await new Promise((r) => (release = r, setTimeout(r, 20))); return new Response(JSON.stringify({ ok: true, result: { views, viewsError } })); };
  try {
    const both = await Promise.allSettled([syncToSheets(env, { force: true }), syncToSheets(env, { force: true })]);
    assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(String(both.find((r) => r.status === 'rejected').reason.message), /진행 중/);
    await call('students.import', { students: roster(2) }, teacher);
    views = null; viewsError = '조회용 시트 구성을 확인하세요';
    await assert.rejects(syncToSheets(env), /한글 조회 탭/);
    assert.match(env.LAB_DB.raw.prepare("SELECT v FROM Meta WHERE k='syncError'").get().v, /한글/);
    views = { sheets: 7 }; viewsError = '';
    assert.equal((await syncToSheets(env)).views.sheets, 7, '다음 실행에서 다시 복사');
    assert.equal(env.LAB_DB.raw.prepare("SELECT v FROM Meta WHERE k='syncError'").get().v, '');
  } finally { globalThis.fetch = realFetch; }
});

test('교사 화면 저장 중 그룹 암호가 바뀌면 그 저장도 거부', async () => {
  const { env, call, teacher, db } = await setup();
  const g = (await call('groups.create', { year: 2026, semester: '2', subject: '생명', school: '가상', password: 'group-pass-1' }, teacher)).body.result;
  const gt = (await call('login', { role: 'teacher', groupId: g.id, password: 'group-pass-1' })).cookie;
  const a = (await call('assessments.list', {}, gt)).body.result.assessments[0];
  // Change the group password between the save's read and its write.
  const realBatch = db.batch.bind(db); let injected = false;
  db.batch = async (list) => {
    if (!injected && list.some((s) => /^UPDATE Assessments/.test(s.sql))) {
      injected = true;
      const row = db.raw.prepare("SELECT data FROM Settings WHERE id = ?").get('group:' + g.id);
      const v = JSON.parse(row.data); v.value.authVersion += 1;
      db.raw.prepare("UPDATE Settings SET data = ? WHERE id = ?").run(JSON.stringify(v), 'group:' + g.id);
    }
    return realBatch(list);
  };
  const r = await call('assessment.save', { ...a, title: '바꾼 제목', version: a.version }, gt);
  db.batch = realBatch;
  assert.equal(r.status, 401);
  assert.notEqual(JSON.parse(db.raw.prepare('SELECT data FROM Assessments WHERE id = ?').get(a.id).data).title, '바꾼 제목');
});
