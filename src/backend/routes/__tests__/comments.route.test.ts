/**
 * Route-level coverage for T-4-02 (D-49): `GET/POST /api/projects/:projectId/comments`,
 * `PATCH /comments/:id` (resolve toggle), `DELETE /comments/:id`. qa-tester scenario: post a
 * comment on an event through the API, it appears on the Comments page (this test's list assertion
 * is the API half of that).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;
let eventId: string;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { res, body: await res.json() };
}

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' }).id;

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

describe('POST /api/projects/:projectId/comments', () => {
  it('creates a comment and it appears in the list with a resolved entity_label', async () => {
    const created = await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'Please confirm the trigger.',
    });
    expect(created.res.status).toBe(201);
    expect(created.body.entity_label).toBe('cart_update');
    expect(created.body.via_share).toBe(false);
    expect(created.body.resolved_at).toBeNull();

    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/comments`);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.body.id);
    expect(list[0].entity_label).toBe('cart_update');
  });

  it('404s on an unknown entity id', async () => {
    const res = await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'event',
      entity_id: 'not-a-real-id',
      author_name: 'Jan',
      body: 'x',
    });
    expect(res.res.status).toBe(404);
  });

  it('400s on a missing body', async () => {
    const res = await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: '',
    });
    expect(res.res.status).toBe(400);
  });
});

describe('GET /api/projects/:projectId/comments filters', () => {
  it('filters by entity_type/entity_id/resolved', async () => {
    const property = await postJson(`${baseUrl}/api/projects/${projectId}/properties`, {
      scope: 'customer',
      name: 'comments_filter_test',
      data_type: 'string',
    });
    const onEvent = await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'on event',
    });
    await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'property',
      entity_id: property.body.id,
      author_name: 'Jan',
      body: 'on property',
    });

    const byType = await (await fetch(`${baseUrl}/api/projects/${projectId}/comments?entity_type=property`)).json();
    expect(byType.every((c: { entity_type: string }) => c.entity_type === 'property')).toBe(true);

    const byEntity = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/comments?entity_id=${eventId}`)
    ).json();
    expect(byEntity.every((c: { entity_id: string }) => c.entity_id === eventId)).toBe(true);
    expect(byEntity.some((c: { id: string }) => c.id === onEvent.body.id)).toBe(true);
  });
});

describe('PATCH /api/projects/:projectId/comments/:id (resolve toggle)', () => {
  it('resolves and reopens', async () => {
    const created = await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'resolve me',
    });

    const resolvedRes = await fetch(`${baseUrl}/api/projects/${projectId}/comments/${created.body.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved: true }),
    });
    expect(resolvedRes.status).toBe(200);
    const resolved = await resolvedRes.json();
    expect(resolved.resolved_at).toBeTruthy();
    expect(resolved.resolved_by).toBeTruthy();

    const resolvedOnlyList = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/comments?resolved=true`)
    ).json();
    expect(resolvedOnlyList.some((c: { id: string }) => c.id === created.body.id)).toBe(true);

    const reopenRes = await fetch(`${baseUrl}/api/projects/${projectId}/comments/${created.body.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved: false }),
    });
    const reopened = await reopenRes.json();
    expect(reopened.resolved_at).toBeNull();
  });
});

describe('DELETE /api/projects/:projectId/comments/:id', () => {
  it('deletes a comment', async () => {
    const created = await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'delete me',
    });
    const deleteRes = await fetch(`${baseUrl}/api/projects/${projectId}/comments/${created.body.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(204);

    const list = await (await fetch(`${baseUrl}/api/projects/${projectId}/comments`)).json();
    expect(list.some((c: { id: string }) => c.id === created.body.id)).toBe(false);
  });
});
