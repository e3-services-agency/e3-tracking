/**
 * `get_coverage_grid` (T-2-10, plan MCP table): `project_key?, event? or use_case?`. Reuses
 * `document.service.ts#computeEventCoverageGrid` (row/column/cell detail per event, distinct from
 * the event card's summary counts) and `useCaseCoverage.service.ts#computeUseCaseCoverage`
 * (per-requirement observation coverage) -- exactly one of `event`/`use_case` is required.
 */
import { computeEventCoverageGrid } from '../../backend/services/document.service';
import { computeUseCaseCoverage } from '../../backend/services/useCaseCoverage.service';
import { resolveEvent, resolveProject, resolveUseCase } from '../resolve';
import { McpToolError } from '../errors';

export interface GetCoverageGridInput {
  project_key?: string;
  event?: string;
  use_case?: string;
}

export async function getCoverageGrid(input: GetCoverageGridInput): Promise<unknown> {
  const project = resolveProject(input.project_key);
  if (input.event && input.use_case) {
    throw new McpToolError('VALIDATION_ERROR', 'Pass either event or use_case, not both.');
  }
  if (input.event) {
    const event = resolveEvent(project.id, input.event);
    return computeEventCoverageGrid(project.id, event.id);
  }
  if (input.use_case) {
    const useCase = resolveUseCase(project.id, input.use_case);
    return computeUseCaseCoverage(project.id, useCase.id);
  }
  throw new McpToolError('VALIDATION_ERROR', 'Pass event or use_case.');
}
