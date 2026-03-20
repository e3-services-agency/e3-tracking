/**
 * Properties API routes.
 * All routes require workspace context (x-workspace-id) and enforce audit rules where applicable.
 */
import { Router, type Request, type Response } from 'express';
import { requireWorkspace } from '../middleware/workspace';
import { createAuditValidator } from '../middleware/auditValidator';
import { getWorkspaceSettings } from '../dal/workspace.dal';
import * as PropertyDAL from '../dal/property.dal';
import { ConflictError, DatabaseError, NotFoundError } from '../errors';
import type { CreatePropertyInput, PropertyContext, PropertyDataType, PiiStatus, PropertyMappingType } from '../../types/schema';

const router = Router();

const CONTEXTS: PropertyContext[] = ['event_property', 'user_property', 'system_property'];
const DATA_TYPES: PropertyDataType[] = ['string', 'integer', 'float', 'boolean', 'object', 'list'];
const PII_STATUSES: PiiStatus[] = ['none', 'sensitive', 'highly_sensitive'];

const propertyAuditValidator = createAuditValidator(getWorkspaceSettings, { entity: 'property' });

/**
 * GET /api/properties
 * List properties for the workspace. Requires x-workspace-id.
 */
router.get('/', requireWorkspace, async (req: Request, res: Response, next: import('express').NextFunction): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  try {
    const list = await PropertyDAL.listProperties(workspaceId);
    res.status(200).json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/properties
 * Create a property. Requires x-workspace-id. Body validated against workspace audit rules.
 */
router.post(
  '/',
  requireWorkspace,
  propertyAuditValidator,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const context = body.context as string | undefined;
    const dataType = body.data_type as string | undefined;

    if (!name) {
      res.status(400).json({
        error: 'Property name is required.',
        code: 'NAME_REQUIRED',
        field: 'name',
      });
      return;
    }
    if (!context || !CONTEXTS.includes(context as PropertyContext)) {
      res.status(400).json({
        error: `Property context is required and must be one of: ${CONTEXTS.join(', ')}.`,
        code: 'CONTEXT_INVALID',
        field: 'context',
      });
      return;
    }
    if (!dataType || !DATA_TYPES.includes(dataType as PropertyDataType)) {
      res.status(400).json({
        error: `data_type is required and must be one of: ${DATA_TYPES.join(', ')}.`,
        code: 'DATA_TYPE_INVALID',
        field: 'data_type',
      });
      return;
    }

    const piiStatus = (body.pii_status as string) ?? 'none';
    if (!PII_STATUSES.includes(piiStatus as PiiStatus)) {
      res.status(400).json({
        error: `pii_status must be one of: ${PII_STATUSES.join(', ')}.`,
        code: 'PII_STATUS_INVALID',
        field: 'pii_status',
      });
      return;
    }

    const propertyData: CreatePropertyInput = {
      context: context as PropertyContext,
      name,
      data_type: dataType as PropertyDataType,
      description: typeof body.description === 'string' ? body.description : undefined,
      category: typeof body.category === 'string' ? body.category : undefined,
      pii_status: piiStatus as PiiStatus,
      data_format: typeof body.data_format === 'string' ? body.data_format : undefined,
      is_list: Boolean(body.is_list),
      example_values_json: (body.example_values_json ?? undefined) as string | undefined,
      name_mappings_json: (body.name_mappings_json ?? undefined) as string | undefined,
      mapped_catalog_id: typeof body.mapped_catalog_id === 'string' ? (body.mapped_catalog_id as string) : undefined,
      mapped_catalog_field_id: typeof body.mapped_catalog_field_id === 'string' ? (body.mapped_catalog_field_id as string) : undefined,
      mapping_type: body.mapping_type === 'lookup_key' || body.mapping_type === 'mapped_value' ? (body.mapping_type as PropertyMappingType) : undefined,
    };

    try {
      const created = await PropertyDAL.createProperty(workspaceId, propertyData);
      res.status(201).json(created);
    } catch (err) {
      console.error(err);
      if (err instanceof ConflictError) {
        res.status(409).json({
          error: err.message,
          code: err.code,
          details: err.details,
        });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({
          error: 'Failed to create property.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * PATCH /api/properties/:id
 * Update a property (e.g. catalog mapping). Body: partial fields.
 */
router.patch(
  '/:id',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const propertyId = req.params.id;
    const body = req.body as Record<string, unknown>;
    const updates: Parameters<typeof PropertyDAL.updateProperty>[2] = {};
    if (body.context !== undefined && CONTEXTS.includes(body.context as PropertyContext)) {
      updates.context = body.context as PropertyContext;
    }
    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.description === 'string' || body.description === null) updates.description = body.description as string | null;
    if (typeof body.category === 'string' || body.category === null) updates.category = body.category as string | null;
    if (body.pii_status !== undefined && PII_STATUSES.includes(body.pii_status as PiiStatus)) {
      updates.pii_status = body.pii_status as PiiStatus;
    }
    if (body.data_type !== undefined && DATA_TYPES.includes(body.data_type as PropertyDataType)) {
      updates.data_type = body.data_type as PropertyDataType;
    }
    if (body.data_format !== undefined) updates.data_format = body.data_format === null ? null : String(body.data_format);
    if (typeof body.is_list === 'boolean') updates.is_list = body.is_list;
    if (body.example_values_json !== undefined) updates.example_values_json = body.example_values_json as string | null;
    if (body.name_mappings_json !== undefined) updates.name_mappings_json = body.name_mappings_json as string | null;
    if (body.mapped_catalog_id !== undefined) {
      updates.mapped_catalog_id = typeof body.mapped_catalog_id === 'string' ? (body.mapped_catalog_id as string) : null;
    }
    if (body.mapped_catalog_field_id !== undefined) {
      updates.mapped_catalog_field_id = typeof body.mapped_catalog_field_id === 'string' ? (body.mapped_catalog_field_id as string) : null;
    }
    if (body.mapping_type === 'lookup_key' || body.mapping_type === 'mapped_value' || body.mapping_type === null) {
      updates.mapping_type = body.mapping_type as PropertyMappingType | null;
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update.', code: 'NO_UPDATES' });
      return;
    }
    try {
      const updated = await PropertyDAL.updateProperty(workspaceId, propertyId, updates);
      res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({ error: 'Failed to update property.', code: err.code });
        return;
      }
      res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    }
  }
);

/**
 * DELETE /api/properties/:id
 * Soft-delete a property. Requires x-workspace-id.
 */
router.delete(
  '/:id',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    const propertyId = req.params.id;
    try {
      await PropertyDAL.deleteProperty(workspaceId, propertyId);
      res.status(204).send('');
    } catch (err) {
      console.error(err);
      if (err instanceof NotFoundError) {
        res.status(404).json({
          error: err.message,
          code: err.code,
          resource: err.resource,
        });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({
          error: 'Failed to delete property.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

export default router;
