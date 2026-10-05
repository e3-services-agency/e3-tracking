/** T-5-00 (D-66): backup job naming, retention (pure helpers) and one run against :memory:. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import { backupFileName, msUntilNextRun, runBackupOnce, selectBackupsToDelete } from '../backupJob';

describe('selectBackupsToDelete', () => {
  const names = (key: string, days: number[]) => days.map((d) => `backup-${key}-2026-09-${String(d).padStart(2, '0')}.json`);

  it('keeps the newest N per project and deletes the rest', () => {
    const files = [...names('acme', [1, 2, 3, 4, 5]), ...names('beta', [1, 2])];
    expect(selectBackupsToDelete(files, 3)).toEqual(names('acme', [1, 2]));
  });

  it('keeps everything when under the limit and ignores unrelated files', () => {
    expect(selectBackupsToDelete([...names('a', [1, 2]), 'notes.txt', 'backup-x.json.tmp'], 14)).toEqual([]);
  });

  it('handles project keys containing dashes and the default of 14', () => {
    const files = names('acme-eu', Array.from({ length: 16 }, (_, i) => i + 1));
    expect(selectBackupsToDelete(files)).toEqual(names('acme-eu', [1, 2]));
  });
});

describe('naming and schedule', () => {
  it('builds a dated, sanitized file name', () => {
    expect(backupFileName('a/b c', new Date('2026-10-05T10:00:00Z'))).toMatch(/^backup-a_b_c_[0-9a-f]{6}-2026-10-05.json$/);
    expect(backupFileName('a/b_c', new Date('2026-10-05T10:00:00Z'))).not.toBe(backupFileName('a/b c', new Date('2026-10-05T10:00:00Z')));
  });
  it('computes the wait to the next run hour', () => {
    expect(msUntilNextRun(new Date('2026-10-05T01:00:00Z'), 2)).toBe(3600_000);
    expect(msUntilNextRun(new Date('2026-10-05T02:00:00Z'), 2)).toBe(24 * 3600_000);
  });
});

describe('runBackupOnce', () => {
  let dir: string;
  beforeAll(() => {
    process.env.E3_DB_PATH = ':memory:';
    closeDb();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-bk-'));
    const c = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    ProjectDAL.createProject({ client_id: c.id, key: 'acme-eu', name: 'Acme EU' });
  });
  afterAll(() => {
    closeDb();
    delete process.env.E3_DB_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes one file per project and prunes old ones', async () => {
    fs.writeFileSync(path.join(dir, 'backup-acme-eu-2026-01-01.json'), '{}');
    fs.writeFileSync(path.join(dir, 'backup-acme-eu-2026-01-02.json'), '{}');
    fs.writeFileSync(path.join(dir, 'backup-acme-eu-2026-01-03.json.tmp'), '{');
    const r = await runBackupOnce(dir, 2, new Date('2026-10-05T02:00:00Z'));
    expect(r.failed).toEqual([]);
    expect(r.written).toEqual(['backup-acme-eu-2026-10-05.json']);
    expect(r.deleted).toEqual(['backup-acme-eu-2026-01-01.json']);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'backup-acme-eu-2026-10-05.json'), 'utf8'));
    expect(parsed.project.key).toBe('acme-eu');
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });
});
