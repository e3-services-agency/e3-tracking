/**
 * `run_comparison` (T-2-10): "returns the summary shape of the existing comparison route" (T-2-10
 * task instruction) -- exactly `POST /comparison/run`'s body, `ComparisonSummary`
 * (`comparison.service.ts`). `scope` is accepted for forward compatibility with the plan table but,
 * like the REST route, never narrows what gets recomputed (D-21: every comparison always runs over
 * the whole project).
 */
import { runComparison as runComparisonService, type ComparisonSummary } from '../../backend/services/comparison.service';
import { resolveProject } from '../resolve';

export interface RunComparisonInput {
  project_key?: string;
  scope?: { event?: string; qa_run_id?: string };
}

export async function runComparison(input: RunComparisonInput): Promise<ComparisonSummary> {
  const project = resolveProject(input.project_key);
  return runComparisonService(project.id,{event:input.scope?.event,qa_run_id:input.scope?.qa_run_id});
}
