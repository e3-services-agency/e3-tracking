/**
 * Route-level coverage (T-2-03): `/api/projects/:projectId/import/data-manager-events/{preview,apply}`
 * and `/api/projects/:projectId/export/data-manager-events.json`, plus the cross-format rejection
 * the two Data Manager boxes are expected to show on the Import page (each box's parser detects and
 * warns on the other format's shape rather than silently reporting zero items with no explanation).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';

const eventsFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/data-manager-events.json'), 'utf-8')
);
const customersFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/data-manager-customers.json'), 'utf-8')
);

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

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { res, body: await res.json() };
}

describe('data-manager-events import/export', () => {
  it('preview returns 61 event items, warnings and a payload_hash', async () => {
    const { res, body } = await postJson(
      `${baseUrl}/api/projects/${projectId}/import/data-manager-events/preview`,
      eventsFixture
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.filter((i: { entity_type: string }) => i.entity_type === 'event')).toHaveLength(61);
    expect(typeof body.payload_hash).toBe('string');
  });

  it('apply with a stale hash returns 409 PAYLOAD_CHANGED', async () => {
    const { res, body } = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-manager-events/apply`, {
      payload: eventsFixture,
      payload_hash: 'not-the-real-hash',
      selected_item_ids: [],
    });
    expect(res.status).toBe(409);
    expect(body.code).toBe('PAYLOAD_CHANGED');
  });

  it('apply with the correct hash and the default selection applies, and the export returns the Data Manager events shape', async () => {
    const preview = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-manager-events/preview`, eventsFixture);
    const selectedIds = preview.body.items
      .filter((i: { default_selected: boolean }) => i.default_selected)
      .map((i: { id: string }) => i.id);
    const applyRes = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-manager-events/apply`, {
      payload: eventsFixture,
      payload_hash: preview.body.payload_hash,
      selected_item_ids: selectedIds,
    });
    expect(applyRes.res.status).toBe(200);
    expect(applyRes.body.applied.length).toBeGreaterThan(0);

    const exportRes = await fetch(`${baseUrl}/api/projects/${projectId}/export/data-manager-events.json`);
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    expect(Array.isArray(exported.default_group.events)).toBe(true);
    expect(Array.isArray(exported.groups)).toBe(true);
  });

  it('?passthrough=false narrows the export to only the live app definition', async () => {
    const exportRes = await fetch(`${baseUrl}/api/projects/${projectId}/export/data-manager-events.json?passthrough=false`);
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    const allTypes = [
      ...exported.default_group.events.map((e: { type: string }) => e.type),
      ...exported.groups.flatMap((g: { events: { type: string }[] }) => g.events.map((e) => e.type)),
    ];
    expect(allTypes).not.toContain('first_session'); // never selected/created; only present via passthrough
  });
});

describe('cross-format rejection (each Data Manager box warns instead of silently parsing 0 items)', () => {
  it('the data-manager-events box warns on a data-manager-customers payload', async () => {
    const { res, body } = await postJson(
      `${baseUrl}/api/projects/${projectId}/import/data-manager-events/preview`,
      customersFixture
    );
    expect(res.status).toBe(200);
    expect(body.items.filter((i: { entity_type: string }) => i.entity_type === 'event')).toEqual([]);
    expect(body.warnings.some((w: string) => /customers export/.test(w))).toBe(true);
  });

  it('the data-manager-customers box warns on a data-manager-events payload', async () => {
    const { res, body } = await postJson(
      `${baseUrl}/api/projects/${projectId}/import/data-manager-customers/preview`,
      eventsFixture
    );
    expect(res.status).toBe(200);
    expect(body.items.filter((i: { entity_type: string }) => i.entity_type === 'property')).toEqual([]);
    expect(body.warnings.some((w: string) => /events export/.test(w))).toBe(true);
  });
});
