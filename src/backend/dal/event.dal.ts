/**
 * Event Data Access Layer. Every function takes `projectId`; all queries enforce `project_id`.
 * `EventProperty` (D-16) carries `required`/`role`/`payload_key`/etc. per event; enums
 * (`allowed_values_json`) live once on `Property` (T-1-04 adds the enum/role editors and the
 * `ROLE_REQUIRES_ENUM`/`MAX_DISCRIMINATORS` validation described in the plan).
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, fromSqliteBool, mapWriteError } from '../db/util';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../errors';
import { getPropertyById, type PropertyRow } from './property.dal';

export interface EventRow {
  id: string;
  project_id: string;
  name: string;
  business_name: string | null;
  description: string | null;
  purpose: string | null;
  page: string | null;
  trigger_text: string | null;
  grain: string | null;
  identity_note: string | null;
  triggers_json: unknown;
  event_type: string;
  owner_business: string | null;
  owner_technical: string | null;
  priority: string | null;
  status: string;
  expiration_json: unknown;
  not_suitable_for: string | null;
  agent_instructions: string | null;
  derived_metrics_json: unknown;
  tags_json: unknown;
  codegen_event_name_overrides_json: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type EventDbRow = Omit<
  EventRow,
  'triggers_json' | 'expiration_json' | 'derived_metrics_json' | 'tags_json' | 'codegen_event_name_overrides_json'
>;

function mapEventRow(row: EventDbRow): EventRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    triggers_json: parseJsonColumn(raw.triggers_json, []),
    expiration_json: parseJsonColumn(raw.expiration_json, null),
    derived_metrics_json: parseJsonColumn(raw.derived_metrics_json, []),
    tags_json: parseJsonColumn(raw.tags_json, []),
    codegen_event_name_overrides_json: parseJsonColumn(raw.codegen_event_name_overrides_json, null),
  };
}

export interface EventInput {
  name: string;
  business_name?: string | null;
  description?: string | null;
  purpose?: string | null;
  page?: string | null;
  trigger_text?: string | null;
  grain?: string | null;
  identity_note?: string | null;
  triggers_json?: unknown;
  event_type?: string;
  owner_business?: string | null;
  owner_technical?: string | null;
  priority?: string | null;
  status?: string;
  expiration_json?: unknown;
  not_suitable_for?: string | null;
  agent_instructions?: string | null;
  derived_metrics_json?: unknown;
  tags_json?: unknown;
  source_ids?: string[] | null;
}

const DEFAULT_EVENT_TYPE = 'custom';
const DEFAULT_EVENT_STATUS = 'planned';

export interface EventWithCounts extends EventRow {
  attached_property_count: number;
}

export function listEvents(projectId: string): EventWithCounts[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM events WHERE project_id = ? AND deleted_at IS NULL ORDER BY name')
    .all(projectId) as EventDbRow[];
  const counts = new Map(
    (
      db
        .prepare(
          `SELECT ep.event_id as event_id, COUNT(*) as n
           FROM event_properties ep
           JOIN events e ON e.id = ep.event_id
           WHERE e.project_id = ?
           GROUP BY ep.event_id`
        )
        .all(projectId) as { event_id: string; n: number }[]
    ).map((r) => [r.event_id, r.n])
  );
  return rows.map((row) => {
    const event = mapEventRow(row);
    return { ...event, attached_property_count: counts.get(event.id) ?? 0 };
  });
}

export function getEventById(projectId: string, eventId: string): EventRow | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM events WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(eventId, projectId) as EventDbRow | undefined;
  return row ? mapEventRow(row) : null;
}

export function getEventOrThrow(projectId: string, eventId: string): EventRow {
  const row = getEventById(projectId, eventId);
  if (!row) throw new NotFoundError('Event not found or does not belong to this project.', 'event');
  return row;
}

function validateSourceIds(projectId: string, sourceIds: string[]): string[] {
  const unique = [...new Set(sourceIds.map((v) => v.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const db = getDb();
  const placeholders = unique.map(() => '?').join(', ');
  const found = new Set(
    (
      db.prepare(`SELECT id FROM sources WHERE project_id = ? AND id IN (${placeholders})`).all(
        projectId,
        ...unique
      ) as { id: string }[]
    ).map((r) => r.id)
  );
  for (const id of unique) {
    if (!found.has(id)) throw new NotFoundError('One or more sources were not found in this project.', 'source');
  }
  return unique;
}

function replaceEventSources(projectId: string, eventId: string, sourceIds: string[]): void {
  const valid = validateSourceIds(projectId, sourceIds);
  const db = getDb();
  const now = nowIso();
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM event_sources WHERE event_id = ?').run(eventId);
    const insert = db.prepare(
      'INSERT INTO event_sources (event_id, source_id, kind, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const sourceId of valid) insert.run(eventId, sourceId, 'live', now);
  });
  replace();
}

/**
 * Cross-project reference guard (fix round finding #6): `event_properties.source_id` must name a
 * source that belongs to the same project as the event, never a different project's source.
 */
function assertSourceInProject(projectId: string, sourceId: string | null | undefined): void {
  if (!sourceId) return;
  const row = getDb().prepare('SELECT id FROM sources WHERE id = ? AND project_id = ?').get(sourceId, projectId);
  if (!row) throw new BadRequestError('source_id does not belong to this project.', 'source_id');
}

export function listEventSourceIds(projectId: string, eventId: string): string[] {
  getEventOrThrow(projectId, eventId);
  return (
    getDb()
      .prepare('SELECT source_id FROM event_sources WHERE event_id = ?')
      .all(eventId) as { source_id: string }[]
  ).map((r) => r.source_id);
}

export function createEvent(projectId: string, input: EventInput): EventRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Event name is required.', 'name');

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM events WHERE project_id = ? AND name = ? AND deleted_at IS NULL')
    .get(projectId, name);
  if (existing) throw new ConflictError(`An event named "${name}" already exists in this project.`);

  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO events (
        id, project_id, name, business_name, description, purpose, page, trigger_text, grain,
        identity_note, triggers_json, event_type, owner_business, owner_technical, priority,
        status, expiration_json, not_suitable_for, agent_instructions, derived_metrics_json,
        tags_json, codegen_event_name_overrides_json, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @business_name, @description, @purpose, @page, @trigger_text, @grain,
        @identity_note, @triggers_json, @event_type, @owner_business, @owner_technical, @priority,
        @status, @expiration_json, @not_suitable_for, @agent_instructions, @derived_metrics_json,
        @tags_json, NULL, @created_at, @updated_at, NULL
      )`
    ).run({
      id,
      project_id: projectId,
      name,
      business_name: input.business_name?.trim() || null,
      description: input.description?.trim() || null,
      purpose: input.purpose?.trim() || null,
      page: input.page?.trim() || null,
      trigger_text: input.trigger_text?.trim() || null,
      grain: input.grain?.trim() || null,
      identity_note: input.identity_note?.trim() || null,
      triggers_json: toJsonColumn(input.triggers_json ?? []),
      event_type: input.event_type || DEFAULT_EVENT_TYPE,
      owner_business: input.owner_business?.trim() || null,
      owner_technical: input.owner_technical?.trim() || null,
      priority: input.priority ?? null,
      status: input.status || DEFAULT_EVENT_STATUS,
      expiration_json: toJsonColumn(input.expiration_json ?? null),
      not_suitable_for: input.not_suitable_for?.trim() || null,
      agent_instructions: input.agent_instructions?.trim() || null,
      derived_metrics_json: toJsonColumn(input.derived_metrics_json ?? []),
      tags_json: toJsonColumn(input.tags_json ?? []),
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(
      err,
      `An event named "${name}" already exists in this project.`,
      `Failed to create event: ${(err as Error).message}`
    );
  }

  if (input.source_ids !== undefined && input.source_ids !== null) {
    replaceEventSources(projectId, id, input.source_ids);
  }

  return getEventOrThrow(projectId, id);
}

export function updateEvent(projectId: string, eventId: string, input: Partial<EventInput>): EventRow {
  getEventOrThrow(projectId, eventId);
  const db = getDb();

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError('Event name is required.', 'name');
    const clash = db
      .prepare('SELECT id FROM events WHERE project_id = ? AND name = ? AND id != ? AND deleted_at IS NULL')
      .get(projectId, name, eventId);
    if (clash) throw new ConflictError(`An event named "${name}" already exists in this project.`);
  }

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.business_name !== undefined) patch.business_name = input.business_name?.trim() || null;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.purpose !== undefined) patch.purpose = input.purpose?.trim() || null;
  if (input.page !== undefined) patch.page = input.page?.trim() || null;
  if (input.trigger_text !== undefined) patch.trigger_text = input.trigger_text?.trim() || null;
  if (input.grain !== undefined) patch.grain = input.grain?.trim() || null;
  if (input.identity_note !== undefined) patch.identity_note = input.identity_note?.trim() || null;
  if (input.triggers_json !== undefined) patch.triggers_json = toJsonColumn(input.triggers_json ?? []);
  if (input.event_type !== undefined) patch.event_type = input.event_type;
  if (input.owner_business !== undefined) patch.owner_business = input.owner_business?.trim() || null;
  if (input.owner_technical !== undefined) patch.owner_technical = input.owner_technical?.trim() || null;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.status !== undefined) patch.status = input.status;
  if (input.expiration_json !== undefined) patch.expiration_json = toJsonColumn(input.expiration_json);
  if (input.not_suitable_for !== undefined) patch.not_suitable_for = input.not_suitable_for?.trim() || null;
  if (input.agent_instructions !== undefined) {
    patch.agent_instructions = input.agent_instructions?.trim() || null;
  }
  if (input.derived_metrics_json !== undefined) {
    patch.derived_metrics_json = toJsonColumn(input.derived_metrics_json);
  }
  if (input.tags_json !== undefined) patch.tags_json = toJsonColumn(input.tags_json);

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    db.prepare(`UPDATE events SET ${setClause} WHERE id = @id AND project_id = @project_id`).run({
      ...patch,
      id: eventId,
      project_id: projectId,
    });
  } catch (err) {
    mapWriteError(
      err,
      `An event named "${String(patch.name ?? '')}" already exists in this project.`,
      `Failed to update event: ${(err as Error).message}`
    );
  }

  if (input.source_ids !== undefined) {
    replaceEventSources(projectId, eventId, input.source_ids ?? []);
  }

  return getEventOrThrow(projectId, eventId);
}

export function deleteEvent(projectId: string, eventId: string): void {
  getEventOrThrow(projectId, eventId);
  const now = nowIso();
  getDb()
    .prepare('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?')
    .run(now, now, eventId, projectId);
}

// ----- EventProperty (D-16) -----

export interface EventPropertyRow {
  event_id: string;
  property_id: string;
  required: boolean;
  role: string;
  priority: string | null;
  status: string | null;
  source_id: string | null;
  payload_key: string | null;
  description_override: string | null;
  example_values_override_json: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventPropertyWithDetails extends EventPropertyRow {
  property: PropertyRow;
}

export interface EventPropertyInput {
  property_id: string;
  required?: boolean;
  role?: string;
  priority?: string | null;
  status?: string | null;
  source_id?: string | null;
  payload_key?: string | null;
  description_override?: string | null;
  example_values_override_json?: unknown;
  sort_order?: number;
}

type EventPropertyDbRow = Omit<EventPropertyRow, 'required' | 'example_values_override_json'>;

function mapEventPropertyRow(row: EventPropertyDbRow): EventPropertyRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    required: fromSqliteBool(raw.required),
    example_values_override_json: parseJsonColumn(raw.example_values_override_json, null),
  };
}

export function getEventWithProperties(
  projectId: string,
  eventId: string
): { event: EventRow; properties: EventPropertyWithDetails[]; source_ids: string[] } {
  const event = getEventOrThrow(projectId, eventId);
  const db = getDb();
  const linkRows = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? ORDER BY sort_order, created_at')
    .all(eventId) as EventPropertyDbRow[];

  const properties: EventPropertyWithDetails[] = [];
  for (const raw of linkRows) {
    const link = mapEventPropertyRow(raw);
    const property = getPropertyById(projectId, link.property_id);
    if (!property) continue; // property soft-deleted; link is stale but left intact (T-1-02 keeps it simple)
    properties.push({ ...link, property });
  }

  return { event, properties, source_ids: listEventSourceIds(projectId, eventId) };
}

const DEFAULT_ROLE = 'normal';

export function attachPropertyToEvent(
  projectId: string,
  eventId: string,
  input: EventPropertyInput
): EventPropertyRow {
  getEventOrThrow(projectId, eventId);
  const property = getPropertyById(projectId, input.property_id);
  if (!property) throw new NotFoundError('Property not found or does not belong to this project.', 'property');
  assertSourceInProject(projectId, input.source_id);

  const db = getDb();
  const existing = db
    .prepare('SELECT 1 FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, input.property_id);
  if (existing) {
    throw new ConflictError('This property is already attached to the event.');
  }

  const now = nowIso();
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM event_properties WHERE event_id = ?').get(
      eventId
    ) as { m: number }
  ).m;

  try {
    db.prepare(
      `INSERT INTO event_properties (
        event_id, property_id, required, role, priority, status, source_id, payload_key,
        description_override, example_values_override_json, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      eventId,
      input.property_id,
      input.required ? 1 : 0,
      input.role || DEFAULT_ROLE,
      input.priority ?? null,
      input.status ?? null,
      input.source_id ?? null,
      input.payload_key?.trim() || null,
      input.description_override?.trim() || null,
      toJsonColumn(input.example_values_override_json ?? null),
      input.sort_order ?? maxOrder + 1,
      now,
      now
    );
  } catch (err) {
    mapWriteError(
      err,
      'This property is already attached to the event.',
      `Failed to attach property to event: ${(err as Error).message}`
    );
  }

  const row = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, input.property_id) as EventPropertyDbRow;
  return mapEventPropertyRow(row);
}

export function updateEventProperty(
  projectId: string,
  eventId: string,
  propertyId: string,
  updates: Partial<EventPropertyInput>
): EventPropertyRow {
  getEventOrThrow(projectId, eventId);
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, propertyId);
  if (!existing) throw new NotFoundError('This property is not attached to the event.', 'event_property');
  if (updates.source_id !== undefined) assertSourceInProject(projectId, updates.source_id);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.required !== undefined) patch.required = updates.required ? 1 : 0;
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.source_id !== undefined) patch.source_id = updates.source_id;
  if (updates.payload_key !== undefined) patch.payload_key = updates.payload_key?.trim() || null;
  if (updates.description_override !== undefined) {
    patch.description_override = updates.description_override?.trim() || null;
  }
  if (updates.example_values_override_json !== undefined) {
    patch.example_values_override_json = toJsonColumn(updates.example_values_override_json);
  }
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order;

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db.prepare(
    `UPDATE event_properties SET ${setClause} WHERE event_id = @event_id AND property_id = @property_id`
  ).run({ ...patch, event_id: eventId, property_id: propertyId });

  const row = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, propertyId) as EventPropertyDbRow;
  return mapEventPropertyRow(row);
}

export function detachPropertyFromEvent(projectId: string, eventId: string, propertyId: string): void {
  getEventOrThrow(projectId, eventId);
  const db = getDb();
  const result = db
    .prepare('DELETE FROM event_properties WHERE event_id = ? AND property_id = ?')
    .run(eventId, propertyId);
  if (result.changes === 0) {
    throw new NotFoundError('This property is not attached to the event.', 'event_property');
  }
}

/** Replaces the whole ordered link list for the event in one transaction (`PUT /events/:id/properties`). */
export function replaceEventProperties(
  projectId: string,
  eventId: string,
  links: EventPropertyInput[]
): EventPropertyWithDetails[] {
  getEventOrThrow(projectId, eventId);
  const db = getDb();

  for (const link of links) {
    if (!getPropertyById(projectId, link.property_id)) {
      throw new NotFoundError(
        `Property not found or does not belong to this project: ${link.property_id}.`,
        'property'
      );
    }
    assertSourceInProject(projectId, link.source_id);
  }

  const now = nowIso();
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM event_properties WHERE event_id = ?').run(eventId);
    const insert = db.prepare(
      `INSERT INTO event_properties (
        event_id, property_id, required, role, priority, status, source_id, payload_key,
        description_override, example_values_override_json, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    links.forEach((link, index) => {
      insert.run(
        eventId,
        link.property_id,
        link.required ? 1 : 0,
        link.role || DEFAULT_ROLE,
        link.priority ?? null,
        link.status ?? null,
        link.source_id ?? null,
        link.payload_key?.trim() || null,
        link.description_override?.trim() || null,
        toJsonColumn(link.example_values_override_json ?? null),
        link.sort_order ?? index,
        now,
        now
      );
    });
  });
  replace();

  return getEventWithProperties(projectId, eventId).properties;
}
