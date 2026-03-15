/**
 * Catalogs & Catalog Fields API.
 * Mount at /api/catalogs. All routes require x-workspace-id (requireWorkspace).
 */
import { Router, type Request, type Response } from 'express';
import { requireWorkspace } from '../middleware/workspace.js';
import * as CatalogService from '../services/catalog.service.js';
import { DatabaseError, NotFoundError } from '../errors.js';

const router = Router();

/**
 * GET /api/catalogs
 * List catalogs for the workspace.
 */
router.get('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  try {
    const list = await CatalogService.listCatalogs(workspaceId);
    res.status(200).json(list);
  } catch (err) {
    console.error(err);
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to list catalogs.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
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
  const catalogType = body.catalog_type === 'Product' || body.catalog_type === 'Variant' || body.catalog_type === 'General'
    ? body.catalog_type
    : undefined;
  try {
    const catalog = await CatalogService.createCatalog(workspaceId, {
      name,
      description: typeof body.description === 'string' ? body.description : undefined,
      owner: typeof body.owner === 'string' ? body.owner : '',
      source_system: typeof body.source_system === 'string' ? body.source_system : '',
      sync_method: typeof body.sync_method === 'string' ? body.sync_method : '',
      update_frequency: typeof body.update_frequency === 'string' ? body.update_frequency : '',
      catalog_type: catalogType,
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
  const type = typeof body.type === 'string' ? body.type : 'string';
  try {
    const field = await CatalogService.createCatalogField(workspaceId, catalogId, {
      name,
      type: ['string', 'number', 'boolean'].includes(type) ? type : 'string',
      is_lookup_key: Boolean(body.is_lookup_key),
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
  try {
    const catalogTypePatch =
      body.catalog_type === 'Product' || body.catalog_type === 'Variant' || body.catalog_type === 'General'
        ? body.catalog_type
        : undefined;
    const catalog = await CatalogService.updateCatalog(workspaceId, catalogId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: body.description !== undefined ? (typeof body.description === 'string' ? body.description : null) : undefined,
      owner: typeof body.owner === 'string' ? body.owner : undefined,
      source_system: typeof body.source_system === 'string' ? body.source_system : undefined,
      sync_method: typeof body.sync_method === 'string' ? body.sync_method : undefined,
      update_frequency: typeof body.update_frequency === 'string' ? body.update_frequency : undefined,
      catalog_type: catalogTypePatch,
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
      const field = await CatalogService.updateCatalogField(
        workspaceId,
        catalogId,
        fieldId,
        {
          name: typeof body.name === 'string' ? body.name : undefined,
          type: typeof body.type === 'string' ? body.type : undefined,
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