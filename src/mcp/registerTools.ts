import { audit as auditMcp } from '../backend/dal/mcp-oauth.dal';
/**
 * Registers every MCP tool on a `McpServer` (T-2-10, plan "MCP server", D-11/D-19/D-33). Each tool
 * handler in `src/mcp/tools/*.ts` is a plain async `(input) => JSON-serialisable` function -- this
 * module is the only place that knows about the `@modelcontextprotocol/sdk` wire shape
 * (`{content: [...]}`), so an HTTP transport (a later phase) can mount the same handlers behind a
 * different registration function without touching `src/mcp/tools/*.ts`.
 *
 * Errors: a handler throws a backend error (`NotFoundError`, `BadRequestError`, ...) or an
 * `McpToolError` (`errors.ts`, e.g. `PROJECT_NOT_FOUND`) -- every one of those carries a `code`
 * string (D-25 Q7, `routeErrors.ts`'s same convention), so `callTool` reports `{isError: true,
 * content: [{type: 'text', text: "<code>: <message>"}]}` instead of letting the SDK turn an
 * uncaught throw into an opaque JSON-RPC error with no code an agent could branch on. Anything else
 * (a real bug) is logged to stderr (`log.ts`) and reported the same way rather than crashing the
 * whole stdio process for every other in-flight tool call.
 *
 * T-3-02 (D-44): every tool call runs inside `runWithActor({actor: input.agent_name ?? 'MCP agent',
 * source: 'mcp'})`, so any definition-mutating DAL write a handler makes is attributed to the
 * calling agent in `change_log` -- today's write tools (`submit_observation`,
 * `submit_observations_batch`, `finish_qa_run`) only touch QA evidence, which D-44 excludes from the
 * log, so this has no visible effect yet, but every future write tool inherits it for free.
 */
import { httpMcpContext, currentHttpRights } from './httpContext';
import { authorizeHttpTool, TOOL_POLICY } from './toolPolicy';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';
import { log } from './log';
import { runWithActor } from '../backend/context/actor';
import { listProjects } from './tools/projects';
import { listEvents, getEventCard, getExpectedPayload } from './tools/events';
import { listUseCases, getUseCase, listUseCaseTemplates, instantiateUseCaseTemplate } from './tools/useCases';
import { listFindings, summarizeFindings, getFinding } from './tools/findings';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './readOptions';
import { getCoverageGrid } from './tools/coverage';
import { getTrackingDocument } from './tools/trackingDocument';
import { submitObservation, submitObservationsBatch, updateObservation, deleteObservation } from './tools/observations';
import { runComparison } from './tools/comparison';
import { finishQaRun, deleteQaRun } from './tools/qaRuns';
import { getHistory } from './tools/history';
import { WRITE_TOOLS, writeHandler, writeCommonShape, batchApply } from './tools/writeTools';
import { previewHistoricalFileValidation, applyHistoricalFileValidation, getHistoricalFileValidation } from './tools/historicalValidation';
import { historicalManifestSchema } from '../backend/services/historicalValidation.service';
import { getServerInfo } from './serverInfo';
import { withIdempotency,currentWriteRequest } from './idempotency';
import {newId} from '../backend/db/util';
import { addReference, referenceShape } from './tools/references';
import { safeErrorMessage } from './publicErrors';

type ToolHandler<I> = (input: I) => Promise<unknown>;

function register<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  handler: ToolHandler<z.infer<z.ZodObject<Shape>>>
): void {
  // The SDK's `registerTool` callback type is derived from `Shape` through several generic layers
  // that TypeScript cannot re-verify against our own `handler`'s inferred input; the runtime shape
  // (an object matching `inputSchema`) is exactly right, so this one cast is narrower and safer
  // than loosening `register`'s own signature for every call site.
  if (httpMcpContext() && !TOOL_POLICY[name]) throw new Error('HTTP tool policy missing.');
  const callback = async (args: z.infer<z.ZodObject<Shape>>) => {
    try {
      authorizeHttpTool(name,args);
      const httpContext=httpMcpContext();
      if(httpContext)auditMcp(httpContext.owner,'tool_called',httpContext.grantId,name);
      // T-3-02: `agent_name`, when the tool's own input shape carries it, names the actor; every
      // tool call otherwise falls back to the generic 'MCP agent' label rather than 'system' (the
      // context's own default), so a change_log row from an MCP write is always recognisable as one
      // even when the calling agent didn't identify itself.
      const agentName = (args as { agent_name?: unknown }).agent_name;
      const actor = currentHttpRights()?.owner ?? 'local MCP user';
      const agent = typeof agentName === 'string' && agentName.trim() ? agentName.trim() : null;
      const writing = (TOOL_POLICY[name] ?? []).includes('projects:write');
      const { actor: _untrustedActor, ...trustedArgs } = args as Record<string, unknown>;
      const execute = async () => {
        const batchId=writing?(currentWriteRequest()?.batch_id??newId()):undefined;
        const value = await runWithActor({ actor, agent, source: 'mcp',batch_id:batchId }, () => handler(trustedArgs as typeof args));
        if(writing&&value&&typeof value==='object'){const result=value as Record<string,unknown>;return {...result,actor,agent,batch_id:result.batch_id??(result.dry_run===true?null:batchId)};}
        return value;
      };
      const result = writing ? await withIdempotency(name, trustedArgs, execute) : await execute();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'INTERNAL_ERROR';
      let message = err instanceof Error ? err.message : String(err);
      // T-5-01 polish: DAL errors carry optional `details` (409 detail string, 400 {property_id,value,allowed}).
      const details = (err as { details?: unknown })?.details;
      if (details !== undefined && details !== null && details !== '') {
        message += ` (details: ${typeof details === 'string' ? details : JSON.stringify(details)})`;
      }
      if(code==='STALE_HASH')return {isError:true,content:[{type:'text' as const,text:`${code}: ${safeErrorMessage(code)}`}],structuredContent:{error:{code,status:409,message:safeErrorMessage(code)}}};
      if (httpMcpContext()) return {isError:true,content:[{type:'text' as const,text:`${code}: ${safeErrorMessage(code)}`}]};
      if (code === 'INTERNAL_ERROR') log.error(`tool ${name} failed unexpectedly`, err);
      return { isError: true, content: [{ type: 'text' as const, text: `${code}: ${message}` }] };
    }
  };
  const metadata = { agent_name: z.string().trim().min(1).max(100).optional(), actor: z.unknown().optional(), idempotency_key: z.string().min(1).max(200).optional() };
  const writing = (TOOL_POLICY[name] ?? []).includes('projects:write');
  const schema = writing ? inputSchema instanceof z.ZodObject ? inputSchema.extend(metadata) : { ...inputSchema, ...metadata } : inputSchema;
  const registered = server.registerTool(name, { description, inputSchema: schema }, callback as Parameters<McpServer['registerTool']>[2]);
  // A remote grant only sees the tools its scopes allow (tools/list); calls are still preauthorized.
  const http = httpMcpContext();
  if (http && !(TOOL_POLICY[name] ?? []).every((s) => http.scopes.includes(s))) registered?.disable?.();
}

const projectKeyShape = { project_key: z.string().optional() };
const conditionalShape = { if_hash: z.string().regex(/^[a-f0-9]{64}$/).optional().describe('Hash from the same object/page; a match returns unchanged, id and hash only.') };
const listShape = {
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional().describe(`Page size; default ${DEFAULT_PAGE_SIZE}.`),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  fields: z.array(z.string()).optional().describe('Exact public field selection; overrides include. Unknown fields are errors.'),
  include: z.enum(['detail', 'body']).optional().describe('Include full public fields. Lists still return a page envelope.'),
};
const inventoryListShape = { ...listShape, limit: listShape.limit.describe('Page size; default 100, maximum 1000.') };
const findingsFilterShape = {
  ...projectKeyShape,
  event: z.string().optional(), property: z.string().optional().describe('Property name or ID; use ID for ambiguous names.'),
  severity: z.string().optional(), priority: z.string().optional().describe('Comma-separated priorities, e.g. P1,P2.'),
  comparison: z.string().optional(), kind: z.string().optional(), status: z.string().optional().describe('Default open; all includes resolved findings.'), qa_run_id: z.string().optional(),
  first_seen_from: z.string().optional(), first_seen_to: z.string().optional(),
  last_seen_from: z.string().optional(), last_seen_to: z.string().optional(),
};

export function registerTools(server: McpServer): void {
  register(server, 'get_server_info', 'Read current server/contract version, registered and visible tool counts, granted projects/scopes, paging limits and expiry timestamps. Every authenticated grant; no secrets.', {}, getServerInfo);
  register(server, 'add_reference', 'Attach a scoped pinned Cortex pointer to a finding/use case. Dry run by default; deduplicated, unverified pointers only. Never changes status, priority, certification or external authority.', { ...projectKeyShape, ...referenceShape }, addReference);
  register(server, 'list_projects', 'Projects grouped by client.', {}, listProjects);
  register(server, 'preview_historical_validation', 'Read-only preview of staged historical CSV sources against a frozen native definition/rule revision. Takes opaque project-scoped source IDs, never raw CSV or fetched URLs. Returns exact confirmation hash and limitations; creates no observations.',
    { ...projectKeyShape, manifest: historicalManifestSchema }, previewHistoricalFileValidation);
  register(server, 'apply_historical_validation', 'After reviewing the exact preview, persist one immutable numbered historical-file report. Requires confirmed=true and payload_hash. No runtime observations, findings, certification or approvals are changed; exact replay is idempotent.',
    { ...projectKeyShape, manifest: historicalManifestSchema, payload_hash: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.boolean() }, applyHistoricalFileValidation);
  register(server, 'get_historical_validation', 'Read an immutable historical-file report with bounded privacy-safe record/column diagnostics and current source-byte availability; limit at most100. This is separate from observed-event QA.',
    { ...projectKeyShape, ...conditionalShape, report_id: z.string().uuid(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() }, getHistoricalFileValidation);

  register(
    server,
    'list_events',
    'Compact event pages (default: custom class, 100 rows). Returns items,total,returned,next_offset,truncated,result_marker; include=detail adds certification, variants and property lists.',
    { ...projectKeyShape, ...inventoryListShape, class: z.string().optional(), status: z.string().optional() },
    listEvents
  );

  register(
    server,
    'get_event_card',
    'The full EventCard for one event (name or id): definition, variants, rules, coverage, findings, codegen.',
    { ...projectKeyShape, ...conditionalShape, event: z.string() },
    getEventCard
  );

  register(
    server,
    'get_expected_payload',
    'The expected payload shape for an event (optionally scoped to one variant): required/optional keys, discriminators, contexts, item schemas, rules, and an example.',
    { ...projectKeyShape, event: z.string(), variant: z.string().optional() },
    getExpectedPayload
  );

  register(server, 'list_use_cases', 'Compact use-case pages (100 rows by default), with IDs and requirement counts. Returns items,total,returned,next_offset,truncated,result_marker; include=detail adds public narrative and description.', { ...projectKeyShape, ...inventoryListShape }, listUseCases);

  register(
    server,
    'get_use_case',
    'One use case (code or id) with its requirements resolved to names/levels and its narrative.',
    { ...projectKeyShape, ...conditionalShape, use_case: z.string() },
    getUseCase
  );

  register(
    server,
    'list_findings',
    'Compact finding pages, highest priority first (default open, 10 rows). Returns items,total,next_offset,truncated. IDs, sequences, fingerprints and dates preserved; include=detail or fields adds evidence/messages/reasons. Use summarize_findings for counts.',
    { ...findingsFilterShape, ...listShape },
    listFindings
  );
  register(server, 'summarize_findings', 'Counts by status, priority, severity, comparison, kind and event ID, newest first_seen_at/last_seen_at and total. Same filters/default open as list_findings; no evidence bodies.', findingsFilterShape, summarizeFindings);
  register(server, 'get_finding', 'Full public finding by ID with derived priority and hash. if_hash returns unchanged,id,hash on a match.', { ...projectKeyShape, ...conditionalShape, finding_id: z.string() }, getFinding);

  register(
    server,
    'get_coverage_grid',
    'The observation coverage grid for one event, or the requirement coverage for one use case (pass exactly one of event/use_case).',
    { ...projectKeyShape, event: z.string().optional(), use_case: z.string().optional() },
    getCoverageGrid
  );

  register(
    server,
    'get_tracking_document',
    'The whole project as one machine-readable tracking document (definitions, rules, use cases, identity codegen, findings summary).',
    projectKeyShape,
    getTrackingDocument
  );

  register(
    server,
    'submit_observation',
    'Records one observed event. Creates (or reuses) an agent_session QA run when qa_run_id is omitted.',
    {
      ...projectKeyShape,
      qa_run_id: z.string().optional(),
      agent_name: z.string().optional(),
      event_type: z.string(),
      properties: z.record(z.string(), z.unknown()),
      page_url: z.string().optional(),
      context_values: z.record(z.string(), z.unknown()).optional(),
      timestamp: z.number().optional(),
      environment: z.string().optional(),
    },
    submitObservation
  );

  register(
    server,
    'submit_observations_batch',
    'Imports a Bloomreach customer-events-export.json payload as observations (same parser and import path as the app’s paste). Returns inserted and duplicate counts.',
    { ...projectKeyShape, qa_run_id: z.string().optional(), agent_name: z.string().optional(), export: z.record(z.string(), z.unknown()) },
    submitObservationsBatch
  );

  register(
    server,
    'finish_qa_run',
    'Marks a QA run finished (sets finished_at); returns the updated run. Does not run comparison -- call run_comparison separately if you want fresh findings.',
    { ...projectKeyShape, qa_run_id: z.string(), notes: z.string().optional() },
    finishQaRun
  );

  register(
    server,
    'run_comparison',
    'Recomputes every comparison engine over the whole project (scope is accepted but ignored -- it never narrows the recompute, same as POST /comparison/run) and returns the findings summary.',
    { ...projectKeyShape, scope: z.object({ event: z.string().optional(), qa_run_id: z.string().optional() }).optional() },
    runComparison
  );

  // T-3-07 (D-52): registered at the end to keep this file's merges additive across tasks.
  register(
    server,
    'update_observation',
    'Edits one observation\'s evidence (properties, page_url, context_values, timestamp); recomputes raw_hash (409 DUPLICATE_OBSERVATION on collision with another observation of the same run) and runs comparison.',
    {
      ...projectKeyShape,
      observation_id: z.string(),
      properties: z.record(z.string(), z.unknown()).optional(),
      page_url: z.string().nullable().optional(),
      context_values: z.unknown().optional(),
      timestamp: z.number().optional(),
    },
    updateObservation
  );

  register(
    server,
    'delete_observation',
    'Deletes one observation and runs comparison.',
    { ...projectKeyShape, observation_id: z.string() },
    deleteObservation
  );

  register(
    server,
    'delete_qa_run',
    'Deletes a QA run (cascading its observations) and runs comparison.',
    { ...projectKeyShape, qa_run_id: z.string() },
    deleteQaRun
  );

  // T-3-10 (D-55): the global use case template library and its instantiate/preview, appended as a
  // self-contained block (concurrent tasks append their own tools here too; keep-both on merge).
  register(
    server,
    'list_use_case_templates',
    'The global use case template library (not project-scoped): code, name, type and requirement count per template.',
    {},
    listUseCaseTemplates
  );

  register(
    server,
    'instantiate_use_case_template',
    'Instantiates (or, with dry_run, only previews resolving) a use case template into a project by its template_code. Resolution order: the project\'s own standard event mapping, then exact event name, else unresolved with candidates; mappings (index, event_id, variant_id?, property_id?) answer the unresolved rows and are saved as standard event mappings before the requirements are created.',
    {
      ...projectKeyShape,
      template_code: z.string(),
      code: z.string().optional(),
      mappings: z
        .array(
          z.object({
            index: z.number(),
            event_id: z.string(),
            variant_id: z.string().optional(),
            property_id: z.string().optional(),
          })
        )
        .optional(),
      dry_run: z.boolean().optional(),
    },
    instantiateUseCaseTemplate
  );

  // T-3-02 (D-44): registered last, per convention -- a read-only tool over `change_log`, useful to
  // check what a previous import/agent write actually changed.
  register(
    server,
    'get_history',
    'Compact change-history pages for one entity, newest first (10 rows by default). Returns items,total,next_offset,truncated; include=detail or fields=[diff_json,...] adds full diffs.',
    { ...projectKeyShape, ...listShape, entity_type: z.string(), entity_id: z.string() },
    getHistory
  );

  // T-5-01 (D-11, D-44, D-04): the write tools. Each takes project_key, agent_name (change_log actor)
  // and dry_run (default true: a rolled-back preview diff); see `tools/writeCore.ts`.
  for (const tool of WRITE_TOOLS) {
    register(
      server,
      tool.name,
      tool.description,
      // strict: a typo'd key is a validation error, not silently dropped (the SDK accepts a zod object).
      z.object({ ...writeCommonShape, ...tool.shape }).strict() as unknown as ZodRawShape,
      writeHandler(tool) as ToolHandler<never>
    );
  }

  register(
    server,
    'batch_apply',
    'Runs an ordered list of write operations ({op: "create_event" | "update_event" | "create_property" | "update_property" | "link_event_property" | "unlink_event_property" | "create_identity_rule" | "set_event_identifiers" | "create_catalog_field", plus the arguments of that tool}) with one dry_run flag (default true). Applied operations share one change_log batch_id; stops at the first error and reports applied/failed/not_run counts. A dry run executes the whole list in a rolled-back transaction, so later operations see earlier ones.',
    z.object({
      ...writeCommonShape,
      operations: z.array(z.object({ op: z.string() }).passthrough()),
    }).strict() as unknown as ZodRawShape,
    batchApply as ToolHandler<never>
  );
}

/** The registration path is the inventory; callers/tests/docs never maintain a second count. */
export function getToolInventory() {
  const inventory: { name: string; scopes: readonly string[] }[] = [];
  registerTools({ registerTool(name: string) { inventory.push({ name, scopes: TOOL_POLICY[name] ?? [] }); return { disable() {} }; } } as unknown as McpServer);
  return inventory;
}
