/**
 * Observation routes (T-1-09, plan "API shape"), mounted at
 * `/api/projects/:projectId/observations`: list with filters (`qa_run_id`, `event_id`).
 */
import { Router, type Request, type Response } from 'express';
import * as ObservationDAL from '../dal/observation.dal';
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

export default router;
