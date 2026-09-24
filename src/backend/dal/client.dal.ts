/**
 * Client Data Access Layer (D-27): a Bloomreach account above Project.
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError } from '../db/util';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

export interface ClientRow {
  id: string;
  key: string;
  name: string;
  bloomreach_account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientInput {
  key: string;
  name: string;
  bloomreach_account_id?: string | null;
  notes?: string | null;
}

export type UpdateClientInput = Partial<CreateClientInput>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function listClients(): ClientRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM clients ORDER BY name').all() as ClientRow[];
}

export function getClientById(id: string): ClientRow | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRow | undefined) ?? null;
}

export function getClientOrThrow(id: string): ClientRow {
  const row = getClientById(id);
  if (!row) throw new NotFoundError('Client not found.', 'client');
  return row;
}

export function createClient(input: CreateClientInput): ClientRow {
  const key = input.key.trim();
  const name = input.name.trim();
  if (!key || !SLUG_RE.test(key)) {
    throw new ValidationError('Client key must be a URL-safe slug (lowercase letters, digits, hyphens).', 'key');
  }
  if (!name) {
    throw new ValidationError('Client name is required.', 'name');
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM clients WHERE key = ?').get(key);
  if (existing) {
    throw new ConflictError(`A client with key "${key}" already exists.`);
  }

  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO clients (id, key, name, bloomreach_account_id, notes, created_at, updated_at)
       VALUES (@id, @key, @name, @bloomreach_account_id, @notes, @created_at, @updated_at)`
    ).run({
      id,
      key,
      name,
      bloomreach_account_id: input.bloomreach_account_id?.trim() || null,
      notes: input.notes?.trim() || null,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(err, `A client with key "${key}" already exists.`, `Failed to create client: ${(err as Error).message}`);
  }
  return getClientOrThrow(id);
}

export function updateClient(id: string, updates: UpdateClientInput): ClientRow {
  getClientOrThrow(id);
  const db = getDb();

  if (updates.key !== undefined) {
    const key = updates.key.trim();
    if (!key || !SLUG_RE.test(key)) {
      throw new ValidationError('Client key must be a URL-safe slug (lowercase letters, digits, hyphens).', 'key');
    }
    const clash = db.prepare('SELECT id FROM clients WHERE key = ? AND id != ?').get(key, id);
    if (clash) throw new ConflictError(`A client with key "${key}" already exists.`);
  }
  if (updates.name !== undefined && !updates.name.trim()) {
    throw new ValidationError('Client name is required.', 'name');
  }

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.key !== undefined) patch.key = updates.key.trim();
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.bloomreach_account_id !== undefined) {
    patch.bloomreach_account_id = updates.bloomreach_account_id?.trim() || null;
  }
  if (updates.notes !== undefined) patch.notes = updates.notes?.trim() || null;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    db.prepare(`UPDATE clients SET ${setClause} WHERE id = @id`).run({ ...patch, id });
  } catch (err) {
    mapWriteError(
      err,
      `A client with key "${String(patch.key ?? '')}" already exists.`,
      `Failed to update client: ${(err as Error).message}`
    );
  }
  return getClientOrThrow(id);
}

/**
 * Delete only when the client has no non-deleted projects (T-1-02 delta); 409 otherwise. Counts
 * `deleted_at IS NULL` projects only (fix round finding #8) so a client whose projects were all
 * soft-deleted is not permanently stuck undeletable.
 */
export function deleteClient(id: string): void {
  getClientOrThrow(id);
  const db = getDb();
  const projectCount = (
    db.prepare('SELECT COUNT(*) as n FROM projects WHERE client_id = ? AND deleted_at IS NULL').get(id) as {
      n: number;
    }
  ).n;
  if (projectCount > 0) {
    throw new ConflictError(
      `Client cannot be deleted because it owns ${projectCount} project(s).`,
      `project_count=${projectCount}`
    );
  }
  // Any project rows still here are soft-deleted (the count above is zero for non-deleted ones);
  // hard-delete them first so `projects.client_id ... ON DELETE RESTRICT` doesn't block the client
  // delete itself (fix round finding #8). Their own children cascade via each table's project_id FK.
  const purge = db.transaction(() => {
    db.prepare('DELETE FROM projects WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  });
  purge();
}
