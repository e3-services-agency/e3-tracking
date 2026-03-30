/**
 * Events Data Access Layer.
 * Every function takes workspaceId; all queries enforce workspace_id.
 * Attached properties: only non–soft-deleted properties are included.
 * Transactional integrity: attachPropertyToEvent verifies event and property belong to workspace.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import type {
  EventRow,
  EventType,
  EventTriggerEntry,
  EventPropertyRow,
  CreateEventInput,
  EventPropertyPresence,
  PropertyDataFormat,
  PropertyNameMapping,
  PropertyExampleValue,
  EventVariantRow,
  EventVariantSummary,
} from '../../types/schema';
import { PROPERTY_DATA_FORMATS } from '../../types/schema';
import { ConflictError, DatabaseError, NotFoundError } from '../errors';
import { listEventVariantSummariesForBaseEventIds, listEventVariantsByBaseEvent } from './event-variant.dal';

const UNIQUE_VIOLATION_CODE = '23505';

function normalizePropertyExampleValues(
  raw: unknown
): PropertyExampleValue[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PropertyExampleValue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (!('value' in o)) continue;
    out.push({
      value: o.value,
      label: typeof o.label === 'string' ? o.label : undefined,
      notes: typeof o.notes === 'string' ? o.notes : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

type EventDbRow = Omit<EventRow, 'categories' | 'tags' | 'triggers' | 'event_type'> & {
  event_type?: EventType | null;
  categories_json?: unknown | null;
  tags_json?: unknown | null;
  triggers_json?: unknown | null;
};

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
}

function normalizeEventTriggers(value: unknown): EventTriggerEntry[] | null {
  if (!Array.isArray(value)) return null;

  const normalized = value
    .map((entry, index): EventTriggerEntry | null => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      const description =
        typeof raw.description === 'string' ? raw.description.trim() : '';

      if (!title || !description) return null;

      return {
        title,
        description,
        image: typeof raw.image === 'string' ? raw.image : null,
        source: typeof raw.source === 'string' ? raw.source : null,
        order:
          typeof raw.order === 'number' && Number.isFinite(raw.order)
            ? raw.order
            : index,
      } satisfies EventTriggerEntry;
    })
    .filter((entry): entry is EventTriggerEntry => entry !== null)
    .sort((a, b) => a.order - b.order);

  return normalized;
}

function mapEventRow(row: EventDbRow | null): EventRow | null {
  if (row === null) return null;

  const { categories_json, tags_json, triggers_json } = row;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    description: row.description,
    purpose: row.purpose ?? null,
    event_type: row.event_type ?? null,
    owner_team_id: row.owner_team_id ?? null,
    categories: normalizeStringArray(categories_json),
    tags: normalizeStringArray(tags_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    triggers: normalizeEventTriggers(triggers_json),
  };
}

async function listEventSourceIds(
  workspaceId: string,
  eventId: string
): Promise<string[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_sources')
    .select('source_id')
    .eq('event_id', eventId);

  if (error) {
    throw new DatabaseError(`Failed to fetch event sources: ${error.message}`, error);
  }

  const sourceIds = (data ?? []).map((row: { source_id: string }) => row.source_id);
  return validateSourceIds(workspaceId, sourceIds);
}

async function validateSourceIds(
  workspaceId: string,
  sourceIds: string[]
): Promise<string[]> {
  const uniqueSourceIds = [...new Set(sourceIds.map((value) => value.trim()).filter(Boolean))];
  if (uniqueSourceIds.length === 0) return [];

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('sources')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('id', uniqueSourceIds)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to validate sources: ${error.message}`, error);
  }

  const foundIds = new Set((data ?? []).map((row: { id: string }) => row.id));
  if (foundIds.size !== uniqueSourceIds.length) {
    throw new NotFoundError(
      'One or more sources were not found in this workspace.',
      'source'
    );
  }

  return uniqueSourceIds;
}

async function replaceEventSources(
  workspaceId: string,
  eventId: string,
  sourceIds: string[]
): Promise<void> {
  const validSourceIds = await validateSourceIds(workspaceId, sourceIds);
  const supabase = getSupabaseOrThrow();

  const { error: deleteError } = await supabase
    .from('event_sources')
    .delete()
    .eq('event_id', eventId);

  if (deleteError) {
    throw new DatabaseError(`Failed to clear event sources: ${deleteError.message}`, deleteError);
  }

  if (validSourceIds.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from('event_sources')
    .insert(
      validSourceIds.map((sourceId) => ({
        event_id: eventId,
        source_id: sourceId,
      }))
    );

  if (insertError) {
    throw new DatabaseError(`Failed to save event sources: ${insertError.message}`, insertError);
  }
}

/**
 * Returns an event by id only if it belongs to the workspace.
 */
export async function getEventById(
  workspaceId: string,
  eventId: string
): Promise<EventRow | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to fetch event: ${error.message}`, error);
  }
  return mapEventRow(data as EventDbRow | null);
}

/**
 * Returns a property by id only if it belongs to the workspace and is not soft-deleted.
 */
export async function getPropertyById(
  workspaceId: string,
  propertyId: string
): Promise<{ id: string; workspace_id: string } | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('properties')
    .select('id, workspace_id')
    .eq('id', propertyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to fetch property: ${error.message}`, error);
  }
  return data as { id: string; workspace_id: string } | null;
}

/**
 * Creates an event in the workspace.
 *
 * @throws ConflictError when UNIQUE(workspace_id, name) is violated (409).
 * @throws DatabaseError for other DB failures.
 */
export async function createEvent(
  workspaceId: string,
  eventData: CreateEventInput
): Promise<EventRow> {
  const supabase = getSupabaseOrThrow();

  const row = {
    workspace_id: workspaceId,
    name: eventData.name.trim(),
    description: eventData.description?.trim() ?? null,
    purpose: eventData.purpose?.trim() ?? null,
    event_type: eventData.event_type ?? null,
    owner_team_id: eventData.owner_team_id?.trim() || null,
    categories_json: eventData.categories ?? null,
    tags_json: eventData.tags ?? null,
    triggers_json: eventData.triggers ?? null,
    deleted_at: null,
  };

  const sourceIds = Array.isArray(eventData.source_ids)
    ? await validateSourceIds(workspaceId, eventData.source_ids)
    : [];

  const { data, error } = await supabase
    .from('events')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new ConflictError(
        `An event with the same name already exists in this workspace.`,
        `name="${row.name}"`
      );
    }
    throw new DatabaseError(`Failed to create event: ${error.message}`, error);
  }

  if (data === null) {
    throw new DatabaseError('Create event returned no row.');
  }

  if (sourceIds.length > 0) {
    await replaceEventSources(workspaceId, (data as EventDbRow).id, sourceIds);
  }

  return mapEventRow(data as EventDbRow)!;
}

/**
 * Updates core event fields in the workspace.
 *
 * @throws NotFoundError when the event is not in the workspace.
 * @throws ConflictError when UNIQUE(workspace_id, name) is violated (409).
 * @throws DatabaseError for other DB failures.
 */
export async function updateEvent(
  workspaceId: string,
  eventId: string,
  eventData: CreateEventInput
): Promise<EventRow> {
  const existing = await getEventById(workspaceId, eventId);
  if (existing === null) {
    throw new NotFoundError(
      `Event not found or does not belong to this workspace.`,
      'event'
    );
  }

  const supabase = getSupabaseOrThrow();
  const row: Record<string, unknown> = {
    name: eventData.name.trim(),
    description: eventData.description?.trim() ?? null,
    purpose: eventData.purpose?.trim() ?? null,
    event_type: eventData.event_type ?? null,
    owner_team_id: eventData.owner_team_id?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  let sourceIds: string[] | undefined;
  if ('categories' in eventData) {
    row.categories_json = eventData.categories ?? null;
  }
  if ('tags' in eventData) {
    row.tags_json = eventData.tags ?? null;
  }
  if ('triggers' in eventData) {
    row.triggers_json = eventData.triggers ?? null;
  }
  if ('source_ids' in eventData && Array.isArray(eventData.source_ids)) {
    sourceIds = await validateSourceIds(workspaceId, eventData.source_ids);
  } else if ('source_ids' in eventData && eventData.source_ids === null) {
    sourceIds = [];
  }

  const { data, error } = await supabase
    .from('events')
    .update(row)
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new ConflictError(
        `An event with the same name already exists in this workspace.`,
        `name="${row.name}"`
      );
    }
    throw new DatabaseError(`Failed to update event: ${error.message}`, error);
  }

  if (data === null) {
    throw new DatabaseError('Update event returned no row.');
  }

  if (sourceIds !== undefined) {
    await replaceEventSources(workspaceId, eventId, sourceIds);
  }

  return mapEventRow(data as EventDbRow)!;
}

/**
 * Soft-deletes an event in the workspace.
 *
 * @throws NotFoundError when the event is not in the workspace.
 * @throws DatabaseError for DB failures.
 */
export async function deleteEvent(
  workspaceId: string,
  eventId: string
): Promise<void> {
  const existing = await getEventById(workspaceId, eventId);
  if (existing === null) {
    throw new NotFoundError(
      `Event not found or does not belong to this workspace.`,
      'event'
    );
  }

  const supabase = getSupabaseOrThrow();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('events')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to delete event: ${error.message}`, error);
  }
}

/**
 * Attaches a property to an event with the given presence.
 * Verifies both event_id and property_id belong to the same workspaceId.
 *
 * @throws NotFoundError when event or property is not found in the workspace (404).
 * @throws ConflictError when the pair (event_id, property_id) already exists (409).
 * @throws DatabaseError for other DB failures.
 */
export async function attachPropertyToEvent(
  workspaceId: string,
  eventId: string,
  propertyId: string,
  presence: EventPropertyPresence
): Promise<EventPropertyRow> {
  const event = await getEventById(workspaceId, eventId);
  if (event === null) {
    throw new NotFoundError(
      `Event not found or does not belong to this workspace.`,
      'event'
    );
  }

  const property = await getPropertyById(workspaceId, propertyId);
  if (property === null) {
    throw new NotFoundError(
      `Property not found or does not belong to this workspace.`,
      'property'
    );
  }

  const supabase = getSupabaseOrThrow();
  const row = {
    event_id: eventId,
    property_id: propertyId,
    presence,
  };

  const { data, error } = await supabase
    .from('event_properties')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new ConflictError(
        `This property is already attached to the event.`,
        `event_id="${eventId}", property_id="${propertyId}"`
      );
    }
    throw new DatabaseError(
      `Failed to attach property to event: ${error.message}`,
      error
    );
  }

  if (data === null) {
    throw new DatabaseError('Attach property returned no row.');
  }

  return data as EventPropertyRow;
}

/**
 * Detaches a property from an event.
 * Verifies the event and property belong to the workspace.
 *
 * @throws NotFoundError when event, property, or link is not found in workspace.
 * @throws DatabaseError for other DB failures.
 */
export async function detachPropertyFromEvent(
  workspaceId: string,
  eventId: string,
  propertyId: string
): Promise<void> {
  await getEventById(workspaceId, eventId);
  await getPropertyById(workspaceId, propertyId);

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_properties')
    .delete()
    .eq('event_id', eventId)
    .eq('property_id', propertyId)
    .select('event_id, property_id')
    .maybeSingle();

  if (error) {
    throw new DatabaseError(
      `Failed to detach property from event: ${error.message}`,
      error
    );
  }
  if (data === null) {
    throw new NotFoundError(
      `This property is not attached to the event.`,
      'event_property'
    );
  }
}

/** Event with attached property count (only non–soft-deleted properties). */
export interface EventWithPropertyCount extends EventRow {
  attached_property_count: number;
  /** Non-deleted variants for this base event (trigger picker + list). */
  variants: EventVariantSummary[];
}

/**
 * Lists all non-deleted events for the workspace with attached property counts.
 * Counts include only properties that are not soft-deleted.
 */
export async function listEvents(
  workspaceId: string
): Promise<EventWithPropertyCount[]> {
  const supabase = getSupabaseOrThrow();

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name');

  if (eventsError) {
    throw new DatabaseError(
      `Failed to list events: ${eventsError.message}`,
      eventsError
    );
  }

  const eventList = (events ?? []).map((event) => mapEventRow(event as EventDbRow)!);
  if (eventList.length === 0) {
    return [];
  }

  const eventIds = eventList.map((e) => e.id);

  const { data: joinRows, error: joinError } = await supabase
    .from('event_properties')
    .select('event_id, property_id')
    .in('event_id', eventIds);

  if (joinError) {
    throw new DatabaseError(
      `Failed to fetch event-property links: ${joinError.message}`,
      joinError
    );
  }

  const propertyIds = [
    ...new Set((joinRows ?? []).map((r: { property_id: string }) => r.property_id)),
  ];

  let nonDeletedPropertyIds = new Set<string>();
  if (propertyIds.length > 0) {
    const { data: props, error: propsError } = await supabase
      .from('properties')
      .select('id')
      .in('id', propertyIds)
      .is('deleted_at', null);

    if (propsError) {
      throw new DatabaseError(
        `Failed to fetch properties: ${propsError.message}`,
        propsError
      );
    }
    nonDeletedPropertyIds = new Set((props ?? []).map((p: { id: string }) => p.id));
  }

  const countByEventId = new Map<string, number>();
  for (const eid of eventIds) {
    countByEventId.set(eid, 0);
  }
  for (const row of joinRows ?? []) {
    const r = row as { event_id: string; property_id: string };
    if (nonDeletedPropertyIds.has(r.property_id)) {
      countByEventId.set(
        r.event_id,
        (countByEventId.get(r.event_id) ?? 0) + 1
      );
    }
  }

  const variantByEventId = await listEventVariantSummariesForBaseEventIds(workspaceId, eventIds);

  return eventList.map((event) => ({
    ...event,
    attached_property_count: countByEventId.get(event.id) ?? 0,
    variants: variantByEventId.get(event.id) ?? [],
  }));
}

/** Event property attachment with property snapshot (for editor). */
export interface EventPropertyWithDetails extends EventPropertyRow {
  property_name: string;
  property_description?: string | null;
  property_data_type?: string | null;
  property_data_formats?: PropertyDataFormat[] | null;
  /** From `properties.example_values_json` (catalog examples). */
  property_example_values_json?: PropertyExampleValue[] | null;
  /**
   * From `event_property_definitions.required` when a row exists for this (event, property).
   * `null` means no override row or `required` unset — not the same as "optional".
   */
  property_required_override?: boolean | null;
}

/**
 * Fetches one event by id with its attached properties (only non–soft-deleted properties).
 *
 * @throws NotFoundError when event is not in workspace.
 */
export async function getEventWithProperties(
  workspaceId: string,
  eventId: string
): Promise<{
  event: EventRow;
  attached_properties: EventPropertyWithDetails[];
  source_ids: string[];
  variants: EventVariantRow[];
}> {
  const event = await getEventById(workspaceId, eventId);
  if (event === null) {
    throw new NotFoundError(
      `Event not found or does not belong to this workspace.`,
      'event'
    );
  }

  const supabase = getSupabaseOrThrow();

  const { data: links, error: linkError } = await supabase
    .from('event_properties')
    .select('event_id, property_id, presence, created_at, updated_at')
    .eq('event_id', eventId);

  if (linkError) {
    throw new DatabaseError(
      `Failed to fetch event properties: ${linkError.message}`,
      linkError
    );
  }

  const variants = await listEventVariantsByBaseEvent(workspaceId, eventId);

  const rows = (links ?? []) as EventPropertyRow[];
  if (rows.length === 0) {
    return {
      event,
      attached_properties: [],
      source_ids: await listEventSourceIds(workspaceId, eventId),
      variants,
    };
  }

  const propertyIds = [...new Set(rows.map((r) => r.property_id))];

  const { data: defRows, error: defError } = await supabase
    .from('event_property_definitions')
    .select('property_id, required')
    .eq('workspace_id', workspaceId)
    .eq('event_id', eventId)
    .in('property_id', propertyIds);

  if (defError) {
    throw new DatabaseError(
      `Failed to fetch event property definitions: ${defError.message}`,
      defError
    );
  }

  const requiredByPropertyId = new Map<string, boolean | null>();
  for (const raw of defRows ?? []) {
    const d = raw as { property_id: string; required: unknown };
    const req = d.required;
    requiredByPropertyId.set(
      d.property_id,
      typeof req === 'boolean' ? req : null
    );
  }

  const { data: props, error: propsError } = await supabase
    .from('properties')
    .select('id, name, description, data_type, data_formats_json, example_values_json')
    .in('id', propertyIds)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (propsError) {
    throw new DatabaseError(
      `Failed to fetch properties: ${propsError.message}`,
      propsError
    );
  }

  const snapshotById = new Map(
    (props ?? []).map((p: any) => [
      p.id,
      {
        name: p.name,
        description: p.description ?? null,
        data_type: p.data_type ?? null,
        data_formats: Array.isArray(p.data_formats_json)
          ? (p.data_formats_json.filter(
              (value: unknown): value is PropertyDataFormat =>
                typeof value === 'string' &&
                PROPERTY_DATA_FORMATS.includes(value as PropertyDataFormat)
            ))
          : null,
        example_values_json: p.example_values_json ?? null,
      },
    ])
  );

  const attached_properties: EventPropertyWithDetails[] = rows
    .filter((r) => snapshotById.has(r.property_id))
    .map((r) => {
      const s = snapshotById.get(r.property_id);
      return {
        ...r,
        property_name: s?.name ?? '',
        property_description: s?.description ?? null,
        property_data_type: s?.data_type ?? null,
        property_data_formats: s?.data_formats ?? null,
        property_example_values_json: normalizePropertyExampleValues(
          s?.example_values_json ?? null
        ),
        property_required_override:
          requiredByPropertyId.get(r.property_id) ?? null,
      };
    });

  return {
    event,
    attached_properties,
    source_ids: await listEventSourceIds(workspaceId, eventId),
    variants,
  };
}

/**
 * Updates the presence of an already-attached property on an event.
 * Verifies event and property belong to the workspace.
 *
 * @throws NotFoundError when event or property link is not found in workspace.
 */
export async function updatePropertyPresenceOnEvent(
  workspaceId: string,
  eventId: string,
  propertyId: string,
  presence: EventPropertyPresence
): Promise<EventPropertyRow> {
  await getEventById(workspaceId, eventId);
  await getPropertyById(workspaceId, propertyId);

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('event_properties')
    .update({ presence, updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('property_id', propertyId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(
      `Failed to update presence: ${error.message}`,
      error
    );
  }
  if (data === null) {
    throw new NotFoundError(
      `This property is not attached to the event.`,
      'event_property'
    );
  }
  return data as EventPropertyRow;
}

/** Presence value for "always sent" (used by QA payload validation). */
const ALWAYS_SENT = 'always_sent';

/**
 * JSON payload key for a property row (payload_key mapping when set, else canonical name).
 */
export function resolvePayloadKeyForPropertyRow(row: {
  name: string;
  name_mappings_json: unknown;
}): string {
  let key = row.name;
  if (Array.isArray(row.name_mappings_json)) {
    const typedMappings = row.name_mappings_json.filter(
      (mapping): mapping is PropertyNameMapping =>
        Boolean(mapping) &&
        typeof mapping === 'object' &&
        typeof (mapping as PropertyNameMapping).system === 'string' &&
        typeof (mapping as PropertyNameMapping).name === 'string'
    );
    const preferredMapping =
      typedMappings.find((mapping) => mapping.role === 'payload_key') ?? typedMappings[0];

    if (preferredMapping?.name) {
      key = String(preferredMapping.name);
    }
  }
  return key;
}

/**
 * All attached event_properties rows with resolved payload keys (any presence).
 * First binding wins when two properties share the same payload key (rare).
 *
 * @throws NotFoundError when event is not in workspace.
 */
export async function listPayloadKeyPropertyBindingsForEvent(
  workspaceId: string,
  eventId: string
): Promise<Array<{ property_id: string; payload_key: string }>> {
  const event = await getEventById(workspaceId, eventId);
  if (event === null) {
    throw new NotFoundError(
      'Event not found or does not belong to this workspace.',
      'event'
    );
  }

  const supabase = getSupabaseOrThrow();

  const { data: links, error: linkError } = await supabase
    .from('event_properties')
    .select('property_id')
    .eq('event_id', eventId);

  if (linkError) {
    throw new DatabaseError(
      `Failed to fetch event properties: ${linkError.message}`,
      linkError
    );
  }

  const rows = links ?? [];
  if (rows.length === 0) return [];

  const propertyIds = [...new Set(rows.map((r: { property_id: string }) => r.property_id))];

  const { data: props, error: propsError } = await supabase
    .from('properties')
    .select('id, name, name_mappings_json')
    .in('id', propertyIds)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (propsError) {
    throw new DatabaseError(
      `Failed to fetch properties: ${propsError.message}`,
      propsError
    );
  }

  const out: Array<{ property_id: string; payload_key: string }> = [];
  for (const p of props ?? []) {
    const row = p as { id: string; name: string; name_mappings_json: unknown };
    out.push({
      property_id: row.id,
      payload_key: resolvePayloadKeyForPropertyRow(row),
    });
  }
  return out;
}

/**
 * Returns the list of payload keys that must be present for the event's "always_sent" properties.
 * Each key is either the property's canonical name or the first payload_key/alias mapping.
 * Used by validatePayload (journey QA) to check actualJson.
 *
 * @throws NotFoundError when event is not in workspace.
 */
export async function getAlwaysSentPropertyKeysForEvent(
  workspaceId: string,
  eventId: string
): Promise<string[]> {
  const event = await getEventById(workspaceId, eventId);
  if (event === null) {
    throw new NotFoundError(
      'Event not found or does not belong to this workspace.',
      'event'
    );
  }

  const supabase = getSupabaseOrThrow();

  const { data: links, error: linkError } = await supabase
    .from('event_properties')
    .select('property_id')
    .eq('event_id', eventId)
    .eq('presence', ALWAYS_SENT);

  if (linkError) {
    throw new DatabaseError(
      `Failed to fetch event properties: ${linkError.message}`,
      linkError
    );
  }

  const rows = links ?? [];
  if (rows.length === 0) return [];

  const propertyIds = [...new Set(rows.map((r: { property_id: string }) => r.property_id))];

  const { data: props, error: propsError } = await supabase
    .from('properties')
    .select('id, name, name_mappings_json')
    .in('id', propertyIds)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (propsError) {
    throw new DatabaseError(
      `Failed to fetch properties: ${propsError.message}`,
      propsError
    );
  }

  const keys: string[] = [];
  for (const p of props ?? []) {
    const row = p as { id: string; name: string; name_mappings_json: unknown };
    keys.push(resolvePayloadKeyForPropertyRow(row));
  }
  return keys;
}
