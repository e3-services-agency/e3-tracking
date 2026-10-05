/**
 * Catalog and CatalogField Data Access Layer (kept, extended per the plan). Every function takes
 * `projectId`; all queries enforce `project_id` (fields via their catalog's `project_id`).
 */
import { getDb } from '../db';
import { newId, nowIso, fromSqliteBool, toSqliteBool, mapWriteError } from '../db/util';
import { NotFoundError, ValidationError } from '../errors';
import {
  CATALOG_KINDS,
  CATALOG_MAPPING_ROLES,
  CATALOG_VERSIONS,
  DEFAULT_CATALOG_VERSION,
  type CatalogKind,
  type CatalogVersion,
} from '../../domain/enums';
import { deriveCatalogKind, searchableFieldNames } from '../../domain/catalogs';
import { CATALOG_MAIN_COLUMNS } from '../../domain/bloomreach';
import { markRequirementsGapForCatalogFieldRemoval } from './requirement.dal';
import * as ChangeLogDAL from './change-log.dal';

/** `mapping_role` (T-1-06 delta): `null` clears the role; any other value must be a known one. */
function validateMappingRole(mappingRole: string | null | undefined): void {
  if (mappingRole === null || mappingRole === undefined) return;
  if (!CATALOG_MAPPING_ROLES.includes(mappingRole as (typeof CATALOG_MAPPING_ROLES)[number])) {
    throw new ValidationError(
      `mapping_role must be one of ${CATALOG_MAPPING_ROLES.join(', ')} or null.`,
      'mapping_role'
    );
  }
}

function validateTextOrNull(value: unknown, field: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string or null.`, field);
  }
}

function validateKindAndVersion(kind: unknown, version: unknown): void {
  if (kind !== undefined && !(CATALOG_KINDS as readonly unknown[]).includes(kind)) {
    throw new ValidationError(`kind must be one of: ${CATALOG_KINDS.join(', ')}.`, 'kind');
  }
  if (version !== undefined && !(CATALOG_VERSIONS as readonly unknown[]).includes(version)) {
    throw new ValidationError(`version must be one of: ${CATALOG_VERSIONS.join(', ')}.`, 'version');
  }
}

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
  /** D-61 (T-4-11B): product | variant | other; catalogs of one kind share one schema. */
  kind: CatalogKind;
  /** D-61: market code or name (e.g. `GB`, `CZ`); `null` = not recorded. */
  market: string | null;
  /** D-61: language tag (e.g. `en-GB`); `null` = not recorded. */
  language: string | null;
  /** D-61: v1 fixes the searchable set at go-live, v2 lets it change. */
  version: CatalogVersion;
  /** D-61: when the catalog was marked live; `null` = not live. */
  live_at: string | null;
  /** D-61: the sorted searchable field names at the moment it was marked live (the v1 rule); `null` when not live. */
  searchable_snapshot_json: string[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapCatalogRow(row: Record<string, unknown>): CatalogRow {
  let snapshot: string[] | null = null;
  if (typeof row.searchable_snapshot_json === 'string') {
    try {
      const parsed = JSON.parse(row.searchable_snapshot_json) as unknown;
      if (Array.isArray(parsed)) snapshot = parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      snapshot = null;
    }
  }
  return { ...(row as unknown as CatalogRow), searchable_snapshot_json: snapshot };
}

/**
 * LOW 4 (reviewer T-1-06 pass): `bloomreach_column` must be one of the `main_columns` slots from
 * the Bloomreach fixture (`CATALOG_MAIN_COLUMNS`, `src/domain/bloomreach.ts`). Unlike
 * `standard_key`/`consent_key_additions_json`, there is no project-level "additions" column for
 * catalog main columns yet, so this only checks the fixed seed list; a project needing a
 * non-standard column has no way to add it today (noted here, not fixed — out of scope for this
 * integration round).
 */
function validateBloomreachColumn(column: string | null | undefined): void {
  if (column === null || column === undefined || column === '') return;
  if (!CATALOG_MAIN_COLUMNS.includes(column)) {
    throw new ValidationError(
      `bloomreach_column must be one of ${CATALOG_MAIN_COLUMNS.join(', ')} or null.`,
      'bloomreach_column'
    );
  }
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
  return (
    getDb()
      .prepare('SELECT * FROM catalogs WHERE project_id = ? AND deleted_at IS NULL ORDER BY name')
      .all(projectId) as Record<string, unknown>[]
  ).map(mapCatalogRow);
}

export function getCatalogById(projectId: string, catalogId: string): CatalogRow | null {
  const row = getDb()
    .prepare('SELECT * FROM catalogs WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(catalogId, projectId) as Record<string, unknown> | undefined;
  return row ? mapCatalogRow(row) : null;
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
  /** D-61 (T-4-11B): defaults from `mapping_role`/`catalog_type` when derivable, else `other`. */
  kind?: string;
  market?: string | null;
  language?: string | null;
  version?: string;
}

export function createCatalog(projectId: string, input: CatalogInput): CatalogRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Catalog name is required.', 'name');
  validateMappingRole(input.mapping_role);
  validateKindAndVersion(input.kind, input.version);
  validateTextOrNull(input.market, 'market');
  validateTextOrNull(input.language, 'language');
  const id = newId();
  const now = nowIso();
  const db = getDb();
  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO catalogs (
          id, project_id, name, description, owner, source_system, sync_method, update_frequency,
          catalog_type, mapping_role, client_name, purpose, priority, status, kind, market, language, version,
          created_at, updated_at, deleted_at
        ) VALUES (@id, @project_id, @name, @description, @owner, @source_system, @sync_method, @update_frequency,
          @catalog_type, @mapping_role, @client_name, @purpose, @priority, @status, @kind, @market, @language, @version,
          @created_at, @updated_at, NULL)`
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
          kind: input.kind ?? deriveCatalogKind(input.mapping_role, input.catalog_type),
          market: input.market?.trim() || null,
          language: input.language?.trim() || null,
          version: input.version ?? DEFAULT_CATALOG_VERSION,
          created_at: now,
          updated_at: now,
        });
    } catch (err) {
      mapWriteError(
        err,
        'Another catalog already has this mapping role in the project.',
        `Failed to create catalog: ${(err as Error).message}`
      );
    }
    const created = getCatalogOrThrow(projectId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'catalog',
      entityId: id,
      entityLabel: created.name,
      action: 'create',
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
  });
  run();
  return getCatalogOrThrow(projectId, id);
}

export function updateCatalog(
  projectId: string,
  catalogId: string,
  input: Partial<CatalogInput>
): CatalogRow {
  const before = getCatalogOrThrow(projectId, catalogId);
  if (input.name !== undefined && !input.name.trim()) {
    throw new ValidationError('Catalog name is required.', 'name');
  }
  if (input.mapping_role !== undefined) validateMappingRole(input.mapping_role);
  validateKindAndVersion(input.kind, input.version);
  validateTextOrNull(input.market, 'market');
  validateTextOrNull(input.language, 'language');
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
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.market !== undefined) patch.market = input.market?.trim() || null;
  if (input.language !== undefined) patch.language = input.language?.trim() || null;
  if (input.version !== undefined) patch.version = input.version;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  const db = getDb();
  const run = db.transaction(() => {
    try {
      db.prepare(`UPDATE catalogs SET ${setClause} WHERE id = @id AND project_id = @project_id`)
        .run({ ...patch, id: catalogId, project_id: projectId });
    } catch (err) {
      mapWriteError(
        err,
        'Another catalog already has this mapping role in the project.',
        `Failed to update catalog: ${(err as Error).message}`
      );
    }
    const after = getCatalogOrThrow(projectId, catalogId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'catalog',
      entityId: catalogId,
      entityLabel: after.name,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();
  return getCatalogOrThrow(projectId, catalogId);
}

/**
 * D-61 (T-4-11B): marks a catalog live (`live: true`, the default) -- sets `live_at` and stores the
 * current searchable field set as `searchable_snapshot_json`, the baseline the v1 rule compares
 * against -- or takes it off live (`live: false`, clears both). Recorded in the change log.
 */
export function setCatalogLive(projectId: string, catalogId: string, live: boolean): CatalogRow {
  const before = getCatalogOrThrow(projectId, catalogId);
  const db = getDb();
  const now = nowIso();
  const run = db.transaction(() => {
    if (live) {
      const snapshot = searchableFieldNames(listCatalogFields(projectId, catalogId));
      db.prepare('UPDATE catalogs SET live_at = ?, searchable_snapshot_json = ?, updated_at = ? WHERE id = ? AND project_id = ?').run(
        now,
        JSON.stringify(snapshot),
        now,
        catalogId,
        projectId
      );
    } else {
      db.prepare('UPDATE catalogs SET live_at = NULL, searchable_snapshot_json = NULL, updated_at = ? WHERE id = ? AND project_id = ?').run(
        now,
        catalogId,
        projectId
      );
    }
    const after = getCatalogOrThrow(projectId, catalogId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'catalog',
      entityId: catalogId,
      entityLabel: after.name,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();
  return getCatalogOrThrow(projectId, catalogId);
}

export function deleteCatalog(projectId: string, catalogId: string): void {
  const existing = getCatalogOrThrow(projectId, catalogId);
  const now = nowIso();
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare('UPDATE catalogs SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(now, now, catalogId, projectId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'catalog',
      entityId: catalogId,
      entityLabel: existing.name,
      action: 'delete',
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
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
  const catalog = getCatalogOrThrow(projectId, catalogId);
  const name = input.name.trim();
  if (!name) throw new ValidationError('Catalog field name is required.', 'name');
  validateBloomreachColumn(input.bloomreach_column);
  const id = newId();
  const now = nowIso();
  const db = getDb();
  const run = db.transaction(() => {
    try {
      db.prepare(
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
      mapWriteError(
        err,
        `A field named "${name}" already exists in this catalog.`,
        `Failed to create catalog field: ${(err as Error).message}`
      );
    }
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'catalog_field',
      entityId: id,
      entityLabel: `${catalog.name}.${name}`,
      parentEntityId: catalogId,
      action: 'create',
      before: null,
      after: mapCatalogFieldRow(
        db.prepare('SELECT * FROM catalog_fields WHERE id = ?').get(id) as Record<string, unknown>
      ) as unknown as Record<string, unknown>,
    });
  });
  run();
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
  const catalog = getCatalogOrThrow(projectId, catalogId);
  const beforeRow = getDb().prepare('SELECT * FROM catalog_fields WHERE id = ? AND catalog_id = ?').get(
    fieldId,
    catalogId
  ) as Record<string, unknown> | undefined;
  if (!beforeRow) throw new NotFoundError('Catalog field not found.', 'catalog_field');
  const before = mapCatalogFieldRow(beforeRow);
  if (input.name !== undefined && !input.name.trim()) {
    throw new ValidationError('Catalog field name is required.', 'name');
  }
  if (input.bloomreach_column !== undefined) validateBloomreachColumn(input.bloomreach_column);
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
  const db = getDb();
  const run = db.transaction(() => {
    let result: { changes: number };
    try {
      result = db
        .prepare(`UPDATE catalog_fields SET ${setClause} WHERE id = @id AND catalog_id = @catalog_id`)
        .run({ ...patch, id: fieldId, catalog_id: catalogId });
    } catch (err) {
      mapWriteError(
        err,
        `A field named "${String(patch.name ?? '')}" already exists in this catalog.`,
        `Failed to update catalog field: ${(err as Error).message}`
      );
    }
    if (result.changes === 0) throw new NotFoundError('Catalog field not found.', 'catalog_field');
    const after = mapCatalogFieldRow(
      db.prepare('SELECT * FROM catalog_fields WHERE id = ?').get(fieldId) as Record<string, unknown>
    );
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'catalog_field',
      entityId: fieldId,
      entityLabel: `${catalog.name}.${after.name}`,
      parentEntityId: catalogId,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();

  const row = getDb().prepare('SELECT * FROM catalog_fields WHERE id = ?').get(fieldId) as Record<
    string,
    unknown
  >;
  return mapCatalogFieldRow(row);
}

export function deleteCatalogField(projectId: string, catalogId: string, fieldId: string): void {
  const catalog = getCatalogOrThrow(projectId, catalogId);
  const db = getDb();
  const beforeRow = db.prepare('SELECT * FROM catalog_fields WHERE id = ? AND catalog_id = ?').get(
    fieldId,
    catalogId
  ) as Record<string, unknown> | undefined;
  if (!beforeRow) throw new NotFoundError('Catalog field not found.', 'catalog_field');
  const before = mapCatalogFieldRow(beforeRow);
  const run = db.transaction(() => {
    // T-3-10 (D-57): mirrors the property/event/variant gap-marking on removal (requirement.dal.ts's
    // `markRequirementsGap*`) for the new `catalog_attribute` requirement target kind -- the FK
    // itself is `ON DELETE SET NULL` (0017), but only this call also flips `status` to `gap` and
    // appends a "target removed" note. Runs inside the same transaction as the DELETE (merge note,
    // T-3-02 review): before this it ran outside any transaction of its own.
    markRequirementsGapForCatalogFieldRemoval(projectId, fieldId, before.name);
    const result = db
      .prepare('DELETE FROM catalog_fields WHERE id = ? AND catalog_id = ?')
      .run(fieldId, catalogId);
    if (result.changes === 0) throw new NotFoundError('Catalog field not found.', 'catalog_field');
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'catalog_field',
      entityId: fieldId,
      entityLabel: `${catalog.name}.${before.name}`,
      parentEntityId: catalogId,
      action: 'delete',
      before: before as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
}

/**
 * T-3-10 (D-55/D-57): the project's main catalog (`mapping_role = 'main'`, at most one per
 * project) — resolution target for `catalog_attribute` library requirements, which name a field by
 * its exact `name` on that catalog. `null` when the project has no main catalog yet.
 */
export function getMainCatalog(projectId: string): CatalogRow | null {
  const row = getDb()
    .prepare("SELECT * FROM catalogs WHERE project_id = ? AND mapping_role = 'main' AND deleted_at IS NULL")
    .get(projectId) as Record<string, unknown> | undefined;
  return row ? mapCatalogRow(row) : null;
}

/** One catalog's answer for a requirement field (D-61, T-4-11B): does it have the field? */
export interface CatalogFieldPresence {
  catalog_id: string;
  name: string;
  market: string | null;
  language: string | null;
  has_field: boolean;
}

const CATALOG_FIELD_NAME_ALIASES: Record<string, string> = { product_id: 'item_id', item_id: 'product_id' };

/**
 * D-61 (T-4-11B): resolves a `catalog_attribute` requirement's field per kind. The reference field is
 * the main catalog's (as before); the catalogs checked are every catalog of the main catalog's kind
 * (one per market), or the main catalog alone when its kind is `other`. `product_id` and `item_id`
 * are the same field under two names. `null` when there is no main catalog or it lacks the field.
 */
export function resolveCatalogAttribute(
  projectId: string,
  fieldName: string
): { field: CatalogFieldRow; presence: CatalogFieldPresence[]; missing: CatalogFieldPresence[] } | null {
  const main = getMainCatalog(projectId);
  if (!main) return null;
  const field =
    findMainCatalogFieldByName(projectId, fieldName) ??
    (CATALOG_FIELD_NAME_ALIASES[fieldName] ? findMainCatalogFieldByName(projectId, CATALOG_FIELD_NAME_ALIASES[fieldName]) : null);
  if (!field) return null;
  const names = [fieldName, CATALOG_FIELD_NAME_ALIASES[fieldName]].filter((n): n is string => !!n);
  const catalogs = main.kind === 'other' ? [main] : listCatalogs(projectId).filter((c) => c.kind === main.kind);
  const presence: CatalogFieldPresence[] = catalogs.map((c) => ({
    catalog_id: c.id,
    name: c.name,
    market: c.market,
    language: c.language,
    has_field: listCatalogFields(projectId, c.id).some((f) => names.includes(f.name)),
  }));
  return { field, presence, missing: presence.filter((p) => !p.has_field) };
}

/** A field of the project's main catalog by exact name, or `null` if there is no main catalog or no such field. */
export function findMainCatalogFieldByName(projectId: string, name: string): CatalogFieldRow | null {
  const main = getMainCatalog(projectId);
  if (!main) return null;
  const row = getDb()
    .prepare('SELECT * FROM catalog_fields WHERE catalog_id = ? AND name = ?')
    .get(main.id, name) as Record<string, unknown> | undefined;
  return row ? mapCatalogFieldRow(row) : null;
}
