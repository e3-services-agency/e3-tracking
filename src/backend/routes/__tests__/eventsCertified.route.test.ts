/**
 * Route-level coverage for T-2-09: `GET /api/projects/:projectId/events` gains a batched
 * `certified`/`certified_reasons` column (plan acceptance: "cart_update certified after fixtures;
 * total_price required -> error finding -> not certified with `open_errors: 1`; revert and
 * recompute -> certified"), computed in one project-wide pass
 * (`document.service.ts`'s `computeCertificationsForProject`), and an sdk event reads `n/a`.
 */
import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as PropertyDAL from '../../dal/property.dal';
import * as EventDAL from '../../dal/event.dal';
import * as QaRunDAL from '../../dal/qa-run.dal';
import * as ObservationDAL from '../../dal/observation.dal';
import { runComparison } from '../../services/comparison.service';

let server: http.Server;
let baseUrl: string;
let projectId: string;
let cartUpdateEventId: string;
let totalPricePropertyId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;

  const cartUpdate = EventDAL.createEvent(projectId, { name: 'cert_cart_update', class: 'custom' });
  cartUpdateEventId = cartUpdate.id;
  const totalPrice = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'cert_total_price',
    data_type: 'number',
    data_formats_json: ['money'],
  });
  totalPricePropertyId = totalPrice.id;
  EventDAL.attachPropertyToEvent(projectId, cartUpdateEventId, { property_id: totalPrice.id, required: false, role: 'normal' });

  EventDAL.createEvent(projectId, { name: 'cert_session_start', class: 'sdk' });

  const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
  ObservationDAL.createObservation(projectId, run.id, {
    source: 'manual',
    event_type: 'cert_cart_update',
    timestamp: 1_700_000_000,
    properties: {},
  });
  runComparison(projectId);

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

async function fetchEvents(): Promise<any[]> {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/events`);
  expect(res.status).toBe(200);
  return res.json();
}

describe('GET /api/projects/:projectId/events certified column', () => {
  it('is certified (yes, no reasons) once observed with zero error findings', async () => {
    const events = await fetchEvents();
    const cartUpdate = events.find((e) => e.id === cartUpdateEventId);
    expect(cartUpdate.certified).toBe('yes');
    expect(cartUpdate.certified_reasons).toEqual([]);
  });

  it('is n/a for an sdk event', async () => {
    const events = await fetchEvents();
    const sdkEvent = events.find((e) => e.name === 'cert_session_start');
    expect(sdkEvent.certified).toBe('n/a');
    expect(sdkEvent.certified_reasons).toEqual(['not_applicable']);
  });

  it('flips to no with open_errors: 1 once total_price is required and missing, then back to yes once reverted', async () => {
    EventDAL.updateEventProperty(projectId, cartUpdateEventId, totalPricePropertyId, { required: true });
    runComparison(projectId);

    const blocked = await fetchEvents();
    const blockedCartUpdate = blocked.find((e) => e.id === cartUpdateEventId);
    expect(blockedCartUpdate.certified).toBe('no');
    expect(blockedCartUpdate.certified_reasons).toContain('open_errors: 1');

    EventDAL.updateEventProperty(projectId, cartUpdateEventId, totalPricePropertyId, { required: false });
    runComparison(projectId);

    const restored = await fetchEvents();
    const restoredCartUpdate = restored.find((e) => e.id === cartUpdateEventId);
    expect(restoredCartUpdate.certified).toBe('yes');
    expect(restoredCartUpdate.certified_reasons).toEqual([]);
  });
});
