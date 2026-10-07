/** `GET /api/health` payload (D-66, T-5-00). No secrets: version, latest migration id, DB directory writability. */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, resolveDbPath } from './db';
import { readBackupStatus } from './backupUpload';

declare const __APP_VERSION__: string | undefined;

export interface HealthReport {
  ok: boolean;
  version: string;
  schema_migration: string | null;
  db_path_writable: boolean;
  /** Additive (T-5-08): from last-backup.json next to the backups; null when no backup has run. */
  last_backup_at: string | null;
  last_upload_ok: boolean | null;
}

export function appVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) return __APP_VERSION__;
  return process.env.npm_package_version || 'unknown';
}

export function healthReport(): HealthReport {
  let schemaMigration: string | null = null;
  let dbOk = false;
  try {
    const row = getDb().prepare('SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1').get() as
      | { id: string }
      | undefined;
    schemaMigration = row?.id ?? null;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  let writable = false;
  try {
    const p = resolveDbPath();
    if (p === ':memory:') writable = true;
    else {
      fs.accessSync(path.dirname(p), fs.constants.W_OK);
      writable = true;
    }
  } catch {
    writable = false;
  }
  let status = null;
  try {
    const p = resolveDbPath();
    const dir = process.env.BACKUP_DIR?.trim() || (p === ':memory:' ? '' : path.join(path.dirname(p), 'backups'));
    status = dir ? readBackupStatus(dir) : null;
  } catch {
    status = null;
  }
  return {
    ok: dbOk && writable,
    version: appVersion(),
    schema_migration: schemaMigration,
    db_path_writable: writable,
    last_backup_at: status?.last_backup_at ?? null,
    last_upload_ok: status?.last_upload_ok ?? null,
  };
}
