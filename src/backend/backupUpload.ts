/**
 * Backup upload to Cloud Storage (D-72 item 6, T-5-08). No gcloud in the image: the Cloud Storage
 * JSON API with the VM metadata-server token. `BackupUploader` is the injectable seam for tests.
 * Also holds the small `last-backup.json` status file that `GET /api/health` reads.
 */
import fs from 'node:fs';
import path from 'node:path';

export const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
/** Bodies above this use a resumable upload (initiate + single PUT), below a media upload. */
export const RESUMABLE_THRESHOLD = 4 * 1024 * 1024;
export const STATUS_FILE = 'last-backup.json';

export interface UploadRequest {
  /** Object name inside the bucket, `<project_key>/<timestamp>.json`. */
  objectName: string;
  body: Buffer;
}
export interface UploadResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  uri?: string;
}
export interface BackupUploader {
  upload(req: UploadRequest): Promise<UploadResult>;
}

export interface GcsUploaderOptions {
  bucket: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  baseDelayMs?: number;
  log?: (line: string) => void;
}

/** Object name for a backup: project key with slashes replaced, timestamp without colons. */
export function objectNameFor(projectKey: string, now: Date): string {
  const key = projectKey.replace(/[/\\]/g, '_');
  return `${key}/${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

export function createGcsUploader(opts: GcsUploaderOptions): BackupUploader {
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const attempts = opts.attempts ?? 4;
  const base = opts.baseDelayMs ?? 1000;
  const log = opts.log ?? ((l: string) => console.log(l));
  let warnedNoMetadata = false;

  type Tok = { token: string } | { notGcp: true } | { error: string };

  function isNotGcp(err: unknown): boolean {
    const e = err as { code?: string; cause?: { code?: string } } | null;
    const code = e?.cause?.code ?? e?.code;
    return code === 'ENOTFOUND' || code === 'EAI_AGAIN';
  }

  async function token(): Promise<Tok> {
    let last = 'metadata token unavailable';
    for (let i = 1; i <= 3; i++) {
      try {
        const res = await f(TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const j = (await res.json()) as { access_token?: string };
          if (j.access_token) return { token: j.access_token };
          last = 'metadata token response without access_token';
        } else last = `metadata server HTTP ${res.status}`;
      } catch (err) {
        if (isNotGcp(err)) return { notGcp: true };
        last = `metadata server: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (i < 3) await sleep(base * 2 ** (i - 1));
    }
    return { error: last };
  }

  const timeoutMs = (bytes: number): number => Math.min(10 * 60_000, 60_000 + Math.ceil(bytes / 1_048_576) * 10_000);

  async function send(tok: string, objectName: string, body: Buffer): Promise<Response> {
    const bucket = encodeURIComponent(opts.bucket);
    const name = encodeURIComponent(objectName);
    const signal = AbortSignal.timeout(timeoutMs(body.length));
    if (body.length <= RESUMABLE_THRESHOLD) {
      return f(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body,
        signal,
      });
    }
    const init = await f(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=resumable&name=${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/json' },
      body: '{}',
      signal,
    });
    if (!init.ok) return init;
    const loc = init.headers.get('location');
    if (!loc) return new Response('', { status: 502 });
    return f(loc, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, signal });
  }

  return {
    async upload({ objectName, body }) {
      let lastError = 'unknown error';
      for (let i = 1; i <= attempts; i++) {
        const t = await token();
        if ('notGcp' in t) {
          if (!warnedNoMetadata) {
            warnedNoMetadata = true;
            log('[e3-backup] metadata server not resolvable (not on GCP?); skipping upload to gs://' + opts.bucket);
          }
          return { ok: false, skipped: true, error: 'not on GCP' };
        }
        if ('error' in t) {
          log(`[e3-backup] upload FAILED for gs://${opts.bucket}/${objectName}: ${t.error}`);
          return { ok: false, error: t.error };
        }
        try {
          const res = await send(t.token, objectName, body);
          if (res.ok) {
            const uri = `gs://${opts.bucket}/${objectName}`;
            log(`[e3-backup] uploaded ${uri} (${body.length} bytes)`);
            return { ok: true, uri };
          }
          lastError = `HTTP ${res.status}`;
          if (res.status < 500 && ![408, 429, 401].includes(res.status)) break; // not retryable
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err); // includes aborts: retryable
        }
        if (i < attempts) await sleep(base * 2 ** (i - 1));
      }
      log(`[e3-backup] upload FAILED for gs://${opts.bucket}/${objectName}: ${lastError}`);
      return { ok: false, error: lastError };
    },
  };
}

/** Uploader from the environment, or null when `BACKUP_BUCKET` is not set. */
export function uploaderFromEnv(env: NodeJS.ProcessEnv = process.env): BackupUploader | null {
  const bucket = env.BACKUP_BUCKET?.trim();
  return bucket ? createGcsUploader({ bucket }) : null;
}

export interface BackupStatus {
  last_backup_at: string | null;
  /** null when no upload is configured or the metadata server was unreachable. */
  last_upload_ok: boolean | null;
  last_upload_error?: string | null;
}

export function writeBackupStatus(dir: string, status: BackupStatus): void {
  const target = path.join(dir, STATUS_FILE);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(status));
  fs.renameSync(`${target}.tmp`, target);
}

export function readBackupStatus(dir: string): BackupStatus | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, STATUS_FILE), 'utf8')) as BackupStatus;
    return { last_backup_at: j.last_backup_at ?? null, last_upload_ok: j.last_upload_ok ?? null };
  } catch {
    return null;
  }
}
