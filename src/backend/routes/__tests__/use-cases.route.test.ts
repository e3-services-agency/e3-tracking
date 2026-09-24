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

  it('returns 400 REQUIREMENT_DUPLICATE for the same target twice (fix round LOW 6)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${useCaseId}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: [
          { target_kind: 'customer_property', property_id: customerPropertyId, level: 'R' },
          { target_kind: 'customer_property', property_id: customerPropertyId, level: 'O' },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('REQUIREMENT_DUPLICATE');
  });

  it('PATCH with an unknown template_id is 404, not 500 (fix round LOW 5)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${useCaseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: 'does-not-exist' }),
    });
    expect(res.status).toBe(404);
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

  it('deleting an event referenced by a use case marks its requirements gap end to end (fix round ERROR 2)', async () => {
    const doomedEvent = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'doomed_event' }),
      })
    ).json();

    const ucRes = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Doomed use case' }),
    });
    const uc = await ucRes.json();
    await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${uc.id}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements: [{ target_kind: 'event', event_id: doomedEvent.id, level: 'R' }] }),
    });

    const deleteRes = await fetch(`${baseUrl}/api/projects/${projectId}/events/${doomedEvent.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(204);

    // 1. Opening the use case shows the requirement as gap with a nulled event_id, not a dangling id.
    const ucDetail = await (await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${uc.id}`)).json();
    expect(ucDetail.requirements).toHaveLength(1);
    expect(ucDetail.requirements[0].event_id).toBeNull();
    expect(ucDetail.requirements[0].status).toBe('gap');
    expect(ucDetail.requirements[0].note).toContain('target removed: doomed_event');

    // 2. The requirements matrix resolves the row to "(removed): ...", not the deleted event's uuid
    // (second fix round ERROR A: the label is suffixed with the row's own note so several removed
    // rows never collapse into one).
    const matrix = await (await fetch(`${baseUrl}/api/projects/${projectId}/requirements-matrix`)).json();
    const row = matrix.rows.find((r: { cells: Record<string, string | null> }) => r.cells[uc.id]);
    expect(row.label).toMatch(/^\(removed\): /);
    expect(row.label).not.toContain(doomedEvent.id);

    // 3. The use case list is still saveable unchanged (the whole point of marking it gap).
    const resaveRes = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${uc.id}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements: ucDetail.requirements }),
    });
    expect(resaveRes.status).toBe(200);

    // 4. The docs export also resolves to "(removed)", never the raw uuid.
    const docsHtml = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/export/documentation.html`)
    ).text();
    expect(docsHtml).toContain('(removed)');
    expect(docsHtml).not.toContain(doomedEvent.id);
  });

  it('detaching properties through PUT /events/:id/properties (the Edit Event panel path) marks their requirements gap too (second fix round ERROR B)', async () => {
    const pairedEvent = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'paired_event' }),
      })
    ).json();
    const propertyA = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'event', name: 'paired_total', data_type: 'number' }),
      })
    ).json();
    const propertyB = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'event', name: 'paired_qty', data_type: 'number' }),
      })
    ).json();
    await fetch(`${baseUrl}/api/projects/${projectId}/events/${pairedEvent.id}/properties`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: [
          { property_id: propertyA.id, role: 'normal' },
          { property_id: propertyB.id, role: 'normal' },
        ],
      }),
    });

    const ucRes = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Paired use case' }),
    });
    const uc = await ucRes.json();
    await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${uc.id}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: [
          { target_kind: 'event_property', event_id: pairedEvent.id, property_id: propertyA.id, level: 'R' },
          { target_kind: 'event_property', event_id: pairedEvent.id, property_id: propertyB.id, level: 'O' },
        ],
      }),
    });

    // The Edit Event panel always saves the whole property list; removing both properties from it
    // is the PUT path, never the single-property DELETE endpoint.
    const putRes = await fetch(`${baseUrl}/api/projects/${projectId}/events/${pairedEvent.id}/properties`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: [] }),
    });
    expect(putRes.status).toBe(200);

    const ucDetail = await (await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${uc.id}`)).json();
    expect(ucDetail.requirements).toHaveLength(2);
    for (const row of ucDetail.requirements) {
      expect(row.status).toBe('gap');
      expect(row.property_id).toBeNull();
    }

    // The use case is still saveable unchanged, and the matrix keeps both rows distinct.
    const resaveRes = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/${uc.id}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements: ucDetail.requirements }),
    });
    expect(resaveRes.status).toBe(200);

    const matrix = await (await fetch(`${baseUrl}/api/projects/${projectId}/requirements-matrix`)).json();
    const rows = matrix.rows.filter((r: { cells: Record<string, string | null> }) => r.cells[uc.id]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r: { label: string }) => r.label)).size).toBe(2);
  });

  it('lists use cases referencing an event from the event editor', async () => {
    // Strengthened (fix round LOW 8, was only `length > 0`): the CRUD block above soft-deleted its
    // use case (also targeting `checkout`), so the only *live* use case left referencing this event
    // is the one instantiated from the template just above — assert that exact identity, not just
    // "something came back".
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/use-cases`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((uc: { name: string }) => uc.name)).toEqual(['Checkout tracking']);
  });
});
