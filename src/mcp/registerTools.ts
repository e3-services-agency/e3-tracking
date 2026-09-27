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
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';
import { log } from './log';
import { listProjects } from './tools/projects';
import { listEvents, getEventCard, getExpectedPayload } from './tools/events';
import { listUseCases, getUseCase } from './tools/useCases';
import { listFindings } from './tools/findings';
import { getCoverageGrid } from './tools/coverage';
import { getTrackingDocument } from './tools/trackingDocument';
import { submitObservation, submitObservationsBatch } from './tools/observations';
import { runComparison } from './tools/comparison';
import { finishQaRun } from './tools/qaRuns';

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
  const callback = async (args: z.infer<z.ZodObject<Shape>>) => {
    try {
      const result = await handler(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'INTERNAL_ERROR';
      const message = err instanceof Error ? err.message : String(err);
      if (code === 'INTERNAL_ERROR') log.error(`tool ${name} failed unexpectedly`, err);
      return { isError: true, content: [{ type: 'text' as const, text: `${code}: ${message}` }] };
    }
  };
  server.registerTool(name, { description, inputSchema }, callback as Parameters<McpServer['registerTool']>[2]);
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
    'Open findings (or another status), optionally filtered by event, severity, comparison, kind, or QA run.',
    {
      ...projectKeyShape,
      event: z.string().optional(),
      severity: z.string().optional(),
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
    'Marks a QA run finished (sets finished_at); returns the updated run.',
    { ...projectKeyShape, qa_run_id: z.string(), notes: z.string().optional() },
    finishQaRun
  );

  register(
    server,
    'run_comparison',
    'Recomputes every comparison engine over the whole project and returns the findings summary.',
    { ...projectKeyShape, scope: z.object({ event: z.string().optional(), qa_run_id: z.string().optional() }).optional() },
    runComparison
  );
}
