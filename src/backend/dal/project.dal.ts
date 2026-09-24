/**
 * Project Data Access Layer (replaces workspace.dal.ts, D-15). `workspace_settings` folded into
 * `projects` columns (D-15); `default_expiration_json` and the D-27 Bloomreach identifiers live
 * on the project row directly.
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, mapWriteError } from '../db/util';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getClientOrThrow, type ClientRow } from './client.dal';

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
  'default_expiration_json' | 'standard_event_additions_json' | 'consent_key_additions_json'
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
