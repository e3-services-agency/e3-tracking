/**
 * `GET /api/projects/:projectId/rule-templates?event_id=...` (D-30, D-31, T-2-06): the four seed
 * templates, with `applicable` computed against `event_id` when given (plan: "with applicable per
 * event"). Event-scoped creation is `POST /api/projects/:projectId/events/:id/rules/from-template/:key`
 * (`routes/events.ts`).
 */
import { Router, type Request, type Response } from 'express';
import * as RuleDAL from '../dal/rule.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    const eventId = typeof req.query.event_id === 'string' ? req.query.event_id : undefined;
    res.status(200).json(RuleDAL.listRuleTemplates(req.projectId!, eventId));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
