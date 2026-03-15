/**
 * Catalog CRUD service. All operations are workspace-scoped.
 * Delegates to catalog DAL.
 */
import * as CatalogDAL from '../dal/catalog.dal.js';
export async function listCatalogs(workspaceId) {
    return CatalogDAL.listCatalogs(workspaceId);
}
export async function getCatalog(workspaceId, catalogId) {
    return CatalogDAL.getCatalogById(workspaceId, catalogId);
}
export async function getCatalogOrThrow(workspaceId, catalogId) {
    return CatalogDAL.getCatalogOrThrow(workspaceId, catalogId);
}
export async function createCatalog(workspaceId, input) {
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
export async function updateCatalog(workspaceId, catalogId, input) {
    return CatalogDAL.updateCatalog(workspaceId, catalogId, input);
}
export async function deleteCatalog(workspaceId, catalogId) {
    return CatalogDAL.deleteCatalog(workspaceId, catalogId);
}
// ----- Catalog Fields -----
export async function listCatalogFields(workspaceId, catalogId) {
    return CatalogDAL.listCatalogFieldsForWorkspace(workspaceId, catalogId);
}
export async function createCatalogField(workspaceId, catalogId, input) {
    return CatalogDAL.createCatalogField(workspaceId, catalogId, {
        name: input.name,
        type: input.type,
        is_lookup_key: input.is_lookup_key ?? false,
    });
}
export async function setCatalogFieldLookupKey(workspaceId, catalogId, fieldId) {
    return CatalogDAL.setCatalogFieldLookupKey(workspaceId, catalogId, fieldId);
}
export async function updateCatalogField(workspaceId, catalogId, fieldId, input) {
    return CatalogDAL.updateCatalogField(workspaceId, catalogId, fieldId, input);
}
export async function deleteCatalogField(workspaceId, catalogId, fieldId) {
    return CatalogDAL.deleteCatalogField(workspaceId, catalogId, fieldId);
}
