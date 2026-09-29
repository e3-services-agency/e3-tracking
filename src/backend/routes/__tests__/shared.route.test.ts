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
import * as UseCaseDAL from '../../dal/use-case.dal';
import * as IdentityRuleDAL from '../../dal/identity-rule.dal';
import * as CommentDAL from '../../dal/comment.dal';
import { getFileStore } from '../../files/FileStore';

let server: http.Server;
let baseUrl: string;
let serverPort: number;
let tmpFilesDir: string;
let projectId: string;
let clientId: string;

/**
 * `fetch()`/WHATWG URL normalises/rejects some malformed inputs before a request is ever sent (see
 * `__tests__/files.route.test.ts`'s own note on this), so the ERROR 1/WARNING 2 fix-round probes
 * (a raw ".." segment, and every malformed-percent-escape case) need a raw socket write, not
 * `fetch()`, to prove what the server itself does with the literal bytes on the wire.
 */
function rawGet(rawPath: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: serverPort, path: rawPath, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

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
  serverPort = port;
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

  it('GET /:token carries the project client_logo_path (T-4-03: the shared view header logo), null when unset', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const noLogoRes = await fetch(`${baseUrl}/api/shared/${created.share_token}`);
    expect((await noLogoRes.json()).project.client_logo_path).toBeNull();

    ProjectDAL.updateProject(projectId, { client_logo_path: `${projectId}/logo/logo.png` });
    const withLogoRes = await fetch(`${baseUrl}/api/shared/${created.share_token}`);
    expect((await withLogoRes.json()).project.client_logo_path).toBe(`${projectId}/logo/logo.png`);
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
    // The public projection deletes the per-event agent_instructions key (T-4-14), so drop it from the internal side too.
    const withoutAgent = (d: any) => ({ ...d, generated_at: null, events: d.events.map(({ agent_instructions: _a, ...e }: any) => e) });
    expect(withoutAgent(shared)).toEqual(withoutAgent(internal));
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

  it('T-4-03 (D-50): an event trigger screenshot is in the shared tracking document and servable through this same token', async () => {
    const stored = await getFileStore().put(projectId, 'event_trigger', 'cart.png', Buffer.from('cart-bytes'), 'image/png');
    EventDAL.createEvent(projectId, {
      name: 'cart_update_with_trigger',
      class: 'custom',
      triggers_json: [{ title: 'Add to cart', description: 'Cart drawer opens', image_path: stored.path, source: 'https://shop.example/cart', order: 0 }],
    });
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const doc = await (await fetch(`${baseUrl}/api/shared/${created.share_token}/tracking-document.json`)).json();
    const event = doc.events.find((e: { name: string }) => e.name === 'cart_update_with_trigger');
    expect(event.triggers).toEqual([
      { title: 'Add to cart', description: 'Cart drawer opens', image_path: stored.path, page_url: 'https://shop.example/cart' },
    ]);
    const fileRes = await fetch(`${baseUrl}/api/shared/${created.share_token}/files/${stored.path}`);
    expect(fileRes.status).toBe(200);
    expect(await fileRes.text()).toBe('cart-bytes');
  });

  it('GET /:token/files/* rejects a ".." traversal segment (raw HTTP path, no client-side normalisation)', async () => {
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
    const res = await rawGet(`/api/shared/${created.share_token}/files/${projectId}/../${stored.path}`);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.text).code).toBe('INVALID_PATH');
  });

  // Fix round WARNING 2 (reviewer, 2026-09-28 18:14): the plan's D-48 amendment requires an exact
  // 400 INVALID_PATH assertion (not just "!= 200"), plus explicit encoded/absolute/malformed cases.
  // `rawGet` (raw socket), not `fetch()`: `%2e%2e` in particular is silently dot-segment-collapsed
  // by `fetch()`'s own WHATWG URL normalisation before the request is even sent (same caveat as the
  // plain ".." case above), so only a raw request line proves what the server does with it.
  it.each([
    ['encoded dot-dot (%2e%2e)', '%2e%2e'],
    ['encoded dot-dot-slash (..%2f)', '..%2f'],
    ['double-encoded dot-dot (%252e%252e)', '%252e%252e'],
    ['backslash traversal (..%5C)', '..%5C'],
  ])('GET /:token/files/* rejects %s with 400 INVALID_PATH', async (_label, segment) => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await rawGet(`/api/shared/${created.share_token}/files/${segment}/secret.png`);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.text).code).toBe('INVALID_PATH');
  });

  it.each([
    ['a leading /etc/passwd', `/${encodeURIComponent('etc/passwd')}`],
    ['a drive-letter path', encodeURIComponent('C:/secret.png')],
  ])('GET /:token/files/* rejects an absolute path (%s) with 400 INVALID_PATH', async (_label, segment) => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}/files/${segment}`);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_PATH');
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

// Fix round ERROR 1 (reviewer, 2026-09-28 18:14): a malformed percent-escape anywhere under
// `/api/shared` used to reach Express's own `Layer.match` decode (before `requireShare` or any
// handler ran) and bubble to `app.ts`'s global handler as a 500 with a stack trace. Every one of
// these five inputs must now be the exact same 404 SHARE_NOT_FOUND body, with no `stack` key.
describe('malformed percent-escapes under /api/shared (fix round ERROR 1)', () => {
  const shareNotFoundBody = { error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' };

  it.each([
    ['GET /api/shared/%', '/api/shared/%'],
    ['GET /api/shared/%E0%A4%A', '/api/shared/%E0%A4%A'],
    ['GET /api/shared/%ZZ/tracking-document.json', '/api/shared/%ZZ/tracking-document.json'],
  ])('%s -> 404 SHARE_NOT_FOUND, no stack', async (_label, rawPath) => {
    const res = await rawGet(rawPath);
    expect(res.status).toBe(404);
    const body = JSON.parse(res.text);
    expect(body).toEqual(shareNotFoundBody);
    expect(body).not.toHaveProperty('stack');
  });

  it('GET /<valid token>/% -> 404 SHARE_NOT_FOUND, no stack (malformed escape after a valid token)', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await rawGet(`/api/shared/${created.share_token}/%`);
    expect(res.status).toBe(404);
    const body = JSON.parse(res.text);
    expect(body).toEqual(shareNotFoundBody);
    expect(body).not.toHaveProperty('stack');
  });

  it('GET /<valid token>/files/% -> 404 SHARE_NOT_FOUND, no stack (malformed escape on the file wildcard)', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await rawGet(`/api/shared/${created.share_token}/files/%`);
    expect(res.status).toBe(404);
    const body = JSON.parse(res.text);
    expect(body).toEqual(shareNotFoundBody);
    expect(body).not.toHaveProperty('stack');
  });

  it('the internal (authenticated) files route gets 400 INVALID_PATH for the same malformed escape, not a 500', async () => {
    const res = await rawGet(`/api/projects/${projectId}/files/%`);
    expect(res.status).toBe(400);
    const body = JSON.parse(res.text);
    expect(body.code).toBe('INVALID_PATH');
    expect(body).not.toHaveProperty('stack');
  });
});

describe('Cache-Control: no-store on every /api/shared response (fix round LOW 2)', () => {
  it('is set on a 200 (valid token header)', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('is set on a 404 (unknown token)', async () => {
    const res = await fetch(`${baseUrl}/api/shared/not-a-real-token`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('is set on the tracking-document.json, documentation.html and files/* responses', async () => {
    const stored = await getFileStore().put(projectId, 'event_trigger', 'cc.png', Buffer.from('ok'), 'image/png');
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const doc = await fetch(`${baseUrl}/api/shared/${created.share_token}/tracking-document.json`);
    expect(doc.headers.get('cache-control')).toBe('no-store');
    const html = await fetch(`${baseUrl}/api/shared/${created.share_token}/documentation.html`);
    expect(html.headers.get('cache-control')).toBe('no-store');
    const file = await fetch(`${baseUrl}/api/shared/${created.share_token}/files/${stored.path}`);
    expect(file.headers.get('cache-control')).toBe('no-store');
  });
});

// Fix round WARNING 1 (reviewer, 2026-09-28 18:14): a non-string `access` must 400 and must not
// rotate an existing token.
describe('non-string access is rejected, not silently rotated (fix round WARNING 1)', () => {
  it.each([[123], [null], [['comment']], [{}]])('POST /:id/share with access=%j -> 400, no rotation', async (access) => {
    const before = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access }),
    });
    expect(res.status).toBe(400);
    const after = await (await fetch(`${baseUrl}/api/projects/${projectId}/share`)).json();
    expect(after.share_token).toBe(before.share_token);
  });

  it('PATCH /:id/share with a non-string access -> 400', async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: 'read' }),
    });
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: 42 }),
    });
    expect(res.status).toBe(400);
  });
});

// Fix round LOW 1 (reviewer, 2026-09-28 18:14; D-48 amendment): the shared JSON/HTML must not carry
// agent_instructions, owners, identity_note, bloomreach_project_url or any internal_* field; the
// internal document/HTML are untouched.
describe('public projection strips internal fields (fix round LOW 1, D-48 amendment)', () => {
  it('tracking-document.json: strips project.bloomreach_project_url and per-event identity_note/owners/agent_instructions; keeps not_suitable_for; internal document is untouched', async () => {
    await ProjectDAL.updateProject(projectId, { bloomreach_project_url: 'https://app.exponea.com/secret-console' });
    EventDAL.createEvent(projectId, {
      name: 'public_projection_event',
      class: 'custom',
      identity_note: 'internal identity note',
      owner_business: 'Business Owner',
      owner_technical: 'Technical Owner',
      agent_instructions: 'Secret QA agent prompt',
      not_suitable_for: 'Not suitable for X (client-facing)',
    });
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
    const internalEvent = internal.events.find((e: { name: string }) => e.name === 'public_projection_event');
    expect(internalEvent.identity_note).toBe('internal identity note');
    expect(internalEvent.owners).toEqual({ business: 'Business Owner', technical: 'Technical Owner' });
    expect(internalEvent.agent_instructions).toBe('Secret QA agent prompt');
    expect(internal.project.bloomreach_project_url).toBe('https://app.exponea.com/secret-console');

    const shared = await (
      await fetch(`${baseUrl}/api/shared/${created.share_token}/tracking-document.json`)
    ).json();
    const sharedEvent = shared.events.find((e: { name: string }) => e.name === 'public_projection_event');
    expect(sharedEvent.identity_note).toBeNull();
    expect(sharedEvent.owners).toEqual({ business: null, technical: null });
    expect('agent_instructions' in sharedEvent).toBe(false);
    expect(sharedEvent.not_suitable_for).toBe('Not suitable for X (client-facing)');
    expect(shared.project.bloomreach_project_url).toBeNull();
    expect(JSON.stringify(shared)).not.toContain('secret-console');
    expect(JSON.stringify(shared)).not.toContain('Secret QA agent prompt');
    expect(JSON.stringify(shared)).not.toContain('internal identity note');
  });

  it('documentation.html: strips identity rule and use case owner (public: true)', async () => {
    IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'public_projection_email',
      identity_type: 'hard',
      name: 'Email identity',
      owner: 'Identity Rule Owner Secret',
    });
    UseCaseDAL.createUseCase(projectId, {
      name: 'Public projection use case',
      owner: 'Use Case Owner Secret',
    });
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();

    const internalHtml = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/export/documentation.html`)
    ).text();
    expect(internalHtml).toContain('Identity Rule Owner Secret');
    expect(internalHtml).toContain('Use Case Owner Secret');

    const sharedHtml = await (
      await fetch(`${baseUrl}/api/shared/${created.share_token}/documentation.html`)
    ).text();
    expect(sharedHtml).not.toContain('Identity Rule Owner Secret');
    expect(sharedHtml).not.toContain('Use Case Owner Secret');
  });
});

// T-4-04 (D-49): the public counterpart of `routes/comments.ts`.
describe('comment visibility (D-49 amendment 2, T-4-10)', () => {
  async function createShare(access: 'read' | 'comment'): Promise<string> {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access }),
      })
    ).json();
    return created.share_token as string;
  }

  async function publicBodies(token: string, eventId: string): Promise<string[]> {
    const res = await fetch(`${baseUrl}/api/shared/${token}/comments?entity_type=event&entity_id=${eventId}`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    for (const row of rows) expect('internal_only' in row).toBe(false);
    return rows.map((r) => r.body as string);
  }

  it('an internal-only comment is absent from the public GET but present internally', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_10_internal_event', class: 'custom' }).id;
    const token = await createShare('comment');
    const postRes = await fetch(`${baseUrl}/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: 'secret', internal_only: true }),
    });
    expect(postRes.status).toBe(201);
    expect((await postRes.json()).internal_only).toBe(true);
    CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: 'open' });

    expect(await publicBodies(token, eventId)).toEqual(['open']);
    const internal = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/comments?entity_type=event&entity_id=${eventId}`)
    ).json();
    expect(internal.map((c: { body: string }) => c.body).sort()).toEqual(['open', 'secret']);
    const onlyInternal = await (await fetch(`${baseUrl}/api/projects/${projectId}/comments?internal_only=true`)).json();
    expect(onlyInternal.every((c: { internal_only: boolean }) => c.internal_only)).toBe(true);
    expect(onlyInternal.length).toBeGreaterThan(0);
  });

  it('PATCH toggles internal_only', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_10_toggle_event', class: 'custom' }).id;
    const token = await createShare('read');
    const c = CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: 'toggle me' });
    expect(await publicBodies(token, eventId)).toEqual(['toggle me']);
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/comments/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_only: true }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).internal_only).toBe(true);
    expect(await publicBodies(token, eventId)).toEqual([]);
  });

  it('via_share_only hides internal non-flagged comments and keeps via-share ones', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_10_via_event', class: 'custom' }).id;
    const token = await createShare('comment');
    CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: 'team note' });
    CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Client', body: 'client note', via_share: true });
    expect((await publicBodies(token, eventId)).sort()).toEqual(['client note', 'team note']);

    const patch = await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_comments: 'via_share_only' }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json()).share_comments).toBe('via_share_only');
    expect((await (await fetch(`${baseUrl}/api/projects/${projectId}/share`)).json()).share_comments).toBe('via_share_only');
    expect(await publicBodies(token, eventId)).toEqual(['client note']);

    await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_comments: 'all' }),
    });
  });

  it('internal_only through the share POST is 400 FIELD_NOT_ALLOWED', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_10_post_event', class: 'custom' }).id;
    const token = await createShare('comment');
    const res = await fetch(`${baseUrl}/api/shared/${token}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'C', body: 'x', internal_only: true }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FIELD_NOT_ALLOWED');
  });

  it.each([['nope'], [1], [null], [['all']]])('share PATCH with share_comments=%j -> 400', async (value) => {
    await createShare('read');
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_comments: value }),
    });
    expect(res.status).toBe(400);
  });
});

describe('public GET/POST /api/shared/:token/comments (T-4-04, D-49)', () => {
  async function createShare(access: 'read' | 'comment'): Promise<string> {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access }),
      })
    ).json();
    return created.share_token as string;
  }

  it('POST with read access is 403 SHARE_READ_ONLY', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_04_read_event', class: 'custom' }).id;
    const token = await createShare('read');
    const res = await fetch(`${baseUrl}/api/shared/${token}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'Client', body: 'Hello' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SHARE_READ_ONLY');
  });

  it('POST with comment access is 201, carries via_share: true, and is visible through the internal list', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_04_comment_event', class: 'custom' }).id;
    const token = await createShare('comment');
    const res = await fetch(`${baseUrl}/api/shared/${token}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'Client', body: 'Great, thanks!' }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.via_share).toBe(true);
    expect(created.author_name).toBe('Client');
    expect(created.body).toBe('Great, thanks!');

    const internalRes = await fetch(`${baseUrl}/api/projects/${projectId}/comments?entity_type=event&entity_id=${eventId}`);
    const internalList = await internalRes.json();
    expect(internalList.some((c: { id: string; via_share: boolean }) => c.id === created.id && c.via_share === true)).toBe(true);
  });

  // D-49 amendment (fix round): comments are one shared thread -- a comment posted internally
  // (never through this share route, `via_share: false`) IS returned by the public GET, not just
  // one posted through the link itself. The public projection still strips project_id/resolved_by/
  // resolved_at (internal-only fields), but `via_share` and every other field pass through as-is.
  it('GET lists comments posted internally too (D-49 amendment: one shared thread), and the public projection has no internal-only fields', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_04_projection_event', class: 'custom' }).id;
    const internalComment = CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Team',
      body: 'Internal note',
    });
    expect(internalComment.via_share).toBe(false);
    CommentDAL.setCommentResolved(projectId, internalComment.id, true, 'jan');
    const token = await createShare('read');
    const res = await fetch(`${baseUrl}/api/shared/${token}/comments?entity_type=event&entity_id=${eventId}`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].via_share).toBe(false);
    expect(rows[0]).not.toHaveProperty('project_id');
    expect(rows[0]).not.toHaveProperty('resolved_by');
    expect(rows[0]).not.toHaveProperty('resolved_at');
    expect(rows[0].body).toBe('Internal note');
  });

  it('GET with no entity filter returns every comment for the project in one request (W1: the page-level fetch)', async () => {
    // A fresh project (not the shared `projectId`, which other tests in this describe block also
    // post comments to) so the unfiltered count is exact, not just "includes".
    const freshClient = ClientDAL.createClient({ key: 't4-04-unfiltered', name: 'T-4-04 Unfiltered' });
    const freshProjectId = ProjectDAL.createProject({ client_id: freshClient.id, key: 't4-04-unfiltered-proj', name: 'Unfiltered' }).id;
    const eventId = EventDAL.createEvent(freshProjectId, { name: 't4_04_unfiltered_event', class: 'custom' }).id;
    const otherEventId = EventDAL.createEvent(freshProjectId, { name: 't4_04_unfiltered_event_2', class: 'custom' }).id;
    CommentDAL.createComment(freshProjectId, { entity_type: 'event', entity_id: eventId, author_name: 'A', body: 'one' });
    CommentDAL.createComment(freshProjectId, { entity_type: 'event', entity_id: otherEventId, author_name: 'B', body: 'two' });
    const created = await (
      await fetch(`${baseUrl}/api/projects/${freshProjectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'read' }),
      })
    ).json();
    const res = await fetch(`${baseUrl}/api/shared/${created.share_token}/comments`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { body: string }) => r.body).sort()).toEqual(['one', 'two']);
  });

  it('resolved is rejected through the share route with 400 FIELD_NOT_ALLOWED', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_04_resolved_event', class: 'custom' }).id;
    const token = await createShare('comment');
    const res = await fetch(`${baseUrl}/api/shared/${token}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'Client', body: 'Hi', resolved: true }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FIELD_NOT_ALLOWED');
  });

  it('rejects an anchor belonging to another project', async () => {
    const otherClient = ClientDAL.createClient({ key: 't4-04-other', name: 'Other T-4-04' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 't4-04-other-proj', name: 'Other T-4-04' }).id;
    const otherEventId = EventDAL.createEvent(otherProjectId, { name: 'other_project_event', class: 'custom' }).id;
    const token = await createShare('comment');
    const res = await fetch(`${baseUrl}/api/shared/${token}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'event', entity_id: otherEventId, author_name: 'Client', body: 'Hi' }),
    });
    expect(res.status).toBe(404);
  });

  it('rate limits after 60 posts per token with 429', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 't4_04_rate_limit_event', class: 'custom' }).id;
    const token = await createShare('comment');
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await fetch(`${baseUrl}/api/shared/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'Client', body: `post ${i}` }),
      });
      lastStatus = res.status;
      if (i < 60) expect(res.status).toBe(201);
    }
    expect(lastStatus).toBe(429);
  }, 20000);
});
