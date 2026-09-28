/**
 * Property bundles: project-scoped groups of properties via `property_bundle_items` (D-26: kept
 * as a shell convenience, seed for a later event-template feature).
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError } from '../db/util';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../errors';
import * as ChangeLogDAL from './change-log.dal';

export interface PropertyBundleRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type BundleWithPropertyIds = PropertyBundleRow & { property_ids: string[] };

function validatePropertyIds(projectId: string, propertyIds: string[]): void {
  if (propertyIds.length === 0) return;
  const db = getDb();
  const placeholders = propertyIds.map(() => '?').join(', ');
  const found = new Set(
    (
      db
        .prepare(
          `SELECT id FROM properties WHERE project_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`
        )
        .all(projectId, ...propertyIds) as { id: string }[]
    ).map((r) => r.id)
  );
  for (const id of propertyIds) {
    if (!found.has(id)) throw new BadRequestError(`Property not found in project: ${id}.`, 'property_ids');
  }
}

export function listBundleIdsByPropertyIds(
  projectId: string,
  propertyIds: string[]
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const id of propertyIds) out.set(id, []);
  if (propertyIds.length === 0) return out;

  const db = getDb();
  const placeholders = propertyIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT pbi.bundle_id as bundle_id, pbi.property_id as property_id
       FROM property_bundle_items pbi
       JOIN property_bundles pb ON pb.id = pbi.bundle_id AND pb.project_id = ? AND pb.deleted_at IS NULL
       WHERE pbi.property_id IN (${placeholders})`
    )
    .all(projectId, ...propertyIds) as { bundle_id: string; property_id: string }[];

  for (const row of rows) {
    const list = out.get(row.property_id);
    if (list) list.push(row.bundle_id);
  }
  for (const ids of out.values()) ids.sort();
  return out;
}

export function replacePropertyBundlesForProperty(
  projectId: string,
  propertyId: string,
  bundleIds: string[]
): void {
  const deduped = [...new Set(bundleIds)].filter(Boolean);
  const db = getDb();

  if (deduped.length > 0) {
    const placeholders = deduped.map(() => '?').join(', ');
    const found = new Set(
      (
        db
          .prepare(
            `SELECT id FROM property_bundles WHERE project_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`
          )
          .all(projectId, ...deduped) as { id: string }[]
      ).map((r) => r.id)
    );
    for (const id of deduped) {
      if (!found.has(id)) throw new BadRequestError(`Bundle not found in project: ${id}.`, 'bundle_ids');
    }
  }

  const property = db
    .prepare('SELECT id FROM properties WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(propertyId, projectId);
  if (!property) throw new NotFoundError('Property not found.', 'property');

  const now = nowIso();
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM property_bundle_items WHERE property_id = ?').run(propertyId);
    const insert = db.prepare(
      'INSERT INTO property_bundle_items (bundle_id, property_id, created_at) VALUES (?, ?, ?)'
    );
    for (const bundleId of deduped) insert.run(bundleId, propertyId, now);
  });
  replace();
}

function loadPropertyIds(bundleId: string): string[] {
  const db = getDb();
  return (
    db
      .prepare('SELECT property_id FROM property_bundle_items WHERE bundle_id = ? ORDER BY property_id')
      .all(bundleId) as { property_id: string }[]
  ).map((r) => r.property_id);
}

export function listBundles(projectId: string): BundleWithPropertyIds[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM property_bundles WHERE project_id = ? AND deleted_at IS NULL ORDER BY name')
    .all(projectId) as PropertyBundleRow[];
  return rows.map((row) => ({ ...row, property_ids: loadPropertyIds(row.id) }));
}

export function getBundleById(projectId: string, bundleId: string): BundleWithPropertyIds | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM property_bundles WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(bundleId, projectId) as PropertyBundleRow | undefined;
  if (!row) return null;
  return { ...row, property_ids: loadPropertyIds(row.id) };
}

export function getBundleOrThrow(projectId: string, bundleId: string): BundleWithPropertyIds {
  const row = getBundleById(projectId, bundleId);
  if (!row) throw new NotFoundError('Bundle not found.', 'bundle');
  return row;
}

export function createBundle(
  projectId: string,
  input: { name: string; description?: string | null; property_ids?: string[] | null }
): BundleWithPropertyIds {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Bundle name is required.', 'name');

  const propertyIds = [...new Set((input.property_ids ?? []).filter(Boolean))];
  validatePropertyIds(projectId, propertyIds);

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM property_bundles WHERE project_id = ? AND name = ? AND deleted_at IS NULL')
    .get(projectId, name);
  if (existing) throw new ConflictError('A bundle with that name already exists in this project.');

  const id = newId();
  const now = nowIso();
  try {
    const create = db.transaction(() => {
      db.prepare(
        'INSERT INTO property_bundles (id, project_id, name, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)'
      ).run(id, projectId, name, input.description?.trim() || null, now, now);
      const insert = db.prepare(
        'INSERT INTO property_bundle_items (bundle_id, property_id, created_at) VALUES (?, ?, ?)'
      );
      for (const propertyId of propertyIds) insert.run(id, propertyId, now);
      const created = getBundleOrThrow(projectId, id);
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'property_bundle',
        entityId: id,
        entityLabel: created.name,
        action: 'create',
        before: null,
        after: created as unknown as Record<string, unknown>,
      });
    });
    create();
  } catch (err) {
    mapWriteError(
      err,
      'A bundle with that name already exists in this project.',
      `Failed to create bundle: ${(err as Error).message}`
    );
  }
  return getBundleOrThrow(projectId, id);
}

export function updateBundle(
  projectId: string,
  bundleId: string,
  input: { name?: string; description?: string | null; property_ids?: string[] | null }
): BundleWithPropertyIds {
  const before = getBundleOrThrow(projectId, bundleId);
  const db = getDb();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError('Bundle name cannot be empty.', 'name');
    const clash = db
      .prepare(
        'SELECT id FROM property_bundles WHERE project_id = ? AND name = ? AND id != ? AND deleted_at IS NULL'
      )
      .get(projectId, name, bundleId);
    if (clash) throw new ConflictError('A bundle with that name already exists in this project.');
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;

  const run = db.transaction(() => {
    if (Object.keys(patch).length > 0) {
      patch.updated_at = nowIso();
      const setClause = Object.keys(patch)
        .map((k) => `${k} = @${k}`)
        .join(', ');
      try {
        db.prepare(`UPDATE property_bundles SET ${setClause} WHERE id = @id AND project_id = @project_id`).run({
          ...patch,
          id: bundleId,
          project_id: projectId,
        });
      } catch (err) {
        mapWriteError(
          err,
          'A bundle with that name already exists in this project.',
          `Failed to update bundle: ${(err as Error).message}`
        );
      }
    }

    if (input.property_ids !== undefined) {
      const propertyIds = [...new Set((input.property_ids ?? []).filter(Boolean))];
      validatePropertyIds(projectId, propertyIds);
      const now = nowIso();
      db.prepare('DELETE FROM property_bundle_items WHERE bundle_id = ?').run(bundleId);
      const insert = db.prepare(
        'INSERT INTO property_bundle_items (bundle_id, property_id, created_at) VALUES (?, ?, ?)'
      );
      for (const propertyId of propertyIds) insert.run(bundleId, propertyId, now);
    }

    const after = getBundleOrThrow(projectId, bundleId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'property_bundle',
      entityId: bundleId,
      entityLabel: after.name,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();

  return getBundleOrThrow(projectId, bundleId);
}

export function deleteBundle(projectId: string, bundleId: string): void {
  const existing = getBundleOrThrow(projectId, bundleId);
  const db = getDb();
  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare('UPDATE property_bundles SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?').run(
      now,
      now,
      bundleId,
      projectId
    );
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'property_bundle',
      entityId: bundleId,
      entityLabel: existing.name,
      action: 'delete',
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
}
