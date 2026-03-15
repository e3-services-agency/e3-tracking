/**
 * Catalogs & Catalog Fields Data Access Layer.
 * All queries filter by workspace_id (catalogs) or via catalog's workspace_id (fields).
 */
import { getSupabase } from '../db/supabase';
import type { CatalogRow, CatalogFieldRow, CatalogType } from '../../types/schema';

const VALID_CATALOG_TYPES: CatalogType[] = ['Product', 'Variant', 'General'];
function normalizeCatalogType(v: string | undefined): CatalogType {
  return VALID_CATALOG_TYPES.includes(v as CatalogType) ? (v as CatalogType) : 'General';
}
import { DatabaseError, NotFoundError } from '../errors';

export async function listCatalogs(workspaceId: string): Promise<CatalogRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('catalogs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name');

  if (error) {
    throw new DatabaseError(`Failed to list catalogs: ${error.message}`, error);
  }
  return (data ?? []) as CatalogRow[];
}

export async function getCatalogById(
  workspaceId: string,
  catalogId: string
): Promise<CatalogRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('catalogs')
    .select('*')
    .eq('id', catalogId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to get catalog: ${error.message}`, error);
  }
  return data as CatalogRow | null;
}

export async function getCatalogOrThrow(
  workspaceId: string,
  catalogId: string
): Promise<CatalogRow> {
  const row = await getCatalogById(workspaceId, catalogId);
  if (!row) {
    throw new NotFoundError('Catalog not found.', 'catalog');
  }
  return row;
}

type CreateCatalogInput = Omit<
  CatalogRow,
  'id' | 'workspace_id' | 'created_at' | 'updated_at'
> & Partial<Pick<CatalogRow, 'description'>>;

export async function createCatalog(
  workspaceId: string,
  input: CreateCatalogInput
): Promise<CatalogRow> {
  const supabase = getSupabase();
  const row = {
    workspace_id: workspaceId,
    name: input.name.trim(),
    description: input.description?.trim() ?? null,
    owner: input.owner?.trim() ?? '',
    source_system: input.source_system?.trim() ?? '',
    sync_method: input.sync_method?.trim() ?? '',
    update_frequency: input.update_frequency?.trim() ?? '',
    catalog_type: normalizeCatalogType(input.catalog_type),
  };

  const { data, error } = await supabase
    .from('catalogs')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to create catalog: ${error.message}`, error);
  }
  if (!data) {
    throw new DatabaseError('Create catalog returned no row.');
  }
  return data as CatalogRow;
}

export async function updateCatalog(
  workspaceId: string,
  catalogId: string,
  input: Partial<CreateCatalogInput>
): Promise<CatalogRow> {
  await getCatalogOrThrow(workspaceId, catalogId);
  const supabase = getSupabase();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() ?? null;
  if (input.owner !== undefined) updates.owner = input.owner.trim();
  if (input.source_system !== undefined) updates.source_system = input.source_system.trim();
  if (input.sync_method !== undefined) updates.sync_method = input.sync_method.trim();
  if (input.update_frequency !== undefined) updates.update_frequency = input.update_frequency.trim();
  if (input.catalog_type !== undefined) updates.catalog_type = normalizeCatalogType(input.catalog_type);

  const { data, error } = await supabase
    .from('catalogs')
    .update(updates)
    .eq('id', catalogId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to update catalog: ${error.message}`, error);
  }
  if (!data) {
    throw new NotFoundError('Catalog not found after update.', 'catalog');
  }
  return data as CatalogRow;
}

export async function deleteCatalog(
  workspaceId: string,
  catalogId: string
): Promise<void> {
  await getCatalogOrThrow(workspaceId, catalogId);
  const supabase = getSupabase();
  const { error } = await supabase
    .from('catalogs')
    .delete()
    .eq('id', catalogId)
    .eq('workspace_id', workspaceId);

  if (error) {
    throw new DatabaseError(`Failed to delete catalog: ${error.message}`, error);
  }
}

// ----- Catalog Fields -----

export async function listCatalogFields(catalogId: string): Promise<CatalogFieldRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('catalog_fields')
    .select('*')
    .eq('catalog_id', catalogId)
    .order('name');

  if (error) {
    throw new DatabaseError(`Failed to list catalog fields: ${error.message}`, error);
  }
  return (data ?? []) as CatalogFieldRow[];
}

export async function listCatalogFieldsForWorkspace(
  workspaceId: string,
  catalogId: string
): Promise<CatalogFieldRow[]> {
  await getCatalogOrThrow(workspaceId, catalogId);
  return listCatalogFields(catalogId);
}

type CreateCatalogFieldInput = {
  name: string;
  type: string;
  is_lookup_key: boolean;
};

export async function createCatalogField(
  workspaceId: string,
  catalogId: string,
  input: CreateCatalogFieldInput
): Promise<CatalogFieldRow> {
  await getCatalogOrThrow(workspaceId, catalogId);
  const supabase = getSupabase();
  const type = ['string', 'number', 'boolean'].includes(input.type) ? input.type : 'string';
  const row = {
    catalog_id: catalogId,
    name: input.name.trim(),
    type,
    is_lookup_key: Boolean(input.is_lookup_key),
  };

  const { data, error } = await supabase
    .from('catalog_fields')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to create catalog field: ${error.message}`, error);
  }
  if (!data) {
    throw new DatabaseError('Create catalog field returned no row.');
  }
  return data as CatalogFieldRow;
}

export async function setCatalogFieldLookupKey(
  workspaceId: string,
  catalogId: string,
  fieldId: string
): Promise<CatalogFieldRow> {
  await getCatalogOrThrow(workspaceId, catalogId);
  const supabase = getSupabase();
  // Clear current lookup key for this catalog, then set the chosen field
  const { data: fields } = await supabase
    .from('catalog_fields')
    .select('id')
    .eq('catalog_id', catalogId);
  const ids = (fields ?? []).map((f: { id: string }) => f.id);
  if (ids.length > 0) {
    await supabase
      .from('catalog_fields')
      .update({ is_lookup_key: false, updated_at: new Date().toISOString() })
      .in('id', ids);
  }
  const { data, error } = await supabase
    .from('catalog_fields')
    .update({
      is_lookup_key: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fieldId)
    .eq('catalog_id', catalogId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to set lookup key: ${error.message}`, error);
  }
  if (!data) {
    throw new NotFoundError('Catalog field not found.', 'catalog_field');
  }
  return data as CatalogFieldRow;
}

export async function updateCatalogField(
  workspaceId: string,
  catalogId: string,
  fieldId: string,
  input: Partial<CreateCatalogFieldInput>
): Promise<CatalogFieldRow> {
  await getCatalogOrThrow(workspaceId, catalogId);
  const supabase = getSupabase();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.type !== undefined) {
    updates.type = ['string', 'number', 'boolean'].includes(input.type) ? input.type : 'string';
  }
  if (input.is_lookup_key !== undefined) updates.is_lookup_key = Boolean(input.is_lookup_key);

  const { data, error } = await supabase
    .from('catalog_fields')
    .update(updates)
    .eq('id', fieldId)
    .eq('catalog_id', catalogId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to update catalog field: ${error.message}`, error);
  }
  if (!data) {
    throw new NotFoundError('Catalog field not found.', 'catalog_field');
  }
  return data as CatalogFieldRow;
}

export async function deleteCatalogField(
  workspaceId: string,
  catalogId: string,
  fieldId: string
): Promise<void> {
  await getCatalogOrThrow(workspaceId, catalogId);
  const supabase = getSupabase();
  const { error } = await supabase
    .from('catalog_fields')
    .delete()
    .eq('id', fieldId)
    .eq('catalog_id', catalogId);

  if (error) {
    throw new DatabaseError(`Failed to delete catalog field: ${error.message}`, error);
  }
}
