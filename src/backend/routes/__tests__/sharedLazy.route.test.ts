/**
 * T-5-41 (D-88): the lazy client portal routes `GET /api/shared/:token/document-summary.json` and
 * `GET /api/shared/:token/events/:eventId/card.json`. Covers the privacy contract (nothing the
 * public projection strips reaches either route), the identical 404 for every error, `no-store`,
 * and that the summary and card agree with the full public download.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as PropertyDAL from '../../dal/property.dal';
import * as VariantDAL from '../../dal/variant.dal';
import * as UseCaseDAL from '../../dal/use-case.dal';

let server: http.Server;
let baseUrl: string;
let serverPort: number;
let tmpFilesDir: string;
let projectId: string;
let otherProjectEventId: string;
let deletedEventId: string;
let cartEventId: string;
let token: string;

const SHARE_NOT_FOUND = { error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' };

// Every value the public projection strips today. None may appear in either lazy response.
const SECRETS = {
  bloomreach_project_url: 'https://app.exponea.com/secret-console-t541',
  identity_note: 'SECRET identity note t541',
  owner_business: 'SECRET business owner t541',
  owner_technical: 'SECRET technical owner t541',
  agent_instructions: 'SECRET agent prompt t541',
  internal_notes: 'SECRET use case internal note t541',
  internal_url: 'https://internal.example.com/secret-t541',
};

function rawGet(rawPath: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: serverPort, path: rawPath, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Every object key at any depth of a parsed JSON value. */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

function expectNoStrippedField(body: unknown, text: string): void {
  for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
  const keys = [...allKeys(body)];
  expect(keys).not.toContain('agent_instructions');
  expect(keys.filter((k) => k.startsWith('internal_'))).toEqual([]);
}

beforeAll(async () => {
  tmpFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-shared-lazy-'));
  process.env.E3_DB_PATH = ':memory:';
  process.env.E3_FILES_PATH = tmpFilesDir;
  closeDb();

  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({
    client_id: client.id,
    key: 'acme-eu',
    name: 'Acme EU',
    bloomreach_project_url: SECRETS.bloomreach_project_url,
  }).id;
  const otherProjectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-us', name: 'Acme US' }).id;
  otherProjectEventId = EventDAL.createEvent(otherProjectId, { name: 'other_project_event', class: 'custom' }).id;

  const cart = EventDAL.createEvent(projectId, {
    name: 'cart_update',
    class: 'custom',
    business_name: 'Cart update',
    description: 'Fires on every cart change.',
    priority: 'high',
    identity_note: SECRETS.identity_note,
    owner_business: SECRETS.owner_business,
    owner_technical: SECRETS.owner_technical,
    agent_instructions: SECRETS.agent_instructions,
    not_suitable_for: 'Client-facing guidance t541',
  });
  cartEventId = cart.id;
  const action = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  });
  const price = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
  EventDAL.attachPropertyToEvent(projectId, cart.id, { property_id: action.id, role: 'discriminator' });
  EventDAL.attachPropertyToEvent(projectId, cart.id, { property_id: price.id });
  VariantDAL.createVariant(projectId, cart.id, { conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }] });
  VariantDAL.createVariant(projectId, cart.id, { conditions: [{ property_id: action.id, operator: 'equals', values: ['remove'] }] });

  EventDAL.createEvent(projectId, { name: 'page_visit', class: 'sdk' });
  deletedEventId = EventDAL.createEvent(projectId, { name: 'deleted_event', class: 'custom' }).id;
  EventDAL.deleteEvent(projectId, deletedEventId);

  UseCaseDAL.createUseCase(projectId, {
    name: 'Abandoned cart',
    internal_notes: SECRETS.internal_notes,
    internal_url: SECRETS.internal_url,
  });

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  serverPort = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${serverPort}`;

  const created = await (
    await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: 'comment' }),
    })
  ).json();
  token = created.share_token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(tmpFilesDir, { recursive: true, force: true });
  delete process.env.E3_DB_PATH;
  delete process.env.E3_FILES_PATH;
});

describe('GET /api/shared/:token/document-summary.json (T-5-41)', () => {
  it('returns light events, every other section as the full public document has it, and no-store', async () => {
    const res = await fetch(`${baseUrl}/api/shared/${token}/document-summary.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const summary = await res.json();
    const full = await (await fetch(`${baseUrl}/api/shared/${token}/tracking-document.json`)).json();

    const { events: summaryEvents, generated_at: _g1, ...summaryRest } = summary;
    const { events: fullEvents, generated_at: _g2, ...fullRest } = full;
    expect(summaryRest).toEqual(fullRest);
    expect(summaryEvents.map((e: { id: string }) => e.id)).toEqual(fullEvents.map((e: { id: string }) => e.id));

    const cart = summaryEvents.find((e: { name: string }) => e.name === 'cart_update');
    expect(Object.keys(cart).sort()).toEqual(
      [
        'id', 'name', 'business_name', 'class', 'implementation_method', 'status', 'priority', 'description',
        'sources', 'identifiers', 'certification', 'quality', 'variant_names', 'property_count', 'open_finding_count',
      ].sort()
    );
    const fullCart = fullEvents.find((e: { name: string }) => e.name === 'cart_update');
    expect(cart.variant_names).toEqual(fullCart.variants.map((v: { name: string }) => v.name));
    expect(cart.variant_names).toHaveLength(2);
    expect(cart.property_count).toBe(2);
    expect(cart.open_finding_count).toBe(fullCart.findings.length);
    expect(cart.certification).toEqual(fullCart.certification);
    expect(cart.quality).toEqual(fullCart.quality);
    expect(cart.business_name).toBe('Cart update');
    expect(cart.priority).toBe('high');
  });

  it('carries no field the public projection strips (identity_note, owners, agent_instructions, bloomreach_project_url, internal_*)', async () => {
    const res = await fetch(`${baseUrl}/api/shared/${token}/document-summary.json`);
    const text = await res.text();
    const summary = JSON.parse(text);
    expectNoStrippedField(summary, text);
    for (const event of summary.events) {
      expect('identity_note' in event).toBe(false);
      expect('owners' in event).toBe(false);
    }
    expect(summary.project.bloomreach_project_url).toBeNull();
    expect(summary.events.map((e: { id: string }) => e.id)).not.toContain(deletedEventId);
  });
});

describe('GET /api/shared/:token/events/:eventId/card.json (T-5-41)', () => {
  it('returns the same card as the full public document, with no-store', async () => {
    const res = await fetch(`${baseUrl}/api/shared/${token}/events/${cartEventId}/card.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const card = await res.json();
    const full = await (await fetch(`${baseUrl}/api/shared/${token}/tracking-document.json`)).json();
    expect(card).toEqual(full.events.find((e: { id: string }) => e.id === cartEventId));
    expect(card.codegen.gtm).not.toBe('');
    expect(card.not_suitable_for).toBe('Client-facing guidance t541');
  });

  it('carries no field the public projection strips', async () => {
    const res = await fetch(`${baseUrl}/api/shared/${token}/events/${cartEventId}/card.json`);
    const text = await res.text();
    const card = JSON.parse(text);
    expectNoStrippedField(card, text);
    expect(card.identity_note).toBeNull();
    expect(card.owners).toEqual({ business: null, technical: null });
    expect('agent_instructions' in card).toBe(false);
  });

  it('answers the identical 404 SHARE_NOT_FOUND for an unknown, deleted or other-project event id', async () => {
    for (const eventId of ['no-such-event', deletedEventId, otherProjectEventId]) {
      const res = await fetch(`${baseUrl}/api/shared/${token}/events/${eventId}/card.json`);
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual(SHARE_NOT_FOUND);
    }
  });
});

describe('error behaviour of both lazy routes (T-5-41)', () => {
  it('a bad token, a revoked token and a malformed path all answer the identical 404 with no-store', async () => {
    const bad = [
      `/api/shared/not-a-token/document-summary.json`,
      `/api/shared/not-a-token/events/${cartEventId}/card.json`,
      `/api/shared/${token}/events/%ZZ/card.json`,
      `/api/shared/%E0%A4%A/document-summary.json`,
      `/api/shared/${token}/events/${cartEventId}/card.json/extra`,
    ];
    for (const p of bad) {
      const res = await rawGet(p);
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(JSON.parse(res.text)).toEqual(SHARE_NOT_FOUND);
    }
  });

  it('after revoking the link both routes answer the identical 404', async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}/share`, { method: 'DELETE' });
    for (const p of [`/api/shared/${token}/document-summary.json`, `/api/shared/${token}/events/${cartEventId}/card.json`]) {
      const res = await fetch(`${baseUrl}${p}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(SHARE_NOT_FOUND);
    }
  });
});
