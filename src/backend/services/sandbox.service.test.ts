/**
 * D-60 sandbox creation tests (T-4-09): builds a real (small) backup through `backup.service.ts`
 * from an in-memory fixture project, points `createSandboxProject` at it via
 * `E3_SANDBOX_BACKUP_PATH` (so the test never depends on the real, large bundled sandbox backup),
 * and asserts the restored project is flagged and share-refused without `force`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import { buildBackup } from './backup.service';
import { createSandboxProject } from './sandbox.service';
import { SandboxShareRefusedError } from '../errors';

let backupPath: string;

beforeEach(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-src', name: 'Acme source' });
  EventDAL.createEvent(project.id, { name: 'cart_update', class: 'custom' } as any);

  const backup = await buildBackup(project.id);
  const dir = mkdtempSync(join(tmpdir(), 'e3-sandbox-test-'));
  backupPath = join(dir, 'sandbox-project-backup.json');
  writeFileSync(backupPath, JSON.stringify(backup));
  process.env.E3_SANDBOX_BACKUP_PATH = backupPath;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
  delete process.env.E3_SANDBOX_BACKUP_PATH;
  try {
    unlinkSync(backupPath);
  } catch {
    // ignore
  }
});

describe('sandbox.service: createSandboxProject (D-60)', () => {
  it('auto-creates a Sandboxes client when none is given, and flags the new project as a sandbox', async () => {
    const { project } = await createSandboxProject({});
    expect(project.is_sandbox).toBe(true);
    expect(project.key).toMatch(/^sandbox-/);

    const withClient = ProjectDAL.getProjectWithClient(project.id);
    expect(withClient.client?.key).toBe('sandboxes');
  });

  it('restores under a given client_id instead of auto-creating one', async () => {
    const client = ClientDAL.createClient({ key: 'dest', name: 'Dest client' });
    const { project } = await createSandboxProject({ client_id: client.id, name: 'My sandbox' });
    expect(project.client_id).toBe(client.id);
    expect(project.is_sandbox).toBe(true);
  });

  it('refuses to create a share link on a sandbox project without force, and allows it with force', async () => {
    const { project } = await createSandboxProject({});
    expect(() => ProjectDAL.createOrRotateShare(project.id, 'read')).toThrow(SandboxShareRefusedError);
    const shared = ProjectDAL.createOrRotateShare(project.id, 'read', { force: true });
    expect(shared.share_token).toBeTruthy();
  });

  it('assigns distinct sandbox-<slug> keys when created twice', async () => {
    const first = await createSandboxProject({});
    const second = await createSandboxProject({});
    expect(first.project.key).not.toBe(second.project.key);
  });

  // W1 fix round (reviewer FAIL 2026-09-28): the key used to come out as
  // `sandbox-sandbox-acme-eu-sandbox` (the word "sandbox" baked into the slug twice, once from a
  // "Sandbox: " prefix on the backup's own project name and once from this service's own
  // " (sandbox)" display-name suffix, on top of `nextSandboxKey`'s `sandbox-` prefix). The fixture
  // backup's project is named "Acme source" (no "sandbox" substring), so the key must be exactly
  // `sandbox-acme-source`, then `sandbox-acme-source-2` on a second create -- never a duplicated
  // "sandbox" anywhere in the slug.
  it('builds the key as sandbox-<slug of the backup project name>, with no duplicated prefix or suffix', async () => {
    const first = await createSandboxProject({});
    expect(first.project.key).toBe('sandbox-acme-source');
    const second = await createSandboxProject({});
    expect(second.project.key).toBe('sandbox-acme-source-2');
    const third = await createSandboxProject({});
    expect(third.project.key).toBe('sandbox-acme-source-3');
  });

  it('strips a trailing "sandbox" word from an explicit name before slugifying, so the key never doubles it', async () => {
    const { project } = await createSandboxProject({ name: 'My sandbox' });
    expect(project.key).toBe('sandbox-my');
  });
});
