/**
 * `deleteQaRun` tests (D-52, T-3-07 fix round ERROR 1): `findings.qa_run_id` is `ON DELETE CASCADE`
 * on `0008_findings_on_delete.sql` -- not `SET NULL` as an earlier version of D-52/the DAL comment
 * assumed -- so a naive `DELETE FROM qa_runs` would delete every finding stamped with that run
 * outright, including ones another run's observations still reproduce and ones a person
 * acknowledged by hand (`resolved_by = 'user'`). `deleteQaRun` now nulls `findings.qa_run_id` for
 * the run inside its own transaction before deleting it, so the cascade has nothing left to remove;
 * the finding rows survive with `qa_run_id`/`observation_id` null and are reopened/resolved by the
 * next `runComparison`, exactly like any other stale-or-still-reproduced finding (D-21, D-42).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import * as QaRunDAL from './qa-run.dal';
import * as ObservationDAL from './observation.dal';
import * as FindingDAL from './finding.dal';
import { runComparison } from '../services/comparison.service';

let projectId: string;
let eventId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });
  eventId = event.id;
  const totalPrice = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'total_price',
    data_type: 'number',
  });
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: totalPrice.id, required: true, role: 'normal' });
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('deleteQaRun (D-52, T-3-07 fix round ERROR 1)', () => {
  it('nulls findings.qa_run_id for the deleted run instead of letting the ON DELETE CASCADE FK delete the finding rows', () => {
    const runA = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    const runB = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    // Both runs carry the same type_mismatch (total_price observed as a string on both); B's
    // observation has the later timestamp, so it is the one the engine picks as the producing
    // observation (`type_mismatch`'s "first in DESC-timestamp order" rule) -- deleting B is exactly
    // the reviewer's reproduction, not a case engineered to dodge it.
    ObservationDAL.createObservation(projectId, runA.id, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 100,
      properties: { total_price: '28' },
    });
    ObservationDAL.createObservation(projectId, runB.id, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 200,
      properties: { total_price: '30' },
    });

    runComparison(projectId);

    const mismatches = FindingDAL.listFindings(projectId, { kind: 'type_mismatch' });
    expect(mismatches).toHaveLength(1);
    const findingId = mismatches[0].id;
    expect(mismatches[0].qa_run_id).toBe(runB.id);

    // Acknowledge it by hand (D-42) before deleting the run it is currently stamped with.
    FindingDAL.setFindingStatus(projectId, findingId, 'resolved');
    const acknowledged = FindingDAL.getFindingOrThrow(projectId, findingId);
    expect(acknowledged.status).toBe('resolved');
    expect(acknowledged.resolved_by).toBe('user');

    QaRunDAL.deleteQaRun(projectId, runB.id);

    // Immediately after delete, before any recompute: the row survives (not deleted by the
    // ON DELETE CASCADE FK on findings.qa_run_id), with qa_run_id/observation_id nulled, and the
    // acknowledgement is untouched.
    const survived = FindingDAL.getFindingById(projectId, findingId);
    expect(survived).not.toBeNull();
    expect(survived!.qa_run_id).toBeNull();
    expect(survived!.observation_id).toBeNull();
    expect(survived!.status).toBe('resolved');
    expect(survived!.resolved_by).toBe('user');

    // The next recompute: A's observation still reproduces the same fingerprint, so the same
    // finding id is restamped with A's run, stays resolved, and keeps its acknowledgement (D-42:
    // a manually-resolved row is never reopened by a recurring fingerprint).
    runComparison(projectId);
    const afterRecompute = FindingDAL.getFindingOrThrow(projectId, findingId);
    expect(afterRecompute.id).toBe(findingId);
    expect(afterRecompute.qa_run_id).toBe(runA.id);
    expect(afterRecompute.status).toBe('resolved');
    expect(afterRecompute.resolved_by).toBe('user');
  });

  it('resolves (not deletes) a stamped finding that stops reproducing once its run is gone, when it was never acknowledged', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 100,
      properties: { total_price: '28' },
    });

    runComparison(projectId);
    const mismatches = FindingDAL.listFindings(projectId, { kind: 'type_mismatch' });
    expect(mismatches).toHaveLength(1);
    const findingId = mismatches[0].id;
    expect(mismatches[0].status).toBe('open');
    expect(mismatches[0].qa_run_id).toBe(run.id);

    QaRunDAL.deleteQaRun(projectId, run.id);

    const survived = FindingDAL.getFindingById(projectId, findingId);
    expect(survived).not.toBeNull();
    expect(survived!.qa_run_id).toBeNull();
    expect(survived!.status).toBe('open'); // resolveStaleFindings hasn't run yet

    runComparison(projectId);
    const afterRecompute = FindingDAL.getFindingOrThrow(projectId, findingId);
    expect(afterRecompute.id).toBe(findingId);
    expect(afterRecompute.status).toBe('resolved');
    expect(afterRecompute.resolved_by).toBeNull();
    expect(afterRecompute.qa_run_id).toBeNull();
  });

  it('deletes the run and cascades its own observations', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 100,
      properties: { total_price: 28 },
    });
    QaRunDAL.deleteQaRun(projectId, run.id);
    expect(() => QaRunDAL.getQaRunOrThrow(projectId, run.id)).toThrow();
    expect(ObservationDAL.listObservations(projectId, { qa_run_id: run.id })).toEqual([]);
  });

  it('404s for an unknown run', () => {
    expect(() => QaRunDAL.deleteQaRun(projectId, 'does-not-exist')).toThrow();
  });
});
