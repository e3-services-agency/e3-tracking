/**
 * Event routes, mounted at `/api/projects/:projectId/events` behind `requireProject`.
 * `PUT /:id/properties` replaces the ordered link list (D-16); `POST /:id/properties` attaches
 * one property; `PATCH/DELETE /:id/properties/:propertyId` edit/detach one link.
 */
import { Router, type Request, type Response } from 'express';
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(EventDAL.listEvents(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

function inputFromBody(body: Record<string, unknown>): Partial<EventDAL.EventInput> {
  const input: Partial<EventDAL.EventInput> = {};
  if (typeof body.name === 'string') input.name = body.name;
  if ('business_name' in body) input.business_name = body.business_name as string | null;
  if ('description' in body) input.description = body.description as string | null;
  if ('purpose' in body) input.purpose = body.purpose as string | null;
  if ('page' in body) input.page = body.page as string | null;
  if ('trigger_text' in body) input.trigger_text = body.trigger_text as string | null;
  if ('grain' in body) input.grain = body.grain as string | null;
  if ('identity_note' in body) input.identity_note = body.identity_note as string | null;
  if ('triggers_json' in body) input.triggers_json = body.triggers_json;
  if (typeof body.event_type === 'string') input.event_type = body.event_type;
  if ('owner_business' in body) input.owner_business = body.owner_business as string | null;
  if ('owner_technical' in body) input.owner_technical = body.owner_technical as string | null;
  if ('priority' in body) input.priority = body.priority as string | null;
  if (typeof body.status === 'string') input.status = body.status;
  if ('expiration_json' in body) input.expiration_json = body.expiration_json;
  if ('not_suitable_for' in body) input.not_suitable_for = body.not_suitable_for as string | null;
  if ('agent_instructions' in body) input.agent_instructions = body.agent_instructions as string | null;
  if ('derived_metrics_json' in body) input.derived_metrics_json = body.derived_metrics_json;
  if ('tags_json' in body) input.tags_json = body.tags_json;
  if ('source_ids' in body) input.source_ids = body.source_ids as string[] | null;
  return input;
}

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const event = EventDAL.createEvent(req.projectId!, { ...inputFromBody(body), name });
    res.status(201).json(event);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(EventDAL.getEventWithProperties(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const event = EventDAL.updateEvent(req.projectId!, req.params.id, inputFromBody(req.body as Record<string, unknown>));
    res.status(200).json(event);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    EventDAL.deleteEvent(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

function linkInputFromBody(body: Record<string, unknown>): EventDAL.EventPropertyInput {
  return {
    property_id: String(body.property_id ?? ''),
    required: typeof body.required === 'boolean' ? body.required : undefined,
    role: typeof body.role === 'string' ? body.role : undefined,
    priority: 'priority' in body ? (body.priority as string | null) : undefined,
    status: 'status' in body ? (body.status as string | null) : undefined,
    source_id: 'source_id' in body ? (body.source_id as string | null) : undefined,
    payload_key: 'payload_key' in body ? (body.payload_key as string | null) : undefined,
    description_override:
      'description_override' in body ? (body.description_override as string | null) : undefined,
    example_values_override_json:
      'example_values_override_json' in body ? body.example_values_override_json : undefined,
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : undefined,
  };
}

router.post('/:id/properties', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.property_id || typeof body.property_id !== 'string') {
    res.status(400).json({ error: 'property_id is required.', code: 'PROPERTY_ID_REQUIRED', field: 'property_id' });
    return;
  }
  try {
    const link = EventDAL.attachPropertyToEvent(req.projectId!, req.params.id, linkInputFromBody(body));
    res.status(201).json(link);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.put('/:id/properties', (req: Request, res: Response) => {
  const body = req.body as { properties?: unknown };
  if (!Array.isArray(body.properties)) {
    res.status(400).json({ error: 'properties must be an array.', code: 'PROPERTIES_REQUIRED', field: 'properties' });
    return;
  }
  try {
    const links = body.properties.map((row) => linkInputFromBody(row as Record<string, unknown>));
    const result = EventDAL.replaceEventProperties(req.projectId!, req.params.id, links);
    res.status(200).json(result);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id/properties/:propertyId', (req: Request, res: Response) => {
  try {
    const link = EventDAL.updateEventProperty(
      req.projectId!,
      req.params.id,
      req.params.propertyId,
      linkInputFromBody({ property_id: req.params.propertyId, ...(req.body as Record<string, unknown>) })
    );
    res.status(200).json(link);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id/properties/:propertyId', (req: Request, res: Response) => {
  try {
    EventDAL.detachPropertyFromEvent(req.projectId!, req.params.id, req.params.propertyId);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

// ----- Variant (D-03, T-1-05): /api/projects/:projectId/events/:id/variants -----

function variantInputFromBody(body: Record<string, unknown>): Partial<VariantDAL.VariantInput> {
  const input: Partial<VariantDAL.VariantInput> = {};
  if ('conditions' in body) input.conditions = body.conditions as VariantDAL.VariantInput['conditions'];
  if ('description' in body) input.description = body.description as string | null;
  if ('expiration_json' in body) input.expiration_json = body.expiration_json;
  return input;
}

router.get('/:id/variants', (req: Request, res: Response) => {
  try {
    res.status(200).json(VariantDAL.listVariants(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/:id/variants', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!Array.isArray(body.conditions)) {
    res.status(400).json({ error: 'conditions is required.', code: 'CONDITIONS_REQUIRED', field: 'conditions' });
    return;
  }
  try {
    const variant = VariantDAL.createVariant(req.projectId!, req.params.id, {
      conditions: body.conditions as VariantDAL.VariantInput['conditions'],
      description: (body.description as string | null) ?? null,
      expiration_json: body.expiration_json ?? null,
    });
    res.status(201).json(variant);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id/variants/:variantId', (req: Request, res: Response) => {
  try {
    res.status(200).json(VariantDAL.getVariantOrThrow(req.projectId!, req.params.id, req.params.variantId));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id/variants/:variantId', (req: Request, res: Response) => {
  try {
    const variant = VariantDAL.updateVariant(
      req.projectId!,
      req.params.id,
      req.params.variantId,
      variantInputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(variant);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id/variants/:variantId', (req: Request, res: Response) => {
  try {
    VariantDAL.deleteVariant(req.projectId!, req.params.id, req.params.variantId);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
