/**
 * Data mapping import/export service (T-1-08, PLAN "Import / export contracts" > Data mapping,
 * D-04, D-22, D-26). `preview`/`apply` implement the stateless preview-then-apply contract:
 * `preview` parses and plans (read-only) and returns `{items, warnings, payload_hash}`; `apply`
 * re-plans against the resent raw JSON, 409s on a hash mismatch, and executes only the selected
 * plan steps inside one `db.transaction` (unselected steps are simply never run — "skipped").
 *
 * The plan is built once (`buildPlan`) and reused by both `preview` (steps are never run) and
 * `apply` (steps are run, gated by `selectedIds`, in dependency order: events, then properties,
 * then variants + standard event mappings, then customer properties, then consents, then the
 * catalogs/`_id`/`custom_events` round-trip blob and project additions). Every step's `run()` is
 * idempotent (re-checks "does this already exist" against the live DB) so re-running `apply` next
 * to an already-applied import produces an empty plan (see `dataMappingImport.service.test.ts`
 * "apply idempotence").
 */
import { getDb } from '../db';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as ProjectDAL from '../dal/project.dal';
import { parseDataMapping, type DataMappingModel, type DataMappingStandardEvent } from '../../domain/import/dataMapping';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem } from '../../domain/diff/types';
import { isKnownStandardEvent, isKnownConsentKey, STANDARD_CUSTOMER_PROPERTIES, type StandardEventSeed } from '../../domain/bloomreach';
import { generateVariantName, type VariantCondition } from '../../domain/variants';
import { BadRequestError, ConflictError, PayloadChangedError } from '../errors';
import { findEventByName, findPropertyByName, ensureLinked, findMatchingVariant } from './bloomreachImportHelpers';

/** Compares two `field -> property name|null` maps by content, independent of key order. */
function fieldMapsEqual(a: Record<string, string | null>, b: Record<string, string | null>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

interface PlanStep {
  id: string;
  run: () => void;
}

interface PlanResult {
  items: DiffItem[];
  warnings: string[];
  steps: PlanStep[];
}

export interface DataMappingPreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
}

export interface DataMappingApplySummary {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

/** Builds the full proposed-write plan for `model` against the current state of `projectId`. Read-only: never writes. */
function buildPlan(projectId: string, model: DataMappingModel): PlanResult {
  const items: DiffItem[] = [];
  const warnings = [...model.warnings];
  const steps: PlanStep[] = [];
  const plannedIds = new Set<string>();

  function addItem(item: DiffItem, run: () => void): void {
    if (plannedIds.has(item.id)) return;
    plannedIds.add(item.id);
    items.push(item);
    steps.push({ id: item.id, run });
  }

  const project = ProjectDAL.getProjectOrThrow(projectId);
  const standardAdditions = (project.standard_event_additions_json as StandardEventSeed[] | null) ?? [];
  const consentAdditions = (project.consent_key_additions_json as string[] | null) ?? [];

  const mappedEvents = model.standardEvents.filter((se) => se.eventType);

  // ---- Phase 1: events ----
  const eventNames = new Set(mappedEvents.map((se) => se.eventType as string));
  for (const name of eventNames) planEvent(name);

  // ---- Phase 2: discriminator properties (aggregate allowed values across every std event that uses each property name) ----
  const discriminatorAgg = new Map<string, { values: Set<string>; hint: string }>();
  for (const se of mappedEvents) {
    for (const cond of se.filter) {
      const entry = discriminatorAgg.get(cond.property) ?? { values: new Set<string>(), hint: se.key };
      cond.values.forEach((v) => entry.values.add(v));
      discriminatorAgg.set(cond.property, entry);
    }
  }
  for (const [propName, agg] of discriminatorAgg) {
    planEventProperty(propName, Array.from(agg.values), agg.hint);
  }

  // ---- Phase 3: field-mapped properties (scope event), skipping names already planned as discriminators ----
  const fieldPropertyNames = new Set<string>();
  for (const se of mappedEvents) {
    for (const propName of Object.values(se.fieldMap)) {
      if (propName) fieldPropertyNames.add(propName);
    }
  }
  for (const propName of fieldPropertyNames) {
    if (!discriminatorAgg.has(propName)) planEventProperty(propName, [], undefined);
  }

  // ---- Phase 4: variants + standard event mappings ----
  for (const se of mappedEvents) {
    const eventName = se.eventType as string;
    if (se.filter.length > 0) planVariant(eventName, se.filter);
    planStandardEventMapping(se, eventName);
  }

  // ---- Phase 5: customer properties ----
  for (const [stdKey, propName] of Object.entries(model.customerProperties)) {
    if (propName) planCustomerProperty(stdKey, propName);
  }

  // ---- Phase 6: consents ----
  for (const [stdKey, clientName] of Object.entries(model.consents)) {
    if (clientName) planConsent(stdKey, clientName);
  }

  // ---- Phase 7: project additions for unknown standard event / consent keys (D-26: never rejected) ----
  for (const se of model.standardEvents) {
    if (!isKnownStandardEvent(se.key, standardAdditions)) planStandardEventAddition(se, standardAdditions);
  }
  for (const [stdKey, clientName] of Object.entries(model.consents)) {
    if (clientName && !isKnownConsentKey(stdKey, consentAdditions)) planConsentKeyAddition(stdKey, consentAdditions);
  }

  // ---- Phase 8: catalogs / _id / custom_events round trip + empty-catalog-block warning ----
  planCatalogMeta();

  return { items, warnings, steps };

  // ---------------- helpers (closures over items/steps/model/projectId) ----------------

  function planEvent(name: string): void {
    const id = `event:${name}`;
    if (plannedIds.has(id) || findEventByName(projectId, name)) return;
    addItem(
      { id, op: 'create', entity_type: 'event', entity_key: name, changes: [], default_selected: true, note: `Create event "${name}".` },
      () => {
        if (!findEventByName(projectId, name)) EventDAL.createEvent(projectId, { name });
      }
    );
  }

  function planEventProperty(name: string, addValues: string[], hint: string | undefined): void {
    const id = `property:event:${name}`;
    if (plannedIds.has(id)) return;
    const existing = findPropertyByName(projectId, 'event', name);

    if (!existing) {
      addItem(
        {
          id,
          op: 'create',
          entity_type: 'property',
          entity_key: name,
          changes: [],
          default_selected: true,
          note: addValues.length
            ? `Create property "${name}" (string) with allowed value(s) ${addValues.join(', ')}.`
            : `Create property "${name}" (string).`,
        },
        () => {
          if (!findPropertyByName(projectId, 'event', name)) {
            PropertyDAL.createProperty(projectId, {
              scope: 'event',
              name,
              data_type: 'string',
              allowed_values_json: addValues.map((v) => ({ value: v, standard_event: hint ?? null })),
            });
          }
        }
      );
      return;
    }

    if (addValues.length === 0) return;
    const currentValues = new Set(((existing.allowed_values_json as { value: string }[]) ?? []).map((v) => v.value));
    const missing = addValues.filter((v) => !currentValues.has(v));
    if (missing.length === 0) return;
    const before = Array.from(currentValues);
    addItem(
      {
        id,
        op: 'update',
        entity_type: 'property',
        entity_key: name,
        changes: [{ field: 'allowed_values_json', before, after: [...before, ...missing] }],
        default_selected: true,
        note: `Add allowed value(s) ${missing.join(', ')} to property "${name}".`,
      },
      () => {
        const row = findPropertyByName(projectId, 'event', name);
        if (!row) return;
        const currentAllowed = (row.allowed_values_json as { value: string; standard_event?: string | null }[]) ?? [];
        const have = new Set(currentAllowed.map((v) => v.value));
        const toAdd = missing.filter((v) => !have.has(v));
        if (toAdd.length === 0) return;
        PropertyDAL.updateProperty(projectId, row.id, {
          allowed_values_json: [...currentAllowed, ...toAdd.map((v) => ({ value: v, standard_event: hint ?? null }))],
        });
      }
    );
  }

  function planCustomerProperty(stdKey: string, propName: string): void {
    const id = `property:customer:${propName}`;
    if (plannedIds.has(id)) return;
    const existing = findPropertyByName(projectId, 'customer', propName);

    if (!existing) {
      const knownStd = STANDARD_CUSTOMER_PROPERTIES.includes(stdKey);
      addItem(
        {
          id,
          op: 'create',
          entity_type: 'property',
          entity_key: propName,
          changes: [],
          default_selected: true,
          note: `Create customer property "${propName}"${knownStd ? ` (bloomreach_customer_property=${stdKey})` : ''}.`,
        },
        () => {
          if (!findPropertyByName(projectId, 'customer', propName)) {
            PropertyDAL.createProperty(projectId, {
              scope: 'customer',
              name: propName,
              data_type: 'string',
              bloomreach_customer_property: knownStd ? stdKey : null,
            });
          }
        }
      );
      return;
    }
    if (existing.bloomreach_customer_property === stdKey || !STANDARD_CUSTOMER_PROPERTIES.includes(stdKey)) return;
    addItem(
      {
        id,
        op: 'update',
        entity_type: 'property',
        entity_key: propName,
        changes: [{ field: 'bloomreach_customer_property', before: existing.bloomreach_customer_property, after: stdKey }],
        default_selected: true,
        note: `Set customer property "${propName}" standard mapping to "${stdKey}".`,
      },
      () => {
        const row = findPropertyByName(projectId, 'customer', propName);
        if (row && row.bloomreach_customer_property !== stdKey) {
          PropertyDAL.updateProperty(projectId, row.id, { bloomreach_customer_property: stdKey });
        }
      }
    );
  }

  function planConsent(stdKey: string, clientName: string): void {
    const id = `consent:${stdKey}`;
    if (plannedIds.has(id)) return;
    const existingByKey = ConsentCategoryDAL.listConsentCategories(projectId).find((c) => c.standard_key === stdKey);

    if (existingByKey) {
      if (existingByKey.name === clientName) return;
      addItem(
        {
          id,
          op: 'update',
          entity_type: 'consent_category',
          entity_key: stdKey,
          changes: [{ field: 'name', before: existingByKey.name, after: clientName }],
          default_selected: true,
          note: `Rename consent category "${existingByKey.name}" to "${clientName}" (${stdKey}).`,
        },
        () => {
          const row = ConsentCategoryDAL.listConsentCategories(projectId).find((c) => c.standard_key === stdKey);
          if (row && row.name !== clientName) ConsentCategoryDAL.updateConsentCategory(projectId, row.id, { name: clientName });
        }
      );
      return;
    }

    addItem(
      {
        id,
        op: 'create',
        entity_type: 'consent_category',
        entity_key: stdKey,
        changes: [],
        default_selected: true,
        note: `Create consent category "${clientName}" (${stdKey}).`,
      },
      () => {
        const already = ConsentCategoryDAL.listConsentCategories(projectId).find(
          (c) => c.standard_key === stdKey || c.name === clientName
        );
        if (!already) {
          ConsentCategoryDAL.createConsentCategory(projectId, { name: clientName, standard_key: stdKey });
        } else if (!already.standard_key) {
          ConsentCategoryDAL.updateConsentCategory(projectId, already.id, { standard_key: stdKey });
        }
      }
    );
  }

  function planVariant(eventName: string, filter: DataMappingModel['standardEvents'][number]['filter']): void {
    const conditions: VariantCondition[] = filter.map((c) => ({ property_id: c.property, operator: c.operator, values: c.values }));
    const identityNames: Record<string, string> = {};
    conditions.forEach((c) => {
      identityNames[c.property_id] = c.property_id;
    });
    const displayName = generateVariantName(eventName, conditions, identityNames);
    const id = `variant:${displayName}`;
    if (plannedIds.has(id)) return;

    const existingEvent = findEventByName(projectId, eventName);
    if (existingEvent && findMatchingVariant(projectId, existingEvent.id, filter)) return;

    addItem(
      { id, op: 'create', entity_type: 'variant', entity_key: displayName, changes: [], default_selected: true, note: `Create variant "${displayName}".` },
      () => {
        const event = findEventByName(projectId, eventName);
        if (!event) return;
        if (findMatchingVariant(projectId, event.id, filter)) return;
        const createConditions: VariantCondition[] = [];
        for (const cond of filter) {
          const prop = findPropertyByName(projectId, 'event', cond.property);
          if (!prop) return; // dependency (its own property step) was not selected/applied; skip quietly
          ensureLinked(projectId, event.id, prop.id, 'discriminator');
          createConditions.push({ property_id: prop.id, operator: cond.operator, values: cond.values });
        }
        try {
          VariantDAL.createVariant(projectId, event.id, { conditions: createConditions });
        } catch (err) {
          if (err instanceof ConflictError) return;
          throw err;
        }
      }
    );
  }

  function planStandardEventMapping(se: DataMappingStandardEvent, eventName: string): void {
    const id = `standard_event_mapping:${se.key}`;
    if (plannedIds.has(id)) return;

    const existing = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, se.key);
    const fieldEntries = Object.entries(se.fieldMap);
    const fieldSummary = fieldEntries.length
      ? ` (field map: ${fieldEntries.map(([f, p]) => `${f}=${p ?? '—'}`).join(', ')})`
      : '';
    const target =
      se.filter.length > 0
        ? generateVariantName(
            eventName,
            se.filter.map((c) => ({ property_id: c.property, operator: c.operator, values: c.values })),
            Object.fromEntries(se.filter.map((c) => [c.property, c.property]))
          )
        : eventName;

    const desiredChanged = (): boolean => {
      if (!existing) return true;
      const currentEvent = EventDAL.getEventById(projectId, existing.event_id);
      if (!currentEvent || currentEvent.name !== eventName) return true;
      const currentVariant = existing.variant_id ? VariantDAL.getVariantByIdInProject(projectId, existing.variant_id) : null;
      const wantVariant = se.filter.length > 0;
      if (wantVariant !== Boolean(currentVariant)) return true;
      const currentFieldNames = Object.fromEntries(
        Object.entries(existing.field_map_json).map(([field, propId]) => [
          field,
          propId ? PropertyDAL.getPropertyById(projectId, propId)?.name ?? propId : null,
        ])
      );
      return !fieldMapsEqual(currentFieldNames, se.fieldMap);
    };

    if (!desiredChanged()) return;

    addItem(
      {
        id,
        op: existing ? 'update' : 'create',
        entity_type: 'standard_event_mapping',
        entity_key: se.key,
        changes: [],
        default_selected: true,
        note: `Map "${se.key}" -> ${target}${fieldSummary}.`,
      },
      () => {
        const event = findEventByName(projectId, eventName);
        if (!event) return;

        const fieldMapIds: Record<string, string | null> = {};
        for (const [field, propName] of Object.entries(se.fieldMap)) {
          if (!propName) {
            fieldMapIds[field] = null;
            continue;
          }
          const prop = findPropertyByName(projectId, 'event', propName);
          if (!prop) {
            fieldMapIds[field] = null;
            continue;
          }
          ensureLinked(projectId, event.id, prop.id, 'normal');
          fieldMapIds[field] = prop.id;
        }

        const variant = se.filter.length > 0 ? findMatchingVariant(projectId, event.id, se.filter) : null;

        StandardEventMappingDAL.upsertStandardEventMapping(projectId, se.key, {
          event_id: event.id,
          variant_id: variant?.id ?? null,
          field_map_json: fieldMapIds,
        });
      }
    );
  }

  function planStandardEventAddition(se: DataMappingStandardEvent, additions: StandardEventSeed[]): void {
    const id = `project_addition:standard_event:${se.key}`;
    if (plannedIds.has(id)) return;
    const fields = Object.keys(se.fieldMap);
    if (fields.length === 0) return; // nothing to record as a field list
    addItem(
      {
        id,
        op: 'create',
        entity_type: 'project_addition',
        entity_key: se.key,
        changes: [],
        default_selected: true,
        note: `Add "${se.key}" as a project standard event addition (D-26): not a known standard event.`,
      },
      () => {
        const proj = ProjectDAL.getProjectOrThrow(projectId);
        const current = (proj.standard_event_additions_json as StandardEventSeed[] | null) ?? [];
        if (current.some((a) => a.key === se.key)) return;
        try {
          ProjectDAL.updateProject(projectId, {
            standard_event_additions_json: [...current, { key: se.key, fields }],
          });
        } catch (err) {
          if (err instanceof BadRequestError) return; // already added by a concurrent step
          throw err;
        }
      }
    );
    void additions;
  }

  function planConsentKeyAddition(stdKey: string, additions: string[]): void {
    const id = `project_addition:consent_key:${stdKey}`;
    if (plannedIds.has(id)) return;
    addItem(
      {
        id,
        op: 'create',
        entity_type: 'project_addition',
        entity_key: stdKey,
        changes: [],
        default_selected: true,
        note: `Add "${stdKey}" as a project consent key addition (D-26): not a known standard consent key.`,
      },
      () => {
        const proj = ProjectDAL.getProjectOrThrow(projectId);
        const current = (proj.consent_key_additions_json as string[] | null) ?? [];
        if (current.includes(stdKey)) return;
        ProjectDAL.updateProject(projectId, { consent_key_additions_json: [...current, stdKey] });
      }
    );
    void additions;
  }

  function planCatalogMeta(): void {
    const existingMeta = (project.bloomreach_mapping_meta_json ?? null) as
      | { _id: string | null; catalogs: unknown; custom_events: unknown[] }
      | null;
    const desiredMeta = { _id: model.id, catalogs: model.catalogsRaw, custom_events: model.customEvents };
    if (JSON.stringify(existingMeta) !== JSON.stringify(desiredMeta)) {
      const id = 'project:bloomreach_mapping_meta';
      addItem(
        {
          id,
          op: existingMeta ? 'update' : 'create',
          entity_type: 'project',
          entity_key: 'bloomreach_mapping_meta_json',
          changes: [{ field: 'bloomreach_mapping_meta_json', before: existingMeta, after: desiredMeta }],
          default_selected: true,
          note: 'Store catalogs, _id and custom_events for round-trip export.',
        },
        () => {
          ProjectDAL.updateProject(projectId, { bloomreach_mapping_meta_json: desiredMeta });
        }
      );
    }

    // "empty catalog block" warning (PLAN "Data mapping" contract, T-1-08 acceptance): the pasted
    // mapping names no main/variant catalog. Always surfaced when both are null — not only when
    // the project already has a Catalog row — since the point is to prompt the user to either map
    // a catalog or confirm this client genuinely has none; T-1-09's `unmapped_catalog` finding
    // (definition-vs-mapping) is the one that additionally requires an existing Catalog.
    if (model.catalogs.main === null && model.catalogs.variant === null) {
      warnings.push('catalogs.main and catalogs.variant are both empty ("empty catalog block").');
    }
  }
}

export function previewDataMapping(projectId: string, rawJson: unknown): DataMappingPreviewResult {
  const model = parseDataMapping(rawJson);
  const { items, warnings } = buildPlan(projectId, model);
  return { items, warnings, payload_hash: payloadHash(rawJson) };
}

export function applyDataMapping(
  projectId: string,
  rawJson: unknown,
  expectedHash: string,
  selectedItemIds: string[]
): DataMappingApplySummary {
  if (payloadHash(rawJson) !== expectedHash) {
    throw new PayloadChangedError('The payload changed since preview; re-run preview before applying.');
  }
  const model = parseDataMapping(rawJson);
  const selected = new Set(selectedItemIds);
  const applied: string[] = [];
  const skipped: string[] = [];

  const db = getDb();
  const run = db.transaction(() => {
    const { items, steps } = buildPlan(projectId, model);
    for (const item of items) {
      if (selected.has(item.id)) {
        applied.push(item.id);
      } else {
        skipped.push(item.id);
      }
    }
    for (const step of steps) {
      if (selected.has(step.id)) step.run();
    }
  });
  run();

  const finalPlan = buildPlan(projectId, model);
  return { applied, skipped, warnings: finalPlan.warnings };
}
