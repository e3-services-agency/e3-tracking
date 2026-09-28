/**
 * Variant Data Access Layer (D-03, D-17; replaces the old `event-variant.dal.ts`). Every function
 * takes `projectId` and `eventId`; all queries enforce both. A variant is the event plus ordered
 * conditions over one or two `discriminator`-role properties (`VARIANT_OPERATORS`); `name` is
 * generated from the conditions and unique per event (`0001_core.sql` `UNIQUE(event_id, name)`).
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, mapWriteError } from '../db/util';
import {
  BadRequestError,
  ConditionDuplicatePropertyError,
  ConditionNotDiscriminatorError,
  ConditionValueNotAllowedError,
  MappingInUseError,
  MaxDiscriminatorsError,
  NotFoundError,
  ValidationError,
} from '../errors';
import { VARIANT_OPERATORS } from '../../domain/enums';
import {
  buildConditionsKey,
  generateVariantName,
  normalizeConditions,
  type VariantCondition,
} from '../../domain/variants';
import { getEventOrThrow } from './event.dal';
import { markRequirementsGapForVariantRemoval } from './requirement.dal';
import * as ChangeLogDAL from './change-log.dal';

const MAX_DISCRIMINATOR_PROPERTIES = 2;

export interface VariantRow {
  id: string;
  project_id: string;
  event_id: string;
  name: string;
  description: string | null;
  conditions_json: VariantCondition[];
  /** Canonical, deterministic key built from the normalized conditions; unique per event (0006). */
  conditions_key: string;
  expiration_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface VariantInput {
  conditions: VariantCondition[];
  description?: string | null;
  expiration_json?: unknown;
}

type VariantDbRow = Omit<VariantRow, 'conditions_json' | 'expiration_json'>;

function mapVariantRow(row: VariantDbRow): VariantRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    conditions_json: parseJsonColumn(raw.conditions_json, []),
    expiration_json: parseJsonColumn(raw.expiration_json, null),
  };
}

export function listVariants(projectId: string, eventId: string): VariantRow[] {
  getEventOrThrow(projectId, eventId);
  return (
    getDb()
      .prepare('SELECT * FROM variants WHERE project_id = ? AND event_id = ? ORDER BY created_at')
      .all(projectId, eventId) as VariantDbRow[]
  ).map(mapVariantRow);
}

export function getVariantById(projectId: string, eventId: string, id: string): VariantRow | null {
  const row = getDb()
    .prepare('SELECT * FROM variants WHERE id = ? AND project_id = ? AND event_id = ?')
    .get(id, projectId, eventId) as VariantDbRow | undefined;
  return row ? mapVariantRow(row) : null;
}

export function getVariantOrThrow(projectId: string, eventId: string, id: string): VariantRow {
  const row = getVariantById(projectId, eventId, id);
  if (!row) throw new NotFoundError('Variant not found.', 'variant');
  return row;
}

/**
 * Project-scoped (not event-scoped) lookup, used where the caller must distinguish "no such
 * variant at all" from "this variant belongs to a different event" (fix round LOW 6:
 * `standard-event-mapping.dal.ts` used the event-scoped `getVariantOrThrow` for both, which made
 * its own `variant_id does not belong to event_id` 400 unreachable — a cross-event id always hit
 * `getVariantOrThrow`'s 404 first).
 */
export function getVariantByIdInProject(projectId: string, id: string): VariantRow | null {
  const row = getDb()
    .prepare('SELECT * FROM variants WHERE id = ? AND project_id = ?')
    .get(id, projectId) as VariantDbRow | undefined;
  return row ? mapVariantRow(row) : null;
}

interface DiscriminatorProperty {
  id: string;
  name: string;
  allowedValues: string[];
}

/** Every property linked to the event with `role = 'discriminator'`, keyed by property_id. */
function getDiscriminatorPropertiesByEvent(eventId: string): Map<string, DiscriminatorProperty> {
  const rows = getDb()
    .prepare(
      `SELECT p.id as id, p.name as name, p.allowed_values_json as allowed_values_json
       FROM event_properties ep
       JOIN properties p ON p.id = ep.property_id
       WHERE ep.event_id = ? AND ep.role = 'discriminator'`
    )
    .all(eventId) as { id: string; name: string; allowed_values_json: string | null }[];
  const map = new Map<string, DiscriminatorProperty>();
  for (const row of rows) {
    const allowedValues = (
      parseJsonColumn(row.allowed_values_json, []) as { value: string }[]
    ).map((v) => v.value);
    map.set(row.id, { id: row.id, name: row.name, allowedValues });
  }
  return map;
}

/**
 * Validates `conditions` (D-03): each `property_id` must be linked to the event with role
 * `discriminator` (400 `CONDITION_NOT_DISCRIMINATOR`); no property may appear in more than one
 * condition (400 `CONDITION_DUPLICATE_PROPERTY`, fix round ERROR 1 — a contradiction like
 * `action=add, action=remove` used to be silently accepted, counted as one "distinct property",
 * and slipped past `MAX_DISCRIMINATORS`); each condition's `values` must be a non-empty array of
 * strings, every one of them in the property's `allowed_values_json` (400
 * `CONDITION_VALUE_NOT_ALLOWED`; a non-string entry is now a 400, not silently dropped, fix round
 * LOW 5); `operator` must be `equals|in`, `equals` takes exactly one (post-dedupe) value; at most
 * two distinct properties across all conditions (400 `MAX_DISCRIMINATORS`).
 *
 * The returned `conditions` are canonicalized by `domain/variants.ts` `normalizeConditions`
 * (values de-duped and sorted, a one-value `in` collapsed to `equals`, conditions sorted by
 * `property_id`) so `buildName`/`buildConditionsKey` always produce the same output regardless of
 * the order the caller submitted conditions in — this is the actual ERROR 1 fix; the checks above
 * only reject malformed/contradictory input.
 */
function validateConditions(
  eventId: string,
  conditions: unknown
): { conditions: VariantCondition[]; discriminators: Map<string, DiscriminatorProperty>; conditionsKey: string } {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    throw new ValidationError('At least one condition is required.', 'conditions');
  }
  const discriminators = getDiscriminatorPropertiesByEvent(eventId);
  const seenProperties = new Set<string>();
  const parsed: VariantCondition[] = conditions.map((raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new BadRequestError('Each condition must be an object.', 'conditions');
    }
    const row = raw as Record<string, unknown>;
    const propertyId = typeof row.property_id === 'string' ? row.property_id : '';
    if (!propertyId) {
      throw new BadRequestError('Each condition needs a "property_id".', 'conditions');
    }
    const operator = typeof row.operator === 'string' ? row.operator : '';
    if (!(VARIANT_OPERATORS as readonly string[]).includes(operator)) {
      throw new BadRequestError(`operator must be one of: ${VARIANT_OPERATORS.join(', ')}.`, 'conditions');
    }
    if (!Array.isArray(row.values) || row.values.length === 0) {
      throw new BadRequestError('Each condition needs at least one value.', 'conditions');
    }
    if (row.values.some((v) => typeof v !== 'string')) {
      throw new BadRequestError('Each condition value must be a string.', 'conditions');
    }

    const property = discriminators.get(propertyId);
    if (!property) {
      throw new ConditionNotDiscriminatorError(
        `Property "${propertyId}" is not linked to this event with role "discriminator".`,
        'conditions'
      );
    }
    if (seenProperties.has(propertyId)) {
      throw new ConditionDuplicatePropertyError(
        `Property "${property.name}" is used in more than one condition; combine its values into a single condition instead.`,
        'conditions'
      );
    }
    seenProperties.add(propertyId);

    const values = Array.from(new Set(row.values as string[]));
    if (operator === 'equals' && values.length !== 1) {
      throw new BadRequestError('operator "equals" takes exactly one value.', 'conditions');
    }
    for (const value of values) {
      if (!property.allowedValues.includes(value)) {
        throw new ConditionValueNotAllowedError(
          `"${value}" is not an allowed value of property "${property.name}".`,
          'conditions'
        );
      }
    }

    return { property_id: propertyId, operator: operator as VariantCondition['operator'], values };
  });

  if (seenProperties.size > MAX_DISCRIMINATOR_PROPERTIES) {
    throw new MaxDiscriminatorsError(
      `A variant can condition on at most ${MAX_DISCRIMINATOR_PROPERTIES} discriminator properties (D-03 rule 3).`,
      'conditions'
    );
  }

  const normalized = normalizeConditions(parsed);

  return { conditions: normalized, discriminators, conditionsKey: buildConditionsKey(normalized) };
}

function buildName(
  eventName: string,
  conditions: VariantCondition[],
  discriminators: Map<string, DiscriminatorProperty>
): string {
  const propertyNameById: Record<string, string> = {};
  for (const [id, property] of discriminators) propertyNameById[id] = property.name;
  return generateVariantName(eventName, conditions, propertyNameById);
}

export function createVariant(projectId: string, eventId: string, input: VariantInput): VariantRow {
  const event = getEventOrThrow(projectId, eventId);
  const { conditions, discriminators, conditionsKey } = validateConditions(eventId, input.conditions);
  const name = buildName(event.name, conditions, discriminators);

  const db = getDb();
  const id = newId();
  const now = nowIso();
  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO variants (id, project_id, event_id, name, description, conditions_json, conditions_key, expiration_json, created_at, updated_at)
         VALUES (@id, @project_id, @event_id, @name, @description, @conditions_json, @conditions_key, @expiration_json, @created_at, @updated_at)`
      ).run({
        id,
        project_id: projectId,
        event_id: eventId,
        name,
        description: input.description?.trim() || null,
        conditions_json: toJsonColumn(conditions),
        conditions_key: conditionsKey,
        expiration_json: toJsonColumn(input.expiration_json ?? null),
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      mapWriteError(
        err,
        // A conditions_key clash means an equivalent variant already exists for this event, even if
        // the submitted order/shape differed from the existing row's (fix round ERROR 1); the name
        // clash (a duplicate UNIQUE(event_id, name)) is now unreachable on its own since name is
        // derived from the same canonical conditions, but the message stays accurate either way.
        `A variant named "${name}" already exists for this event.`,
        `Failed to create variant: ${(err as Error).message}`
      );
    }

    const created = getVariantOrThrow(projectId, eventId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'variant',
      entityId: id,
      entityLabel: created.name,
      parentEntityId: eventId,
      action: 'create',
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
  });
  run();
  return getVariantOrThrow(projectId, eventId, id);
}

export function updateVariant(
  projectId: string,
  eventId: string,
  id: string,
  updates: Partial<VariantInput>
): VariantRow {
  const event = getEventOrThrow(projectId, eventId);
  const before = getVariantOrThrow(projectId, eventId, id);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.conditions !== undefined) {
    const { conditions, discriminators, conditionsKey } = validateConditions(eventId, updates.conditions);
    patch.conditions_json = toJsonColumn(conditions);
    patch.conditions_key = conditionsKey;
    patch.name = buildName(event.name, conditions, discriminators);
  }
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.expiration_json !== undefined) patch.expiration_json = toJsonColumn(updates.expiration_json);

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  const db = getDb();
  const run = db.transaction(() => {
    try {
      db
        .prepare(`UPDATE variants SET ${setClause} WHERE id = @id AND project_id = @project_id AND event_id = @event_id`)
        .run({ ...patch, id, project_id: projectId, event_id: eventId });
    } catch (err) {
      mapWriteError(
        err,
        `A variant named "${String(patch.name ?? '')}" already exists for this event.`,
        `Failed to update variant: ${(err as Error).message}`
      );
    }

    const after = getVariantOrThrow(projectId, eventId, id);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'variant',
      entityId: id,
      entityLabel: after.name,
      parentEntityId: eventId,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();
  return getVariantOrThrow(projectId, eventId, id);
}

/**
 * T-1-07 fix round ERROR 2: a requirement targeting this variant (`variant`/`variant_property`)
 * used to be left with a `variant_id` pointing at nothing after a hard delete, and
 * `replaceRequirements` then rejected any later save of that row. Runs in the same transaction as
 * the delete, marking those rows `status = 'gap'` with `variant_id` nulled and a "target removed:
 * <name>" note (see `requirement.dal.ts` `markRequirementsGapForVariantRemoval`).
 *
 * D-52 / T-2-05 follow-up (T-3-07): a `StandardEventMapping` whose `variant_id` still points at
 * this variant is refused with 409 `MAPPING_IN_USE` naming the standard event, unless
 * `options.force` is `true`, in which case the mapping's `variant_id` is cleared (its `event_id`
 * stays, turning it into an unfiltered, event-level mapping) before the variant itself is deleted —
 * both in the same transaction, so a caller never observes a mapping pointing at a gone variant.
 */
export function deleteVariant(
  projectId: string,
  eventId: string,
  id: string,
  options?: { force?: boolean }
): void {
  const variant = getVariantOrThrow(projectId, eventId, id);
  const db = getDb();
  const run = db.transaction(() => {
    const mappings = db
      .prepare('SELECT standard_event FROM standard_event_mappings WHERE project_id = ? AND variant_id = ?')
      .all(projectId, id) as { standard_event: string }[];
    if (mappings.length > 0) {
      if (!options?.force) {
        const names = mappings.map((m) => m.standard_event).join(', ');
        throw new MappingInUseError(
          `Variant "${variant.name}" is targeted by the standard event mapping "${names}"; pass ?force=true to clear the mapping's variant instead of keeping it filtered.`
        );
      }
      db.prepare('UPDATE standard_event_mappings SET variant_id = NULL WHERE project_id = ? AND variant_id = ?').run(
        projectId,
        id
      );
    }
    markRequirementsGapForVariantRemoval(id, variant.name);
    const result = db
      .prepare('DELETE FROM variants WHERE id = ? AND project_id = ? AND event_id = ?')
      .run(id, projectId, eventId);
    if (result.changes === 0) throw new NotFoundError('Variant not found.', 'variant');

    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'variant',
      entityId: id,
      entityLabel: variant.name,
      parentEntityId: eventId,
      action: 'delete',
      before: variant as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
}

/** Every variant of the project (all events), used by the docs export and the Standard events page. */
export function listVariantsByProject(projectId: string): VariantRow[] {
  return (
    getDb()
      .prepare('SELECT * FROM variants WHERE project_id = ? ORDER BY event_id, created_at')
      .all(projectId) as VariantDbRow[]
  ).map(mapVariantRow);
}
