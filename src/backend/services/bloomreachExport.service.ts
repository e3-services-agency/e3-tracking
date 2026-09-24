/**
 * Bloomreach `data-mapping.json` / `expiration-settings.json` export (T-1-08, PLAN "Import /
 * export contracts"). Reconstructs the Bloomreach shapes from current entities; the required unit
 * test is "import fixture into an empty project, export, deep-equal to the fixture ignoring key
 * order and the `_id`/`success` fields" (T-1-08 scope point 5) — `_id`/`custom_events`/`catalogs`
 * round-trip through `Project.bloomreach_mapping_meta_json` (T-1-08 delta to `project.dal.ts`);
 * `success` has no data to reconstruct from and is always emitted as `true`.
 */
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as ProjectDAL from '../dal/project.dal';
import {
  mergeStandardEvents,
  mergeConsentKeys,
  CATALOG_MAIN_COLUMNS,
  STANDARD_CUSTOMER_PROPERTIES,
  type StandardEventSeed,
} from '../../domain/bloomreach';
import type { VariantCondition } from '../../domain/variants';

function buildPropertyNameMap(projectId: string): Map<string, string> {
  return new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
}

function conditionsToFilter(conditions: VariantCondition[], propertyNameById: Map<string, string>): unknown[] {
  return conditions.map((c) => ({
    attribute: { property: propertyNameById.get(c.property_id) ?? c.property_id, type: 'property' },
    constraint: {
      operands: c.values.map((v) => ({ type: 'constant', value: v })),
      operator: c.operator,
      type: 'string',
    },
  }));
}

export function exportDataMapping(projectId: string): Record<string, unknown> {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const meta = (project.bloomreach_mapping_meta_json ?? null) as
    | { _id?: string | null; catalogs?: unknown; custom_events?: unknown[] }
    | null;

  const standardAdditions = (project.standard_event_additions_json as StandardEventSeed[] | null) ?? [];
  const allStandardEvents = mergeStandardEvents(standardAdditions);

  const mappings = StandardEventMappingDAL.listStandardEventMappings(projectId);
  const mappingByKey = new Map(mappings.map((m) => [m.standard_event, m]));
  const propertyNameById = buildPropertyNameMap(projectId);
  const eventById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e]));
  const variantById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v]));

  const standardEventsOut: Record<string, unknown> = {};
  for (const se of allStandardEvents) {
    const mapping = mappingByKey.get(se.key);
    const out: Record<string, unknown> = {};
    if (!mapping) {
      out.event = null;
      for (const field of se.fields) out[field] = null;
    } else {
      const event = eventById.get(mapping.event_id);
      const variant = mapping.variant_id ? variantById.get(mapping.variant_id) : null;
      out.event = event
        ? { filter: variant ? conditionsToFilter(variant.conditions_json, propertyNameById) : [], type: event.name }
        : null;
      for (const field of se.fields) {
        const propId = mapping.field_map_json[field];
        out[field] = propId ? { property: propertyNameById.get(propId) ?? propId } : null;
      }
    }
    standardEventsOut[se.key] = out;
  }

  const customerProps = PropertyDAL.listProperties(projectId, { scope: 'customer' });
  const customerPropertiesOut: Record<string, unknown> = {};
  for (const key of STANDARD_CUSTOMER_PROPERTIES) {
    const prop = customerProps.find((p) => p.bloomreach_customer_property === key);
    customerPropertiesOut[key] = prop ? { property: prop.name } : null;
  }

  const consentAdditions = (project.consent_key_additions_json as string[] | null) ?? [];
  const allConsentKeys = mergeConsentKeys(consentAdditions);
  const consentCats = ConsentCategoryDAL.listConsentCategories(projectId);
  const consentsOut: Record<string, unknown> = {};
  for (const key of allConsentKeys) {
    const cat = consentCats.find((c) => c.standard_key === key);
    consentsOut[key] = cat ? cat.name : null;
  }

  return {
    _id: meta?._id ?? null,
    catalogs: meta?.catalogs ?? {
      main: null,
      main_columns: Object.fromEntries(CATALOG_MAIN_COLUMNS.map((c) => [c, null])),
      variant: null,
    },
    consents: consentsOut,
    custom_events: meta?.custom_events ?? [],
    customer_properties: customerPropertiesOut,
    standard_events: standardEventsOut,
  };
}

function expirationToBlock(value: unknown): { enabled: boolean; duration: { count: number; units: string } | null } {
  if (!value || typeof value !== 'object') return { enabled: false, duration: null };
  const v = value as { enabled: boolean; count: number | null; units: string | null };
  return { enabled: v.enabled, duration: v.count !== null && v.units !== null ? { count: v.count, units: v.units } : null };
}

export function exportExpirationSettings(projectId: string): Record<string, unknown> {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const propertyNameById = buildPropertyNameMap(projectId);
  const events = EventDAL.listEvents(projectId);
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  const eventEntries = events
    .filter((e) => e.expiration_json !== null)
    .map((e) => ({ expiration: expirationToBlock(e.expiration_json), filter: [], type: e.name }));

  const variantEntries = VariantDAL.listVariantsByProject(projectId)
    .filter((v) => v.expiration_json !== null)
    .map((v) => ({
      expiration: expirationToBlock(v.expiration_json),
      filter: conditionsToFilter(v.conditions_json, propertyNameById),
      type: eventNameById.get(v.event_id) ?? '',
    }));

  return {
    events: [...eventEntries, ...variantEntries],
    other: expirationToBlock(project.default_expiration_json),
    success: true,
  };
}
