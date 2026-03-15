/**
 * Events Data Access Layer.
 * Every function takes workspaceId; all queries enforce workspace_id.
 * Attached properties: only non–soft-deleted properties are included.
 * Transactional integrity: attachPropertyToEvent verifies event and property belong to workspace.
 */
import { getSupabase } from '../db/supabase.js';
import { ConflictError, DatabaseError, NotFoundError } from '../errors.js';
const UNIQUE_VIOLATION_CODE = '23505';
/**
 * Returns an event by id only if it belongs to the workspace.
 */
export async function getEventById(workspaceId, eventId) {
    const supabase = getSupabase();
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
    return data;
}
/**
 * Returns a property by id only if it belongs to the workspace and is not soft-deleted.
 */
export async function getPropertyById(workspaceId, propertyId) {
    const supabase = getSupabase();
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
    return data;
}
/**
 * Creates an event in the workspace.
 *
 * @throws ConflictError when UNIQUE(workspace_id, name) is violated (409).
 * @throws DatabaseError for other DB failures.
 */
export async function createEvent(workspaceId, eventData) {
    const supabase = getSupabase();
    const row = {
        workspace_id: workspaceId,
        name: eventData.name.trim(),
        description: eventData.description?.trim() ?? null,
        triggers_markdown: eventData.triggers_markdown?.trim() ?? null,
        deleted_at: null,
    };
    const { data, error } = await supabase
        .from('events')
        .insert(row)
        .select()
        .single();
    if (error) {
        if (error.code === UNIQUE_VIOLATION_CODE) {
            throw new ConflictError(`An event with the same name already exists in this workspace.`, `name="${row.name}"`);
        }
        throw new DatabaseError(`Failed to create event: ${error.message}`, error);
    }
    if (data === null) {
        throw new DatabaseError('Create event returned no row.');
    }
    return data;
}
/**
 * Attaches a property to an event with the given presence.
 * Verifies both event_id and property_id belong to the same workspaceId.
 *
 * @throws NotFoundError when event or property is not found in the workspace (404).
 * @throws ConflictError when the pair (event_id, property_id) already exists (409).
 * @throws DatabaseError for other DB failures.
 */
export async function attachPropertyToEvent(workspaceId, eventId, propertyId, presence) {
    const event = await getEventById(workspaceId, eventId);
    if (event === null) {
        throw new NotFoundError(`Event not found or does not belong to this workspace.`, 'event');
    }
    const property = await getPropertyById(workspaceId, propertyId);
    if (property === null) {
        throw new NotFoundError(`Property not found or does not belong to this workspace.`, 'property');
    }
    const supabase = getSupabase();
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
            throw new ConflictError(`This property is already attached to the event.`, `event_id="${eventId}", property_id="${propertyId}"`);
        }
        throw new DatabaseError(`Failed to attach property to event: ${error.message}`, error);
    }
    if (data === null) {
        throw new DatabaseError('Attach property returned no row.');
    }
    return data;
}
/**
 * Lists all non-deleted events for the workspace with attached property counts.
 * Counts include only properties that are not soft-deleted.
 */
export async function listEvents(workspaceId) {
    const supabase = getSupabase();
    const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('name');
    if (eventsError) {
        throw new DatabaseError(`Failed to list events: ${eventsError.message}`, eventsError);
    }
    const eventList = (events ?? []);
    if (eventList.length === 0) {
        return [];
    }
    const eventIds = eventList.map((e) => e.id);
    const { data: joinRows, error: joinError } = await supabase
        .from('event_properties')
        .select('event_id, property_id')
        .in('event_id', eventIds);
    if (joinError) {
        throw new DatabaseError(`Failed to fetch event-property links: ${joinError.message}`, joinError);
    }
    const propertyIds = [
        ...new Set((joinRows ?? []).map((r) => r.property_id)),
    ];
    let nonDeletedPropertyIds = new Set();
    if (propertyIds.length > 0) {
        const { data: props, error: propsError } = await supabase
            .from('properties')
            .select('id')
            .in('id', propertyIds)
            .is('deleted_at', null);
        if (propsError) {
            throw new DatabaseError(`Failed to fetch properties: ${propsError.message}`, propsError);
        }
        nonDeletedPropertyIds = new Set((props ?? []).map((p) => p.id));
    }
    const countByEventId = new Map();
    for (const eid of eventIds) {
        countByEventId.set(eid, 0);
    }
    for (const row of joinRows ?? []) {
        const r = row;
        if (nonDeletedPropertyIds.has(r.property_id)) {
            countByEventId.set(r.event_id, (countByEventId.get(r.event_id) ?? 0) + 1);
        }
    }
    return eventList.map((event) => ({
        ...event,
        attached_property_count: countByEventId.get(event.id) ?? 0,
    }));
}
/**
 * Fetches one event by id with its attached properties (only non–soft-deleted properties).
 *
 * @throws NotFoundError when event is not in workspace.
 */
export async function getEventWithProperties(workspaceId, eventId) {
    const event = await getEventById(workspaceId, eventId);
    if (event === null) {
        throw new NotFoundError(`Event not found or does not belong to this workspace.`, 'event');
    }
    const supabase = getSupabase();
    const { data: links, error: linkError } = await supabase
        .from('event_properties')
        .select('event_id, property_id, presence, created_at, updated_at')
        .eq('event_id', eventId);
    if (linkError) {
        throw new DatabaseError(`Failed to fetch event properties: ${linkError.message}`, linkError);
    }
    const rows = (links ?? []);
    if (rows.length === 0) {
        return { event, attached_properties: [] };
    }
    const propertyIds = [...new Set(rows.map((r) => r.property_id))];
    const { data: props, error: propsError } = await supabase
        .from('properties')
        .select('id, name')
        .in('id', propertyIds)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null);
    if (propsError) {
        throw new DatabaseError(`Failed to fetch properties: ${propsError.message}`, propsError);
    }
    const nameById = new Map((props ?? []).map((p) => [p.id, p.name]));
    const attached_properties = rows
        .filter((r) => nameById.has(r.property_id))
        .map((r) => ({
        ...r,
        property_name: nameById.get(r.property_id) ?? '',
    }));
    return { event, attached_properties };
}
/**
 * Updates the presence of an already-attached property on an event.
 * Verifies event and property belong to the workspace.
 *
 * @throws NotFoundError when event or property link is not found in workspace.
 */
export async function updatePropertyPresenceOnEvent(workspaceId, eventId, propertyId, presence) {
    await getEventById(workspaceId, eventId);
    await getPropertyById(workspaceId, propertyId);
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('event_properties')
        .update({ presence, updated_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('property_id', propertyId)
        .select()
        .single();
    if (error) {
        throw new DatabaseError(`Failed to update presence: ${error.message}`, error);
    }
    if (data === null) {
        throw new NotFoundError(`This property is not attached to the event.`, 'event_property');
    }
    return data;
}
/** Presence value for "always sent" (used by QA payload validation). */
const ALWAYS_SENT = 'always_sent';
/**
 * Returns the list of payload keys that must be present for the event's "always_sent" properties.
 * Each key is either the property's canonical name or the first mapped_name from name_mappings_json.
 * Used by validatePayload (journey QA) to check actualJson.
 *
 * @throws NotFoundError when event is not in workspace.
 */
export async function getAlwaysSentPropertyKeysForEvent(workspaceId, eventId) {
    const event = await getEventById(workspaceId, eventId);
    if (event === null) {
        throw new NotFoundError('Event not found or does not belong to this workspace.', 'event');
    }
    const supabase = getSupabase();
    const { data: links, error: linkError } = await supabase
        .from('event_properties')
        .select('property_id')
        .eq('event_id', eventId)
        .eq('presence', ALWAYS_SENT);
    if (linkError) {
        throw new DatabaseError(`Failed to fetch event properties: ${linkError.message}`, linkError);
    }
    const rows = links ?? [];
    if (rows.length === 0)
        return [];
    const propertyIds = [...new Set(rows.map((r) => r.property_id))];
    const { data: props, error: propsError } = await supabase
        .from('properties')
        .select('id, name, name_mappings_json')
        .in('id', propertyIds)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null);
    if (propsError) {
        throw new DatabaseError(`Failed to fetch properties: ${propsError.message}`, propsError);
    }
    const keys = [];
    for (const p of props ?? []) {
        const row = p;
        let key = row.name;
        if (row.name_mappings_json) {
            try {
                const parsed = JSON.parse(row.name_mappings_json);
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].mapped_name) {
                    key = String(parsed[0].mapped_name);
                }
            }
            catch {
                // use property name
            }
        }
        keys.push(key);
    }
    return keys;
}
