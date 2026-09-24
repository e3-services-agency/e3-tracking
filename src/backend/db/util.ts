/**
 * Small shared helpers for DAL modules built on `getDb()` (better-sqlite3, synchronous API).
 * Kept here instead of duplicated per file; still SQLite-agnostic enough that a Postgres DAL
 * later would only need to change `getDb()` itself, not these helpers (D-12).
 */
import { randomUUID } from 'node:crypto';
import { ConflictError, DatabaseError } from '../errors';

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Parse a `*_json` TEXT column; returns `fallback` for null/empty/invalid JSON. */
export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Serialize a value for a `*_json` TEXT column; `null`/`undefined` -> SQL NULL. */
export function toJsonColumn(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/** SQLite has no boolean type; columns are INTEGER 0/1. */
export function toSqliteBool(value: boolean | null | undefined): number {
  return value ? 1 : 0;
}

export function fromSqliteBool(value: unknown): boolean {
  return value === 1 || value === true;
}

/**
 * Single place every DAL insert/update `catch` block routes through (fix round finding #4):
 * a SQLite UNIQUE (or PRIMARY KEY) violation always becomes a 409 `ConflictError`; anything else
 * stays a 500 `DatabaseError`. Replaces per-file regexes on the SQLite error message (fragile —
 * one such regex, `uq_catalogs_project_mapping_role`, never matched the real message) with the
 * `err.code` better-sqlite3/`node-sqlite3` already sets. Friendly pre-checks that name the
 * clashing field still run first in each DAL function and throw their own `ConflictError`; this
 * is the fallback for races and for constraints with no pre-check (e.g. `catalog_fields` name).
 */
export function mapWriteError(err: unknown, conflictMessage: string, databaseMessage: string): never {
  const code = (err as { code?: string } | null | undefined)?.code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    throw new ConflictError(conflictMessage);
  }
  throw new DatabaseError(databaseMessage, err);
}
