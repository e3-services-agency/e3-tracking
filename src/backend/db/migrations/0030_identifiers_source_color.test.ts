/**
 * Migration test (T-4-28, D-67, D-68): free-text source colours are normalised to the palette token
 * of the source's system (a valid token is kept), the colour triggers reject anything else, and
 * events gain a nullable identifiers_json.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
let db: Database.Database | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

describe('0030_identifiers_source_color.sql', () => {
  it('backfills colours by system, keeps valid tokens, enforces the palette', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files.filter((x) => x < '0030')) db.exec(fs.readFileSync(path.join(DIR, f), 'utf-8'));
    const now = new Date().toISOString();
    const clientId = randomUUID();
    db.prepare(`INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, 'c', 'C', ?, ?)`).run(clientId, now, now);
    const projectId = randomUUID();
    db.prepare(`INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, 'P', 'p', ?, ?)`).run(projectId, clientId, now, now);
    const insert = (name: string, system: string, color: string | null) =>
      db!.prepare(`INSERT INTO sources (id, project_id, name, color, system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), projectId, name, color, system, now, now);
    insert('a', 'shopify', 'blue');
    insert('b', 'custom_backend', null);
    insert('c', 'crm', 'source-3');
    insert('d', 'other', '#fff');
    db.exec(fs.readFileSync(path.join(DIR, '0030_identifiers_source_color.sql'), 'utf-8'));
    const rows = db.prepare('SELECT name, color FROM sources ORDER BY name').all();
    expect(rows).toEqual([
      { name: 'a', color: 'source-1' },
      { name: 'b', color: 'source-4' },
      { name: 'c', color: 'source-3' },
      { name: 'd', color: 'source-8' },
    ]);
    expect(() => db!.prepare(`UPDATE sources SET color = 'red'`).run()).toThrow(/sources.color/);
    expect(() => insert('e', 'other', 'red')).toThrow(/sources.color/);
    const cols = db.prepare('PRAGMA table_info(events)').all() as { name: string; notnull: number }[];
    expect(cols.find((c) => c.name === 'identifiers_json')?.notnull).toBe(0);
  });
});
