import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidClientMetadataError, InvalidRequestError, InvalidScopeError, TooManyRequestsError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import * as OAuth from '../dal/mcp-oauth.dal';
import { getDb } from '../db';
import { newId } from '../db/util';
import { listProjects } from '../dal/project.dal';
import { MCP_SCOPES } from '../../mcp/toolPolicy';
export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
export const CONSENT_COOKIE = '__Secure-e3-mcp-consent';
export const MANAGEMENT_COOKIE = '__Secure-e3-mcp-management';
export interface McpHttpConfig {
    origin: string;
    resource: string;
    domain: string;
}
export function mcpConfig(): McpHttpConfig | null {
    if (process.env.E3_MCP_HTTP_ENABLED !== '1')
        return null;
    const raw = process.env.E3_PUBLIC_ORIGIN?.trim() ?? '';
    const domain = process.env.WORKSPACE_DOMAIN?.trim().toLowerCase() ?? '';
    let url: URL;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error('HTTPS MCP requires E3_PUBLIC_ORIGIN.');
    }
    if (url.protocol !== 'https:' || url.origin !== raw || url.username || url.password || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain))
        throw new Error('HTTPS MCP requires an exact HTTPS public origin and Workspace domain.');
    if (process.env.NODE_ENV === 'production' && process.env.AUTH_MODE !== 'proxy')
        throw new Error('HTTPS MCP production requires proxy staff authentication.');
    return { origin: raw, resource: raw + '/mcp', domain };
}
export const escapeHtml = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function staffPage(title: string, body: string) { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | E3 Tracking</title><style>body{font:16px system-ui;max-width:850px;margin:3rem auto;padding:1rem;color:#172038;background:#f8fafc}main{background:white;border:1px solid #cbd5e1;border-radius:12px;padding:2rem}label{display:block;margin:.8rem 0}button{padding:.6rem 1rem;margin:.4rem}a{color:#006bda}fieldset{margin:1rem 0}small{color:#475569}</style></head><body><main><a href="/tracking-plan/">E3 Tracking</a><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`; }
export function browserHeaders(res: Response) { res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://claude.ai/api/mcp/auth_callback; frame-ancestors 'none'; base-uri 'none'"); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); }
export function oauthProvider(config: McpHttpConfig): OAuthServerProvider {
    const clientsStore = {
        getClient(id: string) { const row = getDb().prepare('SELECT metadata_json FROM mcp_oauth_clients WHERE id=?').get(id) as {
            metadata_json: string;
        } | undefined; return row ? JSON.parse(row.metadata_json) as OAuthClientInformationFull : undefined; },
        registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>): OAuthClientInformationFull {
            if (client.token_endpoint_auth_method !== 'none' || client.redirect_uris.length !== 1 || client.redirect_uris[0] !== CLAUDE_CALLBACK || client.response_types?.some(t => t !== 'code') || client.grant_types?.some(t => !['authorization_code', 'refresh_token'].includes(t)) || client.client_name && client.client_name.length > 100 || client.scope?.split(' ').some(s => !(MCP_SCOPES as readonly string[]).includes(s)))
                throw new InvalidClientMetadataError('Only public Claude hosted clients are supported.');
            if (client.client_uri || client.logo_uri || client.tos_uri || client.policy_uri || client.jwks_uri || client.jwks)
                throw new InvalidClientMetadataError('Remote client metadata is not supported.');
            OAuth.prune();
            if ((getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_clients').get() as {
                n: number;
            }).n >= 500)
                throw new TooManyRequestsError('Registration capacity reached.');
            const record: OAuthClientInformationFull = { client_id: newId(), client_id_issued_at: OAuth.now(), client_name: 'Claude hosted connector', redirect_uris: [CLAUDE_CALLBACK], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
            getDb().prepare('INSERT INTO mcp_oauth_clients VALUES(?,?,?)').run(record.client_id, JSON.stringify(record), OAuth.now());
            return record;
        }
    };
    return {
        clientsStore,
        async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
            const owner = res.locals.mcpStaff as string | undefined;
            if (!owner)
                throw new InvalidRequestError('Staff authentication required.');
            if (params.redirectUri !== CLAUDE_CALLBACK || params.resource?.href !== config.resource || !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) || params.state && params.state.length > 512)
                throw new InvalidRequestError('Invalid authorization binding.');
            const requested = [...new Set(params.scopes?.length ? params.scopes : ['projects:read'])];
            if (requested.some(s => !(MCP_SCOPES as readonly string[]).includes(s)) || requested.includes('projects:write') && !requested.includes('projects:read'))
                throw new InvalidScopeError('Unsupported scopes.');
            const request = { ...params, resource: config.resource, scopes: requested };
            const pending = OAuth.putPending(owner, client.client_id, request);
            res.cookie(CONSENT_COOKIE, pending.cookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/mcp/oauth', maxAge: 600000 });
            browserHeaders(res);
            const projects = requested.includes('projects:read') ? listProjects() : [];
            res.type('html').send(staffPage('Connect Claude to E3 Tracking', `<p>Signed in as <strong>${escapeHtml(owner)}</strong>. This request uses the hosted Claude callback at <strong>claude.ai/api/mcp/auth_callback</strong>.</p><p>Choose the projects this connection may read. New projects are never added automatically. You can revoke this connection later.</p><form method="post" action="/mcp/oauth/consent"><input type="hidden" name="csrf" value="${pending.csrf}"><fieldset><legend>Projects</legend>${projects.map(p => `<label><input type="checkbox" name="project" value="${p.id}"> ${escapeHtml(p.client?.name ?? '')} / ${escapeHtml(p.name)}</label>`).join('')}</fieldset>${requested.includes('projects:write') ? '<label><input type="checkbox" name="write" value="yes"> Allow changes, observation submissions and comparisons for these projects (including dry runs).</label>' : '<p>This request is read-only. Changes require a new request and your explicit approval.</p>'}${requested.includes('templates:read') ? '<label><input type="checkbox" name="templates" value="yes"> Allow reading the global use case template library.</label>' : ''}<button type="submit" name="decision" value="approve">Approve connection</button><button type="submit" name="decision" value="deny">Deny</button></form><p><a href="/mcp/connections">Manage my connections</a></p>`));
        },
        async challengeForAuthorizationCode(client, code) { return OAuth.codeInfo(client.client_id, code).challenge; },
        async exchangeAuthorizationCode(client, code, _verifier, redirect, resource) { if (resource?.href !== config.resource)
            throw new InvalidRequestError('The exact MCP resource is required.'); return OAuth.exchangeCode(client.client_id, code, redirect, resource.href); },
        async exchangeRefreshToken(client, refresh, scopes, resource) { if (resource?.href !== config.resource)
            throw new InvalidRequestError('The exact MCP resource is required.'); return OAuth.rotate(client.client_id, refresh, scopes, resource.href); },
        async verifyAccessToken(token) { const valid = OAuth.access(token, config.resource); return { token, clientId: valid.grant.client_id, scopes: valid.scopes, expiresAt: valid.expiresAt, resource: new URL(valid.grant.resource), extra: { grantId: valid.grant.id, owner: valid.grant.owner } }; },
        async revokeToken(client, request) { OAuth.revokeToken(client.client_id, request.token); }
    };
}
