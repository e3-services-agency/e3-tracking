/**
 * Catalogs & Catalog Fields API.
 * Mount at /api/catalogs. All routes require x-workspace-id (requireWorkspace).
 */
import { Router, type Request, type Response } from 'express';
import { requireWorkspace } from '../middleware/workspace';
import * as CatalogService from '../services/catalog.service';
import { DatabaseError, NotFoundError } from '../errors';
import {
  CATALOG_FIELD_DATA_TYPES,
  CATALOG_FIELD_FAMILIES,
  CATALOG_FIELD_ITEM_LEVELS,
  CATALOG_FIELD_SOURCE_MAPPING_TYPES,
  CATALOG_TYPES,
  type CatalogFieldDataType,
  type CatalogFieldFamily,
  type CatalogFieldItemLevel,
  type CatalogFieldSourceMapping,
  type CatalogType,
} from '../../types/schema';

const router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCatalogType(value: unknown): CatalogType | undefined {
  return typeof value === 'string' && CATALOG_TYPES.includes(value as CatalogType)
    ? (value as CatalogType)
    : undefined;
}

function parseCatalogFieldSourceMapping(
  value: unknown
): { value?: CatalogFieldSourceMapping | null; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (value === null) {
    return { value: null };
  }
  if (!isRecord(value)) {
    return { error: 'source_mapping_json must be an object when provided.' };
  }

  const mappingType = value.mapping_type;
  const sourceValue = value.source_value;

  if (
    typeof mappingType !== 'string' ||
    !CATALOG_FIELD_SOURCE_MAPPING_TYPES.includes(
      mappingType as CatalogFieldSourceMapping['mapping_type']
    )
  ) {
    return {
      error: `source_mapping_json.mapping_type must be one of: ${CATALOG_FIELD_SOURCE_MAPPING_TYPES.join(', ')}.`,
    };
  }
  if (typeof sourceValue !== 'string' || !sourceValue.trim()) {
    return { error: 'source_mapping_json.source_value must be a non-empty string.' };
  }

  return {
    value: {
      mapping_type: mappingType as CatalogFieldSourceMapping['mapping_type'],
      source_value: sourceValue.trim(),
    },
  };
}

/**
 * GET /api/catalogs
 * List catalogs for the workspace.
 */
router.get('/', requireWorkspace, async (req: Request, res: Response, next: import('express').NextFunction): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  try {
    const list = await CatalogService.listCatalogs(workspaceId);
    res.status(200).json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalogs
 * Create a catalog.
 */
router.post('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'Catalog name is required.', code: 'NAME_REQUIRED' });
    return;
  }
  if (body.catalog_type !== undefined && !parseCatalogType(body.catalog_type)) {
    res.status(400).json({
      error: `catalog_type must be one of: ${CATALOG_TYPES.join(', ')}.`,
      code: 'CATALOG_TYPE_INVALID',
    });
    return;
  }
  try {
    const catalog = await CatalogService.createCatalog(workspaceId, {
      name,
      description: typeof body.description === 'string' ? body.description : undefined,
      owner: typeof body.owner === 'string' ? body.owner : '',
      source_system: typeof body.source_system === 'string' ? body.source_system : '',
      sync_method: typeof body.sync_method === 'string' ? body.sync_method : '',
      update_frequency: typeof body.update_frequency === 'string' ? body.update_frequency : '',
      catalog_type: parseCatalogType(body.catalog_type),
    });
    res.status(201).json(catalog);
  } catch (err) {
    console.error(err);
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to create catalog.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/catalogs/:id/fields
 * List fields for a catalog. (Define before /:id so "fields" is not captured as id.)
 */
router.get('/:id/fields', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const catalogId = req.params.id;
  try {
    const fields = await CatalogService.listCatalogFields(workspaceId, catalogId);
    res.status(200).json(fields);
  } catch (err) {
    console.error(err);
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to list catalog fields.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/catalogs/:id/fields
 * Create a catalog field.
 */
router.post('/:id/fields', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const catalogId = req.params.id;
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'Field name is required.', code: 'NAME_REQUIRED' });
    return;
  }
  const dataType =
    typeof body.data_type === 'string'
      ? body.data_type
      : typeof body.type === 'string'
        ? body.type
        : 'string';
  if (!CATALOG_FIELD_DATA_TYPES.includes(dataType as CatalogFieldDataType)) {
    res.status(400).json({
      error: `data_type must be one of: ${CATALOG_FIELD_DATA_TYPES.join(', ')}.`,
      code: 'DATA_TYPE_INVALID',
    });
    return;
  }
  const fieldFamily =
    typeof body.field_family === 'string' ? body.field_family : 'custom';
  if (!CATALOG_FIELD_FAMILIES.includes(fieldFamily as CatalogFieldFamily)) {
    res.status(400).json({
      error: `field_family must be one of: ${CATALOG_FIELD_FAMILIES.join(', ')}.`,
      code: 'FIELD_FAMILY_INVALID',
    });
    return;
  }
  const itemLevel =
    typeof body.item_level === 'string' ? body.item_level : 'general';
  if (!CATALOG_FIELD_ITEM_LEVELS.includes(itemLevel as CatalogFieldItemLevel)) {
    res.status(400).json({
      error: `item_level must be one of: ${CATALOG_FIELD_ITEM_LEVELS.join(', ')}.`,
      code: 'ITEM_LEVEL_INVALID',
    });
    return;
  }
  const parsedSourceMapping = parseCatalogFieldSourceMapping(body.source_mapping_json);
  if (parsedSourceMapping.error) {
    res.status(400).json({
      error: parsedSourceMapping.error,
      code: 'SOURCE_MAPPING_INVALID',
    });
    return;
  }
  try {
    const field = await CatalogService.createCatalogField(workspaceId, catalogId, {
      name,
      description: typeof body.description === 'string' ? body.description : null,
      data_type: dataType as CatalogFieldDataType,
      is_lookup_key: Boolean(body.is_lookup_key),
      field_family: fieldFamily as CatalogFieldFamily,
      item_level: itemLevel as CatalogFieldItemLevel,
      source_mapping_json: parsedSourceMapping.value ?? null,
    });
    res.status(201).json(field);
  } catch (err) {
    console.error(err);
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to create catalog field.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/catalogs/:id
 * Get one catalog by id.
 */
router.get('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const catalogId = req.params.id;
  try {
    const catalog = await CatalogService.getCatalog(workspaceId, catalogId);
    if (!catalog) {
      res.status(404).json({ error: 'Catalog not found.', code: 'NOT_FOUND' });
      return;
    }
    res.status(200).json(catalog);
  } catch (err) {
    console.error(err);
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to get catalog.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * PATCH /api/catalogs/:id
 * Update a catalog.
 */
router.patch('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const catalogId = req.params.id;
  const body = req.body as Record<string, unknown>;
  if (body.catalog_type !== undefined && !parseCatalogType(body.catalog_type)) {
    res.status(400).json({
      error: `catalog_type must be one of: ${CATALOG_TYPES.join(', ')}.`,
      code: 'CATALOG_TYPE_INVALID',
    });
    return;
  }
  try {
    const catalog = await CatalogService.updateCatalog(workspaceId, catalogId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: body.description !== undefined ? (typeof body.description === 'string' ? body.description : null) : undefined,
      owner: typeof body.owner === 'string' ? body.owner : undefined,
      source_system: typeof body.source_system === 'string' ? body.source_system : undefined,
      sync_method: typeof body.sync_method === 'string' ? body.sync_method : undefined,
      update_frequency: typeof body.update_frequency === 'string' ? body.update_frequency : undefined,
      catalog_type: parseCatalogType(body.catalog_type),
    });
    res.status(200).json(catalog);
  } catch (err) {
    console.error(err);
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to update catalog.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * DELETE /api/catalogs/:id
 * Delete a catalog (and its fields via FK cascade).
 */
router.delete('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const catalogId = req.params.id;
  try {
    await CatalogService.deleteCatalog(workspaceId, catalogId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to delete catalog.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * PATCH /api/catalogs/:catalogId/fields/:fieldId
 * Update a catalog field (e.g. set as lookup key).
 */
router.patch(
  '/:catalogId/fields/:fieldId',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
      return;
    }
    const { catalogId, fieldId } = req.params;
    const body = req.body as Record<string, unknown>;
    const setLookupKey = body.is_lookup_key === true;
    try {
      if (setLookupKey) {
        const field = await CatalogService.setCatalogFieldLookupKey(
          workspaceId,
          catalogId,
          fieldId
        );
        res.status(200).json(field);
        return;
      }
      if (
        body.data_type !== undefined &&
        (!(
          typeof body.data_type === 'string' &&
          CATALOG_FIELD_DATA_TYPES.includes(body.data_type as CatalogFieldDataType)
        ))
      ) {
        res.status(400).json({
          error: `data_type must be one of: ${CATALOG_FIELD_DATA_TYPES.join(', ')}.`,
          code: 'DATA_TYPE_INVALID',
        });
        return;
      }
      if (
        body.field_family !== undefined &&
        (!(
          typeof body.field_family === 'string' &&
          CATALOG_FIELD_FAMILIES.includes(body.field_family as CatalogFieldFamily)
        ))
      ) {
        res.status(400).json({
          error: `field_family must be one of: ${CATALOG_FIELD_FAMILIES.join(', ')}.`,
          code: 'FIELD_FAMILY_INVALID',
        });
        return;
      }
      if (
        body.item_level !== undefined &&
        (!(
          typeof body.item_level === 'string' &&
          CATALOG_FIELD_ITEM_LEVELS.includes(body.item_level as CatalogFieldItemLevel)
        ))
      ) {
        res.status(400).json({
          error: `item_level must be one of: ${CATALOG_FIELD_ITEM_LEVELS.join(', ')}.`,
          code: 'ITEM_LEVEL_INVALID',
        });
        return;
      }
      const parsedSourceMapping = parseCatalogFieldSourceMapping(body.source_mapping_json);
      if (parsedSourceMapping.error) {
        res.status(400).json({
          error: parsedSourceMapping.error,
          code: 'SOURCE_MAPPING_INVALID',
        });
        return;
      }
      const field = await CatalogService.updateCatalogField(
        workspaceId,
        catalogId,
        fieldId,
        {
          name: typeof body.name === 'string' ? body.name : undefined,
          description:
            body.description !== undefined
              ? (typeof body.description === 'string' ? body.description : null)
              : undefined,
          data_type:
            typeof body.data_type === 'string'
              ? (body.data_type as CatalogFieldDataType)
              : undefined,
          field_family:
            typeof body.field_family === 'string'
              ? (body.field_family as CatalogFieldFamily)
              : undefined,
          item_level:
            typeof body.item_level === 'string'
              ? (body.item_level as CatalogFieldItemLevel)
              : undefined,
          source_mapping_json: parsedSourceMapping.value,
        }
      );
      res.status(200).json(field);
    } catch (err) {
      console.error(err);
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({ error: 'Failed to update catalog field.', code: err.code });
        return;
      }
      res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    }
  }
);

/**
 * DELETE /api/catalogs/:catalogId/fields/:fieldId
 * Delete a catalog field.
 */
router.delete(
  '/:catalogId/fields/:fieldId',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
      return;
    }
    const { catalogId, fieldId } = req.params;
    try {
      await CatalogService.deleteCatalogField(workspaceId, catalogId, fieldId);
      res.status(204).send();
    } catch (err) {
      console.error(err);
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({ error: 'Failed to delete catalog field.', code: err.code });
        return;
      }
      res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    }
  }
);

export default router;