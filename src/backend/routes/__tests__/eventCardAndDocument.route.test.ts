/**
 * Route-level coverage for T-2-08: `GET /events/:id/card`, `GET /events/:id/certification`,
 * `GET /events/:id/coverage`, `GET /export/tracking-document.json` (incl. `?version=`).
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

let server: http.Server;
let baseUrl: string;
let projectId: string;
let eventId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;

  const event = EventDAL.createEvent(projectId, { name: 'route_cart_update', class: 'custom' });
  eventId = event.id;
  const location = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'route_location',
    data_type: 'string',
    allowed_values_json: [{ value: 'web' }, { value: 'app' }],
  });
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: location.id, role: 'context' });

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

describe('GET /api/projects/:projectId/events/:id/card', () => {
  it('returns the EventCard with properties, contexts and a not-yet-certified block (no observations)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/card`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.name).toBe('route_cart_update');
    expect(card.properties).toHaveLength(1);
    expect(card.contexts).toHaveLength(1);
    expect(card.certification).toEqual({ applicable: true, certified: false, reasons: ['no_observations'] });
  });

  it('404s for an unknown event id', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/does-not-exist/card`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/events/:id/certification', () => {
  it('returns just the certification block', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/certification`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ applicable: true, certified: false, reasons: ['no_observations'] });
  });
});

describe('GET /api/projects/:projectId/events/:id/coverage', () => {
  it('returns the full grid (rows/columns/cells/unobserved)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/coverage`);
    expect(res.status).toBe(200);
    const grid = await res.json();
    expect(grid.columns).toHaveLength(1);
    expect(grid.columns[0].values).toEqual(['web', 'app']);
    expect(grid.unobserved.length).toBeGreaterThan(0);
  });
});

describe('GET /api/projects/:projectId/export/tracking-document.json', () => {
  it('returns the document with format/version and the event in it', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/tracking-document.json`);
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.format).toBe('e3-tracking-document');
    expect(doc.version).toBe(1);
    expect(doc.events.some((e: { name: string }) => e.name === 'route_cart_update')).toBe(true);
  });

  it('accepts ?version=1 explicitly, and 400s on an unsupported version', async () => {
    const ok = await fetch(`${baseUrl}/api/projects/${projectId}/export/tracking-document.json?version=1`);
    expect(ok.status).toBe(200);

    const bad = await fetch(`${baseUrl}/api/projects/${projectId}/export/tracking-document.json?version=99`);
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(body.field).toBe('version');
  });
});
