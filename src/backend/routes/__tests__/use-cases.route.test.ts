/**
 * Route-level coverage (T-1-07): use case CRUD under `/api/projects/:projectId/use-cases`,
 * `PUT .../requirements`, `POST .../from-template/:templateId`, the global
 * `/api/use-case-templates` list, `GET /api/projects/:projectId/requirements-matrix`, and the
 * event editor's read-only `GET /api/projects/:projectId/events/:id/use-cases`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as PropertyDAL from '../../dal/property.dal';
import * as UseCaseTemplateDAL from '../../dal/use-case-template.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;
let eventId: string;
let customerPropertyId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'checkout' }).id;
  customerPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'customer',
    name: 'email',
    data_type: 'string',
  }).id;

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

describe('use case CRUD and requirements', () => {
  let useCaseId: string;

  it('creates a use case with an auto-generated code', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Checkout flow', type: 'transactional' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe('UC-01');
    useCaseId = body.id;
  });

  it('lists use cases', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.some((uc: { id: string }) => uc.id === useCaseId)).toBe(true);
  });

  it('gets a use case with its (empty) requirements', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${useCaseId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requirements).toEqual([]);
  });

  it('replaces the ordered requirement list', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${useCaseId}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: [
          { target_kind: 'event', event_id: eventId, level: 'R' },
          { target_kind: 'customer_property', property_id: customerPropertyId, level: 'O' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((r: { target_kind: string }) => r.target_kind)).toEqual(['event', 'customer_property']);
  });

  it('returns 400 REQUIREMENT_TARGET_INVALID for a bad target combination', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${useCaseId}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: [{ target_kind: 'event', event_id: eventId, property_id: customerPropertyId, level: 'R' }],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('REQUIREMENT_TARGET_INVALID');
  });

  it('updates and soft-deletes a use case', async () => {
    const patchRes = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${useCaseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).status).toBe('approved');

    const deleteRes = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${useCaseId}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(204);

    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases`);
    const list = await listRes.json();
    expect(list.some((uc: { id: string }) => uc.id === useCaseId)).toBe(false);
  });
});

describe('use case templates and requirements matrix', () => {
  it('lists global use case templates (read-only)', async () => {
    UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T1',
      name: 'Newsletter signup',
      type: 'marketing',
      default_requirements_json: [{ target_kind: 'event', event_name: 'checkout', level: 'R' }],
    });
    const res = await fetch(`${baseUrl}/api/use-case-templates`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.some((t: { code: string }) => t.code === 'UC-T1')).toBe(true);
  });

  it('instantiates a use case from a template', async () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T2',
      name: 'Checkout tracking',
      type: 'transactional',
      default_requirements_json: [{ target_kind: 'event', event_name: 'checkout', level: 'R' }],
    });
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/from-template/${template.id}`, {
      method: 'POST',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Checkout tracking');
    expect(body.template_id).toBe(template.id);
  });

  it('computes the requirements matrix', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/requirements-matrix`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.use_cases)).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.some((r: { label: string }) => r.label === 'checkout')).toBe(true);
  });

  it('lists use cases referencing an event from the event editor', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/use-cases`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
