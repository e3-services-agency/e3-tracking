import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalFileStore } from './FileStore';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-filestore-'));
  process.env.E3_FILES_PATH = tmpDir;
});

afterEach(() => {
  delete process.env.E3_FILES_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('LocalFileStore', () => {
  it('writes a file and reads it back byte-identical', async () => {
    const store = new LocalFileStore();
    const buffer = Buffer.from('hello world');
    const stored = await store.put('proj-1', 'event_trigger', 'screenshot.png', buffer, 'image/png');

    expect(stored.path.startsWith('proj-1/event_trigger/')).toBe(true);
    expect(stored.path.endsWith('-screenshot.png')).toBe(true);

    const opened = await store.open(stored.path);
    expect(opened.buffer.equals(buffer)).toBe(true);
    expect(opened.mime).toBe('image/png');
  });

  it('sanitizes path-traversal attempts in projectId/kind/filename', async () => {
    const store = new LocalFileStore();
    const stored = await store.put('../../evil', '../escape', '../../../etc/passwd', Buffer.from('x'), 'text/plain');

    const resolvedRoot = path.resolve(tmpDir);
    const resolvedStored = path.resolve(tmpDir, stored.path);
    expect(resolvedStored.startsWith(resolvedRoot + path.sep)).toBe(true);
    // No file escaped the store root.
    expect(fs.existsSync(path.join(tmpDir, '..', '..', 'evil'))).toBe(false);
  });

  it('refuses to open a path that resolves outside the store root', async () => {
    const store = new LocalFileStore();
    await expect(store.open('../outside.txt')).rejects.toThrow();
  });
});
