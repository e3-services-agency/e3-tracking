/**
 * Small shared helpers for DAL modules built on `getDb()` (better-sqlite3, synchronous API).
 * Kept here instead of duplicated per file; still SQLite-agnostic enough that a Postgres DAL
 * later would only need to change `getDb()` itself, not these helpers (D-12).
 */
import { randomUUID } from 'node:crypto';

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
