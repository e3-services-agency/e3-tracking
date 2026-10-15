/**
 * Parser for a full JSON project backup (T-3-05, D-45, restoring `backup.service.ts#buildBackup`'s
 * output as a new project). Pure, strict-but-forgiving like every other parser in this directory:
 * a malformed piece becomes a warning and is dropped, never a thrown exception, so
 * `backupRestore.service.ts` can always show a preview. The one exception is the top-level
 * `format`/`version` check, which the *service* turns into a 400 (this module only reports whether
 * they matched, `formatValid`/`versionValid`) — a wrong format is not "a piece of the file", it
 * means the whole file cannot be restored at all.
 *
 * Schema-aware checks (does a table exist in the live database, does a row carry a column the
 * live schema no longer has) are deliberately *not* done here — this module has no `../db` import
 * (domain-model skill: pure, engine-agnostic) — `backupRestore.service.ts` does those against the
 * live schema via `backup.service.ts`'s exported `tableColumns`/`tableExists`.
 */
import { BACKUP_FORMAT, BACKUP_VERSION } from '../enums';

export type BackupRow = Record<string, unknown>;

export interface BackupFileEntry {
  path: string;
  mime: string;
  base64: string;
}

/**
 * Every array `buildBackup` produces, in FK-safe insert order (parents before children): a
 * `use_case_templates` row is re-linked by `code`, never inserted as a fresh row with its own
 * project scope (T-3-05 plan), so it sits outside `PROJECT_SCOPED_TABLES` even though it is parsed
 * the same way as every other array here.
 */
export const PROJECT_SCOPED_TABLES = [
  'sources',
  'properties',
  // D-58 (T-4-00): must insert before `event_properties`, which references it (`definition_id`).
  'property_definitions',
  'events',
  'event_sources',
  'event_properties',
  'variants',
  'standard_event_mappings',
  'identifiers',
  'identity_rules',
  'catalogs',
  'catalog_fields',
  'consent_categories',
  'use_cases',
  'requirements',
  'rules',
  'property_bundles',
  'property_bundle_items',
  'qa_runs',
  'observations',
  'findings',
  'qa_sequence_counters',
  'qa_reports',
  'qa_report_findings',
  'change_log',
  'comments',
  'comment_reactions',
  'comment_attachments',
  // T-5-45 (D-88): listed people of the share audience. Sessions stay out (operational credentials).
  'share_members',
] as const;

export type ProjectScopedTable = (typeof PROJECT_SCOPED_TABLES)[number];

const TABLE_KEYS = ['use_case_templates', ...PROJECT_SCOPED_TABLES] as const;

export interface ParsedBackupFile {
  formatValid: boolean;
  versionValid: boolean;
  format: unknown;
  version: unknown;
  /** The embedded project row verbatim (no `id`/`client_id`, per `buildBackup`). */
  project: BackupRow;
  /** Every table array keyed by name, including `use_case_templates`. Always present, even `[]`. */
  tables: Record<string, BackupRow[]>;
  files: BackupFileEntry[];
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses one declared table array: a non-array becomes `[]` with a warning; a non-object entry is dropped with a warning. */
function parseTableArray(key: string, raw: unknown, warnings: string[]): BackupRow[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push(`"${key}" is not an array; treated as empty.`);
    return [];
  }
  const rows: BackupRow[] = [];
  raw.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      warnings.push(`"${key}[${index}]" is not an object; dropped.`);
      return;
    }
    rows.push(entry);
  });
  return rows;
}

function parseFiles(raw: unknown, warnings: string[]): BackupFileEntry[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push('"files" is not an array; treated as empty.');
    return [];
  }
  const files: BackupFileEntry[] = [];
  raw.forEach((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.path !== 'string' || typeof entry.base64 !== 'string') {
      warnings.push(`"files[${index}]" is missing "path" or "base64"; dropped.`);
      return;
    }
    files.push({
      path: entry.path,
      mime: typeof entry.mime === 'string' ? entry.mime : 'application/octet-stream',
      base64: entry.base64,
    });
  });
  return files;
}

/** Validates the envelope and coerces every documented array; never throws. */
export function parseBackupFile(json: unknown): ParsedBackupFile {
  const warnings: string[] = [];

  if (!isPlainObject(json)) {
    return {
      formatValid: false,
      versionValid: false,
      format: undefined,
      version: undefined,
      project: {},
      tables: Object.fromEntries(TABLE_KEYS.map((k) => [k, []])),
      files: [],
      warnings: ['Backup JSON must be an object.'],
    };
  }

  const format = json.format;
  const version = json.version;
  const formatValid = format === BACKUP_FORMAT;
  const versionValid = version === BACKUP_VERSION;

  const project = isPlainObject(json.project) ? json.project : {};
  if (json.project !== undefined && !isPlainObject(json.project)) {
    warnings.push('"project" is not an object; treated as empty.');
  }

  const tables: Record<string, BackupRow[]> = {};
  for (const key of TABLE_KEYS) {
    tables[key] = parseTableArray(key, json[key], warnings);
  }

  const files = parseFiles(json.files, warnings);
  const filesMissing = Array.isArray(json.files_missing)
    ? json.files_missing.filter((p): p is string => typeof p === 'string')
    : [];
  for (const missing of filesMissing) {
    warnings.push(`Referenced file "${missing}" was already missing when this project was backed up.`);
  }

  return { formatValid, versionValid, format, version, project, tables, files, warnings };
}
