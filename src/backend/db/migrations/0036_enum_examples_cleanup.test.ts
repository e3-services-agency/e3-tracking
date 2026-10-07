/** Migration 0036 (T-5-11): enum examples must be allowed values. */
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

describe('0036_enum_examples_cleanup.sql', () => {
  it('drops examples outside the allowed set, keeps order, leaves non-enums alone, idempotent', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files.filter((f) => f < '0036')) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    const ts = new Date().toISOString();
    const clientId = randomUUID();
    db.prepare('INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(clientId, 'acme', 'Acme', ts, ts);
    const projectId = randomUUID();
    db.prepare('INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(projectId, clientId, 'Acme', 'acme-a', ts, ts);
    const allowed = [{ value: 'add' }, { value: 'remove' }, { value: 'view' }];
    const cases: [string, unknown, unknown, unknown][] = [
      ['a_mixed', allowed, [{ value: 'click' }, { value: 'view' }, { value: 'add' }], [{ value: 'view' }, { value: 'add' }]],
      ['b_all_bad', allowed, [{ value: 'add / remove / ...' }], []],
      ['c_ok', allowed, [{ value: 'add' }], [{ value: 'add' }]],
      ['d_free_text', [], [{ value: 'anything' }], [{ value: 'anything' }]],
    ];
    const ins = db.prepare(
      "INSERT INTO properties (id, project_id, name, scope, data_type, allowed_values_json, example_values_json, created_at, updated_at) VALUES (?, ?, ?, 'event', 'string', ?, ?, ?, ?)"
    );
    for (const [name, al, ex] of cases) ins.run(randomUUID(), projectId, name, JSON.stringify(al), JSON.stringify(ex), ts, ts);
    const propId = (db.prepare('SELECT id FROM properties WHERE name = ?').get('a_mixed') as { id: string }).id;
    db.prepare(
      'INSERT INTO property_definitions (id, project_id, property_id, name, allowed_values_json, example_values_json, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
    ).run(randomUUID(), projectId, propId, 'general', JSON.stringify(allowed), JSON.stringify([{ value: 'click' }]), ts, ts);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0036_enum_examples_cleanup.sql'), 'utf-8');
    const snapshot = () => ({
      props: db!.prepare('SELECT name, example_values_json FROM properties ORDER BY name').all(),
      defs: db!.prepare('SELECT example_values_json FROM property_definitions').all(),
    });
    db.exec(sql);
    for (const [name, , , after] of cases) {
      const row = db.prepare('SELECT example_values_json AS e FROM properties WHERE name = ?').get(name) as { e: string };
      expect(JSON.parse(row.e), name).toEqual(after);
    }
    const def = db.prepare('SELECT example_values_json AS e FROM property_definitions').get() as { e: string };
    expect(JSON.parse(def.e)).toEqual([]);
    const once = snapshot();
    db.exec(sql);
    expect(snapshot()).toEqual(once);
  });
});
