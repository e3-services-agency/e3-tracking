/**
 * finding.dal tests (T-2-09, D-42 fix round): `setFindingStatus` (manual resolve/reopen),
 * `upsertFinding`'s exception for a manually-resolved finding whose fingerprint still reproduces
 * (D-21 lifecycle, no manual mute -- the manual `status='resolved'` still gets overwritten with the
 * *latest* detail, it just doesn't flip back to `open` on its own), and `resolveStaleFindings`
 * clearing the acknowledgement marker (`resolved_by`) once the fingerprint stops reproducing
 * (D-42: an acknowledgement is bounded by reproduction, so a later recurrence reopens normally).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as FindingDAL from './finding.dal';
import { NotFoundError } from '../errors';

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

const FINGERPRINT = 'definition_vs_observations|missing_required|evt|null|prop|detail';

function upsertOnce(message: string) {
  return FindingDAL.upsertFinding(projectId, {
    comparison: 'definition_vs_observations',
    kind: 'missing_required',
    severity: 'error',
    message,
    fingerprint: FINGERPRINT,
  });
}

describe('upsertFinding + setFindingStatus (T-2-09 manual resolve)', () => {
  it('reopens a finding produced normally when the fingerprint reproduces (baseline, D-21)', () => {
    const first = upsertOnce('first');
    FindingDAL.resolveStaleFindings(projectId, 'definition_vs_observations', []); // nothing produced this run -> auto-resolved
    expect(FindingDAL.getFindingOrThrow(projectId, first.id).status).toBe('resolved');

    const reopened = upsertOnce('second');
    expect(reopened.id).toBe(first.id);
    expect(reopened.status).toBe('open');
    expect(reopened.message).toBe('second');
    expect(reopened.resolved_by).toBeNull();
  });

  it('does not reopen a manually-resolved finding while its fingerprint still reproduces', () => {
    const created = upsertOnce('first');
    const resolved = FindingDAL.setFindingStatus(projectId, created.id, 'resolved');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_by).toBe('user');
    expect(resolved.resolved_at).not.toBeNull();

    // The underlying problem still reproduces on the next recompute.
    const afterRecompute = upsertOnce('still failing');
    expect(afterRecompute.id).toBe(created.id);
    expect(afterRecompute.status).toBe('resolved'); // stays resolved -- not silently reopened
    expect(afterRecompute.resolved_by).toBe('user');
    expect(afterRecompute.message).toBe('still failing'); // detail columns still refresh
  });

  it('an explicit reopen (PATCH status=open) clears resolved_by and lets the next recompute reopen it', () => {
    const created = upsertOnce('first');
    FindingDAL.setFindingStatus(projectId, created.id, 'resolved');

    const reopened = FindingDAL.setFindingStatus(projectId, created.id, 'open');
    expect(reopened.status).toBe('open');
    expect(reopened.resolved_by).toBeNull();
    expect(reopened.resolved_at).toBeNull();

    // Now a normal recompute can resolve it again automatically if the fingerprint stops reproducing.
    FindingDAL.resolveStaleFindings(projectId, 'definition_vs_observations', []);
    const autoResolved = FindingDAL.getFindingOrThrow(projectId, created.id);
    expect(autoResolved.status).toBe('resolved');
    expect(autoResolved.resolved_by).toBeNull();
  });

  it('404s for an unknown finding id', () => {
    expect(() => FindingDAL.setFindingStatus(projectId, 'does-not-exist', 'resolved')).toThrow(NotFoundError);
  });

  // D-42 (T-2-09 fix round): `resolveStaleFindings` is the *only* place `resolved_by` should ever
  // clear itself without an explicit reopen -- once the fingerprint that was acknowledged is no
  // longer produced (the underlying problem got fixed), the acknowledgement is stale too.
  it('resolveStaleFindings clears resolved_by on a manually-resolved row once its fingerprint stops reproducing, keeping status resolved', () => {
    const created = upsertOnce('first');
    FindingDAL.setFindingStatus(projectId, created.id, 'resolved');
    const acknowledged = FindingDAL.getFindingOrThrow(projectId, created.id);
    expect(acknowledged.status).toBe('resolved');
    expect(acknowledged.resolved_by).toBe('user');

    // The fingerprint is no longer produced this run (the underlying problem was fixed).
    FindingDAL.resolveStaleFindings(projectId, 'definition_vs_observations', []);

    const cleared = FindingDAL.getFindingOrThrow(projectId, created.id);
    expect(cleared.status).toBe('resolved'); // unchanged -- it was already resolved
    expect(cleared.resolved_by).toBeNull(); // acknowledgement marker cleared automatically

    // A later recurrence of the same fingerprint now reopens the finding normally (no acknowledgement left to protect it).
    const reopened = upsertOnce('recurred');
    expect(reopened.id).toBe(created.id);
    expect(reopened.status).toBe('open');
    expect(reopened.resolved_by).toBeNull();
  });

  it('resolveStaleFindings leaves resolved_by untouched on a manually-resolved row whose fingerprint keeps reproducing', () => {
    const created = upsertOnce('first');
    FindingDAL.setFindingStatus(projectId, created.id, 'resolved');

    // The fingerprint is still produced this run.
    FindingDAL.resolveStaleFindings(projectId, 'definition_vs_observations', [FINGERPRINT]);

    const stillAcknowledged = FindingDAL.getFindingOrThrow(projectId, created.id);
    expect(stillAcknowledged.status).toBe('resolved');
    expect(stillAcknowledged.resolved_by).toBe('user');
  });
});
