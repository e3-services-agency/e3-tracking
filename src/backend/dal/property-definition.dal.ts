/**
 * Property definition Data Access Layer (D-58, T-4-00). A property keeps its shared identity
 * (name, data_type, pii, source); `property_definitions` holds one or more *named* meanings per
 * property (name, description, allowed_values_json, formats_json, example_values_json) -- the
 * same attribute can mean different things on different events (`action` on `cart_update` vs
 * `consent`). Every property always has at least one definition; `event_properties.definition_id`
 * points at the one an event link uses (validated to belong to the same property).
 *
 * `formats_json` is an array, not a scalar (fix round, reviewer FAIL 2026-09-28 14:26, ERROR 1): a
 * property can carry several formats at once (e.g. `email` and `uri` both ticked), and every one
 * of them must be checked per event, not just the first.
 *
 * Every property gets its `general` definition seeded at creation time from the property's own
 * fields (`property.dal.ts#createProperty`); until phase 5 drops the now-redundant property
 * columns, the `general` definition and the property's own
 * description/allowed_values_json/data_formats_json/example_values_json stay mirrored **both
 * ways** inside one transaction (fix round, WARNING 2 ruling): an update to the property syncs
 * `general` (`syncGeneralDefinitionFromProperty`, called from `property.dal.ts#updateProperty`);
 * an update to the `general` definition itself syncs the property back
 * (`syncPropertyFromGeneralDefinition`, called from this module's own `updateDefinition`) -- so a
 * property with a single definition behaves exactly as it did before this table existed, from
 * either editor (D-58: "a property with one definition looks as today").
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, mapWriteError } from '../db/util';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../errors';
import { PROPERTY_DATA_FORMATS, PROPERTY_DEFINITION_DEFAULT_NAME } from '../../domain/enums';
import * as ChangeLogDAL from './change-log.dal';

export interface PropertyDefinitionRow {
  id: string;
  project_id: string;
  property_id: string;
  name: string;
  description: string | null;
  allowed_values_json: unknown;
  formats_json: unknown;
  example_values_json: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type PropertyDefinitionDbRow = Omit<
  PropertyDefinitionRow,
  'allowed_values_json' | 'formats_json' | 'example_values_json'
>;

function mapRow(row: PropertyDefinitionDbRow): PropertyDefinitionRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    allowed_values_json: parseJsonColumn(raw.allowed_values_json, []),
    formats_json: parseJsonColumn(raw.formats_json, []),
    example_values_json: parseJsonColumn(raw.example_values_json, []),
  };
}

export interface PropertyDefinitionInput {
  name: string;
  description?: string | null;
  allowed_values_json?: unknown;
  formats_json?: unknown;
  example_values_json?: unknown;
}

function validateFormats(formats: unknown): void {
  if (formats === undefined || formats === null) return;
  if (!Array.isArray(formats)) {
    throw new BadRequestError('formats_json must be an array.', 'formats_json');
  }
  for (const fmt of formats) {
    if (!(PROPERTY_DATA_FORMATS as readonly string[]).includes(String(fmt))) {
      throw new BadRequestError(`Unknown format "${fmt}".`, 'formats_json');
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateAllowedValues(allowedValues: unknown): void {
  if (allowedValues === undefined || allowedValues === null) return;
  if (!Array.isArray(allowedValues)) {
    throw new BadRequestError('allowed_values_json must be an array.', 'allowed_values_json');
  }
  for (const row of allowedValues) {
    if (!isPlainObject(row) || typeof row.value !== 'string' || !row.value.trim()) {
      throw new BadRequestError('Each allowed value needs a non-empty "value".', 'allowed_values_json');
    }
  }
}

function assertPropertyExists(projectId: string, propertyId: string): void {
  const property = getDb()
    .prepare('SELECT id FROM properties WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(propertyId, projectId);
  if (!property) throw new NotFoundError('Property not found.', 'property');
}

/** Event names currently linked through each of this property's definitions, keyed by definition
 * id (Properties page "using events", qa-roundtrip scenario 15). One batched query, not one per
 * definition. */
export function listUsingEventNamesByDefinitionId(projectId: string, propertyId: string): Map<string, string[]> {
  const rows = getDb()
    .prepare(
      `SELECT ep.definition_id as definition_id, e.name as event_name
       FROM event_properties ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       WHERE ep.property_id = ? AND e.project_id = ? AND ep.definition_id IS NOT NULL
       ORDER BY e.name`
    )
    .all(propertyId, projectId) as { definition_id: string; event_name: string }[];
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.definition_id) ?? [];
    list.push(row.event_name);
    map.set(row.definition_id, list);
  }
  return map;
}

/** Every definition of every given property in one query (fix round WARNING 3: `EventCardBuildContext`
 * loads this once per project instead of `getDefinitionById` per link). Soft-deleted definitions
 * excluded, same as `listDefinitions`. */
export function listDefinitionsByPropertyIds(
  projectId: string,
  propertyIds: string[]
): Map<string, PropertyDefinitionRow> {
  const map = new Map<string, PropertyDefinitionRow>();
  if (propertyIds.length === 0) return map;
  const placeholders = propertyIds.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT * FROM property_definitions WHERE project_id = ? AND deleted_at IS NULL AND property_id IN (${placeholders})`
    )
    .all(projectId, ...propertyIds) as PropertyDefinitionDbRow[];
  for (const row of rows) map.set(row.id, mapRow(row));
  return map;
}

/** Every non-deleted definition in the project, keyed by id (fix round WARNING 3: one query for
 * `EventCardBuildContext`/`buildTrackingDocument`, never one per link). */
export function listAllDefinitionsById(projectId: string): Map<string, PropertyDefinitionRow> {
  const map = new Map<string, PropertyDefinitionRow>();
  const rows = getDb()
    .prepare('SELECT * FROM property_definitions WHERE project_id = ? AND deleted_at IS NULL')
    .all(projectId) as PropertyDefinitionDbRow[];
  for (const row of rows) map.set(row.id, mapRow(row));
  return map;
}

export function listDefinitions(projectId: string, propertyId: string): PropertyDefinitionRow[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM property_definitions WHERE project_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY sort_order, name'
    )
    .all(projectId, propertyId) as PropertyDefinitionDbRow[];
  return rows.map(mapRow);
}

export function getDefinitionById(projectId: string, definitionId: string): PropertyDefinitionRow | null {
  const row = getDb()
    .prepare('SELECT * FROM property_definitions WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(definitionId, projectId) as PropertyDefinitionDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function getDefinitionOrThrow(projectId: string, definitionId: string): PropertyDefinitionRow {
  const row = getDefinitionById(projectId, definitionId);
  if (!row) throw new NotFoundError('Property definition not found.', 'property_definition');
  return row;
}

/** Validates that `definitionId` (when given) exists and belongs to `propertyId` in this project. */
export function assertDefinitionBelongsToProperty(
  projectId: string,
  propertyId: string,
  definitionId: string | null | undefined
): void {
  if (definitionId === undefined || definitionId === null) return;
  const row = getDefinitionById(projectId, definitionId);
  if (!row || row.property_id !== propertyId) {
    throw new BadRequestError('definition_id does not belong to this property.', 'definition_id');
  }
}

/** The definition an event link falls back to when it names none explicitly: the property's
 * `general` definition, or its first definition by sort order if `general` was renamed/removed. */
export function getDefaultDefinitionId(projectId: string, propertyId: string): string | null {
  const db = getDb();
  const named = db
    .prepare(
      'SELECT id FROM property_definitions WHERE project_id = ? AND property_id = ? AND name = ? AND deleted_at IS NULL'
    )
    .get(projectId, propertyId, PROPERTY_DEFINITION_DEFAULT_NAME) as { id: string } | undefined;
  if (named) return named.id;
  const first = db
    .prepare(
      'SELECT id FROM property_definitions WHERE project_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY sort_order, name LIMIT 1'
    )
    .get(projectId, propertyId) as { id: string } | undefined;
  return first?.id ?? null;
}

/** Called by `property.dal.ts#createProperty` inside its own transaction: seeds the one `general`
 * definition every new property gets, from the property's own fields. */
export function seedDefaultDefinition(
  projectId: string,
  propertyId: string,
  fields: {
    description: string | null;
    allowed_values_json: unknown;
    data_formats_json: unknown;
    example_values_json: unknown;
  }
): PropertyDefinitionRow {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO property_definitions (
      id, project_id, property_id, name, description, allowed_values_json, formats_json,
      example_values_json, sort_order, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`
  ).run(
    id,
    projectId,
    propertyId,
    PROPERTY_DEFINITION_DEFAULT_NAME,
    fields.description,
    toJsonColumn(fields.allowed_values_json ?? []),
    toJsonColumn(Array.isArray(fields.data_formats_json) ? fields.data_formats_json : []),
    toJsonColumn(fields.example_values_json ?? []),
    now,
    now
  );
  return getDefinitionOrThrow(projectId, id);
}

/** Called by `property.dal.ts#updateProperty` inside its own transaction whenever the property's
 * description/allowed_values_json/example_values_json/data_formats_json change: keeps the
 * `general` definition's matching fields in sync (property -> definition, one half of the WARNING
 * 2 two-way mirror). Other (renamed) definitions are untouched. */
export function syncGeneralDefinitionFromProperty(
  projectId: string,
  propertyId: string,
  patch: {
    description?: string | null;
    allowed_values_json?: unknown;
    data_formats_json?: unknown;
    example_values_json?: unknown;
  }
): void {
  const db = getDb();
  const general = db
    .prepare(
      'SELECT id FROM property_definitions WHERE project_id = ? AND property_id = ? AND name = ? AND deleted_at IS NULL'
    )
    .get(projectId, propertyId, PROPERTY_DEFINITION_DEFAULT_NAME) as { id: string } | undefined;
  if (!general) return;

  const set: string[] = [];
  const params: Record<string, unknown> = { id: general.id, updated_at: nowIso() };
  if (patch.description !== undefined) {
    set.push('description = @description');
    params.description = patch.description;
  }
  if (patch.allowed_values_json !== undefined) {
    set.push('allowed_values_json = @allowed_values_json');
    params.allowed_values_json = toJsonColumn(patch.allowed_values_json);
  }
  if (patch.example_values_json !== undefined) {
    set.push('example_values_json = @example_values_json');
    params.example_values_json = toJsonColumn(patch.example_values_json);
  }
  if (patch.data_formats_json !== undefined) {
    set.push('formats_json = @formats_json');
    params.formats_json = toJsonColumn(Array.isArray(patch.data_formats_json) ? patch.data_formats_json : []);
  }
  if (set.length === 0) return;
  set.push('updated_at = @updated_at');
  db.prepare(`UPDATE property_definitions SET ${set.join(', ')} WHERE id = @id`).run(params);
}

/** The other half of the WARNING 2 two-way mirror: called from this module's own
 * `updateDefinition` (never from outside) whenever the definition being edited *was* `general` at
 * the start of the edit -- writes the touched fields straight to the `properties` row via a raw
 * `UPDATE` (not `property.dal.ts#updateProperty`, which would pull in unrelated validation/
 * variant-rename side effects that have nothing to do with editing a definition, and would import-
 * cycle back into this module). Runs inside the caller's own transaction. */
function syncPropertyFromGeneralDefinition(
  projectId: string,
  propertyId: string,
  patch: {
    description?: string | null;
    allowed_values_json?: unknown;
    formats_json?: unknown;
    example_values_json?: unknown;
  }
): void {
  const db = getDb();
  const set: string[] = [];
  const params: Record<string, unknown> = { id: propertyId, project_id: projectId, updated_at: nowIso() };
  if (patch.description !== undefined) {
    set.push('description = @description');
    params.description = patch.description;
  }
  if (patch.allowed_values_json !== undefined) {
    set.push('allowed_values_json = @allowed_values_json');
    params.allowed_values_json = toJsonColumn(patch.allowed_values_json);
  }
  if (patch.example_values_json !== undefined) {
    set.push('example_values_json = @example_values_json');
    params.example_values_json = toJsonColumn(patch.example_values_json);
  }
  if (patch.formats_json !== undefined) {
    set.push('data_formats_json = @data_formats_json');
    params.data_formats_json = toJsonColumn(Array.isArray(patch.formats_json) ? patch.formats_json : []);
  }
  if (set.length === 0) return;
  set.push('updated_at = @updated_at');
  // Fix round 2 INFO 2: the property row changed (from editing `general`, not the property editor
  // itself), so it gets its own `change_log` row like any other property update -- the definition's
  // own `update` row (recorded by the caller, `updateDefinition`) carries `parent_entity_id` =
  // property but that is not a substitute for the property entity's own history trail.
  const before = db.prepare('SELECT * FROM properties WHERE id = @id AND project_id = @project_id').get(params) as
    | Record<string, unknown>
    | undefined;
  db.prepare(`UPDATE properties SET ${set.join(', ')} WHERE id = @id AND project_id = @project_id`).run(params);
  const after = db.prepare('SELECT * FROM properties WHERE id = @id AND project_id = @project_id').get(params) as
    | Record<string, unknown>
    | undefined;
  if (before && after) {
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'property',
      entityId: propertyId,
      entityLabel: String(after.name ?? propertyId),
      action: 'update',
      before: parsePropertyJsonColumns(before),
      after: parsePropertyJsonColumns(after),
    });
  }
}

/** Parses the property columns this module's own mirror ever writes, for a readable `change_log`
 * diff (matching `property.dal.ts`'s own convention of passing parsed values, not raw JSON text,
 * to `recordChange`). Other property columns pass through untouched. */
function parsePropertyJsonColumns(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    allowed_values_json: parseJsonColumn(row.allowed_values_json, []),
    data_formats_json: parseJsonColumn(row.data_formats_json, []),
    example_values_json: parseJsonColumn(row.example_values_json, []),
  };
}

export function createDefinition(
  projectId: string,
  propertyId: string,
  input: PropertyDefinitionInput
): PropertyDefinitionRow {
  assertPropertyExists(projectId, propertyId);
  const name = input.name?.trim();
  if (!name) throw new ValidationError('Definition name is required.', 'name');
  validateFormats(input.formats_json);
  validateAllowedValues(input.allowed_values_json);

  const db = getDb();
  const existing = db
    .prepare(
      'SELECT id FROM property_definitions WHERE project_id = ? AND property_id = ? AND name = ? AND deleted_at IS NULL'
    )
    .get(projectId, propertyId, name);
  if (existing) {
    throw new ConflictError(`A definition named "${name}" already exists on this property.`);
  }

  const id = newId();
  const now = nowIso();
  const maxOrder = (
    db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) as m FROM property_definitions WHERE project_id = ? AND property_id = ? AND deleted_at IS NULL'
      )
      .get(projectId, propertyId) as { m: number }
  ).m;

  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO property_definitions (
          id, project_id, property_id, name, description, allowed_values_json, formats_json,
          example_values_json, sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(
        id,
        projectId,
        propertyId,
        name,
        input.description?.trim() || null,
        toJsonColumn(input.allowed_values_json ?? []),
        toJsonColumn(input.formats_json ?? []),
        toJsonColumn(input.example_values_json ?? []),
        maxOrder + 1,
        now,
        now
      );
    } catch (err) {
      mapWriteError(
        err,
        `A definition named "${name}" already exists on this property.`,
        `Failed to create property definition: ${(err as Error).message}`
      );
    }
    const created = getDefinitionOrThrow(projectId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'property_definition',
      entityId: id,
      entityLabel: `${propertyId}.${created.name}`,
      parentEntityId: propertyId,
      action: 'create',
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
  });
  run();

  return getDefinitionOrThrow(projectId, id);
}

export function updateDefinition(
  projectId: string,
  propertyId: string,
  definitionId: string,
  updates: Partial<PropertyDefinitionInput>
): PropertyDefinitionRow {
  const before = getDefinitionOrThrow(projectId, definitionId);
  if (before.property_id !== propertyId) {
    throw new NotFoundError('Property definition not found.', 'property_definition');
  }
  const db = getDb();

  let name: string | undefined;
  if (updates.name !== undefined) {
    name = updates.name.trim();
    if (!name) throw new ValidationError('Definition name is required.', 'name');
    // Fix round 2 WARNING 1: the two-way mirror (below) keys on the literal name `general` -- a
    // property always has exactly one definition named that, and it is always the mirror target.
    // Renaming it away would silently break the mirror (the DAL would no longer find anything to
    // sync, and a later update-property call would create a *second* `general` definition instead
    // of catching up the renamed one). Refused rather than re-keyed on an id, since nothing else in
    // the schema currently marks "this is the default definition" independent of its name.
    if (before.name === PROPERTY_DEFINITION_DEFAULT_NAME && name !== PROPERTY_DEFINITION_DEFAULT_NAME) {
      throw new BadRequestError(
        `The "${PROPERTY_DEFINITION_DEFAULT_NAME}" definition cannot be renamed; it stays in sync with the property's own fields.`,
        'name'
      );
    }
    const clash = db
      .prepare(
        'SELECT id FROM property_definitions WHERE project_id = ? AND property_id = ? AND name = ? AND id != ? AND deleted_at IS NULL'
      )
      .get(projectId, propertyId, name, definitionId);
    if (clash) throw new ConflictError(`A definition named "${name}" already exists on this property.`);
  }
  if (updates.formats_json !== undefined) validateFormats(updates.formats_json);
  if (updates.allowed_values_json !== undefined) validateAllowedValues(updates.allowed_values_json);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (name !== undefined) patch.name = name;
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.allowed_values_json !== undefined) patch.allowed_values_json = toJsonColumn(updates.allowed_values_json);
  if (updates.formats_json !== undefined) patch.formats_json = toJsonColumn(updates.formats_json);
  if (updates.example_values_json !== undefined) patch.example_values_json = toJsonColumn(updates.example_values_json);

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');

  // WARNING 2 two-way mirror: this definition *was* `general` before this edit -> push the
  // touched fields straight back to the property, inside the same transaction as the definition
  // update itself. A rename away from `general` in the same call still mirrors (the definition
  // was general when the edit started); a definition that was never `general` never mirrors.
  const wasGeneral = before.name === PROPERTY_DEFINITION_DEFAULT_NAME;

  const run = db.transaction(() => {
    try {
      db.prepare(`UPDATE property_definitions SET ${setClause} WHERE id = @id`).run({ ...patch, id: definitionId });
    } catch (err) {
      mapWriteError(
        err,
        `A definition named "${String(patch.name ?? '')}" already exists on this property.`,
        `Failed to update property definition: ${(err as Error).message}`
      );
    }
    if (wasGeneral) {
      syncPropertyFromGeneralDefinition(projectId, propertyId, {
        description: updates.description !== undefined ? updates.description?.trim() || null : undefined,
        allowed_values_json: updates.allowed_values_json,
        example_values_json: updates.example_values_json,
        formats_json: updates.formats_json,
      });
    }
    const after = getDefinitionOrThrow(projectId, definitionId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'property_definition',
      entityId: definitionId,
      entityLabel: `${propertyId}.${after.name}`,
      parentEntityId: propertyId,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();

  return getDefinitionOrThrow(projectId, definitionId);
}

/** Refused (409) for the `general` definition (it stays in sync with the property's own fields
 * for as long as this table exists, same reasoning as refusing to rename it -- see
 * `updateDefinition`), while any event link still uses it, or when it is the property's last
 * remaining definition -- a property always has at least one meaning. */
export function deleteDefinition(projectId: string, propertyId: string, definitionId: string): void {
  const existing = getDefinitionOrThrow(projectId, definitionId);
  if (existing.property_id !== propertyId) {
    throw new NotFoundError('Property definition not found.', 'property_definition');
  }
  if (existing.name === PROPERTY_DEFINITION_DEFAULT_NAME) {
    throw new ConflictError(
      `The "${PROPERTY_DEFINITION_DEFAULT_NAME}" definition cannot be deleted; it stays in sync with the property's own fields.`
    );
  }
  const db = getDb();

  const linkCount = (
    db.prepare('SELECT COUNT(*) as n FROM event_properties WHERE definition_id = ?').get(definitionId) as {
      n: number;
    }
  ).n;
  if (linkCount > 0) {
    throw new ConflictError(
      `This definition is used by ${linkCount} event link(s) and cannot be deleted.`,
      `linked_count=${linkCount}`
    );
  }

  const remainingCount = (
    db
      .prepare(
        'SELECT COUNT(*) as n FROM property_definitions WHERE project_id = ? AND property_id = ? AND deleted_at IS NULL'
      )
      .get(projectId, propertyId) as { n: number }
  ).n;
  if (remainingCount <= 1) {
    throw new ConflictError('A property must keep at least one definition.');
  }

  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare('UPDATE property_definitions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
      now,
      now,
      definitionId
    );
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'property_definition',
      entityId: definitionId,
      entityLabel: `${propertyId}.${existing.name}`,
      parentEntityId: propertyId,
      action: 'delete',
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
}

/** Called by `property.dal.ts#deleteProperty` inside its own transaction (fix round ERROR 2):
 * soft-deletes every one of the property's definitions alongside the property itself, so CSV and
 * backup consumers that already filter `property_definitions` by `deleted_at IS NULL`/property
 * liveness exclude them without a join, and a definition never outlives the property it belongs
 * to. No `change_log` row per definition here -- the property's own `delete` change already tells
 * that story; a lower-level entry per definition would be noise. */
export function softDeleteAllDefinitionsForProperty(projectId: string, propertyId: string): void {
  const now = nowIso();
  getDb()
    .prepare(
      'UPDATE property_definitions SET deleted_at = ?, updated_at = ? WHERE project_id = ? AND property_id = ? AND deleted_at IS NULL'
    )
    .run(now, now, projectId, propertyId);
}

export function reorderDefinitions(projectId: string, propertyId: string, orderedIds: string[]): PropertyDefinitionRow[] {
  assertPropertyExists(projectId, propertyId);
  const db = getDb();
  const current = listDefinitions(projectId, propertyId);
  const currentIds = new Set(current.map((d) => d.id));
  if (orderedIds.length !== current.length || orderedIds.some((id) => !currentIds.has(id))) {
    throw new BadRequestError('order must name exactly this property\'s current definitions.', 'order');
  }
  const now = nowIso();
  const run = db.transaction(() => {
    const update = db.prepare('UPDATE property_definitions SET sort_order = ?, updated_at = ? WHERE id = ?');
    orderedIds.forEach((id, index) => update.run(index, now, id));
  });
  run();
  return listDefinitions(projectId, propertyId);
}

export interface PropertyUsageEvent {
  id: string;
  name: string;
  role: string;
  definition_id: string | null;
}

/** T-4-26: every live event link of every property of the project in ONE query, grouped by
 * property id (Properties list `used_by_events` / `definitions[].using_events`). */
export function listUsageByPropertyId(projectId: string): Map<string, PropertyUsageEvent[]> {
  const rows = getDb()
    .prepare(
      `SELECT ep.property_id AS property_id, e.id AS id, e.name AS name, ep.role AS role, ep.definition_id AS definition_id
       FROM event_properties ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       WHERE e.project_id = ? ORDER BY e.name`
    )
    .all(projectId) as (PropertyUsageEvent & { property_id: string })[];
  const map = new Map<string, PropertyUsageEvent[]>();
  for (const { property_id, ...ev } of rows) {
    const list = map.get(property_id) ?? [];
    list.push(ev);
    map.set(property_id, list);
  }
  return map;
}
