/**
 * IdentityRule routes, mounted at `/api/projects/:projectId/identity-rules`.
 */
import { Router, type Request, type Response } from 'express';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import { buildIdentityCodegen } from '../services/codegen.service';
import { listProperties } from '../dal/property.dal';
import { setRuleCarriedBy, getProjectIdentificationFlow, listIdentityRulesForCodegen, listIdentityRulesWithFlow } from '../services/identification.service';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function inputFromBody(body: Record<string, unknown>): Partial<IdentityRuleDAL.IdentityRuleInput> {
  const input: Partial<IdentityRuleDAL.IdentityRuleInput> = {};
  if (typeof body.identifier_id === 'string') input.identifier_id = body.identifier_id;
  if (typeof body.identifier_name === 'string') input.identifier_name = body.identifier_name;
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
  if ('transformations_json' in body) {
    input.transformations_json = Array.isArray(body.transformations_json)
      ? (body.transformations_json.filter((v) => typeof v === 'string') as string[])
      : null;
  }
  if ('sdk_call' in body) input.sdk_call = body.sdk_call as string | null;
  return input;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(listIdentityRulesWithFlow(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `GET .../flow` (D-67, T-4-28): the generated "Identification flow" paragraph plus per-rule set_by / carried_by. Before `/:id`. */
router.get('/flow', (req: Request, res: Response) => {
  try {
    res.status(200).json(getProjectIdentificationFlow(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const identifierName = typeof body.identifier_name === 'string' ? body.identifier_name.trim() : '';
  const identityType = typeof body.identity_type === 'string' ? body.identity_type : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  if (!identifierName && typeof body.identifier_id !== 'string') {
    res.status(400).json({
      error: 'identifier_name is required.',
      code: 'IDENTIFIER_NAME_REQUIRED',
      field: 'identifier_name',
    });
    return;
  }
  try {
    const rule = IdentityRuleDAL.createIdentityRule(req.projectId!, {
      ...inputFromBody(body),
      name,
      identifier_name: identifierName,
      identity_type: identityType || undefined,
    });
    res.status(201).json(rule);
  } catch (err) {
    handleRouteError(err, res);
  }
});

/**
 * `GET .../codegen`: identify/update/anonymize snippets built from this project's identity rules
 * and mapped customer properties (D-38, `buildIdentityCodegen`). Also exposed project-wide at
 * `GET /export/codegen/identity` (`routes/export.ts`) for the documentation export. Registered
 * before `GET /:id` so the literal path `/codegen` is not swallowed by the `:id` param route.
 */
router.get('/codegen', (req: Request, res: Response) => {
  try {
    const rules = listIdentityRulesForCodegen(req.projectId!);
    const customerProperties = listProperties(req.projectId!, { scope: 'customer' });
    res.status(200).json(buildIdentityCodegen(rules, customerProperties));
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `PUT .../:id/carried-by` body `{ event_ids: string[] }`: the events that should carry this identifier (D-67, T-4-32). */
router.put('/:id/carried-by', (req: Request, res: Response) => {
  try {
    res.status(200).json(setRuleCarriedBy(req.projectId!, req.params.id, (req.body as Record<string, unknown>).event_ids));
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
