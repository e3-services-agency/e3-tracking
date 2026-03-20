/**
 * Catalog CRUD service. All operations are workspace-scoped.
 * Delegates to catalog DAL.
 */
import * as CatalogDAL from '../dal/catalog.dal';
import type { CatalogRow, CatalogFieldRow } from '../../types/schema';

export async function listCatalogs(workspaceId: string): Promise<CatalogRow[]> {
  return CatalogDAL.listCatalogs(workspaceId);
}

export async function getCatalog(
  workspaceId: string,
  catalogId: string
): Promise<CatalogRow | null> {
  return CatalogDAL.getCatalogById(workspaceId, catalogId);
}

export async function getCatalogOrThrow(
  workspaceId: string,
  catalogId: string
): Promise<CatalogRow> {
  return CatalogDAL.getCatalogOrThrow(workspaceId, catalogId);
}

type CreateCatalogInput = {
  name: string;
  description?: string | null;
  owner: string;
  source_system: string;
  sync_method: string;
  update_frequency: string;
  catalog_type?: import('../../types/schema.js').CatalogType;
};

export async function createCatalog(
  workspaceId: string,
  input: CreateCatalogInput
): Promise<CatalogRow> {
  return CatalogDAL.createCatalog(workspaceId, {
    name: input.name,
    description: input.description ?? null,
    owner: input.owner,
    source_system: input.source_system,
    sync_method: input.sync_method,
    update_frequency: input.update_frequency,
    catalog_type: input.catalog_type,
  });
}

export async function updateCatalog(
  workspaceId: string,
  catalogId: string,
  input: Partial<CreateCatalogInput>
): Promise<CatalogRow> {
  return CatalogDAL.updateCatalog(workspaceId, catalogId, input);
}

export async function deleteCatalog(
  workspaceId: string,
  catalogId: string
): Promise<void> {
  return CatalogDAL.deleteCatalog(workspaceId, catalogId);
}

// ----- Catalog Fields -----

export async function listCatalogFields(
  workspaceId: string,
  catalogId: string
): Promise<CatalogFieldRow[]> {
  return CatalogDAL.listCatalogFieldsForWorkspace(workspaceId, catalogId);
}

type CreateCatalogFieldInput = {
  name: string;
  description?: string | null;
  data_type: import('../../types/schema.js').CatalogFieldDataType;
  is_lookup_key?: boolean;
  field_family: import('../../types/schema.js').CatalogFieldFamily;
  item_level: import('../../types/schema.js').CatalogFieldItemLevel;
  source_mapping_json?: import('../../types/schema.js').CatalogFieldSourceMapping | null;
};

export async function createCatalogField(
  workspaceId: string,
  catalogId: string,
  input: CreateCatalogFieldInput
): Promise<CatalogFieldRow> {
  return CatalogDAL.createCatalogField(workspaceId, catalogId, {
    name: input.name,
    description: input.description ?? null,
    data_type: input.data_type,
    is_lookup_key: input.is_lookup_key ?? false,
    field_family: input.field_family,
    item_level: input.item_level,
    source_mapping_json: input.source_mapping_json ?? null,
  });
}

export async function setCatalogFieldLookupKey(
  workspaceId: string,
  catalogId: string,
  fieldId: string
): Promise<CatalogFieldRow> {
  return CatalogDAL.setCatalogFieldLookupKey(workspaceId, catalogId, fieldId);
}

export async function updateCatalogField(
  workspaceId: string,
  catalogId: string,
  fieldId: string,
  input: Partial<CreateCatalogFieldInput>
): Promise<CatalogFieldRow> {
  return CatalogDAL.updateCatalogField(workspaceId, catalogId, fieldId, input);
}

export async function deleteCatalogField(
  workspaceId: string,
  catalogId: string,
  fieldId: string
): Promise<void> {
  return CatalogDAL.deleteCatalogField(workspaceId, catalogId, fieldId);
}
