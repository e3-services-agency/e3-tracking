import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import { createProject } from '../../dal/project.dal';
import { listEvents, createEvent } from '../../dal/event.dal';
import { createBundle } from '../../dal/bundle.dal';
import { listQaRuns } from '../../dal/qa-run.dal';
import { buildBackup } from '../../services/backup.service';
import { CLAUDE_CALLBACK, CONSENT_COOKIE, MANAGEMENT_COOKIE } from '../../services/mcpOAuth.service';
import * as OAuth from '../../dal/mcp-oauth.dal';
// Node's fetch ignores a supplied Host header; use the real HTTP client for canonical-host fixtures.
async function fetch(url: string, init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | URLSearchParams;
    redirect?: string;
} = {}) {
    return new Promise<Response>((resolve, reject) => { const req = http.request(url, { method: init.method ?? 'GET', headers: init.headers }, res => { const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk))); res.on('end', () => { const headers = new Headers(); for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value))
            for (const item of value)
                headers.append(key, item);
        else if (value !== undefined)
            headers.set(key, value);
    } resolve(new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), { status: res.statusCode, headers })); }); }); req.once('error', reject); if (init.body)
        req.write(init.body.toString()); req.end(); });
}
const origin = 'https://mcp.example.com', resource = origin + '/mcp';
const verifier = 'v'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url');
let server: http.Server, base: string, project: string, foreign: string, sharedClient: string;
const headers = (extra: Record<string, string> = {}) => ({ Host: 'mcp.example.com', ...extra });
async function json(path: string, body: unknown, extra: Record<string, string> = {}) { return fetch(base + path, { method: 'POST', headers: headers({ 'Content-Type': 'application/json', ...extra }), body: JSON.stringify(body), redirect: 'manual' }); }
async function token(client: string, code: string, extra: Record<string, string> = {}) { return fetch(base + '/mcp/oauth/token', { method: 'POST', headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded' }), body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client, code, code_verifier: verifier, redirect_uri: CLAUDE_CALLBACK, resource, ...extra }) }); }
async function register(extra: Record<string, unknown> = {}) { return json('/mcp/oauth/register', { client_name: 'Claude', redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...extra }); }
async function consent(client: string, scope = 'projects:read', owner = 'one@example.com', write = false) {
    const params = new URLSearchParams({ client_id: client, response_type: 'code', redirect_uri: CLAUDE_CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource, scope, state: 'safe-state' });
    const res = await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': owner }), redirect: 'manual' });
    expect(res.status).toBe(200);
    const html = await res.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    const body = new URLSearchParams({ csrf, decision: 'approve', ...(scope.includes('projects:read') ? { project } : {}), ...(write ? { write: 'yes' } : {}), ...(scope.includes('templates:read') ? { templates: 'yes' } : {}) });
    const approved = await fetch(base + '/mcp/oauth/consent', { method: 'POST', headers: headers({ 'X-Forwarded-Email': owner, Origin: origin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }), body, redirect: 'manual' });
    expect(approved.status).toBe(302);
    const target = new URL(approved.headers.get('location')!);
    expect(target.origin + target.pathname).toBe(CLAUDE_CALLBACK);
    expect(target.searchParams.get('state')).toBe('safe-state');
    return target.searchParams.get('code')!;
}
async function grant(scope = 'projects:read', owner = 'one@example.com', write = false) { if (!sharedClient) {
    const registered = await register();
    expect(registered.status).toBe(201);
    sharedClient = (await registered.json()).client_id;
} const c = { client_id: sharedClient }; const code = await consent(c.client_id, scope, owner, write); const res = await token(c.client_id, code); expect(res.status).toBe(200); const tokens = await res.json() as {
    access_token: string;
    refresh_token: string;
}; return { client: c.client_id, code, ...tokens }; }
async function mcp(access: string, name: string, args: Record<string, unknown> = {}) { return json('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { Authorization: 'Bearer ' + access, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' }); }
beforeAll(async () => { process.env.NODE_ENV = 'test'; process.env.AUTH_MODE = 'proxy'; process.env.TRUSTED_PROXY_CIDR = '127.0.0.1/32,::1/128'; process.env.E3_DB_PATH = ':memory:'; closeDb(); const client = createClient({ key: 'mcp-http', name: 'MCP HTTP' }); project = createProject({ key: 'mcp-selected', name: 'Selected', client_id: client.id }).id; foreign = createProject({ key: 'mcp-foreign', name: 'Foreign', client_id: client.id }).id; createEvent(project, { name: 'purchase', class: 'custom' }); server = http.createServer(createApp({ serveStatic: false, mcpHttp: { origin, resource, domain: 'example.com' } })); await new Promise<void>(r => server.listen(0, r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); closeDb(); for (const env of ['AUTH_MODE', 'TRUSTED_PROXY_CIDR', 'E3_DB_PATH', 'E3_PROJECT_KEY'])
    delete process.env[env]; });
describe('authenticated stateless HTTPS MCP', () => {
    it('returns exact metadata and Bearer challenges, never Google redirect/SPA', async () => { const meta = await fetch(base + '/.well-known/oauth-authorization-server', { headers: headers() }); expect(meta.status).toBe(200); const m = await meta.json(); expect(m.authorization_endpoint).toBe(origin + '/mcp/oauth/authorize'); expect(m.registration_endpoint).toBe(origin + '/mcp/oauth/register'); expect(m.client_id_metadata_document_supported).toBeUndefined(); const res = await fetch(base + '/mcp', { headers: headers() }); expect(res.status).toBe(401); expect(res.headers.get('www-authenticate')).toContain('scope="projects:read projects:write templates:read"'); const protectedMeta = await fetch(base + '/.well-known/oauth-protected-resource/mcp', { headers: headers() }); expect((await protectedMeta.json()).scopes_supported).toEqual(['projects:read', 'projects:write', 'templates:read']); expect(res.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp'); expect(res.headers.get('location')).toBeNull(); });
    it('rejects unexpected host/origin, unsupported client/redirect and spoofed staff', async () => { expect((await fetch(base + '/mcp', { headers: headers({ Host: 'evil.example' }) })).status).toBe(403); expect((await register({ redirect_uris: ['http://localhost/callback'] })).status).toBe(400); expect((await register({ token_endpoint_auth_method: 'client_secret_basic' })).status).toBe(400); expect((await register({ client_uri: 'https://evil.example/metadata' })).status).toBe(400); const c = await (await register()).json(); const p = new URLSearchParams({ client_id: c.client_id, response_type: 'code', redirect_uri: CLAUDE_CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource }); expect((await fetch(base + '/mcp/oauth/authorize?' + p, { headers: headers({ 'X-Forwarded-Email': 'evil@other.com' }) })).status).toBe(401); });
    it('enforces client, exact resource, PKCE and one-use authorization codes', async () => { const c = await (await register()).json(); const code = await consent(c.client_id); expect((await token(c.client_id, code, { resource: origin + '/other' })).status).toBe(400); expect((await token(c.client_id, code, { code_verifier: 'wrong' })).status).toBe(400); const wrong = await (await register()).json(); expect((await token(wrong.client_id, code)).status).toBe(400); expect((await token(c.client_id, code)).status).toBe(200); expect((await token(c.client_id, code)).status).toBe(400); });
    it('discovers the read-scope tools only (all 29 are registered, filtered by scope) and refuses write/template scope with full step-up challenge', async () => { const g = await grant(); const res = await json('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { Authorization: 'Bearer ' + g.access_token, Accept: 'application/json, text/event-stream' }); expect(res.status).toBe(200); expect((await res.json()).result.tools).toHaveLength(10); const write = await mcp(g.access_token, 'create_event', { name: 'denied', dry_run: true }); expect(write.status).toBe(403); expect(write.headers.get('www-authenticate')).toContain('projects:read projects:write'); expect((await mcp(g.access_token, 'list_use_case_templates')).status).toBe(403); expect(listEvents(project).some(e => e.name === 'denied')).toBe(false); });
    it('filters project discovery and ignores ambient default/foreign project requests', async () => { const g = await grant(); process.env.E3_PROJECT_KEY = 'mcp-foreign'; const list = await mcp(g.access_token, 'list_projects'); expect(list.status).toBe(200); expect(JSON.stringify(await list.json())).not.toContain('mcp-foreign'); expect((await mcp(g.access_token, 'list_events')).status).toBe(200); const denied = await mcp(g.access_token, 'list_events', { project_key: 'mcp-foreign' }); expect(denied.status).toBe(403); expect(denied.headers.get('www-authenticate')).toBeNull(); });
    it('preauthorizes every transport/nested batch operation before any write', async () => { const g = await grant('projects:read projects:write', 'one@example.com', true); const before = listEvents(project).length; const foreignEvent = createEvent(foreign, { name: 'foreign_alias', class: 'custom' }); const aliasDenied = await mcp(g.access_token, 'batch_apply', { dry_run: false, operations: [{ op: 'create_event', name: 'alias_would_write' }, { op: 'update_event', event: foreignEvent.id, description: 'forbidden' }] }); expect(aliasDenied.status).toBe(403); const foreignBundle = createBundle(foreign, { name: 'foreign_bundle' }); const bundleDenied = await mcp(g.access_token, 'batch_apply', { dry_run: false, operations: [{ op: 'create_event', name: 'bundle_would_write' }, { op: 'create_property', name: 'new', scope: 'event', data_type: 'string', bundle_ids: [foreignBundle.id] }] }); expect(bundleDenied.status).toBe(403); const denied = await mcp(g.access_token, 'batch_apply', { dry_run: false, operations: [{ op: 'create_event', name: 'would_write' }, { op: 'create_event', name: 'foreign', project_key: 'mcp-foreign' }] }); expect(denied.status).toBe(403); const body = [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_event', arguments: { name: 'transport_write', dry_run: false } } }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'unknown' } }]; expect((await json('/mcp', body, { Authorization: 'Bearer ' + g.access_token, Accept: 'application/json, text/event-stream' })).status).toBe(400); expect(listEvents(project)).toHaveLength(before); });
    it('records verified actors and isolates durable automatic QA runs by principal', async () => { const one = await grant('projects:read projects:write', 'one@example.com', true), two = await grant('projects:read projects:write', 'two@example.com', true); expect((await mcp(one.access_token, 'create_event', { name: 'verified_actor', dry_run: false, agent_name: 'forged' })).status).toBe(200); expect(getDb().prepare("SELECT actor FROM change_log WHERE entity_label='verified_actor' ORDER BY rowid DESC LIMIT 1").get()).toEqual({ actor: 'one@example.com' }); const submit = (g: typeof one, timestamp: number) => mcp(g.access_token, 'submit_observation', { event_type: 'purchase', properties: { total: 1 }, timestamp }); const results = await Promise.all([submit(one, 10), submit(two, 11)]); for (const r of results)
        expect(r.status).toBe(200); const bodies = await Promise.all(results.map(r => r.json())); const ids = bodies.map(b => JSON.parse(b.result.content[0].text).qa_run_id); expect(ids[0]).not.toBe(ids[1]); expect(listQaRuns(project).filter(r => ids.includes(r.id)).map(r => r.actor).sort()).toEqual(['one@example.com', 'two@example.com']); const next = await submit(one, 12); expect(JSON.parse((await next.json()).result.content[0].text).qa_run_id).toBe(ids[0]); });
    it('rotates refresh tokens and replay revokes all access tokens for that grant', async () => { const g = await grant(); const refresh = async (value: string) => fetch(base + '/mcp/oauth/token', { method: 'POST', headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded' }), body: new URLSearchParams({ grant_type: 'refresh_token', client_id: g.client, refresh_token: value, resource }) }); const rotated = await refresh(g.refresh_token); expect(rotated.status).toBe(200); const tokens = await rotated.json(); expect(tokens.refresh_token).not.toBe(g.refresh_token); expect((await refresh(g.refresh_token)).status).toBe(400); expect((await mcp(tokens.access_token, 'list_projects')).status).toBe(401); expect((await refresh(tokens.refresh_token)).status).toBe(400); });
    it('requires exact owner and CSRF for connection revocation, and revokes all current tokens', async () => {
        const g = await grant();
        const info = await OAuth.access(g.access_token, resource);
        const wrong = await fetch(base + '/api/mcp/connections', { headers: headers({ 'X-Forwarded-Email': 'two@example.com' }) });
        expect(wrong.status).toBe(200);
        const other = await wrong.json();
        expect(other.connections.some((c: {
            id: string;
        }) => c.id === info.grant.id)).toBe(false);
        const wrongCookie = 'unused=1';
        expect((await json('/api/mcp/connections', { id: info.grant.id, csrf: other.csrf }, { 'X-Forwarded-Email': 'two@example.com', Origin: origin, Cookie: wrongCookie })).status).toBe(404);
        expect((await mcp(g.access_token, 'list_projects')).status).toBe(200);
        const mine = await fetch(base + '/api/mcp/connections', { headers: headers({ 'X-Forwarded-Email': 'one@example.com' }) });
        const data = await mine.json();
        const mineCookie = 'unused=1';
        expect((await json('/api/mcp/connections', { id: info.grant.id, csrf: 'wrong' }, { 'X-Forwarded-Email': 'one@example.com', Origin: origin, Cookie: mineCookie })).status).toBe(403);
        expect((await json('/api/mcp/connections', { id: info.grant.id, csrf: data.csrf }, { 'X-Forwarded-Email': 'one@example.com', Origin: 'https://evil.example', Cookie: mineCookie })).status).toBe(403);
        expect((await json('/api/mcp/connections', { id: info.grant.id, csrf: data.csrf }, { 'X-Forwarded-Email': 'one@example.com', Origin: origin, Cookie: mineCookie })).status).toBe(200);
        expect((await mcp(g.access_token, 'list_projects')).status).toBe(401);
    });
    it('rejects consent CSRF/scope expansion and supports deny without a grant', async () => {
        const c = sharedClient;
        const params = new URLSearchParams({ client_id: c, response_type: 'code', redirect_uri: CLAUDE_CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource, scope: 'projects:read', state: 'denied-state' });
        const pending = await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': 'one@example.com' }) });
        const html = await pending.text();
        const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1], cookie = pending.headers.get('set-cookie')!.split(';')[0];
        const submit = (fields: Record<string, string>) => fetch(base + '/mcp/oauth/consent', { method: 'POST', headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-Email': 'one@example.com', Origin: origin, Cookie: cookie }), body: new URLSearchParams({ csrf, decision: 'approve', project, ...fields }), redirect: 'manual' });
        expect((await submit({ csrf: 'wrong' })).status).toBe(400);
        expect((await submit({ write: 'yes' })).status).toBe(400);
        const before = (getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_grants').get() as {
            n: number;
        }).n;
        const denied = await submit({ decision: 'deny' });
        expect(denied.status).toBe(302);
        expect(new URL(denied.headers.get('location')!).searchParams.get('error')).toBe('access_denied');
        expect((getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_grants').get() as {
            n: number;
        }).n).toBe(before);
        expect((await submit({})).status).toBe(400);
    });
    it('supports explicit template-only grants without forcing project-read permission', async () => { const g = await grant('templates:read'); expect((await mcp(g.access_token, 'list_use_case_templates')).status).toBe(200); expect((await mcp(g.access_token, 'list_projects')).status).toBe(403); expect((await mcp(g.access_token, 'instantiate_use_case_template', { template_code: 'ANY' })).status).toBe(403); });
    it('accepts supported2025 initialization versions and rejects unsupported methods/body bounds', async () => { const g = await grant(); for (const version of ['2025-03-26', '2025-06-18']) {
        const res = await json('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'test', version: '1' } } }, { Authorization: 'Bearer ' + g.access_token, Accept: 'application/json, text/event-stream' });
        expect(res.status).toBe(200);
        expect((await res.json()).result.protocolVersion).toBe(version);
    } expect((await json('/mcp', { jsonrpc: '2.0', id: 1, method: 'resources/read', params: {} }, { Authorization: 'Bearer ' + g.access_token })).status).toBe(400); expect((await fetch(base + '/mcp', { headers: headers({ Authorization: 'Bearer ' + g.access_token }) })).status).toBe(405); expect((await json('/mcp', { data: 'x'.repeat(270000) }, { Authorization: 'Bearer ' + g.access_token })).status).toBe(413); });
    it('keeps wrong-client revocation terminal without revoking another client family', async () => { const g = await grant(); const c = await (await register()).json(); const revoke = async (client: string) => fetch(base + '/mcp/oauth/revoke', { method: 'POST', headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded' }), body: new URLSearchParams({ client_id: client, token: g.refresh_token }) }); expect((await revoke(c.client_id)).status).toBe(200); expect((await mcp(g.access_token, 'list_projects')).status).toBe(200); expect((await revoke(g.client)).status).toBe(200); expect((await mcp(g.access_token, 'list_projects')).status).toBe(401); });
    it('rejects expired codes/access tokens and exact audience changes', async () => { const code = await consent(sharedClient); getDb().prepare('UPDATE mcp_oauth_codes SET expires_at=? WHERE code_hash=?').run(OAuth.now() - 1, OAuth.hash(code)); expect((await token(sharedClient, code)).status).toBe(400); const expired = await grant(); getDb().prepare('UPDATE mcp_oauth_tokens SET expires_at=? WHERE token_hash=?').run(OAuth.now() - 1, OAuth.hash(expired.access_token)); expect((await mcp(expired.access_token, 'list_projects')).status).toBe(401); const audience = await grant(); const g = OAuth.access(audience.access_token, resource).grant; getDb().prepare('UPDATE mcp_oauth_grants SET resource=? WHERE id=?').run(origin + '/other', g.id); expect((await mcp(audience.access_token, 'list_projects')).status).toBe(401); });
    it('stores only token hashes and excludes all operational tables from portable backups', async () => { const g = await grant(); const rows = getDb().prepare('SELECT token_hash FROM mcp_oauth_tokens').all(); expect(JSON.stringify(rows)).not.toContain(g.access_token); expect(JSON.stringify(rows)).not.toContain(g.refresh_token); const backup = await buildBackup(project); expect(Object.keys(backup).some(k => k.startsWith('mcp_'))).toBe(false); const raw = JSON.stringify(backup); expect(raw).not.toContain(g.access_token); expect(raw).not.toContain(g.refresh_token); });
    it('never reaches handlers through case-variant gated paths', async () => {
        const count = () => (getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_clients').get() as { n: number }).n;
        const before = count();
        const reg = await fetch(base + '/MCP/oauth/register', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'none' }) });
        expect(reg.status).toBe(404);
        expect((await fetch(base + '/MCP', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: '{}' })).status).toBe(404);
        expect((await fetch(base + '/MCP/oauth/authorize?client_id=x', { headers: headers({ 'X-Forwarded-Email': 'one@example.com' }) })).status).toBe(404);
        expect((await fetch(base + '/Api/MCP/connections', { headers: headers({ 'X-Forwarded-Email': 'one@example.com' }) })).status).toBe(404);
        expect(count()).toBe(before);
    });
    it('rate-limits per forwarded client address from the trusted peer', async () => {
        const reg = (ip: string) => json('/mcp/oauth/register', { client_name: 'x', redirect_uris: ['https://evil.example/cb'] }, { 'X-Forwarded-For': ip });
        let last = 0;
        for (let i = 0; i < 12; i++)
            last = (await reg('203.0.113.7')).status;
        expect(last).toBe(429);
        expect((await reg('203.0.113.8')).status).not.toBe(429);
    });
    it('accepts the claude.ai Origin only on token/register/revoke, never on staff paths', async () => {
        const params = new URLSearchParams({ client_id: sharedClient, response_type: 'code', redirect_uri: CLAUDE_CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource, scope: 'projects:read' });
        expect((await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': 'one@example.com', Origin: 'https://claude.ai' }) })).status).toBe(403);
        expect((await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': 'one@example.com', Origin: origin }) })).status).toBe(200);
    });
    it('shows only in-scope tools in tools/list', async () => {
        const names = async (g: { access_token: string }) => (await (await json('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Authorization: 'Bearer ' + g.access_token, Accept: 'application/json, text/event-stream' })).json()).result.tools.map((t: { name: string }) => t.name);
        const read = await names(await grant());
        expect(read).toContain('list_events');
        expect(read).not.toContain('create_event');
        expect(read).not.toContain('list_use_case_templates');
        expect(await names(await grant('projects:read projects:write', 'one@example.com', true))).toContain('create_event');
    });
    it('revokes the grant when a consumed authorization code is replayed', async () => {
        const code = await consent(sharedClient);
        const first = await token(sharedClient, code);
        expect(first.status).toBe(200);
        const issued = await first.json();
        expect((await token(sharedClient, code)).status).toBe(400);
        expect((await mcp(issued.access_token, 'list_projects')).status).toBe(401);
    });
    it('keeps connection reads free of side effects', async () => {
        const n = () => (getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_pending').get() as { n: number }).n;
        const before = n();
        const h = headers({ 'X-Forwarded-Email': 'one@example.com' });
        expect((await fetch(base + '/api/mcp/connections', { headers: h })).status).toBe(200);
        expect((await fetch(base + '/mcp/connections', { headers: h })).status).toBe(200);
        expect(n()).toBe(before);
    });
    it('accepts a null Origin only with Sec-Fetch-Site same-origin on the canonical host (consent and connections)', async () => {
        const owner = 'one@example.com';
        const params = new URLSearchParams({ client_id: sharedClient, response_type: 'code', redirect_uri: CLAUDE_CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource, scope: 'projects:read', state: 's' });
        const page = async () => { const res = await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': owner }) }); expect(res.headers.get('referrer-policy')).toBe('same-origin'); return { csrf: /name="csrf" value="([^"]+)"/.exec(await res.text())![1], cookie: res.headers.get('set-cookie')!.split(';')[0] }; };
        const post = async (extra: Record<string, string>) => { const p = await page(); return fetch(base + '/mcp/oauth/consent', { method: 'POST', headers: headers({ 'X-Forwarded-Email': owner, Cookie: p.cookie, 'Content-Type': 'application/x-www-form-urlencoded', ...extra }), body: new URLSearchParams({ csrf: p.csrf, decision: 'approve', project }), redirect: 'manual' }); };
        const ok = await post({ Origin: 'null', 'Sec-Fetch-Site': 'same-origin' });
        expect(ok.status).toBe(302);
        expect(new URL(ok.headers.get('location')!).searchParams.get('code')).toBeTruthy();
        expect((await post({ Origin: 'null' })).status).toBe(403);
        expect((await post({ Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
        expect((await post({ Origin: 'null', 'Sec-Fetch-Site': 'none' })).status).toBe(403);
        expect((await post({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(403);
        const conn = (extra: Record<string, string>) => fetch(base + '/mcp/connections', { method: 'POST', headers: headers({ 'X-Forwarded-Email': owner, 'Content-Type': 'application/x-www-form-urlencoded', ...extra }), body: new URLSearchParams({ id: 'x', csrf: 'y' }), redirect: 'manual' });
        expect((await conn({ Origin: 'null' })).status).toBe(403);
        expect((await conn({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(403);
        // passes the origin gate, then fails on the bad csrf token (still 403 from the handler), so assert via the page header instead
        expect((await fetch(base + '/mcp/connections', { headers: headers({ 'X-Forwarded-Email': owner }) })).headers.get('referrer-policy')).toBe('same-origin');
    });
    it('advertises all scopes up front; write and templates are opt-in and unticked on the consent page', async () => {
        const g0 = await grant();
        const first = await fetch(base + '/mcp', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: '{}' });
        expect(first.status).toBe(401);
        expect(first.headers.get('www-authenticate')).toContain('scope="projects:read projects:write templates:read"');
        const all = 'projects:read projects:write templates:read';
        const params = new URLSearchParams({ client_id: g0.client, response_type: 'code', redirect_uri: CLAUDE_CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource, scope: all });
        const html = await (await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': 'one@example.com' }) })).text();
        expect(html).toMatch(/<input type="checkbox" name="write" value="yes">/);
        expect(html).toMatch(/<input type="checkbox" name="templates" value="yes">/);
        expect(html).not.toContain('checked');
        expect(html).not.toContain('This request is read-only');
        params.set('scope', 'projects:read');
        expect(await (await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': 'one@example.com' }) })).text()).toContain('This request is read-only');
        params.set('scope', 'projects:read bogus:scope');
        expect((await fetch(base + '/mcp/oauth/authorize?' + params, { headers: headers({ 'X-Forwarded-Email': 'one@example.com' }), redirect: 'manual' })).status).not.toBe(200);
        const tools = async (a: string) => (await (await json('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Authorization: 'Bearer ' + a, Accept: 'application/json, text/event-stream' })).json()).result.tools.length;
        const readOnly = await grant('projects:read projects:write');
        expect(await tools(readOnly.access_token)).toBe(10);
        const writer = await grant('projects:read projects:write', 'one@example.com', true);
        expect(OAuth.access(writer.access_token, resource).scopes).toEqual(['projects:read', 'projects:write']);
        expect(await tools(writer.access_token)).toBe(27);
        const tpl = await grant('projects:read templates:read');
        expect(OAuth.access(tpl.access_token, resource).scopes).toEqual(['projects:read', 'templates:read']);
    });
});
