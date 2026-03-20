/**
 * Events API routes.
 * All routes require workspace context (x-workspace-id). Audit validator enforces naming on create.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { requireWorkspace } from '../middleware/workspace';
import { requireAuth } from '../middleware/auth';
import { createAuditValidator } from '../middleware/auditValidator';
import { getWorkspaceSettings } from '../dal/workspace.dal';
import * as EventDAL from '../dal/event.dal';
import { getSupabaseOrThrow } from '../db/supabase';
import { ConflictError, DatabaseError, NotFoundError } from '../errors';
import type {
  CreateEventInput,
  EventPropertyPresence,
  EventType,
  EventTriggerEntry,
} from '../../types/schema';
import { buildCodegenSnippets } from '../services/codegen.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ASSETS_BUCKET = 'assets';

const PRESENCE_VALUES: EventPropertyPresence[] = [
  'always_sent',
  'sometimes_sent',
  'never_sent',
];

const EVENT_TYPES: EventType[] = ['track', 'page', 'identify'];

const eventAuditValidator = createAuditValidator(getWorkspaceSettings, {
  entity: 'event',
});

function parseStringArrayField(
  value: unknown,
  fieldName: string
): { ok: true; value: string[] | null | undefined } | { ok: false; error: string } {
  if (typeof value === 'undefined') {
    return { ok: true, value: undefined };
  }
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: `${fieldName} must be an array when provided.` };
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  return { ok: true, value: [...new Set(normalized)] };
}

function parseStructuredTriggers(
  value: unknown
): { ok: true; value: EventTriggerEntry[] | null | undefined } | { ok: false; error: string } {
  if (typeof value === 'undefined') {
    return { ok: true, value: undefined };
  }

  if (value === null) {
    return { ok: true, value: null };
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: 'triggers must be an array when provided.' };
  }

  const triggers: EventTriggerEntry[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: `Trigger at index ${index} must be an object.` };
    }

    const raw = entry as Record<string, unknown>;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const description =
      typeof raw.description === 'string' ? raw.description.trim() : '';

    if (!title) {
      return { ok: false, error: `Trigger at index ${index} is missing title.` };
    }
    if (!description) {
      return { ok: false, error: `Trigger at index ${index} is missing description.` };
    }

    triggers.push({
      title,
      description,
      image: typeof raw.image === 'string' ? raw.image : null,
      source: typeof raw.source === 'string' ? raw.source.trim() || null : null,
      order:
        typeof raw.order === 'number' && Number.isFinite(raw.order)
          ? raw.order
          : index,
    });
  }

  return {
    ok: true,
    value: triggers.sort((a, b) => a.order - b.order),
  };
}

function safeFilename(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}

async function ensureAssetsBucketReady(): Promise<void> {
  const supabase = getSupabaseOrThrow();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new DatabaseError(`Failed to list storage buckets: ${listError.message}`, listError);
  }

  const hasAssetsBucket = (buckets ?? []).some((bucket) => bucket.name === ASSETS_BUCKET);
  if (hasAssetsBucket) return;

  const { error: createError } = await supabase.storage.createBucket(ASSETS_BUCKET, {
    public: true,
  });
  if (createError) {
    const message = createError.message || 'Failed to create assets bucket.';
    const alreadyExists =
      message.toLowerCase().includes('already exists') ||
      message.toLowerCase().includes('duplicate');
    if (alreadyExists) return;
    throw new DatabaseError(`Failed to create assets bucket: ${message}`, createError);
  }
}

router.post(
  '/:id/triggers/images',
  requireWorkspace,
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    const eventId = req.params.id;
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'Image file is required.',
        code: 'FILE_REQUIRED',
      });
      return;
    }

    try {
      const event = await EventDAL.getEventById(workspaceId, eventId);
      if (!event) {
        res.status(404).json({
          error: 'Event not found.',
          code: 'NOT_FOUND',
          resource: 'event',
        });
        return;
      }

      await ensureAssetsBucketReady();
      const supabase = getSupabaseOrThrow();
      const safeName = safeFilename(file.originalname || 'trigger-image');
      const objectPath = `events/${workspaceId}/${eventId}/triggers/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(ASSETS_BUCKET)
        .upload(objectPath, file.buffer, {
          upsert: true,
          contentType: file.mimetype || 'application/octet-stream',
          cacheControl: '3600',
        });

      if (uploadError) {
        res.status(500).json({
          error: uploadError.message,
          code: 'STORAGE_UPLOAD_FAILED',
        });
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(ASSETS_BUCKET)
        .getPublicUrl(objectPath);
      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) {
        res.status(500).json({
          error: 'Failed to generate public URL.',
          code: 'STORAGE_URL_FAILED',
        });
        return;
      }

      res.status(200).json({
        path: objectPath,
        url: publicUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload trigger image.';
      res.status(500).json({
        error: message,
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * GET /api/events
 * List events with attached property counts (only non–soft-deleted properties). Requires x-workspace-id.
 */
router.get('/', requireWorkspace, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/events/:id
 * Get one event with attached properties (only non–soft-deleted). Requires x-workspace-id.
 */
router.get('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
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
router.get('/:id/codegen', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
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
    const { event, attached_properties } = await EventDAL.getEventWithProperties(
      workspaceId,
      eventId
    );
    const attached = attached_properties.map((p) => ({
      property_name: p.property_name || '',
      presence: p.presence,
    }));
    const snippets = buildCodegenSnippets(event.name, attached);
    res.status(200).json(snippets);
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
router.post(
  '/',
  requireWorkspace,
  eventAuditValidator,
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
    const purposeRaw =
      typeof body.purpose === 'string'
        ? body.purpose
        : body.purpose === null || typeof body.purpose === 'undefined'
          ? body.purpose
          : Symbol('invalid-purpose');
    const eventTypeRaw =
      typeof body.eventType === 'string'
        ? body.eventType.trim()
        : typeof body.event_type === 'string'
          ? body.event_type.trim()
          : body.eventType === null || body.event_type === null
            ? null
            : undefined;
    const ownerTeamIdRaw =
      typeof body.ownerTeamId === 'string'
        ? body.ownerTeamId
        : typeof body.owner_team_id === 'string'
          ? body.owner_team_id
          : '';
    const parsedCategories = parseStringArrayField(body.categories, 'categories');
    const parsedTags = parseStringArrayField(body.tags, 'tags');
    const parsedSourceIds = parseStringArrayField(body.source_ids, 'source_ids');
    const parsedTriggers = parseStructuredTriggers(body.triggers);

    if (!name) {
      res.status(400).json({
        error: 'Event name is required.',
        code: 'NAME_REQUIRED',
        field: 'name',
      });
      return;
    }
    if (typeof purposeRaw === 'symbol') {
      res.status(400).json({
        error: 'purpose must be a string when provided.',
        code: 'PURPOSE_INVALID',
        field: 'purpose',
      });
      return;
    }
    if (
      eventTypeRaw !== undefined &&
      eventTypeRaw !== null &&
      !EVENT_TYPES.includes(eventTypeRaw as EventType)
    ) {
      res.status(400).json({
        error: `event_type must be one of: ${EVENT_TYPES.join(', ')}.`,
        code: 'EVENT_TYPE_INVALID',
        field: 'event_type',
      });
      return;
    }
    if (!parsedCategories.ok) {
      res.status(400).json({
        error: 'error' in parsedCategories ? parsedCategories.error : 'Invalid categories.',
        code: 'CATEGORIES_INVALID',
        field: 'categories',
      });
      return;
    }
    if (!parsedTags.ok) {
      res.status(400).json({
        error: 'error' in parsedTags ? parsedTags.error : 'Invalid tags.',
        code: 'TAGS_INVALID',
        field: 'tags',
      });
      return;
    }
    if (!parsedSourceIds.ok) {
      res.status(400).json({
        error: 'error' in parsedSourceIds ? parsedSourceIds.error : 'Invalid source_ids.',
        code: 'SOURCE_IDS_INVALID',
        field: 'source_ids',
      });
      return;
    }
    if (!parsedTriggers.ok) {
      res.status(400).json({
        error: 'error' in parsedTriggers ? parsedTriggers.error : 'Invalid triggers.',
        code: 'INVALID_TRIGGERS',
        field: 'triggers',
      });
      return;
    }

    const eventData: CreateEventInput = {
      name,
      description: typeof body.description === 'string' ? body.description : undefined,
      purpose: typeof purposeRaw === 'string' ? purposeRaw : null,
      event_type: typeof eventTypeRaw === 'string' ? (eventTypeRaw as EventType) : null,
      owner_team_id: ownerTeamIdRaw.trim() || null,
      categories: parsedCategories.value,
      tags: parsedTags.value,
      triggers: parsedTriggers.value,
      source_ids: parsedSourceIds.value,
    };

    try {
      const created = await EventDAL.createEvent(workspaceId, eventData);
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
  }
);

/**
 * PATCH /api/events/:id
 * Update core event fields. Requires x-workspace-id.
 */
router.patch(
  '/:id',
  requireWorkspace,
  eventAuditValidator,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    const eventId = req.params.id;
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const purposeRaw =
      typeof body.purpose === 'string'
        ? body.purpose
        : body.purpose === null || typeof body.purpose === 'undefined'
          ? body.purpose
          : Symbol('invalid-purpose');
    const eventTypeRaw =
      typeof body.eventType === 'string'
        ? body.eventType.trim()
        : typeof body.event_type === 'string'
          ? body.event_type.trim()
          : body.eventType === null || body.event_type === null
            ? null
            : undefined;
    const ownerTeamIdRaw =
      typeof body.ownerTeamId === 'string'
        ? body.ownerTeamId
        : typeof body.owner_team_id === 'string'
          ? body.owner_team_id
          : '';
    const parsedCategories = parseStringArrayField(body.categories, 'categories');
    const parsedTags = parseStringArrayField(body.tags, 'tags');
    const parsedSourceIds = parseStringArrayField(body.source_ids, 'source_ids');
    const parsedTriggers = parseStructuredTriggers(body.triggers);

    if (!name) {
      res.status(400).json({
        error: 'Event name is required.',
        code: 'NAME_REQUIRED',
        field: 'name',
      });
      return;
    }
    if (typeof purposeRaw === 'symbol') {
      res.status(400).json({
        error: 'purpose must be a string when provided.',
        code: 'PURPOSE_INVALID',
        field: 'purpose',
      });
      return;
    }
    if (
      eventTypeRaw !== undefined &&
      eventTypeRaw !== null &&
      !EVENT_TYPES.includes(eventTypeRaw as EventType)
    ) {
      res.status(400).json({
        error: `event_type must be one of: ${EVENT_TYPES.join(', ')}.`,
        code: 'EVENT_TYPE_INVALID',
        field: 'event_type',
      });
      return;
    }
    if (!parsedCategories.ok) {
      res.status(400).json({
        error: 'error' in parsedCategories ? parsedCategories.error : 'Invalid categories.',
        code: 'CATEGORIES_INVALID',
        field: 'categories',
      });
      return;
    }
    if (!parsedTags.ok) {
      res.status(400).json({
        error: 'error' in parsedTags ? parsedTags.error : 'Invalid tags.',
        code: 'TAGS_INVALID',
        field: 'tags',
      });
      return;
    }
    if (!parsedSourceIds.ok) {
      res.status(400).json({
        error: 'error' in parsedSourceIds ? parsedSourceIds.error : 'Invalid source_ids.',
        code: 'SOURCE_IDS_INVALID',
        field: 'source_ids',
      });
      return;
    }
    if (!parsedTriggers.ok) {
      res.status(400).json({
        error: 'error' in parsedTriggers ? parsedTriggers.error : 'Invalid triggers.',
        code: 'INVALID_TRIGGERS',
        field: 'triggers',
      });
      return;
    }

    const eventData: CreateEventInput = {
      name,
      description: typeof body.description === 'string' ? body.description : undefined,
      purpose: typeof purposeRaw === 'string' ? purposeRaw : null,
      event_type: typeof eventTypeRaw === 'string' ? (eventTypeRaw as EventType) : null,
      owner_team_id: ownerTeamIdRaw.trim() || null,
      categories: parsedCategories.value,
      tags: parsedTags.value,
      triggers: parsedTriggers.value,
      source_ids: parsedSourceIds.value,
    };

    try {
      const updated = await EventDAL.updateEvent(workspaceId, eventId, eventData);
      res.status(200).json(updated);
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
          error: 'Failed to update event.',
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
 * DELETE /api/events/:id
 * Soft-delete an event. Requires x-workspace-id.
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

    const eventId = req.params.id;
    try {
      await EventDAL.deleteEvent(workspaceId, eventId);
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
          error: 'Failed to delete event.',
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
 * POST /api/events/:id/properties
 * Attach a property to an event with a presence value. Body: { propertyId, presence }.
 * Returns 404 if event or property does not exist or does not belong to the workspace.
 */
router.post(
  '/:id/properties',
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

    const eventId = req.params.id;
    const body = req.body as Record<string, unknown>;
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    const presence = body.presence as string | undefined;

    if (!propertyId) {
      res.status(400).json({
        error: 'propertyId is required.',
        code: 'PROPERTY_ID_REQUIRED',
        field: 'propertyId',
      });
      return;
    }

    if (!presence || !PRESENCE_VALUES.includes(presence as EventPropertyPresence)) {
      res.status(400).json({
        error: `presence is required and must be one of: ${PRESENCE_VALUES.join(', ')}.`,
        code: 'PRESENCE_INVALID',
        field: 'presence',
      });
      return;
    }

    try {
      const row = await EventDAL.attachPropertyToEvent(
        workspaceId,
        eventId,
        propertyId,
        presence as EventPropertyPresence
      );
      res.status(201).json(row);
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
  }
);

/**
 * PATCH /api/events/:id/properties
 * Update presence for an already-attached property. Body: { propertyId, presence }.
 * Returns 404 if event, property, or link is not in workspace.
 */
router.patch(
  '/:id/properties',
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

    const eventId = req.params.id;
    const body = req.body as Record<string, unknown>;
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    const presence = body.presence as string | undefined;

    if (!propertyId) {
      res.status(400).json({
        error: 'propertyId is required.',
        code: 'PROPERTY_ID_REQUIRED',
        field: 'propertyId',
      });
      return;
    }

    if (!presence || !PRESENCE_VALUES.includes(presence as EventPropertyPresence)) {
      res.status(400).json({
        error: `presence is required and must be one of: ${PRESENCE_VALUES.join(', ')}.`,
        code: 'PRESENCE_INVALID',
        field: 'presence',
      });
      return;
    }

    try {
      const row = await EventDAL.updatePropertyPresenceOnEvent(
        workspaceId,
        eventId,
        propertyId,
        presence as EventPropertyPresence
      );
      res.status(200).json(row);
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
  }
);

/**
 * DELETE /api/events/:id/properties
 * Detach an attached property from an event. Body: { propertyId }.
 * Returns 404 if event, property, or link is not in workspace.
 */
router.delete(
  '/:id/properties',
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

    const eventId = req.params.id;
    const body = req.body as Record<string, unknown>;
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';

    if (!propertyId) {
      res.status(400).json({
        error: 'propertyId is required.',
        code: 'PROPERTY_ID_REQUIRED',
        field: 'propertyId',
      });
      return;
    }

    try {
      await EventDAL.detachPropertyFromEvent(workspaceId, eventId, propertyId);
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
          error: 'Failed to detach property from event.',
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
