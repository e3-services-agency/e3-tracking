/**
 * Migration test (T-4-20, D-64, D-53 amendment 8): `properties.category_override` is added as a
 * nullable column next to the existing Data Manager `properties.category`, with no backfill, and
 * its CHECK accepts only the four categories.
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

describe('0027_property_category.sql', () => {
  it('adds a nullable category_override with a CHECK, no backfill, keeps category', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files.filter((f) => f < '0027')) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    const projectId = randomUUID();
    const now = new Date().toISOString();
    const propertyId = randomUUID();
    db.prepare(
      `INSERT INTO properties (id, project_id, scope, name, category, data_type, created_at, updated_at) VALUES (?, ?, 'customer', 'email', 'Contact', 'string', ?, ?)`
    ).run(propertyId, projectId, now, now);
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0027_property_category.sql'), 'utf-8'));
    const row = db.prepare('SELECT category, category_override FROM properties WHERE id = ?').get(propertyId) as {
      category: string;
      category_override: string | null;
    };
    expect(row).toEqual({ category: 'Contact', category_override: null });
    db.prepare('UPDATE properties SET category_override = ? WHERE id = ?').run('sdk_default', propertyId);
    expect(() => db!.prepare('UPDATE properties SET category_override = ? WHERE id = ?').run('bogus', propertyId)).toThrow();
  });
});
