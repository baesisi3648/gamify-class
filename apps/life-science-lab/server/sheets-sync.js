// Google Sheets stays as the teachers' read-only copy once D1 is the source of truth.
// - syncToSheets: copy every D1 table to the spreadsheet (and rebuild the Korean view tabs)
//   when the D1 revision moved since the last successful copy. Cron + "한글 시트 새로고침".
//   Never runs before the one-time import, so an empty D1 can't overwrite the original sheet.
// - migrateFromSheets: one-time import of the existing Sheets data into D1 (all or nothing).
import { exportAll, importAll, isReady } from './d1-repository.js';
import { sheetsRepository } from './repository.js';

const MAX_COPY_BYTES = 30 * 1024 * 1024;
const meta = async (db, k) => (await db.prepare('SELECT v FROM Meta WHERE k = ?').bind(k).first())?.v ?? null;
const setMeta = (db, k, v) => db.prepare('INSERT INTO Meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();

const LEASE_MS = 6 * 60 * 1000;
export async function syncToSheets(env, { force = false } = {}) {
  const db = env.LAB_DB;
  if (!(await isReady(db))) throw Object.assign(new Error('먼저 구글 시트 자료를 D1으로 옮기세요(migrate.fromSheets). 그 전에는 시트를 덮어쓰지 않습니다.'), { status: 409 });
  const rev = Number(await meta(db, 'rev') || 0), synced = Number(await meta(db, 'syncedRev') || 0);
  if (!force && rev <= synced) return { skipped: true, rev };
  // One copy at a time (cron and button can overlap). The lease expires if a run dies.
  const now = Date.now(), owner = crypto.randomUUID();
  await db.prepare("INSERT INTO Meta (k, v) VALUES ('syncLease', '0') ON CONFLICT(k) DO NOTHING").run();
  const got = await db.prepare("UPDATE Meta SET v = ? WHERE k = 'syncLease' AND CAST(substr(v, 1, instr(v || ':', ':') - 1) AS INTEGER) < ?").bind((now + LEASE_MS) + ':' + owner, now).run();
  if (!got.meta?.changes) throw Object.assign(new Error('다른 시트 복사가 진행 중입니다. 1~2분 뒤 다시 시도하세요.'), { status: 409 });
  try {
    const { rev: exported, tables } = await exportAll(db);
    if (JSON.stringify(tables).length > MAX_COPY_BYTES) throw new Error('시트로 복사할 자료가 너무 큽니다. 관리자에게 문의하세요.');
    // Apps Script also rejects a copy older than the one it already holds.
    const result = await sheetsRepository(env).execute('sync.replaceAll', { tables, rev: exported }, { role: 'system' }, { timeout: 280000 });
    if (result?.viewsError) throw new Error('원본 탭은 복사했지만 한글 조회 탭 갱신에 실패했습니다: ' + result.viewsError);
    // Only a complete copy (data + views) advances the marker; otherwise the next run retries.
    await db.prepare("INSERT INTO Meta (k, v) VALUES ('syncedRev', ?) ON CONFLICT(k) DO UPDATE SET v = CAST(MAX(CAST(v AS INTEGER), CAST(excluded.v AS INTEGER)) AS TEXT)").bind(String(exported)).run();
    await setMeta(db, 'syncError', '');
    return { ...result, rev: exported };
  } catch (error) {
    await setMeta(db, 'syncError', String(error?.message || error).slice(0, 300)).catch(() => {});
    throw error;
  } finally {
    await db.prepare("UPDATE Meta SET v = '0' WHERE k = 'syncLease' AND v LIKE ?").bind('%:' + owner).run().catch(() => {});
  }
}

export async function migrateFromSheets(env, { force = false } = {}) {
  const db = env.LAB_DB;
  if (await isReady(db) && !force) throw Object.assign(new Error('이미 옮겼습니다. 다시 덮어써야 할 때만 force:true 로 실행하세요(D1 자료가 시트 자료로 교체됩니다).'), { status: 409 });
  const { tables } = await sheetsRepository(env).execute('export.all', {}, { role: 'system' }, { timeout: 120000 });
  return { imported: await importAll(db, tables, { force }) };
}
