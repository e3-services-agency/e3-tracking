/** Migration 0026 (T-4-19, D-53 amendment 7): unwraps Bloomreach-quoted example values. */
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

describe('0026_example_values_cleanup.sql', () => {
  it('unwraps quoted and bracketed single examples, leaves everything else', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files.filter((f) => f < '0026')) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    const ts = new Date().toISOString();
    const clientId = randomUUID();
    db.prepare('INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(clientId, 'acme', 'Acme', ts, ts);
    const projectId = randomUUID();
    db.prepare('INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(projectId, clientId, 'Acme', 'acme-a', ts, ts);
    const cases: [string, unknown, unknown][] = [
      ['a_quoted', [{ value: '"2023"' }], [{ value: '2023' }]],
      ['b_tail', [{ value: '"2023"]' }], [{ value: '2023' }]],
      ['c_both', [{ value: '["x"]' }], [{ value: 'x' }]],
      ['d_plain', [{ value: 'https://facebook.com' }], [{ value: 'https://facebook.com' }]],
      ['e_inner_quote', [{ value: '"a","b"' }], [{ value: '"a","b"' }]],
      ['f_empty', [], []],
    ];
    const ins = db.prepare(
      "INSERT INTO properties (id, project_id, name, scope, data_type, example_values_json, created_at, updated_at) VALUES (?, ?, ?, 'event', 'string', ?, ?, ?)"
    );
    for (const [name, before] of cases) ins.run(randomUUID(), projectId, name, JSON.stringify(before), ts, ts);
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0026_example_values_cleanup.sql'), 'utf-8'));
    for (const [name, , after] of cases) {
      const row = db.prepare('SELECT example_values_json AS e FROM properties WHERE name = ?').get(name) as { e: string };
      expect(JSON.parse(row.e), name).toEqual(after);
    }
  });
});
