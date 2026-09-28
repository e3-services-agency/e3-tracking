/**
 * ChangeLog Data Access Layer (D-44, T-3-01, capability 12). `recordChange` is called by every
 * definition-mutating DAL function inside its own `db.transaction` (event, event_property,
 * property and variant so far; T-3-02 wires the rest) so a write and its history row commit or
 * roll back together -- `getDb()` is a singleton connection, so a call made while the caller's own
 * `db.transaction` callback is executing is automatically part of that same transaction, with no
 * `db` handle needing to be threaded through.
 *
 * Diffs are computed field-by-field with `diffValue` (the shared primitive `dataMapping`-style
 * import planners and the comparison engine already use, D-04/D-22) over the union of
 * `before`/`after` keys, excluding `created_at`/`updated_at` (their own columns already say when)
 * and `deleted_at` (already expressed by `action`). An `update` whose diff is empty writes
 * nothing; `create`/`delete` always write, even if every field is null, because the row's
 * existence is itself the change being recorded.
 *
 * Actor, source and batch id are never passed explicitly by a caller: they come from
 * `src/backend/context/actor.ts`'s `getActor()` (`AsyncLocalStorage`), set by the Express
 * middleware (`src/backend/middleware/actor.ts`), the MCP wrapper and import services (both
 * T-3-02).
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn } from '../db/util';
import { NotFoundError } from '../errors';
import { diffValue } from '../../domain/diff/primitives';
import type { ChangeLogAction, ChangeLogEntityType } from '../../domain/enums';
import { getActor } from '../context/actor';

/**
 * Fields never diffed: timestamps have their own columns already; `deleted_at` is expressed by
 * `action` (D-44); `project_id`/`event_id`/`property_id` are identity/scoping columns that are
 * always present and never meaningfully "change" from the History panel's point of view (fix
 * round INFO 5) -- `id` itself is kept, since a create/delete diff should still show it.
 */
const EXCLUDED_FIELDS = new Set([
  'created_at',
  'updated_at',
  'deleted_at',
  'project_id',
  'event_id',
  'property_id',
]);

export interface DiffJsonEntry {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ChangeLogRow {
  id: string;
  project_id: string;
  entity_type: ChangeLogEntityType;
  entity_id: string;
  entity_label: string | null;
  parent_entity_id: string | null;
  action: ChangeLogAction;
  actor: string;
  source: string;
  batch_id: string | null;
  changed_at: string;
  diff_json: DiffJsonEntry[];
}

type ChangeLogDbRow = Omit<ChangeLogRow, 'diff_json'>;

function mapChangeLogRow(row: ChangeLogDbRow): ChangeLogRow {
  const raw = row as unknown as Record<string, unknown>;
  return { ...row, diff_json: parseJsonColumn(raw.diff_json, []) };
}

/**
 * Field-by-field diff of two entity snapshots. `before`/`after` are `null` for a create's
 * "before"/a delete's "after" respectively, so every field of the surviving side is reported with
 * the other side as `null` (D-44's "create has before: null, delete has after: null").
 */
function computeFieldDiffs(
  entityType: string,
  key: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): DiffJsonEntry[] {
  const keys = new Set<string>([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);
  const entries: DiffJsonEntry[] = [];
  for (const field of keys) {
    if (EXCLUDED_FIELDS.has(field)) continue;
    const beforeValue = before ? before[field] : null;
    const afterValue = after ? after[field] : null;
    const diff = diffValue(entityType, key, field, beforeValue, afterValue);
    if (diff) entries.push({ field, before: diff.before, after: diff.after });
  }
  return entries;
}

export interface RecordChangeInput {
  projectId: string;
  entityType: ChangeLogEntityType;
  entityId: string;
  entityLabel: string;
  parentEntityId?: string | null;
  action: ChangeLogAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Writes one `change_log` row for a definition mutation. Skips writing when `action === 'update'`
 * and the computed diff is empty (D-44); `create`/`delete`/`restore` always write.
 */
export function recordChange(input: RecordChangeInput): void {
  const before = input.before ?? null;
  const after = input.after ?? null;
  const diff = computeFieldDiffs(input.entityType, input.entityLabel, before, after);
  if (input.action === 'update' && diff.length === 0) return;

  const actor = getActor();
  getDb()
    .prepare(
      `INSERT INTO change_log (
        id, project_id, entity_type, entity_id, entity_label, parent_entity_id, action, actor,
        source, batch_id, changed_at, diff_json
      ) VALUES (@id, @project_id, @entity_type, @entity_id, @entity_label, @parent_entity_id,
        @action, @actor, @source, @batch_id, @changed_at, @diff_json)`
    )
    .run({
      id: newId(),
      project_id: input.projectId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      entity_label: input.entityLabel,
      parent_entity_id: input.parentEntityId ?? null,
      action: input.action,
      actor: actor.actor,
      source: actor.source,
      batch_id: actor.batch_id ?? null,
      changed_at: nowIso(),
      diff_json: toJsonColumn(diff),
    });
}

export interface ListChangesFilter {
  entity_type?: string;
  entity_id?: string;
  parent_entity_id?: string;
  /** fix round (qa-tester FAIL 01:54): validated by the route against `CHANGE_LOG_ACTIONS`. */
  action?: string;
  actor?: string;
  source?: string;
  batch_id?: string;
  since?: string;
  /** Exclusive keyset cursor: the `changed_at` half. Combine with `beforeId` for a gap-free page
   * boundary (fix round ERROR 1) -- `changed_at` alone is not unique (imports can write hundreds
   * of rows in the same millisecond), so `changed_at < before` alone silently drops rows that
   * share the cursor's timestamp. Given without `beforeId`, falls back to a plain `changed_at <
   * before` filter (useful for a non-paging "everything before this instant" query). */
  before?: string;
  /** The `id` half of the composite cursor; only takes effect together with `before`. */
  beforeId?: string;
  limit?: number;
}

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;

/**
 * Newest first (`changed_at DESC, id DESC`, matching the composite cursor's tiebreaker). `before`
 * (+ `beforeId`) is an exclusive keyset cursor: `changed_at < before OR (changed_at = before AND
 * id < beforeId)`, so a page boundary that falls inside a batch of same-millisecond rows still
 * covers every row exactly once across pages (fix round ERROR 1).
 */
export function listChanges(projectId: string, filter: ListChangesFilter = {}): ChangeLogRow[] {
  const conditions: string[] = ['project_id = ?'];
  const params: unknown[] = [projectId];

  if (filter.entity_type) {
    conditions.push('entity_type = ?');
    params.push(filter.entity_type);
  }
  if (filter.entity_id) {
    conditions.push('entity_id = ?');
    params.push(filter.entity_id);
  }
  if (filter.parent_entity_id) {
    conditions.push('parent_entity_id = ?');
    params.push(filter.parent_entity_id);
  }
  if (filter.action) {
    conditions.push('action = ?');
    params.push(filter.action);
  }
  if (filter.actor) {
    conditions.push('actor = ?');
    params.push(filter.actor);
  }
  if (filter.source) {
    conditions.push('source = ?');
    params.push(filter.source);
  }
  if (filter.batch_id) {
    conditions.push('batch_id = ?');
    params.push(filter.batch_id);
  }
  if (filter.since) {
    conditions.push('changed_at >= ?');
    params.push(filter.since);
  }
  if (filter.before && filter.beforeId) {
    conditions.push('(changed_at < ? OR (changed_at = ? AND id < ?))');
    params.push(filter.before, filter.before, filter.beforeId);
  } else if (filter.before) {
    conditions.push('changed_at < ?');
    params.push(filter.before);
  }

  const limit = Math.max(1, Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  params.push(limit);

  const rows = getDb()
    .prepare(
      `SELECT * FROM change_log WHERE ${conditions.join(' AND ')} ORDER BY changed_at DESC, id DESC LIMIT ?`
    )
    .all(...params) as ChangeLogDbRow[];
  return rows.map(mapChangeLogRow);
}

/** The composite cursor for "the row right after `row`" in newest-first order (`GET /history`'s `next_cursor`). */
export function buildCursor(row: Pick<ChangeLogRow, 'changed_at' | 'id'>): string {
  return `${row.changed_at}|${row.id}`;
}

export function getChangeById(projectId: string, changeId: string): ChangeLogRow | null {
  const row = getDb()
    .prepare('SELECT * FROM change_log WHERE id = ? AND project_id = ?')
    .get(changeId, projectId) as ChangeLogDbRow | undefined;
  return row ? mapChangeLogRow(row) : null;
}

export function getChangeOrThrow(projectId: string, changeId: string): ChangeLogRow {
  const row = getChangeById(projectId, changeId);
  if (!row) throw new NotFoundError('Change log entry not found.', 'change_log');
  return row;
}
