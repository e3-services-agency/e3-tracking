/**
 * D-60 bundled sandbox project: `POST /api/projects/sandbox` restores the repo-bundled
 * `.claude/team/samples/sandbox-project-backup.json` (a fully loaded fixture project, produced by
 * `scripts/build-sandbox-backup.mjs`) as a brand-new project through the existing restore-as-new-
 * project machinery (`backupRestore.service.ts`, D-45), then flags the new project as a sandbox
 * (`project.dal.ts#setProjectSandboxFlag`).
 *
 * Auto-creates a "Sandboxes" client (key `sandboxes`) when no `client_id` is given, so a fresh
 * install with zero clients can still create a sandbox from the Clients page in one click.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import type { ProjectRow } from '../dal/project.dal';
import { applyRestore } from './backupRestore.service';
import { payloadHash } from '../../domain/diff/hash';
import { ConfigError, ValidationError } from '../errors';

const DEFAULT_SANDBOX_BACKUP_PATH = join(
  process.cwd(),
  '.claude',
  'team',
  'samples',
  'sandbox-project-backup.json'
);
const SANDBOX_CLIENT_KEY = 'sandboxes';
const SANDBOX_CLIENT_NAME = 'Sandboxes';

/** Overridable for tests (`E3_SANDBOX_BACKUP_PATH`) so a test does not need the real, large bundled backup. */
function sandboxBackupPath(): string {
  return process.env.E3_SANDBOX_BACKUP_PATH || DEFAULT_SANDBOX_BACKUP_PATH;
}

function loadBundledSandboxBackup(): unknown {
  const path = sandboxBackupPath();
  if (!existsSync(path)) {
    throw new ConfigError(
      `The bundled sandbox backup is missing (expected at "${path}"); run scripts/build-sandbox-backup.mjs.`
    );
  }
  const raw = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`The bundled sandbox backup is not valid JSON: ${(err as Error).message}`);
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

/**
 * W1 fix round (reviewer FAIL): the key used to be built as `sandbox-${slugify(name)}` where `name`
 * already had "Sandbox: " prepended (the bundled backup's own project name) and " (sandbox)"
 * appended (this service's display-name decoration), so `slugify` baked the word "sandbox" into the
 * slug itself and `nextSandboxKey`'s own `sandbox-` prefix duplicated it a second time (observed:
 * `sandbox-sandbox-acme-eu-sandbox`). Stripping a leading "sandbox:"/"sandbox " and a trailing
 * "(sandbox)"/" sandbox" from whichever name feeds the slug keeps the key to a single, clean
 * `sandbox-<slug>` (e.g. `sandbox-acme-eu`), whatever decoration the display name carries.
 */
function stripSandboxDecoration(value: string): string {
  return value
    .replace(/^\s*sandbox\s*[:\-]\s*/i, '')
    .replace(/\s*[\(\-]?\s*sandbox\s*\)?\s*$/i, '')
    .trim();
}

/** Finds or creates the auto "Sandboxes" client used when the caller gives no `client_id`. */
function getOrCreateSandboxesClient(): ClientDAL.ClientRow {
  const existing = ClientDAL.listClients().find((c) => c.key === SANDBOX_CLIENT_KEY);
  if (existing) return existing;
  return ClientDAL.createClient({ key: SANDBOX_CLIENT_KEY, name: SANDBOX_CLIENT_NAME });
}

/** `sandbox-<slug>`, suffixed with a short counter if that key is already taken. */
function nextSandboxKey(baseSlug: string): string {
  const db = getDb();
  const base = `sandbox-${baseSlug}`;
  let key = base;
  let n = 2;
  while (db.prepare('SELECT id FROM projects WHERE key = ? AND deleted_at IS NULL').get(key)) {
    key = `${base}-${n}`;
    n += 1;
  }
  return key;
}

export interface CreateSandboxInput {
  client_id?: string | null;
  name?: string | null;
}

export interface CreateSandboxResult {
  project: ProjectRow;
  warnings: string[];
}

export async function createSandboxProject(input: CreateSandboxInput): Promise<CreateSandboxResult> {
  const client = input.client_id ? ClientDAL.getClientOrThrow(input.client_id) : getOrCreateSandboxesClient();

  const backup = loadBundledSandboxBackup();
  const backupProject =
    backup && typeof backup === 'object' ? (backup as Record<string, unknown>).project : null;
  const backupName =
    backupProject && typeof backupProject === 'object' && typeof (backupProject as Record<string, unknown>).name === 'string'
      ? ((backupProject as Record<string, unknown>).name as string)
      : 'Sandbox';
  const name = input.name?.trim() || `${backupName} (sandbox)`;
  if (!name) throw new ValidationError('name must not be blank.', 'name');
  const slugSource = stripSandboxDecoration(input.name?.trim() || backupName) || 'project';
  const key = nextSandboxKey(slugify(slugSource));

  const { project, warnings } = await applyRestore(backup, payloadHash(backup), {
    name,
    key,
    client_id: client.id,
  });
  const flagged = ProjectDAL.setProjectSandboxFlag(project.id, true);
  return { project: flagged, warnings };
}
