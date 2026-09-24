/**
 * End-to-end HTTP coverage for the file-store path-traversal fix (fix round finding #5): a real
 * request through Express's own URL decoding, not just a direct call into FileStore/route helper
 * functions, since the exploit is specifically about what survives that decoding.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import { getFileStore } from '../../files/FileStore';

let server: http.Server;
let baseUrl: string;
let serverPort: number;
let tmpFilesDir: string;
let projectAId: string;
let projectBId: string;

/**
 * `fetch()`/WHATWG URL normalises `A/../B` before the request is ever sent (it never reaches the
 * server as `..`), so a `fetch()`-based test of that exact exploit shape was only ever exercising
 * the prefix-mismatch 404, not the dot-segment rejection itself (reviewer LOW, fix round 2). Node's
 * `http.request` sends the given `path` string as-is on the request line with no such
 * normalisation, so this is the only way to prove the server rejects the raw dot segment.
 */
function rawGet(rawPath: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: serverPort, path: rawPath, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  tmpFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-files-route-'));
  process.env.E3_DB_PATH = ':memory:';
  process.env.E3_FILES_PATH = tmpFilesDir;
  closeDb();

  const clientA = ClientDAL.createClient({ key: 'client-a', name: 'Client A' });
  const clientB = ClientDAL.createClient({ key: 'client-b', name: 'Client B' });
  projectAId = ProjectDAL.createProject({ client_id: clientA.id, key: 'proj-a', name: 'Project A' }).id;
  projectBId = ProjectDAL.createProject({ client_id: clientB.id, key: 'proj-b', name: 'Project B' }).id;

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  serverPort = port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(tmpFilesDir, { recursive: true, force: true });
  delete process.env.E3_DB_PATH;
  delete process.env.E3_FILES_PATH;
});

afterEach(() => {
  // no per-test state to reset
});

describe('GET /api/projects/:projectId/files/* (path traversal)', () => {
  it('serves a file that was uploaded to the requesting project', async () => {
    const stored = await getFileStore().put(projectAId, 'event_trigger', 'ok.png', Buffer.from('ok'), 'image/png');
    const res = await fetch(`${baseUrl}/api/projects/${projectAId}/files/${stored.path}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('rejects A/../B/file: a project-B file reached through a project-A URL (raw HTTP path, no client-side normalisation)', async () => {
    const stored = await getFileStore().put(projectBId, 'event_trigger', 'secret.png', Buffer.from('secret'), 'image/png');
    const res = await rawGet(`/api/projects/${projectAId}/files/${projectAId}/../${stored.path}`);
    expect(res.status).toBe(400);
    const body = JSON.parse(res.text);
    expect(body.code).toBe('INVALID_PATH');
  });

  it('rejects an encoded traversal segment (..%2F)', async () => {
    const stored = await getFileStore().put(projectBId, 'event_trigger', 'secret.png', Buffer.from('secret'), 'image/png');
    const res = await fetch(`${baseUrl}/api/projects/${projectAId}/files/${projectAId}%2F..%2F${stored.path}`);
    expect(res.status).not.toBe(200);
  });

  it('rejects an absolute path', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectAId}/files/${encodeURIComponent('/etc/passwd')}`);
    expect(res.status).not.toBe(200);
  });
});
