/**
 * Route-level coverage (T-2-04): `POST /api/projects/:projectId/comparison/run` returns
 * `{open, produced, resolved, by_comparison}`, with a `data_manager` entry once a Data Manager
 * events snapshot is stored.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import {createEvent} from '../../dal/event.dal';
import * as ProjectDAL from '../../dal/project.dal';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const dataManagerEventsFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/data-manager-events.json'), 'utf-8')
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

describe('POST /comparison/run', () => {
  it('returns by_comparison for definition_vs_observations and data_manager after both are applied', async () => {
    const mappingPreview = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/preview`, dataMappingFixture);
    await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/apply`, {
      payload: dataMappingFixture,
      payload_hash: mappingPreview.body.payload_hash,
      selected_item_ids: mappingPreview.body.items.map((i: { id: string }) => i.id),
    });

    const dmPreview = await postJson(
      `${baseUrl}/api/projects/${projectId}/import/data-manager-events/preview`,
      dataManagerEventsFixture
    );
    await postJson(`${baseUrl}/api/projects/${projectId}/import/data-manager-events/apply`, {
      payload: dataManagerEventsFixture,
      payload_hash: dmPreview.body.payload_hash,
      selected_item_ids: dmPreview.body.items
        .filter((i: { default_selected: boolean }) => i.default_selected)
        .map((i: { id: string }) => i.id),
    });

    const { res, body } = await postJson(`${baseUrl}/api/projects/${projectId}/comparison/run`, {});
    expect(res.status).toBe(200);
    expect(typeof body.produced).toBe('number');
    expect(body.by_comparison).toBeDefined();
    expect(body.by_comparison.definition_vs_observations).toBeDefined();
    expect(body.by_comparison.data_manager).toBeDefined();
    // T-2-05: definition_vs_mapping and mapping_vs_observations also run in the same recompute now.
    expect(body.produced).toBe(
      Object.values(body.by_comparison as Record<string, { produced: number }>).reduce((sum, c) => sum + c.produced, 0)
    );
  });
});

it('validates canonical nested comparison scope and rejects foreign or malformed requested context',async()=>{const c=ClientDAL.createClient({key:'foreign-client',name:'Foreign'});const p=ProjectDAL.createProject({client_id:c.id,key:'foreign-project',name:'Foreign'});const e=createEvent(p.id,{name:'foreign'});const route=`${baseUrl}/api/projects/${projectId}/comparison/run`;expect((await postJson(route,{scope:{event:e.id}})).res.status).toBe(404);for(const scope of [[],null,'bad',{event:23},{qa_run_id:''}])expect((await postJson(route,{scope})).res.status).toBe(400);});
