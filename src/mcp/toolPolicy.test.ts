import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../backend/db';
import { createClient } from '../backend/dal/client.dal';
import { createProject } from '../backend/dal/project.dal';
import { createEvent } from '../backend/dal/event.dal';
import { createProperty } from '../backend/dal/property.dal';
import { createCatalog } from '../backend/dal/catalog.dal';
import { createSource } from '../backend/dal/source.dal';
import { createBundle } from '../backend/dal/bundle.dal';
import { createQaRun } from '../backend/dal/qa-run.dal';
import { registerTools } from './registerTools';
import { authorizeHttpTool, TOOL_POLICY } from './toolPolicy';
import { withHttpMcpContext, type HttpMcpContext } from './httpContext';
import * as OAuth from '../backend/dal/mcp-oauth.dal';
let project: string, foreign: string, context: HttpMcpContext;
const resource = 'https://example.com/mcp';
beforeEach(() => { process.env.E3_DB_PATH = ':memory:'; closeDb(); const client = createClient({ key: 'policy', name: 'Policy' }); project = createProject({ key: 'selected', name: 'Selected', client_id: client.id }).id; foreign = createProject({ key: 'foreign', name: 'Foreign', client_id: client.id }).id; getDb().prepare('INSERT INTO mcp_oauth_clients VALUES(?,?,?)').run('client', '{}', OAuth.now()); const code = getDb().transaction(() => OAuth.createGrant('owner@example.com', 'client', resource, ['projects:read', 'projects:write', 'templates:read'], [project], 'https://claude.ai/api/mcp/auth_callback', 'challenge')).immediate(); const issued = OAuth.exchangeCode('client', code, 'https://claude.ai/api/mcp/auth_callback', resource); const g = OAuth.access(issued.access_token, resource).grant; context = { token: issued.access_token, resource, grantId: g.id, owner: g.owner, scopes: JSON.parse(g.scopes_json) }; });
afterEach(() => { closeDb(); delete process.env.E3_DB_PATH; });
describe('exhaustive remote MCP policy', () => {
    it('matches all32 registered tools exactly and defaults unknown tools/operations to denial', () => { const names: string[] = []; registerTools({ registerTool(name: string) { names.push(name); } } as never); expect(names).toHaveLength(32); expect(Object.keys(TOOL_POLICY).sort()).toEqual(names.sort()); withHttpMcpContext(context, () => { expect(() => authorizeHttpTool('unknown', {})).toThrow(); expect(() => authorizeHttpTool('batch_apply', { operations: [{ op: 'unknown' }] })).toThrow(); }); });
    it('preauthorizes every supported ID-bearing alias and array before batch execution', () => {
        const event = createEvent(foreign, { name: 'event', class: 'custom' }), property = createProperty(foreign, { name: 'property', scope: 'event', data_type: 'string' }), catalog = createCatalog(foreign, { name: 'catalog' }), source = createSource(foreign, { name: 'source' }), bundle = createBundle(foreign, { name: 'bundle' });
        const operations = [{ op: 'update_event', event: event.id }, { op: 'update_property', property: property.id }, { op: 'create_catalog_field', catalog: catalog.id, name: 'field' }, { op: 'create_identity_rule', name: 'rule', identifier_name: 'email', trigger_event: event.id }, { op: 'create_property', scope: 'event', name: 'p', data_type: 'string', bundle_ids: [bundle.id] }, { op: 'create_event', name: 'new', source_ids: [source.id] }, { op: 'create_property', scope: 'event', name: 'p', data_type: 'string', mapped_catalog_id: catalog.id }];
        for (const operation of operations)
            withHttpMcpContext(context, () => expect(() => authorizeHttpTool('batch_apply', { dry_run: false, operations: [{ op: 'create_event', name: 'first' }, operation] })).toThrow());
        expect(getDb().prepare('SELECT id FROM events WHERE project_id=?').all(project)).toEqual([]);
    });
    it('accepts live owned sources/bundles and rejects deleted project/new project/QA references', () => { const source = createSource(project, { name: 'source' }), bundle = createBundle(project, { name: 'bundle' }); withHttpMcpContext(context, () => { expect(() => authorizeHttpTool('create_event', { name: 'new', source_ids: [source.id] })).not.toThrow(); expect(() => authorizeHttpTool('create_property', { name: 'new', scope: 'event', data_type: 'string', bundle_ids: [bundle.id] })).not.toThrow(); const qa = createQaRun(foreign, { kind: 'agent_session' }); expect(() => authorizeHttpTool('finish_qa_run', { qa_run_id: qa.id })).toThrow(); const c = createClient({ key: 'new', name: 'New' }); createProject({ key: 'new-project', name: 'New', client_id: c.id }); expect(() => authorizeHttpTool('list_events', { project_key: 'new-project' })).toThrow(); getDb().prepare("UPDATE projects SET deleted_at='removed' WHERE id=?").run(project); expect(() => authorizeHttpTool('list_events', {})).toThrow(); }); });
    it('rechecks grant state inside tool callbacks after transport preauthorization', async () => { let callback: ((args: unknown) => Promise<{
        isError?: boolean;
    }>) | undefined; withHttpMcpContext(context, () => registerTools({ registerTool(name: string, _config: unknown, fn: typeof callback) { if (name === 'create_event')
            callback = fn; } } as never)); withHttpMcpContext(context, () => authorizeHttpTool('create_event', { name: 'race', dry_run: false })); OAuth.revokeGrant(context.grantId); const result = await withHttpMcpContext(context, () => callback!({ name: 'race', dry_run: false })); expect(result.isError).toBe(true); expect(getDb().prepare("SELECT id FROM events WHERE name='race'").all()).toEqual([]); });
    it('reports actual bounded access lifetime near absolute family expiry', () => { getDb().prepare('UPDATE mcp_oauth_grants SET expires_at=? WHERE id=?').run(OAuth.now() + 10, context.grantId); const refresh = getDb().prepare("SELECT token_hash FROM mcp_oauth_tokens WHERE grant_id=? AND kind='refresh'").get(context.grantId); expect(refresh).toBeTruthy(); const code = getDb().transaction(() => OAuth.createGrant('owner@example.com', 'client', resource, ['projects:read'], [project], 'https://claude.ai/api/mcp/auth_callback', 'challenge')).immediate(); const g = OAuth.codeInfo('client', code); getDb().prepare('UPDATE mcp_oauth_grants SET expires_at=? WHERE id=?').run(OAuth.now() + 10, g.grant_id); const issued = OAuth.exchangeCode('client', code, 'https://claude.ai/api/mcp/auth_callback', resource); expect(issued.expires_in).toBeGreaterThan(0); expect(issued.expires_in).toBeLessThanOrEqual(10); });
});
