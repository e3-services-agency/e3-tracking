/**
 * Bloomreach `data-mapping.json` / `expiration-settings.json` export (T-1-08, PLAN "Import /
 * export contracts"). Reconstructs the Bloomreach shapes from current entities; the required unit
 * test is "import fixture into an empty project, export, deep-equal to the fixture ignoring key
 * order and the `_id`/`success` fields" (T-1-08 scope point 5) — `_id`/`custom_events`/`catalogs`
 * round-trip through `Project.bloomreach_mapping_meta_json` (T-1-08 delta to `project.dal.ts`);
 * `success` has no data to reconstruct from and is always emitted as `true`.
 */
import { getDb } from '../db';
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
import { toDataManagerType } from '../../domain/bloomreach/dataManagerTypes';
import { parseDataManagerEvents } from '../../domain/import/dataManagerEvents';
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

interface CustomerPropertyMeta {
  source?: string;
  used?: boolean;
  deleting?: boolean;
  locked_for_contact_migration?: boolean;
  dm_index?: number;
  raw?: { description?: string | null; example_values?: string | null; type?: string };
}

/** App-born defaults for a customer property never touched by a Data Manager import (D-40 Q2). */
const APP_BORN_CUSTOMER_DEFAULTS = { source: 'user', used: false, deleting: false, locked_for_contact_migration: false };

/**
 * Reconstructs `data-manager-customers.json` from the current `Property` rows (scope `customer`)
 * plus their `bloomreach_meta_json` (T-2-02, D-28, D-35, D-37). Unlike `exportDataMapping`, this
 * never needs a passthrough of the stored snapshot: every customer property Data Manager import
 * becomes a live `Property` row (there is no sdk/platform-style deselection for customer scope), so
 * the live rows are a complete reconstruction on their own.
 */
export function exportDataManagerCustomers(projectId: string): Record<string, unknown> {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const meta = (project.data_manager_meta_json ?? null) as
    | { customers?: { are_all_used?: boolean; default_private?: boolean; group_order?: string[] } }
    | null;
  const customersMeta = meta?.customers ?? {};
  const groupOrder = Array.isArray(customersMeta.group_order) ? customersMeta.group_order : [];

  const properties = PropertyDAL.listProperties(projectId, { scope: 'customer' });

  function buildRow(p: PropertyDAL.PropertyRow): Record<string, unknown> {
    const propMeta = (p.bloomreach_meta_json ?? null) as CustomerPropertyMeta | null;
    const formats = Array.isArray(p.data_formats_json) ? (p.data_formats_json as string[]) : [];
    // INFO 6 fix: `raw.type` is only ever stored for a property imported with an *unrecognized*
    // Data Manager type (see `dataManagerCustomersImport.service.ts`'s `buildMeta`), where the app
    // type falls back to plain `string`/no formats. It is a fallback only — if the user has since
    // changed the property's app type away from that plain-string placeholder, the reverse-mapped
    // current type must win so the export reflects the edit; `raw.type` is used only while the app
    // type still looks like the unrecognized-type placeholder (data-losing round trip is documented,
    // not silently perpetuated once the user has actually changed the type).
    const reverseMappedType = toDataManagerType(p.data_type, formats).type;
    const type = propMeta?.raw?.type && reverseMappedType === 'string' ? propMeta.raw.type : reverseMappedType;
    const exampleValuesArr = Array.isArray(p.example_values_json)
      ? (p.example_values_json as { value: unknown }[])
      : [];
    const description = p.description !== null ? p.description : (propMeta?.raw?.description ?? null);
    // Only the first example value is exported (D-28/D-37): Bloomreach's `example_values` field is a
    // single string, while the app stores a list (`example_values_json`) for future multi-value
    // support; joining/concatenating multiple values would not round-trip to any real Bloomreach
    // shape, so the fixture (which only ever has zero or one example value) is matched exactly by
    // taking the first entry and documenting the choice here rather than attempting to join.
    const example_values =
      exampleValuesArr.length > 0 ? String(exampleValuesArr[0].value) : (propMeta?.raw?.example_values ?? null);
    const defaults = propMeta ? null : APP_BORN_CUSTOMER_DEFAULTS;
    return {
      deleting: propMeta?.deleting ?? defaults?.deleting ?? false,
      description,
      example_values,
      locked_for_contact_migration: propMeta?.locked_for_contact_migration ?? defaults?.locked_for_contact_migration ?? false,
      private: p.pii,
      property: p.name,
      source: propMeta?.source ?? defaults?.source ?? 'user',
      type,
      used: propMeta?.used ?? defaults?.used ?? false,
    };
  }

  function dmIndexOf(p: PropertyDAL.PropertyRow): number {
    const propMeta = (p.bloomreach_meta_json ?? null) as CustomerPropertyMeta | null;
    return typeof propMeta?.dm_index === 'number' ? propMeta.dm_index : Number.POSITIVE_INFINITY;
  }

  function sortAndBuild(props: PropertyDAL.PropertyRow[]): Record<string, unknown>[] {
    return [...props]
      .sort((a, b) => dmIndexOf(a) - dmIndexOf(b) || a.name.localeCompare(b.name))
      .map(buildRow);
  }

  const byCategory = new Map<string | null, PropertyDAL.PropertyRow[]>();
  for (const p of properties) {
    const key = p.category ?? null;
    const bucket = byCategory.get(key) ?? [];
    bucket.push(p);
    byCategory.set(key, bucket);
  }

  const defaultGroupProps = byCategory.get(null) ?? [];
  const namedCategories = [...byCategory.keys()].filter((k): k is string => k !== null);
  const orderedCategories = [
    ...groupOrder.filter((name) => namedCategories.includes(name)),
    ...namedCategories.filter((name) => !groupOrder.includes(name)).sort(),
  ];

  return {
    are_all_used: customersMeta.are_all_used ?? false,
    default_group: { properties: sortAndBuild(defaultGroupProps) },
    default_private: customersMeta.default_private ?? false,
    groups: orderedCategories.map((name) => ({ name, properties: sortAndBuild(byCategory.get(name) ?? []) })),
  };
}

interface EventMeta {
  source?: string;
  used?: boolean;
  forbidden?: boolean;
  deleting?: boolean;
  real_time_analytics?: boolean;
  are_all_used?: boolean;
  dm_index?: number;
  raw?: { description?: string | null };
}

interface EventPropertyLinkMeta {
  dm_type?: string;
  private?: boolean;
  source?: string;
  used?: boolean;
  deleting?: boolean;
  group?: string | null;
  dm_index?: number;
  raw?: { description?: string | null; example_values?: string | null };
  /** D-41 ERROR 2 fix: the app `Property.data_type`/`data_formats_json`/`pii` this link's owning
   *  Property held right when this link meta was last written by the import (see
   *  `dataManagerEventsImport.service.ts`'s `buildLinkMeta`) — the reference `buildPropertyRow`
   *  compares the *current* Property against below. */
  app_type_at_import?: { data_type?: string; data_formats?: string[] };
  app_pii_at_import?: boolean;
  /** T-2-03 review carry-over (D-41 amendment): see `dataManagerEventsImport.service.ts`'s
   *  `buildLinkMeta` — the app `Property.description`/first `example_values_json` entry at the
   *  moment this link meta was last written, compared below (independently of `app_type_at_import`)
   *  so an app edit to either field alone still reaches export. */
  description_at_import?: string | null;
  example_values_at_import?: string | null;
}

/**
 * D-41 export precedence: true while the Property this link is attached to still has the exact
 * `data_type`/`data_formats_json`/`pii` the import last wrote (recorded in the link's own meta at
 * that time) — i.e. nobody has edited this Property's type or PII in the app since. A link with no
 * `app_type_at_import` recorded at all (pre-fix-round data, or a link created by hand with no import
 * meta) is treated as "unchanged" so its existing verbatim-first behaviour is preserved.
 */
function propertyUnchangedSinceImport(lm: EventPropertyLinkMeta | null, property: PropertyDAL.PropertyRow): boolean {
  if (!lm || !lm.app_type_at_import) return true;
  const formats = Array.isArray(property.data_formats_json) ? (property.data_formats_json as string[]) : [];
  const refFormats = lm.app_type_at_import.data_formats ?? [];
  const sameFormats = formats.length === refFormats.length && formats.every((f) => refFormats.includes(f));
  return lm.app_type_at_import.data_type === property.data_type && sameFormats && (lm.app_pii_at_import ?? property.pii) === property.pii;
}

/** App-born defaults for an event never touched by a Data Manager import (D-40 Q2). */
const APP_BORN_EVENT_DEFAULTS = { source: 'user', used: false, deleting: false, forbidden: false, real_time_analytics: true };

/** First entry of an `example_values_json`-shaped array, stringified, else `null`. */
function firstExampleValue(arr: unknown): string | null {
  return Array.isArray(arr) && arr.length > 0 ? String((arr[0] as { value: unknown }).value) : null;
}

/**
 * T-2-03 review carry-over (D-41 amendment): true while the Property's current `description` (or
 * first `example_values_json` entry, per `field`) still equals what the import last wrote into this
 * link's own `description_at_import`/`example_values_at_import` reference — independent of
 * `propertyUnchangedSinceImport`'s type/PII check, so editing only the description in the app (type
 * untouched) still reaches export. Same "no reference recorded -> treat as unchanged" fallback as
 * `propertyUnchangedSinceImport` for pre-fix-round links.
 */
function fieldUnchangedSinceImport(
  lm: EventPropertyLinkMeta | null,
  field: 'description' | 'example_values',
  currentValue: string | null
): boolean {
  if (!lm) return true;
  const ref = field === 'description' ? lm.description_at_import : lm.example_values_at_import;
  if (ref === undefined) return true;
  return ref === currentValue;
}

/**
 * The event-property link's own stored per-occurrence text wins over the shared `Property`'s own
 * `description`/`example_values` (T-2-03 design note, beyond the plan's one-line "link override,
 * then Property, then raw"): a `Property` (scope `event`) is one row shared by every event that
 * carries it, but the same property name legitimately holds different description/example text on
 * different events in the fixture (e.g. `source`/`category`/`campaign_id` — null on some events,
 * real text on others). Only the link's own `bloomreach_meta_json.raw` (captured verbatim at import
 * time, per occurrence, T-2-03) can reproduce that divergence; falling back to `Property.description`
 * first would flatten every event's row to whichever occurrence happened to create the property.
 */
function resolveLinkText(
  overrideValue: string | null | undefined,
  linkRawValue: string | null | undefined,
  propertyValue: string | null | undefined
): string | null {
  if (overrideValue !== null && overrideValue !== undefined) return overrideValue;
  if (linkRawValue !== undefined) return linkRawValue ?? null;
  return propertyValue ?? null;
}

/** `SELECT 1` ignoring `deleted_at` (T-2-03 export passthrough, D-35): true when an `Event` row with this name has ever existed, live or soft-deleted, so a deliberately deleted event is dropped rather than passed through. */
function eventNameExistsAnyState(projectId: string, name: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM events WHERE project_id = ? AND name = ?').get(projectId, name);
}

/** Finds the original raw event object for `type` inside a stored `data-manager-events.json` payload, for byte-verbatim passthrough (T-2-03, D-35). */
function findRawEventObject(payload: unknown, type: string): unknown | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const scan = (events: unknown): unknown | null => {
    if (!Array.isArray(events)) return null;
    return events.find((e) => typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === type) ?? null;
  };
  const defaultGroup = obj.default_group as Record<string, unknown> | undefined;
  const fromDefault = defaultGroup ? scan(defaultGroup.events) : null;
  if (fromDefault) return fromDefault;
  const groups = Array.isArray(obj.groups) ? obj.groups : [];
  for (const g of groups) {
    if (typeof g !== 'object' || g === null) continue;
    const found = scan((g as Record<string, unknown>).events);
    if (found) return found;
  }
  return null;
}

/**
 * Reconstructs `data-manager-events.json` from the current `Event`/`Property`(scope `event`)/link
 * rows plus their `bloomreach_meta_json`, with passthrough of deselected sdk/platform (or any
 * never-imported) events from the stored snapshot (T-2-03, D-28, D-35, D-37). `passthrough` defaults
 * to `true`, matching the bridge's expectation of the whole file back; pass `false` to see only the
 * live app definition (D-35's documented alternative).
 */
export function exportDataManagerEvents(projectId: string, options: { passthrough?: boolean } = {}): Record<string, unknown> {
  const passthrough = options.passthrough !== false;
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const meta = (project.data_manager_meta_json ?? null) as
    | { events?: { default_forbidden?: boolean; default_private?: boolean; group_order?: string[] } }
    | null;
  const eventsMeta = meta?.events ?? {};
  const groupOrder = Array.isArray(eventsMeta.group_order) ? eventsMeta.group_order : [];

  const liveEvents = EventDAL.listEvents(projectId);

  function buildPropertyRow(link: EventDAL.EventPropertyWithDetails): Record<string, unknown> {
    const lm = (link.bloomreach_meta_json ?? null) as EventPropertyLinkMeta | null;
    const p = link.property;
    const formats = Array.isArray(p.data_formats_json) ? (p.data_formats_json as string[]) : [];
    // T-2-03 design note (beyond the plan's one-line "type from the reverse mapping of the Property
    // definition", "private = Property.pii"): a `Property` (scope `event`) is one row shared by every
    // event that carries it, but the fixture legitimately has the *same* property name with a
    // different Data Manager `type` (e.g. `order_date` string on `parcel_insert`, number on `sample`
    // and `flyer`, all `source: user`) and a different `private` flag (e.g. `email` private on some
    // events, not on others) across different events. The shared `Property.data_type`/`pii` can only
    // hold one value, so reconstructing from it would flatten every event's row to whichever
    // occurrence last won that shared value (see `dataManagerEventsImport.service.ts`'s type-conflict
    // rule and D-35's own documented "private is per (event, property)" lossy note).
    //
    // D-41 ERROR 2 fix: the link's own stored per-occurrence `dm_type`/`private`/`raw` text (captured
    // verbatim at import time) only reproduces the original divergence exactly *while the shared
    // Property still equals what that import wrote* (`propertyUnchangedSinceImport`, comparing the
    // Property's current `data_type`/`data_formats_json`/`pii` against the reference the import
    // stored in this same link meta). Once the user edits the Property (e.g. via `updateProperty`) —
    // this link, like every other link of that Property — falls through to the reverse-mapped
    // current definition and PII instead, so the edit reaches the export.
    const unchanged = propertyUnchangedSinceImport(lm, p);
    const type = unchanged && lm?.dm_type ? lm.dm_type : toDataManagerType(p.data_type, formats).type;
    const overrideDescription = link.description_override;
    const overrideExample = firstExampleValue(link.example_values_override_json);
    // T-2-03 review carry-over (D-41 amendment): description/example_values each have their own
    // "unchanged since import" check (`fieldUnchangedSinceImport`), independent of `unchanged`
    // (type/PII) above — an app edit to just the description, with the Property's type/PII untouched,
    // must still reach export instead of being masked by `unchanged` staying `true`.
    const descriptionUnchanged = fieldUnchangedSinceImport(lm, 'description', p.description);
    const exampleUnchanged = fieldUnchangedSinceImport(lm, 'example_values', firstExampleValue(p.example_values_json));
    return {
      deleting: lm?.deleting ?? false,
      description: resolveLinkText(overrideDescription, descriptionUnchanged ? lm?.raw?.description : undefined, p.description),
      example_values: resolveLinkText(
        overrideExample,
        exampleUnchanged ? lm?.raw?.example_values : undefined,
        firstExampleValue(p.example_values_json)
      ),
      private: unchanged && lm?.private !== undefined ? lm.private : p.pii,
      property: p.name,
      source: lm?.source ?? 'user',
      type,
      used: lm?.used ?? true,
    };
  }

  function buildEventRow(e: EventDAL.EventWithCounts): Record<string, unknown> {
    const evMeta = (e.bloomreach_meta_json ?? null) as EventMeta | null;
    const defaults = evMeta ? null : APP_BORN_EVENT_DEFAULTS;
    const { properties: links } = EventDAL.getEventWithProperties(projectId, e.id);

    const byGroup = new Map<string | null, EventDAL.EventPropertyWithDetails[]>();
    for (const link of links) {
      const lm = (link.bloomreach_meta_json ?? null) as EventPropertyLinkMeta | null;
      const group = lm?.group ?? null;
      const bucket = byGroup.get(group) ?? [];
      bucket.push(link);
      byGroup.set(group, bucket);
    }
    function dmIndexOf(link: EventDAL.EventPropertyWithDetails): number {
      const lm = (link.bloomreach_meta_json ?? null) as EventPropertyLinkMeta | null;
      return typeof lm?.dm_index === 'number' ? lm.dm_index : Number.POSITIVE_INFINITY;
    }
    function sortAndBuild(group: string | null): Record<string, unknown>[] {
      return [...(byGroup.get(group) ?? [])]
        .sort((a, b) => dmIndexOf(a) - dmIndexOf(b) || a.sort_order - b.sort_order)
        .map(buildPropertyRow);
    }
    const namedGroups = [...byGroup.keys()].filter((k): k is string => k !== null).sort();

    return {
      deleting: evMeta?.deleting ?? defaults?.deleting ?? false,
      description: e.description ?? evMeta?.raw?.description ?? null,
      forbidden: evMeta?.forbidden ?? defaults?.forbidden ?? false,
      properties: {
        are_all_used: evMeta?.are_all_used ?? true,
        default_group: { properties: sortAndBuild(null) },
        groups: namedGroups.map((name) => ({ name, properties: sortAndBuild(name) })),
      },
      real_time_analytics: evMeta?.real_time_analytics ?? defaults?.real_time_analytics ?? true,
      source: evMeta?.source ?? defaults?.source ?? 'user',
      type: e.name,
      used: evMeta?.used ?? defaults?.used ?? false,
    };
  }

  function dmIndexOfEvent(e: EventDAL.EventWithCounts): number {
    const evMeta = (e.bloomreach_meta_json ?? null) as EventMeta | null;
    return typeof evMeta?.dm_index === 'number' ? evMeta.dm_index : Number.POSITIVE_INFINITY;
  }

  // Passthrough (D-35): an event from the stored snapshot round-trips untouched, taken verbatim
  // from the original payload, whenever its Data Manager content was never actually absorbed into
  // the live definition — either because no `Event` row exists for it at all (deselected on import,
  // or never selected), or because a *pre-existing* non-custom event (`session_start` and friends,
  // already created by an earlier data-mapping/expiration-settings import, D-29/D-35's "the six
  // mapped events" case) had its own Data Manager `update` item deselected too, so it still carries
  // zero of the file's properties. A deliberately deleted event is dropped instead (its name exists,
  // soft-deleted, so `eventNameExistsAnyState` is true and it is excluded). Reconstructing a *custom*
  // event, or any event that did absorb at least one linked property, always uses the live
  // definition instead — that is the one Bloomreach should see reflect further edits in the app.
  // Each passthrough entry carries its parsed `dm_index` (T-2-03 fix) so it merges into the *same*
  // file-order sequence as the live events below, rather than being appended after every live event
  // regardless of its original position in the file.
  const passthroughTypes = new Set<string>();
  const passthroughByCategory = new Map<string | null, { index: number; row: unknown }[]>();
  if (passthrough && project.data_manager_events_json) {
    const snapshotPayload = (project.data_manager_events_json as { payload?: unknown }).payload;
    const snapshotModel = parseDataManagerEvents(snapshotPayload);
    const liveByName = new Map(liveEvents.map((e) => [e.name, e]));
    for (const ev of snapshotModel.events) {
      const liveRow = liveByName.get(ev.type);
      if (liveRow) {
        if (liveRow.class === 'custom' || liveRow.attached_property_count > 0) continue; // absorbed; reconstruct live
      } else if (eventNameExistsAnyState(projectId, ev.type)) {
        continue; // soft-deleted: dropped, not passed through
      }
      const raw = findRawEventObject(snapshotPayload, ev.type);
      if (!raw) continue;
      passthroughTypes.add(ev.type);
      const bucket = passthroughByCategory.get(ev.group) ?? [];
      bucket.push({ index: ev.dm_index, row: raw });
      passthroughByCategory.set(ev.group, bucket);
    }
  }

  const liveByCategory = new Map<string | null, EventDAL.EventWithCounts[]>();
  for (const e of liveEvents) {
    if (passthroughTypes.has(e.name)) continue; // represented by its passthrough entry instead
    const key = e.category ?? null;
    const bucket = liveByCategory.get(key) ?? [];
    bucket.push(e);
    liveByCategory.set(key, bucket);
  }

  function combined(category: string | null): Record<string, unknown>[] {
    const live = (liveByCategory.get(category) ?? []).map((e) => ({ index: dmIndexOfEvent(e), name: e.name, row: buildEventRow(e) }));
    const carried = (passthroughByCategory.get(category) ?? []).map((p) => ({
      index: p.index,
      name: (p.row as { type?: string }).type ?? '',
      row: p.row as Record<string, unknown>,
    }));
    return [...live, ...carried]
      .sort((a, b) => a.index - b.index || a.name.localeCompare(b.name))
      .map((entry) => entry.row);
  }

  const namedCategories = new Set(
    [...liveByCategory.keys(), ...passthroughByCategory.keys()].filter((k): k is string => k !== null)
  );
  const orderedCategories = [
    ...groupOrder.filter((name) => namedCategories.has(name)),
    ...[...namedCategories].filter((name) => !groupOrder.includes(name)).sort(),
  ];

  return {
    default_forbidden: eventsMeta.default_forbidden ?? false,
    default_group: { events: combined(null) },
    default_private: eventsMeta.default_private ?? false,
    groups: orderedCategories.map((name) => ({ name, events: combined(name) })),
  };
}
