/**
 * Restore a full JSON backup (`backup.service.ts#buildBackup`) as a brand-new project (T-3-05,
 * D-45). `previewRestore`/`applyRestore` follow the same stateless preview-then-apply, payload-hash
 * contract every Bloomreach import uses (D-22): `preview` never writes; `apply` re-hashes the
 * resent raw backup and 409s `PAYLOAD_CHANGED` on a mismatch.
 *
 * Restore never merges into an existing project (`applyRestore` always creates a new one) and
 * writes every table row with **direct SQL inserts** built from the *current* live table's own
 * column list (`backup.service.ts`'s `tableColumns`/`tableExists`) — this deliberately bypasses
 * every DAL module's own validation (unique-name checks, role/enum rules, etc.), since a backup's
 * rows already satisfied all of that against an identical schema when they were exported; the
 * point of restore is a faithful copy, not a second validation pass. Any column a row carries that
 * the live schema no longer has is dropped with a warning (`unknown columns become warnings`,
 * T-3-05 acceptance).
 *
 * Id remap (D-45): a fresh id is generated for every row that has its own `id` column (every
 * project-scoped table except the composite-key link tables `event_sources`/`event_properties`/
 * `property_bundle_items`, which have none), plus one for the new project itself (derived from
 * `deriveOldProjectId`, since the backup's own `project` row carries no id). Every row of every
 * table is then deep-walked — object keys and values, recursing into every parsed `*_json` column —
 * replacing any string that exactly equals an old id with its new id, or (for a compound string
 * like a `fingerprint` or an `event_property` `change_log.entity_id`, `"<event_id>:<property_id>"`)
 * doing a substring replace so a person's earlier finding acknowledgement (D-42) or an old
 * `change_log` row's grouping still resolves correctly after restore. File paths (`triggers_json`
 * image paths, `client_logo_path`) go through the same walk against a second map built from
 * `FileStore.put`'s actual new paths.
 *
 * `use_case_templates` are the one array not restored as new rows: instantiated use cases point at
 * the *global* library table by `code` (T-3-06, D-47), so a backup's embedded template is re-linked
 * — reused when an existing template with the same code has an equal definition, created when no
 * template with that code exists yet, and reused-with-a-warning when the code exists but the
 * definition differs (the existing definition wins; nothing here ever overwrites a template that
 * other projects might also reference).
 */
import { getDb } from '../db';
import { newId, nowIso, toJsonColumn } from '../db/util';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import type { UseCaseTemplateRow } from '../dal/use-case-template.dal';
import { recordChange } from '../dal/change-log.dal';
import { runWithActor, getActor } from '../context/actor';
import { getFileStore } from '../files/FileStore';
import { tableColumns, tableExists } from './backup.service';
import { runComparison } from './comparison.service';
import { parseBackupFile, PROJECT_SCOPED_TABLES, type BackupRow } from '../../domain/import/backup';
import { payloadHash } from '../../domain/diff/hash';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../../domain/enums';
import { BadRequestError, PayloadChangedError, ProjectKeyTakenError, ValidationError } from '../errors';
import type { ProjectRow } from '../dal/project.dal';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface RestorePreviewResult {
  counts: Record<string, number>;
  project: { name: string; key: string };
  warnings: string[];
  payload_hash: string;
}

export interface RestoreTarget {
  name: string;
  key: string;
  client_id: string;
}

export interface RestoreApplyResult {
  project: ProjectRow;
  counts: Record<string, number>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when `existing` (a live template) and `backupRow` (the embedded backup row) describe the same content. */
function templatesEqual(existing: UseCaseTemplateRow, backupRow: BackupRow): boolean {
  const norm = (v: unknown): string => JSON.stringify(v ?? null);
  return (
    existing.name === backupRow.name &&
    existing.type === backupRow.type &&
    (existing.description ?? null) === (backupRow.description ?? null) &&
    norm(existing.default_requirements_json) === norm(backupRow.default_requirements_json ?? []) &&
    (existing.narrative_template ?? null) === (backupRow.narrative_template ?? null) &&
    norm(existing.tags_json) === norm(backupRow.tags_json ?? null) &&
    norm(existing.flags_json) === norm(backupRow.flags_json ?? null)
  );
}

function unknownColumnWarnings(tables: Record<string, BackupRow[]>): string[] {
  const warnings: string[] = [];
  for (const table of ['use_case_templates', ...PROJECT_SCOPED_TABLES]) {
    if (!tableExists(table)) continue;
    const liveSet = new Set(tableColumns(table));
    const unknown = new Set<string>();
    for (const row of tables[table] ?? []) {
      for (const key of Object.keys(row)) {
        if (!liveSet.has(key)) unknown.add(key);
      }
    }
    if (unknown.size > 0) {
      warnings.push(
        `"${table}" had unknown column(s) not present in the current schema: ${Array.from(unknown).sort().join(', ')}; dropped.`
      );
    }
  }
  return warnings;
}

/** Preview-only: would restoring `templates` change any *existing* template's definition (T-3-05)? */
function templateDiffWarnings(templates: BackupRow[]): string[] {
  const warnings: string[] = [];
  const existingByCode = new Map(UseCaseTemplateDAL.listUseCaseTemplates().map((t) => [t.code, t]));
  for (const tpl of templates) {
    const code = typeof tpl.code === 'string' ? tpl.code : null;
    if (!code) continue;
    const existing = existingByCode.get(code);
    if (existing && !templatesEqual(existing, tpl)) {
      warnings.push(
        `Use case template "${code}" already exists with a different definition; restoring will keep the existing template and re-link use cases to it.`
      );
    }
  }
  return warnings;
}

function assertKnownFormat(parsed: { formatValid: boolean; versionValid: boolean; format: unknown; version: unknown }): void {
  if (!parsed.formatValid || !parsed.versionValid) {
    throw new BadRequestError(
      `Unsupported backup file: expected format "${BACKUP_FORMAT}" version ${BACKUP_VERSION}, got format ${JSON.stringify(
        parsed.format
      )} version ${JSON.stringify(parsed.version)}.`,
      'format'
    );
  }
}

/** Read-only preview (D-22): never writes anything, including no template creation. */
export function previewRestore(rawJson: unknown): RestorePreviewResult {
  const parsed = parseBackupFile(rawJson);
  assertKnownFormat(parsed);

  const warnings = [...parsed.warnings, ...unknownColumnWarnings(parsed.tables), ...templateDiffWarnings(parsed.tables.use_case_templates ?? [])];

  const counts: Record<string, number> = {};
  for (const table of PROJECT_SCOPED_TABLES) counts[table] = (parsed.tables[table] ?? []).length;
  counts.use_case_templates = (parsed.tables.use_case_templates ?? []).length;
  counts.files = parsed.files.length;

  return {
    counts,
    project: {
      name: typeof parsed.project.name === 'string' ? parsed.project.name : '',
      key: typeof parsed.project.key === 'string' ? parsed.project.key : '',
    },
    warnings,
    payload_hash: payloadHash(rawJson),
  };
}

/** The old project's id, derived from any row's `project_id` (the backup's own `project` object carries none, D-45). */
function deriveOldProjectId(tables: Record<string, BackupRow[]>): string | null {
  for (const table of PROJECT_SCOPED_TABLES) {
    for (const row of tables[table] ?? []) {
      if (typeof row.project_id === 'string' && row.project_id) return row.project_id;
    }
  }
  return null;
}

/** Re-links every embedded template by `code` (reuse equal, warn+reuse on a different definition, create missing); returns oldId -> resolvedId. */
function resolveUseCaseTemplates(templates: BackupRow[], warnings: string[]): Map<string, string> {
  const idMap = new Map<string, string>();
  const existingByCode = new Map(UseCaseTemplateDAL.listUseCaseTemplates().map((t) => [t.code, t]));
  for (const tpl of templates) {
    const code = typeof tpl.code === 'string' ? tpl.code : null;
    const oldId = typeof tpl.id === 'string' ? tpl.id : null;
    if (!code || !oldId) continue;
    const existing = existingByCode.get(code);
    if (existing) {
      if (!templatesEqual(existing, tpl)) {
        warnings.push(
          `Use case template "${code}" already exists with a different definition; the existing template was kept and use cases were re-linked to it.`
        );
      }
      idMap.set(oldId, existing.id);
      continue;
    }
    const created = UseCaseTemplateDAL.createUseCaseTemplate({
      code,
      name: typeof tpl.name === 'string' ? tpl.name : code,
      type: typeof tpl.type === 'string' ? tpl.type : 'marketing',
      description: typeof tpl.description === 'string' ? tpl.description : null,
      default_requirements_json: Array.isArray(tpl.default_requirements_json) ? tpl.default_requirements_json : [],
      narrative_template: typeof tpl.narrative_template === 'string' ? tpl.narrative_template : null,
      tags_json: isPlainObject(tpl.tags_json) ? tpl.tags_json : null,
      flags_json: isPlainObject(tpl.flags_json) ? tpl.flags_json : null,
    });
    idMap.set(oldId, created.id);
    existingByCode.set(code, created);
  }
  return idMap;
}

/** Every string of at least this length is worth a substring scan (shortest id-bearing compound value, e.g. `a:b` with 2 short ids, is still far longer in practice — real ids are UUIDs). Short strings (`"true"`, a two-letter code, ...) are never worth the scan. */
const MIN_SCAN_LENGTH = 20;

function remapString(value: string, idMap: Map<string, string>, pathMap: Map<string, string>): string {
  const exact = idMap.get(value) ?? pathMap.get(value);
  if (exact !== undefined) return exact;
  if (value.length < MIN_SCAN_LENGTH) return value;
  let result = value;
  for (const [oldId, newIdValue] of idMap) {
    if (result.includes(oldId)) result = result.split(oldId).join(newIdValue);
  }
  return result;
}

function deepRemapValue(value: unknown, idMap: Map<string, string>, pathMap: Map<string, string>): unknown {
  if (typeof value === 'string') return remapString(value, idMap, pathMap);
  if (Array.isArray(value)) return value.map((v) => deepRemapValue(v, idMap, pathMap));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      const newKey = idMap.get(key) ?? key;
      out[newKey] = deepRemapValue(v, idMap, pathMap);
    }
    return out;
  }
  return value;
}

function deepRemapRow(row: BackupRow, idMap: Map<string, string>, pathMap: Map<string, string>): BackupRow {
  const out: BackupRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = deepRemapValue(value, idMap, pathMap);
  }
  return out;
}

/** Inserts `row` into `table` using only the live table's own columns (extra keys dropped, tracked in `unknownColsSeen`); `*_json`-suffixed columns are re-stringified. */
function insertGenericRow(
  table: string,
  row: BackupRow,
  unknownColsSeen: Map<string, Set<string>>
): void {
  const liveCols = tableColumns(table);
  const liveSet = new Set(liveCols);
  for (const key of Object.keys(row)) {
    if (!liveSet.has(key)) {
      const seen = unknownColsSeen.get(table) ?? new Set<string>();
      seen.add(key);
      unknownColsSeen.set(table, seen);
    }
  }
  const cols = liveCols.filter((c) => Object.prototype.hasOwnProperty.call(row, c));
  const colList = cols.join(', ');
  const placeholders = cols.map((c) => `@${c}`).join(', ');
  const params: Record<string, unknown> = {};
  for (const c of cols) {
    const v = row[c];
    params[c] = c.endsWith('_json') ? toJsonColumn(v) : v;
  }
  getDb()
    .prepare(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`)
    .run(params);
}

/** Writes every embedded file through `FileStore.put` under `newProjectId`; returns old path -> new path. Never throws: a file that fails to write is dropped with a warning (mirrors `buildBackup`'s own "never a thrown error" rule for files). */
async function restoreFiles(
  newProjectId: string,
  files: { path: string; mime: string; base64: string }[],
  warnings: string[]
): Promise<Map<string, string>> {
  const pathMap = new Map<string, string>();
  const store = getFileStore();
  for (const file of files) {
    try {
      const segments = file.path.split('/').filter(Boolean);
      const kind = segments.length >= 2 ? segments[segments.length - 2] : 'restored';
      const filename = segments[segments.length - 1] || 'file';
      const buffer = Buffer.from(file.base64, 'base64');
      const stored = await store.put(newProjectId, kind, filename, buffer, file.mime);
      pathMap.set(file.path, stored.path);
    } catch {
      warnings.push(`Could not restore file "${file.path}"; it was dropped.`);
    }
  }
  return pathMap;
}

/**
 * Creates a brand-new project from `rawJson` under `target.client_id`, with `target.name`/`key`.
 * Never merges into an existing project. 409 `PAYLOAD_CHANGED` on a stale hash, 409
 * `PROJECT_KEY_TAKEN` when `target.key` is already used by another non-deleted project.
 */
export async function applyRestore(
  rawJson: unknown,
  expectedHash: string,
  target: RestoreTarget
): Promise<RestoreApplyResult> {
  if (payloadHash(rawJson) !== expectedHash) {
    throw new PayloadChangedError('The payload changed since preview; re-run preview before applying.');
  }
  const parsed = parseBackupFile(rawJson);
  assertKnownFormat(parsed);

  if (!target.client_id) throw new ValidationError('client_id is required.', 'client_id');
  ClientDAL.getClientOrThrow(target.client_id);

  const name = target.name?.trim() ?? '';
  const key = target.key?.trim() ?? '';
  if (!name) throw new ValidationError('Project name is required.', 'name');
  if (!key || !SLUG_RE.test(key)) {
    throw new ValidationError('Project key must be a URL-safe slug (lowercase letters, digits, hyphens).', 'key');
  }
  const clash = getDb().prepare('SELECT id FROM projects WHERE key = ? AND deleted_at IS NULL').get(key);
  if (clash) throw new ProjectKeyTakenError(`A project with key "${key}" already exists.`);

  const warnings = [...parsed.warnings];
  const newProjectId = newId();

  // Files are written through the (async) FileStore before the (synchronous) db.transaction below.
  const pathMap = await restoreFiles(newProjectId, parsed.files, warnings);

  const batchId = newId();
  const counts: Record<string, number> = {};
  const unknownColsSeen = new Map<string, Set<string>>();
  const actor = getActor();

  const db = getDb();
  const run = db.transaction(() => {
    runWithActor({ actor: actor.actor, source: 'restore', batch_id: batchId }, () => {
      const idMap = new Map<string, string>();
      for (const table of PROJECT_SCOPED_TABLES) {
        for (const row of parsed.tables[table] ?? []) {
          if (typeof row.id === 'string') idMap.set(row.id, newId());
        }
      }

      const templateIdMap = resolveUseCaseTemplates(parsed.tables.use_case_templates ?? [], warnings);
      for (const [oldId, resolvedId] of templateIdMap) idMap.set(oldId, resolvedId);

      const oldProjectId = deriveOldProjectId(parsed.tables);
      if (oldProjectId) idMap.set(oldProjectId, newProjectId);

      // Project row: every backed-up settings column carried over, id/client_id/name/key/timestamps
      // overwritten, share_token/share_access always null (never restored, T-3-04's own rule).
      const remappedProject = deepRemapRow(parsed.project, idMap, pathMap);
      const now = nowIso();
      Object.assign(remappedProject, {
        id: newProjectId,
        client_id: target.client_id,
        name,
        key,
        share_token: null,
        share_access: null,
        created_at: now,
        updated_at: now,
      });
      insertGenericRow('projects', remappedProject, unknownColsSeen);

      for (const table of PROJECT_SCOPED_TABLES) {
        const rows = parsed.tables[table] ?? [];
        for (const raw of rows) {
          // `project_id` (on the tables that have the column at all -- the composite-key link
          // tables `event_sources`/`event_properties`/`property_bundle_items` do not) is rewritten
          // by the generic id remap below via `oldProjectId -> newProjectId` in `idMap`, same as
          // every other foreign key; it is never set here directly, so a table with no
          // `project_id` column never gets one injected (which `insertGenericRow`'s unknown-column
          // tracking would otherwise misreport as a dropped column on every such row).
          const remapped = deepRemapRow(raw, idMap, pathMap);
          insertGenericRow(table, remapped, unknownColsSeen);
        }
        counts[table] = rows.length;
      }
      counts.use_case_templates = (parsed.tables.use_case_templates ?? []).length;
      counts.files = parsed.files.length;

      for (const [table, cols] of unknownColsSeen) {
        warnings.push(
          `"${table}" had unknown column(s) not present in the current schema: ${Array.from(cols).sort().join(', ')}; dropped.`
        );
      }

      recordChange({
        projectId: newProjectId,
        entityType: 'project',
        entityId: newProjectId,
        entityLabel: name,
        action: 'restore',
        before: null,
        after: { counts: JSON.stringify(counts) },
      });
    });
  });
  run();

  runComparison(newProjectId);

  return { project: ProjectDAL.getProjectOrThrow(newProjectId), counts };
}
