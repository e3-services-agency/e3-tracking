/**
 * Migration test (T-4-11B, D-61, D-62, D-53 amendment 10): catalog kind backfill from the mapping
 * role / catalog_type, the CHECKs on the new catalog and source columns, and
 * `projects.default_source_id` going NULL when its source is deleted.
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

function applyBefore(): { projectId: string; now: string } {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files.filter((f) => f < '0029')) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
  const now = new Date().toISOString();
  const clientId = randomUUID();
  db.prepare(`INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, 'c', 'C', ?, ?)`).run(clientId, now, now);
  const projectId = randomUUID();
  db.prepare(`INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, 'P', 'p', ?, ?)`).run(projectId, clientId, now, now);
  return { projectId, now };
}

function insertCatalog(projectId: string, now: string, name: string, role: string | null, type: string | null): string {
  const id = randomUUID();
  db!.prepare(`INSERT INTO catalogs (id, project_id, name, catalog_type, mapping_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, projectId, name, type, role, now, now);
  return id;
}

describe('0029_catalogs_sources.sql', () => {
  it('backfills catalogs.kind from mapping_role then catalog_type, defaults version v1', () => {
    const { projectId, now } = applyBefore();
    insertCatalog(projectId, now, 'main', 'main', null);
    insertCatalog(projectId, now, 'var', 'variant', 'product');
    insertCatalog(projectId, now, 'a', null, 'Variants feed');
    insertCatalog(projectId, now, 'b', null, 'product catalog');
    insertCatalog(projectId, now, 'c', null, 'stores');
    insertCatalog(projectId, now, 'd', null, null);
    db!.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0029_catalogs_sources.sql'), 'utf-8'));
    const rows = db!.prepare('SELECT name, kind, version, market, language, live_at, searchable_snapshot_json FROM catalogs ORDER BY name').all() as Record<string, unknown>[];
    const kinds = Object.fromEntries(rows.map((r) => [r.name, r.kind]));
    expect(kinds).toEqual({ main: 'product', var: 'variant', a: 'variant', b: 'product', c: 'other', d: 'other' });
    for (const r of rows) {
      expect(r.version).toBe('v1');
      expect(r.market).toBeNull();
      expect(r.language).toBeNull();
      expect(r.live_at).toBeNull();
      expect(r.searchable_snapshot_json).toBeNull();
    }
  });

  it('enforces the CHECKs and nulls default_source_id when the source is deleted', () => {
    const { projectId, now } = applyBefore();
    const sourceId = randomUUID();
    db!.prepare(`INSERT INTO sources (id, project_id, name, created_at, updated_at) VALUES (?, ?, 'S', ?, ?)`).run(sourceId, projectId, now, now);
    db!.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0029_catalogs_sources.sql'), 'utf-8'));
    const src = db!.prepare('SELECT system, method FROM sources WHERE id = ?').get(sourceId) as { system: string; method: string | null };
    expect(src).toEqual({ system: 'other', method: null });
    db!.prepare('UPDATE sources SET system = ?, method = ? WHERE id = ?').run('shopify', 'web_sdk_gtm_datalayer', sourceId);
    expect(() => db!.prepare('UPDATE sources SET system = ? WHERE id = ?').run('nope', sourceId)).toThrow();
    expect(() => db!.prepare('UPDATE sources SET method = ? WHERE id = ?').run('nope', sourceId)).toThrow();
    const catalogId = insertCatalog(projectId, now, 'x', null, null);
    expect(() => db!.prepare('UPDATE catalogs SET kind = ? WHERE id = ?').run('nope', catalogId)).toThrow();
    expect(() => db!.prepare('UPDATE catalogs SET version = ? WHERE id = ?').run('v3', catalogId)).toThrow();
    db!.prepare('UPDATE projects SET default_source_id = ? WHERE id = ?').run(sourceId, projectId);
    db!.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);
    const proj = db!.prepare('SELECT default_source_id FROM projects WHERE id = ?').get(projectId) as { default_source_id: string | null };
    expect(proj.default_source_id).toBeNull();
  });
});
