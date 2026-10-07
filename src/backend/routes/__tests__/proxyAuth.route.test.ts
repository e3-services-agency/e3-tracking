/** T-5-06 (D-72 item 4): AUTH_MODE=proxy trusts X-Forwarded-Email only from TRUSTED_PROXY_CIDR. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import { assertAuthConfig } from '../../middleware/auth';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import { listChanges } from '../../dal/change-log.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;
const saved = { ...process.env };

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  process.env.AUTH_MODE = 'proxy';
  process.env.TRUSTED_PROXY_CIDR = '127.0.0.1/32,::1/128';
  server = http.createServer(createApp());
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  process.env = saved;
  closeDb();
});

const H = { 'X-Forwarded-Email': 'Jane.Doe@Example.com' };

describe('proxy auth mode', () => {
  it('401 UNAUTHENTICATED without the header', async () => {
    const res = await fetch(`${baseUrl}/api/clients`);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('UNAUTHENTICATED');
  });

  it('accepts the header from a trusted peer, even with a spoofed X-Forwarded-For', async () => {
    const res = await fetch(`${baseUrl}/api/clients`, { headers: { ...H, 'X-Forwarded-For': '203.0.113.9' } });
    expect(res.status).toBe(200);
  });

  it('ignores the header from an untrusted peer', async () => {
    process.env.TRUSTED_PROXY_CIDR = '10.0.0.0/8';
    try {
      const res = await fetch(`${baseUrl}/api/clients`, { headers: H });
      expect(res.status).toBe(401);
    } finally {
      process.env.TRUSTED_PROXY_CIDR = '127.0.0.1/32,::1/128';
    }
  });

  it('health and share routes stay public', async () => {
    expect((await fetch(`${baseUrl}/api/health`)).status).toBeLessThan(500);
    expect((await fetch(`${baseUrl}/api/health`)).status).not.toBe(401);
    const res = await fetch(`${baseUrl}/api/shared/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SHARE_NOT_FOUND');
  });

  it('attributes changes to the lower-cased email', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'cart_update', class: 'custom' }),
    });
    expect(res.status).toBeLessThan(300);
    const rows = listChanges(projectId, {});
    expect(rows.some((r) => r.actor === 'jane.doe@example.com')).toBe(true);
  });
});

describe('startup guard', () => {
  it('refuses proxy mode in production without TRUSTED_PROXY_CIDR', () => {
    const env = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.TRUSTED_PROXY_CIDR;
      expect(() => assertAuthConfig()).toThrow(/TRUSTED_PROXY_CIDR/);
      process.env.TRUSTED_PROXY_CIDR = '172.18.0.0/16';
      expect(() => assertAuthConfig()).not.toThrow();
    } finally {
      process.env = env;
    }
  });
});
