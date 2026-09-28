/**
 * Route-level coverage (T-1-05): variant CRUD under `/api/projects/:projectId/events/:id/variants`
 * and standard-event-mapping CRUD under `/api/projects/:projectId/standard-event-mappings`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb, getDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as PropertyDAL from '../../dal/property.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;
let eventId: string;
let actionPropertyId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;
  actionPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  }).id;
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: actionPropertyId, role: 'discriminator' });

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

describe('POST /api/projects/:projectId/events/:id/variants', () => {
  it('creates a variant and returns the generated name', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('cart_update[action=add]');
  });

  it('returns 400 CONDITION_NOT_DISCRIMINATOR for a non-discriminator property', async () => {
    const normalPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'not_a_discriminator',
      data_type: 'string',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: normalPropertyId, role: 'normal' });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditions: [{ property_id: normalPropertyId, operator: 'equals', values: ['x'] }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('CONDITION_NOT_DISCRIMINATOR');
  });

  // `event.dal.ts` already refuses a third `discriminator`-role attach (D-03 rule 3), so this
  // simulates "three discriminators exist" by flipping the third property's role directly in the
  // DB, to exercise `variant.dal.ts`'s own defense-in-depth `MAX_DISCRIMINATORS` count.
  it('returns 400 MAX_DISCRIMINATORS for a third discriminator property', async () => {
    const channelId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'channel',
      data_type: 'string',
      allowed_values_json: [{ value: 'web' }],
    }).id;
    const sizeId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'size',
      data_type: 'string',
      allowed_values_json: [{ value: 'XS' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: channelId, role: 'discriminator' });
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: sizeId, role: 'normal' });
    getDb()
      .prepare('UPDATE event_properties SET role = ? WHERE event_id = ? AND property_id = ?')
      .run('discriminator', eventId, sizeId);

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conditions: [
          { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
          { property_id: channelId, operator: 'equals', values: ['web'] },
          { property_id: sizeId, operator: 'equals', values: ['XS'] },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MAX_DISCRIMINATORS');
  });
});

// D-52 / T-2-05 follow-up (T-3-07): DELETE /events/:id/variants/:variantId refuses a variant a
// standard event mapping still targets, unless ?force=true.
describe('DELETE /api/projects/:projectId/events/:id/variants/:variantId (D-52 MAPPING_IN_USE)', () => {
  it('returns 409 MAPPING_IN_USE when a standard event mapping still targets the variant, then 204 with ?force=true clears the mapping instead', async () => {
    const variantRes = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditions: [{ property_id: actionPropertyId, operator: 'in', values: ['add', 'remove'] }] }),
    });
    expect(variantRes.status).toBe(201);
    const variant = await variantRes.json();

    const mappingRes = await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings/add_to_cart`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, variant_id: variant.id }),
    });
    expect(mappingRes.status).toBe(200);

    const refused = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/variants/${variant.id}`, {
      method: 'DELETE',
    });
    expect(refused.status).toBe(409);
    const refusedBody = await refused.json();
    expect(refusedBody.code).toBe('MAPPING_IN_USE');
    expect(refusedBody.error).toContain('add_to_cart');

    const forced = await fetch(`${baseUrl}/api/projects/${projectId}/events/${eventId}/variants/${variant.id}?force=true`, {
      method: 'DELETE',
    });
    expect(forced.status).toBe(204);

    const mappingListRes = await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings`);
    const mappingList = await mappingListRes.json();
    const cleared = mappingList.find((m: { standard_event: string }) => m.standard_event === 'add_to_cart');
    expect(cleared).toBeTruthy();
    expect(cleared.variant_id).toBeNull();
  });
});

describe('PUT /api/projects/:projectId/standard-event-mappings/:standardEvent', () => {
  it('creates a mapping to a seed standard event', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings/checkout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.standard_event).toBe('checkout');
  });

  it('returns 400 UNKNOWN_STANDARD_EVENT for an unknown key', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings/not_real`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('UNKNOWN_STANDARD_EVENT');
  });

  it('appends a custom standard event addition and maps it', async () => {
    const projectRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standard_event_additions_json: [{ key: 'loyalty_scan', fields: ['card_id'] }] }),
    });
    expect(projectRes.status).toBe(200);

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings/loyalty_scan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.standard_event).toBe('loyalty_scan');
  });

  it('lists mappings and deletes one', async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings/view_item`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    });
    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings`);
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.some((m: { standard_event: string }) => m.standard_event === 'view_item')).toBe(true);

    const deleteRes = await fetch(`${baseUrl}/api/projects/${projectId}/standard-event-mappings/view_item`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(204);
  });
});
