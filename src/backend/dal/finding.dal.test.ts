/**
 * finding.dal tests (T-2-09): `setFindingStatus` (manual resolve/reopen) and `upsertFinding`'s
 * exception for a manually-resolved finding whose fingerprint still reproduces (D-21 lifecycle,
 * no manual mute -- the manual `status='resolved'` still gets overwritten with the *latest*
 * detail, it just doesn't flip back to `open` on its own).
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
});
