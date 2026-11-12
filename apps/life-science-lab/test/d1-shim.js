// Minimal Cloudflare D1 binding over node:sqlite, for tests and the local preview.
// batch() runs in one transaction and rolls back on any error, like D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function d1Shim() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stats = { batches: 0, statements: 0, queries: [] };
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...a) => statement(sql, a),
    async all() { stats.queries.push(sql); return { results: db.prepare(sql).all(...args) }; },
    async first() { stats.queries.push(sql); return db.prepare(sql).get(...args) ?? null; },
    async run() { stats.queries.push(sql); const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }
  });
  return {
    raw: db, stats,
    prepare: (sql) => statement(sql),
    async batch(list) {
      stats.batches++; stats.statements += list.length;
      db.exec('BEGIN');
      try { const out = list.map((s) => ({ results: db.prepare(s.sql).all(...s.args) })); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}
