/**
 * T-5-00 (D-66): static serving + SPA fallback + health route, against a temp `dist/`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../db';
import { createApp } from '../app';

let server: http.Server;
let tmp: string;
let origin: string;

/** Raw request so a malformed percent-escape reaches the server unnormalised. */
function raw(pathname: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const { port } = server.address() as AddressInfo;
    http
      .get({ host: '127.0.0.1', port, path: pathname }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      })
      .on('error', reject);
  });
}

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-dist-'));
  fs.mkdirSync(path.join(tmp, 'assets'));
  fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><div id="root">SPA</div>');
  fs.writeFileSync(path.join(tmp, 'assets', 'app-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(tmp, 'favicon.svg'), '<svg/>');
  server = http.createServer(createApp({ serveStatic: true, distDir: tmp }));
  await new Promise<void>((r) => server.listen(0, r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  closeDb();
  delete process.env.E3_DB_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('static serving', () => {
  it('serves index.html at the base path with no-store', async () => {
    const r = await raw('/tracking-plan/');
    expect(r.status).toBe(200);
    expect(r.body).toContain('SPA');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('serves hashed assets with a long immutable cache', async () => {
    const r = await raw('/tracking-plan/assets/app-abc123.js');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toContain('immutable');
    expect(r.headers['cache-control']).toContain('max-age=31536000');
  });

  it('falls back to the SPA for client routes including the share route', async () => {
    for (const p of ['/tracking-plan/events', '/tracking-plan/shared/abc_DEF-123', '/tracking-plan/help/glossary',
      '/tracking-plan/shared/abc_DEF-123/events', '/tracking-plan/shared/abc_DEF-123/events/page.view', '/tracking-plan/shared/abc_DEF-123/use-cases/UC-1.2']) {
      const r = await raw(p);
      expect(r.status, p).toBe(200);
      expect(r.body).toContain('SPA');
    }
  });

  it('returns a plain 404 for a missing file and a JSON 404 for an unknown API path', async () => {
    const missing = await raw('/tracking-plan/assets/nope.js');
    expect(missing.status).toBe(404);
    expect(missing.body).not.toContain('SPA');
    const api = await raw('/api/does-not-exist');
    expect(api.status).toBe(404);
    expect(JSON.parse(api.body).code).toBe('NOT_FOUND');
  });

  it('answers a malformed percent-escape with a plain 400, never a stack', async () => {
    const r = await raw('/tracking-plan/shared/%E0%A4%A');
    expect(r.status).toBe(400);
    expect(r.body).not.toContain('node_modules');
    expect(r.body).not.toContain('    at ');
  });

  it('answers a malformed escape on an API path with 400 and on the share API with the identical 404', async () => {
    const api = await raw('/api/projects/%E0%A4%A');
    expect(api.status).toBe(400);
    const shared = await raw('/api/shared/%E0%A4%A');
    expect(shared.status).toBe(404);
  });

  it('redirects / to the base path', async () => {
    const res = await fetch(`${origin}/`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/tracking-plan/');
  });

  it('serves the API under both /api and /tracking-plan/api', async () => {
    for (const p of ['/api/health', '/tracking-plan/api/health']) {
      const r = await raw(p);
      expect(r.status, p).toBe(200);
    }
  });
});

describe('GET /api/health', () => {
  it('reports ok, version, latest migration and writability, without secrets', async () => {
    const r = await raw('/api/health');
    const body = JSON.parse(r.body);
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(body.schema_migration).toMatch(/^\d{4}_/);
    expect(body.db_path_writable).toBe(true);
    expect(Object.keys(body).sort()).toEqual(['db_path_writable', 'last_backup_at', 'last_upload_ok', 'ok', 'schema_migration', 'version']);
  });
});

describe('static serving off', () => {
  it('does not serve the SPA when disabled', async () => {
    const s = http.createServer(createApp({ serveStatic: false }));
    await new Promise<void>((r) => s.listen(0, r));
    const { port } = s.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/tracking-plan/`);
    expect(res.status).toBe(404);
    await new Promise<void>((r) => s.close(() => r()));
  });
});
