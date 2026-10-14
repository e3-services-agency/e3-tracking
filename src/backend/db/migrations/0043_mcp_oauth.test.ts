import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb } from '../index';
import * as OAuth from '../../dal/mcp-oauth.dal';
const migrations = path.dirname(fileURLToPath(import.meta.url));
let scratch: string | undefined;
afterEach(() => { closeDb(); delete process.env.E3_DB_PATH; if (scratch)
    fs.rmSync(scratch, { recursive: true, force: true }); scratch = undefined; });
describe('0043 operational OAuth migration and restart', () => {
    it('upgrades populated0040 directly, preserves project evidence/counters and retains revocation across restart', () => {
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-mcp-migration-'));
        const file = path.join(scratch, 'db.sqlite');
        let db = new Database(file);
        db.pragma('foreign_keys=OFF');
        db.exec('CREATE TABLE schema_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
        for (const name of fs.readdirSync(migrations).filter(n => n.endsWith('.sql') && n < '0041').sort()) {
            db.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
            db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(name);
        }
        db.prepare("INSERT INTO clients(id,key,name,created_at,updated_at) VALUES('client','client','Client','now','now')").run();
        db.prepare("INSERT INTO projects(id,client_id,key,name,created_at,updated_at) VALUES('project','client','project','Project','now','now')").run();
        db.prepare("INSERT INTO comments(id,project_id,entity_type,entity_id,author_name,body,created_at,status,internal_only,participant_id) VALUES('comment','project','catalog','removed','Staff','Private evidence','now','on_it',1,'participant')").run();
        db.prepare("INSERT INTO qa_sequence_counters VALUES('project',77,12)").run();
        const before = db.prepare('SELECT * FROM comments').all();
        db.close();
        process.env.E3_DB_PATH = file;
        closeDb();
        db = getDb();
        expect(db.prepare('SELECT * FROM comments').all()).toEqual(before);
        expect(db.prepare('SELECT finding_next,report_next FROM qa_sequence_counters').get()).toEqual({ finding_next: 77, report_next: 12 });
        expect(db.pragma('foreign_key_check')).toEqual([]);
        expect(db.prepare("SELECT id FROM schema_migrations WHERE id='0043_mcp_oauth.sql'").get()).toBeTruthy();
        db.prepare('INSERT INTO mcp_oauth_clients VALUES(?,?,?)').run('oauth-client', '{}', OAuth.now());
        const code = db.transaction(() => OAuth.createGrant('owner@example.com', 'oauth-client', 'https://example.com/mcp', ['projects:read'], ['project'], 'https://claude.ai/api/mcp/auth_callback', 'challenge')).immediate();
        const issued = OAuth.exchangeCode('oauth-client', code, 'https://claude.ai/api/mcp/auth_callback', 'https://example.com/mcp');
        const grant = OAuth.access(issued.access_token, 'https://example.com/mcp').grant;
        const pending = OAuth.putPending('owner@example.com', 'oauth-client', { scope: 'projects:read' });
        closeDb();
        expect(OAuth.access(issued.access_token, 'https://example.com/mcp').grant.id).toBe(grant.id);
        expect(OAuth.pending(pending.cookie, 'owner@example.com')).toBeTruthy();
        OAuth.revokeGrant(grant.id, 'owner@example.com');
        closeDb();
        expect(() => OAuth.access(issued.access_token, 'https://example.com/mcp')).toThrow();
        expect(() => OAuth.rotate('oauth-client', issued.refresh_token, undefined, 'https://example.com/mcp')).toThrow();
        expect(getDb().pragma('foreign_key_check')).toEqual([]);
    });
    it('applies cleanly on a fresh DB and on a DB already at 0042', () => {
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-mcp-migration-'));
        const file = path.join(scratch, 'db.sqlite');
        const db = new Database(file);
        db.pragma('foreign_keys=OFF');
        db.exec('CREATE TABLE schema_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
        for (const name of fs.readdirSync(migrations).filter(n => n.endsWith('.sql') && n <= '0042_event_qa_scope_override.sql').sort()) {
            db.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
            db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(name);
        }
        db.close();
        process.env.E3_DB_PATH = file;
        expect(getDb().prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='0043_mcp_oauth.sql'").get()).toEqual({ n: 1 });
        closeDb();
        process.env.E3_DB_PATH = ':memory:';
        const fresh = getDb();
        expect(fresh.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'mcp_oauth_%'").get()).toEqual({ n: 8 });
        expect(fresh.pragma('foreign_key_check')).toEqual([]);
    });
});
describe('0044 all_projects column', () => {
    const cols = (db: Database.Database) => (db.prepare("PRAGMA table_info('mcp_oauth_grants')").all() as { name: string; dflt_value: string }[]).find(c => c.name === 'all_projects');
    it('exists on a fresh DB and after upgrading from 0043, defaulting to 0', () => {
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-mcp-migration-'));
        const file = path.join(scratch, 'db.sqlite');
        const db = new Database(file);
        db.pragma('foreign_keys=OFF');
        db.exec('CREATE TABLE schema_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
        for (const name of fs.readdirSync(migrations).filter(n => n.endsWith('.sql') && n <= '0043_mcp_oauth.sql').sort()) {
            db.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
            db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(name);
        }
        expect(cols(db)).toBeUndefined();
        db.prepare("INSERT INTO mcp_oauth_clients VALUES('c','{}',1)").run();
        db.prepare("INSERT INTO mcp_oauth_grants VALUES('g','o','c','r','[]',1,2,NULL)").run();
        db.close();
        process.env.E3_DB_PATH = file;
        const up = getDb();
        expect(cols(up)?.dflt_value).toBe('0');
        expect(up.prepare("SELECT all_projects FROM mcp_oauth_grants WHERE id='g'").get()).toEqual({ all_projects: 0 });
        expect(() => up.prepare("UPDATE mcp_oauth_grants SET all_projects=2").run()).toThrow();
        closeDb();
        process.env.E3_DB_PATH = ':memory:';
        expect(cols(getDb())).toBeTruthy();
    });
});
