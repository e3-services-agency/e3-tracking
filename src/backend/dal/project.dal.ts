/**
 * Project Data Access Layer (replaces workspace.dal.ts, D-15). `workspace_settings` folded into
 * `projects` columns (D-15); `default_expiration_json` and the D-27 Bloomreach identifiers live
 * on the project row directly.
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, mapWriteError } from '../db/util';
import { ConflictError, NotFoundError, StandardEventExistsError, ValidationError } from '../errors';
import { getClientOrThrow, type ClientRow } from './client.dal';
import { validateExpirationJson } from './validators';
import { STANDARD_EVENTS } from '../../domain/bloomreach';

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
  /** Data Manager per-format defaults, written by the Data Manager import planners (T-2-02). */
  data_manager_meta_json?: unknown;
  /** Last applied `data-manager-customers.json` verbatim plus `applied_at` (T-2-02, D-35). */
  data_manager_customers_json?: unknown;
  /** Last applied `data-manager-events.json` verbatim plus `applied_at` (T-2-02/T-2-03, D-35). */
  data_manager_events_json?: unknown;
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

export function updateProject(id: string, updates: UpdateProjectInput): ProjectRow {
  getProjectOrThrow(id);
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
  if (updates.data_manager_meta_json !== undefined) {
    patch.data_manager_meta_json = toJsonColumn(updates.data_manager_meta_json);
  }
  if (updates.data_manager_customers_json !== undefined) {
    patch.data_manager_customers_json = toJsonColumn(updates.data_manager_customers_json);
  }
  if (updates.data_manager_events_json !== undefined) {
    patch.data_manager_events_json = toJsonColumn(updates.data_manager_events_json);
  }

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    db.prepare(`UPDATE projects SET ${setClause} WHERE id = @id`).run({ ...patch, id });
  } catch (err) {
    mapWriteError(
      err,
      `A project with key "${String(patch.key ?? '')}" already exists.`,
      `Failed to update project: ${(err as Error).message}`
    );
  }
  return getProjectOrThrow(id);
}

export function softDeleteProject(id: string): void {
  getProjectOrThrow(id);
  const db = getDb();
  const now = nowIso();
  db.prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
}
