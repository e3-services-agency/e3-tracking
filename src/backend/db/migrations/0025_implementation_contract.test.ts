/**
 * Migration backfill test (T-4-17, D-63, D-53 amendment 6). Applies every migration before 0025,
 * seeds events and properties, applies 0025 alone and asserts the backfill: purchase / purchase_item
 * / refund-like / consent events -> `server_api`, other sdk/platform class events -> `sdk_auto`,
 * everything else stays `client_web`; `*_ids` / `*_list` arrays and `total_*` numbers become state
 * lists with the obvious derivation; context-like names stay `event`.
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

describe('0025_implementation_contract.sql backfill', () => {
  it('backfills implementation_method, property kind and derivation', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files.filter((f) => f < '0025')) {
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    }

    const ts = new Date().toISOString();
    const clientId = randomUUID();
    db.prepare('INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(clientId, 'acme', 'Acme', ts, ts);
    const projectId = randomUUID();
    db.prepare('INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(projectId, clientId, 'Acme', 'acme-a', ts, ts);

    const events: [string, string][] = [
      ['add_to_wishlist', 'custom'],
      ['purchase', 'custom'],
      ['purchase_item', 'custom'],
      ['order_refund', 'custom'],
      ['consent', 'platform'],
      ['session_start', 'sdk'],
      ['campaign', 'platform'],
    ];
    for (const [name, cls] of events) {
      db.prepare(
        `INSERT INTO events (id, project_id, name, class, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'planned', ?, ?)`
      ).run(randomUUID(), projectId, name, cls, ts, ts);
    }

    const properties: [string, string, string][] = [
      ['product_ids', 'array', 'event'],
      ['variant_list', 'array', 'event'],
      ['total_price', 'number', 'event'],
      ['total_quantity', 'number', 'event'],
      ['total_price_local_currency', 'number', 'event'],
      ['store_country', 'string', 'event'],
      ['language', 'string', 'event'],
      ['currency', 'string', 'event'],
      ['customer_ids', 'array', 'customer'],
      ['ids', 'array', 'event'],
    ];
    for (const [name, dataType, scope] of properties) {
      db.prepare(
        `INSERT INTO properties (id, project_id, scope, name, data_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), projectId, scope, name, dataType, ts, ts);
    }

    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0025_implementation_contract.sql'), 'utf-8'));

    const method = (name: string) =>
      (db!.prepare('SELECT implementation_method AS m, dl_event_name AS d FROM events WHERE name = ?').get(name) as { m: string; d: string | null });
    expect(method('add_to_wishlist')).toEqual({ m: 'client_web', d: null });
    expect(method('purchase').m).toBe('server_api');
    expect(method('purchase_item').m).toBe('server_api');
    expect(method('order_refund').m).toBe('server_api');
    expect(method('consent').m).toBe('server_api');
    expect(method('session_start').m).toBe('sdk_auto');
    expect(method('campaign').m).toBe('sdk_auto');

    const prop = (name: string) => {
      const row = db!.prepare('SELECT kind, derivation_json AS d FROM properties WHERE name = ?').get(name) as { kind: string; d: string | null };
      return { kind: row.kind, derivation: row.d ? JSON.parse(row.d) : null };
    };
    expect(prop('product_ids')).toEqual({ kind: 'state_list', derivation: { source: 'items', id_field: 'product_id', form: 'ids' } });
    expect(prop('variant_list')).toEqual({
      kind: 'state_list',
      derivation: { source: 'items', id_field: 'variant_id', form: 'id_quantity', quantity_field: 'quantity' },
    });
    expect(prop('total_price')).toEqual({ kind: 'state_list', derivation: { source: 'items', sum: 'price*quantity' } });
    expect(prop('total_price_local_currency')).toEqual({
      kind: 'state_list',
      derivation: { source: 'items', sum: 'price_local_currency*quantity' },
    });
    expect(prop('total_quantity')).toEqual({ kind: 'state_list', derivation: { source: 'items', sum: 'quantity' } });
    // Context-like names and customer-scope arrays are not guessed.
    for (const name of ['store_country', 'language', 'currency', 'customer_ids', 'ids']) {
      expect(prop(name)).toEqual({ kind: 'event', derivation: null });
    }
  });

  it('rejects a value outside the allowed methods and kinds', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    const ts = new Date().toISOString();
    expect(() =>
      db!.prepare(`INSERT INTO events (id, project_id, name, implementation_method, created_at, updated_at) VALUES ('e', 'p', 'x', 'carrier_pigeon', ?, ?)`).run(ts, ts)
    ).toThrow(/CHECK/);
    expect(() =>
      db!.prepare(`INSERT INTO properties (id, project_id, scope, name, data_type, kind, created_at, updated_at) VALUES ('p1', 'p', 'event', 'x', 'string', 'weird', ?, ?)`).run(ts, ts)
    ).toThrow(/CHECK/);
  });
});

describe('0025 SQL and the shared TypeScript inference agree (F1)', () => {
  it('produces the same method, kind and derivation as defaults.ts for the same names', async () => {
    const { defaultImplementationMethod, inferPropertyKind } = await import('../../../domain/codegen/defaults');
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files.filter((f) => f < '0025')) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    const ts = new Date().toISOString();
    const clientId = randomUUID();
    db.prepare('INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(clientId, 'acme', 'Acme', ts, ts);
    const projectId = randomUUID();
    db.prepare('INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(projectId, clientId, 'Acme', 'acme-a', ts, ts);

    const events: [string, string][] = [
      ['add_to_wishlist', 'custom'], ['purchase', 'custom'], ['purchase_item', 'custom'], ['order_refund', 'custom'],
      ['refund', 'custom'], ['consent', 'platform'], ['session_start', 'sdk'], ['web_exit', 'sdk'], ['campaign', 'platform'],
      ['cart_update', 'custom'], ['purchase_intent', 'custom'],
    ];
    const properties: [string, string, string][] = [
      ['product_ids', 'array', 'event'], ['variant_ids', 'array', 'event'], ['sku_list', 'array', 'event'],
      ['product_list', 'array', 'event'], ['_ids', 'array', 'event'], ['ids', 'array', 'event'], ['product_ids', 'string', 'event'],
      ['total_price', 'number', 'event'], ['total_quantity', 'number', 'event'], ['total_price_local_currency', 'number', 'event'],
      ['total_note', 'string', 'event'], ['total_', 'number', 'event'], ['store_country', 'string', 'event'],
      ['language', 'string', 'event'], ['currency', 'string', 'event'], ['customer_ids', 'array', 'customer'],
    ];
    for (const [name, cls] of events) {
      db.prepare(`INSERT INTO events (id, project_id, name, class, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'planned', ?, ?)`).run(randomUUID(), projectId, name, cls, ts, ts);
    }
    properties.forEach(([name, dataType, scope], i) => {
      // product_ids appears twice with different data types: keep names unique per scope with a suffix-less alias.
      db!.prepare(`INSERT INTO properties (id, project_id, scope, name, data_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), projectId, scope, i === 6 ? 'product_ids_str' : name, dataType, ts, ts);
    });
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0025_implementation_contract.sql'), 'utf-8'));

    for (const [name, cls] of events) {
      const row = db.prepare('SELECT implementation_method AS m FROM events WHERE name = ?').get(name) as { m: string };
      expect(row.m, `event ${name}`).toBe(defaultImplementationMethod(name, cls));
    }
    properties.forEach(([name, dataType, scope], i) => {
      const stored = i === 6 ? 'product_ids_str' : name;
      const row = db!.prepare('SELECT kind, derivation_json AS d FROM properties WHERE name = ? AND scope = ?').get(stored, scope) as { kind: string; d: string | null };
      const inferred = inferPropertyKind(stored, dataType, scope);
      expect({ kind: row.kind, derivation: row.d ? JSON.parse(row.d) : null }, `property ${stored}`).toEqual(inferred);
    });
  });
});
