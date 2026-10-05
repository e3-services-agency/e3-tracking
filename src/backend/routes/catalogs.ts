/**
 * Catalog and CatalogField routes, mounted at `/api/projects/:projectId/catalogs`.
 */
import { Router, type Request, type Response } from 'express';
import * as CatalogDAL from '../dal/catalog.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function catalogInputFromBody(body: Record<string, unknown>): Partial<CatalogDAL.CatalogInput> {
  const input: Partial<CatalogDAL.CatalogInput> = {};
  if (typeof body.name === 'string') input.name = body.name;
  if ('description' in body) input.description = body.description as string | null;
  if ('owner' in body) input.owner = body.owner as string | null;
  if ('source_system' in body) input.source_system = body.source_system as string | null;
  if ('sync_method' in body) input.sync_method = body.sync_method as string | null;
  if ('update_frequency' in body) input.update_frequency = body.update_frequency as string | null;
  if ('catalog_type' in body) input.catalog_type = body.catalog_type as string | null;
  if ('mapping_role' in body) input.mapping_role = body.mapping_role as string | null;
  if ('client_name' in body) input.client_name = body.client_name as string | null;
  if ('purpose' in body) input.purpose = body.purpose as string | null;
  if ('priority' in body) input.priority = body.priority as string | null;
  if ('status' in body) input.status = body.status as string | null;
  if ('kind' in body) input.kind = body.kind as string;
  if ('market' in body) input.market = body.market as string | null;
  if ('language' in body) input.language = body.language as string | null;
  if ('version' in body) input.version = body.version as string;
  return input;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(CatalogDAL.listCatalogs(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const catalog = CatalogDAL.createCatalog(req.projectId!, { ...catalogInputFromBody(body), name });
    res.status(201).json(catalog);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const catalog = CatalogDAL.getCatalogOrThrow(req.projectId!, req.params.id);
    const fields = CatalogDAL.listCatalogFields(req.projectId!, req.params.id);
    res.status(200).json({ ...catalog, fields });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const catalog = CatalogDAL.updateCatalog(
      req.projectId!,
      req.params.id,
      catalogInputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(catalog);
  } catch (err) {
    handleRouteError(err, res);
  }
});

// D-61 (T-4-11B): mark the catalog live (sets live_at and the searchable snapshot) or take it off live.
router.post('/:id/live', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { live?: unknown };
  try {
    res.status(200).json(CatalogDAL.setCatalogLive(req.projectId!, req.params.id, body.live !== false));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    CatalogDAL.deleteCatalog(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

function fieldInputFromBody(body: Record<string, unknown>): Partial<CatalogDAL.CatalogFieldInput> {
  const input: Partial<CatalogDAL.CatalogFieldInput> = {};
  if (typeof body.name === 'string') input.name = body.name;
  if ('description' in body) input.description = body.description as string | null;
  if ('data_type' in body) input.data_type = body.data_type as string | null;
  if (typeof body.is_lookup_key === 'boolean') input.is_lookup_key = body.is_lookup_key;
  if (typeof body.is_searchable === 'boolean') input.is_searchable = body.is_searchable;
  if (typeof body.is_required === 'boolean') input.is_required = body.is_required;
  if ('client_field_name' in body) input.client_field_name = body.client_field_name as string | null;
  if ('bloomreach_column' in body) input.bloomreach_column = body.bloomreach_column as string | null;
  if ('purpose' in body) input.purpose = body.purpose as string | null;
  if ('priority' in body) input.priority = body.priority as string | null;
  if ('status' in body) input.status = body.status as string | null;
  if ('field_family' in body) input.field_family = body.field_family as string | null;
  if ('item_level' in body) input.item_level = body.item_level as string | null;
  if ('source_mapping_json' in body) input.source_mapping_json = body.source_mapping_json;
  return input;
}

router.get('/:id/fields', (req: Request, res: Response) => {
  try {
    res.status(200).json(CatalogDAL.listCatalogFields(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/:id/fields', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const field = CatalogDAL.createCatalogField(req.projectId!, req.params.id, {
      ...fieldInputFromBody(body),
      name,
    });
    res.status(201).json(field);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id/fields/:fieldId', (req: Request, res: Response) => {
  try {
    const field = CatalogDAL.updateCatalogField(
      req.projectId!,
      req.params.id,
      req.params.fieldId,
      fieldInputFromBody(req.body as Record<string, unknown>)
    );
    res.status(200).json(field);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id/fields/:fieldId', (req: Request, res: Response) => {
  try {
    CatalogDAL.deleteCatalogField(req.projectId!, req.params.id, req.params.fieldId);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
