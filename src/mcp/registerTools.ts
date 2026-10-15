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
import { httpMcpContext } from './httpContext';
import { authorizeHttpTool, TOOL_POLICY } from './toolPolicy';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';
import { log } from './log';
import { runWithActor } from '../backend/context/actor';
import { listProjects } from './tools/projects';
import { listEvents, getEventCard, getExpectedPayload } from './tools/events';
import { listUseCases, getUseCase, listUseCaseTemplates, instantiateUseCaseTemplate } from './tools/useCases';
import { listFindings } from './tools/findings';
import { getCoverageGrid } from './tools/coverage';
import { getTrackingDocument } from './tools/trackingDocument';
import { submitObservation, submitObservationsBatch, updateObservation, deleteObservation } from './tools/observations';
import { runComparison } from './tools/comparison';
import { finishQaRun, deleteQaRun } from './tools/qaRuns';
import { getHistory } from './tools/history';
import { WRITE_TOOLS, writeHandler, writeCommonShape, batchApply } from './tools/writeTools';

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
      const actor = httpMcpContext()?.owner ?? (typeof agentName === 'string' && agentName.trim() ? agentName.trim() : 'MCP agent');
      const result = await runWithActor({ actor, source: 'mcp' }, () => handler(httpMcpContext() && typeof args === 'object' && args !== null ? {...args,agent_name:actor} : args));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'INTERNAL_ERROR';
      let message = err instanceof Error ? err.message : String(err);
      // T-5-01 polish: DAL errors carry optional `details` (409 detail string, 400 {property_id,value,allowed}).
      const details = (err as { details?: unknown })?.details;
      if (details !== undefined && details !== null && details !== '') {
        message += ` (details: ${typeof details === 'string' ? details : JSON.stringify(details)})`;
      }
      if (httpMcpContext()) return {isError:true,content:[{type:'text' as const,text:code === 'INTERNAL_ERROR' ? 'INTERNAL_ERROR: Request failed.' : `${code}: Request could not be completed.`}]};
      if (code === 'INTERNAL_ERROR') log.error(`tool ${name} failed unexpectedly`, err);
      return { isError: true, content: [{ type: 'text' as const, text: `${code}: ${message}` }] };
    }
  };
  const registered = server.registerTool(name, { description, inputSchema }, callback as Parameters<McpServer['registerTool']>[2]);
  // A remote grant only sees the tools its scopes allow (tools/list); calls are still preauthorized.
  const http = httpMcpContext();
  if (http && !(TOOL_POLICY[name] ?? []).every((s) => http.scopes.includes(s))) registered?.disable?.();
}

const projectKeyShape = { project_key: z.string().optional() };

export function registerTools(server: McpServer): void {
  register(server, 'list_projects', 'Projects grouped by client.', {}, listProjects);

  register(
    server,
    'list_events',
    'Events of a project (default: custom class only), with certification, variants, discriminators, contexts and required properties.',
    { ...projectKeyShape, class: z.string().optional(), status: z.string().optional() },
    listEvents
  );

  register(
    server,
    'get_event_card',
    'The full EventCard for one event (name or id): definition, variants, rules, coverage, findings, codegen.',
    { ...projectKeyShape, event: z.string() },
    getEventCard
  );

  register(
    server,
    'get_expected_payload',
    'The expected payload shape for an event (optionally scoped to one variant): required/optional keys, discriminators, contexts, item schemas, rules, and an example.',
    { ...projectKeyShape, event: z.string(), variant: z.string().optional() },
    getExpectedPayload
  );

  register(server, 'list_use_cases', 'Use cases of a project with their requirement count.', projectKeyShape, listUseCases);

  register(
    server,
    'get_use_case',
    'One use case (code or id) with its requirements resolved to names/levels and its narrative.',
    { ...projectKeyShape, use_case: z.string() },
    getUseCase
  );

  register(
    server,
    'list_findings',
    'Open findings (or another status), highest priority first (P1-P4 with reasons; transactional backend events first), optionally filtered by event, severity, priority, comparison, kind, or QA run.',
    {
      ...projectKeyShape,
      event: z.string().optional(),
      severity: z.string().optional(),
      priority: z.string().optional().describe('Comma-separated priorities to keep, e.g. "P1,P2".'),
      comparison: z.string().optional(),
      kind: z.string().optional(),
      status: z.string().optional(),
      qa_run_id: z.string().optional(),
    },
    listFindings
  );

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
    'Change history for one entity (event, property, use case, etc.): who changed what and when, newest first.',
    { ...projectKeyShape, entity_type: z.string(), entity_id: z.string(), limit: z.number().optional() },
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
