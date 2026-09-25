/**
 * Migration test (T-2-06, D-30, D-31): applies 0001 through 0010 (or, until T-2-02 lands 0010,
 * every migration file that exists below this one) followed by 0011 in isolation, then asserts
 * the new `rules` table, `properties.item_schema_json` and the project tolerance columns exist
 * with the right defaults, and that the two partial unique indexes behave as described in
 * 0011_rules.sql: two event-scoped (`variant_id IS NULL`) rules with the same name collide, two
 * variant-scoped rules with the same `(event_id, variant_id)` and name collide, but the same name
 * is free to reuse across two different variants of the same event, or once unscoped and once
 * scoped.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function nowIso(): string {
  return new Date().toISOString();
}

function setUp(): { projectId: string; eventId: string; variantAId: string; variantBId: string } {
  db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');

  const preMigrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f < '0011_rules.sql')
    .sort();
  for (const file of preMigrations) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
  }

  const ts = nowIso();
  const clientId = randomUUID();
  db.prepare('INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    clientId,
    'acme',
    'Acme',
    ts,
    ts
  );
  const projectId = randomUUID();
  db.prepare(
    'INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(projectId, clientId, 'Acme Brand A', 'acme-brand-a', ts, ts);
  const eventId = randomUUID();
  db.prepare(
    `INSERT INTO events (id, project_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(eventId, projectId, 'purchase', 'planned', ts, ts);
  const propId = randomUUID();
  db.prepare(
    `INSERT INTO properties (id, project_id, scope, name, data_type, created_at, updated_at)
     VALUES (?, ?, 'event', 'purchase_status', 'string', ?, ?)`
  ).run(propId, projectId, ts, ts);
  const variantAId = randomUUID();
  const variantBId = randomUUID();
  db.prepare(
    `INSERT INTO variants (id, project_id, event_id, name, conditions_json, conditions_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', 'key-a', ?, ?)`
  ).run(variantAId, projectId, eventId, 'purchase[purchase_status=refunded]', ts, ts);
  db.prepare(
    `INSERT INTO variants (id, project_id, event_id, name, conditions_json, conditions_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', 'key-b', ?, ?)`
  ).run(variantBId, projectId, eventId, 'purchase[purchase_status=success]', ts, ts);

  db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0011_rules.sql'), 'utf-8'));

  return { projectId, eventId, variantAId, variantBId };
}

function insertRule(
  database: Database.Database,
  fields: { id: string; projectId: string; eventId: string; variantId: string | null; name: string }
): void {
  const ts = nowIso();
  database
    .prepare(
      `INSERT INTO rules (
        id, project_id, event_id, variant_id, kind, name, message, expression_json,
        tolerance_mode, report_kind, severity, enabled, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'bound', ?, 'msg', '{}', 'none', 'bound_violation', 'error', 1, 1, ?, ?)`
    )
    .run(fields.id, fields.projectId, fields.eventId, fields.variantId, fields.name, ts, ts);
}

describe('0011_rules.sql', () => {
  it('adds properties.item_schema_json and the project tolerance columns with their defaults', () => {
    const { projectId } = setUp();
    const propColumns = (db!.prepare('PRAGMA table_info(properties)').all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(propColumns).toContain('item_schema_json');

    const project = db!
      .prepare('SELECT money_tolerance_percent, money_tolerance_floor FROM projects WHERE id = ?')
      .get(projectId) as { money_tolerance_percent: number; money_tolerance_floor: number };
    expect(project.money_tolerance_percent).toBe(1);
    expect(project.money_tolerance_floor).toBe(0.01);
  });

  it('creates the rules table with the expected columns', () => {
    setUp();
    const columns = (db!.prepare('PRAGMA table_info(rules)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'project_id',
        'event_id',
        'variant_id',
        'kind',
        'name',
        'message',
        'expression_json',
        'tolerance_mode',
        'tolerance_value',
        'report_kind',
        'severity',
        'template_key',
        'enabled',
        'version',
        'created_at',
        'updated_at',
      ])
    );
  });

  it('rejects two event-scoped (variant_id IS NULL) rules with the same name', () => {
    const { projectId, eventId } = setUp();
    insertRule(db!, { id: randomUUID(), projectId, eventId, variantId: null, name: 'dup' });
    expect(() => insertRule(db!, { id: randomUUID(), projectId, eventId, variantId: null, name: 'dup' })).toThrow();
  });

  it('rejects two rules with the same name on the same variant', () => {
    const { projectId, eventId, variantAId } = setUp();
    insertRule(db!, { id: randomUUID(), projectId, eventId, variantId: variantAId, name: 'dup' });
    expect(() =>
      insertRule(db!, { id: randomUUID(), projectId, eventId, variantId: variantAId, name: 'dup' })
    ).toThrow();
  });

  it('allows the same rule name across two different variants of the same event, and once unscoped plus once scoped', () => {
    const { projectId, eventId, variantAId, variantBId } = setUp();
    expect(() => {
      insertRule(db!, { id: randomUUID(), projectId, eventId, variantId: null, name: 'same' });
      insertRule(db!, { id: randomUUID(), projectId, eventId, variantId: variantAId, name: 'same' });
      insertRule(db!, { id: randomUUID(), projectId, eventId, variantId: variantBId, name: 'same' });
    }).not.toThrow();
  });
});
