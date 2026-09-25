/**
 * Migration backfill test (T-2-12, D-38): applies 0001 through 0009 raw (the pre-`identifier_name`
 * schema, `identity_rules.bloomreach_field`), seeds a row directly with SQL (bypassing
 * `identity-rule.dal.ts`, which already speaks the post-migration shape), then applies 0013 in
 * isolation and asserts the rename preserved the value and the new columns exist and default to
 * NULL. Uses a private `better-sqlite3` connection, not `getDb()` (whose singleton always applies
 * every migration file in one shot), so this test controls exactly which migrations have run.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;

/**
 * Deliberately stops at 0009 and skips straight to 0013: 0010-0012 are being developed on sibling
 * task branches (T-2-02/T-2-06/T-2-11) in parallel with this one and are not present here. 0013 only
 * touches `identity_rules`, so replaying 0001-0009 plus 0013 is enough to exercise its backfill in
 * isolation; this test intentionally does not depend on 0010-0012 landing first or in any order, and
 * should keep working unmodified once they are merged (they don't touch `identity_rules`, per the
 * plan). If a future migration does touch `identity_rules` before 0013, add it to this list.
 */
const PRE_0013_MIGRATIONS = [
  '0001_core.sql',
  '0002_bundles.sql',
  '0003_unique_soft_delete.sql',
  '0004_catalog_mapping_role_soft_delete.sql',
  '0005_identity_rules_on_delete.sql',
  '0006_variants_conditions_key.sql',
  '0007_use_case_code_soft_delete.sql',
  '0008_findings_on_delete.sql',
  '0009_event_class.sql',
];

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function nowIso(): string {
  return new Date().toISOString();
}

describe('0013_identity_alignment.sql backfill', () => {
  it('renames bloomreach_field to identifier_name preserving data, and adds transformations_json/sdk_call as NULL', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');

    for (const file of PRE_0013_MIGRATIONS) {
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

    const ruleId = randomUUID();
    db.prepare(
      `INSERT INTO identity_rules (id, project_id, bloomreach_field, identity_type, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ruleId, projectId, 'registered', 'hard', 'Registration email', 0, ts, ts);

    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0013_identity_alignment.sql'), 'utf-8'));

    const columns = (db.prepare('PRAGMA table_info(identity_rules)').all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(columns).not.toContain('bloomreach_field');
    expect(columns).toContain('identifier_name');
    expect(columns).toContain('transformations_json');
    expect(columns).toContain('sdk_call');

    const row = db.prepare('SELECT * FROM identity_rules WHERE id = ?').get(ruleId) as Record<string, unknown>;
    expect(row.identifier_name).toBe('registered');
    expect(row.identity_type).toBe('hard');
    expect(row.name).toBe('Registration email');
    expect(row.transformations_json).toBeNull();
    expect(row.sdk_call).toBeNull();
  });
});
