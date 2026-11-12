// D1 storage adapter. The storage-independent rules in domain.js run unchanged:
// 1) read every row this action can touch in ONE D1 batch (= one consistent snapshot;
//    students only get their own rows),
// 2) run LabDomain synchronously on that snapshot,
// 3) write changed rows in ONE D1 batch (a transaction).
// Concurrency: the write batch first re-checks that the rows it relied on are unchanged
// (targeted reads: every row read; full reads: every row written). If anything changed,
// json('write-conflict') raises an error, D1 rolls the whole batch back, and the action
// re-runs on fresh data (bounded retries). Prefetch gaps surface as errors, never as
// silent overwrites.
import '../seed.js';
import '../domain.js';

// Same column lists as the Apps Script store (google-apps-script/Code.gs LAB_COLUMNS).
const COLUMNS = {
  Students: ['id','year','grade','classNo','number','name','passwordHash','authVersion','active','createdAt','groupId','courseClasses'],
  Assessments: ['id','title','subject','category','year','description','guide','startAt','deadline','status','version','groupId'],
  AssessmentFields: ['id','assessmentId','title','guide','type','required','order','retired','groupId'],
  Reports: ['id','studentId','assessmentId','title','fields','content','status','version','createdAt','updatedAt','submittedAt','groupId'],
  Reviews: ['id','reportId','status','feedback','reviewer','createdAt','sequence','reportVersion','groupId'],
  Publications: ['id','reportId','category','year','draft','version','visible','published','publishedVersion','publishedAt','createdAt','groupId'],
  PublicationVersions: ['id','publicationId','version','content','createdAt','groupId'],
  Settings: ['id','value','expiresAt']
};
const num = (v) => (v !== null && v !== '' && Number.isInteger(Number(v)) ? Number(v) : null);
const TABLES = {
  Students: { key: ['id'], cols: (r) => ({ year: num(r.year), grade: num(r.grade), classNo: num(r.classNo), number: num(r.number) }) },
  Assessments: { key: ['id'], cols: () => ({}) },
  AssessmentFields: { key: ['assessmentId', 'id'], cols: () => ({}) },
  Reports: { key: ['id'], cols: (r) => ({ studentId: r.studentId ?? null, assessmentId: r.assessmentId ?? null }) },
  Reviews: { key: ['id'], cols: (r) => ({ reportId: r.reportId ?? null }) },
  Publications: { key: ['id'], cols: (r) => ({ reportId: r.reportId ?? null }) },
  PublicationVersions: { key: ['id'], cols: (r) => ({ publicationId: r.publicationId ?? null }) },
  Settings: { key: ['id'], cols: () => ({}) }
};
export const TABLE_NAMES = Object.keys(TABLES);
const grpOf = (r) => String(r.groupId || 'legacy');
const keyOf = (table, r) => TABLES[table].key.map((k) => String(r[k])).join('\u0000');
const conflictError = () => Object.assign(new Error('다른 요청과 동시에 변경되었습니다. 잠시 후 다시 시도하세요.'), { status: 409 });
const isWriteConflict = (e) => /malformed JSON|UNIQUE constraint|SQLITE_CONSTRAINT|constraint failed/i.test(String(e?.message || e));
export const notReadyError = () => Object.assign(new Error('연구소 저장소를 옮기는 중입니다. 선생님 안내 후 다시 접속하세요.'), { status: 503 });
const BUMP_REV = "INSERT INTO Meta (k, v) VALUES ('rev', '1') ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)";

// In-memory snapshot with the same interface as the Apps Script store (all/put/replaceFields).
function snapshot() {
  const rows = {}, original = new Map(), dirty = new Map();
  for (const t of TABLE_NAMES) rows[t] = new Map();
  return {
    rows, original, dirty, full: false,
    load(table, dataTexts) {
      for (const text of dataTexts) {
        const r = JSON.parse(text), k = keyOf(table, r);
        if (rows[table].has(k)) continue;
        rows[table].set(k, r); original.set(table + '|' + k, { table, k, row: r, text });
      }
    },
    all: (table) => [...rows[table].values()].map((r) => structuredClone(r)).filter((r) => table !== 'AssessmentFields' || !r.retired),
    put(table, row) {
      // Same per-cell limit as the Sheets store, so the Sheets copy can always hold every record.
      if (COLUMNS[table].some((c) => JSON.stringify(row[c] ?? null).length > 48000)) throw Object.assign(new Error('한 항목의 길이가 저장 한도를 초과했습니다.'), { status: 400 });
      const r = structuredClone(row), k = keyOf(table, r);
      rows[table].set(k, r); dirty.set(table + '|' + k, { table, row: r, k });
    },
    replaceFields(id, fields) {
      // Same semantics as the Apps Script store: removed fields are retired, never deleted.
      [...rows.AssessmentFields.values()].filter((v) => v.assessmentId === id && !fields.some((f) => f.id === v.id))
        .forEach((v) => this.put('AssessmentFields', { ...v, retired: true }));
      fields.forEach((f) => this.put('AssessmentFields', { ...f, retired: false }));
    }
  };
}

// Which rows an action may read. Anything not listed reads every table (teacher screens).
function readPlan(action, p = {}, actor = {}) {
  const gid = actor?.role && actor.role !== 'system' ? String(actor.groupId || 'legacy') : String(p?.groupId || 'legacy');
  const sid = actor?.role === 'student' ? String(actor.id) : null;
  const Q = (table, sql, ...args) => ({ table, sql: sql || `SELECT data FROM ${table}`, args });
  const group = (id) => Q('Settings', 'SELECT data FROM Settings WHERE id = ?', 'group:' + id);
  const assessments = [Q('Assessments'), Q('AssessmentFields')];
  // Only the one assessment a report belongs to (so edits to other assessments never cause retries).
  const assessmentById = (id) => [Q('Assessments', 'SELECT data FROM Assessments WHERE id = ?', id), Q('AssessmentFields', 'SELECT data FROM AssessmentFields WHERE assessmentId = ?', id)];
  const assessmentOfReport = (rid) => [Q('Assessments', 'SELECT data FROM Assessments WHERE id = (SELECT assessmentId FROM Reports WHERE id = ?)', rid),
    Q('AssessmentFields', 'SELECT data FROM AssessmentFields WHERE assessmentId = (SELECT assessmentId FROM Reports WHERE id = ?)', rid)];
  const student = sid ? [Q('Students', 'SELECT data FROM Students WHERE id = ?', sid)] : [];
  if (action === 'groups.list') return [Q('Settings', "SELECT data FROM Settings WHERE id LIKE 'group:%'")];
  if (action === 'auth.group') return [group(String(p.groupId || 'legacy'))];
  if (action === 'auth.rate') return [Q('Settings', 'SELECT data FROM Settings WHERE id = ?', 'rate:' + String(p.key))];
  if (action === 'auth.login') return [group(gid),
    ...(Array.isArray(p.rateKeys) ? p.rateKeys.slice(0, 4) : []).map((r) => Q('Settings', 'SELECT data FROM Settings WHERE id = ?', 'rate:' + String(r.key))),
    ...(p.role !== 'teacher' ? [Q('Students', 'SELECT data FROM Students WHERE year = ? AND grade = ? AND classNo = ? AND number = ?', num(p.year), num(p.grade), num(p.classNo), num(p.number))] : [])];
  if (action === 'bootstrap') return [group(gid), ...assessments];
  if (action === 'archive') return [group(gid), Q('Publications')];
  if (action === 'me') return [group(gid), ...student];
  if (sid && (action === 'myReports' || action === 'report.open')) return [group(gid), ...student,
    Q('Reports', 'SELECT data FROM Reports WHERE studentId = ?', sid),
    Q('Reviews', 'SELECT data FROM Reviews WHERE reportId IN (SELECT id FROM Reports WHERE studentId = ?)', sid),
    ...(action === 'report.open' ? assessmentById(String(p.assessmentId)) : [])];
  if (action === 'report.save' || action === 'report.submit' || action === 'report.meta') return [group(gid), ...student,
    Q('Reports', 'SELECT data FROM Reports WHERE id = ?', String(p.id)), ...(action !== 'report.meta' ? assessmentOfReport(String(p.id)) : [])];
  return null; // full read
}
async function prefetch(db, snap, action, p, actor) {
  let plan = readPlan(action, p, actor);
  if (!plan) { snap.full = true; plan = TABLE_NAMES.map((t) => ({ table: t, sql: `SELECT data FROM ${t}`, args: [] })); }
  const results = await db.batch(plan.map((q) => db.prepare(q.sql).bind(...q.args)));
  plan.forEach((q, i) => snap.load(q.table, results[i].results.map((r) => r.data)));
}

function guard(db, table, row, text) {
  const where = TABLES[table].key.map((c) => c + ' = ?').join(' AND ');
  return db.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM ${table} WHERE ${where} AND data = ?) THEN 1 ELSE json('write-conflict') END`)
    .bind(...TABLES[table].key.map((c) => String(row[c])), text);
}
function writeStatements(db, snap) {
  const writes = [], guards = new Map();
  for (const [ok, { table, row }] of snap.dirty) {
    const text = JSON.stringify(row), before = snap.original.get(ok);
    if (before?.text === text) continue;
    const def = TABLES[table], cols = { grp: grpOf(row), ...def.cols(row), data: text };
    const keyVals = def.key.map((c) => String(row[c]));
    if (!before) {
      const names = [...def.key, ...Object.keys(cols)];
      writes.push(db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).bind(...keyVals, ...Object.values(cols)));
    } else {
      guards.set(ok, before);
      writes.push(db.prepare(`UPDATE ${table} SET ${Object.keys(cols).map((c) => c + ' = ?').join(', ')} WHERE ${def.key.map((c) => c + ' = ?').join(' AND ')}`).bind(...Object.values(cols), ...keyVals));
    }
  }
  if (!writes.length) return [];
  // Targeted reads are small: re-check every row the decision was based on (e.g. the
  // student is still active, the assessment is still open). Full reads: re-check written rows.
  if (!snap.full) for (const [ok, before] of snap.original) guards.set(ok, before);
  // Full reads (teacher screens): also re-check group records (passwords/versions decide access).
  else for (const [ok, before] of snap.original) if (before.table === 'Settings' && String(before.row.id).startsWith('group:')) guards.set(ok, before);
  // Login-rate counters are approximate by design: never let them cause write conflicts.
  for (const [ok, b] of guards) if (b.table === 'Settings' && String(b.row.id).startsWith('rate:')) guards.delete(ok);
  return [...[...guards.values()].map((b) => guard(db, b.table, b.row, b.text)), ...writes, db.prepare(BUMP_REV)];
}

const context = () => ({ now: new Date().toISOString(), uuid: () => crypto.randomUUID() });
async function run(db, action, payload, actor) {
  for (let attempt = 0; ; attempt++) {
    const snap = snapshot(), ctx = context();
    await prefetch(db, snap, action, payload, actor);
    const result = globalThis.LabDomain.execute(snap, action, structuredClone(payload), actor, ctx);
    const stmts = writeStatements(db, snap);
    try { if (stmts.length) await db.batch(stmts); return result; }
    catch (e) {
      if (!isWriteConflict(e)) throw e;
      if (attempt >= 4) throw conflictError();
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (attempt + 1)));
    }
  }
}

const meta = async (db, k) => (await db.prepare('SELECT v FROM Meta WHERE k = ?').bind(k).first())?.v ?? null;
export const isReady = async (db) => (await meta(db, 'ready')) === '1';
const readyDbs = new WeakSet();
// Until the one-time Sheets → D1 import has run, only the owner may sign in (to run it).
const allowedBeforeReady = (action, p, actor) => (action === 'auth.login' && p.role === 'teacher' && String(p.groupId || 'legacy') === 'legacy')
  || (action === 'me' && actor?.role === 'teacher');

async function seedIfEmpty(db) {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM Assessments').first();
  if (row?.c) return;
  try { await run(db, 'assessment.save', structuredClone(globalThis.LAB_SEED), { role: 'teacher' }); }
  catch (e) { const again = await db.prepare('SELECT COUNT(*) AS c FROM Assessments').first(); if (!again?.c) throw e; }
}

export function d1Repository(env) {
  const db = env.LAB_DB;
  return {
    async execute(action, payload = {}, actor = {}) {
      if (!readyDbs.has(db)) {
        if (await isReady(db)) { await seedIfEmpty(db); readyDbs.add(db); }
        else if (!allowedBeforeReady(action, payload, actor)) throw notReadyError();
      }
      return run(db, action, payload, actor);
    },
    async deleteReport(payload, actor) {
      if (actor?.role !== 'teacher') throw Object.assign(new Error('교사 권한이 필요합니다.'), { status: 403 });
      // Reuse the domain's group and session checks before touching any row.
      const { reports } = await this.execute('reports.list', {}, actor);
      const report = reports.find((r) => r.id === payload.id);
      if (!report) throw Object.assign(new Error('이 그룹의 보고서를 찾을 수 없습니다.'), { status: 404 });
      if (Number(payload.version) !== report.version) throw conflictError();
      const groupId = String(actor.groupId || 'legacy');
      const current = await db.prepare('SELECT data FROM Reports WHERE id = ? AND grp = ?').bind(report.id, groupId).first();
      if (!current || JSON.parse(current.data).version !== report.version) throw conflictError();
      const statements = [db.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM Reports WHERE id = ? AND grp = ? AND data = ?) THEN 1 ELSE json('write-conflict') END")
        .bind(report.id, groupId, current.data)];
      if (groupId !== 'legacy' && !actor.owner) statements.push(db.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM Settings WHERE id = ? AND json_extract(data, '$.value.authVersion') = ?) THEN 1 ELSE json('write-conflict') END")
        .bind('group:' + groupId, actor.groupVersion));
      statements.push(
        db.prepare('DELETE FROM PublicationVersions WHERE grp = ? AND publicationId IN (SELECT id FROM Publications WHERE reportId = ? AND grp = ?)').bind(groupId, report.id, groupId),
        db.prepare('DELETE FROM Publications WHERE reportId = ? AND grp = ?').bind(report.id, groupId),
        db.prepare('DELETE FROM Reviews WHERE reportId = ? AND grp = ?').bind(report.id, groupId),
        db.prepare('DELETE FROM Reports WHERE id = ? AND grp = ? AND data = ?').bind(report.id, groupId, current.data),
        db.prepare(BUMP_REV)
      );
      try { await db.batch(statements); }
      catch (error) { if (isWriteConflict(error)) throw conflictError(); throw error; }
      return { ok: true };
    }
  };
}

// Full export of every table (records as stored) plus the revision it reflects.
export async function exportAll(db) {
  const rev = Number(await meta(db, 'rev') || 0);
  const results = await db.batch(TABLE_NAMES.map((t) => db.prepare(`SELECT data FROM ${t}`)));
  const tables = Object.fromEntries(TABLE_NAMES.map((t, i) => [t, results[i].results.map((r) => JSON.parse(r.data))]));
  tables.Settings = tables.Settings.filter((r) => !String(r.id).startsWith('rate:'));
  return { rev, tables };
}

// One-time import of records exported from Google Sheets: replaces everything in ONE
// transaction (all or nothing). If the sheet has no assessment, the enzyme seed is added in
// the same transaction, and only then is the store marked ready.
export const ALREADY_MIGRATED = 'already-migrated';
export async function importAll(db, tables, { force = false } = {}) {
  const counts = {}, stmts = [];
  // Re-checked inside the transaction, so two concurrent first imports can't wipe new data.
  if (!force) stmts.push(db.prepare(`SELECT CASE WHEN COALESCE((SELECT v FROM Meta WHERE k = 'ready'), '0') = '1' THEN json('${ALREADY_MIGRATED}') ELSE 1 END`));
  stmts.push(...TABLE_NAMES.map((t) => db.prepare(`DELETE FROM ${t}`)));
  const insert = (t, row) => {
    const def = TABLES[t], cols = { grp: grpOf(row), ...def.cols(row), data: JSON.stringify(row) };
    const names = [...def.key, ...Object.keys(cols)];
    return db.prepare(`INSERT INTO ${t} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).bind(...def.key.map((c) => String(row[c])), ...Object.values(cols));
  };
  for (const t of TABLE_NAMES) {
    const rows = (tables?.[t] || []).filter((r) => r && r.id != null && (t !== 'Settings' || !String(r.id).startsWith('rate:')));
    counts[t] = rows.length;
    rows.forEach((row) => stmts.push(insert(t, row)));
  }
  if (!counts.Assessments) {
    const snap = snapshot();
    globalThis.LabDomain.execute(snap, 'assessment.save', structuredClone(globalThis.LAB_SEED), { role: 'teacher' }, context());
    for (const { table, row } of snap.dirty.values()) stmts.push(insert(table, row));
  }
  stmts.push(db.prepare("INSERT INTO Meta (k, v) VALUES ('ready', '1') ON CONFLICT(k) DO UPDATE SET v = '1'"), db.prepare(BUMP_REV));
  try { await db.batch(stmts); }
  catch (e) {
    if (String(e?.message || e).includes('malformed JSON')) throw Object.assign(new Error('이미 옮겼습니다. 다시 덮어써야 할 때만 force:true 로 실행하세요(D1 자료가 시트 자료로 교체됩니다).'), { status: 409 });
    throw e;
  }
  readyDbs.add(db);
  return counts;
}

export const _test = { readPlan, snapshot };
