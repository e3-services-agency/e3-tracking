import { createHash } from 'node:crypto';
import { McpToolError } from './errors';
import { getDb } from '../backend/db';

/** Wire defaults are deliberately small. Explicit detail/field requests may be larger. */
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 1000;
export interface ListOptions {
  limit?: number;
  offset?: number;
  fields?: string[];
  include?: 'detail' | 'body';
}
export interface Page<T> {
  items: Partial<T>[];
  total: number;
  offset: number;
  limit: number;
  next_offset: number | null;
  truncated: boolean;
  returned: number;
  result_marker: string;
}
export interface PageContext { project_id?: string; collection?: string; filters?: object; default_limit?: number }
export function readSnapshot<T>(fn: () => T): T { return getDb().transaction(fn)(); }
export function projectRevision(projectId: string): number {
  return (getDb().prepare('SELECT generation FROM mcp_project_revisions WHERE project_id=?').get(projectId) as { generation: number } | undefined)?.generation ?? 0;
}
export function pageBounds(input: ListOptions, defaultLimit = DEFAULT_PAGE_SIZE) {
  const limit = input.limit ?? defaultLimit, offset = input.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE || !Number.isSafeInteger(offset) || offset < 0) {
    throw new McpToolError('VALIDATION_ERROR', `limit must be an integer from 1 to ${MAX_PAGE_SIZE}; offset must be a nonnegative safe integer.`);
  }
  if (input.include !== undefined && !['detail', 'body'].includes(input.include)) throw new McpToolError('VALIDATION_ERROR', 'include must be detail or body.');
  return { limit, offset };
}
/** Select only explicit public fields, including for detail, and validate even on empty pages. */
export function pageRows<T extends object>(rows: T[], total: number, input: ListOptions, defaults: readonly string[], allowed: readonly string[], context: PageContext = {}): Page<T> {
  const { limit, offset } = pageBounds(input, context.default_limit);
  const fields = input.fields ?? (input.include ? allowed : defaults);
  if (!Array.isArray(fields) || fields.some(f => typeof f !== 'string' || !allowed.includes(f))) {
    throw new McpToolError('VALIDATION_ERROR', `fields must select from: ${allowed.join(', ')}.`);
  }
  const next = offset + rows.length;
  return {
    items: rows.map(row => Object.fromEntries(fields.filter(f => Object.hasOwn(row, f)).map(f => [f, (row as Record<string, unknown>)[f]])) as Partial<T>),
    total, offset, limit, returned: rows.length, next_offset: next < total ? next : null, truncated: next < total,
    result_marker: publicHash({ project_id: context.project_id, collection: context.collection, filters: context.filters, ordering: 'tracking-lists-v2', total,
      revision: context.project_id ? projectRevision(context.project_id) : undefined }),
  };
}
export function paginate<T extends object>(rows: T[], input: ListOptions, defaults: readonly string[], allowed: readonly string[] = defaults, context: PageContext = {}): Page<T> {
  const { limit, offset } = pageBounds(input, context.default_limit);
  return pageRows(rows.slice(offset, offset + limit), rows.length, input, defaults, allowed, context);
}

export interface ConditionalInput { if_hash?: string }
export interface Unchanged { unchanged: true; id: string; hash: string; state: unknown; revision?: number }
export type ConditionalResult<T> = (T & { hash: string; state: unknown }) | Unchanged;
/** Canonicalize public JSON only: internal fields never influence a public representation's hash. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(v => canonical(v ?? null)).join(',') + ']';
  if (value && typeof value === 'object') {
    const fields = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v));
    return '{' + fields.join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
export function conditionalRead<T extends object>(id: string, body: T, input: ConditionalInput): ConditionalResult<T> {
  const value = body as Record<string, unknown>;
  const state = value.state ?? value.status ?? null;
  const hash = publicHash({ ...body, state });
  return input.if_hash === hash ? { unchanged: true, id, hash, state, ...(typeof value.revision === 'number' ? { revision: value.revision } : {}) } : { ...body, state, hash };
}
export function publicHash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
