/**
 * ConsentCategory Data Access Layer (plan "Target data model" section ConsentCategory). Every
 * function takes `projectId`; all queries enforce `project_id`. `standard_key` is validated
 * against the seed list in `src/domain/bloomreach.ts` plus the project's
 * `consent_key_additions_json` (D-26, T-1-06 delta), never a hardcoded closed union.
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError } from '../db/util';
import { BadRequestError, NotFoundError, ValidationError } from '../errors';
import { isKnownConsentKey } from '../../domain/bloomreach';
import { getProjectById } from './project.dal';
import { ENTITY_STATUSES } from '../../domain/enums';
import { markRequirementsGapForConsentCategoryRemoval } from './requirement.dal';
import * as ChangeLogDAL from './change-log.dal';

export interface ConsentCategoryRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  standard_key: string | null;
  status: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ConsentCategoryInput {
  name: string;
  description?: string | null;
  standard_key?: string | null;
  status?: string | null;
  sort_order?: number;
}

export function listConsentCategories(projectId: string): ConsentCategoryRow[] {
  return getDb()
    .prepare('SELECT * FROM consent_categories WHERE project_id = ? ORDER BY sort_order, created_at')
    .all(projectId) as ConsentCategoryRow[];
}

export function getConsentCategoryById(projectId: string, id: string): ConsentCategoryRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM consent_categories WHERE id = ? AND project_id = ?')
      .get(id, projectId) as ConsentCategoryRow | undefined) ?? null
  );
}

export function getConsentCategoryOrThrow(projectId: string, id: string): ConsentCategoryRow {
  const row = getConsentCategoryById(projectId, id);
  if (!row) throw new NotFoundError('Consent category not found.', 'consent_category');
  return row;
}

/**
 * Validates `standard_key` against the seed list plus this project's additions (D-26). LOW 5
 * (reviewer T-1-06 pass): trims before validating so `" newsletter "` is treated the same as
 * `"newsletter"` instead of being rejected as unknown; callers still trim again before storing.
 */
function validateStandardKey(projectId: string, standardKey: string | null | undefined): void {
  const trimmed = standardKey?.trim();
  if (!trimmed) return;
  const project = getProjectById(projectId);
  const additions = (project?.consent_key_additions_json as string[] | null) ?? [];
  if (!isKnownConsentKey(trimmed, additions)) {
    throw new ValidationError(
      `standard_key "${trimmed}" is not a known standard consent key or project addition.`,
      'standard_key'
    );
  }
}

/** LOW 3 (reviewer T-1-06 pass): `status` must come from `enums.ts`, never be free text. */
function validateStatus(status: string | null | undefined): void {
  if (status === null || status === undefined) return;
  if (!ENTITY_STATUSES.includes(status as (typeof ENTITY_STATUSES)[number])) {
    throw new ValidationError(`status must be one of ${ENTITY_STATUSES.join(', ')} or null.`, 'status');
  }
}

export function createConsentCategory(
  projectId: string,
  input: ConsentCategoryInput
): ConsentCategoryRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Consent category name is required.', 'name');
  validateStandardKey(projectId, input.standard_key);
  validateStatus(input.status);

  const db = getDb();
  const id = newId();
  const now = nowIso();
  const maxOrder = (
    db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM consent_categories WHERE project_id = ?')
      .get(projectId) as { m: number }
  ).m;

  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO consent_categories (
          id, project_id, name, description, standard_key, status, sort_order, created_at, updated_at
        ) VALUES (@id, @project_id, @name, @description, @standard_key, @status, @sort_order, @created_at, @updated_at)`
      ).run({
        id,
        project_id: projectId,
        name,
        description: input.description?.trim() || null,
        standard_key: input.standard_key?.trim() || null,
        status: input.status ?? null,
        sort_order: input.sort_order ?? maxOrder + 1,
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      mapWriteError(
        err,
        `A consent category named "${name}" already exists in this project.`,
        `Failed to create consent category: ${(err as Error).message}`
      );
    }
    const created = getConsentCategoryOrThrow(projectId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'consent_category',
      entityId: id,
      entityLabel: created.name,
      action: 'create',
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
  });
  run();
  return getConsentCategoryOrThrow(projectId, id);
}

export function updateConsentCategory(
  projectId: string,
  id: string,
  updates: Partial<ConsentCategoryInput>
): ConsentCategoryRow {
  const before = getConsentCategoryOrThrow(projectId, id);
  if (updates.name !== undefined && !updates.name.trim()) {
    throw new ValidationError('Consent category name is required.', 'name');
  }
  if (updates.standard_key !== undefined) validateStandardKey(projectId, updates.standard_key);
  if (updates.status !== undefined) validateStatus(updates.status);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.standard_key !== undefined) patch.standard_key = updates.standard_key?.trim() || null;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  const db = getDb();
  const run = db.transaction(() => {
    try {
      db.prepare(`UPDATE consent_categories SET ${setClause} WHERE id = @id AND project_id = @project_id`)
        .run({ ...patch, id, project_id: projectId });
    } catch (err) {
      mapWriteError(
        err,
        `A consent category named "${String(patch.name ?? '')}" already exists in this project.`,
        `Failed to update consent category: ${(err as Error).message}`
      );
    }
    const after = getConsentCategoryOrThrow(projectId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'consent_category',
      entityId: id,
      entityLabel: after.name,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();
  return getConsentCategoryOrThrow(projectId, id);
}

export function deleteConsentCategory(projectId: string, id: string): void {
  const existing = getConsentCategoryOrThrow(projectId, id);
  const db = getDb();
  const run = db.transaction(() => {
    // T-3-10 (D-57): same gap-marking as the property/event/variant/catalog-field removals above,
    // run inside the same transaction as the DELETE (merge note, T-3-02 review).
    markRequirementsGapForConsentCategoryRemoval(projectId, id, existing.name);
    const result = db
      .prepare('DELETE FROM consent_categories WHERE id = ? AND project_id = ?')
      .run(id, projectId);
    if (result.changes === 0) throw new NotFoundError('Consent category not found.', 'consent_category');
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'consent_category',
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
 * T-3-10 (D-55/D-57): resolution target for `consent` library requirements, which name a consent
 * by its Bloomreach `standard_key` (e.g. `newsletter`) -- falls back to an exact `name` match so a
 * project without that standard key mapped, but with a category literally named that, still
 * resolves.
 */
export function findConsentCategoryByStandardKeyOrName(projectId: string, key: string): ConsentCategoryRow | null {
  const byStandardKey = getDb()
    .prepare('SELECT * FROM consent_categories WHERE project_id = ? AND standard_key = ?')
    .get(projectId, key) as ConsentCategoryRow | undefined;
  if (byStandardKey) return byStandardKey;
  return (
    (getDb()
      .prepare('SELECT * FROM consent_categories WHERE project_id = ? AND name = ?')
      .get(projectId, key) as ConsentCategoryRow | undefined) ?? null
  );
}

/** Reorders the project's consent categories; `orderedIds` must be the full existing id set. One
 * `update` change_log row per category whose `sort_order` actually changed (T-3-02). */
export function reorderConsentCategories(projectId: string, orderedIds: string[]): ConsentCategoryRow[] {
  const db = getDb();
  const existing = listConsentCategories(projectId);
  const existingIds = new Set(existing.map((r) => r.id));
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const unique = [...new Set(orderedIds)];
  if (unique.length !== existing.length || !unique.every((id) => existingIds.has(id))) {
    throw new BadRequestError(
      'ids must be exactly the set of this project’s consent category ids.',
      'ids'
    );
  }
  const now = nowIso();
  const reorder = db.transaction(() => {
    const stmt = db.prepare(
      'UPDATE consent_categories SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?'
    );
    unique.forEach((id, index) => {
      const before = existingById.get(id)!;
      if (before.sort_order === index) return;
      stmt.run(index, now, id, projectId);
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'consent_category',
        entityId: id,
        entityLabel: before.name,
        action: 'update',
        before: { sort_order: before.sort_order },
        after: { sort_order: index },
      });
    });
  });
  reorder();
  return listConsentCategories(projectId);
}
