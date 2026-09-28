/**
 * Property definition Data Access Layer (D-58, T-4-00). A property keeps its shared identity
 * (name, data_type, pii, source); `property_definitions` holds one or more *named* meanings per
 * property (name, description, allowed_values_json, format, example_values_json) -- the same
 * attribute can mean different things on different events (`action` on `cart_update` vs
 * `consent`). Every property always has at least one definition; `event_properties.definition_id`
 * points at the one an event link uses (validated to belong to the same property).
 *
 * Every property gets its `general` definition seeded at creation time from the property's own
 * fields (`property.dal.ts#createProperty`); an update to the property's
 * description/allowed_values_json/example_values_json/data_formats_json keeps the `general`
 * definition's matching fields in sync (`syncGeneralDefinitionFromProperty`), so a property with a
 * single definition behaves exactly as it did before this table existed (D-58: "a property with
 * one definition looks as today").
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
  format: string | null;
  example_values_json: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type PropertyDefinitionDbRow = Omit<PropertyDefinitionRow, 'allowed_values_json' | 'example_values_json'>;

function mapRow(row: PropertyDefinitionDbRow): PropertyDefinitionRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    allowed_values_json: parseJsonColumn(raw.allowed_values_json, []),
    example_values_json: parseJsonColumn(raw.example_values_json, []),
  };
}

export interface PropertyDefinitionInput {
  name: string;
  description?: string | null;
  allowed_values_json?: unknown;
  format?: string | null;
  example_values_json?: unknown;
}

function validateFormat(format: string | null | undefined): void {
  if (format === undefined || format === null || format === '') return;
  if (!(PROPERTY_DATA_FORMATS as readonly string[]).includes(format)) {
    throw new BadRequestError(`Unknown format "${format}".`, 'format');
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
  const format = Array.isArray(fields.data_formats_json) ? (fields.data_formats_json[0] ?? null) : null;
  db.prepare(
    `INSERT INTO property_definitions (
      id, project_id, property_id, name, description, allowed_values_json, format,
      example_values_json, sort_order, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`
  ).run(
    id,
    projectId,
    propertyId,
    PROPERTY_DEFINITION_DEFAULT_NAME,
    fields.description,
    toJsonColumn(fields.allowed_values_json ?? []),
    format,
    toJsonColumn(fields.example_values_json ?? []),
    now,
    now
  );
  return getDefinitionOrThrow(projectId, id);
}

/** Called by `property.dal.ts#updateProperty` inside its own transaction whenever the property's
 * description/allowed_values_json/example_values_json/data_formats_json change: keeps the
 * `general` definition's matching fields in sync so a property with a single definition behaves
 * exactly as it did before this table existed. Other (renamed) definitions are untouched. */
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
    set.push('format = @format');
    params.format = Array.isArray(patch.data_formats_json) ? (patch.data_formats_json[0] ?? null) : null;
  }
  if (set.length === 0) return;
  set.push('updated_at = @updated_at');
  db.prepare(`UPDATE property_definitions SET ${set.join(', ')} WHERE id = @id`).run(params);
}

export function createDefinition(
  projectId: string,
  propertyId: string,
  input: PropertyDefinitionInput
): PropertyDefinitionRow {
  assertPropertyExists(projectId, propertyId);
  const name = input.name?.trim();
  if (!name) throw new ValidationError('Definition name is required.', 'name');
  validateFormat(input.format);
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
          id, project_id, property_id, name, description, allowed_values_json, format,
          example_values_json, sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(
        id,
        projectId,
        propertyId,
        name,
        input.description?.trim() || null,
        toJsonColumn(input.allowed_values_json ?? []),
        input.format || null,
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
    const clash = db
      .prepare(
        'SELECT id FROM property_definitions WHERE project_id = ? AND property_id = ? AND name = ? AND id != ? AND deleted_at IS NULL'
      )
      .get(projectId, propertyId, name, definitionId);
    if (clash) throw new ConflictError(`A definition named "${name}" already exists on this property.`);
  }
  if (updates.format !== undefined) validateFormat(updates.format);
  if (updates.allowed_values_json !== undefined) validateAllowedValues(updates.allowed_values_json);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (name !== undefined) patch.name = name;
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.allowed_values_json !== undefined) patch.allowed_values_json = toJsonColumn(updates.allowed_values_json);
  if (updates.format !== undefined) patch.format = updates.format || null;
  if (updates.example_values_json !== undefined) patch.example_values_json = toJsonColumn(updates.example_values_json);

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');

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

/** Refused (409) while any event link still uses it, or when it is the property's last remaining
 * definition -- a property always has at least one meaning. */
export function deleteDefinition(projectId: string, propertyId: string, definitionId: string): void {
  const existing = getDefinitionOrThrow(projectId, definitionId);
  if (existing.property_id !== propertyId) {
    throw new NotFoundError('Property definition not found.', 'property_definition');
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
