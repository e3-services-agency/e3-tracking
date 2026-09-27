/**
 * `submit_observation`, `submit_observations_batch` (T-2-10, plan MCP table). `submit_observation`
 * creates an `agent_session` `QaRun` when `qa_run_id` is absent and reuses it on later calls within
 * the same process (`session.ts`); `submit_observations_batch` accepts the Bloomreach customer
 * events export shape verbatim and reuses `customerEventsExportImport.service.ts` -- the same parser
 * and apply path the Import page's paste uses, so an agent-submitted batch is diffed, deduped and
 * comparison-recomputed identically to a human paste (D-04's diff-and-confirm is the preview step;
 * an agent skips confirmation by construction of calling `submit_observations_batch` at all, the
 * same way the plan's table has no separate "preview" tool for it).
 */
import * as QaRunDAL from '../../backend/dal/qa-run.dal';
import * as ObservationDAL from '../../backend/dal/observation.dal';
import type { ObservationRow } from '../../backend/dal/observation.dal';
import { createEventResolver } from '../../backend/services/eventResolution';
import { previewCustomerEventsExport, applyCustomerEventsExport } from '../../backend/services/customerEventsExportImport.service';
import { resolveProject } from '../resolve';
import { getSessionRunId, setSessionRunId } from '../session';
import { McpToolError } from '../errors';

export interface SubmitObservationInput {
  project_key?: string;
  qa_run_id?: string;
  agent_name?: string;
  event_type: string;
  properties: Record<string, unknown>;
  page_url?: string;
  context_values?: Record<string, unknown>;
  timestamp?: number;
  environment?: string;
}

export interface SubmitObservationResult {
  /** `null` when this exact `(event_type, timestamp, properties)` was already recorded on this run (`createObservation`'s dedupe, not an error). */
  observation: ObservationRow | null;
  qa_run_id: string;
  duplicate: boolean;
}

function resolveOrCreateSessionRun(projectId: string, qaRunId: string | undefined, agentName: string | undefined, environment: string | undefined): string {
  if (qaRunId) {
    QaRunDAL.getQaRunOrThrow(projectId, qaRunId);
    return qaRunId;
  }
  const cached = getSessionRunId(projectId);
  if (cached) {
    // Guard against a run archived/removed between calls (fix round consideration): fall through to
    // create a fresh one rather than throwing on a stale cache entry.
    const stillExists = QaRunDAL.getQaRunById(projectId, cached);
    if (stillExists) return cached;
  }
  const run = QaRunDAL.createQaRun(projectId, {
    kind: 'agent_session',
    actor: agentName?.trim() || 'MCP agent',
    environment: environment ?? null,
  });
  setSessionRunId(projectId, run.id);
  return run.id;
}

export async function submitObservation(input: SubmitObservationInput): Promise<SubmitObservationResult> {
  if (!input.event_type?.trim()) throw new McpToolError('VALIDATION_ERROR', 'event_type is required.');
  const project = resolveProject(input.project_key);
  const qaRunId = resolveOrCreateSessionRun(project.id, input.qa_run_id, input.agent_name, input.environment);

  const resolve = createEventResolver(project.id);
  const { event_id, variant_id } = resolve(input.event_type, input.properties ?? {});

  const observation = ObservationDAL.createObservation(project.id, qaRunId, {
    source: 'agent',
    event_type: input.event_type,
    event_id,
    variant_id,
    timestamp: input.timestamp ?? Math.floor(Date.now() / 1000),
    properties: input.properties ?? {},
    page_url: input.page_url ?? null,
    context_values_json: input.context_values ?? null,
  });

  // `createObservation` returns `null` for a duplicate `raw_hash` on this run (not an error, plan
  // "Observation" storage convention): report the run id either way so the caller can still poll it.
  return { observation, qa_run_id: qaRunId, duplicate: observation === null };
}

export interface SubmitObservationsBatchInput {
  project_key?: string;
  /** An existing `QaRun` id to insert into, instead of starting a new `export_paste` run (T-2-10
   * addendum). Must already exist (`getQaRunOrThrow`); the fallback when absent is unchanged. */
  qa_run_id?: string;
  agent_name?: string;
  export: unknown;
}

export interface SubmitObservationsBatchResult {
  qa_run_id: string;
  inserted: number;
  duplicates: number;
}

/**
 * Reuses `customerEventsExportImport.service.ts`'s preview/apply pair -- the same parser and apply
 * path the Import page's paste uses -- so an agent-submitted batch is diffed, deduped and
 * comparison-recomputed identically to a human paste (D-04's diff-and-confirm is the preview step;
 * an agent skips confirmation by construction of calling `submit_observations_batch` at all, the
 * same way the plan's table has no separate "preview" tool for it).
 *
 * `qa_run_id` (T-2-10 addendum, plan table): when given, `apply` inserts into that existing run
 * instead of creating a new `export_paste` one; the preview/apply hash contract is unchanged. When
 * absent, a new `export_paste` run is created, same as before. `raw_hash` dedupe is scoped to one
 * `QaRun` (`observation.dal.ts`'s header comment), so within the *same* target run a re-submitted
 * export dedupes correctly; this selects only the preview's `default_selected` items (the same
 * "already present elsewhere in this project" signal the Import page's diff shows and pre-selects
 * against) so a repeat submission reports the repeat rows as `duplicates`, not silently re-inserted,
 * whether or not `qa_run_id` is reused.
 */
export async function submitObservationsBatch(input: SubmitObservationsBatchInput): Promise<SubmitObservationsBatchResult> {
  const project = resolveProject(input.project_key);
  if (input.qa_run_id) QaRunDAL.getQaRunOrThrow(project.id, input.qa_run_id);
  const preview = previewCustomerEventsExport(project.id, input.export);
  const selectedItemIds = preview.items.filter((item) => item.default_selected).map((item) => item.id);
  if (selectedItemIds.length === 0) {
    return { qa_run_id: input.qa_run_id ?? '', inserted: 0, duplicates: preview.duplicate_count };
  }
  const result = applyCustomerEventsExport(
    project.id,
    input.export,
    preview.payload_hash,
    selectedItemIds,
    input.agent_name?.trim() || 'MCP agent',
    input.qa_run_id
  );
  return { qa_run_id: result.run.id, inserted: result.inserted, duplicates: preview.duplicate_count };
}
