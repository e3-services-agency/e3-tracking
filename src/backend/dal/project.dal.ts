/**
 * Project Data Access Layer (replaces the pre-D-15 scope DAL, D-15). The old scope settings table
 * folded into `projects` columns (D-15); `default_expiration_json` and the D-27 Bloomreach identifiers live
 * on the project row directly.
 */
import { randomBytes } from 'node:crypto';
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, mapWriteError } from '../db/util';
import {
  ConflictError,
  NotFoundError,
  SandboxShareRefusedError,
  StandardEventExistsError,
  ValidationError,
} from '../errors';
import { getClientOrThrow, type ClientRow } from './client.dal';
import { validateExpirationJson } from './validators';
import { STANDARD_EVENTS } from '../../domain/bloomreach';
import { SHARE_ACCESS, type ShareAccess } from '../../domain/enums';
import * as ChangeLogDAL from './change-log.dal';
import { payloadHash } from '../../domain/diff/hash';

/** `fields` entries must be snake_case: lowercase letters/digits, single underscores, no leading digit. */
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export interface ProjectRow {
  id: string;
  client_id: string;
  name: string;
  key: string;
  client_name: string | null;
  description: string | null;
  client_primary_color: string | null;
  client_logo_path: string | null;
  bloomreach_api_customer_id_key: string | null;
  bloomreach_project_token: string | null;
  bloomreach_api_base_url: string | null;
  bloomreach_project_url: string | null;
  default_expiration_json: unknown;
  standard_event_additions_json: unknown;
  consent_key_additions_json: unknown;
  /**
   * Bloomreach data-mapping fields with no dedicated columns, kept verbatim for round-trip export
   * (T-1-08, PLAN "Import / export contracts" > Data mapping point 7): `{_id, catalogs,
   * custom_events}` as parsed from the last imported `data-mapping.json`.
   */
  bloomreach_mapping_meta_json: unknown;
  /**
   * Data Manager per-format defaults (T-2-02, D-28, D-35): `{customers: {are_all_used,
   * default_private, group_order[]}, events: {default_forbidden, default_private, group_order[]}}`.
   */
  data_manager_meta_json: unknown;
  /** Last applied `data-manager-customers.json` payload verbatim plus `applied_at` (D-35 comparison-4 snapshot). */
  data_manager_customers_json: unknown;
  /** Last applied `data-manager-events.json` payload verbatim plus `applied_at` (D-35 comparison-4 snapshot). */
  data_manager_events_json: unknown;
  share_token: string | null;
  share_access: string | null;
  /** When the current `share_token` was created or last rotated (D-48, T-4-01); `null` when no
   * share link has ever been generated, or after a revoke clears all three share columns. */
  share_created_at: string | null;
  /** D-30 money tolerance (T-2-06): percent with an absolute floor, applied to every
   * `tolerance_mode = 'money'` rule (`src/domain/rules/evaluate.ts`'s `resolveTolerance`). */
  money_tolerance_percent: number;
  money_tolerance_floor: number;
  /** T-3-10 (D-57): optional free-text industry, used as the templates page's default facet
   * filter (`LIBRARY_INDUSTRIES` is a suggested vocabulary, not enforced here -- a client's
   * industry is not limited to the three seed values, same reasoning as D-57's tag values). */
  industry: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectWithClient extends ProjectRow {
  client: ClientRow | null;
}

type ProjectDbRow = Omit<
  ProjectRow,
  | 'default_expiration_json'
  | 'standard_event_additions_json'
  | 'consent_key_additions_json'
  | 'bloomreach_mapping_meta_json'
  | 'data_manager_meta_json'
  | 'data_manager_customers_json'
  | 'data_manager_events_json'
>;

function mapProjectRow(row: ProjectDbRow): ProjectRow {
  return {
    ...row,
    default_expiration_json: parseJsonColumn(
      (row as unknown as Record<string, unknown>).default_expiration_json,
      null
    ),
    standard_event_additions_json: parseJsonColumn(
      (row as unknown as Record<string, unknown>).standard_event_additions_json,
      []
    ),
    consent_key_additions_json: parseJsonColumn(
      (row as unknown as Record<string, unknown>).consent_key_additions_json,
      []
    ),
    bloomreach_mapping_meta_json: parseJsonColumn(
      (row as unknown as Record<string, unknown>).bloomreach_mapping_meta_json,
      null
    ),
    data_manager_meta_json: parseJsonColumn(
      (row as unknown as Record<string, unknown>).data_manager_meta_json,
      null
    ),
    data_manager_customers_json: parseJsonColumn(
      (row as unknown as Record<string, unknown>).data_manager_customers_json,
      null
    ),
    data_manager_events_json: parseJsonColumn(
      (row as unknown as Record<string, unknown>).data_manager_events_json,
      null
    ),
  };
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function listProjects(): ProjectWithClient[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY name')
    .all() as ProjectDbRow[];
  const clients = new Map(
    (db.prepare('SELECT * FROM clients').all() as ClientRow[]).map((c) => [c.id, c])
  );
  return rows.map((row) => ({ ...mapProjectRow(row), client: clients.get(row.client_id) ?? null }));
}

export function getProjectById(id: string): ProjectRow | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(id) as ProjectDbRow | undefined;
  return row ? mapProjectRow(row) : null;
}

export function getProjectOrThrow(id: string): ProjectRow {
  const row = getProjectById(id);
  if (!row) throw new NotFoundError('Project not found.', 'project');
  return row;
}

export function getProjectWithClient(id: string): ProjectWithClient {
  const project = getProjectOrThrow(id);
  const client = getClientOrThrow(project.client_id);
  return { ...project, client };
}

export interface CreateProjectInput {
  client_id: string;
  key: string;
  name: string;
  description?: string | null;
  client_primary_color?: string | null;
  bloomreach_api_customer_id_key?: string | null;
  bloomreach_project_token?: string | null;
  bloomreach_api_base_url?: string | null;
  bloomreach_project_url?: string | null;
  default_expiration_json?: unknown;
}

export function createProject(input: CreateProjectInput): ProjectRow {
  const key = input.key.trim();
  const name = input.name.trim();
  if (!key || !SLUG_RE.test(key)) {
    throw new ValidationError('Project key must be a URL-safe slug (lowercase letters, digits, hyphens).', 'key');
  }
  if (!name) throw new ValidationError('Project name is required.', 'name');
  validateExpirationJson(input.default_expiration_json, 'default_expiration_json');

  // Validates the client exists (throws NotFoundError otherwise).
  getClientOrThrow(input.client_id);

  const db = getDb();
  // Soft-deleted projects don't block key reuse (fix round finding #8); the UNIQUE index on
  // `projects.key` is partial on `deleted_at IS NULL` (0003_unique_soft_delete.sql), so this
  // pre-check and the constraint agree.
  const clash = db.prepare('SELECT id FROM projects WHERE key = ? AND deleted_at IS NULL').get(key);
  if (clash) throw new ConflictError(`A project with key "${key}" already exists.`);

  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO projects (
        id, client_id, name, key, description, client_primary_color, client_logo_path,
        bloomreach_api_customer_id_key, bloomreach_project_token, bloomreach_api_base_url,
        bloomreach_project_url, default_expiration_json, created_at, updated_at
      ) VALUES (
        @id, @client_id, @name, @key, @description, @client_primary_color, NULL,
        @bloomreach_api_customer_id_key, @bloomreach_project_token, @bloomreach_api_base_url,
        @bloomreach_project_url, @default_expiration_json, @created_at, @updated_at
      )`
    ).run({
      id,
      client_id: input.client_id,
      name,
      key,
      description: input.description?.trim() || null,
      client_primary_color: input.client_primary_color?.trim() || null,
      bloomreach_api_customer_id_key: input.bloomreach_api_customer_id_key?.trim() || null,
      bloomreach_project_token: input.bloomreach_project_token?.trim() || null,
      bloomreach_api_base_url: input.bloomreach_api_base_url?.trim() || null,
      bloomreach_project_url: input.bloomreach_project_url?.trim() || null,
      default_expiration_json: toJsonColumn(input.default_expiration_json ?? null),
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(err, `A project with key "${key}" already exists.`, `Failed to create project: ${(err as Error).message}`);
  }
  return getProjectOrThrow(id);
}

export interface UpdateProjectInput {
  name?: string;
  key?: string;
  client_id?: string;
  description?: string | null;
  client_primary_color?: string | null;
  client_logo_path?: string | null;
  bloomreach_api_customer_id_key?: string | null;
  bloomreach_project_token?: string | null;
  bloomreach_api_base_url?: string | null;
  bloomreach_project_url?: string | null;
  default_expiration_json?: unknown;
  /**
   * Project additions to the standard consent key seed list (D-26, T-1-06 delta): the "add
   * standard consent key" form on the Consent categories page PATCHes the full array here.
   */
  consent_key_additions_json?: unknown;
  /**
   * Project additions to the standard event seed list (D-26, T-1-05 delta): the "add standard
   * event" form on the Standard events page PATCHes the full array here, `[{key, fields}]`.
   */
  standard_event_additions_json?: unknown;
  /** `{_id, catalogs, custom_events}` verbatim from the last imported data-mapping.json (T-1-08). */
  bloomreach_mapping_meta_json?: unknown;
  /** D-30 money tolerance (T-2-06): percent (0-100) with a non-negative absolute floor. */
  money_tolerance_percent?: number;
  money_tolerance_floor?: number;
  /** Data Manager per-format defaults, written by the Data Manager import planners (T-2-02). */
  data_manager_meta_json?: unknown;
  /** Last applied `data-manager-customers.json` verbatim plus `applied_at` (T-2-02, D-35). */
  data_manager_customers_json?: unknown;
  /** Last applied `data-manager-events.json` verbatim plus `applied_at` (T-2-02/T-2-03, D-35). */
  data_manager_events_json?: unknown;
  /** T-3-10 (D-57): optional industry, used as the templates page's default facet filter. */
  industry?: string | null;
}

/** Range validation for the D-30 money tolerance fields (T-2-06 plan: "range validation"). */
function validateMoneyTolerance(percent: number | undefined, floor: number | undefined): void {
  if (percent !== undefined) {
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new ValidationError('money_tolerance_percent must be a number between 0 and 100.', 'money_tolerance_percent');
    }
  }
  if (floor !== undefined) {
    if (typeof floor !== 'number' || !Number.isFinite(floor) || floor < 0) {
      throw new ValidationError('money_tolerance_floor must be a non-negative number.', 'money_tolerance_floor');
    }
  }
}

/**
 * `standard_event_additions_json` must be `[{key, fields: string[]}]` (fix round WARNING 3):
 * a `key` colliding with a `bloomreach.ts` seed key or another addition in the same array is now
 * a 400 `STANDARD_EVENT_EXISTS`, not a silent drop (previously stored and then invisible —
 * `mergeStandardEvents` prefers the seed, so a seed-colliding addition round-tripped through the
 * API with no error and the UI's add form appeared to do nothing). `fields` must be an array of
 * snake_case strings, but may be empty (T-1-08 fix round ERROR 1: the data-mapping importer must
 * be able to record an unknown standard event that names no fields of its own, e.g. only an
 * `event` block with an empty filter — D-26 says the key is added unconditionally, not "only if it
 * has fields"); a missing/non-array `fields`, or an entry that is not a snake_case string, is
 * still a 400 instead of silently becoming `[]`.
 */
function normalizeStandardEventAdditions(value: unknown): { key: string; fields: string[] }[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('standard_event_additions_json must be an array.', 'standard_event_additions_json');
  }
  const seedKeys = new Set(STANDARD_EVENTS.map((e) => e.key));
  const seenKeys = new Set<string>();
  const result: { key: string; fields: string[] }[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ValidationError(
        'Each standard event addition needs a "key" and a "fields" array.',
        'standard_event_additions_json'
      );
    }
    const row = raw as Record<string, unknown>;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    if (!key) {
      throw new ValidationError(
        'Each standard event addition needs a non-empty "key".',
        'standard_event_additions_json'
      );
    }
    if (!SNAKE_CASE_RE.test(key)) {
      // LOW 3 (second fix round): `key` becomes a Bloomreach data-mapping JSON key and a URL
      // segment of /standard-event-mappings/:standardEvent, so it must follow the same snake_case
      // rule already enforced on `fields` below.
      throw new ValidationError(
        `Standard event addition "key" must be snake_case: "${key}".`,
        'standard_event_additions_json'
      );
    }
    if (seedKeys.has(key)) {
      throw new StandardEventExistsError(
        `"${key}" is already a standard Bloomreach event; choose a different key.`,
        'standard_event_additions_json'
      );
    }
    if (seenKeys.has(key)) {
      throw new StandardEventExistsError(
        `"${key}" is already in this project's standard event additions.`,
        'standard_event_additions_json'
      );
    }
    seenKeys.add(key);

    if (!Array.isArray(row.fields)) {
      throw new ValidationError(
        `Standard event "${key}" needs a "fields" array (may be empty).`,
        'standard_event_additions_json'
      );
    }
    const seenFields = new Set<string>();
    const fields: string[] = [];
    for (const field of row.fields) {
      const trimmed = typeof field === 'string' ? field.trim() : '';
      if (!trimmed || !SNAKE_CASE_RE.test(trimmed)) {
        throw new ValidationError(
          `Standard event "${key}" has an invalid field name (must be snake_case): "${String(field)}".`,
          'standard_event_additions_json'
        );
      }
      if (seenFields.has(trimmed)) continue;
      seenFields.add(trimmed);
      fields.push(trimmed);
    }
    result.push({ key, fields });
  }
  return result;
}

/** `consent_key_additions_json` must be an array of non-blank strings, trimmed and de-duplicated. */
function normalizeStringListColumn(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array of strings.`, field);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new ValidationError(`${field} must be an array of strings.`, field);
    }
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * `change_log` snapshot for a `project` row (T-3-02 pre-QA fix round, WARNING 1): the raw
 * `ProjectRow` is unusable as-is for a history diff -- `data_manager_events_json`/
 * `data_manager_customers_json` (the whole verbatim Data Manager payload, D-35) run to hundreds of
 * KB, so a Data Manager apply's `updateProject` call (the snapshot step) wrote a `diff_json` the
 * same size as the fixture, twice (before and after), on *every* apply including a no-op re-apply
 * where nothing else changed. Replaced here with a short content hash (`payloadHash`, the same
 * stable hash `import/<format>/preview`'s `payload_hash` uses) per JSON blob, so a real change to
 * the underlying Data Manager payload still shows as one small diff line
 * (`data_manager_events_hash: <old> -> <new>`) instead of ballooning the row. `share_token` and
 * `bloomreach_project_token` are dropped entirely (never diffed, defensively -- a token rotation
 * should not put the token value itself in a history row anyone with History-page access can read).
 */
function buildProjectDiffSnapshot(row: ProjectRow): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { ...row };
  delete snapshot.share_token;
  delete snapshot.bloomreach_project_token;
  delete snapshot.data_manager_events_json;
  delete snapshot.data_manager_customers_json;
  delete snapshot.bloomreach_mapping_meta_json;
  snapshot.data_manager_events_hash = row.data_manager_events_json ? payloadHash(row.data_manager_events_json) : null;
  snapshot.data_manager_customers_hash = row.data_manager_customers_json
    ? payloadHash(row.data_manager_customers_json)
    : null;
  snapshot.bloomreach_mapping_meta_hash = row.bloomreach_mapping_meta_json
    ? payloadHash(row.bloomreach_mapping_meta_json)
    : null;
  return snapshot;
}

export function updateProject(id: string, updates: UpdateProjectInput): ProjectRow {
  const before = getProjectOrThrow(id);
  const db = getDb();

  if (updates.key !== undefined) {
    const key = updates.key.trim();
    if (!key || !SLUG_RE.test(key)) {
      throw new ValidationError('Project key must be a URL-safe slug (lowercase letters, digits, hyphens).', 'key');
    }
    const clash = db
      .prepare('SELECT id FROM projects WHERE key = ? AND id != ? AND deleted_at IS NULL')
      .get(key, id);
    if (clash) throw new ConflictError(`A project with key "${key}" already exists.`);
  }
  if (updates.name !== undefined && !updates.name.trim()) {
    throw new ValidationError('Project name is required.', 'name');
  }
  if (updates.client_id !== undefined) {
    getClientOrThrow(updates.client_id);
  }
  validateExpirationJson(updates.default_expiration_json, 'default_expiration_json');
  validateMoneyTolerance(updates.money_tolerance_percent, updates.money_tolerance_floor);
  // Fix round LOW 4 (reviewer, 2026-09-28 03:15): `industry` is `string | null` per its type, but
  // nothing enforced that at the API boundary -- `PATCH {industry: 42}` reached `updates.industry
  // ?.trim()` below and threw a raw `updates.industry?.trim is not a function` (500), not a 400.
  if (updates.industry !== undefined && updates.industry !== null && typeof updates.industry !== 'string') {
    throw new ValidationError('industry must be a string or null.', 'industry');
  }

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.key !== undefined) patch.key = updates.key.trim();
  if (updates.client_id !== undefined) patch.client_id = updates.client_id;
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.client_primary_color !== undefined) {
    patch.client_primary_color = updates.client_primary_color?.trim() || null;
  }
  if (updates.client_logo_path !== undefined) patch.client_logo_path = updates.client_logo_path;
  if (updates.bloomreach_api_customer_id_key !== undefined) {
    patch.bloomreach_api_customer_id_key = updates.bloomreach_api_customer_id_key?.trim() || null;
  }
  if (updates.bloomreach_project_token !== undefined) {
    patch.bloomreach_project_token = updates.bloomreach_project_token?.trim() || null;
  }
  if (updates.bloomreach_api_base_url !== undefined) {
    patch.bloomreach_api_base_url = updates.bloomreach_api_base_url?.trim() || null;
  }
  if (updates.bloomreach_project_url !== undefined) {
    patch.bloomreach_project_url = updates.bloomreach_project_url?.trim() || null;
  }
  if (updates.default_expiration_json !== undefined) {
    patch.default_expiration_json = toJsonColumn(updates.default_expiration_json);
  }
  if (updates.consent_key_additions_json !== undefined) {
    patch.consent_key_additions_json = toJsonColumn(
      normalizeStringListColumn(updates.consent_key_additions_json, 'consent_key_additions_json')
    );
  }
  if (updates.standard_event_additions_json !== undefined) {
    patch.standard_event_additions_json = toJsonColumn(
      normalizeStandardEventAdditions(updates.standard_event_additions_json)
    );
  }
  if (updates.bloomreach_mapping_meta_json !== undefined) {
    patch.bloomreach_mapping_meta_json = toJsonColumn(updates.bloomreach_mapping_meta_json);
  }
  if (updates.money_tolerance_percent !== undefined) patch.money_tolerance_percent = updates.money_tolerance_percent;
  if (updates.money_tolerance_floor !== undefined) patch.money_tolerance_floor = updates.money_tolerance_floor;
  if (updates.data_manager_meta_json !== undefined) {
    patch.data_manager_meta_json = toJsonColumn(updates.data_manager_meta_json);
  }
  if (updates.data_manager_customers_json !== undefined) {
    patch.data_manager_customers_json = toJsonColumn(updates.data_manager_customers_json);
  }
  if (updates.data_manager_events_json !== undefined) {
    patch.data_manager_events_json = toJsonColumn(updates.data_manager_events_json);
  }
  if (updates.industry !== undefined) patch.industry = updates.industry?.trim() || null;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  const run = db.transaction(() => {
    try {
      db.prepare(`UPDATE projects SET ${setClause} WHERE id = @id`).run({ ...patch, id });
    } catch (err) {
      mapWriteError(
        err,
        `A project with key "${String(patch.key ?? '')}" already exists.`,
        `Failed to update project: ${(err as Error).message}`
      );
    }
    const after = getProjectOrThrow(id);
    ChangeLogDAL.recordChange({
      projectId: id,
      entityType: 'project',
      entityId: id,
      entityLabel: after.name,
      action: 'update',
      before: buildProjectDiffSnapshot(before),
      after: buildProjectDiffSnapshot(after),
    });
  });
  run();
  return getProjectOrThrow(id);
}

// ----- Share links (D-48, T-4-01) -----

/**
 * D-60: a bundled sandbox project carries `is_sandbox: true` in `settings_json`. That column does
 * not exist yet (added by T-4-09); read defensively through the raw row so this check is a no-op
 * today and starts working the moment T-4-09's migration lands, with no change needed here --
 * `SELECT *` simply won't have the key until then, and a missing key reads as "not a sandbox".
 */
function isSandboxProject(row: ProjectRow): boolean {
  const raw = (row as unknown as Record<string, unknown>).settings_json;
  if (!raw) return false;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return !!(parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).is_sandbox === true);
  } catch {
    return false;
  }
}

function assertShareAccess(access: unknown): asserts access is ShareAccess {
  if (typeof access !== 'string' || !(SHARE_ACCESS as readonly string[]).includes(access)) {
    throw new ValidationError(
      `access must be one of: ${SHARE_ACCESS.join(', ')}.`,
      'access'
    );
  }
}

/** 32 random bytes, base64url (D-48): 43 characters, URL-safe (`[A-Za-z0-9_-]`, no padding). */
function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Creates the project's first share link, or rotates the existing one (D-48: "rotate on
 * regenerate" -- one token per project, the old one stops resolving immediately). Refuses on a
 * sandbox project unless `force` (D-60). Logged as a project `update` with the token excluded from
 * the diff (`buildProjectDiffSnapshot`, D-44).
 */
export function createOrRotateShare(id: string, access: unknown, options: { force?: boolean } = {}): ProjectRow {
  assertShareAccess(access);
  const before = getProjectOrThrow(id);
  if (isSandboxProject(before) && !options.force) {
    throw new SandboxShareRefusedError(
      'This is a sandbox project; pass force=true to create a share link on it anyway.'
    );
  }
  const db = getDb();
  const token = generateShareToken();
  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare(
      'UPDATE projects SET share_token = ?, share_access = ?, share_created_at = ?, updated_at = ? WHERE id = ?'
    ).run(token, access, now, now, id);
    const after = getProjectOrThrow(id);
    ChangeLogDAL.recordChange({
      projectId: id,
      entityType: 'project',
      entityId: id,
      entityLabel: after.name,
      action: 'update',
      before: buildProjectDiffSnapshot(before),
      after: buildProjectDiffSnapshot(after),
    });
  });
  run();
  return getProjectOrThrow(id);
}

/** Changes the access level (`read`/`comment`) of an already-active share link, without rotating the token. */
export function updateShareAccess(id: string, access: unknown): ProjectRow {
  assertShareAccess(access);
  const before = getProjectOrThrow(id);
  if (!before.share_token) {
    throw new NotFoundError('No active share link for this project.', 'share');
  }
  const db = getDb();
  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare('UPDATE projects SET share_access = ?, updated_at = ? WHERE id = ?').run(access, now, id);
    const after = getProjectOrThrow(id);
    ChangeLogDAL.recordChange({
      projectId: id,
      entityType: 'project',
      entityId: id,
      entityLabel: after.name,
      action: 'update',
      before: buildProjectDiffSnapshot(before),
      after: buildProjectDiffSnapshot(after),
    });
  });
  run();
  return getProjectOrThrow(id);
}

/** Revokes the current share link: the token, access and created-at columns are all cleared so the
 * old link 404s immediately (`getProjectByShareToken` no longer finds it). */
export function revokeShare(id: string): ProjectRow {
  const before = getProjectOrThrow(id);
  const db = getDb();
  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare(
      'UPDATE projects SET share_token = NULL, share_access = NULL, share_created_at = NULL, updated_at = ? WHERE id = ?'
    ).run(now, id);
    const after = getProjectOrThrow(id);
    ChangeLogDAL.recordChange({
      projectId: id,
      entityType: 'project',
      entityId: id,
      entityLabel: after.name,
      action: 'update',
      before: buildProjectDiffSnapshot(before),
      after: buildProjectDiffSnapshot(after),
    });
  });
  run();
  return getProjectOrThrow(id);
}

/** Looks up a non-deleted project by its exact share token, or `null` for no match (unknown token,
 * revoked token, or a token whose project was soft-deleted). Used by `middleware/share.ts`. */
export function getProjectByShareToken(token: string): ProjectRow | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM projects WHERE share_token = ? AND deleted_at IS NULL')
    .get(token) as ProjectDbRow | undefined;
  return row ? mapProjectRow(row) : null;
}

export function softDeleteProject(id: string): void {
  getProjectOrThrow(id);
  const db = getDb();
  const now = nowIso();
  db.prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
}
