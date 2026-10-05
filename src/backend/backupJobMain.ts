/**
 * Backup job entry (D-66, T-5-00): bundled to `api/_backend/backup-job.js`.
 * `node api/_backend/backup-job.js --once` writes backups now and exits; without `--once` it runs
 * once at start-up (unless `BACKUP_SKIP_INITIAL=1`) and then every night at `BACKUP_HOUR_UTC`
 * (default 2). `BACKUP_DIR` default `<dirname(E3_DB_PATH)>/backups`; `BACKUP_KEEP` default 14.
 */
import path from 'node:path';
import { getDb, resolveDbPath } from './db';
import { DEFAULT_KEEP, msUntilNextRun, runBackupOnce } from './backupJob';

getDb();

const dbPath = resolveDbPath();
const dir = process.env.BACKUP_DIR?.trim() || path.join(path.dirname(dbPath), 'backups');
const keep = Number(process.env.BACKUP_KEEP) > 0 ? Number(process.env.BACKUP_KEEP) : DEFAULT_KEEP;
const hour = Number.isInteger(Number(process.env.BACKUP_HOUR_UTC)) && process.env.BACKUP_HOUR_UTC ? Number(process.env.BACKUP_HOUR_UTC) : 2;

async function once(): Promise<number> {
  const r = await runBackupOnce(dir, keep);
  console.log(`[e3-backup] wrote ${r.written.length}, pruned ${r.deleted.length}, failed ${r.failed.length} in ${dir}`);
  for (const f of r.failed) console.error(`[e3-backup] ${f.project}: ${f.error}`);
  return r.failed.length;
}

if (process.argv.includes('--once')) {
  once().then((failed) => process.exit(failed ? 1 : 0));
} else {
  const schedule = (): void => {
    const wait = msUntilNextRun(new Date(), hour);
    console.log(`[e3-backup] next run in ${Math.round(wait / 60000)} min`);
    setTimeout(() => {
      once().finally(schedule);
    }, wait);
  };
  (process.env.BACKUP_SKIP_INITIAL === '1' ? Promise.resolve(0) : once()).finally(schedule);
}
