/**
 * Migration test (T-2-02, D-28): 0010 only adds nullable columns (`ALTER TABLE ... ADD COLUMN`,
 * no table rebuild needed — every new column is nullable, unlike 0003/0009's NOT NULL/dropped
 * columns), so this just asserts the columns exist and accept a write after applying 0001-0010 in
 * isolation. Uses a private `better-sqlite3` connection, not `getDb()`, so this test controls
 * exactly which migrations have run (mirrors `0009_event_class.test.ts`).
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;

const MIGRATIONS_THROUGH_0010 = [
  '0001_core.sql',
  '0002_bundles.sql',
  '0003_unique_soft_delete.sql',
  '0004_catalog_mapping_role_soft_delete.sql',
  '0005_identity_rules_on_delete.sql',
  '0006_variants_conditions_key.sql',
  '0007_use_case_code_soft_delete.sql',
  '0008_findings_on_delete.sql',
  '0009_event_class.sql',
  '0010_data_manager_meta.sql',
];

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function columnNames(database: Database.Database, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe('0010_data_manager_meta.sql', () => {
  it('adds the Data Manager meta columns to properties, events, event_properties and projects', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const file of MIGRATIONS_THROUGH_0010) {
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    }

    expect(columnNames(db, 'properties')).toContain('bloomreach_meta_json');
    expect(columnNames(db, 'events')).toEqual(expect.arrayContaining(['category', 'bloomreach_meta_json']));
    expect(columnNames(db, 'event_properties')).toContain('bloomreach_meta_json');
    expect(columnNames(db, 'projects')).toEqual(
      expect.arrayContaining(['data_manager_meta_json', 'data_manager_customers_json', 'data_manager_events_json'])
    );

    // Every new column is nullable: an insert that omits them must still succeed.
    const ts = new Date().toISOString();
    const clientId = 'c1';
    db.prepare('INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      clientId,
      'acme',
      'Acme',
      ts,
      ts
    );
    expect(() =>
      db!
        .prepare('INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('p1', clientId, 'Acme EU', 'acme-eu', ts, ts)
    ).not.toThrow();
  });
});
