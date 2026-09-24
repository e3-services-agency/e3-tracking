/**
 * UseCaseTemplate routes, mounted at `/api/use-case-templates` (global, not project-scoped — the
 * library is shared across clients, D-06). Read-only in phase 1 (T-1-07 acceptance): the library
 * import format and its create/update UI are phase 3.
 */
import { Router, type Request, type Response } from 'express';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { handleRouteError } from './routeErrors';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    res.status(200).json(UseCaseTemplateDAL.listUseCaseTemplates());
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(UseCaseTemplateDAL.getUseCaseTemplateOrThrow(req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
