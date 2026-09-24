/**
 * ConsentCategory routes, mounted at `/api/projects/:projectId/consent-categories`.
 */
import { Router, type Request, type Response } from 'express';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function inputFromBody(
  body: Record<string, unknown>
): Partial<ConsentCategoryDAL.ConsentCategoryInput> {
  const input: Partial<ConsentCategoryDAL.ConsentCategoryInput> = {};
  if (typeof body.name === 'string') input.name = body.name;
  if ('description' in body) input.description = body.description as string | null;
  if ('standard_key' in body) input.standard_key = body.standard_key as string | null;
  if ('status' in body) input.status = body.status as string | null;
  if (typeof body.sort_order === 'number') input.sort_order = body.sort_order;
  return input;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(ConsentCategoryDAL.listConsentCategories(req.projectId!));
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
    const category = ConsentCategoryDAL.createConsentCategory(req.projectId!, {
      ...inputFromBody(body),
      name,
    });
    res.status(201).json(category);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(ConsentCategoryDAL.getConsentCategoryOrThrow(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const category = ConsentCategoryDAL.updateConsentCategory(
      req.projectId!,
      req.params.id,
      inputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(category);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    ConsentCategoryDAL.deleteConsentCategory(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `POST .../reorder` body `{ ids: string[] }`: the full desired order, sort_order = index. */
router.post('/reorder', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? (body.ids.filter((v) => typeof v === 'string') as string[]) : null;
  if (!ids) {
    res.status(400).json({ error: 'ids must be an array of strings.', code: 'IDS_REQUIRED', field: 'ids' });
    return;
  }
  try {
    const categories = ConsentCategoryDAL.reorderConsentCategories(req.projectId!, ids);
    res.status(200).json(categories);
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
