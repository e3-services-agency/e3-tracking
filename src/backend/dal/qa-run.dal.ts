/**
 * QaRun Data Access Layer (plan "Target data model" section QaRun, T-1-09). Every function takes
 * `projectId`; all queries enforce `project_id`. A run is created by an import
 * (`customerEventsExportImport.service.ts`, `kind: 'export_paste'`) or, in phase 2, an MCP/agent
 * session (`kind: 'agent_session'`); `kind: 'manual'` is reserved for a future manual-entry UI.
 * Comparison 3 (`comparison.service.ts`) always scopes over every non-archived run's observations
 * (D-21), so `archived` is the only lifecycle flag that changes what a run contributes.
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, toSqliteBool, fromSqliteBool } from '../db/util';
import { NotFoundError, ValidationError } from '../errors';
import { QA_RUN_KINDS, QA_RUN_ENVIRONMENTS } from '../../domain/enums';

export interface QaRunRow {
  id: string;
  project_id: string;
  kind: string;
  actor: string | null;
  environment: string | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  archived: boolean;
  customer_id: string | null;
  source_meta_json: unknown;
}

export interface QaRunInput {
  kind: string;
  actor?: string | null;
  environment?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  source_meta_json?: unknown;
}

type QaRunDbRow = Omit<QaRunRow, 'archived' | 'source_meta_json'>;

function mapRow(row: QaRunDbRow): QaRunRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    archived: fromSqliteBool(raw.archived),
    source_meta_json: parseJsonColumn(raw.source_meta_json, null),
  };
}

function validateKindAndEnvironment(kind: string, environment: string | null | undefined): void {
  if (!(QA_RUN_KINDS as readonly string[]).includes(kind)) {
    throw new ValidationError(`kind must be one of: ${QA_RUN_KINDS.join(', ')}.`, 'kind');
  }
  if (environment != null && !(QA_RUN_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new ValidationError(`environment must be one of: ${QA_RUN_ENVIRONMENTS.join(', ')}.`, 'environment');
  }
}

export function listQaRuns(projectId: string, filter?: { archived?: boolean }): QaRunRow[] {
  const db = getDb();
  const rows = (
    filter?.archived !== undefined
      ? db
          .prepare('SELECT * FROM qa_runs WHERE project_id = ? AND archived = ? ORDER BY started_at DESC')
          .all(projectId, toSqliteBool(filter.archived))
      : db.prepare('SELECT * FROM qa_runs WHERE project_id = ? ORDER BY started_at DESC').all(projectId)
  ) as QaRunDbRow[];
  return rows.map(mapRow);
}

export function getQaRunById(projectId: string, id: string): QaRunRow | null {
  const row = getDb()
    .prepare('SELECT * FROM qa_runs WHERE id = ? AND project_id = ?')
    .get(id, projectId) as QaRunDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function getQaRunOrThrow(projectId: string, id: string): QaRunRow {
  const row = getQaRunById(projectId, id);
  if (!row) throw new NotFoundError('QA run not found.', 'qa_run');
  return row;
}

export function createQaRun(projectId: string, input: QaRunInput): QaRunRow {
  validateKindAndEnvironment(input.kind, input.environment ?? null);
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO qa_runs (id, project_id, kind, actor, environment, started_at, finished_at, notes, archived, customer_id, source_meta_json)
     VALUES (@id, @project_id, @kind, @actor, @environment, @started_at, NULL, @notes, 0, @customer_id, @source_meta_json)`
  ).run({
    id,
    project_id: projectId,
    kind: input.kind,
    actor: input.actor?.trim() || null,
    environment: input.environment ?? null,
    started_at: now,
    notes: input.notes?.trim() || null,
    customer_id: input.customer_id?.trim() || null,
    source_meta_json: toJsonColumn(input.source_meta_json ?? null),
  });
  return getQaRunOrThrow(projectId, id);
}

export interface QaRunUpdateInput {
  notes?: string | null;
  archived?: boolean;
  finished_at?: string | null;
}

/** `archive`/`finish` both go through here (`PATCH /qa-runs/:id`); `finished_at` is set to now unless the caller passes it explicitly (or `null` to reopen). */
export function updateQaRun(projectId: string, id: string, updates: QaRunUpdateInput): QaRunRow {
  getQaRunOrThrow(projectId, id);
  if (updates.notes !== undefined && updates.notes !== null && typeof updates.notes !== 'string') {
    // Fix round LOW 4: `PATCH /qa-runs/:id {"notes":123}` used to 500 on `.trim is not a function`.
    throw new ValidationError('notes must be a string or null.', 'notes');
  }
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (updates.notes !== undefined) patch.notes = updates.notes?.trim() || null;
  if (updates.archived !== undefined) patch.archived = toSqliteBool(updates.archived);
  if (updates.finished_at !== undefined) patch.finished_at = updates.finished_at;
  if (Object.keys(patch).length === 0) return getQaRunOrThrow(projectId, id);
  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db.prepare(`UPDATE qa_runs SET ${setClause} WHERE id = @id AND project_id = @project_id`).run({
    ...patch,
    id,
    project_id: projectId,
  });
  return getQaRunOrThrow(projectId, id);
}

/** `finish` is `updateQaRun` with `finished_at` defaulted to now (`PATCH /qa-runs/:id/finish` shape, plan "API shape"). */
export function finishQaRun(projectId: string, id: string, notes?: string | null): QaRunRow {
  return updateQaRun(projectId, id, { finished_at: nowIso(), ...(notes !== undefined ? { notes } : {}) });
}

/** Every non-archived run of the project, used by the comparison engine (D-21: comparison always scopes over all non-archived runs). */
export function listNonArchivedQaRuns(projectId: string): QaRunRow[] {
  return listQaRuns(projectId, { archived: false });
}
