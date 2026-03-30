/**
 * Event variants v1 — scenario rows under a base event; overrides_json holds property deltas only.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import type { EventVariantOverridesV1, EventVariantRow, EventVariantSummary } from '../../types/schema';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from '../errors';
import { countJourneysUsingEventVariant } from './journey.dal';

export function parseEventVariantOverridesJson(raw: unknown): EventVariantOverridesV1 {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestError('overrides_json must be a JSON object.');
  }
  const o = raw as Record<string, unknown>;
  const props = o.properties;
  if (props === undefined) {
    return {};
  }
  if (typeof props !== 'object' || props === null || Array.isArray(props)) {
    throw new BadRequestError('overrides_json.properties must be an object.');
  }

  const out: NonNullable<EventVariantOverridesV1['properties']> = {};
  for (const [propertyId, deltaRaw] of Object.entries(props)) {
    if (!propertyId.trim()) continue;
    if (deltaRaw === null || typeof deltaRaw !== 'object' || Array.isArray(deltaRaw)) {
      throw new BadRequestError(`Invalid override for property ${propertyId}.`);
    }
    const d = deltaRaw as Record<string, unknown>;
    const entry: NonNullable<EventVariantOverridesV1['properties']>[string] = {};

    if ('excluded' in d) {
      if (typeof d.excluded !== 'boolean') {
        throw new BadRequestError(`excluded must be boolean for property ${propertyId}.`);
      }
      entry.excluded = d.excluded;
    }
    if ('presence' in d && d.presence != null) {
      const p = d.presence;
      if (p !== 'always_sent' && p !== 'sometimes_sent' && p !== 'never_sent') {
        throw new BadRequestError(`Invalid presence for property ${propertyId}.`);
      }
      entry.presence = p;
    }
    if ('required' in d && d.required != null) {
      if (typeof d.required !== 'boolean') {
        throw new BadRequestError(`required must be boolean for property ${propertyId}.`);
      }
      entry.required = d.required;
    }

    if (Object.keys(entry).length > 0) {
      out[propertyId] = entry;
    }
  }
  return { properties: Object.keys(out).length > 0 ? out : undefined };
}

function safeOverrides(raw: unknown): EventVariantOverridesV1 {
  try {
    return parseEventVariantOverridesJson(raw);
  } catch {
    return {};
  }
}

function mapRow(row: Record<string, unknown>): EventVariantRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    base_event_id: String(row.base_event_id),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    overrides_json: safeOverrides(row.overrides_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
  };
}

export async function listEventVariantsByBaseEvent(
  workspaceId: string,
  baseEventId: string
): Promise<EventVariantRow[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_variants')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('base_event_id', baseEventId)
    .is('deleted_at', null)
    .order('name');

  if (error) {
    throw new DatabaseError(`Failed to list event variants: ${error.message}`, error);
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** Batch: variant summaries grouped by base_event_id (for event list). */
export async function listEventVariantSummariesForBaseEventIds(
  workspaceId: string,
  eventIds: string[]
): Promise<Map<string, EventVariantSummary[]>> {
  const map = new Map<string, EventVariantSummary[]>();
  for (const id of eventIds) {
    map.set(id, []);
  }
  if (eventIds.length === 0) return map;

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_variants')
    .select('id, base_event_id, name, description')
    .eq('workspace_id', workspaceId)
    .in('base_event_id', eventIds)
    .is('deleted_at', null)
    .order('name');

  if (error) {
    throw new DatabaseError(`Failed to list event variants: ${error.message}`, error);
  }

  for (const row of data ?? []) {
    const r = row as {
      id: string;
      base_event_id: string;
      name: string;
      description: string | null;
    };
    const list = map.get(r.base_event_id) ?? [];
    list.push({
      id: r.id,
      base_event_id: r.base_event_id,
      name: r.name,
      description: r.description,
    });
    map.set(r.base_event_id, list);
  }
  return map;
}

export async function getEventVariantById(
  workspaceId: string,
  variantId: string
): Promise<EventVariantRow | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_variants')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', variantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to load event variant: ${error.message}`, error);
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function createEventVariant(
  workspaceId: string,
  baseEventId: string,
  input: { name: string; description?: string | null; overrides_json?: unknown }
): Promise<EventVariantRow> {
  const supabaseCheck = getSupabaseOrThrow();
  const { data: evRow, error: evErr } = await supabaseCheck
    .from('events')
    .select('id')
    .eq('id', baseEventId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (evErr) {
    throw new DatabaseError(`Failed to validate base event: ${evErr.message}`, evErr);
  }
  if (!evRow) {
    throw new NotFoundError('Event not found.', 'event');
  }
  const name = input.name.trim();
  if (!name) {
    throw new BadRequestError('Variant name is required.');
  }

  const overrides_json = parseEventVariantOverridesJson(
    input.overrides_json === undefined ? {} : input.overrides_json
  );

  const supabase = getSupabaseOrThrow();
  const now = new Date().toISOString();
  const row = {
    workspace_id: workspaceId,
    base_event_id: baseEventId,
    name,
    description: input.description?.trim() || null,
    overrides_json,
    updated_at: now,
  };

  const { data, error } = await supabase.from('event_variants').insert(row).select('*').single();

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('A variant with this name already exists for this event.');
    }
    throw new DatabaseError(`Failed to create event variant: ${error.message}`, error);
  }
  return mapRow(data as Record<string, unknown>);
}

export async function updateEventVariant(
  workspaceId: string,
  variantId: string,
  patch: {
    name?: string;
    description?: string | null;
    overrides_json?: unknown;
  }
): Promise<EventVariantRow> {
  const existing = await getEventVariantById(workspaceId, variantId);
  if (!existing) {
    throw new NotFoundError('Event variant not found.', 'event_variant');
  }

  const supabase = getSupabaseOrThrow();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new BadRequestError('Variant name cannot be empty.');
    updates.name = n;
  }
  if (patch.description !== undefined) {
    updates.description = patch.description?.trim() || null;
  }
  if (patch.overrides_json !== undefined) {
    updates.overrides_json = parseEventVariantOverridesJson(patch.overrides_json);
  }

  const { data, error } = await supabase
    .from('event_variants')
    .update(updates)
    .eq('workspace_id', workspaceId)
    .eq('id', variantId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('A variant with this name already exists for this event.');
    }
    throw new DatabaseError(`Failed to update event variant: ${error.message}`, error);
  }
  return mapRow(data as Record<string, unknown>);
}

export async function softDeleteEventVariant(
  workspaceId: string,
  variantId: string
): Promise<{ deleted: boolean }> {
  const existing = await getEventVariantById(workspaceId, variantId);
  if (!existing) {
    return { deleted: false };
  }

  const usage = await countJourneysUsingEventVariant(workspaceId, variantId);
  if (usage > 0) {
    throw new ConflictError(
      `This variant is used by ${usage} journey trigger(s). Disconnect it from journeys before deleting.`,
      String(usage)
    );
  }

  const supabase = getSupabaseOrThrow();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('event_variants')
    .update({ deleted_at: now, updated_at: now })
    .eq('workspace_id', workspaceId)
    .eq('id', variantId)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    throw new DatabaseError(`Failed to delete event variant: ${error.message}`, error);
  }
  return { deleted: Array.isArray(data) && data.length > 0 };
}
