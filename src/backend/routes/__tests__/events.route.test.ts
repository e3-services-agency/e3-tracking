/**
 * Route-level coverage for T-1-04 fix round WARNING 6: a 400 from the DAL validators
 * (`event.dal.ts`, `property.dal.ts`) must reach the HTTP client with a `field` in the JSON body
 * (`handleRouteError` -> `BadRequestError.field`), not just as a DAL-level thrown error.
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

describe('POST /api/projects/:projectId/events (field validation, T-1-04 fix round)', () => {
  it('returns 400 with code and field for an invalid class', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'route_event_1', class: 'weird' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.field).toBe('class');
  });

  it('returns 400 with code and field for a malformed expiration_json', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'route_event_2',
        expiration_json: { enabled: true, count: 'abc', units: 'fortnights' },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.field).toBe('expiration_json');
  });
});

describe('POST /api/projects/:projectId/events/:id/properties (role validation, T-1-04 fix round)', () => {
  it('returns 400 ROLE_REQUIRES_ENUM with field "role" for a non-enum property', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'route_purchase' });
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'route_note',
      data_type: 'string',
    });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${event.id}/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: property.id, role: 'discriminator' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('ROLE_REQUIRES_ENUM');
    expect(body.field).toBe('role');
  });
});

describe('NAME_NOT_ASCII at the HTTP level (T-2-12 fix round LOW 4)', () => {
  it('POST /api/projects/:projectId/events with a diacritic returns 400 NAME_NOT_ASCII, field "name"', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'inscription_é' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('NAME_NOT_ASCII');
    expect(body.field).toBe('name');
  });

  it('POST /api/projects/:projectId/properties with a diacritic returns 400 NAME_NOT_ASCII, field "name"', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'event', name: 'préférence', data_type: 'string' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('NAME_NOT_ASCII');
    expect(body.field).toBe('name');
  });
});

describe('PATCH /api/projects/:projectId/properties/:id (ENUM_IN_USE, T-1-04 fix round ERROR 3)', () => {
  it('returns 400 ENUM_IN_USE with field "allowed_values_json" when a discriminator loses an in-use value', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'route_checkout' });
    const action = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'route_action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, role: 'discriminator' });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/properties/${action.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_values_json: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('ENUM_IN_USE');
    expect(body.field).toBe('allowed_values_json');
  });
});
