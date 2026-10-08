/**
 * QaRun / Observation / Finding DAL tests (T-1-09): lifecycle (archive, finish), observation
 * dedupe by raw_hash, finding upsert-by-fingerprint and stale resolution, and the 0008 ON DELETE
 * behaviour (`findings.observation_id` SET NULL, `findings.qa_run_id` SET NULL).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as QaRunDAL from './qa-run.dal';
import * as ObservationDAL from './observation.dal';
import * as FindingDAL from './finding.dal';
import { NotFoundError, ValidationError } from '../errors';

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('qa-run.dal', () => {
  it('rejects an unknown kind', () => {
    expect(() => QaRunDAL.createQaRun(projectId, { kind: 'not_a_kind' })).toThrow(ValidationError);
  });

  it('creates a run with started_at set and archived false', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste', actor: 'Jan' });
    expect(run.archived).toBe(false);
    expect(run.started_at).toBeTruthy();
    expect(run.finished_at).toBeNull();
  });

  it('archives and unarchives a run', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    const archived = QaRunDAL.updateQaRun(projectId, run.id, { archived: true });
    expect(archived.archived).toBe(true);
    const listedArchived = QaRunDAL.listQaRuns(projectId, { archived: true });
    expect(listedArchived.map((r) => r.id)).toContain(run.id);
    const listedNonArchived = QaRunDAL.listNonArchivedQaRuns(projectId);
    expect(listedNonArchived.map((r) => r.id)).not.toContain(run.id);
  });

  it('finishes a run, setting finished_at', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'agent_session' });
    const finished = QaRunDAL.finishQaRun(projectId, run.id, 'all good');
    expect(finished.finished_at).toBeTruthy();
    expect(finished.notes).toBe('all good');
  });

  it('404s for a run id from another project', () => {
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const otherProject = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-p', name: 'Other P' });
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    expect(() => QaRunDAL.getQaRunOrThrow(otherProject.id, run.id)).toThrow(NotFoundError);
  });
});

describe('observation.dal', () => {
  it('creates an observation and computes a deterministic raw_hash independent of key order', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    const a = ObservationDAL.computeRawHash('purchase', 100, { total_price: '28', purchase_id: '1' });
    const b = ObservationDAL.computeRawHash('purchase', 100, { purchase_id: '1', total_price: '28' });
    expect(a).toBe(b);

    const obs = ObservationDAL.createObservation(projectId, run.id, {
      source: 'export',
      event_type: 'purchase',
      timestamp: 100,
      properties: { total_price: '28', purchase_id: '1' },
    });
    expect(obs).not.toBeNull();
    expect(obs?.raw_hash).toBe(a);
  });

  it('dedupes a duplicate raw payload within the same run (returns null, no second row)', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    const input = { source: 'export', event_type: 'purchase', timestamp: 100, properties: { total_price: '28' } };
    const first = ObservationDAL.createObservation(projectId, run.id, input);
    const second = ObservationDAL.createObservation(projectId, run.id, input);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(ObservationDAL.listObservationsByRun(projectId, run.id)).toHaveLength(1);
  });

  it('createObservationsBatch inserts every distinct input and skips duplicates', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    const created = ObservationDAL.createObservationsBatch(projectId, run.id, [
      { source: 'export', event_type: 'purchase', timestamp: 1, properties: { a: 1 } },
      { source: 'export', event_type: 'purchase', timestamp: 1, properties: { a: 1 } }, // duplicate
      { source: 'export', event_type: 'checkout', timestamp: 2, properties: { a: 2 } },
    ]);
    expect(created).toHaveLength(2);
    expect(ObservationDAL.listObservationsByRun(projectId, run.id)).toHaveLength(2);
  });

  it('listObservations(archived: false) excludes observations of an archived run', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    ObservationDAL.createObservation(projectId, run.id, { source: 'export', event_type: 'purchase', timestamp: 1, properties: {} });
    QaRunDAL.updateQaRun(projectId, run.id, { archived: true });
    expect(ObservationDAL.listObservations(projectId, { archived: false })).toHaveLength(0);
    expect(ObservationDAL.listObservations(projectId, { archived: true })).toHaveLength(1);
  });

  it('deleting a qa_run cascades its observations (0001_core.sql)', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    ObservationDAL.createObservation(projectId, run.id, { source: 'export', event_type: 'purchase', timestamp: 1, properties: {} });
    getDb().prepare('DELETE FROM qa_runs WHERE id = ?').run(run.id);
    expect(ObservationDAL.listObservations(projectId)).toHaveLength(0);
  });
});

describe('finding.dal', () => {
  it('upsertFinding inserts a new row on a fresh fingerprint', () => {
    const finding = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      fingerprint: 'fp-1',
      message: 'missing',
    });
    expect(finding.status).toBe('open');
    expect(finding.first_seen_at).toBe(finding.last_seen_at);
  });

  it('upsertFinding refreshes last_seen_at and reopens a resolved finding on a repeat fingerprint', () => {
    FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      fingerprint: 'fp-2',
      message: 'first',
    });
    FindingDAL.resolveStaleFindings(projectId, 'definition_vs_observations', []); // resolves fp-2
    const reopened = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      fingerprint: 'fp-2',
      message: 'again',
    });
    expect(reopened.status).toBe('open');
    expect(reopened.message).toBe('again');
  });

  it('resolveStaleFindings marks open findings not in the produced set as resolved, others untouched', () => {
    FindingDAL.upsertFinding(projectId, { comparison: 'definition_vs_observations', kind: 'missing_required', severity: 'error', fingerprint: 'stays' });
    FindingDAL.upsertFinding(projectId, { comparison: 'definition_vs_observations', kind: 'missing_required', severity: 'error', fingerprint: 'goes' });
    FindingDAL.resolveStaleFindings(projectId, 'definition_vs_observations', ['stays']);
    const open = FindingDAL.listFindings(projectId, { status: 'open' });
    expect(open.map((f) => f.fingerprint)).toEqual(['stays']);
    const resolved = FindingDAL.listFindings(projectId, { status: 'resolved' });
    expect(resolved.map((f) => f.fingerprint)).toEqual(['goes']);
  });

  it('lists findings filtered by kind/severity/status', () => {
    FindingDAL.upsertFinding(projectId, { comparison: 'definition_vs_observations', kind: 'missing_required', severity: 'error', fingerprint: 'a' });
    FindingDAL.upsertFinding(projectId, { comparison: 'definition_vs_observations', kind: 'unexpected_event', severity: 'info', fingerprint: 'b' });
    expect(FindingDAL.listFindings(projectId, { kind: 'unexpected_event' })).toHaveLength(1);
    expect(FindingDAL.listFindings(projectId, { severity: 'error' })).toHaveLength(1);
  });

  it('deleting the evidence observation SETs NULL findings.observation_id (0008_findings_on_delete.sql)', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    const obs = ObservationDAL.createObservation(projectId, run.id, { source: 'export', event_type: 'purchase', timestamp: 1, properties: {} });
    const finding = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      fingerprint: 'evidence-fp',
      observation_id: obs!.id,
    });
    getDb().prepare('DELETE FROM observations WHERE id = ?').run(obs!.id);
    const reloaded = FindingDAL.getFindingOrThrow(projectId, finding.id);
    expect(reloaded.observation_id).toBeNull();
  });

  it('deleting the qa_run directly preserves its finding and clears qa_run_id (0040)', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    const finding = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      fingerprint: 'run-fp',
      qa_run_id: run.id,
    });
    getDb().prepare('DELETE FROM qa_runs WHERE id = ?').run(run.id);
    expect(FindingDAL.getFindingById(projectId, finding.id)).toMatchObject({
      id: finding.id, qa_run_id: null, fingerprint: finding.fingerprint, finding_sequence: finding.finding_sequence,
    });
  });
});
