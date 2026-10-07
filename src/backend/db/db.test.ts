import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getDb, listMigrationFiles } from './index';

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

function nowIso(): string {
  return new Date().toISOString();
}

/** Seed a client and a project under it, returning both ids. */
function seedClientAndProject(db: ReturnType<typeof getDb>, suffix: string): { clientId: string; projectId: string } {
  const ts = nowIso();
  const clientId = randomUUID();
  db.prepare(
    'INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(clientId, `client-${suffix}`, `Client ${suffix}`, ts, ts);

  const projectId = randomUUID();
  db.prepare(
    'INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(projectId, clientId, `Project ${suffix}`, `project-${suffix}`, ts, ts);

  return { clientId, projectId };
}

describe('getDb on :memory:', () => {
  it('runs migrations and records them in schema_migrations', () => {
    const db = getDb();
    const migrations = db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[];
    expect(migrations.map((m) => m.id)).toContain('0001_core.sql');
    expect(migrations.map((m) => m.id)).toContain('0002_bundles.sql');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    for (const table of [
      'clients',
      'projects',
      'project_members',
      'sources',
      'event_sources',
      'properties',
      'events',
      'event_properties',
      'variants',
      'standard_event_mappings',
      'identity_rules',
      'catalogs',
      'catalog_fields',
      'consent_categories',
      'use_case_templates',
      'use_cases',
      'requirements',
      'qa_runs',
      'observations',
      'findings',
      'property_bundles',
      'property_bundle_items',
    ]) {
      expect(tables, `missing table ${table}`).toContain(table);
    }

    // Removed-from-schema tables (D-17, D-18; the pre-D-15 rewrite dropped the old
    // customer-lifecycle and multi-tenant-scope tables entirely) must not exist.
    for (const table of [
      'qa_run_evidence',
      'qa_run_payloads',
      'event_variants',
      'event_property_definitions',
      'metrics',
    ]) {
      expect(tables, `table ${table} should not exist`).not.toContain(table);
    }
  });

  it('returns the same connection on repeated calls', () => {
    expect(getDb()).toBe(getDb());
  });

  it('enforces foreign keys pragma is on', () => {
    const db = getDb();
    const result = db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
  });

  it('leaves no dangling foreign keys after the 0003 table-rebuild migration', () => {
    const db = getDb();
    expect(db.pragma('foreign_key_check')).toEqual([]);
    // The rebuild's temp tables must not leak into the final schema.
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const leftover of ['projects_new', 'events_new', 'properties_new', 'property_bundles_new']) {
      expect(tables).not.toContain(leftover);
    }
  });

  it('leaves no dangling foreign keys and no leftover temp table after the 0005 identity_rules rebuild', () => {
    const db = getDb();
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).not.toContain('identity_rules_new');
    expect(tables).toContain('identity_rules');
  });
});

describe('inserting and linking core entities on :memory:', () => {
  it('inserts a client, a project, an event and a property and links them', () => {
    const db = getDb();
    const ts = nowIso();

    const clientId = randomUUID();
    db.prepare(
      'INSERT INTO clients (id, key, name, bloomreach_account_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(clientId, 'acme', 'Acme', null, null, ts, ts);

    const projectId = randomUUID();
    db.prepare(
      `INSERT INTO projects (id, client_id, name, key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(projectId, clientId, 'Acme Brand A', 'acme-brand-a', ts, ts);

    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, project_id, name, class, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(eventId, projectId, 'purchase', 'custom', 'planned', ts, ts);

    const propertyId = randomUUID();
    db.prepare(
      `INSERT INTO properties (id, project_id, scope, name, data_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(propertyId, projectId, 'event', 'total_price', 'number', ts, ts);

    db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(eventId, propertyId, 1, 'normal', ts, ts);

    const linked = db
      .prepare(
        `SELECT e.name AS event_name, p.name AS property_name, ep.required
         FROM event_properties ep
         JOIN events e ON e.id = ep.event_id
         JOIN properties p ON p.id = ep.property_id
         WHERE ep.event_id = ? AND ep.property_id = ?`
      )
      .get(eventId, propertyId) as { event_name: string; property_name: string; required: number };

    expect(linked).toEqual({ event_name: 'purchase', property_name: 'total_price', required: 1 });
  });

  it('rejects a project with a non-existent client_id (foreign key)', () => {
    const db = getDb();
    const ts = nowIso();
    expect(() =>
      db
        .prepare(
          `INSERT INTO projects (id, client_id, name, key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), randomUUID(), 'Orphan project', 'orphan-project', ts, ts)
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('rejects a project without a client_id (NOT NULL)', () => {
    const db = getDb();
    const ts = nowIso();
    expect(() =>
      db
        .prepare(
          `INSERT INTO projects (id, client_id, name, key, created_at, updated_at)
           VALUES (?, NULL, ?, ?, ?, ?)`
        )
        .run(randomUUID(), 'No client', 'no-client', ts, ts)
    ).toThrow(/NOT NULL constraint failed/);
  });

  it('rejects a duplicate client key (unique constraint)', () => {
    const db = getDb();
    const ts = nowIso();
    db.prepare(
      'INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), 'dup-key', 'First', ts, ts);

    expect(() =>
      db
        .prepare(
          'INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(randomUUID(), 'dup-key', 'Second', ts, ts)
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('rejects a duplicate event name within the same project (unique per project, name)', () => {
    const db = getDb();
    const ts = nowIso();
    const clientId = randomUUID();
    db.prepare(
      'INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(clientId, 'acme2', 'Acme 2', ts, ts);
    const projectId = randomUUID();
    db.prepare(
      'INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(projectId, clientId, 'Acme Brand B', 'acme-brand-b', ts, ts);

    db.prepare(
      `INSERT INTO events (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), projectId, 'checkout', ts, ts);

    expect(() =>
      db
        .prepare(
          `INSERT INTO events (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), projectId, 'checkout', ts, ts)
    ).toThrow(/UNIQUE constraint failed/);
  });
});

const ALL_MIGRATION_FILES = [
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
  '0011_rules.sql',
  '0012_use_case_narrative.sql',
  '0013_identity_alignment.sql',
  '0014_findings_manual_resolve.sql',
  '0015_change_log.sql',
  '0016_use_case_template_tags.sql',
  '0017_project_industry_and_requirement_targets.sql',
  '0018_project_share_created_at.sql',
  '0019_comments.sql',
  '0021_property_definitions.sql',
  '0022_use_case_template_source.sql',
  '0023_project_settings_json.sql',
  '0024_comment_visibility.sql',
  '0025_implementation_contract.sql',
  '0026_example_values_cleanup.sql',
  '0027_property_category.sql',
  '0028_project_naming_convention.sql',
  '0029_catalogs_sources.sql',
  '0030_identifiers_source_color.sql',
  '0031_catalog_field_order.sql',
  '0032_identifiers.sql',
  '0035_comment_attachments.sql',
];

describe('listMigrationFiles', () => {
  it('lists every ordered migration file', () => {
    expect(listMigrationFiles()).toEqual(ALL_MIGRATION_FILES);
  });
});

describe('migration idempotency', () => {
  it('running migrations twice against the same file applies each migration once', () => {
    const tmpDbPath = path.join(os.tmpdir(), `e3-tracking-test-${randomUUID()}.sqlite`);
    process.env.E3_DB_PATH = tmpDbPath;
    closeDb();
    try {
      const first = getDb();
      const firstRows = first.prepare('SELECT id FROM schema_migrations').all() as { id: string }[];
      expect(firstRows.map((row) => row.id)).toEqual(ALL_MIGRATION_FILES);

      // Reopen the same file: runMigrations must see both migrations already applied and not
      // re-run them (which would fail with "table clients already exists").
      closeDb();
      const second = getDb();
      const secondRows = second.prepare('SELECT id FROM schema_migrations').all() as { id: string }[];
      expect(secondRows.map((row) => row.id)).toEqual(ALL_MIGRATION_FILES);
      expect(secondRows).toHaveLength(ALL_MIGRATION_FILES.length);
    } finally {
      closeDb();
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${tmpDbPath}${suffix}`, { force: true });
      }
    }
  });
});

describe('ON DELETE actions (T-1-01 follow-up)', () => {
  it('deleting a variant referenced by an observation succeeds and nulls observations.variant_id', () => {
    const db = getDb();
    const ts = nowIso();
    const { projectId } = seedClientAndProject(db, 'variant-del');

    const eventId = randomUUID();
    db.prepare(
      'INSERT INTO events (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(eventId, projectId, 'purchase', ts, ts);

    const variantId = randomUUID();
    db.prepare(
      `INSERT INTO variants (id, project_id, event_id, name, conditions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(variantId, projectId, eventId, 'web', '{}', ts, ts);

    const qaRunId = randomUUID();
    db.prepare('INSERT INTO qa_runs (id, project_id, kind, started_at) VALUES (?, ?, ?, ?)').run(
      qaRunId,
      projectId,
      'manual',
      ts
    );

    const observationId = randomUUID();
    db.prepare(
      `INSERT INTO observations
         (id, project_id, qa_run_id, source, event_type, event_id, variant_id, timestamp, properties_json, raw_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(observationId, projectId, qaRunId, 'manual', 'purchase', eventId, variantId, Date.now(), '{}', 'hash-1');

    expect(() => db.prepare('DELETE FROM variants WHERE id = ?').run(variantId)).not.toThrow();

    const observation = db
      .prepare('SELECT variant_id, event_id FROM observations WHERE id = ?')
      .get(observationId) as { variant_id: string | null; event_id: string | null };
    expect(observation.variant_id).toBeNull();
    expect(observation.event_id).toBe(eventId);
  });

  it('deleting a project cascades its events', () => {
    const db = getDb();
    const ts = nowIso();
    const { projectId } = seedClientAndProject(db, 'project-del');

    const eventId = randomUUID();
    db.prepare(
      'INSERT INTO events (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(eventId, projectId, 'checkout', ts, ts);

    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    const remaining = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
    expect(remaining).toBeUndefined();
  });

  it('rejects deleting a client that still has a project (RESTRICT)', () => {
    const db = getDb();
    const { clientId } = seedClientAndProject(db, 'client-del');

    expect(() => db.prepare('DELETE FROM clients WHERE id = ?').run(clientId)).toThrow(
      /FOREIGN KEY constraint failed/
    );
  });
});

describe('uniqueness constraints', () => {
  it('rejects a duplicate variant name within the same event', () => {
    const db = getDb();
    const ts = nowIso();
    const { projectId } = seedClientAndProject(db, 'variant-uniq');

    const eventId = randomUUID();
    db.prepare(
      'INSERT INTO events (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(eventId, projectId, 'purchase', ts, ts);

    db.prepare(
      `INSERT INTO variants (id, project_id, event_id, name, conditions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), projectId, eventId, 'web', '{}', ts, ts);

    expect(() =>
      db
        .prepare(
          `INSERT INTO variants (id, project_id, event_id, name, conditions_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), projectId, eventId, 'web', '{}', ts, ts)
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('rejects a duplicate standard_event mapping within the same project', () => {
    const db = getDb();
    const ts = nowIso();
    const { projectId } = seedClientAndProject(db, 'std-event-uniq');

    const eventId = randomUUID();
    db.prepare(
      'INSERT INTO events (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(eventId, projectId, 'purchase', ts, ts);

    db.prepare(
      `INSERT INTO standard_event_mappings (id, project_id, standard_event, event_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), projectId, 'purchase', eventId, ts, ts);

    expect(() =>
      db
        .prepare(
          `INSERT INTO standard_event_mappings (id, project_id, standard_event, event_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), projectId, 'purchase', eventId, ts, ts)
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('rejects a duplicate consent category name within the same project', () => {
    const db = getDb();
    const ts = nowIso();
    const { projectId } = seedClientAndProject(db, 'consent-uniq');

    db.prepare(
      `INSERT INTO consent_categories (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), projectId, 'Marketing', ts, ts);

    expect(() =>
      db
        .prepare(
          `INSERT INTO consent_categories (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), projectId, 'Marketing', ts, ts)
    ).toThrow(/UNIQUE constraint failed/);
  });
});
