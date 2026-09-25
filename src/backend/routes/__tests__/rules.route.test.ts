/**
 * Route-level coverage (D-30, D-31, T-2-06): rule CRUD under
 * `/api/projects/:projectId/events/:id/rules` and `/api/projects/:projectId/rules/:id`, templates
 * under `/api/projects/:projectId/rule-templates` and `/events/:id/rules/from-template/:key`, and
 * `item_schema_json`/money tolerance on the properties/projects routes.
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
let productIdPropId: string;
let productListPropId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;

  productIdPropId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string' }).id;
  productListPropId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'product_list',
    data_type: 'array',
    item_schema_json: [{ field: 'product_id', data_type: 'string', required: true }],
  }).id;
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: productIdPropId, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: productListPropId, role: 'normal' });

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

describe('POST /api/projects/:projectId/events/:id/rules', () => {
  it('creates a membership rule', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'membership',
        name: 'item_in_list',
        expression_json: {
          kind: 'membership',
          needle: { ref: 'property', property_id: productIdPropId },
          haystack: { property_id: productListPropId, field: 'product_id' },
        },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.kind).toBe('membership');
    expect(body.report_kind).toBe('rule_violation');
  });

  it('returns 400 RULE_EXPRESSION_INVALID for an unlinked property ref', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'membership',
        name: 'bad_rule',
        expression_json: {
          kind: 'membership',
          needle: { ref: 'property', property_id: 'not_linked' },
          haystack: { property_id: productListPropId, field: 'product_id' },
        },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('RULE_EXPRESSION_INVALID');
  });
});

describe('GET /api/projects/:projectId/events/:id/rules', () => {
  it('lists rules for the event', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/rules`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PATCH/DELETE /api/projects/:projectId/rules/:id', () => {
  it('updates a rule (version increments) and then deletes it', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'membership',
          name: 'to_update',
          expression_json: {
            kind: 'membership',
            needle: { ref: 'property', property_id: productIdPropId },
            haystack: { property_id: productListPropId, field: 'product_id' },
          },
        }),
      })
    ).json();
    expect(created.version).toBe(1);

    const patched = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/rules/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
    ).json();
    expect(patched.version).toBe(2);
    expect(patched.enabled).toBe(false);

    const deleteRes = await fetch(`${baseUrl}/api/projects/${projectId}/rules/${created.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(204);

    const getRes = await fetch(`${baseUrl}/api/projects/${projectId}/rules/${created.id}`);
    expect(getRes.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/rule-templates', () => {
  it('returns the four seed templates with applicable computed for event_id', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/rule-templates?event_id=${eventId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { key: string; applicable: boolean }[];
    expect(body).toHaveLength(4);
    expect(body.find((t) => t.key === 'cart_update_item_in_list')?.applicable).toBe(true);
  });
});

describe('POST /api/projects/:projectId/events/:id/rules/from-template/:key', () => {
  it('creates rule(s) from a template', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/rules/from-template/cart_update_item_in_list`, {
      method: 'POST',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].template_key).toBe('cart_update_item_in_list');
  });

  it('404s for an unknown template key', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/rules/from-template/nope`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });
});

describe('item_schema_json on POST/PATCH /properties (400 ITEM_SCHEMA_REQUIRES_ARRAY)', () => {
  it('rejects item_schema_json on a non-array property', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'event',
        name: 'total_price_route_test',
        data_type: 'number',
        item_schema_json: [{ field: 'x', data_type: 'string' }],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('ITEM_SCHEMA_REQUIRES_ARRAY');
  });

  it('accepts item_schema_json on an array property', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'event',
        name: 'items_route_test',
        data_type: 'array',
        item_schema_json: [{ field: 'x', data_type: 'string' }],
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/projects/:projectId accepts money_tolerance_percent/floor', () => {
  it('updates the tolerance fields', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ money_tolerance_percent: 2, money_tolerance_floor: 0.05 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.money_tolerance_percent).toBe(2);
    expect(body.money_tolerance_floor).toBe(0.05);
  });
});
