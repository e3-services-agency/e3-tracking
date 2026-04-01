/**
 * Event–property scoped definitions: optional per-event semantics for a shared `properties` row.
 *
 * Rationale: Do not overload `PropertyContext` for per-event variants; do not duplicate property rows for naming.
 * Attach event-specific enum_values / required / copy here while keeping global property identity stable.
 *
 * Resolution (`getEffectiveEventPropertyDefinition`): merge is in-memory only. Override columns that are non-null
 * replace the corresponding global field where one exists (`description`, `example_values_json`); `enum_values` /
 * `required` are override-only (null effective when unset). This keeps `properties` canonical for identity and type.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import type {
  EffectiveEventPropertyDefinition,
  EventPropertyDefinitionRow,
  EventPropertyDefinitionUpsertPayload,
  EventPropertyPresence,
  PropertyRow,
} from '../../types/schema';
import { BadRequestError, DatabaseError, NotFoundError } from '../errors';
import { resolveEffectiveEventSchema } from '../../lib/effectiveEventSchema';
import { getEventById } from './event.dal';
import { getPropertyRow } from './property.dal';
import { getEventVariantById } from './event-variant.dal';

type DefinitionDbRow = {
  id: string;
  workspace_id: string;
  event_id: string;
  property_id: string;
  description_override: string | null;
  enum_values: unknown | null;
  required: boolean | null;
  example_values: unknown | null;
  created_at: string;
  updated_at: string;
};

function normalizeEnumValuesFromDb(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const strings = value.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
  return strings.length > 0 ? [...new Set(strings)] : null;
}

function mapRow(row: DefinitionDbRow): EventPropertyDefinitionRow {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    event_id: row.event_id,
    property_id: row.property_id,
    description_override: row.description_override ?? null,
    enum_values: normalizeEnumValuesFromDb(row.enum_values),
    required: typeof row.required === 'boolean' ? row.required : null,
    example_values: row.example_values ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseEnumValuesInput(value: unknown): { ok: true; value: string[] | null } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: 'enum_values must be a JSON array of strings or null.' };
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== 'string') {
      return { ok: false, error: 'enum_values must be an array of strings.' };
    }
  }
  const normalized = value.map((s) => String(s).trim()).filter(Boolean);
  return { ok: true, value: normalized.length > 0 ? [...new Set(normalized)] : null };
}

function parseDescriptionOverride(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseRequired(value: unknown): { ok: true; value: boolean | null } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value === 'boolean') {
    return { ok: true, value };
  }
  return { ok: false, error: 'required must be a boolean or null.' };
}

async function assertPropertyInWorkspace(workspaceId: string, propertyId: string): Promise<void> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to validate property: ${error.message}`, error);
  }
  if (!data) {
    throw new NotFoundError('Property not found in this workspace.', 'property');
  }
}

async function fetchEventPropertyPresence(
  eventId: string,
  propertyId: string
): Promise<EventPropertyPresence | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_properties')
    .select('presence')
    .eq('event_id', eventId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to read event_properties link: ${error.message}`, error);
  }
  const p = data?.presence;
  if (p === 'always_sent' || p === 'sometimes_sent' || p === 'never_sent') {
    return p;
  }
  return null;
}

async function listPropertyIdsAttachedToEvent(eventId: string): Promise<string[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_properties')
    .select('property_id')
    .eq('event_id', eventId);

  if (error) {
    throw new DatabaseError(`Failed to list event_properties: ${error.message}`, error);
  }
  return [...new Set((data ?? []).map((r: { property_id: string }) => r.property_id))];
}

async function listPropertyIdsWithOverrides(workspaceId: string, eventId: string): Promise<string[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_property_definitions')
    .select('property_id')
    .eq('workspace_id', workspaceId)
    .eq('event_id', eventId);

  if (error) {
    throw new DatabaseError(`Failed to list definition property ids: ${error.message}`, error);
  }
  return [...new Set((data ?? []).map((r: { property_id: string }) => r.property_id))];
}

function buildEffectiveSnapshot(
  eventId: string,
  property: PropertyRow,
  override: EventPropertyDefinitionRow | null,
  presence: EventPropertyPresence | null
): EffectiveEventPropertyDefinition {
  const warnings: string[] = [];

  // Treat an override row with all-null override fields as "no override".
  // This prevents empty rows (e.g. after clearing fields) from being interpreted as active OVERRIDDEN state.
  const hasActiveOverride =
    override !== null &&
    (override.description_override !== null ||
      override.required !== null ||
      override.example_values !== null);
  const activeOverride = hasActiveOverride ? override : null;
  const isLinked = presence !== null;

  if (hasActiveOverride && !isLinked) {
    const msg =
      'event_property_definitions row exists but property is not linked on this event via event_properties.';
    warnings.push(msg);
    console.warn(`[event-property-definition] ${msg}`, { eventId, propertyId: property.id });
  }

  if (!hasActiveOverride && !isLinked) {
    warnings.push(
      'Property is not attached to this event via event_properties; effective view is global-only.'
    );
  }

  const effectiveDescription =
    activeOverride?.description_override != null
      ? activeOverride.description_override
      : property.description ?? null;

  const effectiveRequired = activeOverride?.required ?? null;

  const effectiveExampleValues =
    activeOverride?.example_values != null
      ? activeOverride.example_values
      : property.example_values_json ?? null;

  return {
    property_id: property.id,
    event_id: eventId,
    property: {
      id: property.id,
      name: property.name,
      context: property.context,
      description: property.description ?? null,
      category: property.category ?? null,
      data_type: property.data_type,
      data_formats: property.data_formats,
      pii: property.pii,
      value_schema_json: property.value_schema_json,
      object_child_property_refs_json: property.object_child_property_refs_json,
      example_values_json: property.example_values_json,
    },
    override: activeOverride,
    effective: {
      description: effectiveDescription,
      enum_values: null,
      required: effectiveRequired,
      example_values: effectiveExampleValues,
    },
    presence,
    warnings,
  };
}

async function fetchDefinitionRow(
  workspaceId: string,
  eventId: string,
  propertyId: string
): Promise<DefinitionDbRow | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_property_definitions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('event_id', eventId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to load event property definition: ${error.message}`, error);
  }
  return (data as DefinitionDbRow) ?? null;
}

/**
 * Lists all scoped definitions for an event (workspace-scoped).
 */
export async function getEventPropertyDefinitions(
  workspaceId: string,
  eventId: string
): Promise<EventPropertyDefinitionRow[]> {
  const event = await getEventById(workspaceId, eventId);
  if (!event) {
    throw new NotFoundError('Event not found.', 'event');
  }

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_property_definitions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('event_id', eventId)
    .order('property_id');

  if (error) {
    throw new DatabaseError(`Failed to list event property definitions: ${error.message}`, error);
  }

  return ((data ?? []) as DefinitionDbRow[]).map(mapRow);
}

/**
 * Merged read model: global `properties` row + optional `event_property_definitions` override (not persisted).
 */
export async function getEffectiveEventPropertyDefinition(
  workspaceId: string,
  eventId: string,
  propertyId: string
): Promise<EffectiveEventPropertyDefinition> {
  const event = await getEventById(workspaceId, eventId);
  if (!event) {
    throw new NotFoundError('Event not found.', 'event');
  }

  const property = await getPropertyRow(workspaceId, propertyId);
  if (!property) {
    throw new NotFoundError('Property not found in this workspace.', 'property');
  }

  const overrideRow = await fetchDefinitionRow(workspaceId, eventId, propertyId);
  const override = overrideRow ? mapRow(overrideRow) : null;
  const presence = await fetchEventPropertyPresence(eventId, propertyId);

  return buildEffectiveSnapshot(eventId, property, override, presence);
}

/**
 * Effective definitions for the union of property ids from event_properties and event_property_definitions.
 * Optional `propertyId` filters to one id (must exist in workspace).
 */
export async function listEffectiveEventPropertyDefinitions(
  workspaceId: string,
  eventId: string,
  opts?: { propertyId?: string }
): Promise<EffectiveEventPropertyDefinition[]> {
  const event = await getEventById(workspaceId, eventId);
  if (!event) {
    throw new NotFoundError('Event not found.', 'event');
  }

  if (opts?.propertyId?.trim()) {
    const one = await getEffectiveEventPropertyDefinition(workspaceId, eventId, opts.propertyId.trim());
    return [one];
  }

  const attached = await listPropertyIdsAttachedToEvent(eventId);
  const withOverrides = await listPropertyIdsWithOverrides(workspaceId, eventId);
  const ids = [...new Set([...attached, ...withOverrides])].sort();

  const out: EffectiveEventPropertyDefinition[] = [];
  for (const pid of ids) {
    const property = await getPropertyRow(workspaceId, pid);
    if (!property) {
      continue;
    }
    const overrideRow = await fetchDefinitionRow(workspaceId, eventId, pid);
    const override = overrideRow ? mapRow(overrideRow) : null;
    const presence = await fetchEventPropertyPresence(eventId, pid);
    out.push(buildEffectiveSnapshot(eventId, property, override, presence));
  }
  return out;
}

/**
 * Removes the override row for (event, property). Idempotent: no row → deleted: false.
 */
export async function deleteEventPropertyDefinition(
  workspaceId: string,
  eventId: string,
  propertyId: string
): Promise<{ deleted: boolean }> {
  const event = await getEventById(workspaceId, eventId);
  if (!event) {
    throw new NotFoundError('Event not found.', 'event');
  }

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_property_definitions')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('event_id', eventId)
    .eq('property_id', propertyId)
    .select('id');

  if (error) {
    throw new DatabaseError(`Failed to delete event property definition: ${error.message}`, error);
  }

  const deleted = Array.isArray(data) && data.length > 0;
  return { deleted };
}

function mergePayloadWithExisting(
  existing: EventPropertyDefinitionRow | null,
  raw: Record<string, unknown>
):
  | {
      ok: true;
      merged: {
        description_override: string | null;
        required: boolean | null;
        example_values: unknown | null;
      };
    }
  | { ok: false; error: string } {
  const desc = Object.prototype.hasOwnProperty.call(raw, 'description_override')
    ? parseDescriptionOverride(raw.description_override)
    : (existing?.description_override ?? null);

  let req: boolean | null;
  if (Object.prototype.hasOwnProperty.call(raw, 'required')) {
    const parsed = parseRequired(raw.required);
    if (parsed.ok === false) {
      return { ok: false, error: parsed.error };
    }
    req = parsed.value;
  } else {
    req = existing?.required ?? null;
  }

  const examples = Object.prototype.hasOwnProperty.call(raw, 'example_values')
    ? raw.example_values === undefined
      ? null
      : raw.example_values
    : (existing?.example_values ?? null);

  return {
    ok: true,
    merged: {
      description_override: desc,
      required: req,
      example_values: examples === undefined ? null : examples,
    },
  };
}

/**
 * Upserts one (event_id, property_id) row. Validates event and property belong to `workspaceId`.
 * Omitted optional keys in `payload` preserve previous values when the row already exists; on insert, omitted → null.
 */
export async function upsertEventPropertyDefinition(
  workspaceId: string,
  eventId: string,
  payload: EventPropertyDefinitionUpsertPayload
): Promise<EventPropertyDefinitionRow> {
  const propertyId = typeof payload.property_id === 'string' ? payload.property_id.trim() : '';
  if (!propertyId) {
    throw new DatabaseError('property_id is required.');
  }

  const event = await getEventById(workspaceId, eventId);
  if (!event) {
    throw new NotFoundError('Event not found.', 'event');
  }

  await assertPropertyInWorkspace(workspaceId, propertyId);

  const existingRow = await fetchDefinitionRow(workspaceId, eventId, propertyId);
  const existingMapped = existingRow ? mapRow(existingRow) : null;

  const mergedResult = mergePayloadWithExisting(
    existingMapped,
    payload as unknown as Record<string, unknown>
  );
  if (mergedResult.ok === false) {
    throw new BadRequestError(mergedResult.error, 'definitions');
  }
  const { merged } = mergedResult;

  const now = new Date().toISOString();
  const supabase = getSupabaseOrThrow();

  const row = {
    workspace_id: workspaceId,
    event_id: eventId,
    property_id: propertyId,
    description_override: merged.description_override,
    required: merged.required,
    example_values: merged.example_values,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('event_property_definitions')
    .upsert(row, { onConflict: 'event_id,property_id' })
    .select('*')
    .single();

  if (error) {
    throw new DatabaseError(`Failed to upsert event property definition: ${error.message}`, error);
  }
  if (!data) {
    throw new DatabaseError('Upsert returned no row.');
  }

  const presenceAfter = await fetchEventPropertyPresence(eventId, propertyId);
  if (!presenceAfter) {
    console.warn(
      '[event-property-definition] Upserted override but property is not linked on this event via event_properties.',
      { workspaceId, eventId, propertyId }
    );
  }

  return mapRow(data as DefinitionDbRow);
}

/**
 * Batch upsert: each item merged independently; failures abort the batch (caller may retry).
 */
export async function upsertEventPropertyDefinitionsBatch(
  workspaceId: string,
  eventId: string,
  items: EventPropertyDefinitionUpsertPayload[]
): Promise<EventPropertyDefinitionRow[]> {
  const out: EventPropertyDefinitionRow[] = [];
  for (const item of items) {
    const row = await upsertEventPropertyDefinition(workspaceId, eventId, item);
    out.push(row);
  }
  return out.sort((a, b) => a.property_id.localeCompare(b.property_id));
}

/**
 * Base effective definitions merged with optional variant overrides (same resolver as UI).
 */
export async function listEffectiveEventPropertyDefinitionsWithVariant(
  workspaceId: string,
  eventId: string,
  opts?: { propertyId?: string; variantId?: string | null }
): Promise<EffectiveEventPropertyDefinition[]> {
  const base = await listEffectiveEventPropertyDefinitions(
    workspaceId,
    eventId,
    opts?.propertyId?.trim() ? { propertyId: opts.propertyId.trim() } : undefined
  );
  const vid = opts?.variantId?.trim();
  if (!vid) {
    return base;
  }
  const variant = await getEventVariantById(workspaceId, vid);
  if (!variant || variant.base_event_id !== eventId) {
    throw new NotFoundError('Event variant not found for this event.', 'event_variant');
  }
  return resolveEffectiveEventSchema(base, variant);
}
