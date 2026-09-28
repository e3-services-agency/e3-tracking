/**
 * Full JSON backup export (D-45, T-3-04, capability 1): one self-contained file per project,
 * `GET /export/backup.json`. `buildBackup(projectId)` assembles the contract shape from
 * `.claude/team/reports/PLAN-PHASE3-4-2026-09-27.md` "Full JSON backup and restore as new project":
 * every table as full rows (JSON columns parsed), soft-deleted rows included with `deleted_at`
 * (a backup is a faithful snapshot, never filtered), files embedded as base64, referenced
 * `use_case_templates` embedded in full. Restore (T-3-05) is a separate task; this module only
 * produces the payload.
 *
 * D-45/D-56: rather than hard-coding each table's column list (which the CSV export does, since it
 * maps to a stable header contract), every row builder below reads the table's *live* columns
 * through `PRAGMA table_info` and returns them all. This means `use_cases` rows already carry
 * `activation`/`assets_json` the moment T-4-06's migration lands, with no change to this file --
 * exactly the property D-56 asks a backup to have for phase-4-only columns. The two tables that
 * don't exist until a later phase (`comments`, T-4-02) are gated on the table's presence in
 * `sqlite_master` (not a try/catch): the array comes back empty until the table exists.
 *
 * Pre-QA fix round (reviewer PASS 2026-09-28 02:36, supervisor decision 02:37):
 * - `project.share_token`/`project.share_access` are exported as `null` (the keys stay present):
 *   D-48 stores the share token in plaintext and D-45 makes a backup portable between machines, so
 *   carrying a live token would let a restored project (T-3-05) silently duplicate a public link.
 *   T-3-05 must never write these two columns back on restore either.
 * - A malformed `*_json` column (never produced by the DAL, which always writes through
 *   `toJsonColumn`, but a backup is meant to be a faithful snapshot of whatever is actually in the
 *   database) is kept as its raw string instead of being silently turned into `null`, and reported
 *   in the top-level `warnings[]` array (`"<table>.<column> for id <id> is not valid JSON; kept as
 *   the raw string."`).
 * - `observations` is ordered `timestamp, id` like every other array (it previously had no
 *   `ORDER BY` at all, so two backups of the same project could differ in row order).
 */
import { getDb } from '../db';
import { getProjectOrThrow } from '../dal/project.dal';
import { getClientById } from '../dal/client.dal';
import { getFileStore } from '../files/FileStore';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../../domain/enums';

type Row = Record<string, unknown>;

function tableExists(name: string): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function tableColumns(table: string): string[] {
  return (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

/** A human-readable id for a warning message; falls back to whatever primary/composite key columns exist. */
function describeRowId(row: Row): string {
  if (row.id !== undefined && row.id !== null) return String(row.id);
  const keyParts = Object.keys(row)
    .filter((k) => k.endsWith('_id'))
    .map((k) => `${k}=${String(row[k])}`);
  return keyParts.length > 0 ? keyParts.join(',') : '(no id)';
}

/**
 * Parses one `*_json` TEXT cell. `null`/`undefined`/empty string is a normal absent value ->
 * `null`, no warning. A non-empty string that fails `JSON.parse` is malformed (never produced by
 * the DAL, but a backup must not silently drop it): kept as the raw string, and a warning is
 * pushed (pre-QA fix INFO 2).
 */
function parseJsonCell(value: unknown, table: string, column: string, rowId: string, warnings: string[]): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    warnings.push(`${table}.${column} for id ${rowId} is not valid JSON; kept as the raw string.`);
    return value;
  }
}

/** Parses every `*_json` column of a raw SQLite row; everything else passes through. */
function parseRow(row: Row, columns: string[], table: string, warnings: string[]): Row {
  const rowId = describeRowId(row);
  const out: Row = {};
  for (const col of columns) {
    out[col] = col.endsWith('_json') ? parseJsonCell(row[col], table, col, rowId, warnings) : row[col];
  }
  return out;
}

/** Rows of a project-scoped table (`project_id` column directly on it), every column, optionally ordered. */
function directRows(table: string, projectId: string, warnings: string[], orderBy?: string): Row[] {
  if (!tableExists(table)) return [];
  const columns = tableColumns(table);
  const sql = `SELECT * FROM ${table} WHERE project_id = ?${orderBy ? ` ORDER BY ${orderBy}` : ''}`;
  const rows = getDb().prepare(sql).all(projectId) as Row[];
  return rows.map((r) => parseRow(r, columns, table, warnings));
}

/**
 * Rows of a child table with no `project_id` of its own, scoped through a parent table that does
 * (`event_sources`/`event_properties` via `events`, `catalog_fields` via `catalogs`, `requirements`
 * via `use_cases`, `property_bundle_items` via `property_bundles`). Every child row is included
 * regardless of the parent's own soft-delete state (a soft-deleted event's links are still part of
 * the snapshot; the parent row itself already carries `deleted_at`).
 */
function joinedRows(
  childTable: string,
  parentTable: string,
  parentIdColumn: string,
  childParentColumn: string,
  projectId: string,
  warnings: string[],
  orderBy?: string
): Row[] {
  if (!tableExists(childTable)) return [];
  const columns = tableColumns(childTable);
  const selectCols = columns.map((c) => `c.${c} as ${c}`).join(', ');
  const sql = `SELECT ${selectCols} FROM ${childTable} c
    JOIN ${parentTable} p ON p.${parentIdColumn} = c.${childParentColumn}
    WHERE p.project_id = ?${orderBy ? ` ORDER BY ${orderBy}` : ''}`;
  const rows = getDb().prepare(sql).all(projectId) as Row[];
  return rows.map((r) => parseRow(r, columns, childTable, warnings));
}

/** Latest applied migration's numeric prefix (e.g. `0016_use_case_template_tags.sql` -> `'0016'`). */
function currentSchemaMigration(): string {
  const row = getDb()
    .prepare('SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1')
    .get() as { id: string } | undefined;
  if (!row) return '0000';
  const match = /^(\d+)_/.exec(row.id);
  return match ? match[1] : row.id;
}

export interface BackupFileEntry {
  path: string;
  mime: string;
  base64: string;
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  app: { schema_migration: string };
  client: { key: string; name: string; bloomreach_account_id: string | null; notes: string | null } | null;
  project: Row;
  use_case_templates: Row[];
  sources: Row[];
  properties: Row[];
  events: Row[];
  event_sources: Row[];
  event_properties: Row[];
  variants: Row[];
  standard_event_mappings: Row[];
  identity_rules: Row[];
  catalogs: Row[];
  catalog_fields: Row[];
  consent_categories: Row[];
  use_cases: Row[];
  requirements: Row[];
  rules: Row[];
  property_bundles: Row[];
  property_bundle_items: Row[];
  qa_runs: Row[];
  observations: Row[];
  findings: Row[];
  change_log: Row[];
  comments: Row[];
  files: BackupFileEntry[];
  files_missing: string[];
  /** Malformed `*_json` cells kept as raw strings instead of being silently nulled (pre-QA fix INFO 2). */
  warnings: string[];
}

/** Every distinct, non-null `image_path` referenced by any event's `triggers_json` entries. */
function triggerImagePaths(events: Row[]): string[] {
  const paths = new Set<string>();
  for (const event of events) {
    const triggers = event.triggers_json;
    if (!Array.isArray(triggers)) continue;
    for (const trigger of triggers) {
      const imagePath = (trigger as Row | null)?.image_path;
      if (typeof imagePath === 'string' && imagePath.trim()) paths.add(imagePath);
    }
  }
  return Array.from(paths);
}

/**
 * Reads every file referenced by `triggers_json.image_path` or `client_logo_path` through
 * `FileStore.openForProject`, base64-encoded; a file missing on disk is a warning in
 * `files_missing[]`, never a thrown error (D-45).
 */
async function collectFiles(
  projectId: string,
  events: Row[],
  clientLogoPath: unknown
): Promise<{ files: BackupFileEntry[]; files_missing: string[] }> {
  const paths = new Set(triggerImagePaths(events));
  if (typeof clientLogoPath === 'string' && clientLogoPath.trim()) paths.add(clientLogoPath);

  const store = getFileStore();
  const files: BackupFileEntry[] = [];
  const files_missing: string[] = [];
  for (const path of paths) {
    try {
      const opened = await store.openForProject(projectId, path);
      files.push({ path, mime: opened.mime, base64: opened.buffer.toString('base64') });
    } catch {
      files_missing.push(path);
    }
  }
  return { files, files_missing };
}

/** Full self-contained backup of one project (D-45). */
export async function buildBackup(projectId: string): Promise<BackupPayload> {
  const project = getProjectOrThrow(projectId);
  const client = project.client_id ? getClientById(project.client_id) : null;
  const warnings: string[] = [];

  const projectColumns = tableColumns('projects');
  const projectRawRow = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Row;
  const projectParsed = parseRow(projectRawRow, projectColumns, 'projects', warnings);
  delete projectParsed.id;
  delete projectParsed.client_id;
  // Pre-QA fix WARNING 1: never export a live share token/access (D-48 stores it in plaintext; a
  // portable backup must not silently carry a working public link between machines). Keys stay
  // present (a restored project always has *some* value for these columns) with a `null` value,
  // matching D-48's "revoke by nulling"; T-3-05 must never write them back on restore either.
  projectParsed.share_token = null;
  projectParsed.share_access = null;

  const events = directRows('events', projectId, warnings, 'created_at');
  const useCases = directRows('use_cases', projectId, warnings, 'sort_order, created_at');

  const templateIds = Array.from(
    new Set(useCases.map((uc) => uc.template_id).filter((v): v is string => typeof v === 'string'))
  );
  let useCaseTemplates: Row[] = [];
  if (templateIds.length > 0 && tableExists('use_case_templates')) {
    const columns = tableColumns('use_case_templates');
    const placeholders = templateIds.map(() => '?').join(', ');
    const rows = getDb()
      .prepare(`SELECT * FROM use_case_templates WHERE id IN (${placeholders})`)
      .all(...templateIds) as Row[];
    useCaseTemplates = rows.map((r) => parseRow(r, columns, 'use_case_templates', warnings));
  }

  const { files, files_missing } = await collectFiles(projectId, events, project.client_logo_path);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    app: { schema_migration: currentSchemaMigration() },
    client: client
      ? { key: client.key, name: client.name, bloomreach_account_id: client.bloomreach_account_id, notes: client.notes }
      : null,
    project: projectParsed,
    use_case_templates: useCaseTemplates,
    sources: directRows('sources', projectId, warnings, 'created_at'),
    properties: directRows('properties', projectId, warnings, 'created_at'),
    events,
    event_sources: joinedRows('event_sources', 'events', 'id', 'event_id', projectId, warnings, 'c.created_at'),
    event_properties: joinedRows(
      'event_properties',
      'events',
      'id',
      'event_id',
      projectId,
      warnings,
      'c.sort_order, c.created_at'
    ),
    variants: directRows('variants', projectId, warnings, 'created_at'),
    standard_event_mappings: directRows('standard_event_mappings', projectId, warnings, 'created_at'),
    identity_rules: directRows('identity_rules', projectId, warnings, 'sort_order, created_at'),
    catalogs: directRows('catalogs', projectId, warnings, 'created_at'),
    catalog_fields: joinedRows('catalog_fields', 'catalogs', 'id', 'catalog_id', projectId, warnings, 'c.created_at'),
    consent_categories: directRows('consent_categories', projectId, warnings, 'sort_order, created_at'),
    use_cases: useCases,
    requirements: joinedRows(
      'requirements',
      'use_cases',
      'id',
      'use_case_id',
      projectId,
      warnings,
      'c.sort_order, c.created_at'
    ),
    rules: directRows('rules', projectId, warnings, 'created_at'),
    property_bundles: directRows('property_bundles', projectId, warnings, 'created_at'),
    property_bundle_items: joinedRows(
      'property_bundle_items',
      'property_bundles',
      'id',
      'bundle_id',
      projectId,
      warnings,
      'c.created_at'
    ),
    qa_runs: directRows('qa_runs', projectId, warnings, 'started_at'),
    // Pre-QA fix INFO 3: ordered like every other array (was unordered, so two backups of the same
    // project could differ in row order).
    observations: directRows('observations', projectId, warnings, 'timestamp, id'),
    findings: directRows('findings', projectId, warnings, 'first_seen_at'),
    change_log: directRows('change_log', projectId, warnings, 'changed_at'),
    // T-4-02 adds the `comments` table; until then this is always `[]` (checked through
    // `sqlite_master`, per the plan, not a try/catch around a SELECT on a table that may not exist).
    comments: directRows('comments', projectId, warnings),
    files,
    files_missing,
    warnings,
  };
}
