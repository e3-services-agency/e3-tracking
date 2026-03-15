/**
 * Properties Data Access Layer.
 * Every function takes workspaceId; all queries enforce workspace_id.
 * Shadow paths: DB errors (e.g. unique violation) are caught and mapped to typed errors.
 */
import { getSupabase } from '../db/supabase';
import type { PropertyRow, CreatePropertyInput, PropertyMappingType } from '../../types/schema';
import { ConflictError, DatabaseError, NotFoundError } from '../errors';

const UNIQUE_VIOLATION_CODE = '23505';

/**
 * Lists all non-deleted properties for the given workspace.
 */
export async function listProperties(workspaceId: string): Promise<PropertyRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name');

  if (error) {
    throw new DatabaseError(`Failed to list properties: ${error.message}`, error);
  }
  return (data ?? []) as PropertyRow[];
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
  const supabase = getSupabase();

  const row: Record<string, unknown> = {
    workspace_id: workspaceId,
    context: propertyData.context,
    name: propertyData.name.trim(),
    description: propertyData.description?.trim() ?? null,
    category: propertyData.category?.trim() ?? null,
    pii_status: propertyData.pii_status ?? 'none',
    data_type: propertyData.data_type,
    data_format: propertyData.data_format?.trim() ?? null,
    is_list: propertyData.is_list ?? false,
    example_values_json: normalizeJsonField(propertyData.example_values_json),
    name_mappings_json: normalizeJsonField(propertyData.name_mappings_json),
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

  return data as PropertyRow;
}

/**
 * Update a property (e.g. catalog mapping). Only provided fields are updated.
 */
export async function updateProperty(
  workspaceId: string,
  propertyId: string,
  updates: Partial<Pick<
    PropertyRow,
    | 'mapped_catalog_id'
    | 'mapped_catalog_field_id'
    | 'mapping_type'
    | 'name'
    | 'description'
    | 'category'
    | 'pii_status'
    | 'data_type'
    | 'data_format'
    | 'is_list'
    | 'example_values_json'
    | 'name_mappings_json'
  >>
): Promise<PropertyRow> {
  const supabase = getSupabase();
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
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() ?? null;
  if (updates.category !== undefined) patch.category = updates.category?.trim() ?? null;
  if (updates.pii_status !== undefined) patch.pii_status = updates.pii_status;
  if (updates.data_type !== undefined) patch.data_type = updates.data_type;
  if (updates.data_format !== undefined) patch.data_format = updates.data_format?.trim() ?? null;
  if (updates.is_list !== undefined) patch.is_list = updates.is_list;
  if (updates.example_values_json !== undefined) {
    patch.example_values_json = normalizeJsonField(updates.example_values_json);
  }
  if (updates.name_mappings_json !== undefined) {
    patch.name_mappings_json = normalizeJsonField(updates.name_mappings_json);
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
  return data as PropertyRow;
}

/**
 * Normalize JSON fields: accept string (JSON string) or array/object; return string or null.
 */
function normalizeJsonField(
  value: string | unknown[] | Record<string, unknown> | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
