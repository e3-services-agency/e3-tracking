import { currentHttpRights } from './httpContext';
import * as ProjectDAL from '../backend/dal/project.dal';
import { ownedReference } from '../backend/dal/mcp-oauth.dal';
import { WRITE_TOOLS } from './tools/writeTools';
import { parseArgs } from './tools/writeCore';
export const MCP_SCOPES = ['projects:read', 'projects:write', 'templates:read'] as const;
const read = ['list_projects', 'list_events', 'get_event_card', 'get_expected_payload', 'list_use_cases', 'get_use_case', 'list_findings', 'get_coverage_grid', 'get_tracking_document', 'get_history'];
const write = ['submit_observation', 'submit_observations_batch', 'finish_qa_run', 'run_comparison', 'update_observation', 'delete_observation', 'delete_qa_run', ...WRITE_TOOLS.map(t => t.name), 'batch_apply'];
export const TOOL_POLICY: Readonly<Record<string, readonly string[]>> = Object.freeze(Object.fromEntries([...read.map(n => [n, ['projects:read']]), ...write.map(n => [n, ['projects:read', 'projects:write']]), ['list_use_case_templates', ['templates:read']], ['instantiate_use_case_template', ['projects:read', 'projects:write', 'templates:read']]]));
export class McpAuthorizationError extends Error {
    readonly code = 'MCP_FORBIDDEN';
    constructor(public readonly scopes?: readonly string[]) { super('This connection is not authorized for that request.'); }
}
export function remoteProject(projectKey: unknown) {
    const rights = currentHttpRights();
    if (!rights)
        return undefined;
    const allowed = ProjectDAL.listProjects().filter(p => rights.projectIds.includes(p.id));
    const project = typeof projectKey === 'string' && projectKey.trim() ? allowed.find(p => p.key === projectKey.trim()) : allowed.length === 1 ? allowed[0] : undefined;
    if (!project)
        throw new McpAuthorizationError();
    return project;
}
const referenceKeys = new Set(['bundle_ids', 'source_id', 'source_ids', 'trigger_event_id', 'event_id', 'property_id', 'variant_id', 'qa_run_id', 'observation_id', 'identifier_id', 'mapped_catalog_id', 'catalog_id', 'mapped_catalog_field_id', 'definition_id']);
function references(projectId: string, args: Record<string, unknown>) {
    for (const [key, value] of Object.entries(args)) {
        if (key === 'project_id')
            throw new McpAuthorizationError();
        if (['event', 'trigger_event', 'property', 'catalog', 'use_case', 'variant'].includes(key) && typeof value === 'string' && /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i.test(value) && !ownedReference(projectId, key, value))
            throw new McpAuthorizationError();
        if (referenceKeys.has(key) && value !== null && value !== undefined) {
            const ids = Array.isArray(value) ? value : [value];
            if (ids.some(id => typeof id !== 'string' || !ownedReference(projectId, key, id)))
                throw new McpAuthorizationError();
        }
    }
    if (Array.isArray(args.mappings))
        for (const map of args.mappings) {
            if (!map || typeof map !== 'object' || Array.isArray(map))
                throw new McpAuthorizationError();
            references(projectId, map as Record<string, unknown>);
        }
    if (args.scope && typeof args.scope === 'object' && !Array.isArray(args.scope))
        references(projectId, args.scope as Record<string, unknown>);
}
/** Called both before SDK dispatch and immediately before each registered tool handler. */
export function authorizeHttpTool(name: string, input: unknown) {
    const rights = currentHttpRights();
    if (!rights)
        return;
    const scopes = TOOL_POLICY[name];
    if (!scopes)
        throw new McpAuthorizationError();
    if (scopes.some(s => !rights.scopes.includes(s)))
        throw new McpAuthorizationError(scopes);
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new McpAuthorizationError();
    const args = input as Record<string, unknown>;
    if (name === 'list_projects' || name === 'list_use_case_templates')
        return;
    const project = remoteProject(args.project_key)!;
    references(project.id, args);
    if (name === 'batch_apply') {
        if (!Array.isArray(args.operations) || args.operations.length > 50)
            throw new McpAuthorizationError();
        for (const raw of args.operations) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw))
                throw new McpAuthorizationError();
            const { op, ...nested } = raw as Record<string, unknown>;
            const tool = WRITE_TOOLS.find(t => t.name === op);
            if (!tool)
                throw new McpAuthorizationError();
            if (nested.project_key !== undefined && remoteProject(nested.project_key)!.id !== project.id)
                throw new McpAuthorizationError();
            try {
                parseArgs(tool, nested);
            }
            catch {
                throw new McpAuthorizationError();
            }
            references(project.id, nested);
        }
    }
}
