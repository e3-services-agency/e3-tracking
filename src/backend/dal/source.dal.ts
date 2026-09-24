/**
 * Source Data Access Layer. Every function takes `projectId`; all queries enforce `project_id`.
 */
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { ConflictError, DatabaseError, NotFoundError } from '../errors';

export interface SourceRow {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceUsageRow {
  source_id: string;
  property_count: number;
  event_count: number;
}

export function listSources(projectId: string): SourceRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM sources WHERE project_id = ? ORDER BY name')
    .all(projectId) as SourceRow[];
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
  input: { name: string; color?: string | null }
): SourceRow {
  const name = input.name.trim();
  if (!name) throw new ConflictError('Source name is required.');

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM sources WHERE project_id = ? AND name = ?')
    .get(projectId, name);
  if (existing) throw new ConflictError('A source with that name already exists.');

  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      'INSERT INTO sources (id, project_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, name, input.color ?? null, now, now);
  } catch (err) {
    throw new DatabaseError(`Failed to create source: ${(err as Error).message}`, err);
  }
  return getSourceOrThrow(projectId, id);
}

export function updateSource(
  projectId: string,
  id: string,
  input: { name?: string; color?: string | null }
): SourceRow {
  getSourceOrThrow(projectId, id);
  const db = getDb();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new ConflictError('Source name is required.');
    const clash = db
      .prepare('SELECT id FROM sources WHERE project_id = ? AND name = ? AND id != ?')
      .get(projectId, trimmed, id);
    if (clash) throw new ConflictError('A source with that name already exists.');
    patch.name = trimmed;
  }
  if (input.color !== undefined) patch.color = input.color;

  if (Object.keys(patch).length === 0) return getSourceOrThrow(projectId, id);

  patch.updated_at = nowIso();
  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db.prepare(`UPDATE sources SET ${setClause} WHERE id = @id AND project_id = @project_id`).run({
    ...patch,
    id,
    project_id: projectId,
  });
  return getSourceOrThrow(projectId, id);
}

export function deleteSource(projectId: string, id: string): void {
  getSourceOrThrow(projectId, id);
  getDb().prepare('DELETE FROM sources WHERE id = ? AND project_id = ?').run(id, projectId);
}

/** Usage counts per source from `event_sources` and `event_properties.source_id`. */
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

  return sourceIds.map((source_id) => ({
    source_id,
    property_count: propertyCounts.get(source_id) ?? 0,
    event_count: eventCounts.get(source_id) ?? 0,
  }));
}
