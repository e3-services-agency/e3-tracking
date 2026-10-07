/**
 * Identifiers registry routes (D-69, T-4-35), mounted at `/api/projects/:projectId/identifiers`:
 * `GET /`, `POST /`, `PUT /order` (before `/:id`), `PATCH /:id`, `DELETE /:id`.
 */
import { Router, type Request, type Response } from 'express';
import * as IdentifierDAL from '../dal/identifier.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function inputFromBody(body: Record<string, unknown>): Partial<IdentifierDAL.IdentifierInput> {
  const input: Partial<IdentifierDAL.IdentifierInput> = {};
  if (typeof body.name === 'string') input.name = body.name;
  if (typeof body.type === 'string') input.type = body.type;
  if ('description' in body) input.description = body.description as string | null;
  if (typeof body.is_cookie === 'boolean') input.is_cookie = body.is_cookie;
  if (typeof body.sort_order === 'number') input.sort_order = body.sort_order;
  return input;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(IdentifierDAL.listIdentifiersWithUsage(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const input = inputFromBody(req.body as Record<string, unknown>);
    res.status(201).json(IdentifierDAL.createIdentifier(req.projectId!, { name: input.name ?? '', type: input.type ?? '', ...input }));
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `PUT /order` body `{ ids: string[] }`: the full desired order. */
router.put('/order', (req: Request, res: Response) => {
  const ids = (req.body as Record<string, unknown>).ids;
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string')) {
    res.status(400).json({ error: 'ids must be an array of strings.', code: 'IDS_REQUIRED', field: 'ids' });
    return;
  }
  try {
    res.status(200).json(IdentifierDAL.reorderIdentifiers(req.projectId!, ids as string[]));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(IdentifierDAL.updateIdentifier(req.projectId!, req.params.id, inputFromBody(req.body as Record<string, unknown>)));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    IdentifierDAL.deleteIdentifier(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
