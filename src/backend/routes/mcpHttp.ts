import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { isTrustedPeer } from '../middleware/auth';
import * as OAuth from '../dal/mcp-oauth.dal';
import { getDb } from '../db';
import { listProjects } from '../dal/project.dal';
import { mcpConfig, oauthProvider, staffPage, browserHeaders, escapeHtml, CONSENT_COOKIE, type McpHttpConfig } from '../services/mcpOAuth.service';
import { authorizeHttpTool, McpAuthorizationError, MCP_SCOPES } from '../../mcp/toolPolicy';
import { withHttpMcpContext, type HttpMcpContext } from '../../mcp/httpContext';
import { registerTools } from '../../mcp/registerTools';
const exactPaths = new Set(['/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/mcp/oauth/register', '/mcp/oauth/token', '/mcp/oauth/revoke', '/mcp/oauth/authorize', '/mcp/oauth/consent', '/mcp/connections', '/api/mcp/connections']);
// claude.ai calls these three server-to-server/CORS endpoints; staff pages accept only the canonical origin.
const claudeOriginPaths = new Set(['/mcp/oauth/token', '/mcp/oauth/register', '/mcp/oauth/revoke']);
const staffPaths = new Set(['/mcp/oauth/authorize', '/mcp/oauth/consent', '/mcp/connections', '/api/mcp/connections']);
const cookie = (req: Request, name: string) => { const values = (req.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(name + '=')); return values.length === 1 ? values[0].slice(name.length + 1) : ''; };
function deny(res: Response, status: number, error: string) { res.status(status).json({ error }); }
export function createMcpHttpRouter(testConfig?: McpHttpConfig) {
    const router = express.Router({ caseSensitive: true, strict: true });
    const csrfSecret = randomBytes(32);
    const mgmtCsrf = (owner: string) => createHmac('sha256', csrfSecret).update('mgmt:' + owner).digest('base64url');
    const csrfOk = (owner: string, given: unknown) => typeof given === 'string' && given.length === 43 && timingSafeEqual(Buffer.from(given), Buffer.from(mgmtCsrf(owner)));
    // Behind Caddy the socket peer is the proxy: use the forwarded client address only when the peer is trusted.
    const clientAddress = (req: Request) => { if (isTrustedPeer(req)) { const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map(v => v.trim()).filter(Boolean); if (xff.length)
        return xff[xff.length - 1]; } return req.socket.remoteAddress ?? 'unknown'; };
    const config = testConfig ?? mcpConfig();
    if (testConfig && process.env.NODE_ENV !== 'test')
        throw new Error('Test MCP configuration is test-only.');
    const hits = new Map<string, {
        start: number;
        n: number;
    }>();
    router.use((req: Request, res: Response, next: NextFunction) => {
        const lower = req.path.toLowerCase();
        if (!lower.startsWith('/mcp') && !lower.startsWith('/api/mcp/connections') && !lower.startsWith('/.well-known/oauth-')) {
            next();
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (!config || !exactPaths.has(req.path)) {
            deny(res, 404, 'not_found');
            return;
        }
        const host = req.headers.host;
        const origin = req.headers.origin;
        if (host !== new URL(config.origin).host || (origin && origin !== config.origin && !(origin === 'https://claude.ai' && claudeOriginPaths.has(req.path)))) {
            deny(res, 403, 'invalid_request');
            return;
        }
        const time = OAuth.now();
        for (const [key, value] of hits)
            if (time - value.start >= 60)
                hits.delete(key);
        const bearer = req.path === '/mcp' && req.headers.authorization ? ':' + createHash('sha256').update(req.headers.authorization).digest('hex').slice(0, 16) : '';
        const key = clientAddress(req) + ':' + req.path + bearer;
        const entry = hits.get(key) ?? { start: time, n: 0 };
        entry.n++;
        if (hits.size >= 2000 && !hits.has(key) || entry.n > (req.path.endsWith('/register') ? 10 : 120)) {
            deny(res, 429, 'rate_limited');
            return;
        }
        hits.set(key, entry);
        const timer = setTimeout(() => { if (!res.headersSent)
            deny(res, 408, 'request_timeout'); req.destroy(); }, 60000);
        timer.unref();
        res.once('close', () => clearTimeout(timer));
        res.once('finish', () => clearTimeout(timer));
        if (staffPaths.has(req.path)) {
            const email = req.headers['x-forwarded-email'];
            if (process.env.AUTH_MODE !== 'proxy' || !isTrustedPeer(req) || typeof email !== 'string' || !/^[^\s@,<>]+@[^\s@,<>]+$/.test(email.trim())) {
                deny(res, 401, 'staff_authentication_required');
                return;
            }
            // Domain comparison is explicit; no shared identity cookie or caller actor is accepted.
            const normalized = email.trim().toLowerCase();
            if (normalized.split('@').length !== 2 || normalized.split('@')[1] !== config.domain) {
                deny(res, 401, 'staff_authentication_required');
                return;
            }
            res.locals.mcpStaff = normalized;
        }
        else {
            for (const name of ['x-forwarded-email', 'x-forwarded-user', 'x-forwarded-preferred-username', 'x-auth-request-access-token', 'x-forwarded-access-token', 'cookie'])
                delete req.headers[name];
            if (req.path !== '/mcp')
                delete req.headers.authorization;
        }
        next();
    });
    if (!config)
        return router;
    const provider = oauthProvider(config);
    const resourceMetadata = config.origin + '/.well-known/oauth-protected-resource/mcp';
    router.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json({ resource: config.resource, authorization_servers: [config.origin], scopes_supported: [...MCP_SCOPES], bearer_methods_supported: ['header'] }));
    router.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({ issuer: config.origin, authorization_endpoint: config.origin + '/mcp/oauth/authorize', token_endpoint: config.origin + '/mcp/oauth/token', registration_endpoint: config.origin + '/mcp/oauth/register', revocation_endpoint: config.origin + '/mcp/oauth/revoke', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: MCP_SCOPES }));
    router.use('/mcp/oauth/register', express.json({ limit: '8kb' }), clientRegistrationHandler({ clientsStore: provider.clientsStore, rateLimit: false }));
    router.use('/mcp/oauth/token', express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 }), tokenHandler({ provider, rateLimit: false }));
    router.use('/mcp/oauth/revoke', express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 }), revocationHandler({ provider, rateLimit: false }));
    router.use('/mcp/oauth/authorize', express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 }), authorizationHandler({ provider, rateLimit: false }));
    router.post('/mcp/oauth/consent', express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 150 }), (req, res) => {
        if (req.headers.origin !== config.origin) {
            deny(res, 403, 'invalid_consent');
            return;
        }
        try {
            const owner = res.locals.mcpStaff as string;
            const rawCookie = cookie(req, CONSENT_COOKIE);
            const csrf = req.body.csrf;
            if (typeof csrf !== 'string' || !['approve', 'deny'].includes(req.body.decision))
                throw new Error();
            const result = getDb().transaction(() => {
                const pending = OAuth.pending(rawCookie, owner);
                if (!pending || !pending.client_id)
                    throw new Error();
                const params = JSON.parse(pending.request_json) as {
                    redirectUri: string;
                    state?: string;
                    codeChallenge: string;
                    resource: string;
                    scopes: string[];
                };
                if (params.redirectUri !== 'https://claude.ai/api/mcp/auth_callback' || params.resource !== config.resource)
                    throw new Error();
                const url = new URL(params.redirectUri);
                if (params.state)
                    url.searchParams.set('state', params.state);
                if (req.body.decision === 'deny') {
                    OAuth.consumePending(rawCookie, owner, csrf);
                    url.searchParams.set('error', 'access_denied');
                    return url.href;
                }
                const ids = [...new Set(typeof req.body.project === 'string' ? [req.body.project] : Array.isArray(req.body.project) ? req.body.project : [])];
                const live = new Set(listProjects().map(p => p.id));
                if (ids.some(id => typeof id !== 'string' || !live.has(id)))
                    throw new Error();
                const scopes: string[] = [];
                if (params.scopes.includes('projects:read')) {
                    if (!ids.length)
                        throw new Error();
                    scopes.push('projects:read');
                }
                if (req.body.write === 'yes') {
                    if (!params.scopes.includes('projects:write'))
                        throw new Error();
                    scopes.push('projects:write');
                }
                if (req.body.templates === 'yes') {
                    if (!params.scopes.includes('templates:read'))
                        throw new Error();
                    scopes.push('templates:read');
                }
                if (!scopes.length || !params.scopes.includes('projects:read') && ids.length)
                    throw new Error();
                OAuth.consumePending(rawCookie, owner, csrf);
                const code = OAuth.createGrant(owner, pending.client_id, config.resource, scopes, ids as string[], params.redirectUri, params.codeChallenge);
                url.searchParams.set('code', code);
                return url.href;
            }).immediate();
            res.clearCookie(CONSENT_COOKIE, { path: '/mcp/oauth', secure: true, httpOnly: true, sameSite: 'lax' });
            res.redirect(302, result);
        }
        catch {
            deny(res, 400, 'invalid_consent');
        }
    });
    const safeConnections = (owner: string) => OAuth.connections(owner).map(g => ({ id: g.id, client_name: JSON.parse(g.metadata_json).client_name, scopes: JSON.parse(g.scopes_json), created_at: g.created_at, expires_at: g.expires_at, revoked: g.revoked_at !== null, projects: listProjects().filter(p => OAuth.grantProjects(g.id).includes(p.id)).map(p => ({ id: p.id, name: p.name })) }));
    router.get('/api/mcp/connections', (req, res) => { const owner = res.locals.mcpStaff as string; res.json({ connections: safeConnections(owner), csrf: mgmtCsrf(owner) }); });
    router.post('/api/mcp/connections', express.json({ limit: '8kb' }), (req, res) => {
        if (req.headers.origin !== config.origin) {
            deny(res, 403, 'invalid_request');
            return;
        }
        try {
            if (typeof req.body.id !== 'string' || typeof req.body.csrf !== 'string')
                throw new Error();
            if (!csrfOk(res.locals.mcpStaff, req.body.csrf))
                throw new Error();
            const result = OAuth.revokeGrant(req.body.id, res.locals.mcpStaff);
            if (!result) {
                deny(res, 404, 'not_found');
                return;
            }
            res.json({ revoked: true });
        }
        catch {
            deny(res, 403, 'invalid_request');
        }
    });
    router.get('/mcp/connections', (req, res) => {
        const owner = res.locals.mcpStaff as string;
        const p = { csrf: mgmtCsrf(owner) };
        browserHeaders(res);
        res.type('html').send(staffPage('My Claude connections', `<p>Connections owned by ${escapeHtml(owner)}. Revocation stops every access and refresh token immediately. Project backups never contain connector credentials.</p>${safeConnections(owner).map(g => `<section><h2>${escapeHtml(g.client_name)}</h2><p>${escapeHtml(g.projects.map(p => p.name).join(', '))} / ${escapeHtml(g.scopes.join(', '))}</p><p>${g.revoked ? 'Revoked' : 'Expires ' + new Date(g.expires_at * 1000).toISOString()}</p>${g.revoked ? '' : `<form method="post" action="/mcp/connections"><input type="hidden" name="csrf" value="${p.csrf}"><input type="hidden" name="id" value="${g.id}"><button>Revoke connection</button></form>`}</section>`).join('') || '<p>No connections yet.</p>'}`));
    });
    router.post('/mcp/connections', express.urlencoded({ extended: false, limit: '8kb' }), (req, res) => {
        if (req.headers.origin !== config.origin) {
            deny(res, 403, 'invalid_request');
            return;
        }
        try {
            if (typeof req.body.id !== 'string' || typeof req.body.csrf !== 'string')
                throw new Error();
            if (!csrfOk(res.locals.mcpStaff, req.body.csrf) || !OAuth.revokeGrant(req.body.id, res.locals.mcpStaff))
                throw new Error();
            res.redirect(303, '/mcp/connections');
        }
        catch {
            deny(res, 403, 'invalid_request');
        }
    });
    router.all('/mcp', (req, res, next) => { if (!req.headers.authorization) {
        res.setHeader('WWW-Authenticate', `Bearer scope="projects:read", resource_metadata="${resourceMetadata}"`);
        deny(res, 401, 'invalid_token');
        return;
    } next(); }, requireBearerAuth({ verifier: provider, expectedResource: new URL(config.resource), resourceMetadataUrl: resourceMetadata }), express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            deny(res, 405, 'method_not_allowed');
            return;
        }
        if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
            deny(res, 400, 'invalid_request');
            return;
        }
        const auth = req.auth!;
        const context: HttpMcpContext = { token: auth.token, resource: config.resource, grantId: String(auth.extra?.grantId), owner: String(auth.extra?.owner), scopes: auth.scopes };
        try {
            await withHttpMcpContext(context, async () => {
                if (req.body.method === 'tools/call')
                    authorizeHttpTool(req.body.params?.name, req.body.params?.arguments ?? {});
                else if (!['initialize', 'notifications/initialized', 'tools/list', 'ping'].includes(req.body.method)) {
                    deny(res, 400, 'unsupported_method');
                    return;
                }
                const server = new McpServer({ name: 'e3-tracking', version: '0.5.0' });
                registerTools(server);
                const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
                let closed = false;
                const close = () => { if (closed)
                    return; closed = true; void transport.close(); void server.close(); };
                res.once('close', close);
                res.once('finish', close);
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
            });
        }
        catch (error) {
            if (res.headersSent)
                return;
            if (error instanceof McpAuthorizationError) {
                if (error.scopes) {
                    res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${error.scopes.join(' ')}", resource_metadata="${resourceMetadata}"`);
                }
                deny(res, 403, 'access_denied');
            }
            else {
                res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", resource_metadata="${resourceMetadata}"`);
                deny(res, 401, 'invalid_token');
            }
        }
    });
    router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => { if (!res.headersSent)
        deny(res, (err as {
            status?: number;
        })?.status === 413 ? 413 : 400, 'invalid_request'); });
    router.all(['/mcp*', '/api/mcp/connections*', '/.well-known/oauth-*'], (_req, res) => deny(res, 405, 'method_not_allowed'));
    return router;
}
