/**
 * Shared machinery for the MCP write tools (T-5-01, D-11, D-44, D-04).
 *
 * Every write tool is a `WriteTool`: a zod input shape plus a `prepare` that resolves names/ids and
 * returns a `WriteOp` whose `run()` performs the write through the same DAL function the REST route
 * calls (never raw SQL). `executeOp` then produces the one result shape every tool shares:
 * `{action: create|update|unchanged|delete, before, after, differences, warnings, ...}`.
 *
 * Dry run (the default, D-04's preview-then-confirm): the op really runs inside a SQLite
 * transaction that is always rolled back. That gives the full DAL validation (unique names, enum
 * checks, registry checks, D-69 type mismatch) and the exact resulting row for the diff, while
 * writing nothing, including no `change_log` rows. better-sqlite3 nests this as a savepoint, so
 * `batch_apply` uses the same wrapper around its whole run.
 */
import { z } from 'zod';
import type { ZodRawShape } from 'zod';
import { getDb } from '../../backend/db';
import { diffValue } from '../../domain/diff/primitives';
import type { Difference } from '../../domain/diff/types';
import { McpToolError } from '../errors';
import { getActor } from '../../backend/context/actor';

export const writeCommonShape = {
  project_key: z.string().optional(),
  agent_name: z.string().optional(),
  dry_run: z.boolean().optional(),
};

export interface WriteCommonInput {
  project_key?: string;
  agent_name?: string;
  dry_run?: boolean;
}

export type WriteAction = 'create' | 'update' | 'unchanged' | 'delete';

export interface WriteOp {
  entityType: string;
  label: string;
  /** The current row, or null when the op creates. */
  before: Record<string, unknown> | null;
  /** Performs the write via the DAL; `row` is the resulting row (null for a delete). */
  run(): { row: Record<string, unknown> | null; entityId: string };
  warnings?: (row: Record<string, unknown> | null) => string[];
}

export interface WriteResult {
  dry_run: boolean;
  action: WriteAction;
  entity_type: string;
  entity_id: string | null;
  label: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  differences: Difference[];
  warnings: string[];
  change_log_id: string | null;
  change_log_ids: string[];
}

export interface WriteTool {
  name: string;
  description: string;
  shape: ZodRawShape;
  prepare(projectId: string, args: Record<string, unknown>): WriteOp;
}

class Rollback extends Error {}

/** Runs `fn` inside a transaction that is always rolled back; errors from `fn` propagate unchanged. */
export function withRollback<T>(fn: () => T): T {
  let out: T | undefined;
  try {
    getDb().transaction(() => {
      out = fn();
      throw new Rollback();
    })();
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return out as T;
}

const IGNORED_DIFF_FIELDS = new Set(['updated_at', 'created_at']);

function computeDifferences(op: WriteOp, after: Record<string, unknown> | null): { action: WriteAction; differences: Difference[] } {
  if (!op.before) return { action: 'create', differences: [] };
  if (!after) return { action: 'delete', differences: [] };
  const differences: Difference[] = [];
  for (const key of Object.keys(after)) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;
    const d = diffValue(op.entityType, op.label, key, op.before[key], after[key]);
    if (d) differences.push(d);
  }
  return { action: differences.length ? 'update' : 'unchanged', differences };
}

function maxChangeRowid(): number {
  return (getDb().prepare('SELECT COALESCE(MAX(rowid), 0) AS m FROM change_log').get() as { m: number }).m;
}

/**
 * Runs the op for real (the caller decides whether that is inside `withRollback`) and shapes the
 * result. `change_log_ids` are the rows this op wrote, `change_log_id` the one for the op's own entity.
 */
export function executeOp(op: WriteOp, applied: boolean): WriteResult {
  const mark = maxChangeRowid();
  const { row, entityId } = op.run();
  const { action, differences } = computeDifferences(op, row);
  const logs = applied
    ? (getDb()
        .prepare('SELECT id, entity_id FROM change_log WHERE rowid > ? AND actor = ? AND source = ? AND batch_id IS ? ORDER BY rowid')
        .all(mark, getActor().actor, getActor().source, getActor().batch_id ?? null) as { id: string; entity_id: string }[])
    : [];
  const own = logs.find((l) => l.entity_id === entityId) ?? logs[0];
  return {
    dry_run: !applied,
    action,
    entity_type: op.entityType,
    entity_id: applied || op.before ? entityId : null,
    label: op.label,
    before: op.before,
    after: row,
    differences,
    warnings: op.warnings ? op.warnings(row) : [],
    change_log_id: own?.id ?? null,
    change_log_ids: logs.map((l) => l.id),
  };
}

/** Parses tool args against the tool's shape (batch ops bypass the MCP SDK's own validation). */
export function parseArgs(tool: WriteTool, raw: Record<string, unknown>): Record<string, unknown> {
  const parsed = z.object({ ...writeCommonShape, ...tool.shape }).strict().safeParse(raw);
  if (!parsed.success) {
    const unknown = parsed.error.issues.flatMap((i) => (i.code === 'unrecognized_keys' ? i.keys : []));
    const msg = (unknown.length ? [`unknown key(s): ${unknown.join(', ')}`] : []).concat(parsed.error.issues.filter((i) => i.code !== 'unrecognized_keys').map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`)).join('; ');
    throw new McpToolError('VALIDATION_ERROR', `Invalid arguments for ${tool.name}: ${msg}`);
  }
  return parsed.data as Record<string, unknown>;
}

/** One tool call: validate, prepare, then dry-run (rolled back) or apply. */
export function runWriteTool(projectId: string, tool: WriteTool, raw: Record<string, unknown>, dryRun: boolean): WriteResult {
  const args = parseArgs(tool, raw);
  const op = tool.prepare(projectId, args);
  return dryRun ? withRollback(() => executeOp(op, false)) : executeOp(op, true);
}

/** Picks the listed keys that are present (not undefined) in `args`. */
export function pick(args: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (args[k] !== undefined) out[k] = args[k];
  return out;
}

/** Copies each alias onto its canonical key when only the alias was given, and drops the alias. */
export function applyAliases(args: Record<string, unknown>, aliases: Record<string, string>): Record<string, unknown> {
  const out = { ...args };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (out[alias] !== undefined && out[canonical] === undefined) out[canonical] = out[alias];
    delete out[alias];
  }
  return out;
}
