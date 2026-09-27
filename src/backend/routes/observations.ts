/**
 * Observation routes (T-1-09, plan "API shape"), mounted at
 * `/api/projects/:projectId/observations`: list with filters (`qa_run_id`, `event_id`); `PATCH`/
 * `DELETE /:id` (D-52, T-3-07) edit or remove one observation's evidence, each followed by
 * `runComparison` so the project's findings reflect the correction immediately.
 */
import { Router, type Request, type Response } from 'express';
import * as ObservationDAL from '../dal/observation.dal';
import { runComparison } from '../services/comparison.service';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    const qaRunId = typeof req.query.qa_run_id === 'string' ? req.query.qa_run_id : undefined;
    const eventId = typeof req.query.event_id === 'string' ? req.query.event_id : undefined;
    res.status(200).json(ObservationDAL.listObservations(req.projectId!, { qa_run_id: qaRunId, event_id: eventId }));
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `PATCH /observations/:id` body: any of `properties`, `page_url`, `context_values_json`, `timestamp`. */
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: ObservationDAL.ObservationUpdateInput = {};
    if ('properties' in body) updates.properties = body.properties as Record<string, unknown>;
    if ('page_url' in body) updates.page_url = body.page_url as string | null;
    if ('context_values_json' in body) updates.context_values_json = body.context_values_json;
    if ('timestamp' in body) updates.timestamp = body.timestamp as number;
    const observation = ObservationDAL.updateObservation(req.projectId!, req.params.id, updates);
    runComparison(req.projectId!);
    res.status(200).json(observation);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    ObservationDAL.deleteObservation(req.projectId!, req.params.id);
    runComparison(req.projectId!);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
