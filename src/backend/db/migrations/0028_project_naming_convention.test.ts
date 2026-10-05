/**
 * Migration test (T-4-22, D-65, D-53 amendment 9): `projects.naming_convention` defaults existing
 * rows to snake_case and its CHECK accepts only the three conventions.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

describe('0028_project_naming_convention.sql', () => {
  it('backfills existing projects with snake_case and enforces the CHECK', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files.filter((f) => f < '0028')) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    const now = new Date().toISOString();
    const projectId = randomUUID();
    db.prepare(`INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, 'P', 'p', ?, ?)`).run(projectId, randomUUID(), now, now);
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0028_project_naming_convention.sql'), 'utf-8'));
    const row = db.prepare('SELECT naming_convention FROM projects WHERE id = ?').get(projectId) as { naming_convention: string };
    expect(row.naming_convention).toBe('snake_case');
    for (const ok of ['kebab_case', 'camel_case']) {
      db.prepare('UPDATE projects SET naming_convention = ? WHERE id = ?').run(ok, projectId);
    }
    expect(() => db!.prepare('UPDATE projects SET naming_convention = ? WHERE id = ?').run('PascalCase', projectId)).toThrow();
  });
});
