/**
 * T-4-21: `POST /use-cases/from-template/:id` accepts an optional `type` (the add-to-project
 * dialog's Type step); a non-string is a 400, an unknown string a 400, a valid one is applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as UseCaseTemplateDAL from '../../dal/use-case-template.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;
let templateId: string;

async function post(body: unknown) {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/use-cases/from-template/${templateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  templateId = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-T', name: 'Order confirmation', type: 'marketing' }).id;
  server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('POST /use-cases/from-template type (T-4-21)', () => {
  it('400s on a non-string or unknown type, applies a valid one', async () => {
    expect((await post({ type: 5 })).res.status).toBe(400);
    expect((await post({ type: ['marketing'] })).res.status).toBe(400);
    expect((await post({ type: 'nonsense' })).res.status).toBe(400);
    const ok = await post({ type: 'transactional' });
    expect(ok.res.status).toBe(201);
    expect(ok.body.type).toBe('transactional');
  });
});
