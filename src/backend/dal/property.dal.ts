/**
 * Property Data Access Layer (event and customer properties in one table, D-24). Every function
 * takes `projectId`; all queries enforce `project_id`. Columns that have no UI yet in T-1-02
 * (`allowed_values_json`, formats beyond the base list, catalog mapping) round-trip untouched;
 * T-1-04 adds their editors (see PLAN "T-1-04").
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, toSqliteBool, fromSqliteBool, mapWriteError } from '../db/util';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../errors';
import * as BundleDAL from './bundle.dal';
import {
  PROPERTY_SCOPES,
  PROPERTY_DATA_TYPES,
  PROPERTY_DATA_FORMATS,
  ORIGIN_TYPES,
  PRIORITIES,
  ENTITY_STATUSES,
} from '../../domain/enums';
import { STANDARD_CUSTOMER_PROPERTIES, isKnownStandardEvent, type StandardEventSeed } from '../../domain/bloomreach';

export interface AllowedValue {
  value: string;
  label?: string | null;
  description?: string | null;
  standard_event?: string | null;
}

export interface PropertyRow {
  id: string;
  project_id: string;
  scope: 'event' | 'customer';
  name: string;
  description: string | null;
  category: string | null;
  notes: string | null;
  data_type: string;
  data_formats_json: unknown;
  pii: boolean;
  property_type: string;
  allowed_values_json: unknown;
  example_values_json: unknown;
  value_schema_json: unknown;
  object_child_property_refs_json: unknown;
  bloomreach_customer_property: string | null;
  priority: string | null;
  status: string | null;
  mapped_catalog_id: string | null;
  mapped_catalog_field_id: string | null;
  mapping_type: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  bundle_ids?: string[];
}

type PropertyDbRow = Omit<
  PropertyRow,
  | 'data_formats_json'
  | 'allowed_values_json'
  | 'example_values_json'
  | 'value_schema_json'
  | 'object_child_property_refs_json'
  | 'pii'
  | 'bundle_ids'
>;

function mapPropertyRow(row: PropertyDbRow): PropertyRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    pii: fromSqliteBool(raw.pii),
    data_formats_json: parseJsonColumn(raw.data_formats_json, []),
    allowed_values_json: parseJsonColumn(raw.allowed_values_json, []),
    example_values_json: parseJsonColumn(raw.example_values_json, []),
    value_schema_json: parseJsonColumn(raw.value_schema_json, null),
    object_child_property_refs_json: parseJsonColumn(raw.object_child_property_refs_json, null),
  };
}

export interface PropertyInput {
  scope: 'event' | 'customer';
  name: string;
  description?: string | null;
  category?: string | null;
  notes?: string | null;
  data_type: string;
  data_formats_json?: unknown;
  pii?: boolean;
  property_type?: string;
  allowed_values_json?: unknown;
  example_values_json?: unknown;
  value_schema_json?: unknown;
  object_child_property_refs_json?: unknown;
  bloomreach_customer_property?: string | null;
  priority?: string | null;
  status?: string | null;
  mapped_catalog_id?: string | null;
  mapped_catalog_field_id?: string | null;
  mapping_type?: string | null;
  bundle_ids?: string[] | null;
}

export function listProperties(projectId: string, filter?: { scope?: string }): PropertyRow[] {
  const db = getDb();
  const rows = (
    filter?.scope
      ? db
          .prepare(
            'SELECT * FROM properties WHERE project_id = ? AND scope = ? AND deleted_at IS NULL ORDER BY name'
          )
          .all(projectId, filter.scope)
      : db
          .prepare('SELECT * FROM properties WHERE project_id = ? AND deleted_at IS NULL ORDER BY name')
          .all(projectId)
  ) as PropertyDbRow[];
  const properties = rows.map(mapPropertyRow);
  const bundleMap = BundleDAL.listBundleIdsByPropertyIds(
    projectId,
    properties.map((p) => p.id)
  );
  return properties.map((p) => ({ ...p, bundle_ids: bundleMap.get(p.id) ?? [] }));
}

export function getPropertyById(projectId: string, id: string): PropertyRow | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM properties WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(id, projectId) as PropertyDbRow | undefined;
  if (!row) return null;
  const property = mapPropertyRow(row);
  const bundleMap = BundleDAL.listBundleIdsByPropertyIds(projectId, [id]);
  return { ...property, bundle_ids: bundleMap.get(id) ?? [] };
}

export function getPropertyOrThrow(projectId: string, id: string): PropertyRow {
  const row = getPropertyById(projectId, id);
  if (!row) throw new NotFoundError('Property not found.', 'property');
  return row;
}

const DEFAULT_DATA_TYPE = 'string';
const DEFAULT_PROPERTY_TYPE = 'custom';

/**
 * Cross-project reference guard (fix round finding #6): `mapped_catalog_id` and
 * `mapped_catalog_field_id` must name a catalog/field that belongs to the same project.
 */
function validateCatalogRefs(
  projectId: string,
  mappedCatalogId: string | null | undefined,
  mappedCatalogFieldId: string | null | undefined
): void {
  const db = getDb();
  if (mappedCatalogId) {
    const catalog = db
      .prepare('SELECT id FROM catalogs WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
      .get(mappedCatalogId, projectId);
    if (!catalog) {
      throw new BadRequestError('mapped_catalog_id does not belong to this project.', 'mapped_catalog_id');
    }
  }
  if (mappedCatalogFieldId) {
    const field = db
      .prepare(
        `SELECT cf.id FROM catalog_fields cf
         JOIN catalogs c ON c.id = cf.catalog_id
         WHERE cf.id = ? AND c.project_id = ? AND c.deleted_at IS NULL`
      )
      .get(mappedCatalogFieldId, projectId);
    if (!field) {
      throw new BadRequestError(
        'mapped_catalog_field_id does not belong to this project.',
        'mapped_catalog_field_id'
      );
    }
  }
}

/** Project's `standard_event_additions_json` (D-26), used to validate `allowed_values_json[].standard_event`. */
function getProjectStandardEventAdditions(projectId: string): StandardEventSeed[] | null {
  const db = getDb();
  const row = db.prepare('SELECT standard_event_additions_json FROM projects WHERE id = ?').get(projectId) as
    | { standard_event_additions_json: string | null }
    | undefined;
  return parseJsonColumn(row?.standard_event_additions_json, null);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates `Property.allowed_values_json`: `[{value, label?, description?, standard_event?}]` (D-16). */
function validateAllowedValues(projectId: string, allowedValues: unknown): void {
  if (allowedValues === undefined || allowedValues === null) return;
  if (!Array.isArray(allowedValues)) {
    throw new BadRequestError('allowed_values_json must be an array.', 'allowed_values_json');
  }
  const additions = getProjectStandardEventAdditions(projectId);
  const seenValues = new Set<string>();
  for (const row of allowedValues) {
    if (!isPlainObject(row) || typeof row.value !== 'string' || !row.value.trim()) {
      throw new BadRequestError(
        'Each allowed value needs a non-empty "value".',
        'allowed_values_json'
      );
    }
    if (seenValues.has(row.value)) {
      throw new BadRequestError(`Duplicate allowed value "${row.value}".`, 'allowed_values_json');
    }
    seenValues.add(row.value);
    if (
      row.standard_event !== undefined &&
      row.standard_event !== null &&
      row.standard_event !== '' &&
      !isKnownStandardEvent(String(row.standard_event), additions)
    ) {
      throw new BadRequestError(
        `Unknown standard event "${row.standard_event}" on allowed value "${row.value}".`,
        'allowed_values_json'
      );
    }
  }
}

function validateDataFormats(dataFormats: unknown): void {
  if (dataFormats === undefined || dataFormats === null) return;
  if (!Array.isArray(dataFormats)) {
    throw new BadRequestError('data_formats_json must be an array.', 'data_formats_json');
  }
  for (const fmt of dataFormats) {
    if (!(PROPERTY_DATA_FORMATS as readonly string[]).includes(String(fmt))) {
      throw new BadRequestError(`Unknown data format "${fmt}".`, 'data_formats_json');
    }
  }
}

/**
 * Cross-field validation shared by create and update (T-1-04): scope, data_type, property_type,
 * priority, status, data_formats_json and allowed_values_json against `src/domain/enums.ts`, and
 * `bloomreach_customer_property` restricted to scope `customer` and the standard-key seed list.
 */
function validatePropertyFields(
  projectId: string,
  fields: {
    scope?: string;
    data_type?: string;
    property_type?: string;
    priority?: string | null;
    status?: string | null;
    data_formats_json?: unknown;
    allowed_values_json?: unknown;
    bloomreach_customer_property?: string | null;
  },
  resolvedScope: string
): void {
  if (fields.scope !== undefined && !(PROPERTY_SCOPES as readonly string[]).includes(fields.scope)) {
    throw new BadRequestError(`scope must be one of: ${PROPERTY_SCOPES.join(', ')}.`, 'scope');
  }
  if (fields.data_type !== undefined && !(PROPERTY_DATA_TYPES as readonly string[]).includes(fields.data_type)) {
    throw new BadRequestError(`data_type must be one of: ${PROPERTY_DATA_TYPES.join(', ')}.`, 'data_type');
  }
  if (
    fields.property_type !== undefined &&
    !(ORIGIN_TYPES as readonly string[]).includes(fields.property_type)
  ) {
    throw new BadRequestError(`property_type must be one of: ${ORIGIN_TYPES.join(', ')}.`, 'property_type');
  }
  if (fields.priority !== undefined && fields.priority !== null && !(PRIORITIES as readonly string[]).includes(fields.priority)) {
    throw new BadRequestError(`priority must be one of: ${PRIORITIES.join(', ')}.`, 'priority');
  }
  if (
    fields.status !== undefined &&
    fields.status !== null &&
    !(ENTITY_STATUSES as readonly string[]).includes(fields.status)
  ) {
    throw new BadRequestError(`status must be one of: ${ENTITY_STATUSES.join(', ')}.`, 'status');
  }
  validateDataFormats(fields.data_formats_json);
  validateAllowedValues(projectId, fields.allowed_values_json);

  if (fields.bloomreach_customer_property !== undefined && fields.bloomreach_customer_property) {
    if (resolvedScope !== 'customer') {
      throw new BadRequestError(
        'bloomreach_customer_property is only valid for scope "customer".',
        'bloomreach_customer_property'
      );
    }
    if (!STANDARD_CUSTOMER_PROPERTIES.includes(fields.bloomreach_customer_property)) {
      throw new BadRequestError(
        `Unknown standard customer property "${fields.bloomreach_customer_property}".`,
        'bloomreach_customer_property'
      );
    }
  }
}

export function createProperty(projectId: string, input: PropertyInput): PropertyRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Property name is required.', 'name');

  validatePropertyFields(projectId, input, input.scope);
  validateCatalogRefs(projectId, input.mapped_catalog_id, input.mapped_catalog_field_id);

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM properties WHERE project_id = ? AND scope = ? AND name = ? AND deleted_at IS NULL')
    .get(projectId, input.scope, name);
  if (existing) {
    throw new ConflictError(
      `A ${input.scope} property named "${name}" already exists in this project.`
    );
  }

  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO properties (
        id, project_id, scope, name, description, category, notes, data_type, data_formats_json,
        pii, property_type, allowed_values_json, example_values_json, value_schema_json,
        object_child_property_refs_json, bloomreach_customer_property, priority, status,
        mapped_catalog_id, mapped_catalog_field_id, mapping_type, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @scope, @name, @description, @category, @notes, @data_type, @data_formats_json,
        @pii, @property_type, @allowed_values_json, @example_values_json, @value_schema_json,
        @object_child_property_refs_json, @bloomreach_customer_property, @priority, @status,
        @mapped_catalog_id, @mapped_catalog_field_id, @mapping_type, @created_at, @updated_at, NULL
      )`
    ).run({
      id,
      project_id: projectId,
      scope: input.scope,
      name,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
      data_type: input.data_type || DEFAULT_DATA_TYPE,
      data_formats_json: toJsonColumn(input.data_formats_json ?? []),
      pii: toSqliteBool(input.pii),
      property_type: input.property_type || DEFAULT_PROPERTY_TYPE,
      allowed_values_json: toJsonColumn(input.allowed_values_json ?? []),
      example_values_json: toJsonColumn(input.example_values_json ?? []),
      value_schema_json: toJsonColumn(input.value_schema_json ?? null),
      object_child_property_refs_json: toJsonColumn(input.object_child_property_refs_json ?? null),
      bloomreach_customer_property: input.bloomreach_customer_property?.trim() || null,
      priority: input.priority ?? null,
      status: input.status ?? null,
      mapped_catalog_id: input.mapped_catalog_id ?? null,
      mapped_catalog_field_id: input.mapped_catalog_field_id ?? null,
      mapping_type: input.mapping_type ?? null,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(
      err,
      `A ${input.scope} property named "${name}" already exists in this project.`,
      `Failed to create property: ${(err as Error).message}`
    );
  }

  if (input.bundle_ids !== undefined && input.bundle_ids !== null) {
    BundleDAL.replacePropertyBundlesForProperty(projectId, id, input.bundle_ids);
  }

  return getPropertyOrThrow(projectId, id);
}

export function updateProperty(
  projectId: string,
  id: string,
  updates: Partial<PropertyInput>
): PropertyRow {
  getPropertyOrThrow(projectId, id);
  const db = getDb();

  if (updates.name !== undefined || updates.scope !== undefined) {
    const current = getPropertyOrThrow(projectId, id);
    const name = (updates.name ?? current.name).trim();
    const scope = updates.scope ?? current.scope;
    if (!name) throw new ValidationError('Property name is required.', 'name');
    const clash = db
      .prepare(
        'SELECT id FROM properties WHERE project_id = ? AND scope = ? AND name = ? AND id != ? AND deleted_at IS NULL'
      )
      .get(projectId, scope, name, id);
    if (clash) {
      throw new ConflictError(`A ${scope} property named "${name}" already exists in this project.`);
    }
  }

  if (updates.mapped_catalog_id !== undefined || updates.mapped_catalog_field_id !== undefined) {
    validateCatalogRefs(projectId, updates.mapped_catalog_id, updates.mapped_catalog_field_id);
  }

  const current = getPropertyOrThrow(projectId, id);
  const resolvedScope = updates.scope ?? current.scope;
  validatePropertyFields(projectId, updates, resolvedScope);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.scope !== undefined) patch.scope = updates.scope;
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.category !== undefined) patch.category = updates.category?.trim() || null;
  if (updates.notes !== undefined) patch.notes = updates.notes?.trim() || null;
  if (updates.data_type !== undefined) patch.data_type = updates.data_type;
  if (updates.data_formats_json !== undefined) patch.data_formats_json = toJsonColumn(updates.data_formats_json);
  if (updates.pii !== undefined) patch.pii = toSqliteBool(updates.pii);
  if (updates.property_type !== undefined) patch.property_type = updates.property_type;
  if (updates.allowed_values_json !== undefined) {
    patch.allowed_values_json = toJsonColumn(updates.allowed_values_json);
  }
  if (updates.example_values_json !== undefined) {
    patch.example_values_json = toJsonColumn(updates.example_values_json);
  }
  if (updates.value_schema_json !== undefined) patch.value_schema_json = toJsonColumn(updates.value_schema_json);
  if (updates.object_child_property_refs_json !== undefined) {
    patch.object_child_property_refs_json = toJsonColumn(updates.object_child_property_refs_json);
  }
  if (updates.bloomreach_customer_property !== undefined) {
    patch.bloomreach_customer_property = updates.bloomreach_customer_property?.trim() || null;
  }
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.mapped_catalog_id !== undefined) patch.mapped_catalog_id = updates.mapped_catalog_id;
  if (updates.mapped_catalog_field_id !== undefined) {
    patch.mapped_catalog_field_id = updates.mapped_catalog_field_id;
  }
  if (updates.mapping_type !== undefined) patch.mapping_type = updates.mapping_type;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    db.prepare(`UPDATE properties SET ${setClause} WHERE id = @id AND project_id = @project_id`).run({
      ...patch,
      id,
      project_id: projectId,
    });
  } catch (err) {
    mapWriteError(
      err,
      `A property named "${String(patch.name ?? '')}" already exists in this project.`,
      `Failed to update property: ${(err as Error).message}`
    );
  }

  if (updates.bundle_ids !== undefined) {
    BundleDAL.replacePropertyBundlesForProperty(projectId, id, updates.bundle_ids ?? []);
  }

  return getPropertyOrThrow(projectId, id);
}

/** Soft-deletes a property; refuses when it is still attached to any event (T-1-02 guard). */
export function deleteProperty(projectId: string, id: string): void {
  getPropertyOrThrow(projectId, id);
  const db = getDb();

  const attachedCount = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM event_properties ep
         JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
         WHERE ep.property_id = ? AND e.project_id = ?`
      )
      .get(id, projectId) as { n: number }
  ).n;

  if (attachedCount > 0) {
    throw new ConflictError(
      `Property cannot be deleted because it is attached to ${attachedCount} event(s).`,
      `attached_event_count=${attachedCount}`
    );
  }

  const now = nowIso();
  db.prepare('UPDATE properties SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?').run(
    now,
    now,
    id,
    projectId
  );
}
