import { durableStep } from '../idempotency';
/**
 * `finish_qa_run` (T-2-10 addendum: the plan table, `PLAN-PHASE2-2026-09-25.md` lines ~205-225, is
 * authoritative -- this was missing from the first cut). `project_key?, qa_run_id` -> sets
 * `finished_at` via the same `qa-run.dal.ts#finishQaRun` the `POST /qa-runs/:id/finish` route uses,
 * and returns the updated run.
 *
 * Deviation from the plan table's one-line description ("run; triggers run_comparison", reviewer
 * LOW 3): this does *not* run comparison, same as `POST /qa-runs/:id/finish` -- call `run_comparison`
 * separately for fresh findings after finishing a run.
 */
import * as QaRunDAL from '../../backend/dal/qa-run.dal';
import type { QaRunRow } from '../../backend/dal/qa-run.dal';
import { runComparison, type ComparisonSummary } from '../../backend/services/comparison.service';
import { resolveProject } from '../resolve';
import { McpToolError } from '../errors';

export interface FinishQaRunInput {
  project_key?: string;
  qa_run_id: string;
  notes?: string;
}

export async function finishQaRun(input: FinishQaRunInput): Promise<QaRunRow> {
  return durableStep('mutation', () => {
  if (!input.qa_run_id?.trim()) throw new McpToolError('VALIDATION_ERROR', 'qa_run_id is required.');
  const project = resolveProject(input.project_key);
  return QaRunDAL.finishQaRun(project.id, input.qa_run_id, input.notes);

  });
}

export interface DeleteQaRunInput {
  project_key?: string;
  qa_run_id: string;
}

export interface DeleteQaRunResult {
  deleted: true;
  comparison: ComparisonSummary;
}

/**
 * `delete_qa_run` (D-52, T-3-07): mirrors `DELETE /qa-runs/:id`
 * (`qa-run.dal.ts#deleteQaRun` -- hard delete, cascading the run's own observations), followed by
 * `runComparison` so the returned findings summary reflects what is left.
 */
export async function deleteQaRun(input: DeleteQaRunInput): Promise<DeleteQaRunResult> {
  return durableStep('mutation', () => {
  if (!input.qa_run_id?.trim()) throw new McpToolError('VALIDATION_ERROR', 'qa_run_id is required.');
  const project = resolveProject(input.project_key);
  QaRunDAL.deleteQaRun(project.id, input.qa_run_id);
  const comparison = runComparison(project.id);
  return { deleted: true, comparison };

  });
}
