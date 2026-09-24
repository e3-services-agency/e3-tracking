/**
 * UseCase Data Access Layer (plan "Target data model" section UseCase, D-06). Every function takes
 * `projectId`; all queries enforce `project_id`. Soft delete (`deleted_at`), per the plan's storage
 * conventions line ("Soft delete only on Project, Event, Property, Catalog, UseCase"). `code` is
 * unique per project (`0001_core.sql` `UNIQUE (project_id, code)`); `nextUseCaseCode` (used by both
 * `createUseCase` when no code is given and `use-case-template.dal.ts`'s instantiate path) picks
 * the next free `UC-<n>` slot.
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError } from '../db/util';
import { NotFoundError, ValidationError } from '../errors';
import {
  USE_CASE_TYPES,
  USE_CASE_STATUSES,
  PRIORITIES,
  type UseCaseType,
  type UseCaseStatus,
} from '../../domain/enums';

export interface UseCaseRow {
  id: string;
  project_id: string;
  template_id: string | null;
  code: string | null;
  name: string;
  type: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  owner: string | null;
  notes: string | null;
  narrative: string | null;
  narrative_generated_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UseCaseInput {
  template_id?: string | null;
  code?: string | null;
  name: string;
  type?: string | null;
  description?: string | null;
  priority?: string | null;
  status?: string | null;
  owner?: string | null;
  notes?: string | null;
  narrative?: string | null;
  sort_order?: number;
}

export function listUseCases(projectId: string): UseCaseRow[] {
  return getDb()
    .prepare('SELECT * FROM use_cases WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at')
    .all(projectId) as UseCaseRow[];
}

export function getUseCaseById(projectId: string, id: string): UseCaseRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM use_cases WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
      .get(id, projectId) as UseCaseRow | undefined) ?? null
  );
}

export function getUseCaseOrThrow(projectId: string, id: string): UseCaseRow {
  const row = getUseCaseById(projectId, id);
  if (!row) throw new NotFoundError('Use case not found.', 'use_case');
  return row;
}

function validateType(type: string | null | undefined): void {
  if (type === null || type === undefined) return;
  if (!USE_CASE_TYPES.includes(type as UseCaseType)) {
    throw new ValidationError(`type must be one of ${USE_CASE_TYPES.join(', ')} or null.`, 'type');
  }
}

function validateStatus(status: string | null | undefined): void {
  if (status === null || status === undefined) return;
  if (!USE_CASE_STATUSES.includes(status as UseCaseStatus)) {
    throw new ValidationError(`status must be one of ${USE_CASE_STATUSES.join(', ')} or null.`, 'status');
  }
}

function validatePriority(priority: string | null | undefined): void {
  if (priority === null || priority === undefined) return;
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
    throw new ValidationError(`priority must be one of ${PRIORITIES.join(', ')} or null.`, 'priority');
  }
}

/**
 * Trims and upper-cases a use case code (fix round LOW 7: `'uc-01 '` used to be stored as
 * `'uc-01'`, distinct from `'UC-01'` under the case-sensitive `UNIQUE(project_id, code)` index,
 * so the same code could exist twice with different casing). Returns `null` for blank input.
 */
function normalizeCode(code: string | null | undefined): string | null {
  const trimmed = code?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/** Next free `UC-<n>` code for the project, zero-padded to at least two digits (e.g. `UC-01`, `UC-10`, `UC-100`). */
export function nextUseCaseCode(projectId: string): string {
  const rows = getDb()
    .prepare("SELECT code FROM use_cases WHERE project_id = ? AND code LIKE 'UC-%'")
    .all(projectId) as { code: string }[];
  let max = 0;
  for (const { code } of rows) {
    const match = /^UC-(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  const next = max + 1;
  return `UC-${String(next).padStart(2, '0')}`;
}

export function createUseCase(projectId: string, input: UseCaseInput): UseCaseRow {
  const name = input.name?.trim() ?? '';
  if (!name) throw new ValidationError('Use case name is required.', 'name');
  validateType(input.type);
  validateStatus(input.status);
  validatePriority(input.priority);

  const db = getDb();
  const id = newId();
  const now = nowIso();
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM use_cases WHERE project_id = ? AND deleted_at IS NULL').get(
      projectId
    ) as { m: number }
  ).m;
  const code = normalizeCode(input.code) || nextUseCaseCode(projectId);

  try {
    db.prepare(
      `INSERT INTO use_cases (
        id, project_id, template_id, code, name, type, description, priority, status, owner,
        notes, narrative, narrative_generated_at, sort_order, created_at, updated_at
      ) VALUES (@id, @project_id, @template_id, @code, @name, @type, @description, @priority,
        @status, @owner, @notes, @narrative, @narrative_generated_at, @sort_order, @created_at, @updated_at)`
    ).run({
      id,
      project_id: projectId,
      template_id: input.template_id ?? null,
      code,
      name,
      type: input.type ?? null,
      description: input.description?.trim() || null,
      priority: input.priority ?? null,
      status: input.status ?? null,
      owner: input.owner?.trim() || null,
      notes: input.notes?.trim() || null,
      narrative: input.narrative?.trim() || null,
      narrative_generated_at: null,
      sort_order: input.sort_order ?? maxOrder + 1,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(
      err,
      `A use case with code "${code}" already exists in this project.`,
      `Failed to create use case: ${(err as Error).message}`
    );
  }
  return getUseCaseOrThrow(projectId, id);
}

export function updateUseCase(projectId: string, id: string, updates: Partial<UseCaseInput>): UseCaseRow {
  getUseCaseOrThrow(projectId, id);
  if (updates.name !== undefined && !updates.name.trim()) {
    throw new ValidationError('Use case name is required.', 'name');
  }
  if (updates.type !== undefined) validateType(updates.type);
  if (updates.status !== undefined) validateStatus(updates.status);
  if (updates.priority !== undefined) validatePriority(updates.priority);
  // Fix round LOW 5: PATCH {template_id: '<unknown>'} used to hit the raw `FOREIGN KEY constraint
  // failed` from the UPDATE below and surface as a 500 `DATABASE_ERROR`; check first and respond
  // 404 like every other cross-entity reference in this codebase.
  if (updates.template_id !== undefined && updates.template_id !== null) {
    const template = getDb()
      .prepare('SELECT id FROM use_case_templates WHERE id = ?')
      .get(updates.template_id);
    if (!template) throw new NotFoundError('Use case template not found.', 'use_case_template');
  }

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.template_id !== undefined) patch.template_id = updates.template_id;
  if (updates.code !== undefined) patch.code = normalizeCode(updates.code);
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.type !== undefined) patch.type = updates.type;
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.owner !== undefined) patch.owner = updates.owner?.trim() || null;
  if (updates.notes !== undefined) patch.notes = updates.notes?.trim() || null;
  if (updates.narrative !== undefined) {
    patch.narrative = updates.narrative?.trim() || null;
    patch.narrative_generated_at = nowIso();
  }
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    getDb()
      .prepare(`UPDATE use_cases SET ${setClause} WHERE id = @id AND project_id = @project_id`)
      .run({ ...patch, id, project_id: projectId });
  } catch (err) {
    mapWriteError(
      err,
      `A use case with code "${String(patch.code ?? '')}" already exists in this project.`,
      `Failed to update use case: ${(err as Error).message}`
    );
  }
  return getUseCaseOrThrow(projectId, id);
}

/** Soft-deletes the use case; its requirements are hard-deleted in the same transaction (ON DELETE CASCADE). */
export function deleteUseCase(projectId: string, id: string): void {
  getUseCaseOrThrow(projectId, id);
  const db = getDb();
  const result = db
    .prepare('UPDATE use_cases SET deleted_at = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .run(nowIso(), id, projectId);
  if (result.changes === 0) throw new NotFoundError('Use case not found.', 'use_case');
}

/** Every use case in the project referencing this event directly (`target_kind = 'event'|'event_property'`) or via one of its variants. Read-only list for the event editor (T-1-07 acceptance). */
export function listUseCasesReferencingEvent(projectId: string, eventId: string): UseCaseRow[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT uc.* FROM use_cases uc
       JOIN requirements r ON r.use_case_id = uc.id
       LEFT JOIN variants v ON v.id = r.variant_id
       WHERE uc.project_id = ? AND uc.deleted_at IS NULL
         AND (r.event_id = ? OR v.event_id = ?)
       ORDER BY uc.sort_order, uc.created_at`
    )
    .all(projectId, eventId, eventId) as UseCaseRow[];
  return rows;
}
