import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import { createProject } from '../../dal/project.dal';
import { CLAUDE_CALLBACK, CONSENT_COOKIE } from '../../services/mcpOAuth.service';
import * as OAuth from '../../dal/mcp-oauth.dal';

const origin = 'https://mcp.example.com', resource = origin + '/mcp', owner = 'one@example.com';
const verifier = 'v'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url');
let server: http.Server, base: string, project: string, requestNumber = 0;
// Native HTTP is required: Node fetch ignores a supplied canonical Host header.
async function request(path: string, body?: unknown, extra: Record<string, string> = {}) {
    const encoded = body instanceof URLSearchParams ? body.toString() : body === undefined ? undefined : JSON.stringify(body);
    return new Promise<Response>((resolve, reject) => {
        const req = http.request(base + path, { method: body === undefined ? 'GET' : 'POST', headers: {
            Host: 'mcp.example.com', 'X-Forwarded-For': `203.0.113.${++requestNumber}`,
            ...(encoded ? { 'Content-Type': body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...extra,
        } }, res => {
            const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                const headers = new Headers();
                for (const [key, value] of Object.entries(res.headers))
                    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(key, item);
                resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers }));
            });
        });
        req.once('error', reject); if (encoded) req.write(encoded); req.end();
    });
}
async function register(redirect: string) {
    // Exact safe metadata captured from the installed Codex CLI with a disposable CODEX_HOME.
    const res = await request('/mcp/oauth/register', { client_name: 'Codex', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none', response_types: ['code'], scope: 'projects:read', application_type: 'native' });
    expect(res.status).toBe(201);
    const metadata = await res.json();
    expect(metadata.redirect_uris).toEqual([redirect]);
    expect(metadata.client_name).toBe('Codex native connector');
    expect(metadata.client_secret).toBeUndefined();
    return metadata.client_id as string;
}
const authorizationPath = (client: string, redirect: string, extra: Record<string, string> = {}) => '/mcp/oauth/authorize?' + new URLSearchParams({ client_id: client, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', resource, scope: 'projects:read projects:write templates:read', state: 'codex-state', ...extra });
async function pending(client: string, redirect: string) {
    const res = await request(authorizationPath(client, redirect), undefined, { 'X-Forwarded-Email': owner });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Connect Codex to E3 Tracking');
    expect(html).toContain('native application callback on your own computer');
    expect(html).not.toContain('checked');
    expect(res.headers.get('content-security-policy')).toContain(`form-action 'self' ${redirect};`);
    expect(res.headers.get('content-security-policy')).not.toContain('127.0.0.1:*');
    return { csrf: /name="csrf" value="([^"]+)"/.exec(html)![1], cookie: res.headers.get('set-cookie')!.split(';')[0] };
}
async function approve(p: {csrf: string; cookie: string}, extra: Record<string, string> = {}, identity = owner) {
    return request('/mcp/oauth/consent', new URLSearchParams({ csrf: p.csrf, decision: 'approve', project, ...extra }), { 'X-Forwarded-Email': identity, Cookie: p.cookie, Origin: origin });
}
async function exchange(client: string, code: string, redirect: string, extra: Record<string, string> = {}) {
    return request('/mcp/oauth/token', new URLSearchParams({ client_id: client, grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, resource, ...extra }));
}
const call = (access: string, method: string, params = {}) => request('/mcp', { jsonrpc: '2.0', id: 1, method, params }, { Authorization: 'Bearer ' + access, Accept: 'application/json, text/event-stream' });
beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.AUTH_MODE = 'proxy'; process.env.TRUSTED_PROXY_CIDR = '127.0.0.1/32,::1/128'; process.env.E3_DB_PATH = ':memory:';
    closeDb(); const client = createClient({ key: 'codex', name: 'Codex fixtures' });
    project = createProject({ client_id: client.id, key: 'codex-selected', name: 'Selected' }).id;
    createProject({ client_id: client.id, key: 'codex-foreign', name: 'Foreign' });
    server = http.createServer(createApp({ serveStatic: false, mcpHttp: { origin, resource, domain: 'example.com' } }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve())); closeDb();
    for (const key of ['AUTH_MODE', 'TRUSTED_PROXY_CIDR', 'E3_DB_PATH']) delete process.env[key];
});

describe('Codex native MCP OAuth, preserving Claude policy', () => {
    it.each(['/callback', '/callback/8O2bl7JfP_KJ'])('binds %s and allows a fresh listener port, then exact exchange and scoped MCP access', async path => {
        const registered = 'http://127.0.0.1' + path, redirect = 'http://127.0.0.1:50972' + path;
        const client = await register(registered), p = await pending(client, redirect);
        const res = await approve(p);
        expect(res.status).toBe(302);
        expect(res.headers.get('content-security-policy')).toContain(`form-action 'self' ${redirect};`);
        const target = new URL(res.headers.get('location')!);
        expect(target.origin + target.pathname).toBe(redirect);
        expect(target.searchParams.get('state')).toBe('codex-state');
        const code = target.searchParams.get('code')!;
        // RFC8252 port variation ends at authorization; the issued code's URI is byte-exact.
        for (const wrong of [registered, redirect.replace(':50972', ':50973'), CLAUDE_CALLBACK]) expect((await exchange(client, code, wrong)).status).toBe(400);
        expect((await exchange(client, code, redirect, { resource: origin + '/other' })).status).toBe(400);
        expect((await exchange(client, code, redirect, { code_verifier: 'incorrect' })).status).toBe(400);
        const other = await register(registered);
        expect((await exchange(other, code, redirect)).status).toBe(400);
        const issued = await exchange(client, code, redirect); expect(issued.status).toBe(200);
        const tokens = await issued.json(); expect(tokens.scope).toBe('projects:read');
        const list = await call(tokens.access_token, 'tools/list');
        const tools = (await list.json()).result.tools; expect(tools).toHaveLength(12);
        expect(tools.some((t: {name: string}) => t.name === 'create_event')).toBe(false);
        const projects = await call(tokens.access_token, 'tools/call', { name: 'list_projects', arguments: {} });
        const payload = JSON.stringify(await projects.json()); expect(payload).toContain('codex-selected'); expect(payload).not.toContain('codex-foreign');
        const denied = await call(tokens.access_token, 'tools/call', { name: 'list_events', arguments: { project_key: 'codex-foreign' } }); expect(denied.status).toBe(403);
        const refresh = await request('/mcp/oauth/token', new URLSearchParams({ grant_type: 'refresh_token', client_id: client, refresh_token: tokens.refresh_token, resource })); expect(refresh.status).toBe(200);
        const rotated = await refresh.json();
        const replay = await request('/mcp/oauth/token', new URLSearchParams({ grant_type: 'refresh_token', client_id: client, refresh_token: tokens.refresh_token, resource })); expect(replay.status).toBe(400);
        expect((await call(rotated.access_token, 'tools/list')).status).toBe(401);
    });
    it('accepts the actual captured CLI registration with a listener port and preserves consent opt-ins/attribution', async () => {
        const redirect = 'http://127.0.0.1:50972/callback/8O2bl7JfP_KJ', client = await register(redirect);
        const res = await approve(await pending(client, redirect), { write: 'yes', templates: 'yes' });
        const code = new URL(res.headers.get('location')!).searchParams.get('code')!;
        const tokens = await (await exchange(client, code, redirect)).json();
        expect(tokens.scope).toBe('projects:read projects:write templates:read');
        const list = await call(tokens.access_token, 'tools/list'); expect((await list.json()).result.tools).toHaveLength(32);
        const write = await call(tokens.access_token, 'tools/call', { name: 'create_event', arguments: { project_key: 'codex-selected', name: 'codex_verified', dry_run: false, agent_name: 'forged' } }); expect(write.status).toBe(200);
        expect(getDb().prepare("SELECT actor FROM change_log WHERE entity_label='codex_verified' ORDER BY rowid DESC LIMIT 1").get()).toEqual({ actor: owner });
        const g = OAuth.access(tokens.access_token, resource).grant;
        expect(OAuth.revokeGrant(g.id, owner)).toBe(true);
        expect((await call(tokens.access_token, 'tools/list')).status).toBe(401);
    });
    it('refuses unsupported dynamic metadata without creating a client', async () => {
        const before = getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_clients').get();
        const native = 'http://127.0.0.1:50972/callback/expected';
        for (const extra of [{redirect_uris: [native, CLAUDE_CALLBACK]}, {redirect_uris: [native + '#fragment']}, {token_endpoint_auth_method: 'client_secret_basic'}, {client_uri: 'https://evil.example/client.json'}, {grant_types: ['client_credentials']}, {scope: 'projects:admin'}]) {
            const res = await request('/mcp/oauth/register', { redirect_uris: [native], token_endpoint_auth_method: 'none', ...extra });
            expect(res.status).toBe(400);
        }
        expect(getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_clients').get()).toEqual(before);
    });
    it('rejects malformed and cross-client redirect bindings before the SDK can issue any redirect', async () => {
        const client = await register('http://127.0.0.1/callback/expected');
        for (const redirect of [CLAUDE_CALLBACK, 'http://127.0.0.1:50972/callback/other', 'http://127.0.0.1:50972/callback', 'http://localhost:50972/callback/expected', 'http://user@127.0.0.1/callback/expected', 'http://127.0.0.1/callback/expected#fragment', 'http://127.1/callback/expected', 'http://127.0.0.1/callback/../callback/expected']) {
            const res = await request(authorizationPath(client, redirect), undefined, { 'X-Forwarded-Email': owner });
            expect(res.status, redirect).toBe(400); expect(res.headers.get('location')).toBeNull();
        }
        const post = await request('/mcp/oauth/authorize', new URLSearchParams({ client_id: client, redirect_uri: 'http://user@127.0.0.1/callback/expected' }), { 'X-Forwarded-Email': owner });
        expect(post.status).toBe(400); expect(post.headers.get('location')).toBeNull();
    });
    it('revalidates the stored client and exact callback path at consent, and retains owner/CSRF/deny guards', async () => {
        const redirect = 'http://127.0.0.1:50972/callback/expected', client = await register(redirect), p = await pending(client, redirect);
        expect((await approve(p, { csrf: 'wrong' })).status).toBe(400);
        expect((await approve(p, {}, 'two@example.com')).status).toBe(400);
        const hash = OAuth.hash(p.cookie.slice((CONSENT_COOKIE + '=').length));
        const pendingRow = getDb().prepare('SELECT request_json FROM mcp_oauth_pending WHERE cookie_hash=?').get(hash) as {request_json: string};
        const original = JSON.parse(pendingRow.request_json);
        getDb().prepare('UPDATE mcp_oauth_pending SET request_json=? WHERE cookie_hash=?').run(JSON.stringify({...original, redirectUri: CLAUDE_CALLBACK}), hash);
        const changed = await approve(p); expect(changed.status).toBe(400); expect(changed.headers.get('location')).toBeNull();
        getDb().prepare('UPDATE mcp_oauth_pending SET request_json=? WHERE cookie_hash=?').run(pendingRow.request_json, hash);
        const before = getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_grants').get();
        const denied = await approve(p, {decision: 'deny'}); expect(denied.status).toBe(302);
        const target = new URL(denied.headers.get('location')!); expect(target.origin + target.pathname).toBe(redirect); expect(target.searchParams.get('error')).toBe('access_denied');
        expect(getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_grants').get()).toEqual(before);
        expect((await approve(p)).status).toBe(400);
        const next = await pending(client, redirect);
        const metadata = getDb().prepare('SELECT metadata_json FROM mcp_oauth_clients WHERE id=?').get(client) as {metadata_json: string};
        getDb().prepare('UPDATE mcp_oauth_clients SET metadata_json=? WHERE id=?').run(JSON.stringify({...JSON.parse(metadata.metadata_json), redirect_uris: ['http://127.0.0.1/callback/changed']}),client);
        expect((await approve(next)).status).toBe(400);
    });
    it('preserves exact Claude registration and does not advertise incomplete issuer-response support', async () => {
        const res = await request('/mcp/oauth/register', { client_name: 'arbitrary untrusted name', redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'none' }); expect(res.status).toBe(201);
        const metadata = await res.json(); expect(metadata.redirect_uris).toEqual([CLAUDE_CALLBACK]); expect(metadata.client_name).toBe('Claude hosted connector');
        const discovery = await (await request('/.well-known/oauth-authorization-server')).json();
        expect(discovery.authorization_response_iss_parameter_supported).toBeUndefined(); expect(discovery.client_id_metadata_document_supported).toBeUndefined();
        const management = await request('/mcp/connections', undefined, { 'X-Forwarded-Email': owner }); expect(await management.text()).toContain('My MCP connections');
    });
});
