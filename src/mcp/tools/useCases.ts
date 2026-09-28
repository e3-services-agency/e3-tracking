/**
 * `list_use_cases`, `get_use_case` (T-2-10, plan MCP table). `get_use_case` resolves every
 * requirement's target to a display label via `requirements-matrix.service.ts#buildTargetLabelResolver`
 * (the same resolver the requirements matrix and the docs export use, so labels never drift), and
 * carries the requirement's `level` alongside it.
 *
 * `list_use_case_templates`, `instantiate_use_case_template` (T-3-10, D-55): the global template
 * library and its instantiate/preview, exposed the same way the `use-case-templates`/`use-cases`
 * routes are, through the same `use-case-template.dal.ts` functions.
 */
import * as UseCaseDAL from '../../backend/dal/use-case.dal';
import * as RequirementDAL from '../../backend/dal/requirement.dal';
import * as UseCaseTemplateDAL from '../../backend/dal/use-case-template.dal';
import { buildTargetLabelResolver } from '../../backend/services/requirements-matrix.service';
import { resolveProject, resolveUseCase } from '../resolve';
import { McpToolError } from '../errors';

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

export interface ListUseCaseTemplatesRow {
  code: string;
  name: string;
  type: string;
  requirement_count: number;
}

/** `list_use_case_templates` (T-3-10): the global library, not project-scoped. */
export async function listUseCaseTemplates(): Promise<ListUseCaseTemplatesRow[]> {
  return UseCaseTemplateDAL.listUseCaseTemplates().map((t) => ({
    code: t.code,
    name: t.name,
    type: t.type,
    requirement_count: t.default_requirements_json.length,
  }));
}

/**
 * Fix round LOW 6 (reviewer, 2026-09-28 03:15): case-insensitive, like the use case `code` lookup
 * itself (`use-case.dal.ts`'s `normalizeCode` upper-cases on store) -- `template_code: 'uc-std2'`
 * used to 404 `TEMPLATE_NOT_FOUND` even though `UC-STD2` exists.
 */
function resolveTemplateByCode(templateCode: string): UseCaseTemplateDAL.UseCaseTemplateRow {
  const wanted = templateCode.trim().toUpperCase();
  const found = UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code.toUpperCase() === wanted);
  if (!found) throw new McpToolError('TEMPLATE_NOT_FOUND', `No use case template coded "${templateCode}".`);
  return found;
}

export interface InstantiateUseCaseTemplateMapping {
  index: number;
  event_id: string;
  variant_id?: string | null;
  property_id?: string | null;
}

export interface InstantiateUseCaseTemplateInput {
  project_key?: string;
  template_code: string;
  code?: string;
  mappings?: InstantiateUseCaseTemplateMapping[];
  dry_run?: boolean;
}

/**
 * `instantiate_use_case_template` (T-3-10, D-55): `dry_run: true` returns the resolve preview
 * (`{resolved, unresolved, groups, ...}`, same shape as `POST .../from-template/:id/preview`)
 * without creating anything; otherwise applies -- same `mappings`/`code` semantics as the route --
 * and returns the created use case plus `unresolved_count`.
 */
export async function instantiateUseCaseTemplate(
  input: InstantiateUseCaseTemplateInput
): Promise<unknown> {
  const project = resolveProject(input.project_key);
  const template = resolveTemplateByCode(input.template_code);

  if (input.dry_run) {
    return UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(project.id, template.id);
  }

  const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(project.id, template.id, {
    code: input.code,
    mappings: input.mappings,
  });
  const requirements = RequirementDAL.listRequirements(project.id, useCase.id);
  const unresolved_count = requirements.filter((r) => r.status === 'gap').length;
  return { ...useCase, unresolved_count };
}
