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
 * Type conflicts (D-35, D-37): a property name may be created once, from its first `source: user`
 * occurrence in the file (else its first occurrence, whichever comes first). Every *other*
 * occurrence whose Data Manager type maps to a different app `data_type` than that reference is
 * compared exactly like `dataManagerCustomersImport.service.ts` compares an existing property:
 * `source: user` proposes a selected type-update item (one per property name, first such occurrence
 * wins); `source: data` produces one warning per (event, property) occurrence (comparison 4
 * evidence, never proposed) — this also covers a property that already existed before this import
 * (its "reference" is simply the already-stored `Property` row instead of a freshly chosen
 * occurrence), which is how the fixture's seven documented type warnings on already-mapped
 * properties (`purchase_item.price`/`quantity`, `cart_update.total_price`/`total_quantity`,
 * `checkout.total_price`, `view_item.price`/`stock_level`) arise without a second rule.
 */
import { getDb } from '../db';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as ProjectDAL from '../dal/project.dal';
import {
  parseDataManagerEvents,
  type DataManagerEvent,
  type DataManagerEventProperty,
  type DataManagerEventsModel,
} from '../../domain/import/dataManagerEvents';
import { toAppType } from '../../domain/bloomreach/dataManagerTypes';
import { classifyEventType } from '../../domain/bloomreach';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem, DiffItemChange } from '../../domain/diff/types';
import { PayloadChangedError } from '../errors';

const EMPTY_SENTINEL = '(empty)';
const SNAPSHOT_STEP_ID = 'project:data_manager_events_snapshot';

interface PlanStep {
  id: string;
  /** See `dataMappingImport.service.ts`'s `PlanStep.run`: `false` means "selected and runnable but
   *  could not actually write" (reclassified applied -> skipped); `void` means it ran (a no-op
   *  idempotent re-run counts as applied). */
  run: () => void | boolean;
  dependsOn?: string[];
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
}

function normalizeDescription(raw: string | null): string | null {
  if (raw === null || raw === EMPTY_SENTINEL || raw === '') return null;
  return raw;
}

function normalizeExampleValues(raw: string | null): { value: string }[] {
  if (raw === null || raw === EMPTY_SENTINEL || raw === '') return [];
  return [{ value: raw }];
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
}

function buildLinkMeta(prop: DataManagerEventProperty): EventPropertyLinkMeta {
  return {
    dm_type: prop.type,
    private: prop.private,
    source: prop.source,
    used: prop.used,
    deleting: prop.deleting,
    group: prop.group,
    dm_index: prop.dm_index,
    raw: { description: prop.description, example_values: prop.example_values },
  };
}

function buildPlan(projectId: string, model: DataManagerEventsModel, rawJson: unknown): PlanResult {
  const items: DiffItem[] = [];
  const warnings = [...model.warnings];
  const steps: PlanStep[] = [];
  const plannedIds = new Set<string>();

  function addItem(item: DiffItem, run: () => void | boolean, dependsOn?: string[]): void {
    if (plannedIds.has(item.id)) return;
    plannedIds.add(item.id);
    items.push(item);
    steps.push({ id: item.id, run, dependsOn: dependsOn?.length ? dependsOn : undefined });
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
  const linkedPropertyIdsByEventId = new Map<string, Set<string>>();
  for (const e of eventByName.values()) {
    const { properties } = EventDAL.getEventWithProperties(projectId, e.id);
    linkedPropertyIdsByEventId.set(e.id, new Set(properties.map((p) => p.property_id)));
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
      }
    );
  }

  // ---- Per-occurrence type comparisons (existing properties, and every non-creation occurrence of a new one). ----
  for (const [name, occs] of occByName) {
    const creation = creationOccByName.get(name)!;
    const existingProp = propertyByName.get(name) ?? null;
    const referenceAppType = existingProp
      ? { data_type: existingProp.data_type, data_formats: (Array.isArray(existingProp.data_formats_json) ? (existingProp.data_formats_json as string[]) : []) }
      : toAppType(creation.prop.type);
    let typeUpdateProposed = false;
    for (const occ of occs) {
      if (!existingProp && occ === creation) continue; // this occurrence *is* the reference; nothing to compare
      const appType = toAppType(occ.prop.type);
      if (appType.warning) continue; // unrecognized type already warned once at creation time
      if (appType.data_type === referenceAppType.data_type) continue; // matches; nothing to flag
      if (occ.prop.source === 'user') {
        if (typeUpdateProposed) continue; // one update item per property name is enough
        typeUpdateProposed = true;
        const id = `property:event:${name}:type`;
        addItem(
          {
            id,
            op: 'update',
            entity_type: 'property',
            entity_key: name,
            changes: [
              {
                field: 'data_type',
                before: referenceAppType.data_formats.length
                  ? `${referenceAppType.data_type}/${referenceAppType.data_formats.join(',')}`
                  : referenceAppType.data_type,
                after: appType.data_formats.length ? `${appType.data_type}/${appType.data_formats.join(',')}` : appType.data_type,
              },
            ],
            default_selected: true,
            note: `Update event property "${name}" type to match Data Manager (source "user" on event "${occ.event.type}").`,
          },
          () => {
            const row = propertyByName.get(name);
            if (!row) return false;
            const updated = PropertyDAL.updateProperty(projectId, row.id, {
              data_type: appType.data_type,
              data_formats_json: appType.data_formats,
            });
            propertyByName.set(name, updated);
          },
          existingProp ? undefined : [depIf(`property:event:${name}`)].filter((d): d is string => d !== null)
        );
      } else {
        warnings.push(
          `Property "${name}" on event "${occ.event.type}": Data Manager type differs (source "${occ.prop.source}"); not proposed (comparison 4 evidence).`
        );
      }
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
      const linkMeta = buildLinkMeta(prop);
      const dependsOn = [depIf(`event:${event.type}`), depIf(`property:event:${prop.property}`)].filter(
        (d): d is string => d !== null
      );
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
          EventDAL.attachPropertyToEvent(projectId, ev.id, {
            property_id: p.id,
            role: 'normal',
            required: false,
            bloomreach_meta_json: linkMeta,
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
          EventDAL.updateEventProperty(projectId, evRow.id, propRow.id, { bloomreach_meta_json: buildLinkMeta(prop) });
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
  run();

  const finalPlan = buildPlan(projectId, model, rawJson);
  const warnings = Array.from(new Set([...finalPlan.warnings, ...runtimeWarnings]));
  return { applied, skipped, warnings };
}
