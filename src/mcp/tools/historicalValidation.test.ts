import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { closeDb, getDb } from '../../backend/db';
import { createClient } from '../../backend/dal/client.dal';
import { createProject } from '../../backend/dal/project.dal';
import { createEvent, attachPropertyToEvent } from '../../backend/dal/event.dal';
import { createProperty } from '../../backend/dal/property.dal';
import * as OAuth from '../../backend/dal/mcp-oauth.dal';
import { oauthProvider, CLAUDE_CALLBACK } from '../../backend/services/mcpOAuth.service';
import { uploadHistoricalSource } from '../../backend/services/historicalValidation.service';
import { registerTools } from '../registerTools';
import { withHttpMcpContext, type HttpMcpContext } from '../httpContext';
let project: string, event: string, property: string, directory: string;
beforeEach(() => {
  vi.stubEnv('E3_DB_PATH', ':memory:'); directory = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-native-mcp-')); vi.stubEnv('E3_FILES_PATH', directory); closeDb();
  project = createProject({ client_id: createClient({ key: 'native', name: 'Native' }).id, key: 'native', name: 'Native' }).id;
  event = createEvent(project, { name: 'purchase' }).id; property = createProperty(project, { name: 'value', scope: 'event', data_type: 'number' }).id; attachPropertyToEvent(project, event, { property_id: property });
});
afterEach(() => { closeDb(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });
async function grant(write: boolean): Promise<HttpMcpContext> {
  const resource = 'https://native.example/mcp', provider = oauthProvider({ origin: 'https://native.example', resource, domain: 'example.com' });
  const client = await provider.clientsStore.registerClient!({ redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'none' });
  const scopes = ['projects:read', ...(write ? ['projects:write'] : [])];
  const code = OAuth.createGrant('verified@example.com', client.client_id, resource, scopes, [project], CLAUDE_CALLBACK, 'challenge');
  const grantId = OAuth.codeInfo(client.client_id, code).grant_id, tokens = OAuth.exchangeCode(client.client_id, code, CLAUDE_CALLBACK, resource);
  return { token: tokens.access_token, resource, owner: 'verified@example.com', grantId, scopes };
}
it('allows pure read preview but refuses read-scope apply; write uses verified OAuth actor and audit reference', async () => {
  const source = await uploadHistoricalSource(project, Buffer.from('value\n1\n'), 'values.csv', { source_ref: 'reviewed-file-id' });
  const def = getDb().prepare('SELECT definition_id FROM event_properties WHERE event_id=? AND property_id=?').get(event, property) as { definition_id: string };
  const manifest = { version: 1, parse_policy: 'csv-lexical-v1', files: [{ source_id: source.id, event_id: event, mappings: [{ column: 'value', property_id: property, definition_id: def.definition_id }], source_only_columns: [], trailing_empty_columns: [] }], joins: [] };
  const callbacks = new Map<string, (input: any) => Promise<any>>();
  registerTools({ registerTool(name: string, _schema: unknown, callback: any) { callbacks.set(name, callback); return { disable() {} }; } } as never);
  const read = await grant(false), write = await grant(true);
  const run = (ctx: HttpMcpContext, tool: string, input: any) => withHttpMcpContext(ctx, () => callbacks.get(tool)!({ project_key: 'native', ...input }));
  const preview = JSON.parse((await run(read, 'preview_historical_validation', { manifest })).content[0].text);
  const denied = await run(read, 'apply_historical_validation', { manifest, payload_hash: preview.payload_hash, confirmed: true }); expect(denied.isError).toBe(true);
  expect(getDb().prepare('SELECT COUNT(*) n FROM historical_validation_reports').get()).toEqual({ n: 0 });
  const applied = JSON.parse((await run(write, 'apply_historical_validation', { manifest, payload_hash: preview.payload_hash, confirmed: true, agent_name: 'forged' })).content[0].text);
  expect(applied.actor).toBe('verified@example.com');
  expect(getDb().prepare('SELECT oauth_grant_id FROM historical_validation_reports WHERE report_id=?').get(applied.report_id)).toEqual({ oauth_grant_id: write.grantId });
  expect((await run(read, 'get_historical_validation', { report_id: applied.report_id })).isError).not.toBe(true);
});
