/**
 * UseCase and Requirement routes, mounted at `/api/projects/:projectId/use-cases` behind
 * `requireProject`. `PUT /:id/requirements` replaces the ordered requirement list (T-1-07
 * acceptance); `POST /from-template/:templateId` instantiates a `UseCaseTemplate` (D-06).
 */
import { Router, type Request, type Response } from 'express';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { handleRouteError } from './routeErrors';

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
  if ('notes' in body) input.notes = body.notes as string | null;
  if ('narrative' in body) input.narrative = body.narrative as string | null;
  if (typeof body.sort_order === 'number') input.sort_order = body.sort_order;
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

/** Instantiates a UseCaseTemplate into this project (D-06). Placed before `/:id` so `from-template` is never read as a use case id. */
router.post('/from-template/:templateId', (req: Request, res: Response) => {
  try {
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(req.projectId!, req.params.templateId);
    res.status(201).json(useCase);
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
