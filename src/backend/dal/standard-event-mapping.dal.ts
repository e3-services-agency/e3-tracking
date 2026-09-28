/**
 * StandardEventMapping Data Access Layer (plan "Target data model" section StandardEventMapping,
 * T-1-05). `standard_event` is a free string validated against `bloomreach.ts`'s seed plus this
 * project's `standard_event_additions_json` (D-26), never a hardcoded closed union. One row per
 * `(project_id, standard_event)` (`0001_core.sql` unique index); `PUT` is create-or-replace.
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, mapWriteError } from '../db/util';
import { BadRequestError, NotFoundError, UnknownStandardEventError, ValidationError } from '../errors';
import { getStandardEventFields, isKnownStandardEvent, type StandardEventSeed } from '../../domain/bloomreach';
import { getEventOrThrow } from './event.dal';
import { getVariantByIdInProject } from './variant.dal';
import * as ChangeLogDAL from './change-log.dal';

export interface StandardEventMappingRow {
  id: string;
  project_id: string;
  standard_event: string;
  event_id: string;
  variant_id: string | null;
  field_map_json: Record<string, string | null>;
  created_at: string;
  updated_at: string;
}

export interface StandardEventMappingInput {
  event_id: string;
  variant_id?: string | null;
  field_map_json?: Record<string, string | null> | null;
}

type StandardEventMappingDbRow = Omit<StandardEventMappingRow, 'field_map_json'>;

function mapRow(row: StandardEventMappingDbRow): StandardEventMappingRow {
  const raw = row as unknown as Record<string, unknown>;
  return { ...row, field_map_json: parseJsonColumn(raw.field_map_json, {}) };
}

/**
 * Excludes mappings whose event has been soft-deleted (fix round WARNING 4): `deleteEvent` now
 * deletes an event's own mappings/variants in the same transaction going forward, but this join
 * also protects against any mapping left behind by data from before that fix (or a future code
 * path that soft-deletes an event without going through `deleteEvent`), so the Standard events
 * page and the docs export never show a ghost mapping pointing at a gone event.
 */
export function listStandardEventMappings(projectId: string): StandardEventMappingRow[] {
  return (
    getDb()
      .prepare(
        `SELECT m.* FROM standard_event_mappings m
         JOIN events e ON e.id = m.event_id AND e.deleted_at IS NULL
         WHERE m.project_id = ?
         ORDER BY m.standard_event`
      )
      .all(projectId) as StandardEventMappingDbRow[]
  ).map(mapRow);
}

export function getStandardEventMappingByKey(
  projectId: string,
  standardEvent: string
): StandardEventMappingRow | null {
  const row = getDb()
    .prepare('SELECT * FROM standard_event_mappings WHERE project_id = ? AND standard_event = ?')
    .get(projectId, standardEvent) as StandardEventMappingDbRow | undefined;
  return row ? mapRow(row) : null;
}

function getStandardEventMappingOrThrow(projectId: string, standardEvent: string): StandardEventMappingRow {
  const row = getStandardEventMappingByKey(projectId, standardEvent);
  if (!row) throw new NotFoundError('Standard event mapping not found.', 'standard_event_mapping');
  return row;
}

function getProjectStandardEventAdditions(projectId: string): StandardEventSeed[] | null {
  const db = getDb();
  const row = db.prepare('SELECT standard_event_additions_json FROM projects WHERE id = ?').get(projectId) as
    | { standard_event_additions_json: string | null }
    | undefined;
  return parseJsonColumn(row?.standard_event_additions_json, null);
}

/**
 * `field_map_json` keys must be in the standard event's field list (seed or project addition);
 * values (when non-null) must name a property linked to `eventId`.
 */
function validateFieldMap(
  projectId: string,
  eventId: string,
  standardEvent: string,
  fieldMap: unknown,
  additions: StandardEventSeed[] | null
): Record<string, string | null> {
  if (fieldMap === undefined || fieldMap === null) return {};
  if (typeof fieldMap !== 'object' || Array.isArray(fieldMap)) {
    throw new BadRequestError('field_map_json must be an object.', 'field_map_json');
  }
  const allowedFields = getStandardEventFields(standardEvent, additions) ?? [];
  const linkedPropertyIds = new Set(
    (
      getDb().prepare('SELECT property_id FROM event_properties WHERE event_id = ?').all(eventId) as {
        property_id: string;
      }[]
    ).map((r) => r.property_id)
  );

  const result: Record<string, string | null> = {};
  for (const [field, value] of Object.entries(fieldMap as Record<string, unknown>)) {
    if (!allowedFields.includes(field)) {
      throw new BadRequestError(
        `"${field}" is not a field of standard event "${standardEvent}".`,
        'field_map_json'
      );
    }
    if (value === null || value === undefined) {
      result[field] = null;
      continue;
    }
    if (typeof value !== 'string') {
      throw new BadRequestError(`field_map_json.${field} must be a property id or null.`, 'field_map_json');
    }
    if (!linkedPropertyIds.has(value)) {
      throw new BadRequestError(
        `field_map_json.${field} names a property that is not linked to this event.`,
        'field_map_json'
      );
    }
    result[field] = value;
  }
  return result;
}

export function upsertStandardEventMapping(
  projectId: string,
  standardEvent: string,
  input: StandardEventMappingInput
): StandardEventMappingRow {
  const key = standardEvent.trim();
  if (!key) throw new ValidationError('standard_event is required.', 'standard_event');
  const additions = getProjectStandardEventAdditions(projectId);
  if (!isKnownStandardEvent(key, additions)) {
    throw new UnknownStandardEventError(
      `"${key}" is not a known standard event for this project.`,
      'standard_event'
    );
  }
  if (!input.event_id) throw new ValidationError('event_id is required.', 'event_id');
  const event = getEventOrThrow(projectId, input.event_id);

  if (input.variant_id) {
    // Project-scoped, not event-scoped (fix round LOW 6): the event-scoped lookup made the
    // "does not belong to event_id" 400 below unreachable — a variant of a different event always
    // hit its own 404 first. This distinguishes "no such variant" (404) from "that variant exists,
    // but for a different event" (400).
    const variant = getVariantByIdInProject(projectId, input.variant_id);
    if (!variant) throw new NotFoundError('Variant not found.', 'variant');
    if (variant.event_id !== event.id) {
      throw new BadRequestError('variant_id does not belong to event_id.', 'variant_id');
    }
  }

  const fieldMap = validateFieldMap(projectId, event.id, key, input.field_map_json, additions);

  const db = getDb();
  const existing = getStandardEventMappingByKey(projectId, key);
  const now = nowIso();

  if (existing) {
    const run = db.transaction(() => {
      try {
        db.prepare(
          `UPDATE standard_event_mappings
           SET event_id = @event_id, variant_id = @variant_id, field_map_json = @field_map_json, updated_at = @updated_at
           WHERE id = @id AND project_id = @project_id`
        ).run({
          id: existing.id,
          project_id: projectId,
          event_id: event.id,
          variant_id: input.variant_id ?? null,
          field_map_json: toJsonColumn(fieldMap),
          updated_at: now,
        });
      } catch (err) {
        mapWriteError(
          err,
          `A mapping for standard event "${key}" already exists.`,
          `Failed to update standard event mapping: ${(err as Error).message}`
        );
      }
      const after = getStandardEventMappingOrThrow(projectId, key);
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'standard_event_mapping',
        entityId: existing.id,
        entityLabel: key,
        parentEntityId: event.id,
        action: 'update',
        before: existing as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
      });
    });
    run();
    return getStandardEventMappingOrThrow(projectId, key);
  }

  const id = newId();
  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO standard_event_mappings (id, project_id, standard_event, event_id, variant_id, field_map_json, created_at, updated_at)
         VALUES (@id, @project_id, @standard_event, @event_id, @variant_id, @field_map_json, @created_at, @updated_at)`
      ).run({
        id,
        project_id: projectId,
        standard_event: key,
        event_id: event.id,
        variant_id: input.variant_id ?? null,
        field_map_json: toJsonColumn(fieldMap),
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      mapWriteError(
        err,
        `A mapping for standard event "${key}" already exists.`,
        `Failed to create standard event mapping: ${(err as Error).message}`
      );
    }
    const created = getStandardEventMappingOrThrow(projectId, key);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'standard_event_mapping',
      entityId: id,
      entityLabel: key,
      parentEntityId: event.id,
      action: 'create',
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
  });
  run();
  return getStandardEventMappingOrThrow(projectId, key);
}

export function deleteStandardEventMapping(projectId: string, standardEvent: string): void {
  const existing = getStandardEventMappingOrThrow(projectId, standardEvent);
  const db = getDb();
  const run = db.transaction(() => {
    const result = db
      .prepare('DELETE FROM standard_event_mappings WHERE project_id = ? AND standard_event = ?')
      .run(projectId, standardEvent);
    if (result.changes === 0) throw new NotFoundError('Standard event mapping not found.', 'standard_event_mapping');
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'standard_event_mapping',
      entityId: existing.id,
      entityLabel: standardEvent,
      parentEntityId: existing.event_id,
      action: 'delete',
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
}
