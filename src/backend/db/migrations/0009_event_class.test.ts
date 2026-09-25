/**
 * Migration backfill test (T-2-01, D-36): applies 0001 through 0008 raw (the pre-`class` schema,
 * `events.event_type custom|system`), seeds a custom row, a known-sdk-named system row and a
 * known-platform-named system row directly with SQL (bypassing `event.dal.ts`, which already
 * speaks the post-migration `class` shape), then applies 0009 in isolation and asserts the
 * backfilled `class` values and that `event_type` is gone. Uses a private `better-sqlite3`
 * connection, not `getDb()` (whose singleton always applies every migration file in one shot),
 * so this test controls exactly which migrations have run at each step.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;

const PRE_0009_MIGRATIONS = [
  '0001_core.sql',
  '0002_bundles.sql',
  '0003_unique_soft_delete.sql',
  '0004_catalog_mapping_role_soft_delete.sql',
  '0005_identity_rules_on_delete.sql',
  '0006_variants_conditions_key.sql',
  '0007_use_case_code_soft_delete.sql',
  '0008_findings_on_delete.sql',
];

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function nowIso(): string {
  return new Date().toISOString();
}

describe('0009_event_class.sql backfill', () => {
  it('maps custom rows to custom, known-sdk-named system rows to sdk, other system rows to platform, and drops event_type', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');

    for (const file of PRE_0009_MIGRATIONS) {
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    }

    const ts = nowIso();
    const clientId = randomUUID();
    db.prepare(
      'INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(clientId, 'acme', 'Acme', ts, ts);
    const projectId = randomUUID();
    db.prepare(
      'INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(projectId, clientId, 'Acme Brand A', 'acme-brand-a', ts, ts);

    const insertEvent = db.prepare(
      `INSERT INTO events (id, project_id, name, event_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const customId = randomUUID();
    insertEvent.run(customId, projectId, 'purchase', 'custom', 'planned', ts, ts);
    const sdkId = randomUUID();
    insertEvent.run(sdkId, projectId, 'session_start', 'system', 'planned', ts, ts);
    const platformId = randomUUID();
    insertEvent.run(platformId, projectId, 'campaign', 'system', 'planned', ts, ts);
    // An "unknown" system-typed row (not in the SDK list) still lands as platform, per the
    // migration's CASE: any `event_type = 'system'` row not in the SDK name list is platform.
    const unknownSystemId = randomUUID();
    insertEvent.run(unknownSystemId, projectId, 'some_unmodeled_system_event', 'system', 'planned', ts, ts);

    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0009_event_class.sql'), 'utf-8'));

    const rows = db
      .prepare('SELECT id, name, class FROM events ORDER BY name')
      .all() as { id: string; name: string; class: string }[];
    const classByName = Object.fromEntries(rows.map((r) => [r.name, r.class]));

    expect(classByName.purchase).toBe('custom');
    expect(classByName.session_start).toBe('sdk');
    expect(classByName.campaign).toBe('platform');
    expect(classByName.some_unmodeled_system_event).toBe('platform');

    const columns = (db.prepare('PRAGMA table_info(events)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('event_type');
    expect(columns).toContain('class');
  });
});
