/**
 * Observation Data Access Layer (plan "Target data model" section Observation, T-1-09). Every
 * function takes `projectId`; all queries enforce `project_id`. `raw_hash` (sha1 of
 * `type+timestamp+properties`, canonicalized key order) is unique per `qa_run_id`
 * (`0001_core.sql`) so re-selecting the same source row on a re-apply is a no-op, not a duplicate
 * row (plan "Customer events export" contract: "duplicates already present in another run").
 */
import { createHash } from 'node:crypto';
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, mapWriteError } from '../db/util';
import { DuplicateObservationError, NotFoundError, ValidationError } from '../errors';
import { getQaRunOrThrow } from './qa-run.dal';

export interface ObservationRow {
  id: string;
  project_id: string;
  qa_run_id: string;
  source: string;
  event_type: string;
  event_id: string | null;
  variant_id: string | null;
  timestamp: number;
  properties_json: Record<string, unknown>;
  page_url: string | null;
  context_values_json: unknown;
  captured_at: string | null;
  raw_hash: string;
}

export interface ObservationInput {
  source: string;
  event_type: string;
  event_id?: string | null;
  variant_id?: string | null;
  timestamp: number;
  properties: Record<string, unknown>;
  page_url?: string | null;
  context_values_json?: unknown;
}

type ObservationDbRow = Omit<ObservationRow, 'properties_json' | 'context_values_json'>;

function mapRow(row: ObservationDbRow): ObservationRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    properties_json: parseJsonColumn(raw.properties_json, {}),
    context_values_json: parseJsonColumn(raw.context_values_json, null),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** sha1 of `type+timestamp+properties` (canonical key order), used as the raw-evidence dedupe key. */
export function computeRawHash(eventType: string, timestamp: number, properties: Record<string, unknown>): string {
  const payload = JSON.stringify({ type: eventType, timestamp, properties: canonicalize(properties) });
  return createHash('sha1').update(payload).digest('hex');
}

/** The most recently captured observation of this project carrying `rawHash`, or `null` (T-2-10 pre-QA fix: lets `submit_observations_batch` name the run an all-duplicate resubmit's rows already live in, instead of an empty `qa_run_id`). */
export function findObservationByRawHash(projectId: string, rawHash: string): ObservationRow | null {
  const row = getDb()
    .prepare('SELECT * FROM observations WHERE project_id = ? AND raw_hash = ? ORDER BY captured_at DESC LIMIT 1')
    .get(projectId, rawHash) as ObservationDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function listObservationsByRun(projectId: string, qaRunId: string): ObservationRow[] {
  getQaRunOrThrow(projectId, qaRunId);
  return (
    getDb()
      .prepare('SELECT * FROM observations WHERE project_id = ? AND qa_run_id = ? ORDER BY timestamp DESC')
      .all(projectId, qaRunId) as ObservationDbRow[]
  ).map(mapRow);
}

export interface ObservationFilter {
  qa_run_id?: string;
  event_id?: string;
  archived?: boolean;
}

/** All observations of the project, optionally filtered; `archived: false` joins `qa_runs` (used by the comparison engine, D-21). */
export function listObservations(projectId: string, filter?: ObservationFilter): ObservationRow[] {
  const db = getDb();
  const clauses = ['o.project_id = ?'];
  const params: unknown[] = [projectId];
  if (filter?.qa_run_id) {
    clauses.push('o.qa_run_id = ?');
    params.push(filter.qa_run_id);
  }
  if (filter?.event_id) {
    clauses.push('o.event_id = ?');
    params.push(filter.event_id);
  }
  let join = '';
  if (filter?.archived !== undefined) {
    join = 'JOIN qa_runs r ON r.id = o.qa_run_id';
    clauses.push('r.archived = ?');
    params.push(filter.archived ? 1 : 0);
  }
  const rows = db
    .prepare(`SELECT o.* FROM observations o ${join} WHERE ${clauses.join(' AND ')} ORDER BY o.timestamp DESC`)
    .all(...params) as ObservationDbRow[];
  return rows.map(mapRow);
}

/** Every observation belonging to a non-archived run of the project (D-21 comparison scope). */
export function listObservationsInScope(projectId: string, qaRunId?: string): ObservationRow[] {
  if (qaRunId) return listObservationsByRun(projectId, qaRunId);
  return listObservations(projectId, { archived: false });
}

export function getObservationById(projectId: string, id: string): ObservationRow | null {
  const row = getDb()
    .prepare('SELECT * FROM observations WHERE id = ? AND project_id = ?')
    .get(id, projectId) as ObservationDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function getObservationOrThrow(projectId: string, id: string): ObservationRow {
  const row = getObservationById(projectId, id);
  if (!row) throw new NotFoundError('Observation not found.', 'observation');
  return row;
}

/** Inserts one observation; returns `null` (not an error) when `raw_hash` already exists on this run — the caller's dedupe case. */
export function createObservation(projectId: string, qaRunId: string, input: ObservationInput): ObservationRow | null {
  getQaRunOrThrow(projectId, qaRunId);
  const db = getDb();
  const id = newId();
  const now = nowIso();
  const rawHash = computeRawHash(input.event_type, input.timestamp, input.properties);
  const existing = db
    .prepare('SELECT id FROM observations WHERE qa_run_id = ? AND raw_hash = ?')
    .get(qaRunId, rawHash);
  if (existing) return null;
  try {
    db.prepare(
      `INSERT INTO observations (
        id, project_id, qa_run_id, source, event_type, event_id, variant_id, timestamp,
        properties_json, page_url, context_values_json, captured_at, raw_hash
      ) VALUES (
        @id, @project_id, @qa_run_id, @source, @event_type, @event_id, @variant_id, @timestamp,
        @properties_json, @page_url, @context_values_json, @captured_at, @raw_hash
      )`
    ).run({
      id,
      project_id: projectId,
      qa_run_id: qaRunId,
      source: input.source,
      event_type: input.event_type,
      event_id: input.event_id ?? null,
      variant_id: input.variant_id ?? null,
      timestamp: input.timestamp,
      properties_json: toJsonColumn(input.properties ?? {}),
      page_url: input.page_url?.trim() || null,
      context_values_json: toJsonColumn(input.context_values_json ?? null),
      captured_at: now,
      raw_hash: rawHash,
    });
  } catch (err) {
    // Race with a concurrent insert of the same (qa_run_id, raw_hash): the pre-check above already
    // covers the synchronous, single-connection case (better-sqlite3), so this path is effectively
    // unreachable today; kept as a safety net if that ever changes, mapped to 409 like every other
    // unique violation (`mapWriteError`, `db/util.ts`).
    mapWriteError(err, 'An observation with this raw payload already exists on this run.', `Failed to create observation: ${(err as Error).message}`);
  }
  return getObservationOrThrow(projectId, id);
}

/**
 * Updates `event_id`/`variant_id` in place (T-1-09 fix round ERROR 1): `comparison.service.ts`'s
 * `runComparison` re-resolves every observation in scope against the *current* definitions on every
 * recompute (event/property renames, new variants, etc. must not require re-importing the raw
 * export) and persists the result here before building the engine's input.
 */
export function updateObservationResolution(
  projectId: string,
  id: string,
  eventId: string | null,
  variantId: string | null
): void {
  getDb()
    .prepare('UPDATE observations SET event_id = ?, variant_id = ? WHERE id = ? AND project_id = ?')
    .run(eventId, variantId, id, projectId);
}

export interface ObservationUpdateInput {
  properties?: Record<string, unknown>;
  page_url?: string | null;
  context_values_json?: unknown;
  timestamp?: number;
}

/** `typeof v === 'object'`, not `null`, and not an array -- the shape `properties`/`context_values_json` must have. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates the subset of `ObservationUpdateInput` actually present on `updates` (fix round
 * WARNING 2: the route/MCP layer only cast the body, `updateObservation` itself never checked
 * anything, so a malformed PATCH could store a stringified `properties`/`context_values_json`
 * that later breaks the comparison engine's `Object.keys` walk, a non-finite `timestamp` that
 * breaks `ORDER BY timestamp`/the expiration-window suppression/`new Date(ts*1000)` on the page, a
 * non-string `page_url` that throws inside `.trim()` -- 500s where a 400 belongs -- or a `NULL`
 * `timestamp` that hits the column's `NOT NULL` constraint as a raw, uncaught `SqliteError`).
 */
function validateObservationUpdate(updates: ObservationUpdateInput): void {
  if ('properties' in updates && updates.properties !== undefined && !isPlainObject(updates.properties)) {
    throw new ValidationError('properties must be an object.', 'properties');
  }
  if (
    'timestamp' in updates &&
    updates.timestamp !== undefined &&
    (typeof updates.timestamp !== 'number' || !Number.isFinite(updates.timestamp))
  ) {
    throw new ValidationError('timestamp must be a finite number.', 'timestamp');
  }
  if (
    'page_url' in updates &&
    updates.page_url !== undefined &&
    updates.page_url !== null &&
    typeof updates.page_url !== 'string'
  ) {
    throw new ValidationError('page_url must be a string or null.', 'page_url');
  }
  if (
    'context_values_json' in updates &&
    updates.context_values_json !== undefined &&
    updates.context_values_json !== null &&
    !isPlainObject(updates.context_values_json)
  ) {
    throw new ValidationError('context_values_json must be an object or null.', 'context_values_json');
  }
}

/**
 * `PATCH /observations/:id` (D-52, T-3-07): edits an observation's evidence in place —
 * `properties`/`page_url`/`context_values_json`/`timestamp`, any subset. `raw_hash` is always
 * recomputed from the resulting `event_type`+`timestamp`+`properties` (event_type itself is never
 * editable here; re-resolving to a different event/variant happens automatically on the next
 * `runComparison`, per `updateObservationResolution`'s module comment); when the recomputed hash
 * collides with another observation already in this run, the edit is refused with 409
 * `DUPLICATE_OBSERVATION` rather than silently merging two rows' evidence. Every field is
 * validated (`validateObservationUpdate`, fix round WARNING 2) before anything is read from the
 * current row, so an invalid PATCH always 400s rather than reaching the SQL layer.
 */
export function updateObservation(projectId: string, id: string, updates: ObservationUpdateInput): ObservationRow {
  validateObservationUpdate(updates);
  const current = getObservationOrThrow(projectId, id);
  const timestamp = updates.timestamp ?? current.timestamp;
  const properties = updates.properties ?? current.properties_json;
  const pageUrl = updates.page_url !== undefined ? updates.page_url?.trim() || null : current.page_url;
  const contextValues = updates.context_values_json !== undefined ? updates.context_values_json : current.context_values_json;
  const rawHash = computeRawHash(current.event_type, timestamp, properties);

  const db = getDb();
  const duplicate = db
    .prepare('SELECT id FROM observations WHERE qa_run_id = ? AND raw_hash = ? AND id != ?')
    .get(current.qa_run_id, rawHash, id);
  if (duplicate) {
    throw new DuplicateObservationError(
      'Another observation in this run already has this exact raw payload (same type, timestamp and properties).'
    );
  }

  db.prepare(
    `UPDATE observations
     SET timestamp = @timestamp, properties_json = @properties_json, page_url = @page_url,
         context_values_json = @context_values_json, raw_hash = @raw_hash
     WHERE id = @id AND project_id = @project_id`
  ).run({
    id,
    project_id: projectId,
    timestamp,
    properties_json: toJsonColumn(properties),
    page_url: pageUrl,
    context_values_json: toJsonColumn(contextValues),
    raw_hash: rawHash,
  });
  return getObservationOrThrow(projectId, id);
}

/** `DELETE /observations/:id` (D-52, T-3-07): hard delete; the caller (route) always follows with `runComparison`. */
export function deleteObservation(projectId: string, id: string): void {
  getObservationOrThrow(projectId, id);
  const result = getDb().prepare('DELETE FROM observations WHERE id = ? AND project_id = ?').run(id, projectId);
  if (result.changes === 0) throw new NotFoundError('Observation not found.', 'observation');
}

/** Inserts every input in one transaction; returns the created rows (duplicates within the run are silently skipped). */
export function createObservationsBatch(
  projectId: string,
  qaRunId: string,
  inputs: ObservationInput[]
): ObservationRow[] {
  getQaRunOrThrow(projectId, qaRunId);
  const db = getDb();
  const created: ObservationRow[] = [];
  const run = db.transaction(() => {
    for (const input of inputs) {
      const row = createObservation(projectId, qaRunId, input);
      if (row) created.push(row);
    }
  });
  run();
  return created;
}
