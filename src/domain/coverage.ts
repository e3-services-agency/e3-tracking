/**
 * Per-event coverage grid (D-21, T-2-08, plan "Coverage grid"): rows are the event's variants plus
 * a "base" row for variant-less observations, columns are the event's `context`-role properties
 * (contexts never create variants, D-03), cells count observations whose resolved
 * `(event_id, variant_id)` matches the row and whose context value matches the column value. Pure,
 * no DB import (domain-model skill) -- `src/backend/services/document.service.ts` resolves
 * observations against current definitions (`eventResolution.ts`'s `createEventResolver`, the same
 * live resolution `useCaseCoverage.service.ts` uses) and calls `computeEventCoverage`.
 */
export interface CoverageVariantRow {
  /** `null` for the base (no-variant) row. */
  variant_id: string | null;
  name: string;
}

export interface CoverageColumn {
  property_id: string;
  name: string;
  payload_key: string;
  values: string[];
}

export interface CoverageCell {
  /** `variant_id`, or `'base'` for the no-variant row (a plain string so it can key a lookup map without a null-union). */
  row: string;
  property_id: string;
  value: string;
  count: number;
  last_seen: number | null;
}

export type CoverageUnobserved = Omit<CoverageCell, 'count' | 'last_seen'>;

export interface CoverageGrid {
  rows: CoverageVariantRow[];
  columns: CoverageColumn[];
  cells: CoverageCell[];
  unobserved: CoverageUnobserved[];
}

export interface CoverageEventVariant {
  id: string;
  name: string;
}

export interface CoverageContextProperty {
  property_id: string;
  name: string;
  payload_key: string;
  values: string[];
}

/** A resolved observation already keyed for this coverage computation: `event_id`/`variant_id` are
 * the *live* resolution (not necessarily the stored columns, see `eventResolution.ts`), `properties`
 * is the raw payload (keyed by payload key/name), `context_values` is `Observation.context_values_json`
 * when present -- the plan's cell rule reads `context_values_json[property] ?? properties[payload_key]`. */
export interface CoverageObservation {
  event_id: string | null;
  variant_id: string | null;
  properties: Record<string, unknown>;
  context_values: Record<string, unknown> | null;
  timestamp: number;
}

const BASE_ROW_KEY = 'base';

function rowKey(variantId: string | null): string {
  return variantId ?? BASE_ROW_KEY;
}

/** `row`/`variant_id`/`event_id` scoped rows for one event, per the plan's row rule: every variant,
 * plus the base row when a variant-less observation of this event exists or the event has no
 * variants defined at all. */
export function computeEventCoverage(
  eventId: string,
  variants: CoverageEventVariant[],
  contextProperties: CoverageContextProperty[],
  observations: CoverageObservation[]
): CoverageGrid {
  const eventObservations = observations.filter((o) => o.event_id === eventId);
  const hasBaseObservation = eventObservations.some((o) => o.variant_id === null);

  const rows: CoverageVariantRow[] = variants.map((v) => ({ variant_id: v.id, name: v.name }));
  if (variants.length === 0 || hasBaseObservation) {
    rows.push({ variant_id: null, name: '(no variant)' });
  }

  const columns: CoverageColumn[] = contextProperties.map((p) => ({
    property_id: p.property_id,
    name: p.name,
    payload_key: p.payload_key,
    values: p.values,
  }));

  const cells: CoverageCell[] = [];
  const unobserved: CoverageUnobserved[] = [];

  for (const row of rows) {
    const rowObservations = eventObservations.filter((o) => o.variant_id === row.variant_id);
    for (const column of columns) {
      for (const value of column.values) {
        const matching = rowObservations.filter((o) => {
          const raw = o.context_values?.[column.payload_key] ?? o.properties[column.payload_key];
          return raw !== undefined && raw !== null && String(raw) === value;
        });
        if (matching.length === 0) {
          unobserved.push({ row: rowKey(row.variant_id), property_id: column.property_id, value });
          continue;
        }
        cells.push({
          row: rowKey(row.variant_id),
          property_id: column.property_id,
          value,
          count: matching.length,
          last_seen: Math.max(...matching.map((o) => o.timestamp)),
        });
      }
    }
  }

  return { rows, columns, cells, unobserved };
}
