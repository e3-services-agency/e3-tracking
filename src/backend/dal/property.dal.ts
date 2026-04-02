/**
 * Properties Data Access Layer.
 * Every function takes workspaceId; all queries enforce workspace_id.
 * Shadow paths: DB errors (e.g. unique violation) are caught and mapped to typed errors.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import type {
  CreatePropertyInput,
  PropertyDataFormat,
  PropertyDataType,
  EventPropertyPresence,
  PropertyExampleValue,
  PropertyMappingType,
  PropertyNameMapping,
  PropertyRow,
  PropertyValueSchema,
  PropertyValueSchemaNode,
} from '../../types/schema';
import {
  PROPERTY_DATA_FORMATS,
  PROPERTY_DATA_TYPES,
} from '../../types/schema';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from '../errors';
import * as BundleDAL from './bundle.dal';

const UNIQUE_VIOLATION_CODE = '23505';

/** Property row updates; `source_ids` replaces property_sources when provided (not a DB column on properties). */
export type PropertyUpdateInput = Partial<
  Pick<
    PropertyRow,
    | 'context'
    | 'mapped_catalog_id'
    | 'mapped_catalog_field_id'
    | 'mapping_type'
    | 'name'
    | 'description'
    | 'category'
    | 'pii'
    | 'data_type'
    | 'data_formats'
    | 'value_schema_json'
    | 'object_child_property_refs_json'
    | 'example_values_json'
    | 'name_mappings_json'
  >
> & {
  source_ids?: string[] | null;
  /** Replaces `property_bundle_items` rows for this property (not a column on `properties`). */
  bundle_ids?: string[] | null;
};

/** Validates that every id is a non-deleted source in the workspace; returns deduplicated ids in stable order. */
async function validateSourceIdsInWorkspace(
  workspaceId: string,
  sourceIds: string[]
): Promise<string[]> {
  const uniqueSourceIds = [...new Set(sourceIds.map((value) => value.trim()).filter(Boolean))];
  if (uniqueSourceIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('sources')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('id', uniqueSourceIds)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to validate sources: ${error.message}`, error);
  }

  const foundIds = new Set((data ?? []).map((row: { id: string }) => row.id));
  if (foundIds.size !== uniqueSourceIds.length) {
    throw new NotFoundError('One or more sources were not found in this workspace.', 'source');
  }

  return uniqueSourceIds;
}

/**
 * Lists source ids linked to a property (workspace-scoped).
 */
export async function listPropertySourceIds(
  workspaceId: string,
  propertyId: string
): Promise<string[]> {
  const supabase = getSupabaseOrThrow();
  const { data: existing, error: fetchErr } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr) {
    throw new DatabaseError(`Failed to fetch property: ${fetchErr.message}`, fetchErr);
  }
  if (!existing) {
    throw new NotFoundError('Property not found.', 'property');
  }

  const { data, error } = await supabase
    .from('property_sources')
    .select('source_id')
    .eq('property_id', propertyId);

  if (error) {
    throw new DatabaseError(`Failed to list property sources: ${error.message}`, error);
  }

  const ids = (data ?? []).map((row: { source_id: string }) => row.source_id);
  return [...new Set(ids)];
}

/**
 * Syncs property_sources to match `sourceIds` (deduped, workspace-validated).
 * Uses insert-then-delete so a failed insert does not wipe existing links. Deletes run after adds; if delete fails,
 * extra legacy links may remain until the next successful save (no cross-workspace IDs: PK + prior validation).
 */
export async function replacePropertySources(
  workspaceId: string,
  propertyId: string,
  sourceIds: string[]
): Promise<void> {
  const validSourceIds = await validateSourceIdsInWorkspace(workspaceId, sourceIds);
  const supabase = getSupabaseOrThrow();

  const { data: existing, error: fetchErr } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr) {
    throw new DatabaseError(`Failed to fetch property: ${fetchErr.message}`, fetchErr);
  }
  if (!existing) {
    throw new NotFoundError('Property not found.', 'property');
  }

  const { data: linkRows, error: listErr } = await supabase
    .from('property_sources')
    .select('source_id')
    .eq('property_id', propertyId);

  if (listErr) {
    throw new DatabaseError(`Failed to read property sources: ${listErr.message}`, listErr);
  }

  const current = [...new Set((linkRows ?? []).map((row: { source_id: string }) => row.source_id))];
  const desiredSet = new Set(validSourceIds);
  const currentSet = new Set(current);

  const toAdd = validSourceIds.filter((id) => !currentSet.has(id));
  const toRemove = current.filter((id) => !desiredSet.has(id));

  if (toAdd.length > 0) {
    const { error: insertError } = await supabase.from('property_sources').insert(
      toAdd.map((sourceId) => ({
        property_id: propertyId,
        source_id: sourceId,
      }))
    );

    if (insertError) {
      throw new DatabaseError(`Failed to save property sources: ${insertError.message}`, insertError);
    }
  }

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from('property_sources')
      .delete()
      .eq('property_id', propertyId)
      .in('source_id', toRemove);

    if (deleteError) {
      throw new DatabaseError(`Failed to update property sources: ${deleteError.message}`, deleteError);
    }
  }
}

type PropertyDbRow = {
  id: string;
  workspace_id: string;
  context: PropertyRow['context'];
  name: string;
  description: string | null;
  category: string | null;
  pii: boolean;
  data_type: PropertyDataType;
  data_formats_json?: unknown | null;
  value_schema_json?: unknown | null;
  object_child_property_refs_json?: unknown | null;
  example_values_json?: unknown | null;
  name_mappings_json?: unknown | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  mapped_catalog_id: string | null;
  mapped_catalog_field_id: string | null;
  mapping_type: PropertyMappingType | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueFormats(formats: PropertyDataFormat[]): PropertyDataFormat[] | null {
  const unique = Array.from(new Set(formats));
  return unique.length > 0 ? unique : null;
}

function normalizeDataFormats(value: unknown): PropertyDataFormat[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const formats = value.filter(
    (item): item is PropertyDataFormat =>
      typeof item === 'string' &&
      PROPERTY_DATA_FORMATS.includes(item as PropertyDataFormat)
  );

  return uniqueFormats(formats);
}

function normalizePropertyValueSchemaNode(value: unknown): PropertyValueSchemaNode | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = value.type;
  if (typeof type !== 'string' || !PROPERTY_DATA_TYPES.includes(type as PropertyDataType)) {
    return null;
  }

  const normalized: PropertyValueSchemaNode = {
    type: type as PropertyDataType,
  };

  const dataFormats = normalizeDataFormats(value.data_formats);
  if (dataFormats) {
    normalized.data_formats = dataFormats;
  }
  if (typeof value.required === 'boolean') {
    normalized.required = value.required;
  }
  if (
    value.presence === 'always_sent' ||
    value.presence === 'sometimes_sent' ||
    value.presence === 'never_sent'
  ) {
    normalized.presence = value.presence as EventPropertyPresence;
  }
  if (typeof value.allow_additional_properties === 'boolean') {
    normalized.allow_additional_properties = value.allow_additional_properties;
  }

  if (normalized.type === 'object' && isRecord(value.properties)) {
    const properties = Object.entries(value.properties).reduce<Record<string, PropertyValueSchemaNode>>(
      (acc, [key, child]) => {
        const normalizedChild = normalizePropertyValueSchemaNode(child);
        if (normalizedChild) {
          acc[key] = normalizedChild;
        }
        return acc;
      },
      {}
    );

    if (Object.keys(properties).length > 0) {
      normalized.properties = properties;
    }
  }

  if (normalized.type === 'array') {
    const items = normalizePropertyValueSchemaNode(value.items);
    if (items) {
      normalized.items = items;
    }
  }

  return normalized;
}

function normalizePropertyValueSchema(value: unknown): PropertyValueSchema | null {
  if (!isRecord(value)) {
    return null;
  }

  const topLevelType = value.type;
  if (topLevelType !== 'object' && topLevelType !== 'array') {
    return null;
  }

  const normalized: PropertyValueSchema = {
    type: topLevelType,
  };

  if (typeof value.allow_additional_properties === 'boolean') {
    normalized.allow_additional_properties = value.allow_additional_properties;
  }

  if (topLevelType === 'object' && isRecord(value.properties)) {
    const properties = Object.entries(value.properties).reduce<Record<string, PropertyValueSchemaNode>>(
      (acc, [key, child]) => {
        const normalizedChild = normalizePropertyValueSchemaNode(child);
        if (normalizedChild) {
          acc[key] = normalizedChild;
        }
        return acc;
      },
      {}
    );

    if (Object.keys(properties).length > 0) {
      normalized.properties = properties;
    }
  }

  if (topLevelType === 'array') {
    const items = normalizePropertyValueSchemaNode(value.items);
    if (items) {
      normalized.items = items;
    }
  }

  return normalized;
}

function normalizeExampleValues(value: unknown): PropertyExampleValue[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value.flatMap((entry): PropertyExampleValue[] => {
    if (!isRecord(entry) || !Object.prototype.hasOwnProperty.call(entry, 'value')) {
      return [];
    }

    const result: PropertyExampleValue = {
      value: entry.value,
    };

    if (typeof entry.label === 'string' && entry.label.trim()) {
      result.label = entry.label.trim();
    }
    if (typeof entry.notes === 'string' && entry.notes.trim()) {
      result.notes = entry.notes.trim();
    }

    return [result];
  });

  return normalized.length > 0 ? normalized : null;
}

function normalizeNameMappings(value: unknown): PropertyNameMapping[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value.flatMap((entry): PropertyNameMapping[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const system = typeof entry.system === 'string' ? entry.system.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const role = entry.role;

    if (
      !system ||
      !name ||
      (role !== 'payload_key' &&
        role !== 'source_field' &&
        role !== 'lookup_key' &&
        role !== 'mapped_value' &&
        role !== 'alias')
    ) {
      return [];
    }

    const result: PropertyNameMapping = {
      system,
      name,
      role,
    };

    if (typeof entry.notes === 'string' && entry.notes.trim()) {
      result.notes = entry.notes.trim();
    }

    return [result];
  });

  return normalized.length > 0 ? normalized : null;
}

function toDbJsonValue(value: unknown): unknown | null {
  if (value === undefined || value === null) {
    return null;
  }

  return value;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Normalizes object field key → property id map. Invalid entries are dropped.
 * Exported for API routes and event DAL.
 */
export function normalizeObjectChildPropertyRefs(raw: unknown): Record<string, string> | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (!isRecord(raw)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim();
    if (!key) {
      continue;
    }
    if (typeof v !== 'string') {
      continue;
    }
    const id = v.trim();
    if (!UUID_RE.test(id)) {
      continue;
    }
    out[key] = id;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function assertObjectChildRefsValid(
  workspaceId: string,
  refs: Record<string, string> | null,
  selfPropertyId: string | undefined,
  valueSchema: PropertyValueSchema | null,
  dataType: PropertyDataType
): Promise<void> {
  if (dataType !== 'object' && dataType !== 'array') {
    if (refs && Object.keys(refs).length > 0) {
      throw new BadRequestError(
        'object_child_property_refs_json is only for object- or array-type properties.',
        'object_child_property_refs_json'
      );
    }
    return;
  }
  if (!refs || Object.keys(refs).length === 0) {
    return;
  }

  for (const id of Object.values(refs)) {
    if (selfPropertyId && id === selfPropertyId) {
      throw new BadRequestError(
        'object_child_property_refs_json cannot reference the same property.',
        'object_child_property_refs_json'
      );
    }
  }

  if (dataType === 'object') {
    if (valueSchema?.type === 'object' && valueSchema.properties) {
      for (const key of Object.keys(refs)) {
        if (!valueSchema.properties[key]) {
          throw new BadRequestError(
            `object_child_property_refs_json key "${key}" has no matching value_schema_json.properties entry.`,
            'object_child_property_refs_json'
          );
        }
      }
    }
  } else {
    // array: exactly one element link, stored under "$items"
    const keys = Object.keys(refs);
    if (keys.length !== 1 || keys[0] !== '$items') {
      throw new BadRequestError(
        'object_child_property_refs_json for array properties must contain exactly one key: "$items".',
        'object_child_property_refs_json'
      );
    }
    if (!valueSchema || valueSchema.type !== 'array' || !valueSchema.items) {
      throw new BadRequestError(
        'Array element linking requires value_schema_json.type="array" with an items schema.',
        'object_child_property_refs_json'
      );
    }
  }

  const ids = [...new Set(Object.values(refs))];
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('properties')
    .select('id, data_type, name')
    .eq('workspace_id', workspaceId)
    .in('id', ids)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to validate child property refs: ${error.message}`, error);
  }
  const rows = (data ?? []) as { id: string; data_type: string; name: string }[];
  const found = new Set(rows.map((r) => r.id));
  if (found.size !== ids.length) {
    throw new BadRequestError(
      'One or more object_child_property_refs_json ids do not exist in this workspace.',
      'object_child_property_refs_json'
    );
  }

  const childById = new Map(
    rows.map((r) => {
      const dt = PROPERTY_DATA_TYPES.includes(r.data_type as PropertyDataType)
        ? (r.data_type as PropertyDataType)
        : ('string' as PropertyDataType);
      return [r.id, { data_type: dt, name: r.name || r.id }] as const;
    })
  );

  if (dataType === 'object') {
    if (valueSchema?.type === 'object' && valueSchema.properties) {
      for (const [fieldKey, childId] of Object.entries(refs)) {
        const node = valueSchema.properties[fieldKey];
        const schemaFieldType = node?.type;
        if (
          typeof schemaFieldType !== 'string' ||
          !PROPERTY_DATA_TYPES.includes(schemaFieldType as PropertyDataType)
        ) {
          continue;
        }
        const child = childById.get(childId);
        if (!child) {
          continue;
        }
        if (child.data_type === 'object' || child.data_type === 'array') {
          throw new BadRequestError(
            `object_child_property_refs_json field "${fieldKey}": linked property "${child.name}" has unsupported data_type "${child.data_type}" (object/array cannot be nested field refs).`,
            'object_child_property_refs_json'
          );
        }
        if (child.data_type !== schemaFieldType) {
          throw new BadRequestError(
            `object_child_property_refs_json field "${fieldKey}": value_schema_json has type "${schemaFieldType}" but linked property "${child.name}" has data_type "${child.data_type}".`,
            'object_child_property_refs_json'
          );
        }
      }
    }
  } else {
    const childId = refs['$items'];
    const child = childById.get(childId);
    const schemaFieldType = valueSchema?.type === 'array' ? valueSchema.items?.type : undefined;
    if (!child || typeof schemaFieldType !== 'string') {
      return;
    }
    if (child.data_type === 'object' || child.data_type === 'array') {
      throw new BadRequestError(
        `object_child_property_refs_json "$items": linked property "${child.name}" has unsupported data_type "${child.data_type}" (array elements must be primitive).`,
        'object_child_property_refs_json'
      );
    }
    if (child.data_type !== schemaFieldType) {
      throw new BadRequestError(
        `object_child_property_refs_json "$items": value_schema_json.items has type "${schemaFieldType}" but linked property "${child.name}" has data_type "${child.data_type}".`,
        'object_child_property_refs_json'
      );
    }
  }
}

function mapPropertyRow(row: PropertyDbRow): PropertyRow {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    context: row.context,
    name: row.name,
    description: row.description ?? null,
    category: row.category ?? null,
    pii: row.pii,
    data_type: PROPERTY_DATA_TYPES.includes(row.data_type) ? row.data_type : 'string',
    data_formats: normalizeDataFormats(row.data_formats_json),
    value_schema_json: normalizePropertyValueSchema(row.value_schema_json),
    object_child_property_refs_json: normalizeObjectChildPropertyRefs(
      row.object_child_property_refs_json
    ),
    example_values_json: normalizeExampleValues(row.example_values_json),
    name_mappings_json: normalizeNameMappings(row.name_mappings_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    mapped_catalog_id: row.mapped_catalog_id ?? null,
    mapped_catalog_field_id: row.mapped_catalog_field_id ?? null,
    mapping_type: row.mapping_type ?? null,
  };
}

/** Maps a Supabase `properties` row to {@link PropertyRow} (for event DAL closure loads). */
export function mapPropertyDbRowToRow(row: unknown): PropertyRow | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  return mapPropertyRow(row as PropertyDbRow);
}

/**
 * Lists all non-deleted properties for the given workspace.
 */
export async function listProperties(workspaceId: string): Promise<PropertyRow[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name');

  if (error) {
    throw new DatabaseError(`Failed to list properties: ${error.message}`, error);
  }
  return ((data ?? []) as PropertyDbRow[]).map(mapPropertyRow);
}

/**
 * Full property row for workspace-scoped reads (e.g. effective event–property resolution).
 * Prefer over event.dal’s minimal getPropertyById when you need PropertyRow fields.
 */
export async function getPropertyRow(
  workspaceId: string,
  propertyId: string
): Promise<PropertyRow | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to fetch property: ${error.message}`, error);
  }
  if (!data) {
    return null;
  }
  return mapPropertyRow(data as PropertyDbRow);
}

/**
 * Inserts a new property for the given workspace.
 * Enforces workspace_id in the insert; never relies on RLS.
 *
 * @throws ConflictError when UNIQUE(workspace_id, context, name) is violated (409).
 * @throws DatabaseError for other DB failures.
 */
export async function createProperty(
  workspaceId: string,
  propertyData: CreatePropertyInput
): Promise<PropertyRow> {
  const supabase = getSupabaseOrThrow();
  const { source_ids: sourceIds, bundle_ids: bundleIds, ...propertyRowInput } = propertyData;

  if (sourceIds !== undefined && sourceIds !== null && sourceIds.length > 0) {
    await validateSourceIdsInWorkspace(workspaceId, sourceIds);
  }

  const normalizedChildRefs = normalizeObjectChildPropertyRefs(
    propertyRowInput.object_child_property_refs_json
  );
  await assertObjectChildRefsValid(
    workspaceId,
    normalizedChildRefs,
    undefined,
    propertyRowInput.value_schema_json ?? null,
    propertyRowInput.data_type
  );

  const row: Record<string, unknown> = {
    workspace_id: workspaceId,
    context: propertyRowInput.context,
    name: propertyRowInput.name.trim(),
    description: propertyRowInput.description?.trim() ?? null,
    category: propertyRowInput.category?.trim() ?? null,
    pii: propertyRowInput.pii,
    data_type: propertyRowInput.data_type,
    data_formats_json: toDbJsonValue(propertyRowInput.data_formats),
    value_schema_json: toDbJsonValue(propertyRowInput.value_schema_json),
    object_child_property_refs_json: toDbJsonValue(normalizedChildRefs),
    example_values_json: toDbJsonValue(propertyRowInput.example_values_json),
    name_mappings_json: toDbJsonValue(propertyRowInput.name_mappings_json),
    deleted_at: null,
  };
  if (propertyRowInput.mapped_catalog_id !== undefined) {
    row.mapped_catalog_id = propertyRowInput.mapped_catalog_id ?? null;
  }
  if (propertyRowInput.mapped_catalog_field_id !== undefined) {
    row.mapped_catalog_field_id = propertyRowInput.mapped_catalog_field_id ?? null;
  }
  if (propertyRowInput.mapping_type !== undefined) {
    row.mapping_type = (propertyRowInput.mapping_type as PropertyMappingType) ?? null;
  }

  const { data, error } = await supabase
    .from('properties')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new ConflictError(
        `A property with the same name and context already exists in this workspace.`,
        `name="${row.name}", context="${row.context}"`
      );
    }
    throw new DatabaseError(
      `Failed to create property: ${error.message}`,
      error
    );
  }

  if (data === null) {
    throw new DatabaseError('Create property returned no row.');
  }

  const created = mapPropertyRow(data as PropertyDbRow);

  if (sourceIds !== undefined && sourceIds !== null && sourceIds.length > 0) {
    try {
      await replacePropertySources(workspaceId, created.id, sourceIds);
    } catch (linkErr) {
      try {
        await deleteProperty(workspaceId, created.id);
      } catch (cleanupErr) {
        console.error(
          '[property.dal] Failed to soft-delete property after property_sources failure; orphan property may exist.',
          { propertyId: created.id, workspaceId, cleanupErr }
        );
      }
      throw linkErr;
    }
  }

  return created;
}

/**
 * Update a property (e.g. catalog mapping). Only provided fields are updated.
 */
export async function updateProperty(
  workspaceId: string,
  propertyId: string,
  updates: PropertyUpdateInput
): Promise<PropertyRow> {
  const supabase = getSupabaseOrThrow();
  const sourceIdsUpdate =
    Object.prototype.hasOwnProperty.call(updates, 'source_ids') ? updates.source_ids : undefined;
  const bundleIdsUpdate = Object.prototype.hasOwnProperty.call(updates, 'bundle_ids')
    ? updates.bundle_ids
    : undefined;
  const { data: existingRow, error: fetchErr } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr) {
    throw new DatabaseError(`Failed to fetch property: ${fetchErr.message}`, fetchErr);
  }
  if (!existingRow) {
    throw new NotFoundError('Property not found.', 'property');
  }

  const existing = mapPropertyRow(existingRow as PropertyDbRow);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.context !== undefined) patch.context = updates.context;
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() ?? null;
  if (updates.category !== undefined) patch.category = updates.category?.trim() ?? null;
  if (updates.pii !== undefined) {
    patch.pii = updates.pii;
  }
  if (updates.data_type !== undefined) {
    patch.data_type = updates.data_type;
  }
  if (updates.data_formats !== undefined) {
    patch.data_formats_json = toDbJsonValue(updates.data_formats);
  }
  if (updates.value_schema_json !== undefined) {
    patch.value_schema_json = toDbJsonValue(updates.value_schema_json);
  }
  if (updates.example_values_json !== undefined) {
    patch.example_values_json = toDbJsonValue(updates.example_values_json);
  }
  if (updates.name_mappings_json !== undefined) {
    patch.name_mappings_json = toDbJsonValue(updates.name_mappings_json);
  }
  if (updates.mapped_catalog_id !== undefined) patch.mapped_catalog_id = updates.mapped_catalog_id ?? null;
  if (updates.mapped_catalog_field_id !== undefined) {
    patch.mapped_catalog_field_id = updates.mapped_catalog_field_id ?? null;
  }
  if (updates.mapping_type !== undefined) {
    patch.mapping_type = updates.mapping_type ?? null;
  }

  const mergedDataType = (updates.data_type !== undefined
    ? updates.data_type
    : existing.data_type) as PropertyDataType;
  const mergedSchema =
    updates.value_schema_json !== undefined
      ? updates.value_schema_json
      : existing.value_schema_json;
  let mergedRefs = existing.object_child_property_refs_json;
  if (updates.object_child_property_refs_json !== undefined) {
    mergedRefs = normalizeObjectChildPropertyRefs(updates.object_child_property_refs_json);
  }
  if (
    (mergedDataType !== 'object' && mergedDataType !== 'array') ||
    mergedSchema === null
  ) {
    mergedRefs = null;
  }
  await assertObjectChildRefsValid(
    workspaceId,
    mergedRefs,
    propertyId,
    mergedSchema,
    mergedDataType
  );

  const refsAffected =
    updates.object_child_property_refs_json !== undefined ||
    updates.data_type !== undefined ||
    updates.value_schema_json !== undefined;
  if (refsAffected) {
    patch.object_child_property_refs_json = toDbJsonValue(mergedRefs);
  }

  const { data, error } = await supabase
    .from('properties')
    .update(patch)
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to update property: ${error.message}`, error);
  }
  if (!data) {
    throw new NotFoundError('Property not found after update.', 'property');
  }

  if (sourceIdsUpdate !== undefined) {
    try {
      await replacePropertySources(workspaceId, propertyId, sourceIdsUpdate ?? []);
    } catch (linkErr) {
      console.error(
        '[property.dal] Property row updated but property_sources sync failed; client may retry PATCH with source_ids.',
        { propertyId, workspaceId, linkErr }
      );
      throw linkErr;
    }
  }

  if (bundleIdsUpdate !== undefined) {
    try {
      await BundleDAL.replacePropertyBundlesForProperty(
        workspaceId,
        propertyId,
        bundleIdsUpdate ?? []
      );
    } catch (linkErr) {
      console.error(
        '[property.dal] Property row updated but property bundle sync failed; client may retry PATCH with bundle_ids.',
        { propertyId, workspaceId, linkErr }
      );
      throw linkErr;
    }
  }

  return mapPropertyRow(data as PropertyDbRow);
}

/**
 * Soft-deletes a property in the workspace.
 *
 * @throws NotFoundError when the property is not in the workspace.
 * @throws DatabaseError for DB failures.
 */
export async function deleteProperty(
  workspaceId: string,
  propertyId: string
): Promise<void> {
  const supabase = getSupabaseOrThrow();
  const { data: existing, error: fetchErr } = await supabase
    .from('properties')
    .select('id, name')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr) {
    throw new DatabaseError(`Failed to fetch property: ${fetchErr.message}`, fetchErr);
  }
  if (!existing) {
    throw new NotFoundError('Property not found.', 'property');
  }

  // Guard: block delete when property is still referenced (contract integrity).
  // 1) Event attachments (event_properties)
  const { data: links, error: linkErr } = await supabase
    .from('event_properties')
    .select('event_id')
    .eq('property_id', propertyId);
  if (linkErr) {
    throw new DatabaseError(`Failed to check event property links: ${linkErr.message}`, linkErr);
  }
  const linkedEventIds = [...new Set((links ?? []).map((r: { event_id: string }) => r.event_id))];
  let activeEventCount = 0;
  if (linkedEventIds.length > 0) {
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id')
      .eq('workspace_id', workspaceId)
      .in('id', linkedEventIds)
      .is('deleted_at', null);
    if (evErr) {
      throw new DatabaseError(`Failed to check linked events: ${evErr.message}`, evErr);
    }
    activeEventCount = (events ?? []).length;
  }

  // 2) Nested child refs (properties.object_child_property_refs_json values contain property ids)
  const { data: parents, error: parentErr } = await supabase
    .from('properties')
    .select('id, name, object_child_property_refs_json')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .not('object_child_property_refs_json', 'is', null);
  if (parentErr) {
    throw new DatabaseError(
      `Failed to check nested property refs: ${parentErr.message}`,
      parentErr
    );
  }
  const parentRows = (parents ?? []) as Array<{
    id: string;
    name: string;
    object_child_property_refs_json: unknown;
  }>;
  const nestedParents = parentRows.filter((p) => {
    const refs = normalizeObjectChildPropertyRefs(p.object_child_property_refs_json);
    if (!refs) return false;
    return Object.values(refs).includes(propertyId);
  });

  const nestedParentCount = nestedParents.length;
  if (activeEventCount > 0 || nestedParentCount > 0) {
    const propName = (existing as any).name ? String((existing as any).name) : propertyId;
    const details = JSON.stringify(
      {
        property_id: propertyId,
        property_name: propName,
        used_in_events: activeEventCount,
        used_in_nested_object_properties: nestedParentCount,
        nested_parent_properties: nestedParents.slice(0, 10).map((p) => ({ id: p.id, name: p.name })),
      },
      null,
      2
    );
    throw new ConflictError(
      `Property cannot be deleted because it is used in ${activeEventCount} event(s) and ${nestedParentCount} nested object propert${nestedParentCount === 1 ? 'y' : 'ies'}.`,
      details
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('properties')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to delete property: ${error.message}`, error);
  }
}
