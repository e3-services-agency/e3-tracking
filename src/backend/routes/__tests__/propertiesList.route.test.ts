/** T-4-26: `GET /properties` carries batched `definitions[]` and `used_by_events[]` (additive). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as PropertyDAL from '../../dal/property.dal';
import * as EventDAL from '../../dal/event.dal';
import * as PropertyDefinitionDAL from '../../dal/property-definition.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('GET /properties definitions and usage (T-4-26)', () => {
  it('lists definitions with their using events and the events using each property', async () => {
    const action = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string', allowed_values_json: [{ value: 'add' }] });
    const unused = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'unused', data_type: 'string' });
    const consent = PropertyDefinitionDAL.createDefinition(projectId, action.id, { name: 'consent action', description: 'Consent' });
    const cart = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' } as never);
    const cons = EventDAL.createEvent(projectId, { name: 'consent', class: 'custom' } as never);
    EventDAL.attachPropertyToEvent(projectId, cart.id, { property_id: action.id, role: 'discriminator' });
    EventDAL.attachPropertyToEvent(projectId, cons.id, { property_id: action.id, definition_id: consent.id });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/properties`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as any[];
    const a = rows.find((r) => r.id === action.id);
    expect(a.name).toBe('action');
    expect(a.used_by_events.map((e: any) => [e.name, e.role]).sort()).toEqual([['cart_update', 'discriminator'], ['consent', 'normal']]);
    expect(a.definitions.map((d: any) => d.name).sort()).toEqual(['consent action', 'general']);
    expect(a.definitions.find((d: any) => d.name === 'consent action').using_events).toEqual([{ id: cons.id, name: 'consent' }]);
    expect(a.definitions.find((d: any) => d.name === 'general').using_events.map((e: any) => e.name)).toEqual(['cart_update']);
    const u = rows.find((r) => r.id === unused.id);
    expect(u.used_by_events).toEqual([]);
    expect(u.definitions).toHaveLength(1);
  });

  it('ignores soft-deleted events', async () => {
    const prop = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'ghost_prop', data_type: 'string' });
    const ev = EventDAL.createEvent(projectId, { name: 'ghost_event', class: 'custom' } as never);
    EventDAL.attachPropertyToEvent(projectId, ev.id, { property_id: prop.id });
    EventDAL.deleteEvent(projectId, ev.id);
    const rows = (await (await fetch(`${baseUrl}/api/projects/${projectId}/properties`)).json()) as any[];
    const r = rows.find((x) => x.id === prop.id);
    expect(r.used_by_events).toEqual([]);
    expect(r.definitions.every((d: any) => d.using_events.length === 0)).toBe(true);
  });
});
