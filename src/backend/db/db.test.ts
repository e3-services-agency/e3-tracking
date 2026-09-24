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
    ]) {
      expect(tables, `missing table ${table}`).toContain(table);
    }

    // Removed-from-schema tables (D-17, D-18) must not exist.
    for (const table of [
      'journeys',
      'journey_events',
      'qa_run_evidence',
      'qa_run_payloads',
      'event_variants',
      'event_property_definitions',
      'metrics',
      'workspace_settings',
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
      `INSERT INTO events (id, project_id, name, event_type, status, created_at, updated_at)
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

describe('listMigrationFiles', () => {
  it('lists exactly the 0001_core.sql migration', () => {
    expect(listMigrationFiles()).toEqual(['0001_core.sql']);
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
      expect(firstRows.map((row) => row.id)).toEqual(['0001_core.sql']);

      // Reopen the same file: runMigrations must see 0001_core.sql already applied and not
      // re-run it (which would fail with "table clients already exists").
      closeDb();
      const second = getDb();
      const secondRows = second.prepare('SELECT id FROM schema_migrations').all() as { id: string }[];
      expect(secondRows.map((row) => row.id)).toEqual(['0001_core.sql']);
      expect(secondRows).toHaveLength(1);
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
