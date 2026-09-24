/**
 * Pure row-building helper for the Standard events page (fix round FAIL-1), split out of
 * `src/pages/StandardEvents.tsx` so it has no React/UI imports and can be unit-tested directly
 * (the standalone vitest config, D-20, only resolves plain relative/`src/domain` imports, not the
 * `@/` alias used by page/component files). Joins the merged standard event seed/addition list with
 * this project's mappings, events and variants by id.
 */
import type { StandardEventSeed } from './bloomreach';

export interface StandardEventMappingLike {
  standard_event: string;
  event_id: string;
  variant_id: string | null;
  field_map_json: Record<string, string | null>;
}

export interface IdNamePair {
  id: string;
  name: string;
}

/** One rendered row of the Standard events table: the merged seed/addition event plus its resolved mapping names. */
export interface StandardEventRow {
  key: string;
  fieldCount: number;
  mapping: StandardEventMappingLike | null;
  mappedEventName: string | null;
  mappedVariantName: string | null;
}

/**
 * `mappedEventName`/`mappedVariantName` are `null` when there is no mapping (or no variant), and
 * fall back to the raw id string only when a mapping names an event/variant id that is missing from
 * the passed-in `events`/`variants` arrays (a stale or not-yet-loaded list), never silently to a
 * dash — a dash means "no mapping", a raw id means "mapped, but its name isn't loaded yet/is stale".
 */
export function buildStandardEventRows(
  standardEvents: StandardEventSeed[],
  mappings: StandardEventMappingLike[],
  events: IdNamePair[],
  variants: IdNamePair[]
): StandardEventRow[] {
  const mappingByKey = new Map(mappings.map((m) => [m.standard_event, m]));
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));
  const variantNameById = new Map(variants.map((v) => [v.id, v.name]));

  return standardEvents.map((se) => {
    const mapping = mappingByKey.get(se.key) ?? null;
    return {
      key: se.key,
      fieldCount: se.fields.length,
      mapping,
      mappedEventName: mapping ? eventNameById.get(mapping.event_id) ?? mapping.event_id : null,
      mappedVariantName: mapping?.variant_id
        ? variantNameById.get(mapping.variant_id) ?? mapping.variant_id
        : null,
    };
  });
}
