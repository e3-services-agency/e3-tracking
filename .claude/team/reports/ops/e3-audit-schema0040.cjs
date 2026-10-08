'use strict';
// Operational read-only release audit. Run from /app inside the reviewed container.
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.resolve(process.cwd(), 'package.json'));
const Database = appRequire('better-sqlite3');
const databasePath = process.argv[2] || '/data/e3-tracking.sqlite';
const db = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const result = db.transaction(() => {
    const schema = db.prepare('SELECT MAX(id) AS id FROM schema_migrations').get().id;
    if (schema !== '0040_qa_reports.sql') throw new Error('Expected schema0040');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Integrity failure');
    if (db.pragma('foreign_key_check').length !== 0) throw new Error('Foreign-key failure');
    for (const [table, field] of [['findings', 'finding_sequence'], ['qa_reports', 'report_sequence']]) {
      if (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${field} <= 0 OR typeof(${field}) <> 'integer'`).get().n) throw new Error('Invalid sequence');
      if (db.prepare(`SELECT project_id, ${field} FROM ${table} GROUP BY project_id, ${field} HAVING COUNT(*) > 1`).all().length) throw new Error('Duplicate sequence');
    }
    if (db.prepare("SELECT COUNT(*) AS n FROM qa_sequence_counters WHERE typeof(finding_next)<>'integer' OR typeof(report_next)<>'integer' OR finding_next<1 OR report_next<1").get().n) throw new Error('Invalid sequence counter');
    const invalidCounters = db.prepare(`
      SELECT p.id FROM projects p
      LEFT JOIN qa_sequence_counters c ON c.project_id=p.id
      LEFT JOIN (SELECT project_id,MAX(finding_sequence) AS max_n FROM (SELECT project_id,finding_sequence FROM findings UNION ALL SELECT project_id,finding_sequence FROM qa_report_findings) GROUP BY project_id) f ON f.project_id=p.id
      LEFT JOIN (SELECT project_id,MAX(report_sequence) AS max_n FROM qa_reports GROUP BY project_id) r ON r.project_id=p.id
      WHERE (COALESCE(f.max_n,0)>0 OR COALESCE(r.max_n,0)>0)
        AND (c.project_id IS NULL OR c.finding_next<=COALESCE(f.max_n,0) OR c.report_next<=COALESCE(r.max_n,0))
    `).all();
    if (invalidCounters.length) throw new Error('Sequence counter behind allocated records');
    if (db.prepare("SELECT COUNT(*) AS n FROM qa_report_findings WHERE finding_sequence<=0 OR typeof(finding_sequence)<>'integer'").get().n) throw new Error('Invalid recorded finding sequence');
    if (db.prepare('SELECT COUNT(*) AS n FROM qa_report_findings i JOIN qa_reports r ON r.id=i.report_id WHERE i.project_id<>r.project_id').get().n) throw new Error('Report item project mismatch');
    const counts = {};
    for (const table of ['clients','projects','comments','properties','property_definitions','events','findings','qa_reports','qa_report_findings','qa_sequence_counters','comment_attachments','comment_reactions']) {
      counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    }
    return { schema, integrity: 'ok', foreign_key_errors: 0, sequence_checks: 'ok', counts };
  })();
  console.log(JSON.stringify(result));
} finally {
  db.close();
}
