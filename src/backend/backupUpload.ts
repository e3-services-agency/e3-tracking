/**
 * Backup upload to Cloud Storage (D-72 item 6, T-5-08). No gcloud in the image: the Cloud Storage
 * JSON API with the VM metadata-server token. `BackupUploader` is the injectable seam for tests.
 * Also holds the small `last-backup.json` status file that `GET /api/health` reads.
 */
import fs from 'node:fs';
import path from 'node:path';

export const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
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

  async function token(): Promise<string | null> {
    try {
      const res = await f(TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const j = (await res.json()) as { access_token?: string };
      return j.access_token ?? null;
    } catch {
      return null;
    }
  }

  return {
    async upload({ objectName, body }) {
      let lastError = 'unknown error';
      for (let i = 1; i <= attempts; i++) {
        const tok = await token();
        if (!tok) {
          if (!warnedNoMetadata) {
            warnedNoMetadata = true;
            log('[e3-backup] metadata server unreachable (not on GCP?); skipping upload to gs://' + opts.bucket);
          }
          return { ok: false, skipped: true, error: 'metadata server unreachable' };
        }
        try {
          const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(opts.bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
          const res = await f(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body,
          });
          if (res.ok) {
            const uri = `gs://${opts.bucket}/${objectName}`;
            log(`[e3-backup] uploaded ${uri} (${body.length} bytes)`);
            return { ok: true, uri };
          }
          lastError = `HTTP ${res.status}`;
          if (res.status < 500 && res.status !== 429 && res.status !== 401) break; // not retryable
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
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
