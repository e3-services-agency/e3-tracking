import { durableStep } from '../idempotency';
import {pointers,publicPointer} from '../../backend/dal/use-case-asset-pointer.dal';
import {projectImplementation} from '../../backend/services/assetLinks.service';
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
import { referencesFor } from './references';
import { conditionalRead, paginate, readSnapshot, type ConditionalInput, type ListOptions } from '../readOptions';

/**
 * D-59 fix round (ERROR 2, reviewer 2026-09-28 17:12): the one place every MCP-facing use case
 * shape starts from -- `internal_notes`/`internal_url` (D-59 amendment 2: "never in the tracking
 * document, MCP or HTML export") are deliberately absent here; `documentation_url` is public and
 * kept. `list_use_cases`, `get_use_case` and `instantiate_use_case_template` all build their
 * response by spreading this, so a future field added to `UseCaseRow` needs an explicit decision
 * here before it can reach an MCP client, instead of leaking through a bare `{...useCase}`.
 */
export interface PublicUseCaseFields {
  code: string | null;
  name: string;
  type: string | null;
  status: string | null;
  description: string | null;
  narrative: string | null;
  documentation_url: string | null;
}

function sanitizeUseCase(uc: UseCaseDAL.UseCaseRow): PublicUseCaseFields {
  return {
    code: uc.code,
    name: uc.name,
    type: uc.type,
    status: uc.status,
    description: uc.description,
    narrative: uc.narrative,
    documentation_url: uc.documentation_url,
  };
}

export interface ListUseCasesInput extends ListOptions {
  project_key?: string;
}

export interface ListUseCasesRow {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  status: string | null;
  priority: string | null;
  created_at: string;
  updated_at: string;
  requirement_count: number;
  description?: string | null;
  narrative?: string | null;
  documentation_url?: string | null;
}

export async function listUseCases(input: ListUseCasesInput) {
  return readSnapshot(() => {
  const project = resolveProject(input.project_key);
  const refs = input.include || input.fields?.includes('references') ? referencesFor(project.id, 'use_case') : [];
  const implementation=projectImplementation(project.id).use_cases;
  const rows = UseCaseDAL.listUseCases(project.id).map((uc) => {
    const { code, name, type, status } = sanitizeUseCase(uc);
    const impl=implementation.find(r=>r.use_case_id===uc.id);
    return { ...sanitizeUseCase(uc), id: uc.id, code, name, type, status, priority: uc.priority, owner_business:uc.owner_business,owner_technical:uc.owner_technical,status_note:uc.status_note,asset_count:(impl?.assets.length??0)+(impl?.asset_pointers?.length??0), created_at: uc.created_at, updated_at: uc.updated_at, requirement_count: RequirementDAL.listRequirements(project.id, uc.id).length, references: refs.filter(ref => ref.target_id === uc.id) };
  });
  const compact = ['id', 'code', 'name', 'type', 'status', 'priority', 'asset_count','created_at', 'updated_at', 'requirement_count'];
  return paginate(rows, input, compact, [...compact,'owner_business','owner_technical','status_note','description', 'narrative', 'documentation_url', 'references'], { project_id: project.id, collection: 'use_cases', default_limit: 100 });
  });
}

export interface GetUseCaseInput extends ConditionalInput {
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

export interface GetUseCaseResult extends PublicUseCaseFields {
  id: string;
  requirements: GetUseCaseRequirement[];
}

export async function getUseCase(input: GetUseCaseInput) {
  const project = resolveProject(input.project_key);
  return readSnapshot(()=>{const useCase=resolveUseCase(project.id,input.use_case);return conditionalRead(useCase.id,publicUseCase(project.id,useCase),input);});
}
export function publicUseCase(projectId:string,useCase:UseCaseDAL.UseCaseRow):Record<string,unknown> & {status:string|null}{
  const labelFor = buildTargetLabelResolver(projectId);
  const requirements = RequirementDAL.listRequirements(projectId, useCase.id).map((r) => ({
    target_kind: r.target_kind,
    label: labelFor(r),
    level: r.level,
    status: r.status,
    note: r.note,
  }));
  const reviewed=projectImplementation(projectId).use_cases.find(r=>r.use_case_id===useCase.id)?.assets??[];
  return {id:useCase.id,...sanitizeUseCase(useCase),priority:useCase.priority,owner:useCase.owner,owner_business:useCase.owner_business,owner_technical:useCase.owner_technical,status_note:useCase.status_note,status_changed_by:useCase.status_changed_by,status_changed_at:useCase.status_changed_at,created_at:useCase.created_at,requirements,references:referencesFor(projectId,'use_case',useCase.id),assets:[...reviewed.map(a=>({...a,validation:'reviewed_mapping_configuration_only'})),...pointers(projectId,useCase.id).map(publicPointer)]};
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
  return durableStep('mutation', () => {
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
  return { ...sanitizeUseCase(useCase), unresolved_count };

  });
}
