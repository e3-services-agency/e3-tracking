/**
 * Shared definition snapshot types and pure builders used by every comparison engine (T-2-05, plan
 * "Comparison engine design": "shared ... `snapshot.ts` (the `DefinitionSnapshot` type ...)"). Pure,
 * no DB/Express import (domain-model skill) — `src/backend/services/comparison.service.ts` loads the
 * raw `Event`/`Property`/`Variant`/`StandardEventMapping` rows once (one `listEvents` call) and calls
 * the pure functions here to derive every comparison-specific view from that one load, instead of
 * each engine's snapshot builder re-querying the DAL (T-2-04 review LOW: "one recompute now calls
 * `listEvents` three times").
 *
 * `DefinitionSnapshot` (comparison 3's shape, `definitionVsObservations.ts`) is the richest of the
 * four views — event id/name/status/class/expiration plus every linked property's payload key,
 * role, required flag, data type/formats and allowed values — so it is the one snapshot actually
 * loaded from the DAL (`buildDefinitionSnapshot`). `toDataManagerDefinitionSnapshot` and
 * `toMappingSnapshot` are pure projections of it, re-shaping the same events/properties/variants/
 * mappings for comparison 4 and comparisons 1/2 respectively, with no further DB access.
 */
import type {
  DefEvent,
  DefEventProperty,
  DefVariant,
  DefinitionSnapshot,
  StandardMappingRef,
} from './definitionVsObservations';
import type { DataManagerDefinitionSnapshot, DmDefCustomerProperty } from './definitionVsDataManager';
import type { StandardEventSeed } from '../bloomreach';

/** One definition-side consent category, the minimal shape comparison 1 needs (`rename_mismatch`). */
export interface DefConsentCategory {
  name: string;
  standard_key: string | null;
}

/** One `standard_events.<key>` entry, the same shape whether built from stored entities or parsed from a pasted `data-mapping.json` (`DataMappingModel`, T-1-08) — this identity is what lets comparisons 1/2 run unmodified against either source (plan "MappingSnapshot built from stored entities in the service and from a parsed file in `previewDataMapping`"). */
export interface MappingStandardEvent {
  key: string;
  eventType: string | null;
  filter: { property: string; operator: 'equals' | 'in'; values: string[] }[];
  /** Bloomreach field name -> client property *name* (not id) or `null`. */
  fieldMap: Record<string, string | null>;
}

export interface MappingSnapshot {
  standardEvents: MappingStandardEvent[];
  /** standard customer property key -> client property name, or `null`. */
  customerProperties: Record<string, string | null>;
  /** standard consent key -> client consent category name, or `null`. */
  consents: Record<string, string | null>;
  catalogs: { main: string | null; variant: string | null };
}

/**
 * `DataManagerDefinitionSnapshot` (comparison 4) is a pure projection of `DefinitionSnapshot`
 * (comparison 3's already-loaded events/properties): `DefEventProperty` is a strict superset of
 * `DmDefEventProperty`'s fields (`property_id`, `name`, `data_type`, `data_formats`), so no second
 * DB read is needed. `customerProperties` still comes from a separate `PropertyDAL.listProperties`
 * scope=`customer` call (a different table, not part of the `listEvents` duplication this module
 * removes).
 */
export function toDataManagerDefinitionSnapshot(
  definition: DefinitionSnapshot,
  customerProperties: DmDefCustomerProperty[]
): DataManagerDefinitionSnapshot {
  return {
    events: definition.events.map((event) => ({
      id: event.id,
      name: event.name,
      status: event.status,
      class: event.class,
      properties: event.properties.map((prop) => ({
        property_id: prop.property_id,
        name: prop.name,
        data_type: prop.data_type,
        data_formats: prop.data_formats,
      })),
    })),
    customer_properties: customerProperties,
  };
}

function payloadKeyFor(prop: DefEventProperty): string {
  return prop.payload_key ?? prop.name;
}

/**
 * `MappingSnapshot` built from the already-loaded `DefinitionSnapshot` (events/variants/standard
 * event mappings) plus the small amount of mapping-only state that has no comparison-3 equivalent
 * (consent category names, catalog existence) — also passed in, so this stays a pure function.
 * `allStandardEvents` is the merged seed-plus-project-additions list (`mergeStandardEvents`), so
 * every known standard event key gets an entry even when unmapped (`eventType: null`), matching
 * `exportDataMapping`'s own enumeration and letting comparison 1 tell "never mapped" apart from
 * "mapped, but its variant/fields look wrong".
 */
export function buildMappingSnapshotFromDefinition(
  definition: DefinitionSnapshot,
  allStandardEvents: StandardEventSeed[],
  consentCategories: { standard_key: string | null; name: string }[],
  consentKeys: string[],
  customerPropertiesByStandardKey: Record<string, string | null>,
  catalogs: { main: string | null; variant: string | null }
): MappingSnapshot {
  const eventById = new Map(definition.events.map((e) => [e.id, e]));
  const variantById = new Map(definition.variants.map((v) => [v.id, v]));
  const propertyNameByEventAndId = new Map<string, string>();
  for (const event of definition.events) {
    for (const prop of event.properties) propertyNameByEventAndId.set(`${event.id}:${prop.property_id}`, prop.name);
  }
  const mappingByKey = new Map(definition.standard_event_mappings.map((m) => [m.standard_event, m]));

  const standardEvents: MappingStandardEvent[] = allStandardEvents.map((seed) => {
    const mapping = mappingByKey.get(seed.key);
    if (!mapping) return { key: seed.key, eventType: null, filter: [], fieldMap: Object.fromEntries(seed.fields.map((f) => [f, null])) };
    const event = eventById.get(mapping.event_id);
    const variant = mapping.variant_id ? variantById.get(mapping.variant_id) ?? null : null;
    const filter = variant
      ? variant.conditions.map((c) => ({
          property: propertyNameByEventAndId.get(`${mapping.event_id}:${c.property_id}`) ?? c.property_id,
          operator: c.operator,
          values: c.values,
        }))
      : [];
    const fieldMap: Record<string, string | null> = {};
    for (const field of seed.fields) {
      const propId = mapping.field_map[field] ?? null;
      fieldMap[field] = propId ? propertyNameByEventAndId.get(`${mapping.event_id}:${propId}`) ?? null : null;
    }
    return { key: seed.key, eventType: event?.name ?? null, filter, fieldMap };
  });

  const consents: Record<string, string | null> = {};
  for (const key of consentKeys) {
    const cat = consentCategories.find((c) => c.standard_key === key);
    consents[key] = cat ? cat.name : null;
  }

  return { standardEvents, customerProperties: customerPropertiesByStandardKey, consents, catalogs };
}

/**
 * `MappingSnapshot` from a parsed `data-mapping.json` (`DataMappingModel`, `src/domain/import/
 * dataMapping.ts`), used by `previewDataMapping` (T-2-05: the preview response gains `findings`,
 * comparison 1 run against the pasted file, not persisted, D-22). Identical shape to
 * `buildMappingSnapshotFromDefinition`'s output, field-for-field, which is what lets
 * `definitionVsMapping.ts`/`mappingVsObservations.ts` run unmodified against either source.
 */
export function mappingSnapshotFromParsedModel(model: {
  standardEvents: MappingStandardEvent[];
  customerProperties: Record<string, string | null>;
  consents: Record<string, string | null>;
  catalogs: { main: string | null; variant: string | null };
}): MappingSnapshot {
  return {
    standardEvents: model.standardEvents,
    customerProperties: model.customerProperties,
    consents: model.consents,
    catalogs: model.catalogs,
  };
}

export type { DefEvent, DefEventProperty, DefVariant, DefinitionSnapshot, StandardMappingRef };
