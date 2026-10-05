/** `GET /api/health` payload (D-66, T-5-00). No secrets: version, latest migration id, DB directory writability. */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, resolveDbPath } from './db';

declare const __APP_VERSION__: string | undefined;

export interface HealthReport {
  ok: boolean;
  version: string;
  schema_migration: string | null;
  db_path_writable: boolean;
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
  return { ok: dbOk && writable, version: appVersion(), schema_migration: schemaMigration, db_path_writable: writable };
}
