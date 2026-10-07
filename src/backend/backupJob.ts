/**
 * Nightly backup job logic (D-66, T-5-00): writes one `backup-<project-key>-<YYYY-MM-DD>.json` per
 * project (the D-45 full JSON backup, restorable through the Clients restore form or
 * `POST /api/projects/restore-backup/preview|apply`) into a directory and keeps the newest
 * `keep` files per project. The pure helpers are unit-tested; `backupJobMain.ts` is the scheduler.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listProjects } from './dal/project.dal';
import { buildBackup } from './services/backup.service';
import { objectNameFor, writeBackupStatus, type BackupUploader } from './backupUpload';

export const DEFAULT_KEEP = 14;
const NAME_RE = /^backup-(.+)-(\d{4}-\d{2}-\d{2})\.json$/;

/** Filename-safe key; when sanitising changed it, a short hash of the raw key keeps distinct keys from colliding. */
export function sanitizeKey(key: string): string {
  const clean = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (clean === key) return clean;
  return `${clean}_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 6)}`;
}

export function backupFileName(projectKey: string, date: Date): string {
  return `backup-${sanitizeKey(projectKey)}-${date.toISOString().slice(0, 10)}.json`;
}

/** Files to delete so that at most `keep` newest (by date in the name) remain per project key. Ignores unrelated names. */
export function selectBackupsToDelete(fileNames: string[], keep: number = DEFAULT_KEEP): string[] {
  const byKey = new Map<string, { name: string; date: string }[]>();
  for (const name of fileNames) {
    const m = NAME_RE.exec(name);
    if (!m) continue;
    const list = byKey.get(m[1]) ?? [];
    list.push({ name, date: m[2] });
    byKey.set(m[1], list);
  }
  const doomed: string[] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const item of list.slice(Math.max(0, keep))) doomed.push(item.name);
  }
  return doomed.sort();
}

export interface BackupRunResult {
  written: string[];
  deleted: string[];
  failed: { project: string; error: string }[];
  uploaded: string[];
  uploadFailed: { name: string; error: string }[];
}

export async function runBackupOnce(dir: string, keep: number = DEFAULT_KEEP, now: Date = new Date(), uploader: BackupUploader | null = null): Promise<BackupRunResult> {
  fs.mkdirSync(dir, { recursive: true });
  const result: BackupRunResult = { written: [], deleted: [], failed: [], uploaded: [], uploadFailed: [] };
  let uploadSkipped = false;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('backup-') && f.endsWith('.json.tmp')) fs.unlinkSync(path.join(dir, f)); // leftovers of an interrupted run
  }
  for (const project of listProjects()) {
    try {
      const backup = await buildBackup(project.id);
      const name = backupFileName(project.key, now);
      const target = path.join(dir, name);
      const tmp = `${target}.tmp`;
      const json = JSON.stringify(backup);
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, target);
      result.written.push(name);
      if (uploader) {
        const up = await uploader.upload({ objectName: objectNameFor(project.key, now), body: Buffer.from(json) });
        if (up.ok && up.uri) result.uploaded.push(up.uri);
        else if (up.skipped) uploadSkipped = true;
        else result.uploadFailed.push({ name, error: up.error ?? 'unknown' });
      }
    } catch (err) {
      result.failed.push({ project: project.key, error: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const name of selectBackupsToDelete(fs.readdirSync(dir), keep)) {
    fs.unlinkSync(path.join(dir, name));
    result.deleted.push(name);
  }
  try {
    writeBackupStatus(dir, {
      last_backup_at: result.written.length ? now.toISOString() : null,
      last_upload_ok: !uploader || uploadSkipped || !result.written.length ? null : result.uploadFailed.length === 0,
      last_upload_error: result.uploadFailed[0]?.error ?? null,
    });
  } catch {
    // status is advisory
  }
  return result;
}

/** Milliseconds until the next `hourUtc`:00 UTC strictly after `now`. */
export function msUntilNextRun(now: Date, hourUtc: number): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}
