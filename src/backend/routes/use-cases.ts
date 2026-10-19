/**
 * UseCase and Requirement routes, mounted at `/api/projects/:projectId/use-cases` behind
 * `requireProject`. `PUT /:id/requirements` replaces the ordered requirement list (T-1-07
 * acceptance); `POST /from-template/:templateId` instantiates a `UseCaseTemplate` (D-06).
 */
import { Router, type Request, type Response } from 'express';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { regenerateNarrative } from '../services/useCaseNarrative.service';
import { computeUseCaseCoverage } from '../services/useCaseCoverage.service';
import { handleRouteError } from './routeErrors';
import { ValidationError } from '../errors';

const router = Router({ mergeParams: true });

function inputFromBody(body: Record<string, unknown>): Partial<UseCaseDAL.UseCaseInput> {
  const input: Partial<UseCaseDAL.UseCaseInput> = {};
  if ('template_id' in body) input.template_id = body.template_id as string | null;
  if ('code' in body) input.code = body.code as string | null;
  if (typeof body.name === 'string') input.name = body.name;
  if ('type' in body) input.type = body.type as string | null;
  if ('description' in body) input.description = body.description as string | null;
  if ('priority' in body) input.priority = body.priority as string | null;
  if ('status' in body) input.status = body.status as string | null;
  if ('owner' in body) input.owner = body.owner as string | null;
  for(const key of ['owner_business','owner_technical','status_note'] as const)if(key in body)input[key]=body[key] as string|null;
  if ('notes' in body) input.notes = body.notes as string | null;
  if ('narrative' in body) input.narrative = body.narrative as string | null;
  if (typeof body.sort_order === 'number') input.sort_order = body.sort_order;
  if ('documentation_url' in body) input.documentation_url = body.documentation_url as string | null;
  if ('internal_notes' in body) input.internal_notes = body.internal_notes as string | null;
  if ('internal_url' in body) input.internal_url = body.internal_url as string | null;
  return input;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(UseCaseDAL.listUseCases(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const useCase = UseCaseDAL.createUseCase(req.projectId!, { ...inputFromBody(body), name });
    res.status(201).json(useCase);
  } catch (err) {
    handleRouteError(err, res);
  }
});

/**
 * Instantiates a UseCaseTemplate into this project (D-06). Placed before `/:id` so `from-template`
 * is never read as a use case id. T-3-06 (D-47): accepts an optional `{code}` body -- when omitted,
 * defaults to the template's own code, suffixed `-2`/`-3`... on conflict inside the DAL; an
 * *explicit* `code` that collides is never suffixed, it 409s `USE_CASE_CODE_TAKEN` instead (fix
 * round WARNING 2, corrected LOW C, 2026-09-27/28). T-3-10 (D-55) adds an optional `mappings`
 * body array (`{index, event_id, variant_id?, property_id?}`), the mapping-step dialog's answers
 * for unresolved standard-event targets -- applied as standard event mappings before the
 * template's requirements are resolved. Generates the narrative right after creation and returns
 * `unresolved_count` (the number of `gap` requirements) alongside the use case.
 */
router.post('/from-template/:templateId', (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = typeof body.code === 'string' && body.code.trim() ? body.code.trim() : undefined;
    const mappings = Array.isArray(body.mappings)
      ? (body.mappings as Record<string, unknown>[])
          .filter((m) => typeof m.index === 'number' && typeof m.event_id === 'string' && m.event_id.trim())
          .map((m) => ({
            index: m.index as number,
            event_id: m.event_id as string,
            variant_id: typeof m.variant_id === 'string' && m.variant_id.trim() ? (m.variant_id as string) : null,
            property_id: typeof m.property_id === 'string' && m.property_id.trim() ? (m.property_id as string) : null,
          }))
      : undefined;
    if (body.type !== undefined && body.type !== null && typeof body.type !== 'string') {
      throw new ValidationError('type must be a string (marketing or transactional).', 'type');
    }
    const type = typeof body.type === 'string' && body.type.trim() ? body.type.trim() : undefined;
    let useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(req.projectId!, req.params.templateId, {
      code,
      mappings,
      type,
    });
    const requirements = RequirementDAL.listRequirements(req.projectId!, useCase.id);
    const unresolved_count = requirements.filter((r) => r.status === 'gap').length;
    try {
      useCase = regenerateNarrative(req.projectId!, useCase.id, true);
    } catch {
      // Narrative generation is best-effort here (D-32's own guard never applies to a
      // freshly-created use case, which never has `narrative_edited_at` set); a failure must never
      // hide the successfully-instantiated use case from the caller.
    }
    res.status(201).json({ ...useCase, unresolved_count });
  } catch (err) {
    handleRouteError(err, res);
  }
});

/**
 * Resolve preview (D-55, D-57): dry-runs `instantiateUseCaseTemplate`'s resolution without
 * creating anything, grouped for the templates page's prerequisites card. Placed before `/:id` for
 * the same reason as the instantiate route above.
 */
router.post('/from-template/:templateId/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(req.projectId!, req.params.templateId));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const useCase = UseCaseDAL.getUseCaseOrThrow(req.projectId!, req.params.id);
    const requirements = RequirementDAL.listRequirements(req.projectId!, req.params.id);
    res.status(200).json({ ...useCase, requirements });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const useCase = UseCaseDAL.updateUseCase(
      req.projectId!,
      req.params.id,
      inputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(useCase);
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `POST /:id/narrative/regenerate` body `{force?: boolean}` (D-32): 409 `NARRATIVE_EDITED` when the stored narrative was edited by hand more recently than it was generated, unless `force` is true. */
router.post('/:id/narrative/regenerate', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const force = body.force === true;
  try {
    const useCase = regenerateNarrative(req.projectId!, req.params.id, force);
    res.status(200).json(useCase);
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `GET /:id/coverage` (PLAN "Coverage grid"): per-requirement observation coverage, for the use case page and (once merged) the T-2-08 coverage grid. */
router.get('/:id/coverage', (req: Request, res: Response) => {
  try {
    UseCaseDAL.getUseCaseOrThrow(req.projectId!, req.params.id);
    res.status(200).json(computeUseCaseCoverage(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    UseCaseDAL.deleteUseCase(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

function requirementInputFromBody(row: Record<string, unknown>): RequirementDAL.RequirementInput {
  return {
    target_kind: String(row.target_kind ?? ''),
    property_id: 'property_id' in row ? (row.property_id as string | null) : undefined,
    event_id: 'event_id' in row ? (row.event_id as string | null) : undefined,
    variant_id: 'variant_id' in row ? (row.variant_id as string | null) : undefined,
    catalog_field_id: 'catalog_field_id' in row ? (row.catalog_field_id as string | null) : undefined,
    consent_category_id: 'consent_category_id' in row ? (row.consent_category_id as string | null) : undefined,
    level: String(row.level ?? ''),
    status: 'status' in row ? (row.status as string | null) : undefined,
    note: 'note' in row ? (row.note as string | null) : undefined,
  };
}

router.get('/:id/requirements', (req: Request, res: Response) => {
  try {
    res.status(200).json(RequirementDAL.listRequirements(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.put('/:id/requirements', (req: Request, res: Response) => {
  const body = req.body as { requirements?: unknown };
  if (!Array.isArray(body.requirements)) {
    res.status(400).json({
      error: 'requirements must be an array.',
      code: 'REQUIREMENTS_REQUIRED',
      field: 'requirements',
    });
    return;
  }
  try {
    const rows = body.requirements.map((row) => requirementInputFromBody(row as Record<string, unknown>));
    const result = RequirementDAL.replaceRequirements(req.projectId!, req.params.id, rows);
    res.status(200).json(result);
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
