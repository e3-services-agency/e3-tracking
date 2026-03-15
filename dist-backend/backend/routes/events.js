/**
 * Events API routes.
 * All routes require workspace context (x-workspace-id). Audit validator enforces naming on create.
 */
import { Router } from 'express';
import { requireWorkspace } from '../middleware/workspace.js';
import { createAuditValidator } from '../middleware/auditValidator.js';
import { getWorkspaceSettings } from '../dal/workspace.dal.js';
import * as EventDAL from '../dal/event.dal.js';
import { ConflictError, DatabaseError, NotFoundError } from '../errors.js';
import { buildCodegenSnippets } from '../services/codegen.service.js';
const router = Router();
const PRESENCE_VALUES = [
    'always_sent',
    'sometimes_sent',
    'never_sent',
];
const eventAuditValidator = createAuditValidator(getWorkspaceSettings, {
    entity: 'event',
});
/**
 * GET /api/events
 * List events with attached property counts (only non–soft-deleted properties). Requires x-workspace-id.
 */
router.get('/', requireWorkspace, async (req, res) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
        res.status(403).json({
            error: 'Workspace context required.',
            code: 'WORKSPACE_REQUIRED',
        });
        return;
    }
    try {
        const list = await EventDAL.listEvents(workspaceId);
        res.status(200).json(list);
    }
    catch (err) {
        console.error(err);
        if (err instanceof DatabaseError) {
            res.status(500).json({
                error: 'Failed to list events.',
                code: err.code,
            });
            return;
        }
        res.status(500).json({
            error: 'An unexpected error occurred.',
            code: 'INTERNAL_ERROR',
        });
    }
});
/**
 * GET /api/events/:id
 * Get one event with attached properties (only non–soft-deleted). Requires x-workspace-id.
 */
router.get('/:id', requireWorkspace, async (req, res) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
        res.status(403).json({
            error: 'Workspace context required.',
            code: 'WORKSPACE_REQUIRED',
        });
        return;
    }
    const eventId = req.params.id;
    try {
        const result = await EventDAL.getEventWithProperties(workspaceId, eventId);
        res.status(200).json(result);
    }
    catch (err) {
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
                error: 'Failed to fetch event.',
                code: err.code,
            });
            return;
        }
        res.status(500).json({
            error: 'An unexpected error occurred.',
            code: 'INTERNAL_ERROR',
        });
    }
});
/**
 * GET /api/events/:id/codegen
 * Returns code snippets for the event (dataLayer, Bloomreach SDK, Bloomreach API).
 */
router.get('/:id/codegen', requireWorkspace, async (req, res) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
        res.status(403).json({
            error: 'Workspace context required.',
            code: 'WORKSPACE_REQUIRED',
        });
        return;
    }
    const eventId = req.params.id;
    try {
        const { event, attached_properties } = await EventDAL.getEventWithProperties(workspaceId, eventId);
        const attached = attached_properties.map((p) => ({
            property_name: p.property_name || '',
            presence: p.presence,
        }));
        const snippets = buildCodegenSnippets(event.name, attached);
        res.status(200).json(snippets);
    }
    catch (err) {
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
                error: 'Failed to fetch event for codegen.',
                code: err.code,
            });
            return;
        }
        res.status(500).json({
            error: 'An unexpected error occurred.',
            code: 'INTERNAL_ERROR',
        });
    }
});
/**
 * POST /api/events
 * Create an event. Requires x-workspace-id. Body validated against workspace audit rules (naming).
 */
router.post('/', requireWorkspace, eventAuditValidator, async (req, res) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
        res.status(403).json({
            error: 'Workspace context required.',
            code: 'WORKSPACE_REQUIRED',
        });
        return;
    }
    const body = req.body;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
        res.status(400).json({
            error: 'Event name is required.',
            code: 'NAME_REQUIRED',
            field: 'name',
        });
        return;
    }
    const eventData = {
        name,
        description: typeof body.description === 'string' ? body.description : undefined,
        triggers_markdown: typeof body.triggers_markdown === 'string'
            ? body.triggers_markdown
            : undefined,
    };
    try {
        const created = await EventDAL.createEvent(workspaceId, eventData);
        res.status(201).json(created);
    }
    catch (err) {
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
                error: 'Failed to create event.',
                code: err.code,
            });
            return;
        }
        res.status(500).json({
            error: 'An unexpected error occurred.',
            code: 'INTERNAL_ERROR',
        });
    }
});
/**
 * POST /api/events/:id/properties
 * Attach a property to an event with a presence value. Body: { propertyId, presence }.
 * Returns 404 if event or property does not exist or does not belong to the workspace.
 */
router.post('/:id/properties', requireWorkspace, async (req, res) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
        res.status(403).json({
            error: 'Workspace context required.',
            code: 'WORKSPACE_REQUIRED',
        });
        return;
    }
    const eventId = req.params.id;
    const body = req.body;
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    const presence = body.presence;
    if (!propertyId) {
        res.status(400).json({
            error: 'propertyId is required.',
            code: 'PROPERTY_ID_REQUIRED',
            field: 'propertyId',
        });
        return;
    }
    if (!presence || !PRESENCE_VALUES.includes(presence)) {
        res.status(400).json({
            error: `presence is required and must be one of: ${PRESENCE_VALUES.join(', ')}.`,
            code: 'PRESENCE_INVALID',
            field: 'presence',
        });
        return;
    }
    try {
        const row = await EventDAL.attachPropertyToEvent(workspaceId, eventId, propertyId, presence);
        res.status(201).json(row);
    }
    catch (err) {
        console.error(err);
        if (err instanceof NotFoundError) {
            res.status(404).json({
                error: err.message,
                code: err.code,
                resource: err.resource,
            });
            return;
        }
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
                error: 'Failed to attach property to event.',
                code: err.code,
            });
            return;
        }
        res.status(500).json({
            error: 'An unexpected error occurred.',
            code: 'INTERNAL_ERROR',
        });
    }
});
/**
 * PATCH /api/events/:id/properties
 * Update presence for an already-attached property. Body: { propertyId, presence }.
 * Returns 404 if event, property, or link is not in workspace.
 */
router.patch('/:id/properties', requireWorkspace, async (req, res) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
        res.status(403).json({
            error: 'Workspace context required.',
            code: 'WORKSPACE_REQUIRED',
        });
        return;
    }
    const eventId = req.params.id;
    const body = req.body;
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    const presence = body.presence;
    if (!propertyId) {
        res.status(400).json({
            error: 'propertyId is required.',
            code: 'PROPERTY_ID_REQUIRED',
            field: 'propertyId',
        });
        return;
    }
    if (!presence || !PRESENCE_VALUES.includes(presence)) {
        res.status(400).json({
            error: `presence is required and must be one of: ${PRESENCE_VALUES.join(', ')}.`,
            code: 'PRESENCE_INVALID',
            field: 'presence',
        });
        return;
    }
    try {
        const row = await EventDAL.updatePropertyPresenceOnEvent(workspaceId, eventId, propertyId, presence);
        res.status(200).json(row);
    }
    catch (err) {
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
                error: 'Failed to update presence.',
                code: err.code,
            });
            return;
        }
        res.status(500).json({
            error: 'An unexpected error occurred.',
            code: 'INTERNAL_ERROR',
        });
    }
});
export default router;
