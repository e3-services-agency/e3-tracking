/**
 * Data Manager events import/export service (T-2-03, PLAN "Import / export contracts: Data
 * Manager" > "Data Manager events", D-28, D-29, D-35, D-37). Same stateless preview-then-apply
 * contract as the other Bloomreach import services (see `dataManagerCustomersImport.service.ts`'s
 * top comment for the general "snapshot step" pattern this reuses); the plan has two levels — one
 * `event:<type>` item per file event (create/update, the 61-item count the plan's acceptance
 * criteria enumerate) plus, per event, a shared `property:event:<name>` item (created once per
 * property name, across every event that carries it) and a `link:<type>:<name>` item attaching it
 * to that specific event — modelled on `dataMappingImport.service.ts`'s `addItem`/`dependsOn`
 * dependency-graph pattern (link steps depend on their event and property steps), because unlike
 * the flat customers planner this format has cross-references.
 *
 * INFO (documents the open point the T-2-03 task text flags): property/link items are proposed for
 * *every* event regardless of whether that event's own `event:<type>` item is selected ("for all
 * with dependency closure"), not only for events the caller has selected. This keeps `buildPlan`
 * pure and order-independent of the caller's `selected_item_ids` (mirrors how `dataMappingImport`'s
 * `planVariant`/`planStandardEventMapping` already propose items regardless of whether the event
 * they reference is itself selected) and lets `apply`'s dependency graph do the actual gating: a
 * link step for a deselected sdk/platform event event simply never becomes `canRun` because its
 * `event:<type>` dependency was not selected, so nothing is written — the same effect as omitting
 * the item, but without a second, selection-aware code path through the planner.
 *
 * Class assignment (D-29) never changes an *existing* event's class; only `create` items set
 * `class` from `classifyEventType`. Every item's `default_selected` (event, property and link) is
 * driven by `classifyEventType(event.type) === 'custom'` — sdk/platform events, and the shared
 * properties/links whose *first* (property) or *owning* (link) event is sdk/platform, come in
 * deselected.
 *
 * Type conflicts (D-35, D-37, D-41 fix round): a property name may be created once, from its first
 * `source: user` occurrence in the file (else its first occurrence, whichever comes first). Unlike
 * `dataManagerCustomersImport.service.ts` (a flat, one-row-per-name format where a type difference
 * on the single existing row is a genuine update), this format has the *same* property name recur
 * across many events with genuinely different Data Manager types (e.g. `total_price` is `number` on
 * `purchase` and `string` on `cart_update`) — D-41 ruled that these cross-event conflicts never
 * produce an update item, regardless of `source`: every occurrence other than the one that created
 * the Property (or, for an already-existing Property, every occurrence at all) whose *reverse-mapped
 * Data Manager type* (LOW 5: compared like the customers planner, not raw `data_type`, so "long
 * text"/"url" vs "string" and "date" vs "datetime" compare correctly) differs from the reference is
 * one warning per (event, property) occurrence (comparison 4 evidence) — never proposed, and never
 * applied. This is what makes re-preview after apply idempotent (D-41): the Property's type is fixed
 * at creation and this planner never writes to it again.
 */
import { getDb } from '../db';
import { toExampleValuesJson } from '../../domain/examples';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as PropertyDefinitionDAL from '../dal/property-definition.dal';
import * as ProjectDAL from '../dal/project.dal';
import {
  parseDataManagerEvents,
  type DataManagerEvent,
  type DataManagerEventProperty,
  type DataManagerEventsModel,
} from '../../domain/import/dataManagerEvents';
import { toAppType, toDataManagerType } from '../../domain/bloomreach/dataManagerTypes';
import { classifyEventType } from '../../domain/bloomreach';
import { PROPERTY_DEFINITION_DEFAULT_NAME } from '../../domain/enums';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem, DiffItemChange } from '../../domain/diff/types';
import { PayloadChangedError } from '../errors';
import { runWithImportBatch } from '../context/actor';

const EMPTY_SENTINEL = '(empty)';
const SNAPSHOT_STEP_ID = 'project:data_manager_events_snapshot';

interface PlanStep {
  id: string;
  /** See `dataMappingImport.service.ts`'s `PlanStep.run`: `false` means "selected and runnable but
   *  could not actually write" (reclassified applied -> skipped); `void` means it ran (a no-op
   *  idempotent re-run counts as applied). */
  run: () => void | boolean;
  /** AND semantics: every id here must itself be runnable (as in `dataMappingImport.service.ts`). */
  dependsOn?: string[];
  /** OR semantics (D-41 MEDIUM 4 fix): when non-empty, at least one id here must be runnable, on top
   *  of `dependsOn`. Used only by a shared property's create step, whose own `dependsOn` is empty (a
   *  property does not belong to one event) but which must not be created when every event that
   *  actually carries it (in this file) was deselected — "properties ... are created only for
   *  selected events" (D-41). */
  anyOf?: string[];
}

interface PlanResult {
  items: DiffItem[];
  warnings: string[];
  steps: PlanStep[];
}

export interface DataManagerEventsPreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
}

export interface DataManagerEventsApplySummary {
  applied: string[];
  skipped: string[];
  warnings: string[];
  /** T-3-02: every change_log row this apply produces shares this id (`source: 'import:data-manager-events'`). */
  batch_id: string;
}

function normalizeDescription(raw: string | null): string | null {
  if (raw === null || raw === EMPTY_SENTINEL || raw === '') return null;
  return raw;
}

function normalizeExampleValues(raw: string | null): { value: string }[] {
  if (raw === EMPTY_SENTINEL) return [];
  return toExampleValuesJson(raw); // T-4-19: unwraps Bloomreach quoted/bracketed text
}

interface EventOccurrence {
  event: DataManagerEvent;
  prop: DataManagerEventProperty;
}

interface EventMeta {
  source: string;
  used: boolean;
  forbidden: boolean;
  deleting: boolean;
  real_time_analytics: boolean;
  are_all_used: boolean;
  dm_index: number;
  raw: { description: string | null };
}

function buildEventMeta(event: DataManagerEvent): EventMeta {
  return {
    source: event.source,
    used: event.used,
    forbidden: event.forbidden,
    deleting: event.deleting,
    real_time_analytics: event.real_time_analytics,
    are_all_used: event.properties_are_all_used,
    dm_index: event.dm_index,
    raw: { description: event.description },
  };
}

interface EventPropertyLinkMeta {
  dm_type: string;
  private: boolean;
  source: string;
  used: boolean;
  deleting: boolean;
  group: string | null;
  dm_index: number;
  raw: { description: string | null; example_values: string | null };
  /** D-41 ERROR 2 fix: the app `Property.data_type`/`data_formats_json`/`pii` this link's owning
   *  Property actually held at the moment this link meta was written (create or snapshot refresh) —
   *  the "what the import wrote" reference the exporter compares the *current* Property against to
   *  decide whether this link's verbatim Data Manager values are still valid or stale. */
  app_type_at_import: { data_type: string; data_formats: string[] };
  app_pii_at_import: boolean;
  /** T-2-03 review carry-over (D-41 amendment): the app `Property.description`/first
   *  `example_values_json` entry at the moment this link meta was written — the same "what the
   *  import wrote" reference as `app_type_at_import`, but for these two fields specifically, so an
   *  app edit to the shared `Property.description`/`example_values` after import is pushed on
   *  export even while the Property's type/PII are still unchanged (previously, description/
   *  example text only ever reached export by changing the type too — see
   *  `bloomreachExport.service.ts`'s `fieldUnchangedSinceImport`). */
  description_at_import: string | null;
  example_values_at_import: string | null;
}

/**
 * `property` is the Property row this link is attached to. `priorMeta` is this same link's own
 * `bloomreach_meta_json` from *before* this write, when there is one (a snapshot refresh of an
 * already-existing link) — when it already carries `app_type_at_import`/`app_pii_at_import`, that
 * reference is kept as-is ("store those if not already", D-41): once written, at the link's own
 * creation, it must stay frozen at what the import wrote then, never silently reset to "whatever
 * the Property is right now" on a later re-import (which would always equal itself and defeat the
 * whole export-precedence check). A brand-new link (`priorMeta` `null`/`undefined`, or missing the
 * fields — pre-fix-round data) captures the Property's current state as that reference for the
 * first time.
 */
/** First entry of an `example_values_json`-shaped array, stringified, else `null` (same convention as `bloomreachExport.service.ts`'s own `firstExampleValue`). */
function firstExampleValue(arr: unknown): string | null {
  return Array.isArray(arr) && arr.length > 0 ? String((arr[0] as { value: unknown }).value) : null;
}

function buildLinkMeta(
  prop: DataManagerEventProperty,
  property: PropertyDAL.PropertyRow,
  priorMeta?: EventPropertyLinkMeta | null
): EventPropertyLinkMeta {
  const appTypeAtImport = priorMeta?.app_type_at_import ?? {
    data_type: property.data_type,
    data_formats: Array.isArray(property.data_formats_json) ? (property.data_formats_json as string[]) : [],
  };
  const appPiiAtImport = priorMeta?.app_pii_at_import ?? property.pii;
  // D-41 amendment: same "store those if not already" rule as `app_type_at_import`/`app_pii_at_import`
  // above — a link that already carries these references keeps them frozen at what the import wrote
  // then; only a brand-new link (or pre-fix-round data missing them) captures the Property's current
  // text for the first time.
  const descriptionAtImport =
    priorMeta && priorMeta.description_at_import !== undefined ? priorMeta.description_at_import : property.description;
  const exampleValuesAtImport =
    priorMeta && priorMeta.example_values_at_import !== undefined
      ? priorMeta.example_values_at_import
      : firstExampleValue(property.example_values_json);
  return {
    dm_type: prop.type,
    private: prop.private,
    source: prop.source,
    used: prop.used,
    deleting: prop.deleting,
    group: prop.group,
    dm_index: prop.dm_index,
    raw: { description: prop.description, example_values: prop.example_values },
    app_type_at_import: appTypeAtImport,
    app_pii_at_import: appPiiAtImport,
    description_at_import: descriptionAtImport,
    example_values_at_import: exampleValuesAtImport,
  };
}

function buildPlan(projectId: string, model: DataManagerEventsModel, rawJson: unknown): PlanResult {
  const items: DiffItem[] = [];
  const warnings = [...model.warnings];
  const steps: PlanStep[] = [];
  const plannedIds = new Set<string>();

  function addItem(item: DiffItem, run: () => void | boolean, dependsOn?: string[], anyOf?: string[]): void {
    if (plannedIds.has(item.id)) return;
    plannedIds.add(item.id);
    items.push(item);
    steps.push({ id: item.id, run, dependsOn: dependsOn?.length ? dependsOn : undefined, anyOf: anyOf?.length ? anyOf : undefined });
  }
  function depIf(id: string): string | null {
    return plannedIds.has(id) ? id : null;
  }

  // ---- One-time snapshot of the current definition, read once instead of per occurrence (perf: the
  // fixture has ~60 events and 500+ property occurrences; a `findPropertyByName`/`findEventByName`
  // per occurrence — each a full `listProperties`/`listEvents` scan — made `buildPlan` quadratic in
  // the number of occurrences and took minutes on the full fixture, and `apply`'s few hundred
  // `run()` closures repeating that scan on every write took several seconds even after the
  // planning-time fix below). These maps are also the *execution-time* cache: every `run()` closure
  // below reads and writes them directly (instead of re-querying the DAL) so a later step in the
  // same `apply` transaction sees an earlier step's write in O(1) — correct because plan steps run
  // strictly in the order they were added (events and properties before the links that `dependsOn`
  // them), and `preview` never calls any `run()` at all, so these maps are never mutated there. ----
  const propertyByName = new Map(PropertyDAL.listProperties(projectId, { scope: 'event' }).map((p) => [p.name, p]));
  const eventByName = new Map<string, EventDAL.EventRow>(EventDAL.listEvents(projectId).map((e) => [e.name, e]));
  // MEDIUM 4 fix (D-41): names of events that already existed *before* this plan/apply — snapshotted
  // here, before any `run()` mutates `eventByName`. An already-existing event needs no `event:<type>`
  // item selected to "count" for a shared property's `anyOf` gate below (it is not being created by
  // this import at all; it is simply there), unlike a brand-new event which only exists once its own
  // `create` item actually runs.
  const originalEventNames = new Set(eventByName.keys());
  const linkedPropertyIdsByEventId = new Map<string, Set<string>>();
  // ERROR 2 groundwork (D-41 export precedence): the *original* `bloomreach_meta_json` of every
  // already-existing link, keyed `${eventId}:${propertyId}` — read once, before any `run()` write,
  // so the snapshot refresh below can tell whether `app_type_at_import`/`app_pii_at_import` were
  // already recorded on a prior apply ("store those if not already", D-41) and, if so, leave them
  // alone rather than overwriting the reference with whatever the Property happens to be *now*
  // (which would always equal itself and silently defeat the whole precedence check).
  const originalLinkMetaByKey = new Map<string, EventPropertyLinkMeta | null>();
  for (const e of eventByName.values()) {
    const { properties } = EventDAL.getEventWithProperties(projectId, e.id);
    linkedPropertyIdsByEventId.set(e.id, new Set(properties.map((p) => p.property_id)));
    for (const link of properties) {
      originalLinkMetaByKey.set(`${e.id}:${link.property_id}`, (link.bloomreach_meta_json ?? null) as EventPropertyLinkMeta | null);
    }
  }

  // ---- Group every property occurrence in the file by property name (across all events). ----
  const occByName = new Map<string, EventOccurrence[]>();
  for (const event of model.events) {
    for (const prop of event.properties) {
      const arr = occByName.get(prop.property) ?? [];
      arr.push({ event, prop });
      occByName.set(prop.property, arr);
    }
  }
  // First `source: user` occurrence, else the first occurrence overall (D-35).
  const creationOccByName = new Map<string, EventOccurrence>();
  for (const [name, occs] of occByName) {
    creationOccByName.set(name, occs.find((o) => o.prop.source === 'user') ?? occs[0]);
  }

  // ---- Property creates (one per name not already in the definition). ----
  for (const [name, occs] of occByName) {
    const id = `property:event:${name}`;
    if (propertyByName.has(name)) continue; // handled by the comparison loop below
    const creation = creationOccByName.get(name)!;
    const firstOcc = occs[0];
    const appType = toAppType(creation.prop.type);
    if (appType.warning) warnings.push(`Property "${name}" (event "${creation.event.type}"): ${appType.warning}`);
    const pii = occs.some((o) => o.prop.private);
    const typeLabel = appType.data_formats.length ? `${appType.data_type}/${appType.data_formats.join(',')}` : appType.data_type;
    // T-2-03 fix: default-select the property whenever *any* event carrying it is custom, not only
    // the (arbitrarily chosen, type-only) "creation occurrence" event. `total_price`/`email`/`source`
    // and similar names are shared across dozens of events of mixed class (e.g. `email`'s *first*
    // file occurrence is on the platform event `consent`, but it is also used by several custom
    // MentionMe events) — gating selection on the creation occurrence's class alone left the
    // property (and therefore every custom event's link to it) permanently deselected and
    // unreachable, since a link's `dependsOn` never becomes runnable while its property step was
    // never selected.
    const anyCustomUsesIt = occs.some((o) => classifyEventType(o.event.type) === 'custom');
    // MEDIUM 4 fix (D-41): this property is only actually created when at least one of the events
    // that carry it in the file is itself selected/created — `anyOf` (OR), not `dependsOn` (AND),
    // since a property with no owning single event must not require *every* using event to run.
    // Without this, deselecting the only custom event that uses a name (e.g. `registered_as_referee`
    // deselected on an empty project) still created that event's properties, one of them linked
    // nowhere.
    addItem(
      {
        id,
        op: 'create',
        entity_type: 'property',
        entity_key: name,
        changes: [],
        default_selected: anyCustomUsesIt,
        note: `Create event property "${name}" (${typeLabel}), from event "${creation.event.type}".`,
      },
      () => {
        if (propertyByName.has(name)) return;
        const created = PropertyDAL.createProperty(projectId, {
          scope: 'event',
          name,
          data_type: appType.data_type,
          data_formats_json: appType.data_formats,
          pii,
          description: normalizeDescription(firstOcc.prop.description),
          example_values_json: normalizeExampleValues(firstOcc.prop.example_values),
          property_type: 'custom',
          bloomreach_meta_json: { raw: { description: firstOcc.prop.description, example_values: firstOcc.prop.example_values } },
        });
        propertyByName.set(name, created);
      },
      undefined,
      // `anyOf`: an occurrence on an already-existing event always satisfies the gate (that event is
      // there regardless of any item selection this run) so no gate is needed at all; only when
      // *every* occurrence is on a brand-new event does at least one of their `event:<type>` create
      // steps need to actually run.
      occs.some((o) => originalEventNames.has(o.event.type)) ? undefined : occs.map((o) => `event:${o.event.type}`)
    );
  }

  // ---- D-58 (T-4-00): per-event definitions when description/example diverge across the events
  // that carry the same attribute name. The "general" values are the property's own (its stored
  // description/example for an already-existing property, or the creation occurrence's normalized
  // values for a brand-new one, matching the create step above); every occurrence whose own
  // normalized description/example differs from "general" is grouped with every other occurrence
  // sharing that exact combination and gets one definition, named after the first event (file
  // order, tie-broken by name) to use it -- the property itself is never overwritten by a
  // divergent occurrence (D-58's whole point). `definitionIdByOccurrenceKey`/
  // `definitionStepIdByOccurrenceKey` (keyed `${event.type}:${name}`) feed the link steps below.
  const definitionIdByOccurrenceKey = new Map<string, string>();
  const definitionStepIdByOccurrenceKey = new Map<string, string>();

  for (const [name, occs] of occByName) {
    const existingProp = propertyByName.get(name) ?? null;
    // "general" is whatever the property's own description/example will actually hold: its
    // current stored values for an already-existing property, or -- for a brand-new one -- the
    // exact same `occs[0]` ("first occurrence in file order", not the `source: user`-preferring
    // `creationOccByName`) the property-create step above seeds it from. Comparing against the
    // wrong reference here would treat some occurrences as "matches general" on the first import
    // that the just-created property's real description does not actually match, leaving them
    // without a definition until a second, confusingly non-idempotent preview surfaced them.
    const firstOcc = occs[0];
    const generalDescription = existingProp ? existingProp.description : normalizeDescription(firstOcc.prop.description);
    const generalExample = existingProp
      ? firstExampleValue(existingProp.example_values_json)
      : firstExampleValue(normalizeExampleValues(firstOcc.prop.example_values));

    const groups = new Map<string, EventOccurrence[]>();
    for (const occ of occs) {
      const desc = normalizeDescription(occ.prop.description);
      const example = firstExampleValue(normalizeExampleValues(occ.prop.example_values));
      if (desc === generalDescription && example === generalExample) continue; // matches general; no definition needed
      const key = `${desc ?? ''}\u0000${example ?? ''}`;
      const arr = groups.get(key) ?? [];
      arr.push(occ);
      groups.set(key, arr);
    }
    if (groups.size === 0) continue;

    const existingDefinitions = existingProp ? PropertyDefinitionDAL.listDefinitions(projectId, existingProp.id) : [];

    // Fix round WARNING 4: an event literally named "general" would otherwise collide with the
    // property's own general definition (created once per property regardless of whether it
    // exists yet in this same apply); renamed "<event> (event)", -2/-3 suffixed against any other
    // group of the *same* property that (absurdly) also resolves to that same name. Pure function
    // of the file's own group order (never of current DB state), so re-preview after apply always
    // recomputes the exact same name and matches the existing row -- idempotent.
    const usedDefinitionNames = new Set<string>();
    let groupIndex = 0;
    for (const groupOccs of groups.values()) {
      groupIndex += 1;
      // File order (matches `creationOccByName`'s own convention): the first occurrence in this
      // group names the definition, after the first event that actually carries this meaning.
      const fileFirst = groupOccs[0];
      const desc = normalizeDescription(fileFirst.prop.description);
      const example = firstExampleValue(normalizeExampleValues(fileFirst.prop.example_values));
      const baseDefinitionName =
        fileFirst.event.type === PROPERTY_DEFINITION_DEFAULT_NAME
          ? `${fileFirst.event.type} (event)`
          : fileFirst.event.type;
      let definitionName = baseDefinitionName;
      for (let suffix = 2; usedDefinitionNames.has(definitionName); suffix++) {
        definitionName = `${baseDefinitionName}-${suffix}`;
      }
      usedDefinitionNames.add(definitionName);
      const stepId = `definition:event:${name}:${groupIndex}`;

      const existingByName = existingDefinitions.find((d) => d.name === definitionName) ?? null;
      const contentMatches =
        existingByName && existingByName.description === desc && firstExampleValue(existingByName.example_values_json) === example;

      if (existingByName && contentMatches) {
        for (const occ of groupOccs) definitionIdByOccurrenceKey.set(`${occ.event.type}:${name}`, existingByName.id);
        continue;
      }

      const op: 'create' | 'update' = existingByName ? 'update' : 'create';
      addItem(
        {
          id: stepId,
          op,
          entity_type: 'property_definition',
          entity_key: `${name}:${definitionName}`,
          changes: [{ field: 'description', before: existingByName?.description ?? null, after: desc }],
          default_selected: groupOccs.some((o) => classifyEventType(o.event.type) === 'custom'),
          note: `${op === 'create' ? 'Create' : 'Update'} definition "${definitionName}" of property "${name}" (differs from its general meaning).`,
        },
        () => {
          const p = propertyByName.get(name);
          if (!p) return false;
          let defId: string;
          if (existingByName) {
            const updated = PropertyDefinitionDAL.updateDefinition(projectId, p.id, existingByName.id, {
              description: desc,
              example_values_json: normalizeExampleValues(fileFirst.prop.example_values),
            });
            defId = updated.id;
          } else {
            const created = PropertyDefinitionDAL.createDefinition(projectId, p.id, {
              name: definitionName,
              description: desc,
              example_values_json: normalizeExampleValues(fileFirst.prop.example_values),
            });
            defId = created.id;
          }
          for (const occ of groupOccs) definitionIdByOccurrenceKey.set(`${occ.event.type}:${name}`, defId);
        },
        existingProp ? undefined : [`property:event:${name}`]
      );
      for (const occ of groupOccs) definitionStepIdByOccurrenceKey.set(`${occ.event.type}:${name}`, stepId);
    }
  }

  // ---- Per-occurrence type comparisons: warning only, never an update (D-41 ERROR 1 fix). A
  // property's type is fixed once, at creation (or was already fixed before this import); every
  // other occurrence in the file whose reverse-mapped Data Manager type differs from that reference
  // — including a `source: user` occurrence, and regardless of whether the property is new or
  // already existed — is one warning per (event, property) occurrence, never a proposed change. This
  // is what makes re-preview after apply idempotent: nothing here ever calls `PropertyDAL.updateProperty`.
  for (const [name, occs] of occByName) {
    const creation = creationOccByName.get(name)!;
    const existingProp = propertyByName.get(name) ?? null;
    // LOW 5 fix: compare by the *reverse-mapped Data Manager type string* (like
    // `dataManagerCustomersImport.service.ts`'s `currentDmType`), not the raw app `data_type` alone —
    // "long text"/"url" vs "string" and "date" vs "datetime" share an app `data_type` but are
    // genuinely different Bloomreach types and must compare as different.
    const referenceAppType = existingProp
      ? { data_type: existingProp.data_type, data_formats: (Array.isArray(existingProp.data_formats_json) ? (existingProp.data_formats_json as string[]) : []) }
      : toAppType(creation.prop.type);
    const referenceDm = toDataManagerType(referenceAppType.data_type, referenceAppType.data_formats);
    if (existingProp && referenceDm.warning) {
      // LOW 5 fix: an existing property whose own app `data_type` has no Bloomreach counterpart
      // (e.g. hand-created as `object`) previously warned about nothing when compared against;
      // surface it once per property name instead of silently skipping every occurrence.
      warnings.push(`Property "${name}": existing app data type "${referenceAppType.data_type}" has no Bloomreach Data Manager equivalent; type comparison skipped (comparison 4 evidence).`);
    }
    for (const occ of occs) {
      if (!existingProp && occ === creation) continue; // this occurrence *is* the reference; nothing to compare
      const appType = toAppType(occ.prop.type);
      if (appType.warning) continue; // unrecognized incoming type already warned once at creation time
      if (referenceDm.warning) continue; // reference itself uncomparable; already warned above
      const occDm = toDataManagerType(appType.data_type, appType.data_formats);
      if (occDm.type === referenceDm.type) continue; // matches; nothing to flag
      warnings.push(
        `Property "${name}" on event "${occ.event.type}": Data Manager type differs (source "${occ.prop.source}"); not proposed (comparison 4 evidence, D-41).`
      );
    }
  }

  // ---- Events, plus per-event property links. ----
  for (const event of model.events) {
    const id = `event:${event.type}`;
    const eventClass = classifyEventType(event.type);
    const defaultSelected = eventClass === 'custom';
    const existingEvent = eventByName.get(event.type) ?? null;
    const meta = buildEventMeta(event);

    if (!existingEvent) {
      addItem(
        {
          id,
          op: 'create',
          entity_type: 'event',
          entity_key: event.type,
          changes: [],
          default_selected: defaultSelected,
          note: `Create ${eventClass} event "${event.type}".`,
          class: eventClass,
        },
        () => {
          if (eventByName.has(event.type)) return;
          const created = EventDAL.createEvent(projectId, {
            name: event.type,
            class: eventClass,
            category: event.group,
            description: normalizeDescription(event.description),
            status: 'planned',
            bloomreach_meta_json: meta,
          });
          eventByName.set(event.type, created);
          linkedPropertyIdsByEventId.set(created.id, new Set());
        }
      );
    } else {
      const changes: DiffItemChange[] = [];
      if ((existingEvent.category ?? null) !== event.group) {
        changes.push({ field: 'category', before: existingEvent.category, after: event.group });
      }
      const desiredDescription = normalizeDescription(event.description);
      // D-35: description is only proposed when the app's own value is currently null, never
      // overwriting text the user (or another import) already entered.
      if (existingEvent.description === null && desiredDescription !== null) {
        changes.push({ field: 'description', before: null, after: desiredDescription });
      }
      // MEDIUM 3 fix (D-41, guard shared with the customers planner's `if (existing && changes.length
      // === 0) continue`): an already-up-to-date event proposes no update item at all, instead of a
      // selected no-op that never lets "Apply (N selected)" reach zero on re-preview.
      if (changes.length > 0) {
        addItem(
          {
            id,
            op: 'update',
            entity_type: 'event',
            entity_key: event.type,
            changes,
            default_selected: defaultSelected,
            note: `Update event "${event.type}" (app class "${existingEvent.class}"; Data Manager class "${eventClass}", never changed by import).`,
            class: eventClass,
          },
          () => {
            const row = eventByName.get(event.type);
            if (!row) return false;
            const patch: Partial<EventDAL.EventInput> = {};
            if (changes.some((c) => c.field === 'category')) patch.category = event.group;
            if (changes.some((c) => c.field === 'description')) patch.description = desiredDescription;
            if (Object.keys(patch).length > 0) {
              const updated = EventDAL.updateEvent(projectId, row.id, patch);
              eventByName.set(event.type, updated);
            }
          }
        );
      }
    }

    for (const prop of event.properties) {
      const linkId = `link:${event.type}:${prop.property}`;
      if (plannedIds.has(linkId)) continue;
      const existingPropertyRow = propertyByName.get(prop.property) ?? null;
      if (
        existingEvent &&
        existingPropertyRow &&
        linkedPropertyIdsByEventId.get(existingEvent.id)?.has(existingPropertyRow.id)
      ) {
        continue; // already linked; refreshed unconditionally by the snapshot step below
      }
      const occKey = `${event.type}:${prop.property}`;
      const dependsOn = [
        depIf(`event:${event.type}`),
        depIf(`property:event:${prop.property}`),
        depIf(definitionStepIdByOccurrenceKey.get(occKey) ?? ''),
      ].filter((d): d is string => d !== null);
      addItem(
        {
          id: linkId,
          op: 'create',
          entity_type: 'event_property',
          entity_key: `${event.type}.${prop.property}`,
          changes: [],
          default_selected: defaultSelected,
          note: `Link property "${prop.property}" to event "${event.type}".`,
        },
        () => {
          const ev = eventByName.get(event.type);
          const p = propertyByName.get(prop.property);
          if (!ev || !p) return false;
          const linked = linkedPropertyIdsByEventId.get(ev.id) ?? new Set<string>();
          if (linked.has(p.id)) return; // idempotent re-run
          // Built here, not at plan-build time (ERROR 2 groundwork): `p` (the Property row) must be
          // the row as it stands right when this link is written, since `buildLinkMeta` reads the
          // app type/PII off it for `app_type_at_import`/`app_pii_at_import` — a brand-new property's
          // row does not exist yet when this closure is *created* (its own `create` step runs earlier
          // in the same `apply`, but only `propertyByName` at *run* time reflects it).
          const linkMeta = buildLinkMeta(prop, p);
          // D-58: this occurrence's own definition, when one was created/matched above; `undefined`
          // (the property's default `general` definition) otherwise.
          const definitionId = definitionIdByOccurrenceKey.get(occKey);
          EventDAL.attachPropertyToEvent(projectId, ev.id, {
            property_id: p.id,
            role: 'normal',
            required: false,
            bloomreach_meta_json: linkMeta,
            ...(definitionId ? { definition_id: definitionId } : {}),
          });
          linked.add(p.id);
          linkedPropertyIdsByEventId.set(ev.id, linked);
        },
        dependsOn
      );
    }
  }

  // ---- Snapshot step: always present, always applied regardless of selection (see module comment
  // and `dataManagerCustomersImport.service.ts`'s own snapshot step for the general pattern). ----
  if (model.events.length === 0) {
    warnings.push('No events found in this payload; nothing to import. The Data Manager events snapshot was not stored.');
    return { items, warnings, steps };
  }

  const project = ProjectDAL.getProjectOrThrow(projectId);
  const desiredEventsMeta = {
    default_forbidden: model.default_forbidden,
    default_private: model.default_private,
    group_order: model.group_order,
  };
  const existingProjectMeta = (project.data_manager_meta_json ?? null) as { customers?: unknown; events?: unknown } | null;
  items.push({
    id: SNAPSHOT_STEP_ID,
    op: project.data_manager_events_json ? 'update' : 'create',
    entity_type: 'project',
    entity_key: 'data_manager_events_json',
    changes: [{ field: 'data_manager_events_json', before: null, after: '(snapshot; always applied)' }],
    default_selected: true,
    note: 'Store the Data Manager events snapshot (always applied; not deselectable).',
    locked: true,
  });
  steps.push({
    id: SNAPSHOT_STEP_ID,
    run: () => {
      ProjectDAL.updateProject(projectId, {
        data_manager_meta_json: { ...(existingProjectMeta ?? {}), events: desiredEventsMeta },
        data_manager_events_json: { payload: rawJson, applied_at: new Date().toISOString() },
      });
      // Refresh event + link meta for every already-existing (event, property) pair, regardless of
      // whether its own create/update item was selected (comparison 4 evidence, D-35). Runs last
      // (pushed as the final step) and reuses the same execution-time caches every earlier step
      // maintained, rather than re-querying the DAL per (event, property) occurrence.
      for (const event of model.events) {
        const evRow = eventByName.get(event.type);
        if (!evRow) continue;
        const refreshedEvent = EventDAL.updateEvent(projectId, evRow.id, { bloomreach_meta_json: buildEventMeta(event) });
        eventByName.set(event.type, refreshedEvent);
        if (event.properties.length === 0) continue;
        const linkedPropertyIds = linkedPropertyIdsByEventId.get(evRow.id) ?? new Set<string>();
        for (const prop of event.properties) {
          const propRow = propertyByName.get(prop.property);
          if (!propRow) continue;
          if (!linkedPropertyIds.has(propRow.id)) continue; // its link step was not selected/applied
          const priorMeta = originalLinkMetaByKey.get(`${evRow.id}:${propRow.id}`) ?? null;
          // D-58: an already-existing link also picks up a definition created/matched above by
          // this same apply (e.g. an already-linked event whose description just diverged on
          // re-import); a link with no divergent group keeps whatever definition it already had.
          const definitionId = definitionIdByOccurrenceKey.get(`${event.type}:${prop.property}`);
          EventDAL.updateEventProperty(projectId, evRow.id, propRow.id, {
            bloomreach_meta_json: buildLinkMeta(prop, propRow, priorMeta),
            ...(definitionId ? { definition_id: definitionId } : {}),
          });
        }
      }
    },
  });

  return { items, warnings, steps };
}

export function previewDataManagerEvents(projectId: string, rawJson: unknown): DataManagerEventsPreviewResult {
  const model = parseDataManagerEvents(rawJson);
  const { items, warnings } = buildPlan(projectId, model, rawJson);
  return { items, warnings, payload_hash: payloadHash(rawJson) };
}

export function applyDataManagerEvents(
  projectId: string,
  rawJson: unknown,
  expectedHash: string,
  selectedItemIds: string[]
): DataManagerEventsApplySummary {
  if (payloadHash(rawJson) !== expectedHash) {
    throw new PayloadChangedError('The payload changed since preview; re-run preview before applying.');
  }
  const model = parseDataManagerEvents(rawJson);
  const selected = new Set(selectedItemIds);
  const applied: string[] = [];
  const skipped: string[] = [];

  const db = getDb();
  const runtimeWarnings: string[] = [];
  const run = db.transaction(() => {
    const { items, steps, warnings: planWarnings } = buildPlan(projectId, model, rawJson);
    const stepById = new Map(steps.map((s) => [s.id, s]));

    // Same dependency-respecting execution as `dataMappingImport.service.ts`'s `apply`: a step only
    // actually runs when it is selected *and* every step it `dependsOn` is itself runnable —
    // otherwise it is reported as skipped instead of writing a partial record (e.g. a link whose
    // event or property step was deselected). The snapshot step is always runnable.
    const runnable = new Map<string, boolean>();
    function canRun(id: string): boolean {
      if (id === SNAPSHOT_STEP_ID) return true;
      if (runnable.has(id)) return runnable.get(id) as boolean;
      const step = stepById.get(id);
      if (!step || !selected.has(id)) {
        runnable.set(id, false);
        return false;
      }
      runnable.set(id, true); // provisional, guards against a cycle
      let ok = true;
      for (const dep of step.dependsOn ?? []) {
        if (!stepById.has(dep)) continue; // not proposed this run; already satisfied
        if (!canRun(dep)) {
          ok = false;
          break;
        }
      }
      // MEDIUM 4 fix (D-41): `anyOf` is OR, on top of the AND `dependsOn` above — a non-empty
      // `anyOf` needs at least one of its own ids runnable. An `anyOf` id absent from `stepById`
      // (e.g. an already-existing, unchanged event that proposed no item at all) never satisfies it
      // here — `buildPlan` only omits `anyOf` altogether when *any* occurrence is on such an event,
      // so reaching this branch means every `anyOf` id really does need its own step to run.
      if (ok && step.anyOf && step.anyOf.length > 0) {
        const anySatisfied = step.anyOf.some((dep) => stepById.has(dep) && canRun(dep));
        if (!anySatisfied) ok = false;
      }
      runnable.set(id, ok);
      return ok;
    }

    for (const item of items) {
      if (canRun(item.id)) {
        applied.push(item.id);
      } else {
        skipped.push(item.id);
        if (selected.has(item.id)) {
          const step = stepById.get(item.id);
          const unmetDep = (step?.dependsOn ?? []).find((dep) => stepById.has(dep) && !canRun(dep));
          if (unmetDep) {
            runtimeWarnings.push(`Skipped "${item.id}": depends on "${unmetDep}", which was not applied.`);
          } else if (step?.anyOf && step.anyOf.length > 0 && !step.anyOf.some((dep) => stepById.has(dep) && canRun(dep))) {
            // T-2-03 review carry-over: a shared property's `create` step (the only user of `anyOf`,
            // see the `PlanStep.anyOf` comment) skipped because *every* event that carries it was
            // deselected previously produced no explanation at all — the item just silently
            // disappeared from `applied`. One warning, same shape as the `dependsOn` case above.
            runtimeWarnings.push(
              `Skipped "${item.id}": none of its events (${step.anyOf.join(', ')}) were applied.`
            );
          }
        }
      }
    }
    for (const step of steps) {
      if (!canRun(step.id)) continue;
      const result = step.run();
      if (result === false) {
        const idx = applied.indexOf(step.id);
        if (idx !== -1) applied.splice(idx, 1);
        if (!skipped.includes(step.id)) skipped.push(step.id);
      }
    }
    runtimeWarnings.push(...planWarnings);
  });
  const { batchId } = runWithImportBatch('data-manager-events', run);

  const finalPlan = buildPlan(projectId, model, rawJson);
  const warnings = Array.from(new Set([...finalPlan.warnings, ...runtimeWarnings]));
  return { applied, skipped, warnings, batch_id: batchId };
}
