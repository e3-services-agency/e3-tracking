/**
 * End-to-end HTTP coverage for the identity-rules and consent-categories routers (LOW 6, T-1-06
 * integration fix round): create, list order, 400 on a bad identity_type, 409 on a duplicate
 * consent category name. Exercised through a real Express server so route-level wiring
 * (`inputFromBody`, `handleRouteError`, status codes) is covered, not just the DAL directly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';

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

function jsonRequest(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST/GET /api/projects/:projectId/identity-rules', () => {
  it('creates rules and lists them in sort_order (creation order by default)', async () => {
    const createA = await jsonRequest('POST', `/api/projects/${projectId}/identity-rules`, {
      identifier_name: 'registered_email',
      identity_type: 'hard',
      name: 'Registration email',
    });
    expect(createA.status).toBe(201);
    const a = await createA.json();

    const createB = await jsonRequest('POST', `/api/projects/${projectId}/identity-rules`, {
      identifier_name: 'anon_cookie',
      identity_type: 'soft',
      name: 'Anonymous cookie',
    });
    expect(createB.status).toBe(201);
    const b = await createB.json();

    const list = await jsonRequest('GET', `/api/projects/${projectId}/identity-rules`);
    expect(list.status).toBe(200);
    const rows = await list.json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual([a.id, b.id]);
  });

  it('returns 400 on a bad identity_type', async () => {
    const res = await jsonRequest('POST', `/api/projects/${projectId}/identity-rules`, {
      identifier_name: 'weak_field',
      identity_type: 'not_a_real_type',
      name: 'Bad rule',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('identity_type');
  });
});

describe('GET /api/projects/:projectId/identity-rules/codegen (T-2-12 fix round LOW 4)', () => {
  it('returns identify/update/anonymize snippets built from this project\'s rules', async () => {
    // Own project: `projectId` above already carries a "registered_email" hard rule from an earlier
    // test in this file, which would push the identify snippet into its multi-id object form.
    const client = ClientDAL.createClient({ key: 'codegen-acme', name: 'Codegen Acme' });
    const codegenProjectId = ProjectDAL.createProject({
      client_id: client.id,
      key: 'codegen-acme-eu',
      name: 'Codegen Acme EU',
    }).id;

    const createHard = await jsonRequest('POST', `/api/projects/${codegenProjectId}/identity-rules`, {
      identifier_name: 'registered',
      identity_type: 'hard',
      name: 'Registration',
      sdk_call: 'identify',
      transformations_json: ['trim', 'lowercase'],
    });
    expect(createHard.status).toBe(201);

    const res = await jsonRequest('GET', `/api/projects/${codegenProjectId}/identity-rules/codegen`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('identify');
    expect(body).toHaveProperty('update');
    expect(body).toHaveProperty('anonymize');
    expect(body.identify).toContain('exponea.identify(String(registered).trim().toLowerCase());');
  });
});

describe('POST/GET /api/projects/:projectId/consent-categories', () => {
  it('creates categories and lists them in sort_order (creation order by default)', async () => {
    const createA = await jsonRequest('POST', `/api/projects/${projectId}/consent-categories`, {
      name: 'Newsletter consent',
      standard_key: 'newsletter',
    });
    expect(createA.status).toBe(201);
    const a = await createA.json();

    const createB = await jsonRequest('POST', `/api/projects/${projectId}/consent-categories`, {
      name: 'SMS consent',
      standard_key: 'sms',
    });
    expect(createB.status).toBe(201);
    const b = await createB.json();

    const list = await jsonRequest('GET', `/api/projects/${projectId}/consent-categories`);
    expect(list.status).toBe(200);
    const rows = await list.json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual([a.id, b.id]);
  });

  it('returns 409 on a duplicate consent category name', async () => {
    await jsonRequest('POST', `/api/projects/${projectId}/consent-categories`, { name: 'Duplicate name' });
    const res = await jsonRequest('POST', `/api/projects/${projectId}/consent-categories`, {
      name: 'Duplicate name',
    });
    expect(res.status).toBe(409);
  });
});
