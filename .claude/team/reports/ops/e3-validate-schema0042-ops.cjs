'use strict';
// Isolated recovery proof. Run through tsx so the existing database/DAL TypeScript can load.
// Creates only a new OS-temp fixture; never uses /data or the configured production database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const sourceRoot = path.resolve(process.argv[2] || process.cwd());
const migration = path.resolve(process.argv[3]);
assert.equal(path.basename(migration), '0042_mcp_oauth.sql');
const rootRequire = createRequire(path.join(sourceRoot, 'package.json'));
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-mcp-ops-'));
const fixtureDb = path.join(fixtureDir, 'e3-tracking.sqlite');
process.env.E3_DB_PATH = fixtureDb;
process.env.NODE_ENV = 'test';
const { getDb, closeDb } = require(path.join(sourceRoot, 'src/backend/db/index.ts'));
const Clients = require(path.join(sourceRoot, 'src/backend/dal/client.dal.ts'));
const Projects = require(path.join(sourceRoot, 'src/backend/dal/project.dal.ts'));
const QaRuns = require(path.join(sourceRoot, 'src/backend/dal/qa-run.dal.ts'));
const db = getDb();
const schema = '0042_mcp_oauth.sql';
if (!db.prepare('SELECT id FROM schema_migrations WHERE id=?').get(schema)) {
  db.transaction(() => {
    db.exec(fs.readFileSync(migration, 'utf8'));
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(schema);
  })();
}
const client = Clients.createClient({ key: 'ops-fixture', name: 'Operations fixture' });
const project = Projects.createProject({ client_id: client.id, key: 'ops-fixture', name: 'Operations fixture' });
const run = QaRuns.createQaRun(project.id, { kind: 'agent_session', actor: 'Fixture owner' });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fixtureAccess = crypto.randomBytes(32).toString('base64url');
const fixtureRefresh = crypto.randomBytes(32).toString('base64url');
const now = Math.floor(Date.now() / 1000);
db.prepare('INSERT INTO mcp_oauth_clients VALUES(?,?,?)').run('fixture-client', '{}', now);
for (const [id, revoked] of [['fixture-active', null], ['fixture-revoked', 123]]) {
  db.prepare('INSERT INTO mcp_oauth_grants VALUES(?,?,?,?,?,?,?,?)').run(id, 'fixture@example.invalid', 'fixture-client', 'https://tracking.e3-services.com/mcp', '["projects:read"]', now, now + 3600, revoked);
  db.prepare('INSERT INTO mcp_oauth_projects VALUES(?,?)').run(id, project.id);
}
db.prepare('INSERT INTO mcp_oauth_pending VALUES(?,?,?,?,?,?)').run(hash('fixture-cookie'), hash('fixture-csrf'), 'fixture@example.invalid', 'fixture-client', '{}', now + 600);
db.prepare('INSERT INTO mcp_oauth_codes VALUES(?,?,?,?,?,NULL)').run(hash('fixture-code'), 'fixture-active', 'https://claude.ai/api/mcp/auth_callback', 'A'.repeat(43), now + 300);
for (const kind of ['access', 'refresh']) {
  db.prepare('INSERT INTO mcp_oauth_tokens VALUES(?,?,?,?,?,NULL)').run(hash(kind === 'access' ? fixtureAccess : fixtureRefresh), 'fixture-active', kind, '["projects:read"]', now + 900);
}
db.prepare('INSERT INTO mcp_oauth_qa_runs VALUES(?,?,?)').run('fixture-active', project.id, run.id);
db.prepare('INSERT INTO mcp_oauth_audit VALUES(?,?,?, ?,NULL,?)').run(crypto.randomUUID(), 'fixture-active', 'fixture@example.invalid', 'fixture_created', now);

function applicationDigest(connection) {
  const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'mcp_oauth_%' ORDER BY name").all();
  const rows = tables.map(({ name }) => [name, connection.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all()]);
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
const before = applicationDigest(db);
assert.equal(db.pragma('foreign_key_check').length, 0);
closeDb();

const auditor = path.join(__dirname, 'e3-audit-schema0042.cjs');
function audit() {
  const child = spawnSync(process.execPath, [auditor, fixtureDb], { cwd: sourceRoot, encoding: 'utf8', windowsHide: true });
  if (child.status !== 0) throw new Error('Fixture auditor failed: ' + child.stderr);
  return JSON.parse(child.stdout.trim());
}
const initial = audit();
assert.equal(initial.credential_hash_checks, 'ok');
assert.equal(initial.oauth_counts.mcp_oauth_grants, 2);
const OAuth = require(path.resolve(path.dirname(migration), '../../dal/mcp-oauth.dal.ts'));
assert.equal(OAuth.access(fixtureAccess, 'https://tracking.e3-services.com/mcp').grant.id, 'fixture-active');

const helper = fs.readFileSync(path.join(__dirname, 'e3-maintenance-mcp-schema0042.sh'), 'utf8');
const match = helper.match(/revoke_restored_http_authorizations\(\) \{[\s\S]*?--entrypoint node "\$image" -e '([\s\S]*?)'\r?\n\}/);
if (!match) throw new Error('Recovery helper revocation body not found');
// Execute the exact reviewed helper JavaScript, substituting only its fixed database path.
const code = match[1].replaceAll('"/data/e3-tracking.sqlite"', JSON.stringify(fixtureDb));
new Function('require', code)(rootRequire);
assert.throws(() => OAuth.access(fixtureAccess, 'https://tracking.e3-services.com/mcp'), 'Restored access credential still works');
require(path.resolve(path.dirname(migration), '../index.ts')).closeDb();

const Database = rootRequire('better-sqlite3');
const restored = new Database(fixtureDb, { readonly: true, fileMustExist: true });
try {
  assert.equal(applicationDigest(restored), before, 'Application data changed during authorization invalidation');
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM mcp_oauth_grants WHERE revoked_at IS NULL').get().n, 0);
  assert.equal(restored.prepare("SELECT revoked_at FROM mcp_oauth_grants WHERE id='fixture-revoked'").get().revoked_at, 123);
  for (const table of ['mcp_oauth_pending', 'mcp_oauth_codes', 'mcp_oauth_tokens', 'mcp_oauth_qa_runs']) {
    assert.equal(restored.prepare('SELECT COUNT(*) n FROM ' + table).get().n, 0);
  }
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM mcp_oauth_clients').get().n, 1);
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM mcp_oauth_projects').get().n, 2);
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM mcp_oauth_audit').get().n, 2);
  assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(restored.pragma('foreign_key_check').length, 0);
} finally {
  restored.close();
}
const final = audit();
assert.deepEqual(final.counts, initial.counts);
console.log('PASS: isolated0042 auditor and restored-authorization invalidation; application data, prior revocation and audit retained; pending/code/token/run state invalidated');
