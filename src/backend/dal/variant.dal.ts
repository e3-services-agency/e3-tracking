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
  ConditionNotDiscriminatorError,
  ConditionValueNotAllowedError,
  MaxDiscriminatorsError,
  NotFoundError,
  ValidationError,
} from '../errors';
import { VARIANT_OPERATORS } from '../../domain/enums';
import { generateVariantName, type VariantCondition } from '../../domain/variants';
import { getEventOrThrow } from './event.dal';

const MAX_DISCRIMINATOR_PROPERTIES = 2;

export interface VariantRow {
  id: string;
  project_id: string;
  event_id: string;
  name: string;
  description: string | null;
  conditions_json: VariantCondition[];
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
 * `discriminator` (400 `CONDITION_NOT_DISCRIMINATOR`); each condition's `values` must all be in
 * the property's `allowed_values_json` (400 `CONDITION_VALUE_NOT_ALLOWED`); `operator` must be
 * `equals|in`, `equals` takes exactly one value; at most two distinct properties across all
 * conditions (400 `MAX_DISCRIMINATORS`).
 */
function validateConditions(
  eventId: string,
  conditions: unknown
): { conditions: VariantCondition[]; discriminators: Map<string, DiscriminatorProperty> } {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    throw new ValidationError('At least one condition is required.', 'conditions');
  }
  const discriminators = getDiscriminatorPropertiesByEvent(eventId);
  const distinctProperties = new Set<string>();
  const normalized: VariantCondition[] = conditions.map((raw) => {
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
    const values = Array.isArray(row.values) ? row.values.filter((v) => typeof v === 'string') : [];
    if (values.length === 0) {
      throw new BadRequestError('Each condition needs at least one value.', 'conditions');
    }
    if (operator === 'equals' && values.length !== 1) {
      throw new BadRequestError('operator "equals" takes exactly one value.', 'conditions');
    }

    const property = discriminators.get(propertyId);
    if (!property) {
      throw new ConditionNotDiscriminatorError(
        `Property "${propertyId}" is not linked to this event with role "discriminator".`,
        'conditions'
      );
    }
    for (const value of values) {
      if (!property.allowedValues.includes(value)) {
        throw new ConditionValueNotAllowedError(
          `"${value}" is not an allowed value of property "${property.name}".`,
          'conditions'
        );
      }
    }
    distinctProperties.add(propertyId);

    return { property_id: propertyId, operator: operator as VariantCondition['operator'], values };
  });

  if (distinctProperties.size > MAX_DISCRIMINATOR_PROPERTIES) {
    throw new MaxDiscriminatorsError(
      `A variant can condition on at most ${MAX_DISCRIMINATOR_PROPERTIES} discriminator properties (D-03 rule 3).`,
      'conditions'
    );
  }

  return { conditions: normalized, discriminators };
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
  const { conditions, discriminators } = validateConditions(eventId, input.conditions);
  const name = buildName(event.name, conditions, discriminators);

  const db = getDb();
  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO variants (id, project_id, event_id, name, description, conditions_json, expiration_json, created_at, updated_at)
       VALUES (@id, @project_id, @event_id, @name, @description, @conditions_json, @expiration_json, @created_at, @updated_at)`
    ).run({
      id,
      project_id: projectId,
      event_id: eventId,
      name,
      description: input.description?.trim() || null,
      conditions_json: toJsonColumn(conditions),
      expiration_json: toJsonColumn(input.expiration_json ?? null),
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(
      err,
      `A variant named "${name}" already exists for this event.`,
      `Failed to create variant: ${(err as Error).message}`
    );
  }
  return getVariantOrThrow(projectId, eventId, id);
}

export function updateVariant(
  projectId: string,
  eventId: string,
  id: string,
  updates: Partial<VariantInput>
): VariantRow {
  const event = getEventOrThrow(projectId, eventId);
  getVariantOrThrow(projectId, eventId, id);

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (updates.conditions !== undefined) {
    const { conditions, discriminators } = validateConditions(eventId, updates.conditions);
    patch.conditions_json = toJsonColumn(conditions);
    patch.name = buildName(event.name, conditions, discriminators);
  }
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.expiration_json !== undefined) patch.expiration_json = toJsonColumn(updates.expiration_json);

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  try {
    getDb()
      .prepare(`UPDATE variants SET ${setClause} WHERE id = @id AND project_id = @project_id AND event_id = @event_id`)
      .run({ ...patch, id, project_id: projectId, event_id: eventId });
  } catch (err) {
    mapWriteError(
      err,
      `A variant named "${String(patch.name ?? '')}" already exists for this event.`,
      `Failed to update variant: ${(err as Error).message}`
    );
  }
  return getVariantOrThrow(projectId, eventId, id);
}

export function deleteVariant(projectId: string, eventId: string, id: string): void {
  getVariantOrThrow(projectId, eventId, id);
  const result = getDb()
    .prepare('DELETE FROM variants WHERE id = ? AND project_id = ? AND event_id = ?')
    .run(id, projectId, eventId);
  if (result.changes === 0) throw new NotFoundError('Variant not found.', 'variant');
}

/** Every variant of the project (all events), used by the docs export and the Standard events page. */
export function listVariantsByProject(projectId: string): VariantRow[] {
  return (
    getDb()
      .prepare('SELECT * FROM variants WHERE project_id = ? ORDER BY event_id, created_at')
      .all(projectId) as VariantDbRow[]
  ).map(mapVariantRow);
}
