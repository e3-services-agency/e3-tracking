import { AsyncLocalStorage } from 'node:async_hooks';
import * as OAuth from '../backend/dal/mcp-oauth.dal';
export interface HttpMcpContext {
    token: string;
    resource: string;
    grantId: string;
    owner: string;
    scopes: string[];
}
const contexts = new AsyncLocalStorage<HttpMcpContext>();
export const httpMcpContext = () => contexts.getStore();
export const withHttpMcpContext = <T>(context: HttpMcpContext, fn: () => T): T => contexts.run(context, fn);
export function currentHttpRights() { const context = httpMcpContext(); if (!context)
    return undefined; const verified = OAuth.access(context.token, context.resource); if (verified.grant.id !== context.grantId)
    throw new Error('Invalid authorization.'); return { ...context, owner: verified.grant.owner, scopes: verified.scopes, projectIds: OAuth.grantProjects(context.grantId) }; }
