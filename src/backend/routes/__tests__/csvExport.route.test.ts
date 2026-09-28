/**
 * Route-level coverage for T-3-03 (D-46, capability 9, qa-roundtrip scenario 6):
 * `GET /api/projects/:projectId/export/csv` (listing with counts) and
 * `GET /api/projects/:projectId/export/csv/:entity` (one CSV file per entity).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { closeDb, getDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as PropertyDAL from '../../dal/property.dal';
import { CSV_ENTITY_NAMES, csvHeadersFor } from '../../../domain/csv';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const expirationFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/expiration-settings.json'), 'utf-8')
);

let server: http.Server;
let baseUrl: string;
let projectId: string;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { res, body: await res.json() };
}

async function applyFixture(kind: 'data-mapping' | 'expiration-settings', fixture: unknown) {
  const preview = await postJson(`${baseUrl}/api/projects/${projectId}/import/${kind}/preview`, fixture);
  const apply = await postJson(`${baseUrl}/api/projects/${projectId}/import/${kind}/apply`, {
    payload: fixture,
    payload_hash: preview.body.payload_hash,
    selected_item_ids: preview.body.items.map((i: { id: string }) => i.id),
  });
  expect(apply.res.status).toBe(200);
}

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

  await applyFixture('data-mapping', dataMappingFixture);
  await applyFixture('expiration-settings', expirationFixture);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('GET /export/csv', () => {
  it('lists every declared entity with a row count', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.entities.map((e: { entity: string }) => e.entity);
    for (const entity of CSV_ENTITY_NAMES) {
      expect(names).toContain(entity);
    }
    const events = body.entities.find((e: { entity: string }) => e.entity === 'events');
    expect(events.count).toBe(EventDAL.listEvents(projectId).length);
  });
});

describe('GET /export/csv/:entity', () => {
  it('404s UNKNOWN_CSV_ENTITY for an unknown entity', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv/not_a_real_entity`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('UNKNOWN_CSV_ENTITY');
  });

  it('events.csv: header line matches the contract and row count equals the Events DAL count (scenario 6)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('events');
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer[0]).toBe(0xef); // UTF-8 BOM byte 1 (fetch's res.text() decodes and strips it)
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
    const text = buffer.toString('utf-8');
    expect(text).toContain('\r\n'); // CRLF

    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.meta.fields).toEqual([...csvHeadersFor('events')]);
    expect(parsed.data.length).toBe(EventDAL.listEvents(projectId).length);
  });

  it('properties.csv: header line matches the contract, row count equals the Properties DAL count, and a property with allowed_values_json round-trips the JSON string', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv/properties`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.meta.fields).toEqual([...csvHeadersFor('properties')]);
    expect(parsed.data.length).toBe(PropertyDAL.listProperties(projectId).length);

    const properties = PropertyDAL.listProperties(projectId);
    const withAllowedValues = properties.find(
      (p) => Array.isArray(p.allowed_values_json) && (p.allowed_values_json as unknown[]).length > 0
    );
    expect(withAllowedValues).toBeTruthy();
    const row = (parsed.data as Record<string, string>[]).find((r) => r.id === withAllowedValues!.id);
    expect(row).toBeTruthy();
    expect(JSON.parse(row!.allowed_values_json)).toEqual(withAllowedValues!.allowed_values_json);
  });

  it('change_log.csv: header line matches the contract and row count equals the change_log table (T-3-01 merged, QA fix)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv/change_log`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.meta.fields).toEqual([...csvHeadersFor('change_log')]);

    const expectedCount = (
      getDb().prepare('SELECT COUNT(*) as n FROM change_log WHERE project_id = ?').get(projectId) as { n: number }
    ).n;
    // The two fixture applies above (data-mapping, expiration-settings) each write a batch of rows.
    expect(expectedCount).toBeGreaterThan(0);
    expect(parsed.data.length).toBe(expectedCount);

    const row = (parsed.data as Record<string, string>[])[0];
    expect(row.id).toBeTruthy();
    expect(row.changed_at).toBeTruthy();
    expect(['create', 'update', 'delete', 'restore']).toContain(row.action);
    expect(() => JSON.parse(row.diff_json)).not.toThrow();

    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv`);
    const listBody = await listRes.json();
    const changeLogEntry = listBody.entities.find((e: { entity: string }) => e.entity === 'change_log');
    expect(changeLogEntry.count).toBe(expectedCount);
  });

  it('comments.csv exports real rows (T-4-02, D-49)', async () => {
    const events = await fetch(`${baseUrl}/api/projects/${projectId}/events`).then((r) => r.json());
    const event = events[0];
    const created = await postJson(`${baseUrl}/api/projects/${projectId}/comments`, {
      entity_type: 'event',
      entity_id: event.id,
      author_name: 'Jan',
      body: 'CSV round-trip check.',
    });
    expect(created.res.status).toBe(201);

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv/comments`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.meta.fields).toEqual([...csvHeadersFor('comments')]);
    expect(parsed.data.length).toBe(1);
    const row = (parsed.data as Record<string, string>[])[0];
    expect(row.entity_type).toBe('event');
    expect(row.entity_label).toBe(event.name);
    expect(row.body).toBe('CSV round-trip check.');
    expect(row.via_share).toBe('false');

    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv`);
    const listBody = await listRes.json();
    const commentsEntry = listBody.entities.find((e: { entity: string }) => e.entity === 'comments');
    expect(commentsEntry.count).toBe(1);
  });

  it('a value containing a comma, a quote and a newline round-trips through papaparse', async () => {
    const description = 'has a comma, a "quote" and\na newline';
    const created = await postJson(`${baseUrl}/api/projects/${projectId}/properties`, {
      scope: 'customer',
      name: 'csv_roundtrip_test',
      data_type: 'string',
      description,
    });
    expect(created.res.status).toBe(201);

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv/properties`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const row = (parsed.data as Record<string, string>[]).find((r) => r.name === 'csv_roundtrip_test');
    expect(row).toBeTruthy();
    expect(row!.description).toBe(description);
  });
});
