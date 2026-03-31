/**
 * Properties API routes.
 * All routes require workspace context (x-workspace-id) and enforce audit rules where applicable.
 */
import { Router, type Request, type Response } from 'express';
import { requireWorkspace } from '../middleware/workspace';
import { createAuditValidator } from '../middleware/auditValidator';
import { getWorkspaceSettings } from '../dal/workspace.dal';
import * as PropertyDAL from '../dal/property.dal';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from '../errors';
import type {
  CreatePropertyInput,
  PropertyContext,
  PropertyDataFormat,
  PropertyDataType,
  PropertyExampleValue,
  PropertyMappingType,
  PropertyNameMapping,
  PropertyNameMappingRole,
  PropertyValueSchema,
  PropertyValueSchemaNode,
} from '../../types/schema';
import {
  PROPERTY_CONTEXTS,
  PROPERTY_DATA_FORMATS,
  PROPERTY_DATA_TYPES,
  PROPERTY_NAME_MAPPING_ROLES,
} from '../../types/schema';

const router = Router();

const propertyAuditValidator = createAuditValidator(getWorkspaceSettings, { entity: 'property' });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Strict: every element must be a string (no silent coercion). */
function parseSourceIdsField(
  value: unknown
): { ok: true; value: string[] | null | undefined } | { ok: false; error: string } {
  if (typeof value === 'undefined') {
    return { ok: true, value: undefined };
  }
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: 'source_ids must be an array of strings when provided.' };
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== 'string') {
      return { ok: false, error: 'source_ids must be an array of strings.' };
    }
  }
  const normalized = value.map((entry) => entry.trim()).filter(Boolean);
  return { ok: true, value: [...new Set(normalized)] };
}

function normalizePii(pii: unknown, required: boolean): { value?: boolean; error?: string } {
  if (typeof pii === 'boolean') {
    return { value: pii };
  }

  if (required) {
    return { error: 'pii is required and must be a boolean.' };
  }

  return {};
}

function normalizeDataType(
  rawDataType: unknown,
  required: boolean
): { value?: PropertyDataType; error?: string } {
  if (rawDataType === undefined) {
    return required
      ? { error: `data_type is required and must be one of: ${PROPERTY_DATA_TYPES.join(', ')}.` }
      : {};
  }

  if (rawDataType !== undefined && typeof rawDataType !== 'string') {
    return { error: `data_type must be one of: ${PROPERTY_DATA_TYPES.join(', ')}.` };
  }

  const candidate = typeof rawDataType === 'string' ? rawDataType.trim() : '';

  switch (candidate) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'timestamp':
    case 'object':
    case 'array':
      return { value: candidate as PropertyDataType };
    default:
      return {
        error: `data_type must be one of: ${PROPERTY_DATA_TYPES.join(', ')}.`,
      };
  }
}

function normalizeDataFormats(
  rawDataFormats: unknown
): { value?: PropertyDataFormat[] | null; error?: string } {
  if (rawDataFormats === undefined) {
    return {};
  }

  if (rawDataFormats === null) {
    return { value: null };
  }

  if (rawDataFormats !== undefined) {
    if (!Array.isArray(rawDataFormats)) {
      return { error: `data_formats must be an array of: ${PROPERTY_DATA_FORMATS.join(', ')}.` };
    }

    const normalized = rawDataFormats.map((item) => String(item).trim()).filter(Boolean);
    const invalid = normalized.find(
      (item) => !PROPERTY_DATA_FORMATS.includes(item as PropertyDataFormat)
    );

    if (invalid) {
      return { error: `Unsupported data_formats value: ${invalid}.` };
    }

    return {
      value:
        normalized.length > 0
          ? Array.from(new Set(normalized)) as PropertyDataFormat[]
          : null,
    };
  }

  return { error: `data_formats must be an array of: ${PROPERTY_DATA_FORMATS.join(', ')}.` };
}

function validateValueSchemaNode(value: unknown): value is PropertyValueSchemaNode {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.type !== 'string' ||
    !PROPERTY_DATA_TYPES.includes(value.type as PropertyDataType)
  ) {
    return false;
  }

  if (
    (value as any).presence !== undefined &&
    (value as any).presence !== 'always_sent' &&
    (value as any).presence !== 'sometimes_sent' &&
    (value as any).presence !== 'never_sent'
  ) {
    return false;
  }

  if (value.data_formats !== undefined) {
    if (
      !Array.isArray(value.data_formats) ||
      value.data_formats.some(
        (format) =>
          typeof format !== 'string' ||
          !PROPERTY_DATA_FORMATS.includes(format as PropertyDataFormat)
      )
    ) {
      return false;
    }
  }

  if (value.required !== undefined && typeof value.required !== 'boolean') {
    return false;
  }

  if (
    value.allow_additional_properties !== undefined &&
    typeof value.allow_additional_properties !== 'boolean'
  ) {
    return false;
  }

  if (value.type === 'object') {
    if (!isRecord(value.properties)) {
      return false;
    }

    return Object.values(value.properties).every(validateValueSchemaNode);
  }

  if (value.type === 'array') {
    return validateValueSchemaNode(value.items);
  }

  return true;
}

function normalizeValueSchema(
  rawValueSchema: unknown,
  dataType: PropertyDataType | undefined
): { value?: PropertyValueSchema | null; error?: string } {
  if (rawValueSchema === undefined) {
    return {};
  }

  if (rawValueSchema === null || rawValueSchema === '') {
    return { value: null };
  }

  let parsed: unknown;
  parsed = rawValueSchema;

  if (!isRecord(parsed) || (parsed.type !== 'object' && parsed.type !== 'array')) {
    return { error: 'value_schema_json must be a top-level object or array schema.' };
  }

  if (!validateValueSchemaNode(parsed)) {
    return { error: 'value_schema_json does not match the Property v1 schema contract.' };
  }

  if (
    dataType &&
    ((dataType === 'object' && parsed.type !== 'object') ||
      (dataType === 'array' && parsed.type !== 'array') ||
      (dataType !== 'object' && dataType !== 'array'))
  ) {
    if (dataType !== 'object' && dataType !== 'array') {
      return { error: 'value_schema_json is only supported for object and array properties.' };
    }

    return { error: `value_schema_json.type must match data_type "${dataType}".` };
  }

  return { value: parsed as PropertyValueSchema };
}

const HIGHLIGHT_TOKEN_RE = /\bch-(num|str|key|kw|lit|com)\b/i;
const HTML_TAG_RE = /<[^>]+>/;
const HTML_ESCAPED_SPAN_RE = /&lt;\s*span\b/i;
const EXACT_NUMERIC_RE = /^[+-]?\d+(\.\d+)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectIfArtifactString(raw: string): string | null {
  const s = raw;
  if (HTML_TAG_RE.test(s)) return 'Example value must not contain HTML.';
  if (HTML_ESCAPED_SPAN_RE.test(s)) return 'Example value must not contain HTML-escaped markup.';
  if (HIGHLIGHT_TOKEN_RE.test(s)) return 'Example value must not contain syntax-highlighter tokens.';
  return null;
}

function normalizeExampleValueForType(
  v: unknown,
  dataType: PropertyDataType
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (dataType === 'string') {
    if (typeof v !== 'string') return { ok: false, error: 'must be a string.' };
    const artifactErr = rejectIfArtifactString(v);
    if (artifactErr) return { ok: false, error: artifactErr };
    return { ok: true, value: v };
  }
  if (dataType === 'number') {
    if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, value: v };
    if (typeof v === 'string') {
      const artifactErr = rejectIfArtifactString(v);
      if (artifactErr) return { ok: false, error: artifactErr };
      const t = v.trim();
      if (!EXACT_NUMERIC_RE.test(t)) return { ok: false, error: 'must be a number.' };
      const n = Number(t);
      if (!Number.isFinite(n)) return { ok: false, error: 'must be a finite number.' };
      return { ok: true, value: n };
    }
    return { ok: false, error: 'must be a number.' };
  }
  if (dataType === 'boolean') {
    if (typeof v === 'boolean') return { ok: true, value: v };
    if (typeof v === 'string') {
      const artifactErr = rejectIfArtifactString(v);
      if (artifactErr) return { ok: false, error: artifactErr };
      const t = v.trim();
      if (t === 'true') return { ok: true, value: true };
      if (t === 'false') return { ok: true, value: false };
      return { ok: false, error: 'must be true or false.' };
    }
    return { ok: false, error: 'must be a boolean.' };
  }
  if (dataType === 'object') {
    if (!isPlainObject(v)) return { ok: false, error: 'must be a JSON object.' };
    return { ok: true, value: v };
  }
  if (dataType === 'array') {
    if (!Array.isArray(v)) return { ok: false, error: 'must be a JSON array.' };
    return { ok: true, value: v };
  }
  // timestamp: treat as string ISO value only (consistent with existing UI expectation).
  if (dataType === 'timestamp') {
    if (typeof v !== 'string') return { ok: false, error: 'must be an ISO 8601 string.' };
    const artifactErr = rejectIfArtifactString(v);
    if (artifactErr) return { ok: false, error: artifactErr };
    return { ok: true, value: v };
  }
  return { ok: false, error: 'has unsupported data_type.' };
}

function normalizeExampleValues(
  rawExampleValues: unknown,
  dataType: PropertyDataType
): { value?: PropertyExampleValue[] | null; error?: string } {
  if (rawExampleValues === undefined) {
    return {};
  }

  if (rawExampleValues === null || rawExampleValues === '') {
    return { value: null };
  }

  if (!Array.isArray(rawExampleValues)) {
    return { error: 'example_values_json must be an array.' };
  }

  const normalized: PropertyExampleValue[] = [];

  for (let i = 0; i < rawExampleValues.length; i += 1) {
    const entry = rawExampleValues[i];
    if (!isRecord(entry) || !Object.prototype.hasOwnProperty.call(entry, 'value')) {
      return { error: 'example_values_json entries must be objects with a value field.' };
    }

    if (
      (entry.label !== undefined && typeof entry.label !== 'string') ||
      (entry.notes !== undefined && typeof entry.notes !== 'string')
    ) {
      return {
        error: 'example_values_json entries must use optional string label and notes fields.',
      };
    }

    const coerced = normalizeExampleValueForType(entry.value, dataType);
    if (coerced.ok === false) {
      return { error: `Example ${i + 1} value ${coerced.error}` };
    }

    const normalizedEntry: PropertyExampleValue = {
      value: coerced.value,
    };

    if (typeof entry.label === 'string' && entry.label.trim()) {
      normalizedEntry.label = entry.label.trim();
    }
    if (typeof entry.notes === 'string' && entry.notes.trim()) {
      normalizedEntry.notes = entry.notes.trim();
    }

    normalized.push(normalizedEntry);
  }

  return { value: normalized.length > 0 ? normalized : null };
}

function normalizeNameMappings(
  rawNameMappings: unknown
): { value?: PropertyNameMapping[] | null; error?: string } {
  if (rawNameMappings === undefined) {
    return {};
  }

  if (rawNameMappings === null || rawNameMappings === '') {
    return { value: null };
  }

  if (!Array.isArray(rawNameMappings)) {
    return { error: 'name_mappings_json must be an array.' };
  }

  const normalized: PropertyNameMapping[] = [];

  for (const entry of rawNameMappings) {
    if (!isRecord(entry)) {
      return { error: 'name_mappings_json entries must be objects.' };
    }

    const system = typeof entry.system === 'string' ? entry.system.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';

    if (!system || !name) {
      return { error: 'Each name_mappings_json entry must include system and name.' };
    }

    const role =
      typeof entry.role === 'string' &&
      PROPERTY_NAME_MAPPING_ROLES.includes(entry.role as PropertyNameMappingRole)
        ? (entry.role as PropertyNameMappingRole)
        : null;

    if (role === null) {
      return {
        error: `name_mappings_json role must be one of: ${PROPERTY_NAME_MAPPING_ROLES.join(', ')}.`,
      };
    }

    if (entry.notes !== undefined && typeof entry.notes !== 'string') {
      return { error: 'name_mappings_json notes must be a string when provided.' };
    }

    const normalizedEntry: PropertyNameMapping = {
      system,
      name,
      role,
    };

    if (typeof entry.notes === 'string' && entry.notes.trim()) {
      normalizedEntry.notes = entry.notes.trim();
    }

    normalized.push(normalizedEntry);
  }

  return { value: normalized.length > 0 ? normalized : null };
}

function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return typeof value === 'string' ? value : String(value);
}

function buildCreatePropertyInput(
  body: Record<string, unknown>
): { value?: CreatePropertyInput; error?: { message: string; field: string } } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return {
      error: {
        message: 'Property name is required.',
        field: 'name',
      },
    };
  }

  const context = body.context;
  if (typeof context !== 'string' || !PROPERTY_CONTEXTS.includes(context as PropertyContext)) {
    return {
      error: {
        message: `Property context is required and must be one of: ${PROPERTY_CONTEXTS.join(', ')}.`,
        field: 'context',
      },
    };
  }

  const pii = normalizePii(body.pii, true);
  if (pii.error) {
    return {
      error: {
        message: pii.error,
        field: 'pii',
      },
    };
  }

  const dataType = normalizeDataType(body.data_type, true);
  if (dataType.error || !dataType.value) {
    return {
      error: {
        message:
          dataType.error ??
          `data_type is required and must be one of: ${PROPERTY_DATA_TYPES.join(', ')}.`,
        field: 'data_type',
      },
    };
  }

  const dataFormats = normalizeDataFormats(body.data_formats);
  if (dataFormats.error) {
    return {
      error: {
        message: dataFormats.error,
        field: 'data_formats',
      },
    };
  }

  const valueSchema = normalizeValueSchema(body.value_schema_json, dataType.value);
  if (valueSchema.error) {
    return {
      error: {
        message: valueSchema.error,
        field: 'value_schema_json',
      },
    };
  }

  const exampleValues = normalizeExampleValues(body.example_values_json, dataType.value);
  if (exampleValues.error) {
    return {
      error: {
        message: exampleValues.error,
        field: 'example_values_json',
      },
    };
  }

  const nameMappings = normalizeNameMappings(body.name_mappings_json);
  if (nameMappings.error) {
    return {
      error: {
        message: nameMappings.error,
        field: 'name_mappings_json',
      },
    };
  }

  const sourceIds = parseSourceIdsField(body.source_ids);
  if (sourceIds.ok === false) {
    return {
      error: {
        message: sourceIds.error,
        field: 'source_ids',
      },
    };
  }

  return {
    value: {
      context: context as PropertyContext,
      name,
      description: readOptionalString(body.description),
      category: readOptionalString(body.category),
      pii: pii.value ?? false,
      data_type: dataType.value,
      data_formats: dataFormats.value ?? null,
      value_schema_json: valueSchema.value ?? null,
      object_child_property_refs_json: PropertyDAL.normalizeObjectChildPropertyRefs(
        body.object_child_property_refs_json !== undefined
          ? body.object_child_property_refs_json
          : null
      ),
      example_values_json: exampleValues.value ?? null,
      name_mappings_json: nameMappings.value ?? null,
      mapped_catalog_id:
        typeof body.mapped_catalog_id === 'string' ? body.mapped_catalog_id : null,
      mapped_catalog_field_id:
        typeof body.mapped_catalog_field_id === 'string'
          ? body.mapped_catalog_field_id
          : null,
      mapping_type:
        body.mapping_type === 'lookup_key' || body.mapping_type === 'mapped_value'
          ? (body.mapping_type as PropertyMappingType)
          : null,
      ...(sourceIds.value !== undefined ? { source_ids: sourceIds.value } : {}),
    },
  };
}

function buildUpdatePropertyInput(
  body: Record<string, unknown>
): { value?: PropertyDAL.PropertyUpdateInput; error?: { message: string; field: string } } {
  const updates: PropertyDAL.PropertyUpdateInput = {};

  if (body.context !== undefined) {
    if (
      typeof body.context !== 'string' ||
      !PROPERTY_CONTEXTS.includes(body.context as PropertyContext)
    ) {
      return {
        error: {
          message: `context must be one of: ${PROPERTY_CONTEXTS.join(', ')}.`,
          field: 'context',
        },
      };
    }

    updates.context = body.context as PropertyContext;
  }

  if (typeof body.name === 'string') updates.name = body.name;
  if (body.description !== undefined) updates.description = readOptionalString(body.description);
  if (body.category !== undefined) updates.category = readOptionalString(body.category);

  const pii = normalizePii(body.pii, false);
  if (pii.error) {
    return {
      error: {
        message: pii.error,
        field: 'pii',
      },
    };
  }
  if (pii.value !== undefined) {
    updates.pii = pii.value;
  }

  const shouldNormalizeDataType = body.data_type !== undefined;
  let normalizedDataType: PropertyDataType | undefined;
  if (shouldNormalizeDataType) {
    const dataType = normalizeDataType(body.data_type, false);
    if (dataType.error || !dataType.value) {
      return {
        error: {
          message:
            dataType.error ??
            `data_type must be one of: ${PROPERTY_DATA_TYPES.join(', ')}.`,
          field: 'data_type',
        },
      };
    }

    normalizedDataType = dataType.value;
    updates.data_type = dataType.value;
  }

  if (body.data_formats !== undefined) {
    const dataFormats = normalizeDataFormats(body.data_formats);
    if (dataFormats.error) {
      return {
        error: {
          message: dataFormats.error,
          field: 'data_formats',
        },
      };
    }

    updates.data_formats = dataFormats.value ?? null;
  }

  if (body.value_schema_json !== undefined) {
    const valueSchema = normalizeValueSchema(body.value_schema_json, normalizedDataType);
    if (valueSchema.error) {
      return {
        error: {
          message: valueSchema.error,
          field: 'value_schema_json',
        },
      };
    }

    if (valueSchema.value !== undefined) {
      updates.value_schema_json = valueSchema.value;
    }
  } else if (
    normalizedDataType !== undefined &&
    normalizedDataType !== 'object' &&
    normalizedDataType !== 'array'
  ) {
    updates.value_schema_json = null;
  }

  // example_values_json is validated in the PATCH handler because we may need existing data_type.

  if (body.name_mappings_json !== undefined) {
    const nameMappings = normalizeNameMappings(body.name_mappings_json);
    if (nameMappings.error) {
      return {
        error: {
          message: nameMappings.error,
          field: 'name_mappings_json',
        },
      };
    }

    updates.name_mappings_json = nameMappings.value ?? null;
  }

  if (body.mapped_catalog_id !== undefined) {
    updates.mapped_catalog_id =
      typeof body.mapped_catalog_id === 'string' ? body.mapped_catalog_id : null;
  }

  if (body.mapped_catalog_field_id !== undefined) {
    updates.mapped_catalog_field_id =
      typeof body.mapped_catalog_field_id === 'string'
        ? body.mapped_catalog_field_id
        : null;
  }

  if (
    body.mapping_type === 'lookup_key' ||
    body.mapping_type === 'mapped_value' ||
    body.mapping_type === null
  ) {
    updates.mapping_type = body.mapping_type as PropertyMappingType | null;
  }

  if (body.object_child_property_refs_json !== undefined) {
    updates.object_child_property_refs_json = PropertyDAL.normalizeObjectChildPropertyRefs(
      body.object_child_property_refs_json
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, 'source_ids')) {
    const parsed = parseSourceIdsField(body.source_ids);
    if (parsed.ok === false) {
      return {
        error: {
          message: parsed.error,
          field: 'source_ids',
        },
      };
    }
    updates.source_ids = parsed.value ?? [];
  }

  return { value: updates };
}

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
 * GET /api/properties/:id/sources
 * Linked source ids for the property (workspace-scoped; cross-workspace ids are rejected on write).
 */
router.get(
  '/:id/sources',
  requireWorkspace,
  async (req: Request, res: Response, next: import('express').NextFunction): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
      return;
    }
    const propertyId = req.params.id;
    try {
      const sourceIds = await PropertyDAL.listPropertySourceIds(workspaceId, propertyId);
      res.status(200).json({ source_ids: sourceIds });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, code: err.code });
        return;
      }
      next(err);
    }
  }
);

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
    const parsed = buildCreatePropertyInput(body);
    if (parsed.error || !parsed.value) {
      res.status(400).json({
        error: parsed.error?.message ?? 'Invalid property payload.',
        code: 'PROPERTY_PAYLOAD_INVALID',
        field: parsed.error?.field,
      });
      return;
    }

    try {
      const created = await PropertyDAL.createProperty(workspaceId, parsed.value);
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
    const parsed = buildUpdatePropertyInput(body);
    if (parsed.error) {
      res.status(400).json({
        error: parsed.error.message,
        code: 'PROPERTY_PAYLOAD_INVALID',
        field: parsed.error.field,
      });
      return;
    }

    const updates = parsed.value ?? {};
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update.', code: 'NO_UPDATES' });
      return;
    }
    // example_values_json: strict validation/normalization requires effective data_type.
    if (Object.prototype.hasOwnProperty.call(body, 'example_values_json')) {
      try {
        const existing = await PropertyDAL.getPropertyRow(workspaceId, propertyId);
        if (!existing) {
          res.status(404).json({ error: 'Property not found.', code: 'NOT_FOUND' });
          return;
        }
        const dt =
          (updates as any).data_type !== undefined ? (updates as any).data_type : existing.data_type;
        const exampleValues = normalizeExampleValues(body.example_values_json, dt);
        if (exampleValues.error) {
          res.status(400).json({
            error: exampleValues.error,
            code: 'PROPERTY_PAYLOAD_INVALID',
            field: 'example_values_json',
          });
          return;
        }
        (updates as any).example_values_json = exampleValues.value ?? null;
      } catch (err) {
        console.error(err);
        if (err instanceof DatabaseError) {
          res.status(500).json({ error: 'Failed to validate property examples.', code: err.code });
          return;
        }
        res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
        return;
      }
    }
    try {
      const updated = await PropertyDAL.updateProperty(workspaceId, propertyId, updates);
      res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      if (err instanceof BadRequestError) {
        res.status(400).json({
          error: err.message,
          code: err.code,
          field: err.field,
        });
        return;
      }
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
