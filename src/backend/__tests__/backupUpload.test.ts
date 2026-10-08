/** T-5-08 (D-72 item 6): GCS uploader request shape, retry, skip path, and the status file in runBackupOnce. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import { runBackupOnce } from '../backupJob';
import { createGcsUploader, objectNameFor, readBackupStatus, TOKEN_URL, RESUMABLE_THRESHOLD, type BackupUploader } from '../backupUpload';

const tokenOk = () => new Response(JSON.stringify({ access_token: 'tok-1' }), { status: 200 });

describe('createGcsUploader', () => {
  const body = Buffer.from('{"a":1}');
  it('sends a media upload with the metadata token', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return url === TOKEN_URL ? tokenOk() : new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const up = createGcsUploader({ bucket: 'b-1', fetchImpl, log: () => {} });
    const r = await up.upload({ objectName: 'acme/2026-10-05T02-00-00-000Z.json', body });
    expect(r).toEqual({ ok: true, uri: 'gs://b-1/acme/2026-10-05T02-00-00-000Z.json' });
    expect((calls[0].init?.headers as Record<string, string>)['Metadata-Flavor']).toBe('Google');
    expect(calls[1].url).toBe(
      'https://storage.googleapis.com/upload/storage/v1/b/b-1/o?uploadType=media&name=acme%2F2026-10-05T02-00-00-000Z.json'
    );
    expect(calls[1].init?.method).toBe('POST');
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('retries 5xx with backoff then succeeds', async () => {
    let puts = 0;
    const sleeps: number[] = [];
    const fetchImpl = (async (url: string) => {
      if (url === TOKEN_URL) return tokenOk();
      puts++;
      return new Response('', { status: puts < 3 ? 503 : 200 });
    }) as unknown as typeof fetch;
    const up = createGcsUploader({ bucket: 'b', fetchImpl, sleep: async (ms) => void sleeps.push(ms), baseDelayMs: 10, log: () => {} });
    expect((await up.upload({ objectName: 'k/x.json', body })).ok).toBe(true);
    expect(puts).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it('does not retry a 403 and reports failure', async () => {
    let puts = 0;
    const fetchImpl = (async (url: string) => {
      if (url === TOKEN_URL) return tokenOk();
      puts++;
      return new Response('', { status: 403 });
    }) as unknown as typeof fetch;
    const r = await createGcsUploader({ bucket: 'b', fetchImpl, sleep: async () => {}, log: () => {} }).upload({ objectName: 'k/x.json', body });
    expect(r).toMatchObject({ ok: false, error: 'HTTP 403' });
    expect(puts).toBe(1);
  });

  it('gives up after the attempt limit', async () => {
    const fetchImpl = (async (url: string) => (url === TOKEN_URL ? tokenOk() : new Response('', { status: 500 }))) as unknown as typeof fetch;
    const r = await createGcsUploader({ bucket: 'b', fetchImpl, sleep: async () => {}, attempts: 2, log: () => {} }).upload({ objectName: 'k/x.json', body });
    expect(r).toMatchObject({ ok: false, error: 'HTTP 500' });
  });

  it('skips and logs once only on a clear not-on-GCP signal', async () => {
    const logs: string[] = [];
    const fetchImpl = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }) as unknown as typeof fetch;
    const up = createGcsUploader({ bucket: 'b', fetchImpl, log: (l) => logs.push(l) });
    expect(await up.upload({ objectName: 'a/1.json', body })).toMatchObject({ ok: false, skipped: true });
    await up.upload({ objectName: 'a/2.json', body });
    expect(logs).toHaveLength(1);
  });

  it('treats a persistent metadata token failure as an upload failure after 3 tries', async () => {
    let tries = 0;
    const fetchImpl = (async () => {
      tries++;
      throw new Error('timeout');
    }) as unknown as typeof fetch;
    const r = await createGcsUploader({ bucket: 'b', fetchImpl, sleep: async () => {}, log: () => {} }).upload({ objectName: 'a/1.json', body });
    expect(r.ok).toBe(false);
    expect(r.skipped).toBeUndefined();
    expect(tries).toBe(3);
  });

  it('retries an aborted upload and 408, and passes an abort signal', async () => {
    let puts = 0;
    const signals: (AbortSignal | undefined)[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url === TOKEN_URL) return tokenOk();
      signals.push(init?.signal ?? undefined);
      puts++;
      if (puts === 1) throw new DOMException('aborted', 'TimeoutError');
      return new Response('', { status: puts === 2 ? 408 : 200 });
    }) as unknown as typeof fetch;
    const r = await createGcsUploader({ bucket: 'b', fetchImpl, sleep: async () => {}, log: () => {} }).upload({ objectName: 'k/x.json', body });
    expect(r.ok).toBe(true);
    expect(puts).toBe(3);
    expect(signals.every((x) => !!x)).toBe(true);
  });

  it('uses a resumable upload (initiate + PUT) above the threshold', async () => {
    const calls: { url: string; method?: string }[] = [];
    const big = Buffer.alloc(RESUMABLE_THRESHOLD + 1, 97);
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url === TOKEN_URL) return tokenOk();
      calls.push({ url, method: init?.method });
      if (url.includes('uploadType=resumable')) return new Response('', { status: 200, headers: { location: 'https://storage.googleapis.com/upload/session/abc' } });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const r = await createGcsUploader({ bucket: 'b', fetchImpl, log: () => {} }).upload({ objectName: 'k/x.json', body: big });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PUT']);
    expect(calls[0].url).toContain('uploadType=resumable&name=k%2Fx.json');
    expect(calls[1].url).toBe('https://storage.googleapis.com/upload/session/abc');
  });

  it('builds colon-free object names', () => {
    expect(objectNameFor('acme/eu', new Date('2026-10-05T02:00:00.000Z'))).toBe('acme_eu/2026-10-05T02-00-00-000Z.json');
  });
});

describe('runBackupOnce with an uploader', () => {
  let dir: string;
  beforeAll(() => {
    process.env.E3_DB_PATH = ':memory:';
    closeDb();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-bku-'));
    const c = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    ProjectDAL.createProject({ client_id: c.id, key: 'acme-eu', name: 'Acme EU' });
  });
  afterAll(() => {
    closeDb();
    delete process.env.E3_DB_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const now = new Date('2026-10-05T02:00:00Z');

  it('uploads each file, keeps the local copy and records status', async () => {
    const seen: string[] = [];
    const fake: BackupUploader = { upload: async (r) => (seen.push(r.objectName), { ok: true, uri: `gs://x/${r.objectName}` }) };
    const r = await runBackupOnce(dir, 14, now, fake);
    expect(seen).toEqual(['acme-eu/2026-10-05T02-00-00-000Z.json']);
    expect(r.uploaded).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, 'backup-acme-eu-2026-10-05.json'))).toBe(true);
    expect(readBackupStatus(dir)).toEqual({ last_backup_at: now.toISOString(), last_upload_ok: true });
  });

  it('records last_upload_ok false on failure and null when skipped or unconfigured', async () => {
    await runBackupOnce(dir, 14, now, { upload: async () => ({ ok: false, error: 'HTTP 500' }) });
    expect(readBackupStatus(dir)?.last_upload_ok).toBe(false);
    await runBackupOnce(dir, 14, now, { upload: async () => ({ ok: false, skipped: true }) });
    expect(readBackupStatus(dir)?.last_upload_ok).toBeNull();
    await runBackupOnce(dir, 14, now, null);
    expect(readBackupStatus(dir)?.last_upload_ok).toBeNull();
  });
});

describe('restore rehearsal script', () => {
  it('restores the sandbox backup with exit 0', () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/restore-rehearsal.mjs', '.claude/team/samples/sandbox-project-backup.json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(r.stdout).toContain('Counts per table');
    expect(r.stdout).toContain('Open findings:');
    expect(r.status).toBe(0);
  }, 60000);

  it('exits non-zero for an unreadable file', () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/restore-rehearsal.mjs', 'does-not-exist.json'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(r.status).toBe(1);
  }, 60000);
});

describe('runBackupOnce with no projects', () => {
  it('keeps the previous last_backup_at when nothing is written', async () => {
    process.env.E3_DB_PATH = ':memory:';
    closeDb();
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-bke-'));
    fs.writeFileSync(path.join(d, 'last-backup.json'), JSON.stringify({ last_backup_at: '2026-01-01T00:00:00.000Z', last_upload_ok: true }));
    await runBackupOnce(d, 14, new Date(), { upload: async () => ({ ok: true }) });
    expect(readBackupStatus(d)?.last_backup_at).toBe('2026-01-01T00:00:00.000Z');
    closeDb();
    delete process.env.E3_DB_PATH;
    fs.rmSync(d, { recursive: true, force: true });
  });
});
