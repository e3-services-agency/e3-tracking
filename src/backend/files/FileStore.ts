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
    const safeKind = safeSegment(kind);
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
}

let store: FileStore | null = null;

/** Singleton local file store. A remote implementation would be selected here by env var. */
export function getFileStore(): FileStore {
  if (!store) store = new LocalFileStore();
  return store;
}
