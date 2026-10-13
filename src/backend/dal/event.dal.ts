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
  LimitEventPropertiesError,
  LimitEventTypesError,
  MaxDiscriminatorsError,
  NotFoundError,
  RoleRequiresEnumError,
  ValidationError,
} from '../errors';
import { getPropertyById, type PropertyRow } from './property.dal';
import { getBundleOrThrow } from './bundle.dal';
import { validateAsciiName, validateDerivedMetricsJson, validateExpirationJson, validateStringArray } from './validators';
import {
  EVENT_PROPERTY_ROLES,
  EVENT_STATUSES,
  ENTITY_STATUSES,
  EVENT_CLASSES,
  DEFAULT_IMPLEMENTATION_METHOD,
  IMPLEMENTATION_METHODS,
  PRIORITIES,
  type EventClass,
  type ImplementationMethod,
} from '../../domain/enums';
import { BLOOMREACH_LIMITS } from '../../domain/bloomreach';
import { defaultImplementationMethod } from '../../domain/codegen/defaults';
import { implementationMethodForSourceMethod } from '../../domain/sources';
import { buildConditionsKey, generateVariantName, normalizeConditions, type VariantCondition } from '../../domain/variants';
import { markRequirementsGapForDetach, markRequirementsGapForEventRemoval, markRequirementsGapForVariantRemoval } from './requirement.dal';
import * as ChangeLogDAL from './change-log.dal';
import { removePropertyFromFieldMaps } from './standard-event-mapping.dal';
import * as PropertyDefinitionDAL from './property-definition.dal';
import { normalizeHttpUrl } from './urlValidation';

const MAX_DISCRIMINATORS_PER_EVENT = 2;

/** D-38: the project already has `BLOOMREACH_LIMITS.MAX_EVENT_TYPES_PER_PROJECT` live event rows. */
function assertEventTypeLimitNotReached(projectId: string): void {
  const { n } = getDb()
    .prepare('SELECT COUNT(*) as n FROM events WHERE project_id = ? AND deleted_at IS NULL')
    .get(projectId) as { n: number };
  if (n >= BLOOMREACH_LIMITS.MAX_EVENT_TYPES_PER_PROJECT) {
    throw new LimitEventTypesError(
      `This project already has ${BLOOMREACH_LIMITS.MAX_EVENT_TYPES_PER_PROJECT} event types, Bloomreach's limit.`,
      'name'
    );
  }
}

/** D-38: the event already has `BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT` attached properties. */
function assertEventPropertyLimitNotReached(eventId: string): void {
  const { n } = getDb()
    .prepare('SELECT COUNT(*) as n FROM event_properties WHERE event_id = ?')
    .get(eventId) as { n: number };
  if (n >= BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT) {
    throw new LimitEventPropertiesError(
      `This event already has ${BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT} properties, Bloomreach's limit.`,
      'property_id'
    );
  }
}

/**
 * T-4-03 pre-QA fix: `triggers_json[].source` (D-50: the page URL a screenshot was captured on,
 * exposed as `EventCardTrigger.page_url`) must be `http://`/`https://` or empty -- it renders as an
 * `href` in `EventCardView`/`SharedProject`, so a `javascript:`/other scheme must be rejected at
 * write time, the same reasoning as `normalizeHttpUrl`'s existing callers (`documentation_url`/
 * `internal_url`). Every other trigger field (`title`, `description`, `image_path`, `order`) stays
 * free-form, unvalidated here. A non-array value is left to `toJsonColumn`/the `?? []` default
 * upstream, not this function's concern.
 */
/** L3: an uploaded-file path is relative, non-empty, with no `..` segment and no backslash. */
export function isSafeImagePath(path: unknown): boolean {
  if (typeof path !== 'string' || !path.trim()) return false;
  if (path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) return false;
  return !path.split('/').includes('..');
}

function validateTriggersJson(value: unknown, field: string): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const paths = [...(Array.isArray(e.images) ? e.images : []), ...(typeof e.image_path === 'string' ? [e.image_path] : [])];
      if (paths.some((p) => !isSafeImagePath(p))) {
        throw new BadRequestError('Trigger image paths must be relative, non-empty and free of ".." and backslashes.', 'triggers_json');
      }
    }
    if (entry && typeof entry === 'object' && 'images' in (entry as Record<string, unknown>)) {
      const images = (entry as Record<string, unknown>).images;
      if (images !== null && images !== undefined && (!Array.isArray(images) || images.some((i) => typeof i !== 'string'))) {
        throw new BadRequestError(`${field}[].images must be an array of file paths.`, `${field}[].images`);
      }
    }
    if (entry && typeof entry === 'object' && 'source' in (entry as Record<string, unknown>)) {
      normalizeHttpUrl((entry as Record<string, unknown>).source, `${field}[].source`);
    }
  }
}

/**
 * Cross-field validation for Event create/update (T-1-04 fix round ERROR 1; `class` replaces
 * `event_type`, D-36): `class`, `priority`, `status` against `src/domain/enums.ts`;
 * `expiration_json` and `derived_metrics_json` shape; `tags_json` string array; `triggers_json[].source`
 * (T-4-03 pre-QA fix).
 */
function validateEventFields(fields: {
  class?: string;
  implementation_method?: string;
  dl_event_name?: string | null;
  priority?: string | null;
  status?: string;
  expiration_json?: unknown;
  derived_metrics_json?: unknown;
  tags_json?: unknown;
  triggers_json?: unknown;
}): void {
  if (fields.class !== undefined && !(EVENT_CLASSES as readonly string[]).includes(fields.class)) {
    throw new BadRequestError(`class must be one of: ${EVENT_CLASSES.join(', ')}.`, 'class');
  }
  if (
    fields.implementation_method !== undefined &&
    !(IMPLEMENTATION_METHODS as readonly string[]).includes(fields.implementation_method)
  ) {
    throw new BadRequestError(
      `implementation_method must be one of: ${IMPLEMENTATION_METHODS.join(', ')}.`,
      'implementation_method'
    );
  }
  if (fields.dl_event_name !== undefined && fields.dl_event_name !== null && typeof fields.dl_event_name !== 'string') {
    throw new BadRequestError('dl_event_name must be a string.', 'dl_event_name');
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
  validateTriggersJson(fields.triggers_json, 'triggers_json');
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
  class: EventClass;
  /** D-63 (T-4-17): how the event reaches Bloomreach; drives which codegen tabs the card shows. */
  implementation_method: ImplementationMethod;
  /** D-63: the site's dataLayer event that carries this Bloomreach event; `null` = not recorded. */
  dl_event_name: string | null;
  /** D-67 (T-4-28): identity-rule identifier names the event sends in `customer_ids`; `null` = derived default. */
  identifiers_json: string[] | null;
  /** T-5-31: `null` = Automatic (derived), true/false = forced in/out of QA scope. */
  qa_scope_override: boolean | null;
  /** Data Manager group name (T-2-02/T-2-03, D-28); `null` = default group, symmetrical with `Property.category`. */
  category: string | null;
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
  /** Data Manager event-level flags the app has no concept of (T-2-02/T-2-03, D-28, D-35). */
  bloomreach_meta_json: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type EventDbRow = Omit<
  EventRow,
  | 'triggers_json'
  | 'expiration_json'
  | 'derived_metrics_json'
  | 'tags_json'
  | 'codegen_event_name_overrides_json'
  | 'bloomreach_meta_json'
  | 'identifiers_json'
  | 'qa_scope_override'
>;

/** D-67 amendment 2: null = derived, a list = explicit, `[]` = carries no identifier. */
function normalizeIdentifiers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === 'string');
}

/** D-67: every name must be an identifier of the project's registry (D-69) (400 otherwise); `[]`/null clear to the derived default. */
function validateIdentifiers(projectId: string, value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new BadRequestError('identifiers_json must be an array of identifier names or null.', 'identifiers_json');
  }
  const names = [...new Set(value as string[])];
  if (names.length === 0) return [];
  const known = new Set(
    (getDb().prepare('SELECT name FROM identifiers WHERE project_id = ?').all(projectId) as { name: string }[]).map((r) => r.name)
  );
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length > 0) {
    throw new BadRequestError(
      `identifiers_json names no registered identifier: ${unknown.join(', ')}.`,
      'identifiers_json'
    );
  }
  return names;
}

function qaScopeColumn(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'boolean') throw new BadRequestError('qa_scope_override must be true, false or null.', 'qa_scope_override');
  return v ? 1 : 0;
}

function mapEventRow(row: EventDbRow): EventRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    triggers_json: parseJsonColumn(raw.triggers_json, []),
    expiration_json: parseJsonColumn(raw.expiration_json, null),
    derived_metrics_json: parseJsonColumn(raw.derived_metrics_json, []),
    tags_json: parseJsonColumn(raw.tags_json, []),
    codegen_event_name_overrides_json: parseJsonColumn(raw.codegen_event_name_overrides_json, null),
    bloomreach_meta_json: parseJsonColumn(raw.bloomreach_meta_json, null),
    identifiers_json: normalizeIdentifiers(parseJsonColumn(raw.identifiers_json, null)),
    qa_scope_override: raw.qa_scope_override === 1 ? true : raw.qa_scope_override === 0 ? false : null,
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
  class?: string;
  implementation_method?: string;
  dl_event_name?: string | null;
  identifiers_json?: string[] | null;
  qa_scope_override?: boolean | null;
  category?: string | null;
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
  bloomreach_meta_json?: unknown;
}

const DEFAULT_EVENT_CLASS = 'custom';
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

/**
 * D-62 (T-4-11B): a linked source's collection method defaults the event's D-63 implementation method,
 * but only while the event still has the plain default (`client_web`) -- an explicit choice (`server_api`,
 * `sdk_auto`, or one passed in the same request) is never overridden. Returns the method to set, or `null`.
 */
function implementationMethodFromSources(projectId: string, currentMethod: string, sourceIds: string[]): string | null {
  if (currentMethod !== DEFAULT_IMPLEMENTATION_METHOD || sourceIds.length === 0) return null;
  const placeholders = sourceIds.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(`SELECT id, method FROM sources WHERE project_id = ? AND id IN (${placeholders})`)
    .all(projectId, ...sourceIds) as { id: string; method: string | null }[];
  const byId = new Map(rows.map((r) => [r.id, r.method]));
  for (const id of sourceIds) {
    const implied = implementationMethodForSourceMethod(byId.get(id));
    if (implied && implied !== currentMethod) return implied;
  }
  return null;
}

export function listEventSourceIds(projectId: string, eventId: string): string[] {
  getEventOrThrow(projectId, eventId);
  return (
    getDb()
      .prepare('SELECT source_id FROM event_sources WHERE event_id = ?')
      .all(eventId) as { source_id: string }[]
  ).map((r) => r.source_id);
}

/**
 * `opts.applyDefaultSource` (D-62): the editor/API route sets it so a new *custom* event with no sources of its
 * own gets the project's default source. Import planners (data mapping, Data Manager, expiration) never set it.
 */
export function createEvent(projectId: string, input: EventInput, opts: { applyDefaultSource?: boolean } = {}): EventRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Event name is required.', 'name');
  validateAsciiName(name, 'name');
  validateEventFields(input);
  assertEventTypeLimitNotReached(projectId);

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM events WHERE project_id = ? AND name = ? AND deleted_at IS NULL')
    .get(projectId, name);
  if (existing) throw new ConflictError(`An event named "${name}" already exists in this project.`);

  const identifiersJson = (() => {
    const v = validateIdentifiers(projectId, input.identifiers_json);
    return v === null ? null : JSON.stringify(v);
  })();
  const id = newId();
  const now = nowIso();
  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO events (
          id, project_id, name, business_name, description, purpose, page, trigger_text, grain,
          identity_note, triggers_json, class, implementation_method, dl_event_name, identifiers_json, qa_scope_override, category, owner_business,
          owner_technical, priority,
          status, expiration_json, not_suitable_for, agent_instructions, derived_metrics_json,
          tags_json, codegen_event_name_overrides_json, bloomreach_meta_json, created_at, updated_at,
          deleted_at
        ) VALUES (
          @id, @project_id, @name, @business_name, @description, @purpose, @page, @trigger_text, @grain,
          @identity_note, @triggers_json, @class, @implementation_method, @dl_event_name, @identifiers_json, @qa_scope_override, @category, @owner_business,
          @owner_technical, @priority,
          @status, @expiration_json, @not_suitable_for, @agent_instructions, @derived_metrics_json,
          @tags_json, NULL, @bloomreach_meta_json, @created_at, @updated_at, NULL
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
        class: input.class || DEFAULT_EVENT_CLASS,
        implementation_method:
          input.implementation_method || defaultImplementationMethod(name, input.class || DEFAULT_EVENT_CLASS),
        dl_event_name: input.dl_event_name?.trim() || null,
        identifiers_json: identifiersJson,
        qa_scope_override: qaScopeColumn(input.qa_scope_override),
        category: input.category?.trim() || null,
        owner_business: input.owner_business?.trim() || null,
        owner_technical: input.owner_technical?.trim() || null,
        priority: input.priority ?? null,
        status: input.status || DEFAULT_EVENT_STATUS,
        expiration_json: toJsonColumn(input.expiration_json ?? null),
        not_suitable_for: input.not_suitable_for?.trim() || null,
        agent_instructions: input.agent_instructions?.trim() || null,
        derived_metrics_json: toJsonColumn(input.derived_metrics_json ?? []),
        tags_json: toJsonColumn(input.tags_json ?? []),
        bloomreach_meta_json: toJsonColumn(input.bloomreach_meta_json ?? null),
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

    // D-62: a project default source is applied to a new custom event created through the editor/API that names no sources of its own.
    const defaultSourceId = !opts.applyDefaultSource || (input.class || DEFAULT_EVENT_CLASS) !== 'custom' ? null : (db.prepare('SELECT default_source_id FROM projects WHERE id = ?').get(projectId) as { default_source_id: string | null } | undefined)?.default_source_id;
    const createSourceIds = input.source_ids ?? (defaultSourceId ? [defaultSourceId] : null);
    if (createSourceIds !== null) {
      replaceEventSources(projectId, id, createSourceIds);
      if (!input.implementation_method) {
        const implied = implementationMethodFromSources(projectId, getEventOrThrow(projectId, id).implementation_method, createSourceIds);
        if (implied) db.prepare('UPDATE events SET implementation_method = ? WHERE id = ?').run(implied, id);
      }
    }

    const created = getEventOrThrow(projectId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'event',
      entityId: id,
      entityLabel: created.name,
      action: 'create',
      before: null,
      after: {
        ...created,
        // Fix round WARNING 4: source_ids lives on event_sources, not the events row itself; kept
        // out of EventRow but included in the change_log snapshot so it diffs like any other field.
        source_ids: listEventSourceIds(projectId, id),
      } as unknown as Record<string, unknown>,
    });
  });
  run();

  return getEventOrThrow(projectId, id);
}

export function updateEvent(projectId: string, eventId: string, input: Partial<EventInput>): EventRow {
  const before = getEventOrThrow(projectId, eventId);
  // Fix round WARNING 4: read before any patch runs so a source-only update (input.source_ids set,
  // nothing else) still produces a real before/after difference in the change_log snapshot below.
  const beforeSourceIds = listEventSourceIds(projectId, eventId);
  const db = getDb();

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError('Event name is required.', 'name');
    validateAsciiName(name, 'name');
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
  if (input.class !== undefined) patch.class = input.class;
  if (input.implementation_method !== undefined) patch.implementation_method = input.implementation_method;
  if (input.dl_event_name !== undefined) patch.dl_event_name = input.dl_event_name?.trim() || null;
  if (input.identifiers_json !== undefined) {
    const v = validateIdentifiers(projectId, input.identifiers_json);
    patch.identifiers_json = v === null ? null : JSON.stringify(v);
  }
  if (input.qa_scope_override !== undefined) patch.qa_scope_override = qaScopeColumn(input.qa_scope_override);
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
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
  if (input.bloomreach_meta_json !== undefined) {
    patch.bloomreach_meta_json = toJsonColumn(input.bloomreach_meta_json);
  }

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
      if (input.implementation_method === undefined) {
        const added = (input.source_ids ?? []).filter((s) => !beforeSourceIds.includes(s));
        const implied = implementationMethodFromSources(projectId, before.implementation_method, added);
        if (implied) db.prepare('UPDATE events SET implementation_method = ? WHERE id = ?').run(implied, eventId);
      }
    }

    if (input.name !== undefined) {
      regenerateVariantNamesForEvent(projectId, eventId, input.name.trim());
    }

    const after = getEventOrThrow(projectId, eventId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'event',
      entityId: eventId,
      entityLabel: after.name,
      action: 'update',
      before: { ...before, source_ids: beforeSourceIds } as unknown as Record<string, unknown>,
      after: {
        ...after,
        source_ids: listEventSourceIds(projectId, eventId),
      } as unknown as Record<string, unknown>,
    });
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
function regenerateVariantNamesForEvent(projectId: string, eventId: string, eventName: string): void {
  const db = getDb();
  const variantRows = db
    .prepare('SELECT id, name, conditions_json, conditions_key FROM variants WHERE event_id = ?')
    .all(eventId) as { id: string; name: string; conditions_json: string | null; conditions_key: string }[];
  if (variantRows.length === 0) return;

  const parsed = variantRows.map((row) => ({
    id: row.id,
    oldName: row.name,
    oldConditionsJson: parseJsonColumn(row.conditions_json, [] as VariantCondition[]),
    oldConditionsKey: row.conditions_key,
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
  for (const { id, oldName, oldConditionsJson, oldConditionsKey, conditions } of parsed) {
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
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'variant',
      entityId: id,
      entityLabel: name,
      parentEntityId: eventId,
      action: 'update',
      before: { name: oldName, conditions_json: oldConditionsJson, conditions_key: oldConditionsKey },
      after: { name, conditions_json: normalized, conditions_key: conditionsKey },
    });
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
  const eventSourceIds = listEventSourceIds(projectId, eventId);
  const now = nowIso();
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?').run(
      now,
      now,
      eventId,
      projectId
    );

    // T-3-02 (from the T-3-01 review): the cascade used to skip a change_log row for the identity
    // rules whose trigger_event_id it nulls and the standard event mappings it deletes -- both are
    // real definition mutations (D-44), fetched before the writes so the "before" snapshot is real.
    const affectedIdentityRules = db
      .prepare('SELECT id, name, trigger_event_id FROM identity_rules WHERE trigger_event_id = ? AND project_id = ?')
      .all(eventId, projectId) as { id: string; name: string; trigger_event_id: string | null }[];
    const affectedMappings = db
      .prepare('SELECT id, standard_event, variant_id, field_map_json FROM standard_event_mappings WHERE event_id = ? AND project_id = ?')
      .all(eventId, projectId) as { id: string; standard_event: string; variant_id: string | null; field_map_json: string | null }[];

    db.prepare(
      'UPDATE identity_rules SET trigger_event_id = NULL, updated_at = ? WHERE trigger_event_id = ? AND project_id = ?'
    ).run(now, eventId, projectId);
    for (const rule of affectedIdentityRules) {
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'identity_rule',
        entityId: rule.id,
        entityLabel: rule.name,
        action: 'update',
        before: { trigger_event_id: rule.trigger_event_id },
        after: { trigger_event_id: null },
      });
    }

    db.prepare('DELETE FROM standard_event_mappings WHERE event_id = ? AND project_id = ?').run(eventId, projectId);
    for (const mapping of affectedMappings) {
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'standard_event_mapping',
        entityId: mapping.id,
        entityLabel: mapping.standard_event,
        parentEntityId: eventId,
        action: 'delete',
        before: {
          event_id: eventId,
          variant_id: mapping.variant_id,
          field_map_json: parseJsonColumn(mapping.field_map_json, {}),
        },
        after: null,
      });
    }

    markRequirementsGapForEventRemoval(projectId, eventId, event.name);
    // Fix round WARNING 3: cascaded variant deletes get their own change_log row (D-44's "no
    // definition-mutating DAL path skips history" applies here too), even though this whole-event
    // delete only needed name/id/conditions to build the row -- select the fields the diff snapshot
    // actually reports rather than importing variant.dal.ts's row type (would be circular: that
    // module already imports this one for getEventOrThrow).
    const variantRows = db
      .prepare(
        'SELECT id, name, description, conditions_json, conditions_key, expiration_json FROM variants WHERE event_id = ? AND project_id = ?'
      )
      .all(eventId, projectId) as {
      id: string;
      name: string;
      description: string | null;
      conditions_json: string | null;
      conditions_key: string;
      expiration_json: string | null;
    }[];
    for (const variant of variantRows) {
      markRequirementsGapForVariantRemoval(projectId, variant.id, variant.name);
    }

    db.prepare('DELETE FROM variants WHERE event_id = ? AND project_id = ?').run(eventId, projectId);

    for (const variant of variantRows) {
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'variant',
        entityId: variant.id,
        entityLabel: variant.name,
        parentEntityId: eventId,
        action: 'delete',
        before: {
          id: variant.id,
          name: variant.name,
          description: variant.description,
          conditions_json: parseJsonColumn(variant.conditions_json, []),
          conditions_key: variant.conditions_key,
          expiration_json: parseJsonColumn(variant.expiration_json, null),
        },
        after: null,
      });
    }

    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'event',
      entityId: eventId,
      entityLabel: event.name,
      action: 'delete',
      before: { ...event, source_ids: eventSourceIds } as unknown as Record<string, unknown>,
      after: null,
    });
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
  /** D-58: the named meaning this link uses (`property-definition.dal.ts`); always resolved to a
   * real definition on write (never left `null` by the DAL, though the column itself is nullable
   * with `ON DELETE SET NULL` for defensive future-proofing). */
  definition_id: string | null;
  sort_order: number;
  /** Per (event, property) Data Manager flags (T-2-02/T-2-03, D-28, D-35): `{dm_type, private, source, used, deleting, group, dm_index, raw}`. */
  bloomreach_meta_json: unknown;
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
  /** D-58: which of the property's named definitions this link uses; defaults to the property's
   * `general` definition when omitted. Validated to belong to the same property. */
  definition_id?: string | null;
  sort_order?: number;
  bloomreach_meta_json?: unknown;
}

type EventPropertyDbRow = Omit<EventPropertyRow, 'required' | 'bloomreach_meta_json'>;

function mapEventPropertyRow(row: EventPropertyDbRow): EventPropertyRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    required: fromSqliteBool(raw.required),
    bloomreach_meta_json: parseJsonColumn(raw.bloomreach_meta_json, null),
  };
}

export interface EventPropertyWithDetailsExtended extends EventPropertyWithDetails {
  definition: PropertyDefinitionDAL.PropertyDefinitionRow | null;
}

/**
 * `definitionsById` (fix round WARNING 3, reviewer FAIL 2026-09-28 14:26): an optional pre-loaded
 * `property_definitions` lookup (`property-definition.dal.ts#listAllDefinitionsById`), so a caller
 * that already has the whole project's definitions in memory (`document.service.ts`'s
 * `EventCardBuildContext`, `comparison.service.ts`'s `buildDefinitionSnapshot`) resolves every
 * link's definition with a `Map.get`, not one `getDefinitionById` query per link -- on the fixture
 * project (48 events) `buildTrackingDocument` went from 696 definition queries to 0. Omitted (the
 * default), this falls back to the original per-link query, for every other caller that has no
 * such map handy and only reads one or a few events at a time.
 */
export function getEventWithProperties(
  projectId: string,
  eventId: string,
  definitionsById?: Map<string, PropertyDefinitionDAL.PropertyDefinitionRow>
): { event: EventRow; properties: EventPropertyWithDetailsExtended[]; source_ids: string[] } {
  const event = getEventOrThrow(projectId, eventId);
  const db = getDb();
  const linkRows = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? ORDER BY sort_order, created_at')
    .all(eventId) as EventPropertyDbRow[];

  const properties: EventPropertyWithDetailsExtended[] = [];
  for (const raw of linkRows) {
    const link = mapEventPropertyRow(raw);
    const property = getPropertyById(projectId, link.property_id);
    if (!property) continue; // property soft-deleted; link is stale but left intact (T-1-02 keeps it simple)
    const definition = !link.definition_id
      ? null
      : definitionsById
        ? (definitionsById.get(link.definition_id) ?? null)
        : PropertyDefinitionDAL.getDefinitionById(projectId, link.definition_id);
    properties.push({ ...link, property, definition });
  }

  return { event, properties, source_ids: listEventSourceIds(projectId, eventId) };
}

const DEFAULT_ROLE = 'normal';

export function attachPropertyToEvent(
  projectId: string,
  eventId: string,
  input: EventPropertyInput
): EventPropertyRow {
  const event = getEventOrThrow(projectId, eventId);
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
  assertEventPropertyLimitNotReached(eventId);
  PropertyDefinitionDAL.assertDefinitionBelongsToProperty(projectId, input.property_id, input.definition_id);
  const definitionId =
    input.definition_id ?? PropertyDefinitionDAL.getDefaultDefinitionId(projectId, input.property_id);

  const now = nowIso();
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM event_properties WHERE event_id = ?').get(
      eventId
    ) as { m: number }
  ).m;

  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO event_properties (
          event_id, property_id, required, role, priority, status, source_id, payload_key,
          definition_id, sort_order, bloomreach_meta_json,
          created_at, updated_at
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
        definitionId,
        input.sort_order ?? maxOrder + 1,
        toJsonColumn(input.bloomreach_meta_json ?? null),
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

    const created = db
      .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
      .get(eventId, input.property_id) as EventPropertyDbRow;

    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'event_property',
      entityId: `${eventId}:${input.property_id}`,
      entityLabel: `${event.name}.${property.name}`,
      parentEntityId: eventId,
      action: 'create',
      before: null,
      after: mapEventPropertyRow(created) as unknown as Record<string, unknown>,
    });
  });
  run();

  const row = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, input.property_id) as EventPropertyDbRow;
  return mapEventPropertyRow(row);
}

/**
 * D-63 (T-4-17): links every property of a bundle to the event in one call (role `normal`, the
 * property's default definition, optional). Properties already linked are skipped and reported in
 * `skipped_property_ids`; the whole call is one transaction, so a limit error (255 properties per
 * event) leaves the event unchanged.
 */
export function attachBundleToEvent(
  projectId: string,
  eventId: string,
  bundleId: string
): { attached: EventPropertyRow[]; skipped_property_ids: string[] } {
  getEventOrThrow(projectId, eventId);
  const bundle = getBundleOrThrow(projectId, bundleId);
  const db = getDb();
  const run = db.transaction(() => {
    const already = new Set(
      (
        db.prepare('SELECT property_id FROM event_properties WHERE event_id = ?').all(eventId) as {
          property_id: string;
        }[]
      ).map((r) => r.property_id)
    );
    const attached: EventPropertyRow[] = [];
    const skipped: string[] = [];
    for (const propertyId of bundle.property_ids) {
      if (already.has(propertyId)) {
        skipped.push(propertyId);
        continue;
      }
      attached.push(attachPropertyToEvent(projectId, eventId, { property_id: propertyId, role: DEFAULT_ROLE }));
    }
    return { attached, skipped_property_ids: skipped };
  });
  return run();
}

export function updateEventProperty(
  projectId: string,
  eventId: string,
  propertyId: string,
  updates: Partial<EventPropertyInput>
): EventPropertyRow {
  const event = getEventOrThrow(projectId, eventId);
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, propertyId) as EventPropertyDbRow | undefined;
  if (!existing) throw new NotFoundError('This property is not attached to the event.', 'event_property');
  const before = mapEventPropertyRow(existing);
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
  if (updates.definition_id !== undefined) {
    PropertyDefinitionDAL.assertDefinitionBelongsToProperty(projectId, propertyId, updates.definition_id);
    patch.definition_id = updates.definition_id ?? PropertyDefinitionDAL.getDefaultDefinitionId(projectId, propertyId);
  }
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order;
  if (updates.bloomreach_meta_json !== undefined) {
    patch.bloomreach_meta_json = toJsonColumn(updates.bloomreach_meta_json);
  }

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');

  const property = getPropertyById(projectId, propertyId);
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE event_properties SET ${setClause} WHERE event_id = @event_id AND property_id = @property_id`
    ).run({ ...patch, event_id: eventId, property_id: propertyId });

    const after = mapEventPropertyRow(
      db
        .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
        .get(eventId, propertyId) as EventPropertyDbRow
    );
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'event_property',
      entityId: `${eventId}:${propertyId}`,
      entityLabel: `${event.name}.${property?.name ?? propertyId}`,
      parentEntityId: eventId,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();

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
/**
 * T-3-10 QA fix (ERROR 2, qa-tester 2026-09-28 10:19; supervisor DECISION 10:22): the single place
 * that handles a property dropping off an event's link list -- marks its requirements `gap`
 * (`markRequirementsGapForDetach`) and clears it out of every standard event mapping's
 * `field_map_json` for this event (`removePropertyFromFieldMaps`), so the cleanup is identical
 * whichever of the two ways a link can be dropped: `detachPropertyFromEvent` (`DELETE
 * /events/:id/properties/:propertyId`, one property at a time) or `replaceEventProperties` (`PUT
 * /events/:id/properties`, the whole-list save the Events page's editor actually uses -- the path
 * the pre-QA-fix round's WARNING-1 fix never reached, reproduced by the qa-tester as ERROR 2).
 * Callers run this inside their own transaction, once per property id that is about to disappear.
 */
function handleDroppedEventProperty(projectId: string, eventId: string, propertyId: string, propertyName: string): void {
  markRequirementsGapForDetach(projectId, eventId, propertyId, propertyName);
  removePropertyFromFieldMaps(projectId, propertyId, eventId);
}

export function detachPropertyFromEvent(projectId: string, eventId: string, propertyId: string): void {
  const event = getEventOrThrow(projectId, eventId);
  assertPropertyNotUsedByVariant(eventId, propertyId);
  const db = getDb();
  const property = getPropertyById(projectId, propertyId);
  const existingLink = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, propertyId) as EventPropertyDbRow | undefined;
  const run = db.transaction(() => {
    const result = db
      .prepare('DELETE FROM event_properties WHERE event_id = ? AND property_id = ?')
      .run(eventId, propertyId);
    if (result.changes === 0) {
      throw new NotFoundError('This property is not attached to the event.', 'event_property');
    }
    handleDroppedEventProperty(projectId, eventId, propertyId, property?.name ?? propertyId);

    if (existingLink) {
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'event_property',
        entityId: `${eventId}:${propertyId}`,
        entityLabel: `${event.name}.${property?.name ?? propertyId}`,
        parentEntityId: eventId,
        action: 'delete',
        before: mapEventPropertyRow(existingLink) as unknown as Record<string, unknown>,
        after: null,
      });
    }
  });
  run();
}

/** Replaces the whole ordered link list for the event in one transaction (`PUT /events/:id/properties`). */
export function replaceEventProperties(
  projectId: string,
  eventId: string,
  links: EventPropertyInput[]
): EventPropertyWithDetails[] {
  const event = getEventOrThrow(projectId, eventId);
  const db = getDb();

  // Fix round INFO 6: this function used to call getPropertyById (each hit doing its own
  // BundleDAL lookup) up to three times for the same property_id -- once per link in the
  // validation loop, again for a dropped property's label, again for the change-log diff loop.
  // One cache, populated lazily, used everywhere below.
  const propertyCache = new Map<string, PropertyRow | null>();
  function cachedProperty(propertyId: string): PropertyRow | null {
    if (!propertyCache.has(propertyId)) {
      propertyCache.set(propertyId, getPropertyById(projectId, propertyId));
    }
    return propertyCache.get(propertyId) ?? null;
  }

  // De-duplicate by property_id, last one wins (fix round 2, finding #F): the UI's "select a
  // property to attach" dropdown already excludes properties already in `links`, so this only
  // matters for a direct API caller sending the same property_id twice; without it, the insert
  // below hits UNIQUE(event_id, property_id) mid-transaction and previously surfaced as a raw 500.
  const dedupedByPropertyId = new Map<string, EventPropertyInput>();
  for (const link of links) {
    dedupedByPropertyId.set(link.property_id, link);
  }
  const uniqueLinks = Array.from(dedupedByPropertyId.values());
  if (uniqueLinks.length > BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT) {
    throw new LimitEventPropertiesError(
      `This event already has ${BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT} properties, Bloomreach's limit.`,
      'property_id'
    );
  }

  let discriminatorCount = 0;
  const nextDiscriminatorIds = new Set<string>();
  for (const link of uniqueLinks) {
    const property = cachedProperty(link.property_id);
    if (!property) {
      throw new NotFoundError(
        `Property not found or does not belong to this project: ${link.property_id}.`,
        'property'
      );
    }
    assertSourceInProject(projectId, link.source_id);
    validateEventPropertyLinkFields(link);
    PropertyDefinitionDAL.assertDefinitionBelongsToProperty(projectId, link.property_id, link.definition_id);
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

  // T-2-02: this whole-list replace deletes and re-inserts every link, so a Data Manager events
  // import's per-link `bloomreach_meta_json` (T-2-03) would otherwise be silently wiped the next
  // time the Edit Event panel saves the property list. Carry the existing meta forward for any link
  // whose caller did not explicitly pass `bloomreach_meta_json`.
  const existingMetaByPropertyId = new Map(
    (
      db.prepare('SELECT property_id, bloomreach_meta_json FROM event_properties WHERE event_id = ?').all(
        eventId
      ) as { property_id: string; bloomreach_meta_json: string | null }[]
    ).map((r) => [r.property_id, r.bloomreach_meta_json])
  );
  // D-58: same carry-forward as bloomreach_meta_json above, for a caller that resends the whole
  // list without naming a definition_id per link (the common case: the Edit Event panel round
  // -trips the property list without necessarily touching the definition picker).
  const existingDefinitionByPropertyId = new Map(
    (
      db.prepare('SELECT property_id, definition_id FROM event_properties WHERE event_id = ?').all(eventId) as {
        property_id: string;
        definition_id: string | null;
      }[]
    ).map((r) => [r.property_id, r.definition_id])
  );

  // Full "before" snapshot of every link, for the per-link change_log diff below (D-44: one row
  // per changed link, keyed by property_id, since this whole-list replace deletes and re-inserts
  // every row and would otherwise look like every link was dropped and recreated).
  const beforeLinksRaw = db
    .prepare('SELECT * FROM event_properties WHERE event_id = ?')
    .all(eventId) as EventPropertyDbRow[];
  const beforeByPropertyId = new Map(beforeLinksRaw.map((r) => [r.property_id, mapEventPropertyRow(r)]));

  const now = nowIso();
  try {
    const replace = db.transaction(() => {
      db.prepare('DELETE FROM event_properties WHERE event_id = ?').run(eventId);
      for (const droppedId of droppedPropertyIds) {
        const property = cachedProperty(droppedId);
        handleDroppedEventProperty(projectId, eventId, droppedId, property?.name ?? droppedId);
      }
      const insert = db.prepare(
        `INSERT INTO event_properties (
          event_id, property_id, required, role, priority, status, source_id, payload_key,
          definition_id, sort_order, bloomreach_meta_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      uniqueLinks.forEach((link, index) => {
        const definitionId =
          link.definition_id !== undefined
            ? link.definition_id
            : (existingDefinitionByPropertyId.get(link.property_id) ??
              PropertyDefinitionDAL.getDefaultDefinitionId(projectId, link.property_id));
        insert.run(
          eventId,
          link.property_id,
          link.required ? 1 : 0,
          link.role || DEFAULT_ROLE,
          link.priority ?? null,
          link.status ?? null,
          link.source_id ?? null,
          link.payload_key?.trim() || null,
          definitionId,
          link.sort_order ?? index,
          link.bloomreach_meta_json !== undefined
            ? toJsonColumn(link.bloomreach_meta_json)
            : (existingMetaByPropertyId.get(link.property_id) ?? null),
          now,
          now
        );
      });

      const afterLinksRaw = db
        .prepare('SELECT * FROM event_properties WHERE event_id = ?')
        .all(eventId) as EventPropertyDbRow[];
      const afterByPropertyId = new Map(afterLinksRaw.map((r) => [r.property_id, mapEventPropertyRow(r)]));
      const allPropertyIds = new Set([...beforeByPropertyId.keys(), ...afterByPropertyId.keys()]);
      for (const propertyId of allPropertyIds) {
        const before = beforeByPropertyId.get(propertyId) ?? null;
        const after = afterByPropertyId.get(propertyId) ?? null;
        const property = cachedProperty(propertyId);
        const action = !before ? 'create' : !after ? 'delete' : 'update';
        ChangeLogDAL.recordChange({
          projectId,
          entityType: 'event_property',
          entityId: `${eventId}:${propertyId}`,
          entityLabel: `${event.name}.${property?.name ?? propertyId}`,
          parentEntityId: eventId,
          action,
          before: before as unknown as Record<string, unknown> | null,
          after: after as unknown as Record<string, unknown> | null,
        });
      }
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
