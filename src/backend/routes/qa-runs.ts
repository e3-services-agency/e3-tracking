/**
 * QaRun routes (T-1-09, plan "API shape"), mounted at `/api/projects/:projectId/qa-runs`: list,
 * get with observations, archive (`PATCH`), finish (`POST .../finish`), delete (`DELETE /:id`,
 * D-52, T-3-07 — cascades the run's observations, followed by `runComparison`).
 */
import { Router, type Request, type Response } from 'express';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { runComparison } from '../services/comparison.service';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    const archivedParam = req.query.archived;
    const archived = archivedParam === 'true' ? true : archivedParam === 'false' ? false : undefined;
    res.status(200).json(QaRunDAL.listQaRuns(req.projectId!, archived !== undefined ? { archived } : undefined));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const run = QaRunDAL.getQaRunOrThrow(req.projectId!, req.params.id);
    const observations = ObservationDAL.listObservationsByRun(req.projectId!, req.params.id);
    res.status(200).json({ ...run, observations });
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `PATCH /qa-runs/:id` body `{archived?, notes?}` — archive/unarchive and edit notes. */
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: QaRunDAL.QaRunUpdateInput = {};
    if (typeof body.archived === 'boolean') updates.archived = body.archived;
    if ('notes' in body) updates.notes = body.notes as string | null;
    res.status(200).json(QaRunDAL.updateQaRun(req.projectId!, req.params.id, updates));
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `POST /qa-runs/:id/finish` body `{notes?}` — sets `finished_at = now`. */
router.post('/:id/finish', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;
    res.status(200).json(QaRunDAL.finishQaRun(req.projectId!, req.params.id, notes));
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `DELETE /qa-runs/:id` — hard delete, cascading observations; `runComparison` follows. */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    QaRunDAL.deleteQaRun(req.projectId!, req.params.id);
    runComparison(req.projectId!);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
