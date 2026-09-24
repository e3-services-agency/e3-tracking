/**
 * Event Data Access Layer. Every function takes `projectId`; all queries enforce `project_id`.
 * `EventProperty` (D-16) carries `required`/`role`/`payload_key`/etc. per event; enums
 * (`allowed_values_json`) live once on `Property` (T-1-04 adds the enum/role editors and the
 * `ROLE_REQUIRES_ENUM`/`MAX_DISCRIMINATORS` validation described in the plan).
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, fromSqliteBool, mapWriteError } from '../db/util';
import {
  BadRequestError,
  ConflictError,
  DiscriminatorInUseError,
  MaxDiscriminatorsError,
  NotFoundError,
  RoleRequiresEnumError,
  ValidationError,
} from '../errors';
import { getPropertyById, type PropertyRow } from './property.dal';
import { validateDerivedMetricsJson, validateExpirationJson, validateStringArray } from './validators';
import { EVENT_PROPERTY_ROLES, EVENT_STATUSES, ENTITY_STATUSES, ORIGIN_TYPES, PRIORITIES } from '../../domain/enums';
import { buildConditionsKey, generateVariantName, normalizeConditions, type VariantCondition } from '../../domain/variants';
import { markRequirementsGapForDetach, markRequirementsGapForEventRemoval, markRequirementsGapForVariantRemoval } from './requirement.dal';

const MAX_DISCRIMINATORS_PER_EVENT = 2;

/**
 * Cross-field validation for Event create/update (T-1-04 fix round ERROR 1): `event_type`,
 * `priority`, `status` against `src/domain/enums.ts`; `expiration_json` and
 * `derived_metrics_json` shape; `tags_json` string array.
 */
function validateEventFields(fields: {
  event_type?: string;
  priority?: string | null;
  status?: string;
  expiration_json?: unknown;
  derived_metrics_json?: unknown;
  tags_json?: unknown;
}): void {
  if (fields.event_type !== undefined && !(ORIGIN_TYPES as readonly string[]).includes(fields.event_type)) {
    throw new BadRequestError(`event_type must be one of: ${ORIGIN_TYPES.join(', ')}.`, 'event_type');
  }
  if (
    fields.priority !== undefined &&
    fields.priority !== null &&
    !(PRIORITIES as readonly string[]).includes(fields.priority)
  ) {
    throw new BadRequestError(`priority must be one of: ${PRIORITIES.join(', ')}.`, 'priority');
  }
  if (fields.status !== undefined && !(EVENT_STATUSES as readonly string[]).includes(fields.status)) {
    throw new BadRequestError(`status must be one of: ${EVENT_STATUSES.join(', ')}.`, 'status');
  }
  validateExpirationJson(fields.expiration_json, 'expiration_json');
  validateDerivedMetricsJson(fields.derived_metrics_json, 'derived_metrics_json');
  validateStringArray(fields.tags_json, 'tags_json');
}

/**
 * EventProperty link field validation (T-1-04 fix round ERROR 2): `role` against
 * `EVENT_PROPERTY_ROLES`, link `priority`/`status` against `PRIORITIES`/`ENTITY_STATUSES` (D-16).
 */
function validateEventPropertyLinkFields(fields: {
  role?: string;
  priority?: string | null;
  status?: string | null;
}): void {
  if (fields.role !== undefined && !(EVENT_PROPERTY_ROLES as readonly string[]).includes(fields.role)) {
    throw new BadRequestError(`role must be one of: ${EVENT_PROPERTY_ROLES.join(', ')}.`, 'role');
  }
  if (
    fields.priority !== undefined &&
    fields.priority !== null &&
    !(PRIORITIES as readonly string[]).includes(fields.priority)
  ) {
    throw new BadRequestError(`priority must be one of: ${PRIORITIES.join(', ')}.`, 'priority');
  }
  if (
    fields.status !== undefined &&
    fields.status !== null &&
    !(ENTITY_STATUSES as readonly string[]).includes(fields.status)
  ) {
    throw new BadRequestError(`status must be one of: ${ENTITY_STATUSES.join(', ')}.`, 'status');
  }
}

/**
 * D-03 / D-16 (T-1-04 delta): `role` `discriminator|context` requires the property to have a
 * non-empty `allowed_values_json` (a shared value list to drive variant conditions, context
 * filters and the coverage grid).
 */
function assertRoleAllowedForProperty(role: string, property: PropertyRow): void {
  if (role !== 'discriminator' && role !== 'context') return;
  const allowedValues = Array.isArray(property.allowed_values_json) ? property.allowed_values_json : [];
  if (allowedValues.length === 0) {
    throw new RoleRequiresEnumError(
      `Property "${property.name}" has no allowed values; role "${role}" requires an enum property.`,
      'role'
    );
  }
}

/**
 * D-03 rule 3 (T-1-04 delta): at most two `discriminator`-role properties per event. Counts
 * distinct property ids already linked with role `discriminator`, excluding `excludePropertyId`
 * (the row being updated, so it does not count against itself).
 */
function assertDiscriminatorLimit(eventId: string, excludePropertyId: string | null): void {
  const rows = getDb()
    .prepare(
      `SELECT property_id FROM event_properties WHERE event_id = ? AND role = 'discriminator'
       ${excludePropertyId ? 'AND property_id != ?' : ''}`
    )
    .all(...(excludePropertyId ? [eventId, excludePropertyId] : [eventId])) as { property_id: string }[];
  if (rows.length >= MAX_DISCRIMINATORS_PER_EVENT) {
    throw new MaxDiscriminatorsError(
      `This event already has ${MAX_DISCRIMINATORS_PER_EVENT} discriminator properties (D-03 rule 3).`,
      'role'
    );
  }
}

/**
 * Every variant of `eventId` that conditions on `propertyId`, by name (fix round ERROR 2). Reads
 * `conditions_json` directly with `getDb()` rather than importing `variant.dal.ts` (which already
 * imports this module for `getEventOrThrow`, so importing it back here would be circular).
 */
function getVariantNamesUsingProperty(eventId: string, propertyId: string): string[] {
  const rows = getDb()
    .prepare('SELECT name, conditions_json FROM variants WHERE event_id = ?')
    .all(eventId) as { name: string; conditions_json: string | null }[];
  const names: string[] = [];
  for (const row of rows) {
    const conditions = parseJsonColumn(row.conditions_json, [] as VariantCondition[]);
    if (conditions.some((c) => c.property_id === propertyId)) names.push(row.name);
  }
  return names;
}

/**
 * D-03 rule 2 (fix round ERROR 2): a property a Variant conditions on cannot be demoted away from
 * `discriminator` or detached from the event while that Variant still exists — the variant would
 * be left referencing a property that is no longer a valid discriminator for it, invisible once
 * `VariantsSection.tsx` had no discriminators left to show (now fixed to show it read-only
 * instead). 400 `DISCRIMINATOR_IN_USE` listing the variant names.
 */
function assertPropertyNotUsedByVariant(eventId: string, propertyId: string): void {
  const names = getVariantNamesUsingProperty(eventId, propertyId);
  if (names.length > 0) {
    throw new DiscriminatorInUseError(
      `Cannot change this property's role away from "discriminator" or detach it: it is used by ` +
        `variant(s) ${names.join(', ')} on this event.`,
      'role'
    );
  }
}

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
  validateEventFields(input);

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
  validateEventFields(input);

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

  // T-1-07 delta (carried from T-1-05 review): the rename and its variant-name/conditions
  // regeneration must commit atomically, otherwise a crash between the two statements leaves
  // variants displaying the old event name while `events.name` already changed.
  const applyUpdate = db.transaction(() => {
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

    if (input.name !== undefined) {
      regenerateVariantNamesForEvent(eventId, input.name.trim());
    }
  });
  applyUpdate();

  return getEventOrThrow(projectId, eventId);
}

/**
 * LOW 8 (fix round): variant names embed the event name at creation and were never updated on
 * rename. Decision: regenerate at write time (here and in `property.dal.ts`'s `updateProperty`
 * for a renamed discriminator) rather than deriving names at read time — simpler, since it reuses
 * `variant.dal.ts`'s existing `generateVariantName` call shape, keeps every read path (list/get
 * variants, the docs export, the Standard events page) untouched, and variant names change rarely
 * enough that a small write-time cost is not a concern. Renaming can never collide: two variants
 * of the same event already have distinct (canonicalized) conditions, so distinct names, and only
 * the shared event-name prefix changes here.
 *
 * Second fix round (ERROR 1 reopened): also re-runs `normalizeConditions`/`buildConditionsKey` and
 * rewrites `conditions_json`/`conditions_key` alongside `name`, not just `name`. This is no longer
 * strictly required for canonical-identity stability by itself (`normalizeConditions` now sorts by
 * `property_id`, which an event rename never changes), but keeps every derived column in lockstep
 * with the current canonicalization rules on every write path, and covers a future
 * `normalizeConditions` change that reintroduces a name-dependent tiebreaker. Wrapped in
 * `mapWriteError` (INFO 5): a `conditions_key`/`name` UNIQUE hit here would otherwise surface as a
 * raw 500 instead of a 409.
 */
function regenerateVariantNamesForEvent(eventId: string, eventName: string): void {
  const db = getDb();
  const variantRows = db
    .prepare('SELECT id, conditions_json FROM variants WHERE event_id = ?')
    .all(eventId) as { id: string; conditions_json: string | null }[];
  if (variantRows.length === 0) return;

  const parsed = variantRows.map((row) => ({
    id: row.id,
    conditions: parseJsonColumn(row.conditions_json, [] as VariantCondition[]),
  }));
  const propertyIds = [...new Set(parsed.flatMap((v) => v.conditions.map((c) => c.property_id)))];
  if (propertyIds.length === 0) return;

  const placeholders = propertyIds.map(() => '?').join(', ');
  const propertyNameById: Record<string, string> = {};
  (
    db.prepare(`SELECT id, name FROM properties WHERE id IN (${placeholders})`).all(...propertyIds) as {
      id: string;
      name: string;
    }[]
  ).forEach((p) => {
    propertyNameById[p.id] = p.name;
  });

  const now = nowIso();
  const update = db.prepare(
    'UPDATE variants SET name = ?, conditions_json = ?, conditions_key = ?, updated_at = ? WHERE id = ?'
  );
  for (const { id, conditions } of parsed) {
    const normalized = normalizeConditions(conditions);
    const name = generateVariantName(eventName, normalized, propertyNameById);
    const conditionsKey = buildConditionsKey(normalized);
    try {
      update.run(name, toJsonColumn(normalized), conditionsKey, now, id);
    } catch (err) {
      mapWriteError(
        err,
        `A variant named "${name}" already exists for this event.`,
        `Failed to regenerate variant name/key on event rename: ${(err as Error).message}`
      );
    }
  }
}

/**
 * Soft-deletes the event and, in the same transaction, clears `identity_rules.trigger_event_id`
 * for any rule pointing at it (T-1-06 integration fix: the ON DELETE SET NULL migration only fires
 * on a hard delete, but events are soft-deleted here, so without this the rule keeps a "live"
 * reference to an event that no longer shows up anywhere and an unrelated PATCH to the rule fails
 * with "trigger_event_id does not belong to this project"). Also deletes the event's
 * `standard_event_mappings` and `variants` rows (fix round WARNING 4): soft-delete otherwise left
 * a ghost mapping pointing at an event that `listEvents`/the Standard events page/the docs export
 * no longer show, occupying the standard event key until manually overwritten, and orphaned
 * variants with no live event to belong to.
 *
 * T-1-07 fix round ERROR 2: before those variants are deleted (and before the event's own soft
 * delete takes effect), every `requirements` row targeting this event directly (`target_kind =
 * 'event'|'event_property'`) or via one of its variants (`'variant'|'variant_property'`) is marked
 * `status = 'gap'` with its dangling id(s) nulled and a "target removed: <name>" note — see
 * `requirement.dal.ts` `markRequirementsGap*`. Without this, `requirements.event_id`/`variant_id`
 * kept pointing at rows that no longer resolve to anything the API would accept, freezing the whole
 * use case's `PUT /requirements` until a human found and fixed every affected row by hand.
 */
export function deleteEvent(projectId: string, eventId: string): void {
  const event = getEventOrThrow(projectId, eventId);
  const now = nowIso();
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?').run(
      now,
      now,
      eventId,
      projectId
    );
    db.prepare(
      'UPDATE identity_rules SET trigger_event_id = NULL, updated_at = ? WHERE trigger_event_id = ? AND project_id = ?'
    ).run(now, eventId, projectId);
    db.prepare('DELETE FROM standard_event_mappings WHERE event_id = ? AND project_id = ?').run(eventId, projectId);

    markRequirementsGapForEventRemoval(eventId, event.name);
    const variantRows = db
      .prepare('SELECT id, name FROM variants WHERE event_id = ? AND project_id = ?')
      .all(eventId, projectId) as { id: string; name: string }[];
    for (const variant of variantRows) {
      markRequirementsGapForVariantRemoval(variant.id, variant.name);
    }

    db.prepare('DELETE FROM variants WHERE event_id = ? AND project_id = ?').run(eventId, projectId);
  });
  run();
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
  validateEventPropertyLinkFields(input);

  const db = getDb();
  // Already-attached 409 runs before the discriminator-limit 400 (fix round LOW 9): re-attaching a
  // property that is already linked should always surface as "already attached", not as
  // MAX_DISCRIMINATORS just because the event happens to already have two other discriminators.
  const existing = db
    .prepare('SELECT 1 FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, input.property_id);
  if (existing) {
    throw new ConflictError('This property is already attached to the event.');
  }

  const role = input.role || DEFAULT_ROLE;
  assertRoleAllowedForProperty(role, property);
  if (role === 'discriminator') assertDiscriminatorLimit(eventId, null);

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
  validateEventPropertyLinkFields(updates);

  if (updates.role !== undefined) {
    const property = getPropertyById(projectId, propertyId);
    if (!property) throw new NotFoundError('Property not found or does not belong to this project.', 'property');
    assertRoleAllowedForProperty(updates.role, property);
    if (updates.role === 'discriminator') {
      assertDiscriminatorLimit(eventId, propertyId);
    } else {
      assertPropertyNotUsedByVariant(eventId, propertyId);
    }
  }

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

/**
 * T-1-07 fix round ERROR 2: detaching a property that a requirement targets (`event_property` for
 * this event, or `variant_property` on one of this event's variants) used to leave `requirements`
 * pointing at a link that no longer exists; `assertPropertyLinkedToEvent` then rejected any later
 * `PUT /requirements` for that row, even an unchanged re-save. Runs in the same transaction as the
 * detach itself, marking those rows `status = 'gap'` with `property_id` nulled and a "target
 * removed: <name>" note (see `requirement.dal.ts` `markRequirementsGapForDetach`).
 */
export function detachPropertyFromEvent(projectId: string, eventId: string, propertyId: string): void {
  getEventOrThrow(projectId, eventId);
  assertPropertyNotUsedByVariant(eventId, propertyId);
  const db = getDb();
  const property = getPropertyById(projectId, propertyId);
  const run = db.transaction(() => {
    const result = db
      .prepare('DELETE FROM event_properties WHERE event_id = ? AND property_id = ?')
      .run(eventId, propertyId);
    if (result.changes === 0) {
      throw new NotFoundError('This property is not attached to the event.', 'event_property');
    }
    markRequirementsGapForDetach(eventId, propertyId, property?.name ?? propertyId);
  });
  run();
}

/** Replaces the whole ordered link list for the event in one transaction (`PUT /events/:id/properties`). */
export function replaceEventProperties(
  projectId: string,
  eventId: string,
  links: EventPropertyInput[]
): EventPropertyWithDetails[] {
  getEventOrThrow(projectId, eventId);
  const db = getDb();

  // De-duplicate by property_id, last one wins (fix round 2, finding #F): the UI's "select a
  // property to attach" dropdown already excludes properties already in `links`, so this only
  // matters for a direct API caller sending the same property_id twice; without it, the insert
  // below hits UNIQUE(event_id, property_id) mid-transaction and previously surfaced as a raw 500.
  const dedupedByPropertyId = new Map<string, EventPropertyInput>();
  for (const link of links) {
    dedupedByPropertyId.set(link.property_id, link);
  }
  const uniqueLinks = Array.from(dedupedByPropertyId.values());

  let discriminatorCount = 0;
  const nextDiscriminatorIds = new Set<string>();
  for (const link of uniqueLinks) {
    const property = getPropertyById(projectId, link.property_id);
    if (!property) {
      throw new NotFoundError(
        `Property not found or does not belong to this project: ${link.property_id}.`,
        'property'
      );
    }
    assertSourceInProject(projectId, link.source_id);
    validateEventPropertyLinkFields(link);
    const role = link.role || DEFAULT_ROLE;
    assertRoleAllowedForProperty(role, property);
    if (role === 'discriminator') {
      nextDiscriminatorIds.add(link.property_id);
      discriminatorCount += 1;
      if (discriminatorCount > MAX_DISCRIMINATORS_PER_EVENT) {
        throw new MaxDiscriminatorsError(
          `This event already has ${MAX_DISCRIMINATORS_PER_EVENT} discriminator properties (D-03 rule 3).`,
          'role'
        );
      }
    }
  }

  // fix round ERROR 2: a property currently linked as `discriminator` that a variant conditions on
  // must not be dropped from the replacement list, or demoted to another role within it.
  const currentDiscriminators = db
    .prepare("SELECT property_id FROM event_properties WHERE event_id = ? AND role = 'discriminator'")
    .all(eventId) as { property_id: string }[];
  for (const { property_id } of currentDiscriminators) {
    if (!nextDiscriminatorIds.has(property_id)) {
      assertPropertyNotUsedByVariant(eventId, property_id);
    }
  }

  // T-1-07 second fix round ERROR B: the Edit Event panel saves the whole property list through
  // this function (`PUT /events/:id/properties`), never `DELETE /events/:id/properties/:propertyId`
  // — so `markRequirementsGapForDetach` only ran for a caller that does not exist in the UI, and a
  // property dropped from the list here left requirements pointing at a link this transaction was
  // about to delete. Diff the ids that are about to disappear (present before, absent from
  // `uniqueLinks`) and mark each one's requirements `gap` inside this same transaction, exactly like
  // `detachPropertyFromEvent` does for a single property.
  const currentPropertyIds = (
    db.prepare('SELECT property_id FROM event_properties WHERE event_id = ?').all(eventId) as {
      property_id: string;
    }[]
  ).map((r) => r.property_id);
  const nextPropertyIds = new Set(uniqueLinks.map((l) => l.property_id));
  const droppedPropertyIds = currentPropertyIds.filter((id) => !nextPropertyIds.has(id));

  const now = nowIso();
  try {
    const replace = db.transaction(() => {
      db.prepare('DELETE FROM event_properties WHERE event_id = ?').run(eventId);
      for (const droppedId of droppedPropertyIds) {
        const property = getPropertyById(projectId, droppedId);
        markRequirementsGapForDetach(eventId, droppedId, property?.name ?? droppedId);
      }
      const insert = db.prepare(
        `INSERT INTO event_properties (
          event_id, property_id, required, role, priority, status, source_id, payload_key,
          description_override, example_values_override_json, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      uniqueLinks.forEach((link, index) => {
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
  } catch (err) {
    mapWriteError(
      err,
      'One of these properties is already attached to the event.',
      `Failed to replace event properties: ${(err as Error).message}`
    );
  }

  return getEventWithProperties(projectId, eventId).properties;
}
