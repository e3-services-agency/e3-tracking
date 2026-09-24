/**
 * Cold-boot 500 burst (fix round, T-1-EXIT): the phase 1 exit QA sweep saw a burst of 500s (plus one
 * 400) during the app's very first page loads on a genuinely empty database, before any
 * client/project existed. The likely trigger in that window is a placeholder/invalid project id
 * (`undefined`, `null`, an empty segment, or a stale id from a previous session's localStorage)
 * reaching a project-scoped route before `requireProject` (`middleware/project.ts`) — or, for the
 * two non-project-scoped routes below, before their own id lookup — has a chance to run. Every one
 * of these must answer with a clean 4xx JSON error, never a raw 500, on a project-less/fresh
 * database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
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

const PLACEHOLDER_IDS = ['undefined', 'null', 'not-a-real-project-id'];

describe('cold-boot: placeholder project id on an empty database never 500s', () => {
  it('GET /api/projects (no projectId at all) returns an empty list, not an error', async () => {
    const res = await fetch(`${baseUrl}/api/projects`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('GET /api/clients (no projectId at all) returns an empty list, not an error', async () => {
    const res = await fetch(`${baseUrl}/api/clients`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  for (const id of PLACEHOLDER_IDS) {
    it(`GET /api/projects/${id} returns 404 JSON, not 500`, async () => {
      const res = await fetch(`${baseUrl}/api/projects/${id}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(typeof body.code).toBe('string');
    });

    for (const resource of [
      'events',
      'properties',
      'catalogs',
      'sources',
      'identity-rules',
      'consent-categories',
      'standard-event-mappings',
      'variants',
      'use-cases',
      'requirements-matrix',
      'qa-runs',
      'observations',
      'findings',
    ]) {
      it(`GET /api/projects/${id}/${resource} returns 404 JSON via requireProject, not 500`, async () => {
        const res = await fetch(`${baseUrl}/api/projects/${id}/${resource}`);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.code).toBe('NOT_FOUND');
        expect(body.resource).toBe('project');
      });
    }
  }

  it('GET /api/projects/ (empty id segment) falls through to the list route, not a 500', async () => {
    const res = await fetch(`${baseUrl}/api/projects/`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
