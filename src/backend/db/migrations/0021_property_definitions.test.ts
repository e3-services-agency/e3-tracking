/**
 * Migration backfill test (T-4-00, D-58). Applies 0001 through 0017 raw (the pre-property-
 * definitions schema, `event_properties.description_override`/`example_values_override_json`),
 * seeds one property with three links carrying two distinct overrides (two links share the same
 * override, one link has no override), then applies 0021 in isolation and asserts: a "general"
 * definition per property, one definition per distinct override group named after the first-linked
 * event, `event_properties.definition_id` repointed accordingly, and both override columns gone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;

const PRE_0021_MIGRATIONS = [
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
];

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function nowIso(): string {
  return new Date().toISOString();
}

describe('0021_property_definitions.sql backfill', () => {
  it('splits distinct description_override groups into named definitions and repoints links', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');

    for (const file of PRE_0021_MIGRATIONS) {
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

    const propertyId = randomUUID();
    db.prepare(
      `INSERT INTO properties (id, project_id, scope, name, description, data_type, data_formats_json, allowed_values_json, example_values_json, created_at, updated_at)
       VALUES (?, ?, 'event', 'action', 'The action taken', 'string', '["email","uri"]', '[{"value":"add"},{"value":"remove"}]', '["add"]', ?, ?)`
    ).run(propertyId, projectId, ts, ts);

    const eventA = randomUUID();
    const eventB = randomUUID();
    const eventC = randomUUID();
    for (const [id, name] of [
      [eventA, 'cart_update'],
      [eventB, 'consent'],
      [eventC, 'purchase'],
    ] as const) {
      db.prepare(
        `INSERT INTO events (id, project_id, name, class, status, created_at, updated_at) VALUES (?, ?, ?, 'custom', 'planned', ?, ?)`
      ).run(id, projectId, name, ts, ts);
    }

    // cart_update: no override -> general. consent: override A (first by created_at). purchase:
    // same override A as consent -> same definition, but linked later.
    const t1 = '2024-01-01T00:00:00.000Z';
    const t2 = '2024-01-02T00:00:00.000Z';
    const t3 = '2024-01-03T00:00:00.000Z';
    db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, sort_order, description_override, example_values_override_json, created_at, updated_at)
       VALUES (?, ?, 0, 'normal', 0, NULL, NULL, ?, ?)`
    ).run(eventA, propertyId, t1, t1);
    db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, sort_order, description_override, example_values_override_json, created_at, updated_at)
       VALUES (?, ?, 0, 'normal', 0, 'Consent action (accept/reject)', '["accept"]', ?, ?)`
    ).run(eventB, propertyId, t2, t2);
    db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, sort_order, description_override, example_values_override_json, created_at, updated_at)
       VALUES (?, ?, 0, 'normal', 0, 'Consent action (accept/reject)', '["accept"]', ?, ?)`
    ).run(eventC, propertyId, t3, t3);

    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0021_property_definitions.sql'), 'utf-8'));

    const columns = (db.prepare('PRAGMA table_info(event_properties)').all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(columns).not.toContain('description_override');
    expect(columns).not.toContain('example_values_override_json');
    expect(columns).toContain('definition_id');

    const defs = db
      .prepare('SELECT * FROM property_definitions WHERE property_id = ? ORDER BY sort_order, name')
      .all(propertyId) as Record<string, unknown>[];
    expect(defs).toHaveLength(2);

    const general = defs.find((d) => d.name === 'general')!;
    expect(general.description).toBe('The action taken');
    expect(general.allowed_values_json).toBe('[{"value":"add"},{"value":"remove"}]');
    // ERROR 1 fix round: the full formats list, not just the first entry.
    expect(general.formats_json).toBe('["email","uri"]');
    expect(general.example_values_json).toBe('["add"]');

    const overrideDef = defs.find((d) => d.name !== 'general')!;
    expect(overrideDef.name).toBe('consent'); // first-linked event of that override group
    expect(overrideDef.description).toBe('Consent action (accept/reject)');
    expect(overrideDef.example_values_json).toBe('["accept"]');
    // allowed_values_json/formats_json still carried from the property, overrides never covered those
    expect(overrideDef.allowed_values_json).toBe('[{"value":"add"},{"value":"remove"}]');
    expect(overrideDef.formats_json).toBe('["email","uri"]');

    const links = db
      .prepare('SELECT event_id, definition_id FROM event_properties WHERE property_id = ?')
      .all(propertyId) as { event_id: string; definition_id: string }[];
    const byEvent = new Map(links.map((l) => [l.event_id, l.definition_id]));
    expect(byEvent.get(eventA)).toBe(general.id);
    expect(byEvent.get(eventB)).toBe(overrideDef.id);
    expect(byEvent.get(eventC)).toBe(overrideDef.id);
  });

  // WARNING 4 fix round: an event literally named "general" whose link carries an override would
  // otherwise collide with the property's own "general" definition (UNIQUE(property_id, name)).
  it('names the override definition "<event> (event)" when the first-linked event is literally named "general"', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');

    for (const file of PRE_0021_MIGRATIONS) {
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

    const propertyId = randomUUID();
    db.prepare(
      `INSERT INTO properties (id, project_id, scope, name, description, data_type, created_at, updated_at)
       VALUES (?, ?, 'event', 'level', NULL, 'string', ?, ?)`
    ).run(propertyId, projectId, ts, ts);

    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, project_id, name, class, status, created_at, updated_at) VALUES (?, ?, 'general', 'custom', 'planned', ?, ?)`
    ).run(eventId, projectId, ts, ts);

    db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, sort_order, description_override, example_values_override_json, created_at, updated_at)
       VALUES (?, ?, 0, 'normal', 0, 'General level', NULL, ?, ?)`
    ).run(eventId, propertyId, ts, ts);

    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0021_property_definitions.sql'), 'utf-8'));

    const defs = db
      .prepare('SELECT * FROM property_definitions WHERE property_id = ? ORDER BY sort_order, name')
      .all(propertyId) as Record<string, unknown>[];
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.name).sort()).toEqual(['general', 'general (event)']);

    const overrideDef = defs.find((d) => d.name === 'general (event)')!;
    expect(overrideDef.description).toBe('General level');

    const link = db
      .prepare('SELECT definition_id FROM event_properties WHERE event_id = ? AND property_id = ?')
      .get(eventId, propertyId) as { definition_id: string };
    expect(link.definition_id).toBe(overrideDef.id);
  });

  // Fix round 2 ERROR 2: a soft-deleted event and a live event share the same name (0003
  // delete-then-recreate) and are the first (only) link of two *different* override groups on the
  // same property -- both groups compute the same base name; the migration must not throw
  // UNIQUE constraint failed and must instead suffix the second one, preferring the live event's
  // occurrence as the un-suffixed name (fix round 2 INFO 1).
  it('suffixes the second of two override groups whose first-linked events share one name (soft-deleted + live "consent")', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');

    for (const file of PRE_0021_MIGRATIONS) {
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

    const propertyId = randomUUID();
    db.prepare(
      `INSERT INTO properties (id, project_id, scope, name, description, data_type, created_at, updated_at)
       VALUES (?, ?, 'event', 'action', NULL, 'string', ?, ?)`
    ).run(propertyId, projectId, ts, ts);

    // A soft-deleted "consent" (deleted after being created and linked first, per created_at)...
    const deletedConsentId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, project_id, name, class, status, created_at, updated_at, deleted_at) VALUES (?, ?, 'consent', 'custom', 'planned', ?, ?, ?)`
    ).run(deletedConsentId, projectId, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
    // ...and a live "consent" recreated afterwards (0003: the partial unique index allows this).
    const liveConsentId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, project_id, name, class, status, created_at, updated_at) VALUES (?, ?, 'consent', 'custom', 'planned', ?, ?)`
    ).run(liveConsentId, projectId, '2024-07-01T00:00:00.000Z', '2024-07-01T00:00:00.000Z');

    // Two distinct override groups on the same property, each with exactly one link -- to the
    // soft-deleted "consent" and to the live "consent" respectively -- so each group's own
    // first_event_name resolves to "consent" independently of the other group.
    db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, sort_order, description_override, example_values_override_json, created_at, updated_at)
       VALUES (?, ?, 0, 'normal', 0, 'Deleted consent action', NULL, ?, ?)`
    ).run(deletedConsentId, propertyId, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, sort_order, description_override, example_values_override_json, created_at, updated_at)
       VALUES (?, ?, 0, 'normal', 0, 'Live consent action', NULL, ?, ?)`
    ).run(liveConsentId, propertyId, '2024-07-01T00:00:00.000Z', '2024-07-01T00:00:00.000Z');

    expect(() =>
      db!.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0021_property_definitions.sql'), 'utf-8'))
    ).not.toThrow();

    const defs = db
      .prepare('SELECT * FROM property_definitions WHERE property_id = ? ORDER BY sort_order, name')
      .all(propertyId) as Record<string, unknown>[];
    expect(defs).toHaveLength(3); // general + two override groups
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual(['consent', 'consent-2', 'general']);

    // The un-suffixed "consent" reads like the live event's own override text (fix round 2 INFO 1).
    const plainConsent = defs.find((d) => d.name === 'consent')!;
    expect(plainConsent.description).toBe('Live consent action');
    const suffixedConsent = defs.find((d) => d.name === 'consent-2')!;
    expect(suffixedConsent.description).toBe('Deleted consent action');

    const links = db
      .prepare('SELECT event_id, definition_id FROM event_properties WHERE property_id = ?')
      .all(propertyId) as { event_id: string; definition_id: string }[];
    const byEvent = new Map(links.map((l) => [l.event_id, l.definition_id]));
    expect(byEvent.get(liveConsentId)).toBe(plainConsent.id);
    expect(byEvent.get(deletedConsentId)).toBe(suffixedConsent.id);
  });
});
