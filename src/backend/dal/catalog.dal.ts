/**
 * Catalog and CatalogField Data Access Layer (kept, extended per the plan). Every function takes
 * `projectId`; all queries enforce `project_id` (fields via their catalog's `project_id`).
 */
import { getDb } from '../db';
import { newId, nowIso, fromSqliteBool, toSqliteBool } from '../db/util';
import { ConflictError, DatabaseError, NotFoundError } from '../errors';

export interface CatalogRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  owner: string | null;
  source_system: string | null;
  sync_method: string | null;
  update_frequency: string | null;
  catalog_type: string | null;
  mapping_role: string | null;
  client_name: string | null;
  purpose: string | null;
  priority: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CatalogFieldRow {
  id: string;
  catalog_id: string;
  name: string;
  description: string | null;
  data_type: string | null;
  is_lookup_key: boolean;
  is_searchable: boolean;
  is_required: boolean;
  client_field_name: string | null;
  bloomreach_column: string | null;
  purpose: string | null;
  priority: string | null;
  status: string | null;
  field_family: string | null;
  item_level: string | null;
  source_mapping_json: unknown;
  created_at: string;
  updated_at: string;
}

function mapCatalogFieldRow(row: Record<string, unknown>): CatalogFieldRow {
  return {
    ...(row as unknown as CatalogFieldRow),
    is_lookup_key: fromSqliteBool(row.is_lookup_key),
    is_searchable: fromSqliteBool(row.is_searchable),
    is_required: fromSqliteBool(row.is_required),
    source_mapping_json: row.source_mapping_json
      ? JSON.parse(row.source_mapping_json as string)
      : null,
  };
}

export function listCatalogs(projectId: string): CatalogRow[] {
  return getDb()
    .prepare('SELECT * FROM catalogs WHERE project_id = ? AND deleted_at IS NULL ORDER BY name')
    .all(projectId) as CatalogRow[];
}

export function getCatalogById(projectId: string, catalogId: string): CatalogRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM catalogs WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
      .get(catalogId, projectId) as CatalogRow | undefined) ?? null
  );
}

export function getCatalogOrThrow(projectId: string, catalogId: string): CatalogRow {
  const row = getCatalogById(projectId, catalogId);
  if (!row) throw new NotFoundError('Catalog not found.', 'catalog');
  return row;
}

export interface CatalogInput {
  name: string;
  description?: string | null;
  owner?: string | null;
  source_system?: string | null;
  sync_method?: string | null;
  update_frequency?: string | null;
  catalog_type?: string | null;
  mapping_role?: string | null;
  client_name?: string | null;
  purpose?: string | null;
  priority?: string | null;
  status?: string | null;
}

export function createCatalog(projectId: string, input: CatalogInput): CatalogRow {
  const name = input.name.trim();
  if (!name) throw new ConflictError('Catalog name is required.');
  const id = newId();
  const now = nowIso();
  try {
    getDb()
      .prepare(
        `INSERT INTO catalogs (
          id, project_id, name, description, owner, source_system, sync_method, update_frequency,
          catalog_type, mapping_role, client_name, purpose, priority, status, created_at, updated_at, deleted_at
        ) VALUES (@id, @project_id, @name, @description, @owner, @source_system, @sync_method, @update_frequency,
          @catalog_type, @mapping_role, @client_name, @purpose, @priority, @status, @created_at, @updated_at, NULL)`
      )
      .run({
        id,
        project_id: projectId,
        name,
        description: input.description?.trim() || null,
        owner: input.owner?.trim() || null,
        source_system: input.source_system?.trim() || null,
        sync_method: input.sync_method?.trim() || null,
        update_frequency: input.update_frequency?.trim() || null,
        catalog_type: input.catalog_type ?? null,
        mapping_role: input.mapping_role ?? null,
        client_name: input.client_name?.trim() || null,
        purpose: input.purpose?.trim() || null,
        priority: input.priority ?? null,
        status: input.status ?? null,
        created_at: now,
        updated_at: now,
      });
  } catch (err) {
    if (/uq_catalogs_project_mapping_role/.test((err as Error).message)) {
      throw new ConflictError('Another catalog already has this mapping role in the project.');
    }
    throw new DatabaseError(`Failed to create catalog: ${(err as Error).message}`, err);
  }
  return getCatalogOrThrow(projectId, id);
}

export function updateCatalog(
  projectId: string,
  catalogId: string,
  input: Partial<CatalogInput>
): CatalogRow {
  getCatalogOrThrow(projectId, catalogId);
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.owner !== undefined) patch.owner = input.owner?.trim() || null;
  if (input.source_system !== undefined) patch.source_system = input.source_system?.trim() || null;
  if (input.sync_method !== undefined) patch.sync_method = input.sync_method?.trim() || null;
  if (input.update_frequency !== undefined) patch.update_frequency = input.update_frequency?.trim() || null;
  if (input.catalog_type !== undefined) patch.catalog_type = input.catalog_type;
  if (input.mapping_role !== undefined) patch.mapping_role = input.mapping_role;
  if (input.client_name !== undefined) patch.client_name = input.client_name?.trim() || null;
  if (input.purpose !== undefined) patch.purpose = input.purpose?.trim() || null;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.status !== undefined) patch.status = input.status;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    getDb()
      .prepare(`UPDATE catalogs SET ${setClause} WHERE id = @id AND project_id = @project_id`)
      .run({ ...patch, id: catalogId, project_id: projectId });
  } catch (err) {
    if (/uq_catalogs_project_mapping_role/.test((err as Error).message)) {
      throw new ConflictError('Another catalog already has this mapping role in the project.');
    }
    throw new DatabaseError(`Failed to update catalog: ${(err as Error).message}`, err);
  }
  return getCatalogOrThrow(projectId, catalogId);
}

export function deleteCatalog(projectId: string, catalogId: string): void {
  getCatalogOrThrow(projectId, catalogId);
  const now = nowIso();
  getDb()
    .prepare('UPDATE catalogs SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?')
    .run(now, now, catalogId, projectId);
}

// ----- Catalog fields -----

export function listCatalogFields(projectId: string, catalogId: string): CatalogFieldRow[] {
  getCatalogOrThrow(projectId, catalogId);
  const rows = getDb()
    .prepare('SELECT * FROM catalog_fields WHERE catalog_id = ? ORDER BY name')
    .all(catalogId) as Record<string, unknown>[];
  return rows.map(mapCatalogFieldRow);
}

export interface CatalogFieldInput {
  name: string;
  description?: string | null;
  data_type?: string | null;
  is_lookup_key?: boolean;
  is_searchable?: boolean;
  is_required?: boolean;
  client_field_name?: string | null;
  bloomreach_column?: string | null;
  purpose?: string | null;
  priority?: string | null;
  status?: string | null;
  field_family?: string | null;
  item_level?: string | null;
  source_mapping_json?: unknown;
}

export function createCatalogField(
  projectId: string,
  catalogId: string,
  input: CatalogFieldInput
): CatalogFieldRow {
  getCatalogOrThrow(projectId, catalogId);
  const name = input.name.trim();
  if (!name) throw new ConflictError('Catalog field name is required.');
  const id = newId();
  const now = nowIso();
  try {
    getDb()
      .prepare(
        `INSERT INTO catalog_fields (
          id, catalog_id, name, description, data_type, is_lookup_key, is_searchable, is_required,
          client_field_name, bloomreach_column, purpose, priority, status, field_family, item_level,
          source_mapping_json, created_at, updated_at
        ) VALUES (@id, @catalog_id, @name, @description, @data_type, @is_lookup_key, @is_searchable,
          @is_required, @client_field_name, @bloomreach_column, @purpose, @priority, @status,
          @field_family, @item_level, @source_mapping_json, @created_at, @updated_at)`
      )
      .run({
        id,
        catalog_id: catalogId,
        name,
        description: input.description?.trim() || null,
        data_type: input.data_type ?? 'string',
        is_lookup_key: toSqliteBool(input.is_lookup_key),
        is_searchable: toSqliteBool(input.is_searchable),
        is_required: toSqliteBool(input.is_required),
        client_field_name: input.client_field_name?.trim() || null,
        bloomreach_column: input.bloomreach_column ?? null,
        purpose: input.purpose?.trim() || null,
        priority: input.priority ?? null,
        status: input.status ?? null,
        field_family: input.field_family ?? 'custom',
        item_level: input.item_level ?? 'general',
        source_mapping_json: input.source_mapping_json ? JSON.stringify(input.source_mapping_json) : null,
        created_at: now,
        updated_at: now,
      });
  } catch (err) {
    throw new DatabaseError(`Failed to create catalog field: ${(err as Error).message}`, err);
  }
  const row = getDb().prepare('SELECT * FROM catalog_fields WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
  return mapCatalogFieldRow(row);
}

export function updateCatalogField(
  projectId: string,
  catalogId: string,
  fieldId: string,
  input: Partial<CatalogFieldInput>
): CatalogFieldRow {
  getCatalogOrThrow(projectId, catalogId);
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.data_type !== undefined) patch.data_type = input.data_type;
  if (input.is_lookup_key !== undefined) patch.is_lookup_key = toSqliteBool(input.is_lookup_key);
  if (input.is_searchable !== undefined) patch.is_searchable = toSqliteBool(input.is_searchable);
  if (input.is_required !== undefined) patch.is_required = toSqliteBool(input.is_required);
  if (input.client_field_name !== undefined) {
    patch.client_field_name = input.client_field_name?.trim() || null;
  }
  if (input.bloomreach_column !== undefined) patch.bloomreach_column = input.bloomreach_column;
  if (input.purpose !== undefined) patch.purpose = input.purpose?.trim() || null;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.status !== undefined) patch.status = input.status;
  if (input.field_family !== undefined) patch.field_family = input.field_family;
  if (input.item_level !== undefined) patch.item_level = input.item_level;
  if (input.source_mapping_json !== undefined) {
    patch.source_mapping_json = input.source_mapping_json ? JSON.stringify(input.source_mapping_json) : null;
  }

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  const result = getDb()
    .prepare(`UPDATE catalog_fields SET ${setClause} WHERE id = @id AND catalog_id = @catalog_id`)
    .run({ ...patch, id: fieldId, catalog_id: catalogId });
  if (result.changes === 0) throw new NotFoundError('Catalog field not found.', 'catalog_field');

  const row = getDb().prepare('SELECT * FROM catalog_fields WHERE id = ?').get(fieldId) as Record<
    string,
    unknown
  >;
  return mapCatalogFieldRow(row);
}

export function deleteCatalogField(projectId: string, catalogId: string, fieldId: string): void {
  getCatalogOrThrow(projectId, catalogId);
  const result = getDb()
    .prepare('DELETE FROM catalog_fields WHERE id = ? AND catalog_id = ?')
    .run(fieldId, catalogId);
  if (result.changes === 0) throw new NotFoundError('Catalog field not found.', 'catalog_field');
}
