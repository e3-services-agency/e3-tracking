import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
const photo = vi.hoisted(() => vi.fn().mockResolvedValue('https://lh3.googleusercontent.com/photo'));
vi.mock('../sharedAuth', async (importOriginal) => ({ ...await importOriginal<typeof import('../sharedAuth')>(), resolveInternalStaffPhoto: photo }));
let server: http.Server; let base: string; let eventId: string; const saved = { ...process.env };
beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:'; process.env.AUTH_MODE = 'local'; closeDb();
  const client = ClientDAL.createClient({ key: 'photo', name: 'Photo' }); const project = ProjectDAL.createProject({ client_id: client.id, key: 'photo', name: 'Photo' });
  eventId = EventDAL.createEvent(project.id, { name: 'photo', class: 'custom' }).id;
  server = http.createServer(createApp({ serveStatic: false })); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects/${project.id}/comments`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); closeDb(); for (const key of ['E3_DB_PATH', 'AUTH_MODE']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
const post = async (extra: object = {}) => { const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'event', entity_id: eventId, body: 'Photo test', ...extra }) }); expect(response.status).toBe(201); return response.json(); };
it('shows verified participant photo and stores it on staff roots/replies without accepting supplied photo', async () => {
  const identity = await fetch(`${base}/identity`); expect(identity.headers.get('cache-control')).toBe('no-store');
  expect((await identity.json()).avatar_url).toBe('https://lh3.googleusercontent.com/photo');
  const root = await post({ avatar_url: 'https://evil.test/avatar' }); expect(root.avatar_url).toBe('https://lh3.googleusercontent.com/photo'); expect(root.author_kind).toBe('staff');
  const reply = await post({ parent_id: root.id }); expect(reply.avatar_url).toBe(root.avatar_url); expect(reply.participant_id).toBe(root.participant_id);
  const legacy = await post({ author_name: 'Manual author', avatar_url: 'https://evil.test/avatar' }); expect(legacy.avatar_url).toBeNull(); expect(legacy.author_kind).toBe('legacy');
});
