/**
 * `list_use_cases`, `get_use_case` (T-2-10, plan MCP table). `get_use_case` resolves every
 * requirement's target to a display label via `requirements-matrix.service.ts#buildTargetLabelResolver`
 * (the same resolver the requirements matrix and the docs export use, so labels never drift), and
 * carries the requirement's `level` alongside it.
 */
import * as UseCaseDAL from '../../backend/dal/use-case.dal';
import * as RequirementDAL from '../../backend/dal/requirement.dal';
import { buildTargetLabelResolver } from '../../backend/services/requirements-matrix.service';
import { resolveProject, resolveUseCase } from '../resolve';

export interface ListUseCasesInput {
  project_key?: string;
}

export interface ListUseCasesRow {
  code: string | null;
  name: string;
  type: string | null;
  status: string | null;
  requirement_count: number;
}

export async function listUseCases(input: ListUseCasesInput): Promise<ListUseCasesRow[]> {
  const project = resolveProject(input.project_key);
  return UseCaseDAL.listUseCases(project.id).map((uc) => ({
    code: uc.code,
    name: uc.name,
    type: uc.type,
    status: uc.status,
    requirement_count: RequirementDAL.listRequirements(project.id, uc.id).length,
  }));
}

export interface GetUseCaseInput {
  project_key?: string;
  use_case: string;
}

export interface GetUseCaseRequirement {
  target_kind: string;
  label: string;
  level: string;
  status: string | null;
  note: string | null;
}

export interface GetUseCaseResult {
  code: string | null;
  name: string;
  type: string | null;
  status: string | null;
  description: string | null;
  narrative: string | null;
  requirements: GetUseCaseRequirement[];
}

export async function getUseCase(input: GetUseCaseInput): Promise<GetUseCaseResult> {
  const project = resolveProject(input.project_key);
  const useCase = resolveUseCase(project.id, input.use_case);
  const labelFor = buildTargetLabelResolver(project.id);
  const requirements = RequirementDAL.listRequirements(project.id, useCase.id).map((r) => ({
    target_kind: r.target_kind,
    label: labelFor(r),
    level: r.level,
    status: r.status,
    note: r.note,
  }));
  return {
    code: useCase.code,
    name: useCase.name,
    type: useCase.type,
    status: useCase.status,
    description: useCase.description,
    narrative: useCase.narrative,
    requirements,
  };
}
