/**
 * Finding Data Access Layer (plan "Target data model" section Finding, D-21, T-1-09). Every
 * function takes `projectId`; all queries enforce `project_id`. Findings are never created or
 * resolved by hand (D-21: "no manual mute"): `comparison.service.ts`'s `runComparison` is the only
 * writer, via `upsertFinding` (recomputes `last_seen_at`/reopens on a fingerprint match, or inserts
 * a new row) and `resolveStaleFindings` (marks `open` findings of a comparison whose fingerprint
 * was not produced this run as `resolved`, keeping `last_seen_at` as history per the plan's Finding
 * lifecycle section).
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn } from '../db/util';
import { NotFoundError } from '../errors';
import type { FindingKind, FindingSeverity, ComparisonId } from '../../domain/enums';

export interface FindingRow {
  id: string;
  project_id: string;
  comparison: ComparisonId;
  kind: FindingKind;
  severity: FindingSeverity;
  event_id: string | null;
  variant_id: string | null;
  property_id: string | null;
  observation_id: string | null;
  qa_run_id: string | null;
  expected_json: unknown;
  actual_json: unknown;
  message: string | null;
  fingerprint: string;
  status: 'open' | 'resolved';
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

/** The subset of `FindingRow` the engine produces; DAL fields (`id`, timestamps, `status`) are assigned on upsert. */
export interface FindingInput {
  comparison: ComparisonId;
  kind: FindingKind;
  severity: FindingSeverity;
  event_id?: string | null;
  variant_id?: string | null;
  property_id?: string | null;
  observation_id?: string | null;
  qa_run_id?: string | null;
  expected_json?: unknown;
  actual_json?: unknown;
  message?: string | null;
  fingerprint: string;
}

type FindingDbRow = Omit<FindingRow, 'expected_json' | 'actual_json'>;

function mapRow(row: FindingDbRow): FindingRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    expected_json: parseJsonColumn(raw.expected_json, null),
    actual_json: parseJsonColumn(raw.actual_json, null),
  } as FindingRow;
}

export interface FindingFilter {
  comparison?: string;
  kind?: string;
  severity?: string;
  event_id?: string;
  status?: string;
  /** Findings currently stamped with this run (fix round ERROR 2's `qa_run_id` semantics; see `comparison.service.ts`'s module comment). */
  qa_run_id?: string;
}

export function listFindings(projectId: string, filter?: FindingFilter): FindingRow[] {
  const clauses = ['project_id = ?'];
  const params: unknown[] = [projectId];
  if (filter?.comparison) {
    clauses.push('comparison = ?');
    params.push(filter.comparison);
  }
  if (filter?.kind) {
    clauses.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter?.severity) {
    clauses.push('severity = ?');
    params.push(filter.severity);
  }
  if (filter?.event_id) {
    clauses.push('event_id = ?');
    params.push(filter.event_id);
  }
  if (filter?.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  if (filter?.qa_run_id) {
    clauses.push('qa_run_id = ?');
    params.push(filter.qa_run_id);
  }
  // Fix round INFO 11: plain `ORDER BY severity` sorts alphabetically (error, info, warning); order
  // by actual severity rank (error, warning, info) instead.
  const rows = getDb()
    .prepare(
      `SELECT * FROM findings WHERE ${clauses.join(' AND ')}
       ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END, last_seen_at DESC`
    )
    .all(...params) as FindingDbRow[];
  return rows.map(mapRow);
}

export function getFindingById(projectId: string, id: string): FindingRow | null {
  const row = getDb()
    .prepare('SELECT * FROM findings WHERE id = ? AND project_id = ?')
    .get(id, projectId) as FindingDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function getFindingOrThrow(projectId: string, id: string): FindingRow {
  const row = getFindingById(projectId, id);
  if (!row) throw new NotFoundError('Finding not found.', 'finding');
  return row;
}

/** Count of open, error-severity findings for `eventId` across every comparison (used by `isEventCertified`, phase 2). */
export function countOpenErrorFindingsForEvent(projectId: string, eventId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) as n FROM findings WHERE project_id = ? AND event_id = ? AND status = 'open' AND severity = 'error'"
    )
    .get(projectId, eventId) as { n: number };
  return row.n;
}

/** Count of open findings (any severity) for `eventId`, shown as a badge on the event editor (T-1-09 UI). */
export function countOpenFindingsForEvent(projectId: string, eventId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as n FROM findings WHERE project_id = ? AND event_id = ? AND status = 'open'")
    .get(projectId, eventId) as { n: number };
  return row.n;
}

/**
 * Creates or reopens/refreshes the finding identified by `input.fingerprint` (unique per project,
 * `0001_core.sql`): a fresh fingerprint inserts a new row (`status: 'open'`, `first_seen_at =
 * last_seen_at = now`); an existing one is refreshed in place — `last_seen_at = now`, `status`
 * reset to `'open'` (reopening a previously resolved finding the same problem recurred), the rest
 * of the detail columns overwritten with the latest computed values, `first_seen_at` untouched.
 */
export function upsertFinding(projectId: string, input: FindingInput): FindingRow {
  const db = getDb();
  const now = nowIso();
  const existing = db
    .prepare('SELECT id FROM findings WHERE project_id = ? AND fingerprint = ?')
    .get(projectId, input.fingerprint) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE findings SET
        comparison = @comparison, kind = @kind, severity = @severity, event_id = @event_id,
        variant_id = @variant_id, property_id = @property_id, observation_id = @observation_id,
        qa_run_id = @qa_run_id, expected_json = @expected_json, actual_json = @actual_json,
        message = @message, status = 'open', last_seen_at = @now, resolved_at = NULL
       WHERE id = @id AND project_id = @project_id`
    ).run({
      id: existing.id,
      project_id: projectId,
      comparison: input.comparison,
      kind: input.kind,
      severity: input.severity,
      event_id: input.event_id ?? null,
      variant_id: input.variant_id ?? null,
      property_id: input.property_id ?? null,
      observation_id: input.observation_id ?? null,
      qa_run_id: input.qa_run_id ?? null,
      expected_json: toJsonColumn(input.expected_json ?? null),
      actual_json: toJsonColumn(input.actual_json ?? null),
      message: input.message?.trim() || null,
      now,
    });
    return getFindingOrThrow(projectId, existing.id);
  }

  const id = newId();
  db.prepare(
    `INSERT INTO findings (
      id, project_id, comparison, kind, severity, event_id, variant_id, property_id,
      observation_id, qa_run_id, expected_json, actual_json, message, fingerprint, status,
      first_seen_at, last_seen_at, resolved_at
    ) VALUES (
      @id, @project_id, @comparison, @kind, @severity, @event_id, @variant_id, @property_id,
      @observation_id, @qa_run_id, @expected_json, @actual_json, @message, @fingerprint, 'open',
      @now, @now, NULL
    )`
  ).run({
    id,
    project_id: projectId,
    comparison: input.comparison,
    kind: input.kind,
    severity: input.severity,
    event_id: input.event_id ?? null,
    variant_id: input.variant_id ?? null,
    property_id: input.property_id ?? null,
    observation_id: input.observation_id ?? null,
    qa_run_id: input.qa_run_id ?? null,
    expected_json: toJsonColumn(input.expected_json ?? null),
    actual_json: toJsonColumn(input.actual_json ?? null),
    message: input.message?.trim() || null,
    fingerprint: input.fingerprint,
    now,
  });
  return getFindingOrThrow(projectId, id);
}

/**
 * Marks every currently-`open` finding of `comparison` whose fingerprint is not in
 * `producedFingerprints` as `resolved` (D-21: "runComparison ... resolves findings no longer
 * produced"; `last_seen_at` is left as-is, a historical record of when it was last actually seen).
 * Scoping by `comparison` (not the whole project) lets `definitionVsObservations`'s run resolve its
 * own stale findings without touching comparison 1/2 findings (phase 2).
 */
export function resolveStaleFindings(projectId: string, comparison: string, producedFingerprints: string[]): void {
  const db = getDb();
  const now = nowIso();
  const openRows = db
    .prepare("SELECT id, fingerprint FROM findings WHERE project_id = ? AND comparison = ? AND status = 'open'")
    .all(projectId, comparison) as { id: string; fingerprint: string }[];
  const produced = new Set(producedFingerprints);
  const stale = openRows.filter((r) => !produced.has(r.fingerprint));
  if (stale.length === 0) return;
  const update = db.prepare("UPDATE findings SET status = 'resolved', resolved_at = ? WHERE id = ?");
  const run = db.transaction(() => {
    for (const row of stale) update.run(now, row.id);
  });
  run();
}
