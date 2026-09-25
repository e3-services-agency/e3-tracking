/**
 * IdentityRule Data Access Layer (plan "Target data model" section IdentityRule). Every function
 * takes `projectId`; all queries enforce `project_id`. `trigger_event_id` and `source_id` are
 * ON DELETE SET NULL (0005_identity_rules_on_delete.sql, T-1-06 delta): deleting the event or
 * source they name clears the reference instead of failing or losing the rule.
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError, parseJsonColumn, toJsonColumn } from '../db/util';
import { BadRequestError, NotFoundError, ValidationError } from '../errors';
import { IDENTITY_TYPES, IDENTITY_TRANSFORMATIONS, IDENTITY_SDK_CALLS, PRIORITIES, ENTITY_STATUSES } from '../../domain/enums';
import { validateAsciiName } from './validators';

export interface IdentityRuleRow {
  id: string;
  project_id: string;
  identifier_name: string;
  identity_type: string;
  name: string;
  description: string | null;
  trigger_event_id: string | null;
  trigger_text: string | null;
  value_rule: string | null;
  example: string | null;
  owner: string | null;
  source_id: string | null;
  tracker: string | null;
  priority: string | null;
  status: string | null;
  sort_order: number;
  /** D-38: `IDENTITY_TRANSFORMATIONS` subset, e.g. `['trim', 'lowercase']`; `[]` when stored NULL. */
  transformations_json: string[];
  /** D-38: `IDENTITY_SDK_CALLS`, nullable for a policy-only rule that generates no codegen call. */
  sdk_call: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw DB row shape before `transformations_json` is parsed (T text column -> string array). */
type IdentityRuleDbRow = Omit<IdentityRuleRow, 'transformations_json'> & { transformations_json: string | null };

export interface IdentityRuleInput {
  identifier_name: string;
  identity_type: string;
  name: string;
  description?: string | null;
  trigger_event_id?: string | null;
  trigger_text?: string | null;
  value_rule?: string | null;
  example?: string | null;
  owner?: string | null;
  source_id?: string | null;
  tracker?: string | null;
  priority?: string | null;
  status?: string | null;
  sort_order?: number;
  transformations_json?: string[] | null;
  sdk_call?: string | null;
}

function mapIdentityRuleRow(row: IdentityRuleDbRow): IdentityRuleRow {
  return {
    ...row,
    transformations_json: parseJsonColumn<string[]>(row.transformations_json, []),
  };
}

export function listIdentityRules(projectId: string): IdentityRuleRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM identity_rules WHERE project_id = ? ORDER BY sort_order, created_at')
    .all(projectId) as IdentityRuleDbRow[];
  return rows.map(mapIdentityRuleRow);
}

export function getIdentityRuleById(projectId: string, id: string): IdentityRuleRow | null {
  const row = getDb()
    .prepare('SELECT * FROM identity_rules WHERE id = ? AND project_id = ?')
    .get(id, projectId) as IdentityRuleDbRow | undefined;
  return row ? mapIdentityRuleRow(row) : null;
}

export function getIdentityRuleOrThrow(projectId: string, id: string): IdentityRuleRow {
  const row = getIdentityRuleById(projectId, id);
  if (!row) throw new NotFoundError('Identity rule not found.', 'identity_rule');
  return row;
}

function validateIdentityType(identityType: string): void {
  if (!IDENTITY_TYPES.includes(identityType as (typeof IDENTITY_TYPES)[number])) {
    throw new ValidationError(
      `identity_type must be one of ${IDENTITY_TYPES.join(', ')}.`,
      'identity_type'
    );
  }
}

/** LOW 3 (reviewer T-1-06 pass): `priority`/`status` must come from `enums.ts`, never be free text. */
function validatePriority(priority: string | null | undefined): void {
  if (priority === null || priority === undefined) return;
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
    throw new ValidationError(`priority must be one of ${PRIORITIES.join(', ')} or null.`, 'priority');
  }
}

function validateStatus(status: string | null | undefined): void {
  if (status === null || status === undefined) return;
  if (!ENTITY_STATUSES.includes(status as (typeof ENTITY_STATUSES)[number])) {
    throw new ValidationError(`status must be one of ${ENTITY_STATUSES.join(', ')} or null.`, 'status');
  }
}

/** D-38: `[]`/null are both valid ("no transformation"); anything else must be a subset of `IDENTITY_TRANSFORMATIONS`. */
function validateTransformations(transformations: string[] | null | undefined): void {
  if (transformations === null || transformations === undefined) return;
  if (!Array.isArray(transformations)) {
    throw new ValidationError('transformations must be an array.', 'transformations_json');
  }
  for (const t of transformations) {
    if (!IDENTITY_TRANSFORMATIONS.includes(t as (typeof IDENTITY_TRANSFORMATIONS)[number])) {
      throw new ValidationError(
        `transformations must be a subset of ${IDENTITY_TRANSFORMATIONS.join(', ')}.`,
        'transformations_json'
      );
    }
  }
}

function validateSdkCall(sdkCall: string | null | undefined): void {
  if (sdkCall === null || sdkCall === undefined) return;
  if (!IDENTITY_SDK_CALLS.includes(sdkCall as (typeof IDENTITY_SDK_CALLS)[number])) {
    throw new ValidationError(`sdk_call must be one of ${IDENTITY_SDK_CALLS.join(', ')} or null.`, 'sdk_call');
  }
}

/** Cross-project reference guards: `trigger_event_id` and `source_id` must belong to this project. */
function assertEventInProject(projectId: string, eventId: string | null | undefined): void {
  if (!eventId) return;
  const row = getDb()
    .prepare('SELECT id FROM events WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(eventId, projectId);
  if (!row) throw new BadRequestError('trigger_event_id does not belong to this project.', 'trigger_event_id');
}

function assertSourceInProject(projectId: string, sourceId: string | null | undefined): void {
  if (!sourceId) return;
  const row = getDb().prepare('SELECT id FROM sources WHERE id = ? AND project_id = ?').get(sourceId, projectId);
  if (!row) throw new BadRequestError('source_id does not belong to this project.', 'source_id');
}

export function createIdentityRule(projectId: string, input: IdentityRuleInput): IdentityRuleRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Identity rule name is required.', 'name');
  const identifierName = input.identifier_name?.trim() ?? '';
  if (!identifierName) {
    throw new ValidationError('Identifier name is required.', 'identifier_name');
  }
  validateAsciiName(identifierName, 'identifier_name');
  validateIdentityType(input.identity_type);
  validatePriority(input.priority);
  validateStatus(input.status);
  validateTransformations(input.transformations_json);
  validateSdkCall(input.sdk_call);
  assertEventInProject(projectId, input.trigger_event_id);
  assertSourceInProject(projectId, input.source_id);

  const db = getDb();
  const id = newId();
  const now = nowIso();
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM identity_rules WHERE project_id = ?').get(
      projectId
    ) as { m: number }
  ).m;

  try {
    db.prepare(
      `INSERT INTO identity_rules (
        id, project_id, identifier_name, identity_type, name, description, trigger_event_id,
        trigger_text, value_rule, example, owner, source_id, tracker, priority, status,
        sort_order, transformations_json, sdk_call, created_at, updated_at
      ) VALUES (@id, @project_id, @identifier_name, @identity_type, @name, @description,
        @trigger_event_id, @trigger_text, @value_rule, @example, @owner, @source_id, @tracker,
        @priority, @status, @sort_order, @transformations_json, @sdk_call, @created_at, @updated_at)`
    ).run({
      id,
      project_id: projectId,
      identifier_name: identifierName,
      identity_type: input.identity_type,
      name,
      description: input.description?.trim() || null,
      trigger_event_id: input.trigger_event_id ?? null,
      trigger_text: input.trigger_text?.trim() || null,
      value_rule: input.value_rule?.trim() || null,
      example: input.example?.trim() || null,
      owner: input.owner?.trim() || null,
      source_id: input.source_id ?? null,
      tracker: input.tracker?.trim() || null,
      transformations_json: toJsonColumn(input.transformations_json ?? []),
      sdk_call: input.sdk_call ?? null,
      priority: input.priority ?? null,
      status: input.status ?? null,
      sort_order: input.sort_order ?? maxOrder + 1,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(err, 'This identity rule conflicts with an existing one.', `Failed to create identity rule: ${(err as Error).message}`);
  }
  return getIdentityRuleOrThrow(projectId, id);
}

export function updateIdentityRule(
  projectId: string,
  id: string,
  updates: Partial<IdentityRuleInput>
): IdentityRuleRow {
  const existing = getIdentityRuleOrThrow(projectId, id);
  if (updates.name !== undefined && !updates.name.trim()) {
    throw new ValidationError('Identity rule name is required.', 'name');
  }
  if (updates.identifier_name !== undefined) {
    const identifierName = updates.identifier_name.trim();
    if (!identifierName) {
      throw new ValidationError('Identifier name is required.', 'identifier_name');
    }
    validateAsciiName(identifierName, 'identifier_name');
  }
  if (updates.identity_type !== undefined) validateIdentityType(updates.identity_type);
  // Defensive (T-1-06 integration fix): deleteEvent now nulls out trigger_event_id for rules that
  // point at the event it removes, so a stale reference should no longer occur; but skip
  // re-validating an unchanged value regardless, so a save that doesn't touch trigger_event_id
  // never fails just because the referenced event became soft-deleted through some other path.
  if (updates.trigger_event_id !== undefined && updates.trigger_event_id !== existing.trigger_event_id) {
    assertEventInProject(projectId, updates.trigger_event_id);
  }
  if (updates.source_id !== undefined) assertSourceInProject(projectId, updates.source_id);
  if (updates.priority !== undefined) validatePriority(updates.priority);
  if (updates.status !== undefined) validateStatus(updates.status);
  if (updates.transformations_json !== undefined) validateTransformations(updates.transformations_json);
  if (updates.sdk_call !== undefined) validateSdkCall(updates.sdk_call);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.identifier_name !== undefined) patch.identifier_name = updates.identifier_name.trim();
  if (updates.identity_type !== undefined) patch.identity_type = updates.identity_type;
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.trigger_event_id !== undefined) patch.trigger_event_id = updates.trigger_event_id;
  if (updates.trigger_text !== undefined) patch.trigger_text = updates.trigger_text?.trim() || null;
  if (updates.value_rule !== undefined) patch.value_rule = updates.value_rule?.trim() || null;
  if (updates.example !== undefined) patch.example = updates.example?.trim() || null;
  if (updates.owner !== undefined) patch.owner = updates.owner?.trim() || null;
  if (updates.source_id !== undefined) patch.source_id = updates.source_id;
  if (updates.tracker !== undefined) patch.tracker = updates.tracker?.trim() || null;
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order;
  if (updates.transformations_json !== undefined) {
    patch.transformations_json = toJsonColumn(updates.transformations_json ?? []);
  }
  if (updates.sdk_call !== undefined) patch.sdk_call = updates.sdk_call;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    getDb()
      .prepare(`UPDATE identity_rules SET ${setClause} WHERE id = @id AND project_id = @project_id`)
      .run({ ...patch, id, project_id: projectId });
  } catch (err) {
    mapWriteError(err, 'This identity rule conflicts with an existing one.', `Failed to update identity rule: ${(err as Error).message}`);
  }
  return getIdentityRuleOrThrow(projectId, id);
}

export function deleteIdentityRule(projectId: string, id: string): void {
  getIdentityRuleOrThrow(projectId, id);
  const result = getDb()
    .prepare('DELETE FROM identity_rules WHERE id = ? AND project_id = ?')
    .run(id, projectId);
  if (result.changes === 0) throw new NotFoundError('Identity rule not found.', 'identity_rule');
}

/**
 * Reorders the project's identity rules: `orderedIds` is the full desired order (T-1-06 "move up /
 * move down"). Every id must already belong to the project; sort_order becomes the id's index.
 */
export function reorderIdentityRules(projectId: string, orderedIds: string[]): IdentityRuleRow[] {
  const db = getDb();
  const existing = listIdentityRules(projectId);
  const existingIds = new Set(existing.map((r) => r.id));
  const unique = [...new Set(orderedIds)];
  if (unique.length !== existing.length || !unique.every((id) => existingIds.has(id))) {
    throw new BadRequestError(
      'ids must be exactly the set of this project’s identity rule ids.',
      'ids'
    );
  }
  const now = nowIso();
  const reorder = db.transaction(() => {
    const stmt = db.prepare('UPDATE identity_rules SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?');
    unique.forEach((id, index) => stmt.run(index, now, id, projectId));
  });
  reorder();
  return listIdentityRules(projectId);
}
