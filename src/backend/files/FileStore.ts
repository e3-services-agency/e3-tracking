/**
 * Local file store (D-14): uploaded files (event trigger screenshots, project logo) live on the
 * local filesystem behind this interface so a remote implementation (phase 5) is a swap, not a
 * rewrite. `put()` returns a relative `path` that entities store instead of a URL; `open()` reads
 * it back for serving through `GET /api/projects/:id/files/*`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface StoredFile {
  /** Relative path stored on the entity, e.g. `<projectId>/<kind>/<uuid>-<safeName>`. */
  path: string;
  mime: string;
}

export interface OpenedFile {
  buffer: Buffer;
  mime: string;
}

export interface FileStore {
  put(projectId: string, kind: string, filename: string, buffer: Buffer, mime: string): Promise<StoredFile>;
  open(relativePath: string): Promise<OpenedFile>;
  /**
   * Like `open()`, but also requires the resolved path to stay under this specific project's own
   * subtree (D-14 project scoping, fix round finding #5): a request like `A/../B/secret.png`
   * resolves to a path that is still under the overall store root (so `open()`'s own check would
   * let it through) but escapes project A's directory into project B's. Routes must use this, not
   * `open()`, for anything served under `/api/projects/:projectId/files/*`.
   */
  openForProject(projectId: string, relativePath: string): Promise<OpenedFile>;
  /**
   * Removes every file written for `projectId` (its whole directory under the store root),
   * recursively, never throwing (T-3-05 pre-QA fix: a failed backup restore must clean up any
   * file it already wrote before the surrounding transaction rolled back, and there is nothing
   * useful to do if the cleanup itself fails -- the caller is already reporting a different error).
   */
  removeProjectFiles(projectId: string): Promise<void>;
  /** Best-effort removal of one file under a project (T-5-04: deleted comment images); never throws. */
  removeFile(projectId: string, relativePath: string): Promise<void>;
}

function filesRoot(): string {
  const configured = process.env.E3_FILES_PATH?.trim() || './data/files';
  return path.resolve(configured);
}

/** Strip anything that could escape the target directory; keep the request readable. */
function safeSegment(value: string): string {
  const trimmed = value.trim().replace(/[\\/]/g, '_');
  const cleaned = trimmed.replace(/\.\./g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'file';
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function guessMimeFromExt(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export class LocalFileStore implements FileStore {
  async put(
    projectId: string,
    kind: string,
    filename: string,
    buffer: Buffer,
    mime: string
  ): Promise<StoredFile> {
    const safeProjectId = safeSegment(projectId);
    // `kind` may be nested (`comments/<id>`, T-5-04); each segment is sanitized on its own.
    const safeKind = kind.split('/').filter(Boolean).map(safeSegment).join('/') || 'file';
    const safeName = safeSegment(filename);
    const storedName = `${randomUUID()}-${safeName}`;
    const relativePath = path.posix.join(safeProjectId, safeKind, storedName);

    const root = filesRoot();
    const absoluteDir = path.join(root, safeProjectId, safeKind);
    const absolutePath = path.join(absoluteDir, storedName);

    // Defence in depth: the resolved path must stay under `root` even though `safeSegment`
    // already strips path separators and `..` (path traversal, T-1-02 acceptance).
    const resolvedRoot = path.resolve(root) + path.sep;
    const resolvedTarget = path.resolve(absolutePath);
    if (!resolvedTarget.startsWith(resolvedRoot)) {
      throw new Error('Resolved file path escapes the file store root.');
    }

    fs.mkdirSync(absoluteDir, { recursive: true });
    fs.writeFileSync(absolutePath, buffer);

    return { path: relativePath, mime: mime || guessMimeFromExt(filename) };
  }

  async open(relativePath: string): Promise<OpenedFile> {
    const root = filesRoot();
    const resolvedRoot = path.resolve(root) + path.sep;
    const resolvedTarget = path.resolve(root, relativePath);
    if (!resolvedTarget.startsWith(resolvedRoot)) {
      throw new Error('Requested file path escapes the file store root.');
    }
    const buffer = fs.readFileSync(resolvedTarget);
    return { buffer, mime: guessMimeFromExt(resolvedTarget) };
  }

  async openForProject(projectId: string, relativePath: string): Promise<OpenedFile> {
    const root = filesRoot();
    const resolvedRoot = path.resolve(root) + path.sep;
    // `put()` sanitizes `projectId` through `safeSegment` before it ever touches disk, so the
    // on-disk project directory is the sanitized form; require the same here rather than trusting
    // the caller's raw id.
    const projectRoot = path.resolve(root, safeSegment(projectId)) + path.sep;

    // Reject `..`/`.` segments explicitly (defence in depth on top of routes/files.ts's own
    // decode-and-reject step): a caller that skipped that step must not fall through to a
    // path.resolve() that would silently normalize `..` away.
    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    if (segments.some((s) => s === '..' || s === '.')) {
      throw new Error('Requested file path contains parent traversal segments.');
    }

    const resolvedTarget = path.resolve(root, relativePath);
    if (!resolvedTarget.startsWith(resolvedRoot) || !resolvedTarget.startsWith(projectRoot)) {
      throw new Error('Requested file path escapes the project file store root.');
    }
    const buffer = fs.readFileSync(resolvedTarget);
    return { buffer, mime: guessMimeFromExt(resolvedTarget) };
  }

  async removeFile(projectId: string, relativePath: string): Promise<void> {
    try {
      const root = filesRoot();
      const projectRoot = path.resolve(root, safeSegment(projectId)) + path.sep;
      const target = path.resolve(root, relativePath);
      if (!target.startsWith(projectRoot)) return;
      fs.rmSync(target, { force: true });
      try {
        fs.rmdirSync(path.dirname(target)); // only succeeds when now empty (comments/<id>/)
      } catch {
        // not empty or already gone
      }
    } catch {
      // best-effort
    }
  }

  async removeProjectFiles(projectId: string): Promise<void> {
    const root = filesRoot();
    const resolvedRoot = path.resolve(root) + path.sep;
    const projectDir = path.resolve(root, safeSegment(projectId));
    // Defence in depth (same shape as every other method here): never remove anything outside
    // the store root, and never throw -- this is best-effort cleanup on an already-failing path.
    if (!projectDir.startsWith(resolvedRoot)) return;
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // best-effort; the caller is already reporting a different error
    }
  }
}

let store: FileStore | null = null;

/** Singleton local file store. A remote implementation would be selected here by env var. */
export function getFileStore(): FileStore {
  if (!store) store = new LocalFileStore();
  return store;
}
