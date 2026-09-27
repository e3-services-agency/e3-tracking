/**
 * History routes (D-44, T-3-01), mounted at `/api/projects/:projectId/history`: list with filters
 * (`entity_type`, `entity_id`, `parent_entity_id`, `actor`, `source`, `batch_id`, `since`,
 * `before`, `limit`), newest first; `GET /:changeId` for one row.
 */
import { Router, type Request, type Response } from 'express';
import { listChanges, getChangeOrThrow } from '../dal/change-log.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function stringParam(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function numberParam(v: unknown): number | undefined {
  if (typeof v !== 'string' || v.length === 0) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(
      listChanges(req.projectId!, {
        entity_type: stringParam(req.query.entity_type),
        entity_id: stringParam(req.query.entity_id),
        parent_entity_id: stringParam(req.query.parent_entity_id),
        actor: stringParam(req.query.actor),
        source: stringParam(req.query.source),
        batch_id: stringParam(req.query.batch_id),
        since: stringParam(req.query.since),
        before: stringParam(req.query.before),
        limit: numberParam(req.query.limit),
      })
    );
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:changeId', (req: Request, res: Response) => {
  try {
    res.status(200).json(getChangeOrThrow(req.projectId!, req.params.changeId));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
