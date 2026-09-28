/**
 * Route-level coverage for the public share-link routes (D-48, T-4-01): `POST/GET/PATCH/DELETE
 * /api/projects/:id/share` (internal, authenticated) and `GET /api/shared/:token/*` (public, no
 * auth). Uses a real HTTP server and plain `fetch()` (no `fetchWithAuth`/custom headers) throughout
 * the public routes so "works with no auth headers" is proven by construction, not asserted.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import { getFileStore } from '../../files/FileStore';

let server: http.Server;
let baseUrl: string;
let tmpFilesDir: string;
let projectId: string;
let clientId: string;

beforeAll(async () => {
  tmpFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-shared-route-'));
  process.env.E3_DB_PATH = ':memory:';
  process.env.E3_FILES_PATH = tmpFilesDir;
  closeDb();

  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  clientId = client.id;
  projectId = ProjectDAL.createProject({ client_id: clientId, key: 'acme-eu', name: 'Acme EU' }).id;
  EventDAL.createEvent(projectId, { name: 'shared_route_event', class: 'custom' });

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(tmpFilesDir, { recursive: true, force: true });
  delete process.env.E3_DB_PATH;
  delete process.env.E3_FILES_PATH;
});

afterEach(async () => {
  // revoke between tests so each describe block starts from "no active link"
  await fetch(`${baseUrl}/api/projects/${projectId}/share`, { method: 'DELETE' });
});

describe('internal GET/POST/PATCH/DELETE /api/projects/:id/share', () => {
  it('GET with no link yet returns nulls', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share_token).toBeNull();
    expect(body.url).toBeNull();
  });

  it('POST generates a link with a url built from the request origin', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: 'read' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.share_token).toBeTruthy();
    expect(body.share_access).toBe('read');
    expect(body.url).toBe(`${baseUrl}/tracking-plan/shared/${body.share_token}`);
  });

  it('POST again rotates: old token 404s on the public route, new one works', async () => {
    const first = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const second = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    expect(second.share_token).not.toBe(first.share_token);

    const oldRes = await fetch(`${baseUrl}/api/shared/${first.share_token}`);
    expect(oldRes.status).toBe(404);
    expect((await oldRes.json()).code).toBe('SHARE_NOT_FOUND');

    const newRes = await fetch(`${baseUrl}/api/shared/${second.share_token}`);
    expect(newRes.status).toBe(200);
  });

  it('PATCH changes access without rotating the token', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: 'comment' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share_token).toBe(created.share_token);
    expect(body.share_access).toBe('comment');
  });

  it('DELETE revokes: public route then 404s', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share_token).toBeNull();

    const publicRes = await fetch(`${baseUrl}/api/shared/${created.share_token}`);
    expect(publicRes.status).toBe(404);
  });
});

describe('public GET /api/shared/:token/* (no auth headers)', () => {
  it('GET /:token returns the project header with name, client name, access and generated_at', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'comment' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.name).toBe('Acme EU');
    expect(body.client.name).toBe('Acme');
    expect(body.access).toBe('comment');
    expect(body.generated_at).toBeTruthy();
  });

  it('an unknown token 404s SHARE_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/shared/not-a-real-token`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SHARE_NOT_FOUND');
  });

  it('every other path under /api/shared 404s', async () => {
    const res = await fetch(`${baseUrl}/api/shared/some-nonsense/deep/path`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SHARE_NOT_FOUND');
  });

  it('GET /:token/tracking-document.json equals the internal document for the same project', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const internal = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/export/tracking-document.json`)
    ).json();
    const shared = await (await fetch(`${baseUrl}/api/shared/${created.share_token}/tracking-document.json`)).json();
    // `generated_at` is a fresh timestamp per build (each fetch calls buildTrackingDocument again);
    // everything else must be byte-identical.
    expect({ ...shared, generated_at: null }).toEqual({ ...internal, generated_at: null });
    // T-4-08 will add internal_notes/internal_url to templates/use cases and keep them out of this
    // document per its plan section; assert now so a future regression there is caught here too.
    expect(JSON.stringify(shared)).not.toContain('internal_notes');
    expect(JSON.stringify(shared)).not.toContain('internal_url');
  });

  it('GET /:token/tracking-document.json honours ?version=', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const ok = await fetch(`${baseUrl}/api/shared/${created.share_token}/tracking-document.json?version=1`);
    expect(ok.status).toBe(200);
    const bad = await fetch(`${baseUrl}/api/shared/${created.share_token}/tracking-document.json?version=99`);
    expect(bad.status).toBe(400);
  });

  it('GET /:token/documentation.html serves HTML', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}/documentation.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<html');
  });

  it('GET /:token/files/* serves a file uploaded to this project', async () => {
    const stored = await getFileStore().put(projectId, 'event_trigger', 'ok.png', Buffer.from('ok'), 'image/png');
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}/files/${stored.path}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('GET /:token/files/* rejects a ".." traversal segment', async () => {
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-proj', name: 'Other' }).id;
    const stored = await getFileStore().put(otherProjectId, 'event_trigger', 'secret.png', Buffer.from('secret'), 'image/png');
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(
      `${baseUrl}/api/shared/${created.share_token}/files/${projectId}/../${stored.path}`
    );
    expect(res.status).not.toBe(200);
  });

  it('GET /:token/files/* rejects another project\'s path (not reachable through this token)', async () => {
    const otherClient = ClientDAL.createClient({ key: 'other2', name: 'Other2' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-proj2', name: 'Other2' }).id;
    const stored = await getFileStore().put(otherProjectId, 'event_trigger', 'secret.png', Buffer.from('secret'), 'image/png');
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}/files/${stored.path}`);
    expect(res.status).toBe(404);
  });

  it('a token of a soft-deleted project is 404', async () => {
    const client = ClientDAL.createClient({ key: 'to-delete', name: 'ToDelete' });
    const doomedProjectId = ProjectDAL.createProject({ client_id: client.id, key: 'doomed', name: 'Doomed' }).id;
    const created = await (
      await fetch(`${baseUrl}/api/projects/${doomedProjectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    ProjectDAL.softDeleteProject(doomedProjectId);
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}`);
    expect(res.status).toBe(404);
  });
});
