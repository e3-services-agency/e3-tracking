/**
 * Route-level coverage for T-2-09: `PATCH /api/projects/:projectId/findings/:id` (manual
 * resolve/reopen, `finding.dal.ts`'s `setFindingStatus`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as FindingDAL from '../../dal/finding.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

async function patchJson(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('PATCH /api/projects/:projectId/findings/:id', () => {
  it('resolves a finding by hand, stamping resolved_by=user', async () => {
    const finding = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      message: 'route test',
      fingerprint: 'route|missing_required|evt|null|prop|detail',
    });

    const res = await patchJson(`/api/projects/${projectId}/findings/${finding.id}`, { status: 'resolved' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('resolved');
    expect(body.resolved_by).toBe('user');

    // Recompute must not silently reopen it.
    const reproduced = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      message: 'still failing',
      fingerprint: 'route|missing_required|evt|null|prop|detail',
    });
    expect(reproduced.status).toBe('resolved');

    // An explicit reopen clears the marker.
    const reopenRes = await patchJson(`/api/projects/${projectId}/findings/${finding.id}`, { status: 'open' });
    expect(reopenRes.status).toBe(200);
    const reopenBody = await reopenRes.json();
    expect(reopenBody.status).toBe('open');
    expect(reopenBody.resolved_by).toBeNull();
  });

  it('400s for an invalid status', async () => {
    const finding = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'missing_required',
      severity: 'error',
      fingerprint: 'route|invalid-status|evt|null|prop|detail',
    });
    const res = await patchJson(`/api/projects/${projectId}/findings/${finding.id}`, { status: 'dismissed' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('STATUS_INVALID');
  });

  it('404s for an unknown finding id', async () => {
    const res = await patchJson(`/api/projects/${projectId}/findings/does-not-exist`, { status: 'resolved' });
    expect(res.status).toBe(404);
  });
});
