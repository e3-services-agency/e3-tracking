import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db';
import { newId } from '../db/util';
import { InvalidGrantError, InvalidTokenError, TooManyRequestsError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
export const now = () => Math.floor(Date.now() / 1000);
export const opaque = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export interface Grant {
    id: string;
    owner: string;
    client_id: string;
    resource: string;
    scopes_json: string;
    created_at: number;
    expires_at: number;
    revoked_at: number | null;
    all_projects: number;
}
interface Token {
    token_hash: string;
    grant_id: string;
    kind: string;
    scopes_json: string;
    expires_at: number;
    consumed_at: number | null;
}
export interface Pending {
    cookie_hash: string;
    csrf_hash: string;
    owner: string;
    client_id: string | null;
    request_json: string;
    expires_at: number;
}
export function prune() {
    const db = getDb();
    db.prepare('DELETE FROM mcp_oauth_pending WHERE expires_at <= ?').run(now());
    db.prepare('DELETE FROM mcp_oauth_codes WHERE expires_at <= ?').run(now());
    db.prepare('DELETE FROM mcp_oauth_grants WHERE expires_at <= ?').run(now());
    db.prepare('DELETE FROM mcp_oauth_clients WHERE created_at < ? AND NOT EXISTS(SELECT 1 FROM mcp_oauth_grants g WHERE g.client_id=mcp_oauth_clients.id) AND NOT EXISTS(SELECT 1 FROM mcp_oauth_pending p WHERE p.client_id=mcp_oauth_clients.id)').run(now() - 30 * 86400);
    db.prepare('DELETE FROM mcp_oauth_audit WHERE id NOT IN (SELECT id FROM mcp_oauth_audit ORDER BY created_at DESC,rowid DESC LIMIT 10000)').run();
}
export function audit(owner: string, action: string, grantId?: string, tool?: string) { getDb().prepare('INSERT INTO mcp_oauth_audit(id,grant_id,owner,action,tool,created_at) VALUES(?,?,?,?,?,?)').run(newId(), grantId ?? null, owner, action, tool ?? null, now()); getDb().prepare('DELETE FROM mcp_oauth_audit WHERE rowid NOT IN (SELECT rowid FROM mcp_oauth_audit ORDER BY rowid DESC LIMIT 10000)').run(); }
export function putPending(owner: string, clientId: string | null, request: unknown) {
    prune();
    const count = (getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_pending').get() as {
        n: number;
    }).n;
    if (count >= 1000)
        throw new TooManyRequestsError('Too many pending requests.');
    const cookie = opaque(), csrf = opaque();
    getDb().prepare('INSERT INTO mcp_oauth_pending VALUES(?,?,?,?,?,?)').run(hash(cookie), hash(csrf), owner, clientId, JSON.stringify(request), now() + 600);
    return { cookie, csrf };
}
export function pending(cookie: string, owner: string) { return getDb().prepare('SELECT * FROM mcp_oauth_pending WHERE cookie_hash=? AND owner=? AND expires_at>?').get(hash(cookie), owner, now()) as Pending | undefined; }
export function consumePending(cookie: string, owner: string, csrf: string) { const p = pending(cookie, owner); if (!p || p.csrf_hash !== hash(csrf))
    throw new InvalidGrantError('Consent expired or invalid.'); getDb().prepare('DELETE FROM mcp_oauth_pending WHERE cookie_hash=?').run(p.cookie_hash); return p; }
export function liveGrant(id: string): Grant { const g = getDb().prepare('SELECT * FROM mcp_oauth_grants WHERE id=? AND revoked_at IS NULL AND expires_at>?').get(id, now()) as Grant | undefined; if (!g)
    throw new InvalidTokenError('Invalid authorization.'); return g; }
export function grantProjects(id: string): string[] { if (getDb().prepare('SELECT 1 FROM mcp_oauth_grants WHERE id=? AND all_projects=1').get(id))
    return (getDb().prepare('SELECT p.id FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.deleted_at IS NULL').all() as {
        id: string;
    }[]).map(p => p.id); return (getDb().prepare('SELECT p.id FROM mcp_oauth_projects gp JOIN projects p ON p.id=gp.project_id JOIN clients c ON c.id=p.client_id WHERE gp.grant_id=? AND p.deleted_at IS NULL').all(id) as {
    id: string;
}[]).map(p => p.id); }
export function createGrant(owner: string, clientId: string, resource: string, scopes: string[], projects: string[], redirect: string, challenge: string, allProjects = false) {
    const id = newId();
    const code = opaque();
    const db = getDb();
    if ((db.prepare('SELECT COUNT(*) n FROM mcp_oauth_grants').get() as {
        n: number;
    }).n >= 5000)
        throw new TooManyRequestsError('Connection limit reached.');
    db.prepare('INSERT INTO mcp_oauth_grants(id,owner,client_id,resource,scopes_json,created_at,expires_at,revoked_at,all_projects) VALUES(?,?,?,?,?,?,?,NULL,?)').run(id, owner, clientId, resource, JSON.stringify(scopes), now(), now() + 30 * 86400, allProjects ? 1 : 0);
    const ins = db.prepare('INSERT INTO mcp_oauth_projects VALUES(?,?)');
    for (const p of allProjects ? [] : projects)
        ins.run(id, p);
    db.prepare('INSERT INTO mcp_oauth_codes VALUES(?,?,?,?,?,NULL)').run(hash(code), id, redirect, challenge, now() + 300);
    audit(owner, 'approved', id);
    return code;
}
export function codeInfo(clientId: string, code: string) { const row = getDb().prepare('SELECT c.*,g.client_id,g.resource FROM mcp_oauth_codes c JOIN mcp_oauth_grants g ON g.id=c.grant_id WHERE c.code_hash=?').get(hash(code)) as {
    code_hash: string;
    grant_id: string;
    redirect_uri: string;
    challenge: string;
    expires_at: number;
    consumed_at: number | null;
    client_id: string;
    resource: string;
} | undefined; if (!row || row.client_id !== clientId || row.consumed_at !== null || row.expires_at <= now())
    throw new InvalidGrantError('Invalid authorization code.'); liveGrant(row.grant_id); return row; }
function issue(g: Grant, scopes: string[]) { const issuedAt = now(); getDb().prepare("DELETE FROM mcp_oauth_tokens WHERE kind='access' AND expires_at<=?").run(issuedAt); if ((getDb().prepare('SELECT COUNT(*) n FROM mcp_oauth_tokens').get() as {
    n: number;
}).n > 49998)
    throw new TooManyRequestsError('Token capacity reached.'); const accessExpiry = Math.min(issuedAt + 900, g.expires_at); const access_token = opaque(), refresh_token = opaque(); const ins = getDb().prepare('INSERT INTO mcp_oauth_tokens VALUES(?,?,?,?,?,NULL)'); ins.run(hash(access_token), g.id, 'access', JSON.stringify(scopes), accessExpiry); ins.run(hash(refresh_token), g.id, 'refresh', JSON.stringify(scopes), g.expires_at); return { access_token, refresh_token, token_type: 'Bearer' as const, expires_in: accessExpiry - issuedAt, scope: scopes.join(' ') }; }
/** RFC 6749 4.1.2: a replayed authorization code revokes the grant (and so every token issued from it). */
export function revokeIfReplayed(clientId: string, code: string) { const replay = getDb().transaction(() => { const r = getDb().prepare('SELECT c.grant_id,c.consumed_at,g.client_id FROM mcp_oauth_codes c JOIN mcp_oauth_grants g ON g.id=c.grant_id WHERE c.code_hash=?').get(hash(code)) as { grant_id: string; consumed_at: number | null; client_id: string } | undefined; if (r && r.client_id === clientId && r.consumed_at !== null) { revokeGrant(r.grant_id); return true; } return false; }).immediate(); if (replay) throw new InvalidGrantError('Invalid authorization code.'); }
export function exchangeCode(clientId: string, code: string, redirect: string | undefined, resource: string) { revokeIfReplayed(clientId, code); return getDb().transaction(() => { const c = codeInfo(clientId, code); if (c.redirect_uri !== redirect || c.resource !== resource)
    throw new InvalidGrantError('Invalid authorization binding.'); getDb().prepare('UPDATE mcp_oauth_codes SET consumed_at=? WHERE code_hash=?').run(now(), c.code_hash); const g = liveGrant(c.grant_id); return issue(g, JSON.parse(g.scopes_json)); }).immediate(); }
export function revokeGrant(id: string, owner?: string) { const db = getDb(); const result = db.prepare(`UPDATE mcp_oauth_grants SET revoked_at=? WHERE id=? ${owner ? 'AND owner=?' : ''}`).run(...(owner ? [now(), id, owner] : [now(), id])); if (result.changes) {
    const g = db.prepare('SELECT owner FROM mcp_oauth_grants WHERE id=?').get(id) as {
        owner: string;
    };
    audit(g.owner, 'revoked', id);
} return result.changes > 0; }
export function rotate(clientId: string, refresh: string, scopes: string[] | undefined, resource: string) {
    // Replay revocation must commit, so return an error sentinel instead of throwing inside the transaction.
    const result = getDb().transaction(() => {
        const t = getDb().prepare("SELECT * FROM mcp_oauth_tokens WHERE token_hash=? AND kind='refresh'").get(hash(refresh)) as Token | undefined;
        if (!t)
            return null;
        let g: Grant;
        try {
            g = liveGrant(t.grant_id);
        }
        catch {
            return null;
        }
        if (g.client_id !== clientId || g.resource !== resource)
            return null;
        if (t.consumed_at !== null) {
            revokeGrant(g.id);
            return null;
        }
        if (t.expires_at <= now())
            return null;
        const old: string[] = JSON.parse(t.scopes_json);
        const requested = scopes ?? old;
        if (requested.some(s => !old.includes(s)))
            return null;
        getDb().prepare('UPDATE mcp_oauth_tokens SET consumed_at=? WHERE token_hash=?').run(now(), t.token_hash);
        audit(g.owner, 'refreshed', g.id);
        return issue(g, requested);
    }).immediate();
    if (!result)
        throw new InvalidGrantError('Invalid refresh grant.');
    return result;
}
export function access(token: string, resource: string) { if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new InvalidTokenError('Invalid authorization.'); const t = getDb().prepare("SELECT * FROM mcp_oauth_tokens WHERE token_hash=? AND kind='access' AND expires_at>?").get(hash(token), now()) as Token | undefined; if (!t)
    throw new InvalidTokenError('Invalid authorization.'); const g = liveGrant(t.grant_id); if (g.resource !== resource)
    throw new InvalidTokenError('Invalid resource.'); return { grant: g, scopes: JSON.parse(t.scopes_json) as string[], expiresAt: t.expires_at }; }
export function revokeToken(clientId: string, token: string) { const row = getDb().prepare('SELECT g.id,g.client_id FROM mcp_oauth_tokens t JOIN mcp_oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=?').get(hash(token)) as {
    id: string;
    client_id: string;
} | undefined; if (row?.client_id === clientId)
    revokeGrant(row.id); }
export function connections(owner: string) { return getDb().prepare('SELECT g.id,c.metadata_json,g.scopes_json,g.created_at,g.expires_at,g.revoked_at,g.all_projects FROM mcp_oauth_grants g JOIN mcp_oauth_clients c ON c.id=g.client_id WHERE g.owner=? ORDER BY g.created_at DESC').all(owner) as {
    id: string;
    metadata_json: string;
    scopes_json: string;
    created_at: number;
    expires_at: number;
    revoked_at: number | null;
    all_projects: number;
}[]; }
export function remoteRun(grantId: string, projectId: string) { liveGrant(grantId); return (getDb().prepare('SELECT m.qa_run_id FROM mcp_oauth_qa_runs m JOIN qa_runs q ON q.id=m.qa_run_id WHERE m.grant_id=? AND m.project_id=? AND q.project_id=m.project_id AND q.archived=0').get(grantId, projectId) as {
    qa_run_id: string;
} | undefined)?.qa_run_id; }
export function setRemoteRun(grantId: string, projectId: string, runId: string) { liveGrant(grantId); getDb().prepare('INSERT INTO mcp_oauth_qa_runs VALUES(?,?,?) ON CONFLICT(grant_id,project_id) DO UPDATE SET qa_run_id=excluded.qa_run_id').run(grantId, projectId, runId); }
/** Reference ownership is checked before a batch can commit its first operation. */
export function ownedReference(projectId: string, kind: string, id: string) {
    const tables: Record<string, string> = { source_id: 'sources', source_ids: 'sources', bundle_ids: 'property_bundles', trigger_event_id: 'events', event_id: 'events', property_id: 'properties', variant_id: 'variants', qa_run_id: 'qa_runs', observation_id: 'observations', identifier_id: 'identifiers', mapped_catalog_id: 'catalogs', catalog_id: 'catalogs', event: 'events', trigger_event: 'events', property: 'properties', catalog: 'catalogs', use_case: 'use_cases', variant: 'variants', mapped_catalog_field_id: 'catalog_fields', definition_id: 'property_definitions' };
    const table = tables[kind];
    if (!table)
        return false;
    if (table === 'catalog_fields')
        return !!getDb().prepare('SELECT f.id FROM catalog_fields f JOIN catalogs c ON c.id=f.catalog_id WHERE c.project_id=? AND c.deleted_at IS NULL AND f.id=?').get(projectId, id);
    if (table === 'variants')
        return !!getDb().prepare('SELECT v.id FROM variants v JOIN events e ON e.id=v.event_id WHERE e.project_id=? AND e.deleted_at IS NULL AND v.id=?').get(projectId, id);
    const soft = ['events', 'properties', 'catalogs', 'property_definitions', 'use_cases', 'property_bundles'].includes(table);
    return !!getDb().prepare(`SELECT id FROM ${table} WHERE project_id=? AND id=? ${soft ? 'AND deleted_at IS NULL' : ''}`).get(projectId, id);
}
