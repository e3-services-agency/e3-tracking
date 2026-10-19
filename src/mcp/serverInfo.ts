import { createRequire } from 'node:module';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { currentHttpRights } from './httpContext';
import * as OAuth from '../backend/dal/mcp-oauth.dal';
import * as Projects from '../backend/dal/project.dal';
import { getToolInventory } from './registerTools';

export const AGENT_CONVENTIONS_REVISION = '2026-10-19.1';
export async function getServerInfo() {
  const rights = currentHttpRights();
  const inventory = getToolInventory();
  const verified = rights ? OAuth.access(rights.token, rights.resource) : undefined;
  const visible = inventory.filter(t => !rights || t.scopes.every(s => rights.scopes.includes(s)));
  return {
    server_version: createRequire(import.meta.url)('../../package.json').version,
    agent_conventions_revision: AGENT_CONVENTIONS_REVISION,
    build_revision: process.env.E3_BUILD_REVISION || 'unavailable',
    mcp_protocol_versions: SUPPORTED_PROTOCOL_VERSIONS,
    registered_tool_count: inventory.length, visible_tool_count: visible.length,
    granted_projects: verified?.grant.all_projects ? 'all' : rights ? Projects.listProjects().filter(p => rights.projectIds.includes(p.id)).map(p => ({ id: p.id, key: p.key })) : 'all',
    scopes: verified?.scopes ?? ['projects:read', 'projects:write', 'templates:read'],
    write_tools_visible: visible.some(t => t.scopes.includes('projects:write')),
    authentication: rights ? 'oauth' : 'local_unverified', actor: rights?.owner ?? null,
    token_expires_at: verified ? new Date(verified.expiresAt * 1000).toISOString() : null,
    grant_expires_at: verified ? new Date(verified.grant.expires_at * 1000).toISOString() : null,
    limits: { list_findings: { default: 10, max: 1000 }, get_history: { default: 10, max: 1000 }, list_events: { default: 100, max: 1000 }, list_use_cases: { default: 100, max: 1000 }, get_historical_validation: { default: 100, max: 100 } },
    hash_semantics: 'public_representation_including_state',
    conventions_url: 'https://github.com/e3-services-agency/e3-tracking/blob/tracking-mcp-0.5.1/docs/AGENT-CONVENTIONS.md',
  };
}
