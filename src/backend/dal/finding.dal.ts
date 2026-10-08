/**
 * Finding Data Access Layer (plan "Target data model" section Finding, D-21, T-1-09). Every
 * function takes `projectId`; all queries enforce `project_id`. `comparison.service.ts`'s
 * `runComparison` is the only automatic writer, via `upsertFinding` (recomputes
 * `last_seen_at`/reopens on a fingerprint match, or inserts a new row) and `resolveStaleFindings`
 * (marks `open` findings of a comparison whose fingerprint was not produced this run as
 * `resolved`, keeping `last_seen_at` as history per the plan's Finding lifecycle section).
 *
 * T-2-09 adds one manual writer, `setFindingStatus` (`PATCH .../findings/:id`): a person can
 * resolve or reopen a finding by hand. D-21 still holds "no mute status" -- this is not a third
 * status, just `status='resolved'` stamped with `resolved_by='user'` so `upsertFinding` knows not
 * to silently reopen it while the underlying problem still reproduces (see its comment).
 *
 * D-42 (T-2-09 fix round): a manual resolve is an acknowledgement, never a certification fix --
 * `document.service.ts`'s `computeCertification` still counts a `resolved_by='user'` error finding
 * against the event (`acknowledged_errors: n`, `listAcknowledgedFindings`). The acknowledgement is
 * bounded by reproduction: `resolveStaleFindings` clears `resolved_by` (but leaves `status`
 * `'resolved'`) the first time a recompute no longer produces the fingerprint, so a later
 * recurrence reopens the finding normally through `upsertFinding` instead of staying muted forever.
 */
import { getDb } from '../db';
import { allocateQaSequence } from './qa-report.dal';
import { newId, nowIso, parseJsonColumn, toJsonColumn } from '../db/util';
import { NotFoundError } from '../errors';
import type { FindingKind, FindingSeverity, ComparisonId } from '../../domain/enums';

export interface FindingRow {
  id: string;
  finding_sequence: number;
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
  /** `'user'` when a person resolved this finding by hand through `PATCH .../findings/:id`
   * (T-2-09); `null` for every automatically-produced/-resolved finding. See `upsertFinding`'s
   * comment for the reopen rule this drives. */
  resolved_by: 'user' | null;
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
 * Every finding a person acknowledged by hand (`status = 'resolved' AND resolved_by = 'user'`) for
 * the whole project (D-42, T-2-09 fix round): these still count against certification
 * (`document.service.ts`'s `computeCertificationsForProject`/`buildEventCard` report them
 * separately as `acknowledged_errors: n`) and against the tracking document's `quality.acknowledged`
 * block, even though they are excluded from `listFindings({status: 'open'})` and from
 * `EventCard.findings[]`. One project-wide query, grouped by the caller (same one-pass shape as
 * `listFindings({status: 'open'})` in `buildEventCardContext`).
 */
export function listAcknowledgedFindings(projectId: string): FindingRow[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM findings WHERE project_id = ? AND status = 'resolved' AND resolved_by = 'user'
       ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END, last_seen_at DESC`
    )
    .all(projectId) as FindingDbRow[];
  return rows.map(mapRow);
}

/**
 * Creates or reopens/refreshes the finding identified by `input.fingerprint` (unique per project,
 * `0001_core.sql`): a fresh fingerprint inserts a new row (`status: 'open'`, `first_seen_at =
 * last_seen_at = now`); an existing one is refreshed in place — `last_seen_at = now`, `status`
 * reset to `'open'` (reopening a previously resolved finding the same problem recurred), the rest
 * of the detail columns overwritten with the latest computed values, `first_seen_at` untouched.
 *
 * T-2-09 exception: a finding a person resolved by hand (`resolved_by = 'user'`, set only by
 * `setFindingStatus`) is NOT reopened here even though its fingerprint reproduced — the detail
 * columns (severity/message/expected/actual/last_seen_at) still refresh so the record reflects the
 * latest evidence, but `status`/`resolved_at`/`resolved_by` are left untouched. Two paths make the
 * finding reopenable again: an explicit `PATCH {status: 'open'}` (`setFindingStatus`, immediate),
 * or `resolveStaleFindings` clearing `resolved_by` on its own the first time a recompute no longer
 * reproduces the fingerprint (D-42) — either way, `resolved_by` is back to `NULL` before the next
 * `upsertFinding` call sees this fingerprint again, so a later recurrence reopens normally.
 */
export function upsertFinding(projectId: string, input: FindingInput): FindingRow {
  const db = getDb();
  const now = nowIso();
  const existing = db
    .prepare("SELECT id, status, resolved_by FROM findings WHERE project_id = ? AND fingerprint = ?")
    .get(projectId, input.fingerprint) as { id: string; status: string; resolved_by: string | null } | undefined;

  if (existing) {
    const isManuallyResolved = existing.status === 'resolved' && existing.resolved_by === 'user';
    db.prepare(
      `UPDATE findings SET
        comparison = @comparison, kind = @kind, severity = @severity, event_id = @event_id,
        variant_id = @variant_id, property_id = @property_id, observation_id = @observation_id,
        qa_run_id = @qa_run_id, expected_json = @expected_json, actual_json = @actual_json,
        message = @message, last_seen_at = @now
        ${isManuallyResolved ? '' : ", status = 'open', resolved_at = NULL, resolved_by = NULL"}
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
  return db.transaction(() => {
  const sequence = allocateQaSequence(projectId, 'finding');
  db.prepare(
    `INSERT INTO findings (
      id, project_id, comparison, kind, severity, event_id, variant_id, property_id,
      observation_id, qa_run_id, expected_json, actual_json, message, fingerprint, status,
      first_seen_at, last_seen_at, resolved_at, finding_sequence
    ) VALUES (
      @id, @project_id, @comparison, @kind, @severity, @event_id, @variant_id, @property_id,
      @observation_id, @qa_run_id, @expected_json, @actual_json, @message, @fingerprint, 'open',
      @now, @now, NULL, @sequence
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
    sequence,
    now,
  });
  return getFindingOrThrow(projectId, id);
  }).immediate();
}

/**
 * Marks every currently-`open` finding of `comparison` whose fingerprint is not in
 * `producedFingerprints` as `resolved` (D-21: "runComparison ... resolves findings no longer
 * produced"; `last_seen_at` is left as-is, a historical record of when it was last actually seen).
 * Scoping by `comparison` (not the whole project) lets `definitionVsObservations`'s run resolve its
 * own stale findings without touching comparison 1/2 findings (phase 2).
 *
 * D-42 (T-2-09 fix round): also clears the acknowledgement marker on a manually-resolved row
 * (`status = 'resolved' AND resolved_by = 'user'`) once its fingerprint stops reproducing --
 * `resolved_by` -> `NULL`, `resolved_at` refreshed to this recompute's time, `status` unchanged
 * (already `'resolved'`). Clearing the marker (instead of leaving it) is what lets a later
 * recurrence of the same fingerprint reopen the finding normally through `upsertFinding` (which
 * only special-cases `resolved_by = 'user'` rows) rather than the acknowledgement persisting across
 * an intervening fix, per D-42 "a later recurrence reopens the finding normally".
 */
export function resolveStaleFindings(projectId: string, comparison: string, producedFingerprints: string[]): void {
  const db = getDb();
  const now = nowIso();
  const produced = new Set(producedFingerprints);

  const openRows = db
    .prepare("SELECT id, fingerprint FROM findings WHERE project_id = ? AND comparison = ? AND status = 'open'")
    .all(projectId, comparison) as { id: string; fingerprint: string }[];
  const staleOpen = openRows.filter((r) => !produced.has(r.fingerprint));

  const acknowledgedRows = db
    .prepare("SELECT id, fingerprint FROM findings WHERE project_id = ? AND comparison = ? AND status = 'resolved' AND resolved_by = 'user'")
    .all(projectId, comparison) as { id: string; fingerprint: string }[];
  const staleAcknowledged = acknowledgedRows.filter((r) => !produced.has(r.fingerprint));

  if (staleOpen.length === 0 && staleAcknowledged.length === 0) return;

  const resolveOpen = db.prepare("UPDATE findings SET status = 'resolved', resolved_at = ? WHERE id = ?");
  const clearAcknowledgement = db.prepare("UPDATE findings SET resolved_by = NULL, resolved_at = ? WHERE id = ?");
  const run = db.transaction(() => {
    for (const row of staleOpen) resolveOpen.run(now, row.id);
    for (const row of staleAcknowledged) clearAcknowledgement.run(now, row.id);
  });
  run();
}

/**
 * `PATCH /api/projects/:projectId/findings/:id` (T-2-09): a person manually resolves or reopens
 * one finding. `status: 'resolved'` stamps `resolved_at`/`resolved_by='user'`; `status: 'open'`
 * clears both, an explicit reopen that lets the next `runComparison` reopen it again on its own if
 * the fingerprint still reproduces (see `upsertFinding`'s comment -- without this explicit reopen,
 * a manually-resolved finding stays resolved forever even while the underlying problem persists).
 *
 * T-2-09 pre-QA fix: `status: 'resolved'` on a row that is already `status === 'resolved'` (whether
 * a person resolved it earlier, or `resolveStaleFindings` auto-resolved it because the fingerprint
 * stopped reproducing) is a no-op -- the row is returned unchanged, with no `resolved_by='user'`
 * stamp. Without this, re-sending a resolve for a finding the Findings page already shows as
 * `resolved` (e.g. a stale UI, or a double-click) would silently turn an ordinary auto-resolved
 * finding into a D-42 acknowledgement that then blocks certification even though nobody
 * acknowledged anything. The route still answers `200` either way.
 */
export function setFindingStatus(projectId: string, id: string, status: 'open' | 'resolved'): FindingRow {
  const existing = getFindingOrThrow(projectId, id); // 404s before any write if the id/project pair doesn't match.
  if (status === 'resolved' && existing.status === 'resolved') return existing;

  const db = getDb();
  const now = nowIso();
  if (status === 'resolved') {
    db.prepare("UPDATE findings SET status = 'resolved', resolved_at = ?, resolved_by = 'user' WHERE id = ? AND project_id = ?").run(
      now,
      id,
      projectId
    );
  } else {
    db.prepare("UPDATE findings SET status = 'open', resolved_at = NULL, resolved_by = NULL WHERE id = ? AND project_id = ?").run(
      id,
      projectId
    );
  }
  return getFindingOrThrow(projectId, id);
}
