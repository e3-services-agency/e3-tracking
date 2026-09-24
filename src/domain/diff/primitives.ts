/**
 * Pure diff primitives (D-04, D-22, T-1-08): no DB or Express import. `diffValue` compares one
 * field; `diffRecordSets` compares two arrays of records keyed by `keyFn`, producing `add` for a
 * key present only in `after`, `remove` for a key present only in `before`, one `change` per
 * differing field for a key present in both, and nothing for an unchanged record.
 *
 * Import planners (`src/backend/services/*Import.service.ts`) call `diffRecordSets` with a
 * `before` array restricted to the entities that already match an `after` key (see those modules'
 * top comments): Bloomreach imports are additive (D-04's contracts never delete an entity the
 * project already has), so a planner never passes the *whole* current project as `before` — doing
 * so would turn every entity the import happens not to mention into a spurious `remove`. The
 * `remove` kind exists for the future comparison engine (T-1-09), which does need a full
 * before/after set diff.
 */
import type { Difference, DifferenceKind } from './types';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  return JSON.stringify(sortForCompare(a)) === JSON.stringify(sortForCompare(b));
}

/** Recursively sorts object keys so two structurally-equal values compare equal regardless of key order. */
function sortForCompare(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForCompare);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortForCompare((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Compares one field of one entity; returns `null` when the values are equal (no difference to report). */
export function diffValue(
  entityType: string,
  key: string,
  field: string,
  before: unknown,
  after: unknown
): Difference | null {
  if (deepEqual(before, after)) return null;
  return {
    kind: 'change',
    entity_type: entityType,
    key,
    field,
    before,
    after,
    message: `${entityType} "${key}".${field} changes from ${JSON.stringify(before)} to ${JSON.stringify(after)}.`,
  };
}

/** Builds a `warning`-kind `Difference` not tied to a specific proposed write. */
export function diffWarning(entityType: string, key: string, message: string): Difference {
  return { kind: 'warning', entity_type: entityType, key, message };
}

/**
 * Compares two arrays of records of the same entity type, keyed by `keyFn`. `fieldsFn` extracts
 * the comparable fields of a record (only these fields are diffed; anything else on the record is
 * ignored). One `add` `Difference` per key only in `after`; one `remove` `Difference` per key only
 * in `before`; one `change` `Difference` per differing field for a key in both; nothing for a key
 * whose fields are all equal.
 */
export function diffRecordSets<T>(
  entityType: string,
  before: T[],
  after: T[],
  keyFn: (item: T) => string,
  fieldsFn: (item: T) => Record<string, unknown>
): Difference[] {
  const beforeByKey = new Map(before.map((item) => [keyFn(item), item]));
  const afterByKey = new Map(after.map((item) => [keyFn(item), item]));
  const diffs: Difference[] = [];

  for (const [key, afterItem] of afterByKey) {
    const beforeItem = beforeByKey.get(key);
    if (!beforeItem) {
      diffs.push({
        kind: 'add',
        entity_type: entityType,
        key,
        after: fieldsFn(afterItem),
        message: `${entityType} "${key}" will be created.`,
      });
      continue;
    }
    const beforeFields = fieldsFn(beforeItem);
    const afterFields = fieldsFn(afterItem);
    for (const field of Object.keys(afterFields)) {
      const change = diffValue(entityType, key, field, beforeFields[field], afterFields[field]);
      if (change) diffs.push(change);
    }
  }

  for (const [key, beforeItem] of beforeByKey) {
    if (!afterByKey.has(key)) {
      diffs.push({
        kind: 'remove',
        entity_type: entityType,
        key,
        before: fieldsFn(beforeItem),
        message: `${entityType} "${key}" will be removed.`,
      });
    }
  }

  return diffs;
}

/** Re-exported for callers that only need the kind literal type. */
export type { DifferenceKind };
