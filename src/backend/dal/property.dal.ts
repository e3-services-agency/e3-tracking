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
import { ConflictError, DatabaseError, NotFoundError } from '../errors';

const UNIQUE_VIOLATION_CODE = '23505';

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

  const row: Record<string, unknown> = {
    workspace_id: workspaceId,
    context: propertyData.context,
    name: propertyData.name.trim(),
    description: propertyData.description?.trim() ?? null,
    category: propertyData.category?.trim() ?? null,
    pii: propertyData.pii,
    data_type: propertyData.data_type,
    data_formats_json: toDbJsonValue(propertyData.data_formats),
    value_schema_json: toDbJsonValue(propertyData.value_schema_json),
    example_values_json: toDbJsonValue(propertyData.example_values_json),
    name_mappings_json: toDbJsonValue(propertyData.name_mappings_json),
    deleted_at: null,
  };
  if (propertyData.mapped_catalog_id !== undefined) {
    row.mapped_catalog_id = propertyData.mapped_catalog_id ?? null;
  }
  if (propertyData.mapped_catalog_field_id !== undefined) {
    row.mapped_catalog_field_id = propertyData.mapped_catalog_field_id ?? null;
  }
  if (propertyData.mapping_type !== undefined) {
    row.mapping_type = (propertyData.mapping_type as PropertyMappingType) ?? null;
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

  return mapPropertyRow(data as PropertyDbRow);
}

/**
 * Update a property (e.g. catalog mapping). Only provided fields are updated.
 */
export async function updateProperty(
  workspaceId: string,
  propertyId: string,
  updates: Partial<Pick<
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
    | 'example_values_json'
    | 'name_mappings_json'
  >>
): Promise<PropertyRow> {
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
