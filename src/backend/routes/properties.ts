/**
 * Property routes, mounted at `/api/projects/:projectId/properties` behind `requireProject`.
 * `GET ?scope=event|customer` filters; the rest is plain CRUD (D-24). T-1-04 adds the
 * allowed-values / role validation described in the plan; this task stores what it is given.
 */
import { Router, type Request, type Response } from 'express';
import * as PropertyDAL from '../dal/property.dal';
import * as PropertyDefinitionDAL from '../dal/property-definition.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
    res.status(200).json(PropertyDAL.listProperties(req.projectId!, { scope }));
  } catch (err) {
    handleRouteError(err, res);
  }
});

function inputFromBody(body: Record<string, unknown>): Partial<PropertyDAL.PropertyInput> {
  const input: Partial<PropertyDAL.PropertyInput> = {};
  if (typeof body.scope === 'string') input.scope = body.scope as 'event' | 'customer';
  if (typeof body.name === 'string') input.name = body.name;
  if ('description' in body) input.description = body.description as string | null;
  if ('category' in body) input.category = body.category as string | null;
  if ('category_override' in body) input.category_override = body.category_override as string | null;
  if ('notes' in body) input.notes = body.notes as string | null;
  if (typeof body.data_type === 'string') input.data_type = body.data_type;
  if ('data_formats_json' in body) input.data_formats_json = body.data_formats_json;
  if (typeof body.pii === 'boolean') input.pii = body.pii;
  if (typeof body.property_type === 'string') input.property_type = body.property_type;
  if ('allowed_values_json' in body) input.allowed_values_json = body.allowed_values_json;
  if ('example_values_json' in body) input.example_values_json = body.example_values_json;
  if ('value_schema_json' in body) input.value_schema_json = body.value_schema_json;
  if ('object_child_property_refs_json' in body) {
    input.object_child_property_refs_json = body.object_child_property_refs_json;
  }
  if ('item_schema_json' in body) input.item_schema_json = body.item_schema_json;
  if (typeof body.kind === 'string') input.kind = body.kind;
  if ('derivation_json' in body) input.derivation_json = body.derivation_json;
  if ('bloomreach_customer_property' in body) {
    input.bloomreach_customer_property = body.bloomreach_customer_property as string | null;
  }
  if ('priority' in body) input.priority = body.priority as string | null;
  if ('status' in body) input.status = body.status as string | null;
  if ('mapped_catalog_id' in body) input.mapped_catalog_id = body.mapped_catalog_id as string | null;
  if ('mapped_catalog_field_id' in body) {
    input.mapped_catalog_field_id = body.mapped_catalog_field_id as string | null;
  }
  if ('mapping_type' in body) input.mapping_type = body.mapping_type as string | null;
  if ('bundle_ids' in body) input.bundle_ids = body.bundle_ids as string[] | null;
  return input;
}

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const scope = typeof body.scope === 'string' ? body.scope : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const data_type = typeof body.data_type === 'string' ? body.data_type : '';
  if (scope !== 'event' && scope !== 'customer') {
    res.status(400).json({ error: 'scope must be "event" or "customer".', code: 'SCOPE_REQUIRED', field: 'scope' });
    return;
  }
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  if (!data_type) {
    res.status(400).json({ error: 'data_type is required.', code: 'DATA_TYPE_REQUIRED', field: 'data_type' });
    return;
  }
  try {
    const property = PropertyDAL.createProperty(req.projectId!, {
      ...inputFromBody(body),
      scope,
      name,
      data_type,
    } as PropertyDAL.PropertyInput);
    res.status(201).json(property);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const property = PropertyDAL.getPropertyOrThrow(req.projectId!, req.params.id);
    res.status(200).json(property);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const property = PropertyDAL.updateProperty(
      req.projectId!,
      req.params.id,
      inputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(property);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    PropertyDAL.deleteProperty(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

// ---- D-58 (T-4-00): named definitions under a property ----

function definitionInputFromBody(body: Record<string, unknown>): Partial<PropertyDefinitionDAL.PropertyDefinitionInput> {
  const input: Partial<PropertyDefinitionDAL.PropertyDefinitionInput> = {};
  if (typeof body.name === 'string') input.name = body.name;
  if ('description' in body) input.description = body.description as string | null;
  if ('allowed_values_json' in body) input.allowed_values_json = body.allowed_values_json;
  if ('formats_json' in body) input.formats_json = body.formats_json;
  if ('example_values_json' in body) input.example_values_json = body.example_values_json;
  return input;
}

router.get('/:id/definitions', (req: Request, res: Response) => {
  try {
    PropertyDAL.getPropertyOrThrow(req.projectId!, req.params.id);
    const definitions = PropertyDefinitionDAL.listDefinitions(req.projectId!, req.params.id);
    const usingEventsByDefinitionId = PropertyDefinitionDAL.listUsingEventNamesByDefinitionId(req.projectId!, req.params.id);
    res.status(200).json(
      definitions.map((d) => ({ ...d, using_events: usingEventsByDefinitionId.get(d.id) ?? [] }))
    );
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/:id/definitions', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const definition = PropertyDefinitionDAL.createDefinition(req.projectId!, req.params.id, {
      ...definitionInputFromBody(body),
      name,
    } as PropertyDefinitionDAL.PropertyDefinitionInput);
    res.status(201).json(definition);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id/definitions/:definitionId', (req: Request, res: Response) => {
  try {
    const definition = PropertyDefinitionDAL.updateDefinition(
      req.projectId!,
      req.params.id,
      req.params.definitionId,
      definitionInputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(definition);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id/definitions/:definitionId', (req: Request, res: Response) => {
  try {
    PropertyDefinitionDAL.deleteDefinition(req.projectId!, req.params.id, req.params.definitionId);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.put('/:id/definitions/order', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const order = Array.isArray(body.order) ? (body.order as unknown[]).filter((v): v is string => typeof v === 'string') : null;
  if (!order) {
    res.status(400).json({ error: 'order must be an array of definition ids.', code: 'ORDER_REQUIRED', field: 'order' });
    return;
  }
  try {
    res.status(200).json(PropertyDefinitionDAL.reorderDefinitions(req.projectId!, req.params.id, order));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
