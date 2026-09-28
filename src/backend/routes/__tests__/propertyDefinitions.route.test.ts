/**
 * Route-level coverage for property definitions (D-58, T-4-00):
 * `/api/projects/:projectId/properties/:id/definitions`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as PropertyDAL from '../../dal/property.dal';

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

describe('property definitions routes', () => {
  it('lists the seeded "general" definition, creates a second, and rejects deleting the last one', async () => {
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string' });

    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/properties/${property.id}/definitions`);
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('general');

    const createRes = await fetch(`${baseUrl}/api/projects/${projectId}/properties/${property.id}/definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'consent_action', description: 'accept or reject' }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe('consent_action');

    const patchRes = await fetch(
      `${baseUrl}/api/projects/${projectId}/properties/${property.id}/definitions/${created.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'updated' }) }
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).description).toBe('updated');

    const deleteRes = await fetch(
      `${baseUrl}/api/projects/${projectId}/properties/${property.id}/definitions/${created.id}`,
      { method: 'DELETE' }
    );
    expect(deleteRes.status).toBe(204);

    const [remaining] = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/properties/${property.id}/definitions`)
    ).json();
    const lastDeleteRes = await fetch(
      `${baseUrl}/api/projects/${projectId}/properties/${property.id}/definitions/${remaining.id}`,
      { method: 'DELETE' }
    );
    expect(lastDeleteRes.status).toBe(409);
  });
});
