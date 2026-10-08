import { it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
it('upgrades populated0039, deterministically backfills finding numbers and retains findings on direct QA run deletion', () => {
    const db = new Database(':memory:');
    try {
        db.pragma('foreign_keys=OFF');
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql') && f < '0040').sort())
            db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
        db.exec(`INSERT INTO clients(id,key,name,created_at,updated_at)VALUES('client','client','Client','now','now');INSERT INTO projects(id,client_id,key,name,created_at,updated_at)VALUES('project','client','project','Project','now','now');INSERT INTO qa_runs(id,project_id,kind,started_at)VALUES('run','project','manual','now');`);
        const insert = db.prepare(`INSERT INTO findings(id,project_id,comparison,kind,severity,fingerprint,status,first_seen_at,last_seen_at,qa_run_id,resolved_by)VALUES(?,'project','catalogs','unmapped_catalog','error',?,'resolved',?,'later','run','user')`);
        insert.run('b', 'fp-b', 'before');
        insert.run('a', 'fp-a', 'before');
        insert.run('c', 'fp-c', 'after');
        const before = db.prepare('SELECT * FROM findings ORDER BY id').all() as Record<string, unknown>[];
        db.transaction(() => db.exec(fs.readFileSync(path.join(dir, '0040_qa_reports.sql'), 'utf8'))).immediate();
        expect(db.pragma('foreign_key_check')).toEqual([]);
        db.pragma('foreign_keys=ON');
        const after = db.prepare('SELECT * FROM findings ORDER BY id').all() as Record<string, unknown>[];
        expect(after.map(({ finding_sequence, ...row }) => row)).toEqual(before);
        expect(after.map(r => r.finding_sequence)).toEqual([2, 3, 1]);
        expect(db.prepare('SELECT finding_next,report_next FROM qa_sequence_counters').get()).toEqual({ finding_next: 4, report_next: 1 });
        db.prepare("DELETE FROM qa_runs WHERE id='run'").run();
        expect(db.prepare('SELECT COUNT(*) AS n FROM findings WHERE qa_run_id IS NULL').get()).toEqual({ n: 3 });
        expect(db.pragma('foreign_key_check')).toEqual([]);
    }
    finally {
        db.close();
    }
});
