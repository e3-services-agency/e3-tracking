/**
 * Route-level coverage for the use case library's write surface (T-3-06, D-47): `POST
 * /api/use-case-templates/import/{preview,apply}`, `GET /export.json`, and `DELETE /:id` (409
 * `TEMPLATE_IN_USE`). Global routes (no project scope, D-06).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as UseCaseTemplateDAL from '../../dal/use-case-template.dal';

const fixturePath = path.resolve(__dirname, '../../../../.claude/team/samples/use-case-library-sample.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

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

describe('use case library import/export routes', () => {
  it('previews, applies, and exports the sample library', async () => {
    const previewRes = await fetch(`${baseUrl}/api/use-case-templates/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture),
    });
    expect(previewRes.status).toBe(200);
    const preview = await previewRes.json();
    expect(preview.items).toHaveLength(3);
    expect(preview.warnings).toEqual([]);

    const applyRes = await fetch(`${baseUrl}/api/use-case-templates/import/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: fixture,
        payload_hash: preview.payload_hash,
        selected_item_ids: preview.items.map((i: { id: string }) => i.id),
      }),
    });
    expect(applyRes.status).toBe(200);
    const summary = await applyRes.json();
    expect(summary.applied).toHaveLength(3);

    const listRes = await fetch(`${baseUrl}/api/use-case-templates`);
    const list = await listRes.json();
    expect(list.map((t: { code: string }) => t.code).sort()).toEqual(['UC-01', 'UC-02', 'UC-03']);

    const exportRes = await fetch(`${baseUrl}/api/use-case-templates/export.json`);
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    expect(exported.format).toBe('e3-use-case-library');
    expect(exported.templates).toHaveLength(3);
  });

  it('409s PAYLOAD_CHANGED on a stale hash', async () => {
    const res = await fetch(`${baseUrl}/api/use-case-templates/import/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: fixture, payload_hash: 'stale', selected_item_ids: [] }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('PAYLOAD_CHANGED');
  });
});

describe('DELETE /api/use-case-templates/:id', () => {
  it('409s TEMPLATE_IN_USE while a use case still references the template', async () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-DELROUTE', name: 'In use', type: 'marketing' });
    await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/from-template/${template.id}`, { method: 'POST' });

    const res = await fetch(`${baseUrl}/api/use-case-templates/${template.id}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('TEMPLATE_IN_USE');
  });

  it('deletes a template with no referencing use case', async () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-DELROUTE2', name: 'Unused', type: 'marketing' });
    const res = await fetch(`${baseUrl}/api/use-case-templates/${template.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(UseCaseTemplateDAL.getUseCaseTemplateById(template.id)).toBeNull();
  });
});
