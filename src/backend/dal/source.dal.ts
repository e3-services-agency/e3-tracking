/**
 * Source Data Access Layer. Every function takes `projectId`; all queries enforce `project_id`.
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError } from '../db/util';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { DEFAULT_SOURCE_SYSTEM, SOURCE_METHODS, SOURCE_SYSTEMS, type SourceMethod, type SourceSystem } from '../../domain/enums';
import * as ChangeLogDAL from './change-log.dal';

export interface SourceRow {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  /** D-62 (T-4-11B): what the source is (`SOURCE_SYSTEMS`), default `other`. */
  system: SourceSystem;
  /** D-62: how its data is collected (`SOURCE_METHODS`); `null` = not recorded. */
  method: SourceMethod | null;
  created_at: string;
  updated_at: string;
}

function validateSystemAndMethod(system: unknown, method: unknown): void {
  if (system !== undefined && !(SOURCE_SYSTEMS as readonly unknown[]).includes(system)) {
    throw new ValidationError(`system must be one of: ${SOURCE_SYSTEMS.join(', ')}.`, 'system');
  }
  if (method !== undefined && method !== null && !(SOURCE_METHODS as readonly unknown[]).includes(method)) {
    throw new ValidationError(`method must be one of: ${SOURCE_METHODS.join(', ')} or null.`, 'method');
  }
}

export interface SourceUsageRow {
  source_id: string;
  property_count: number;
  event_count: number;
  identity_rule_count: number;
}

export function listSources(projectId: string): SourceRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM sources WHERE project_id = ? ORDER BY name')
    .all(projectId) as SourceRow[];
}

/** D-62 (T-4-11B): every event's linked sources for the project in two queries, keyed by event id (document builders). */
export function listEventSourcesByProject(projectId: string): Map<string, SourceRow[]> {
  const db = getDb();
  const sourceById = new Map(listSources(projectId).map((s) => [s.id, s]));
  const out = new Map<string, SourceRow[]>();
  const links = db
    .prepare(
      `SELECT es.event_id as event_id, es.source_id as source_id
       FROM event_sources es JOIN events e ON e.id = es.event_id
       WHERE e.project_id = ? ORDER BY es.created_at, es.source_id`
    )
    .all(projectId) as { event_id: string; source_id: string }[];
  for (const link of links) {
    const source = sourceById.get(link.source_id);
    if (!source) continue;
    const list = out.get(link.event_id);
    if (list) list.push(source);
    else out.set(link.event_id, [source]);
  }
  return out;
}

export function getSourceOrThrow(projectId: string, id: string): SourceRow {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?')
    .get(id, projectId) as SourceRow | undefined;
  if (!row) throw new NotFoundError('Source not found.', 'source');
  return row;
}

export function createSource(
  projectId: string,
  input: { name: string; color?: string | null; system?: string; method?: string | null }
): SourceRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Source name is required.', 'name');
  validateSystemAndMethod(input.system, input.method);

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM sources WHERE project_id = ? AND name = ?')
    .get(projectId, name);
  if (existing) throw new ConflictError('A source with that name already exists.');

  const id = newId();
  const now = nowIso();
  const run = db.transaction(() => {
    try {
      db.prepare(
        'INSERT INTO sources (id, project_id, name, color, system, method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, projectId, name, input.color ?? null, input.system ?? DEFAULT_SOURCE_SYSTEM, input.method ?? null, now, now);
    } catch (err) {
      mapWriteError(err, 'A source with that name already exists.', `Failed to create source: ${(err as Error).message}`);
    }
    const created = getSourceOrThrow(projectId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'source',
      entityId: id,
      entityLabel: created.name,
      action: 'create',
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
  });
  run();
  return getSourceOrThrow(projectId, id);
}

export function updateSource(
  projectId: string,
  id: string,
  input: { name?: string; color?: string | null; system?: string; method?: string | null }
): SourceRow {
  const before = getSourceOrThrow(projectId, id);
  const db = getDb();
  validateSystemAndMethod(input.system, input.method);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new ValidationError('Source name is required.', 'name');
    const clash = db
      .prepare('SELECT id FROM sources WHERE project_id = ? AND name = ? AND id != ?')
      .get(projectId, trimmed, id);
    if (clash) throw new ConflictError('A source with that name already exists.');
    patch.name = trimmed;
  }
  if (input.color !== undefined) patch.color = input.color;
  if (input.system !== undefined) patch.system = input.system;
  if (input.method !== undefined) patch.method = input.method;

  if (Object.keys(patch).length === 0) return getSourceOrThrow(projectId, id);

  patch.updated_at = nowIso();
  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  const run = db.transaction(() => {
    try {
      db.prepare(`UPDATE sources SET ${setClause} WHERE id = @id AND project_id = @project_id`).run({
        ...patch,
        id,
        project_id: projectId,
      });
    } catch (err) {
      mapWriteError(
        err,
        'A source with that name already exists.',
        `Failed to update source: ${(err as Error).message}`
      );
    }
    const after = getSourceOrThrow(projectId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'source',
      entityId: id,
      entityLabel: after.name,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();
  return getSourceOrThrow(projectId, id);
}

export function deleteSource(projectId: string, id: string): void {
  const existing = getSourceOrThrow(projectId, id);
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare('DELETE FROM sources WHERE id = ? AND project_id = ?').run(id, projectId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'source',
      entityId: id,
      entityLabel: existing.name,
      action: 'delete',
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
}

/**
 * Usage counts per source from `event_sources`, `event_properties.source_id` and (LOW 7, reviewer
 * T-1-06 pass) `identity_rules.source_id`, so deleting a source that an identity rule still points
 * at (silently SET NULL by the schema) is visible before the user confirms the delete.
 */
export function getSourceUsage(projectId: string): SourceUsageRow[] {
  const db = getDb();
  const sourceIds = (
    db.prepare('SELECT id FROM sources WHERE project_id = ?').all(projectId) as { id: string }[]
  ).map((r) => r.id);
  if (sourceIds.length === 0) return [];

  const eventCounts = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT es.source_id as source_id, COUNT(*) as n
       FROM event_sources es
       JOIN events e ON e.id = es.event_id AND e.deleted_at IS NULL
       WHERE e.project_id = ?
       GROUP BY es.source_id`
    )
    .all(projectId) as { source_id: string; n: number }[]) {
    eventCounts.set(row.source_id, row.n);
  }

  const propertyCounts = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT ep.source_id as source_id, COUNT(*) as n
       FROM event_properties ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       WHERE e.project_id = ? AND ep.source_id IS NOT NULL
       GROUP BY ep.source_id`
    )
    .all(projectId) as { source_id: string; n: number }[]) {
    propertyCounts.set(row.source_id, row.n);
  }

  const identityRuleCounts = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT source_id, COUNT(*) as n
       FROM identity_rules
       WHERE project_id = ? AND source_id IS NOT NULL
       GROUP BY source_id`
    )
    .all(projectId) as { source_id: string; n: number }[]) {
    identityRuleCounts.set(row.source_id, row.n);
  }

  return sourceIds.map((source_id) => ({
    source_id,
    property_count: propertyCounts.get(source_id) ?? 0,
    event_count: eventCounts.get(source_id) ?? 0,
    identity_rule_count: identityRuleCounts.get(source_id) ?? 0,
  }));
}
