/**
 * Rule routes, mounted at `/api/projects/:projectId/rules` behind `requireProject` (D-30, D-31,
 * T-2-06). Create/list-by-event live nested under `/api/projects/:projectId/events/:id/rules`
 * (`routes/events.ts`); `PATCH`/`DELETE`/`GET :id` and the project-wide list live here per the
 * plan's API shape table ("PATCH/DELETE /rules/:id").
 */
import { Router, type Request, type Response } from 'express';
import * as RuleDAL from '../dal/rule.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(RuleDAL.listRulesByProject(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(RuleDAL.getRuleOrThrow(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

function ruleUpdateFromBody(body: Record<string, unknown>): Partial<RuleDAL.RuleInput> {
  const input: Partial<RuleDAL.RuleInput> = {};
  if ('variant_id' in body) input.variant_id = body.variant_id as string | null;
  if (typeof body.kind === 'string') input.kind = body.kind;
  if (typeof body.name === 'string') input.name = body.name;
  if ('message' in body) input.message = body.message as string | null;
  if ('expression_json' in body) input.expression_json = body.expression_json;
  if (typeof body.tolerance_mode === 'string') input.tolerance_mode = body.tolerance_mode;
  if ('tolerance_value' in body) input.tolerance_value = body.tolerance_value as number | null;
  if (typeof body.report_kind === 'string') input.report_kind = body.report_kind;
  if (typeof body.severity === 'string') input.severity = body.severity;
  if ('template_key' in body) input.template_key = body.template_key as string | null;
  if (typeof body.enabled === 'boolean') input.enabled = body.enabled;
  return input;
}

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const rule = RuleDAL.updateRule(req.projectId!, req.params.id, ruleUpdateFromBody(req.body as Record<string, unknown>));
    res.status(200).json(rule);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    RuleDAL.deleteRule(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
