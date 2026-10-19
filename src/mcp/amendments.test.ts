import { beforeEach, afterEach, expect, it } from 'vitest';
import { closeDb, getDb } from '../backend/db';
import { createClient } from '../backend/dal/client.dal';
import { createProject } from '../backend/dal/project.dal';
import { createEvent } from '../backend/dal/event.dal';
import { upsertFinding, getFindingOrThrow } from '../backend/dal/finding.dal';
import { createUseCase } from '../backend/dal/use-case.dal';
import * as OAuth from '../backend/dal/mcp-oauth.dal';
import { withHttpMcpContext, type HttpMcpContext } from './httpContext';
import { callTool } from './tools/writeTestUtil';
import { getToolInventory } from './registerTools';
import { buildBackup } from '../backend/services/backup.service';
import { previewRestore, applyRestore } from '../backend/services/backupRestore.service';

let project: string, foreign: string, clientId: string, context: HttpMcpContext;
const key = 'amended';
function grant(scopes = ['projects:read', 'projects:write'], projects = [project]): HttpMcpContext {
  const client = 'test-oauth-client';
  getDb().prepare('INSERT OR IGNORE INTO mcp_oauth_clients VALUES(?,?,?)').run(client, '{}', OAuth.now());
  const callback = 'https://claude.ai/api/mcp/auth_callback', resource = 'https://tracking.example/mcp';
  const code = OAuth.createGrant('human@example.com', client, resource, scopes, projects, callback, 'challenge');
  const tokens = OAuth.exchangeCode(client, code, callback, resource);
  const g = OAuth.access(tokens.access_token, resource).grant;
  return { token: tokens.access_token, resource, grantId: g.id, owner: g.owner, scopes };
}
beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:'; closeDb();
  const c = createClient({ key, name: 'Synthetic' });
  clientId = c.id;
  project = createProject({ key, name: 'Amended', client_id: c.id }).id;
  foreign = createProject({ key: 'other-amended', name: 'Other', client_id: c.id }).id;
  context = grant();
});
afterEach(() => { closeDb(); delete process.env.E3_DB_PATH; });
const call = (name: string, args: Record<string, unknown>, ctx = context) => withHttpMcpContext(ctx, () => callTool(name, { project_key: key, ...args }));
const count = (table: string) => (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

it('discovers effective metadata for template-only grants without resolving a project or disclosing tokens', async () => {
  const templates = grant(['templates:read'], []);
  const info = await call('get_server_info', {}, templates);
  expect(info.isError).toBe(false);
  expect(info.data.registered_tool_count).toBe(getToolInventory().length);
  expect(info.data.visible_tool_count).toBe(getToolInventory().filter(t => t.scopes.every(s => templates.scopes.includes(s))).length);
  expect(info.data.granted_projects).toEqual([]);
  expect(info.data.write_tools_visible).toBe(false);
  expect(info.data.limits.list_use_cases.default).toBe(100);
  expect(info.text).not.toContain(templates.token);
  expect(Date.parse(info.data.token_expires_at)).toBeLessThanOrEqual(Date.parse(info.data.grant_expires_at));
});

it('keeps the verified human and supplied agent separate and ignores forged actor input', async () => {
  const result = await call('create_event', { name: 'purchase', dry_run: false, agent_name: 'Claude', actor: 'forged@example.com' });
  expect(result.isError).toBe(false);
  expect(result.data).toMatchObject({ actor: 'human@example.com', agent: 'Claude' });
  expect(getDb().prepare('SELECT actor,agent FROM change_log WHERE id=?').get(result.data.change_log_id)).toEqual({ actor: 'human@example.com', agent: 'Claude' });
  const first = await call('submit_observation', { event_type: 'purchase', properties: {}, agent_name: 'Claude' });
  const second = await call('submit_observation', { event_type: 'purchase', properties: { value: 2 }, agent_name: 'Codex' });
  const again = await call('submit_observation', { event_type: 'purchase', properties: { value: 3 }, agent_name: 'Claude' });
  expect(first.data.qa_run_id).not.toBe(second.data.qa_run_id);
  expect(again.data.qa_run_id).toBe(first.data.qa_run_id);
  expect(getDb().prepare('SELECT actor,agent FROM qa_runs WHERE id=?').get(first.data.qa_run_id)).toEqual({ actor: 'human@example.com', agent: 'Claude' });
});

it('replays applied and partially failed batches with the same receipt and no extra changes', async () => {
  const args = { dry_run: false, idempotency_key: 'batch-one', agent_name: 'Claude', operations: [{ op: 'create_event', name: 'one' }, { op: 'create_event', name: 'two' }] };
  const first = await call('batch_apply', args);
  expect(first.isError).toBe(false);
  expect(first.data.applied).toBe(2);
  const changes = count('change_log');
  expect((await call('batch_apply', args)).data).toEqual(first.data);
  expect(count('change_log')).toBe(changes);
  expect(count('mcp_write_steps')).toBe(2);
  const conflict = await call('batch_apply', { ...args, operations: [{ op: 'create_event', name: 'different' }] });
  expect(conflict.isError).toBe(true); expect(conflict.text).toMatch(/^IDEMPOTENCY_CONFLICT:/);
  const partial = { dry_run: false, idempotency_key: 'partial', operations: [{ op: 'create_event', name: 'three' }, { op: 'create_event', name: 'one' }, { op: 'create_event', name: 'four' }] };
  const stopped = await call('batch_apply', partial), beforeReplay = count('change_log');
  expect(stopped.data).toMatchObject({ applied: 1, failed: 1, not_run: 1 });
  expect((await call('batch_apply', partial)).data).toEqual(stopped.data);
  expect(count('change_log')).toBe(beforeReplay);
});

it('serializes concurrent keys, replays a deleted target, and separates preview from apply', async () => {
  const input = { name: 'concurrent', dry_run: false, idempotency_key: 'concurrent' };
  const results = await Promise.all([call('create_event', input), call('create_event', input)]);
  expect(count('events')).toBe(1);
  expect(results.filter(r => !r.isError).length).toBeGreaterThanOrEqual(1);
  expect((await call('create_event', input)).data).toEqual(results.find(r => !r.isError)!.data);
  const observation = await call('submit_observation', { event_type: 'concurrent', properties: {} });
  const deletion = { qa_run_id: observation.data.qa_run_id, idempotency_key: 'delete' };
  const deleted = await call('delete_qa_run', deletion);
  expect(deleted.isError).toBe(false);
  expect((await call('delete_qa_run', deletion)).data).toEqual(deleted.data);
  const preview = await call('create_event', { name: 'preview', idempotency_key: 'preview' });
  expect(preview.data.dry_run).toBe(true);
  expect((await call('create_event', { name: 'preview', dry_run: false, idempotency_key: 'preview' })).text).toMatch(/^IDEMPOTENCY_CONFLICT:/);
});

it('adds only scoped pinned pointers, supports preview/deduplication and preserves them through restore', async () => {
  const event = createEvent(project, { name: 'purchase' });
  const finding = upsertFinding(project, { comparison: 'definition_vs_observations', kind: 'missing_event', severity: 'error', event_id: event.id, fingerprint: 'reference' });
  const uc = createUseCase(project, { name: 'Use case' });
  const reference = { system: 'cortex', client: 'synthetic', project: 'synthetic', record_type: 'document', record_id: 'a'.repeat(24), revision: 2, content_hash: 'b'.repeat(64), note: 'Reviewed elsewhere; pointer only.' };
  const args = { target_kind: 'finding', target_id: finding.id, reference };
  expect((await call('add_reference', args)).data.dry_run).toBe(true);
  expect(count('external_references')).toBe(0);
  const applied = await call('add_reference', { ...args, dry_run: false, agent_name: 'Claude' });
  expect(applied.isError).toBe(false); expect(count('external_references')).toBe(1);
  expect((await call('add_reference', { ...args, dry_run: false })).data.action).toBe('unchanged');
  expect(getFindingOrThrow(project, finding.id)).toEqual(finding);
  const detailed = await call('get_finding', { finding_id: finding.id });
  expect(detailed.data.references[0]).toMatchObject({ ...reference, actor: 'human@example.com', agent: 'Claude' });
  expect((await call('list_findings', {})).data.items[0]).not.toHaveProperty('references');
  expect((await call('add_reference', { ...args, dry_run: false, reference: { ...reference, content_hash: 'c'.repeat(64) } })).text).toMatch(/^REFERENCE_CONFLICT:/);
  expect((await call('add_reference', { ...args, project_key: 'other-amended', dry_run: false })).isError).toBe(true);
  expect((await call('add_reference', { target_kind: 'use_case', target_id: uc.id, reference, dry_run: false })).isError).toBe(false);
  await call('create_event', { name: 'backup_attribution', dry_run: false, agent_name: 'Claude' });
  await call('submit_observation', { event_type: 'backup_attribution', properties: {}, agent_name: 'Claude' });
  const backup = await buildBackup(project), preview = previewRestore(backup);
  expect(backup).not.toHaveProperty('mcp_write_requests');
  expect(backup).not.toHaveProperty('mcp_agent_qa_runs');
  await applyRestore(backup, preview.payload_hash, { name: 'Restored', key: 'restored-amended', client_id: clientId });
  const restored = getDb().prepare("SELECT id FROM projects WHERE key='restored-amended'").get() as { id: string };
  const refs = getDb().prepare('SELECT * FROM external_references WHERE project_id=?').all(restored.id) as any[];
  expect(refs).toHaveLength(2);
  expect(refs[0]).toMatchObject({ client: reference.client, project: reference.project, record_id: reference.record_id, revision: reference.revision, content_hash: reference.content_hash });
  expect(refs.every(r => r.target_id !== finding.id && r.target_id !== uc.id)).toBe(true);
  expect(getDb().prepare("SELECT actor,agent FROM qa_runs WHERE project_id=? AND agent='Claude'").get(restored.id)).toEqual({ actor: 'human@example.com', agent: 'Claude' });
  expect(getDb().prepare("SELECT actor,agent FROM change_log WHERE project_id=? AND agent='Claude' LIMIT 1").get(restored.id)).toEqual({ actor: 'human@example.com', agent: 'Claude' });
});
