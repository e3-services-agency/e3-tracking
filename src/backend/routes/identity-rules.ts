/**
 * IdentityRule routes, mounted at `/api/projects/:projectId/identity-rules`.
 */
import { Router, type Request, type Response } from 'express';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function inputFromBody(body: Record<string, unknown>): Partial<IdentityRuleDAL.IdentityRuleInput> {
  const input: Partial<IdentityRuleDAL.IdentityRuleInput> = {};
  if (typeof body.bloomreach_field === 'string') input.bloomreach_field = body.bloomreach_field;
  if (typeof body.identity_type === 'string') input.identity_type = body.identity_type;
  if (typeof body.name === 'string') input.name = body.name;
  if ('description' in body) input.description = body.description as string | null;
  if ('trigger_event_id' in body) input.trigger_event_id = body.trigger_event_id as string | null;
  if ('trigger_text' in body) input.trigger_text = body.trigger_text as string | null;
  if ('value_rule' in body) input.value_rule = body.value_rule as string | null;
  if ('example' in body) input.example = body.example as string | null;
  if ('owner' in body) input.owner = body.owner as string | null;
  if ('source_id' in body) input.source_id = body.source_id as string | null;
  if ('tracker' in body) input.tracker = body.tracker as string | null;
  if ('priority' in body) input.priority = body.priority as string | null;
  if ('status' in body) input.status = body.status as string | null;
  if (typeof body.sort_order === 'number') input.sort_order = body.sort_order;
  return input;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(IdentityRuleDAL.listIdentityRules(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const bloomreachField = typeof body.bloomreach_field === 'string' ? body.bloomreach_field.trim() : '';
  const identityType = typeof body.identity_type === 'string' ? body.identity_type : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  if (!bloomreachField) {
    res.status(400).json({
      error: 'bloomreach_field is required.',
      code: 'BLOOMREACH_FIELD_REQUIRED',
      field: 'bloomreach_field',
    });
    return;
  }
  try {
    const rule = IdentityRuleDAL.createIdentityRule(req.projectId!, {
      ...inputFromBody(body),
      name,
      bloomreach_field: bloomreachField,
      identity_type: identityType,
    });
    res.status(201).json(rule);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(IdentityRuleDAL.getIdentityRuleOrThrow(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const rule = IdentityRuleDAL.updateIdentityRule(
      req.projectId!,
      req.params.id,
      inputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(rule);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    IdentityRuleDAL.deleteIdentityRule(req.projectId!, req.params.id);
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
    const rules = IdentityRuleDAL.reorderIdentityRules(req.projectId!, ids);
    res.status(200).json(rules);
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
