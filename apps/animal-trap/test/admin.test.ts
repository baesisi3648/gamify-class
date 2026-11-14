/** 문제은행 관리: 가져오기 형식 검사, 관리자 인증, replace 안전장치, 내보내기 왕복 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, toPortable, exportFileName, levelOf, type QuestionRow } from '../src/server/bank.ts';
import { adminRoute, type AdminPorts, type StoredQuestion } from '../src/server/admin.ts';
import { route } from '../src/server/router.ts';

const q = (difficulty: string, i = 0, extra: Record<string, unknown> = {}) => ({ difficulty, question: `문제 ${i}`, choices: ['가', '나', '다', '라'], answer: 2, explanation: '해설', ...extra });

test('bank: 더비 형식(easy/medium/hard)과 한글 난이도를 모두 받는다', () => {
  assert.equal(levelOf('easy'), '쉬움'); assert.equal(levelOf('MEDIUM'), '보통'); assert.equal(levelOf('hard'), '어려움');
  assert.equal(levelOf('중간'), '보통'); assert.equal(levelOf('어려움'), '어려움'); assert.equal(levelOf('extreme'), null);
  const r = parseImport({ title: '세포', questions: [q('easy', 1), q('보통', 2), q('hard', 3)] }, null);
  assert.ok(typeof r !== 'string');
  assert.deepEqual(r.summary.byLevel, { 쉬움: 1, 보통: 1, 어려움: 1 });
  assert.equal(r.rows[0].setName, '세포');
  assert.equal(r.rows[0].answer, 2);
});

test('bank: 잘못된 문항은 몇 번째가 왜 틀렸는지 알려주고 나머지는 넣는다', () => {
  const r = parseImport({ title: 'T', questions: [q('easy', 0), q('easy', 1, { choices: ['a', 'b', 'c'] }), q('easy', 2, { answer: 5 }), q('x', 3), q('easy', 4, { question: '' }), q('easy', 5, { type: 'ox' }), 'str', q('easy', 7, { choices: ['a', '', 'c', 'd'] })] }, '덮어쓴 이름');
  assert.ok(typeof r !== 'string');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].setName, '덮어쓴 이름');
  assert.deepEqual(r.summary.errors.map((e) => e.index), [1, 2, 3, 4, 5, 6, 7]);
  assert.match(r.summary.errors[0].reason, /4개/);
  assert.match(r.summary.errors[6].reason, /2번 보기/);
});

test('bank: 파일 모양이 아니면 통째로 거절, 300문항 초과 거절', () => {
  assert.equal(typeof parseImport([], null), 'string');
  assert.equal(typeof parseImport({ questions: 'x' }, null), 'string');
  assert.equal(typeof parseImport({ questions: Array.from({ length: 301 }, (_, i) => q('easy', i)) }, null), 'string');
});

test('bank: 내보내기 → 가져오기 왕복이 같은 문항을 만든다', () => {
  const src = parseImport({ title: 'R', questions: [q('easy', 1), q('hard', 2, { answer: 4 })] }, null);
  assert.ok(typeof src !== 'string');
  const back = parseImport(JSON.parse(toPortable('R', src.rows)), null);
  assert.ok(typeof back !== 'string');
  assert.deepEqual(back.rows, src.rows);
  assert.equal(exportFileName('a/b:c', Date.UTC(2026, 10, 13, 16)), '애니멀트랩_a_b_c_2026-11-14.json'); // KST 자정 넘김
});

function fakeAdmin(over: Partial<AdminPorts> = {}) {
  let rows: StoredQuestion[] = []; let nextId = 1; const tries: string[] = [];
  const ports: AdminPorts = {
    adminPassword: 'pw', eq: async (a, b) => a === b, now: () => Date.UTC(2026, 10, 14),
    listSets: async () => [...new Set(rows.map((r) => r.setName))].map((name) => ({ name, counts: { 쉬움: rows.filter((r) => r.setName === name && r.level === '쉬움').length, 보통: rows.filter((r) => r.setName === name && r.level === '보통').length, 어려움: rows.filter((r) => r.setName === name && r.level === '어려움').length } })),
    listQuestions: async (s) => rows.filter((r) => r.setName === s),
    importRows: async (s, mode, add: QuestionRow[]): Promise<number | 'FULL'> => { if (mode === 'replace') rows = rows.filter((r) => r.setName !== s); rows.push(...add.map((r) => ({ ...r, id: nextId++ }))); return add.length; },
    deleteSet: async (s) => { const n = rows.length; rows = rows.filter((r) => r.setName !== s); return n - rows.length; },
    deleteQuestion: async (id) => { const n = rows.length; rows = rows.filter((r) => r.id !== id); return n !== rows.length; },
    adminAttempt: async (ip) => { tries.push(ip); return tries.length <= 50; },
    ...over
  };
  return { ports, get rows() { return rows; }, tries };
}
const H = { 'x-admin-password': 'pw', 'cf-connecting-ip': '1.2.3.4' };
const call = (p: AdminPorts, method: string, path: string, body?: unknown, headers: Record<string, string> = H) => adminRoute({ method, path, headers, body }, p);

test('admin: 비밀번호 없으면 꺼짐, 틀리면 거절, 시도 제한은 비밀번호 확인보다 먼저', async () => {
  assert.deepEqual(await call(fakeAdmin({ adminPassword: undefined }).ports, 'GET', '/api/admin/sets'), { ok: false, error: 'ADMIN_DISABLED' });
  const f = fakeAdmin();
  assert.deepEqual(await call(f.ports, 'GET', '/api/admin/sets', undefined, { 'x-admin-password': 'no' }), { ok: false, error: 'ADMIN_DENIED' });
  const limited = fakeAdmin({ adminAttempt: async () => false });
  let checked = false;
  limited.ports.eq = async () => { checked = true; return true; };
  const r = await call(limited.ports, 'GET', '/api/admin/sets');
  assert.equal(r?.ok, false); assert.equal(!r?.ok && r?.error, 'ADMIN_RATE_LIMITED'); assert.equal(checked, false);
  assert.equal(await call(f.ports, 'GET', '/api/game'), null); // 관리 경로가 아니면 손대지 않는다
  assert.deepEqual(f.tries, ['local'], '헤더에 IP 가 없으면 local 로 센다');
});

test('admin: 미리보기 → 추가 → 교체, 0문항이면 replace 가 세트를 지우지 않는다', async () => {
  const f = fakeAdmin();
  const file = { title: '세포', questions: [q('easy', 1), q('medium', 2), q('bad', 3)] };
  const pv = await call(f.ports, 'POST', '/api/admin/import/preview', { json: file });
  assert.ok(pv?.ok); assert.deepEqual((pv.data as { total: number; existing: boolean }).total, 2);
  assert.equal(f.rows.length, 0, '미리보기는 저장하지 않는다');
  assert.ok((await call(f.ports, 'POST', '/api/admin/import', { json: file, mode: 'add' }))?.ok);
  assert.ok((await call(f.ports, 'POST', '/api/admin/import', { json: file, mode: 'add' }))?.ok);
  assert.equal(f.rows.length, 4);
  const pv2 = await call(f.ports, 'POST', '/api/admin/import/preview', { json: file });
  assert.ok(pv2?.ok); assert.equal((pv2.data as { existing: boolean }).existing, true);
  assert.ok((await call(f.ports, 'POST', '/api/admin/import', { json: file, mode: 'replace' }))?.ok);
  assert.equal(f.rows.length, 2);
  const empty = await call(f.ports, 'POST', '/api/admin/import', { json: { title: '세포', questions: [q('bad')] }, mode: 'replace' });
  assert.equal(!empty?.ok && empty?.error, 'BAD_FILE');
  assert.equal(f.rows.length, 2, '형식 오류뿐인 파일로 교체해도 세트가 남는다');
  assert.equal(!(await call(f.ports, 'POST', '/api/admin/import', { json: file }))?.ok, true, 'mode 없으면 거절');
  const noName = await call(f.ports, 'POST', '/api/admin/import', { json: { questions: [q('easy')] }, mode: 'add' });
  assert.equal(!noName?.ok && noName?.error, 'BAD_REQUEST');
});

test('admin: 내보내기·문항 삭제·세트 삭제', async () => {
  const f = fakeAdmin();
  await call(f.ports, 'POST', '/api/admin/import', { json: { questions: [q('easy', 1), q('hard', 2)] }, setName: '  유전   ', mode: 'add' });
  assert.equal(f.rows[0].setName, '유전');
  const ex = await call(f.ports, 'POST', '/api/admin/export', { setName: '유전' });
  assert.ok(ex?.ok);
  const d = ex.data as { fileName: string; content: string };
  assert.equal(d.fileName, '애니멀트랩_유전_2026-11-14.json');
  assert.equal(JSON.parse(d.content).questions.length, 2);
  assert.equal(!(await call(f.ports, 'POST', '/api/admin/export', { setName: '없음' }))?.ok, true);
  assert.ok((await call(f.ports, 'POST', '/api/admin/questions/delete', { id: f.rows[0].id }))?.ok);
  assert.equal(!(await call(f.ports, 'POST', '/api/admin/questions/delete', { id: 'x' }))?.ok, true);
  assert.equal(f.rows.length, 1);
  const del = await call(f.ports, 'POST', '/api/admin/sets/delete', { setName: '유전' });
  assert.ok(del?.ok); assert.equal((del.data as { deleted: number }).deleted, 1);
  const sets = await call(f.ports, 'GET', '/api/admin/sets');
  assert.ok(sets?.ok); assert.deepEqual((sets.data as { sets: unknown[] }).sets, []);
});

test('router: 관리 오류는 알맞은 HTTP 코드, message 가 그대로 전달된다', async () => {
  const f = fakeAdmin();
  const base = { room: () => { throw new Error('no'); }, gameExists: async () => false, reserveGame: async () => false, releaseGame: async () => {}, questions: async () => [], randomCode: () => 'X', randomId: () => 'y' };
  const p = { ...base, ...f.ports } as unknown as Parameters<typeof route>[1];
  const bad = await route({ method: 'POST', path: '/api/admin/import', headers: H, body: { json: [] } }, p);
  assert.equal(bad.status, 400); assert.equal(bad.body.ok, false); assert.ok(!bad.body.ok && bad.body.message);
  assert.equal((await route({ method: 'GET', path: '/api/admin/sets', headers: { 'x-admin-password': 'no' }, body: undefined }, p)).status, 401);
  assert.equal((await route({ method: 'GET', path: '/api/admin/sets', headers: H, body: undefined }, p)).status, 200);
});

test('bank: 객체·참거짓 같은 잘못된 타입은 글자로 바꾸지 않고 오류로', () => {
  const r = parseImport({ title: 'T', questions: [q('easy', 0, { question: {} }), q('easy', 1, { choices: ['a', true, 'c', 'd'] }), q('easy', 2, { answer: true }), q('easy', 3, { explanation: ['x'] }), q('easy', 4, { choices: [1, 2, 3, 4], answer: '3' })] }, null);
  assert.ok(typeof r !== 'string');
  assert.deepEqual(r.summary.errors.map((e) => e.index), [0, 1, 2, 3]);
  assert.deepEqual(r.rows[0].choices, ['1', '2', '3', '4']); assert.equal(r.rows[0].answer, 3);
  assert.equal(typeof parseImport({ title: { x: 1 }, questions: [] }, null), 'string');
});

test('bank: fitBank — 300 이하면 그대로, 넘치면 난이도 비율대로 줄이고 난이도마다 최소 1', async () => {
  const { fitBank } = await import('../src/server/bank.ts');
  const mk = (level: '쉬움' | '보통' | '어려움', n: number) => Array.from({ length: n }, (_, i) => ({ level, i }));
  const small = mk('쉬움', 10); assert.equal(fitBank(small, 300, Math.random), small);
  const big = [...mk('쉬움', 500), ...mk('보통', 300), ...mk('어려움', 1)];
  const out = fitBank(big, 300, Math.random);
  assert.equal(out.length, 300);
  assert.equal(out.filter((x) => x.level === '어려움').length, 1);
  assert.ok(Math.abs(out.filter((x) => x.level === '쉬움').length - 187) <= 2);
});

test('admin: 추가로 한 세트가 300문항을 넘지 않는다, 판 생성도 같은 세트 이름 정규화', async () => {
  const f = fakeAdmin();
  const many = (n: number) => ({ title: '큰 세트', questions: Array.from({ length: n }, (_, i) => q(['easy', 'medium', 'hard'][i % 3], i)) });
  assert.ok((await call(f.ports, 'POST', '/api/admin/import', { json: many(200), mode: 'add' }))?.ok);
  const over = await call(f.ports, 'POST', '/api/admin/import', { json: many(101), mode: 'add' });
  assert.equal(!over?.ok && over?.error, 'BAD_FILE'); assert.equal(f.rows.length, 200);
  assert.ok((await call(f.ports, 'POST', '/api/admin/import', { json: many(300), mode: 'replace' }))?.ok);
  assert.equal(f.rows.length, 300);
  let asked = '';
  const base = { room: () => ({ create: async () => ({ ok: true, data: { hostKey: 'h', tvKey: 't', pins: [], warnings: [] } }), lobby: async () => ({ ok: true, data: {} }) }), gameExists: async () => false, reserveGame: async () => true, releaseGame: async () => {}, questions: async (s: string) => { asked = s; return []; }, randomCode: () => 'ABCDEF', randomId: () => 'y' };
  const p = { ...base, ...f.ports } as unknown as Parameters<typeof route>[1];
  await route({ method: 'POST', path: '/api/game', headers: H, body: { setName: '  큰   세트 ' } }, p);
  assert.equal(asked, '큰 세트');
});

test('bank: fitBank 최소 1 보장 때문에 넘치지 않는다 (600·1·1 → 정확히 300)', async () => {
  const { fitBank } = await import('../src/server/bank.ts');
  const rows = [...Array.from({ length: 600 }, () => ({ level: '쉬움' as const })), { level: '보통' as const }, { level: '어려움' as const }];
  const out = fitBank(rows, 300, () => 0.5);
  assert.equal(out.length, 300);
  assert.equal(out.filter((x) => x.level === '어려움').length, 1);
});

test('admin: 저장소가 FULL 이면 오류로 알리고 아무것도 바뀌지 않았다고 말한다', async () => {
  const f = fakeAdmin({ importRows: async () => 'FULL' });
  const r = await call(f.ports, 'POST', '/api/admin/import', { json: { title: 'X', questions: [q('easy', 1)] }, mode: 'add' });
  assert.equal(!r?.ok && r?.error, 'BAD_FILE');
  assert.match(!r?.ok ? r?.message ?? '' : '', /아무것도/);
});
