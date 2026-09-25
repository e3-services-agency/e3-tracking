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
import * as RuleDAL from '../dal/rule.dal';
import { parseDataMapping, type DataMappingModel, type DataMappingStandardEvent } from '../../domain/import/dataMapping';
import { payloadHash } from '../../domain/diff/hash';
import { diffValue } from '../../domain/diff/primitives';
import type { DiffItem, DiffItemChange } from '../../domain/diff/types';
import { isKnownStandardEvent, isKnownConsentKey, STANDARD_CUSTOMER_PROPERTIES, type StandardEventSeed } from '../../domain/bloomreach';
import { generateVariantName, type VariantCondition } from '../../domain/variants';
import { BadRequestError, ConflictError, PayloadChangedError } from '../errors';
import {
  findEventByName,
  findPropertyByName,
  ensureLinked,
  findMatchingVariant,
  canonicalizeFilter,
} from './bloomreachImportHelpers';

/** Compares two `field -> property name|null` maps by content, independent of key order. */
function fieldMapsEqual(a: Record<string, string | null>, b: Record<string, string | null>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

interface PlanStep {
  id: string;
  /**
   * Returning `false` (second fix round ERROR A) means the step could not actually do its write —
   * e.g. a standard event mapping with a non-empty filter whose variant did not resolve even
   * though the dependency graph considered the step runnable — and `apply` must report the item as
   * skipped (with a warning already pushed to `warnings`) instead of applied. Returning `void`
   * (the common case) means the step ran to completion; it may still have been a no-op (idempotent
   * re-run) but that is not "skipped" from the caller's point of view.
   */
  run: () => void | boolean;
  /** Ids of other plan steps this step needs to have actually run first (fix round WARNING 6): an
   *  unselected or unmet dependency makes this step's own selection a no-op — it is reported as
   *  skipped instead of silently writing a partial/inconsistent record (e.g. a mapping with
   *  `variant_id: null` because its variant's own create step never ran). Only ids present in
   *  `plannedIds` are meaningful; an id naming something that already existed (no step proposed)
   *  is never a blocking dependency. */
  dependsOn?: string[];
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
  // second fix round WARNING C/LOW E: `eventName.propName` pairs whose promotion to discriminator
  // would exceed the D-03 rule 3 two-discriminator-per-event limit. Populated by `planRolePromotion`
  // (Phase 3.5) and consulted by Phase 5 so the variant and standard event mapping that need that
  // property are never proposed (not just quietly skipped at apply) once the conflict is known.
  const blockedPromotions = new Set<string>();

  function addItem(item: DiffItem, run: () => void | boolean, dependsOn?: string[]): void {
    if (plannedIds.has(item.id)) return;
    plannedIds.add(item.id);
    items.push(item);
    steps.push({ id: item.id, run, dependsOn: dependsOn?.length ? dependsOn : undefined });
  }

  /** `id` only if it names a step actually proposed this run (i.e. a real dependency); otherwise omitted. */
  function depIf(id: string): string | null {
    return plannedIds.has(id) ? id : null;
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

  // ---- Phase 3.5: promote a filter attribute already linked with role "normal" to "discriminator"
  // (fix round ERROR 5): a project whose events were defined before the mapping was pasted (the
  // normal intake order) already has the property attached, just with the wrong role; without this
  // step the variant-creation step below fails with CONDITION_NOT_DISCRIMINATOR. ----
  for (const se of mappedEvents) {
    for (const cond of se.filter) {
      planRolePromotion(se.eventType as string, cond.property);
    }
  }

  // ---- Phase 4: project additions for unknown standard event / consent keys (D-26: never
  // rejected), run before Phase 5/7 which upsert against those keys (fix round ERROR 1: D-26
  // says an unknown key is never rejected, but the DAL validates standard_event/standard_key
  // against seed + project additions, so the addition must exist before anything upserts against
  // it — and every unknown standard event gets an addition, even one with no field keys). ----
  for (const se of model.standardEvents) {
    if (!isKnownStandardEvent(se.key, standardAdditions)) planStandardEventAddition(se, standardAdditions);
  }
  for (const [stdKey, clientName] of Object.entries(model.consents)) {
    if (clientName && !isKnownConsentKey(stdKey, consentAdditions)) planConsentKeyAddition(stdKey, consentAdditions);
  }

  // ---- Phase 5: variants + standard event mappings ----
  for (const se of mappedEvents) {
    const eventName = se.eventType as string;
    // second fix round WARNING C/LOW E: a filter property Phase 3.5 could not promote (already two
    // discriminators on the event) blocks both the variant and the mapping for this standard event
    // — proposing either would either write nothing useful or fail apply with an uncaught 400.
    if (se.filter.some((cond) => blockedPromotions.has(`${eventName}.${cond.property}`))) continue;
    if (se.filter.length > 0) planVariant(eventName, se.filter);
    planStandardEventMapping(se, eventName);
  }

  // ---- Phase 6: customer properties ----
  for (const [stdKey, propName] of Object.entries(model.customerProperties)) {
    if (propName) planCustomerProperty(stdKey, propName);
  }

  // ---- Phase 7: consents ----
  for (const [stdKey, clientName] of Object.entries(model.consents)) {
    if (clientName) planConsent(stdKey, clientName);
  }

  // ---- Phase 8: catalogs / _id / custom_events round trip + empty-catalog-block warning ----
  planCatalogMeta();

  // ---- Phase 9: propose the purchase_items_total rounding_drift rule template (D-31, T-2-07):
  // when both "purchase" and "purchase_item" standard events are mapped (so both events' relevant
  // properties can resolve), propose creating the rule, selected by default. `run()` re-checks
  // applicability and an already-existing rule (by `template_key`) so a re-import is idempotent,
  // the same pattern as every other step in this plan. ----
  planPurchaseItemsTotalRule();

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
    const additionDeps = [depIf(`project_addition:consent_key:${stdKey}`)].filter((d): d is string => d !== null);

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
        },
        additionDeps
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
      },
      additionDeps
    );
  }

  /**
   * A filter attribute already attached to the event with role "normal" (fix round ERROR 5): the
   * normal Bloomreach intake order defines events first, then pastes the mapping, so this is the
   * common case, not an edge case. `ensureLinked` (used by variant/mapping creation) only attaches
   * a property that is not linked at all — it never changes an existing link's role — so without
   * an explicit promotion step a pre-linked "normal" property can never become a discriminator and
   * variant creation always fails with CONDITION_NOT_DISCRIMINATOR.
   */
  function planRolePromotion(eventName: string, propName: string): void {
    const id = `event_property:${eventName}.${propName}:role`;
    if (plannedIds.has(id)) return;
    const event = findEventByName(projectId, eventName);
    const prop = findPropertyByName(projectId, 'event', propName);
    if (!event || !prop) return; // event/property itself is being created this run; ensureLinked attaches it fresh as "discriminator"
    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    const link = properties.find((p) => p.property_id === prop.id);
    if (!link || link.role !== 'normal') return; // not linked yet, or already discriminator/context

    // second fix round LOW E: detect at *plan* time (so it shows in preview, not just as an apply
    // failure) that promoting this property would exceed the D-03 rule 3 two-discriminator-per-event
    // limit. Counts the event's current discriminators plus any other promotion already planned for
    // this event in this same run (two filter properties on one event, both currently "normal").
    const currentDiscriminatorIds = new Set(properties.filter((p) => p.role === 'discriminator').map((p) => p.property_id));
    const plannedForEvent = Array.from(plannedIds).filter(
      (pid) => pid.startsWith(`event_property:${eventName}.`) && pid.endsWith(':role')
    ).length;
    if (currentDiscriminatorIds.size + plannedForEvent + 1 > 2) {
      blockedPromotions.add(`${eventName}.${propName}`);
      warnings.push(
        `Cannot promote property "${propName}" on event "${eventName}" to discriminator: it already has 2 discriminator properties (D-03 rule 3). The variant and standard event mapping that need it were not proposed.`
      );
      return;
    }

    // second fix round WARNING C: this step must be a dependency of the variant it exists for
    // (`property:event:${propName}` is a *separate* dependency the variant/mapping steps already
    // list), so the promotion depends on the property itself actually existing/being applied.
    const dependsOn = [depIf(`property:event:${propName}`)].filter((d): d is string => d !== null);

    addItem(
      {
        id,
        op: 'update',
        entity_type: 'event_property',
        entity_key: `${eventName}.${propName}`,
        changes: [{ field: 'role', before: 'normal', after: 'discriminator' }],
        default_selected: true,
        note: `Promote property "${propName}" on event "${eventName}" from role "normal" to "discriminator" (used as a variant filter).`,
      },
      () => {
        const ev = findEventByName(projectId, eventName);
        const p = findPropertyByName(projectId, 'event', propName);
        if (!ev || !p) return false;
        const { properties: current } = EventDAL.getEventWithProperties(projectId, ev.id);
        const l = current.find((x) => x.property_id === p.id);
        if (!l || l.role !== 'normal') return; // already discriminator (idempotent re-run), not a failure
        try {
          EventDAL.updateEventProperty(projectId, ev.id, p.id, { role: 'discriminator' });
        } catch (err) {
          // second fix round WARNING C: never swallow this — a failure here (e.g. the allowed value
          // this property needs was never applied because its own property step was deselected)
          // means the variant depending on it cannot be correct either, so it must abort the whole
          // apply with a clear 400 naming the item, not silently report success while writing
          // nothing.
          if (err instanceof BadRequestError) {
            throw new BadRequestError(
              `Could not promote property "${propName}" on event "${eventName}" to discriminator: ${err.message}`,
              err.field
            );
          }
          throw err;
        }
      },
      dependsOn
    );
  }

  function planVariant(eventName: string, rawFilter: DataMappingModel['standardEvents'][number]['filter']): void {
    // second fix round ERROR A/WARNING B: canonicalize the parsed filter the same way the DAL
    // canonicalizes a variant's stored conditions (normalizeConditions/buildConditionsKey) *before*
    // naming or matching. Otherwise a re-paste with `equals` changed to a one-value `in`, or an
    // `in` filter with operands in a different order than the stored, sorted order, names/compares
    // as a different filter than the one already applied and proposes a duplicate variant.
    const filter = canonicalizeFilter(rawFilter);
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

    const dependsOn = [
      depIf(`event:${eventName}`),
      ...filter.map((c) => depIf(`property:event:${c.property}`)),
      ...filter.map((c) => depIf(`event_property:${eventName}.${c.property}:role`)),
    ].filter((d): d is string => d !== null);

    addItem(
      { id, op: 'create', entity_type: 'variant', entity_key: displayName, changes: [], default_selected: true, note: `Create variant "${displayName}".` },
      () => {
        const event = findEventByName(projectId, eventName);
        if (!event) return false;
        if (findMatchingVariant(projectId, event.id, filter)) return; // already resolvable; nothing to create
        const createConditions: VariantCondition[] = [];
        for (const cond of filter) {
          const prop = findPropertyByName(projectId, 'event', cond.property);
          if (!prop) return false; // dependency (its own property step) was not selected/applied
          ensureLinked(projectId, event.id, prop.id, 'discriminator');
          createConditions.push({ property_id: prop.id, operator: cond.operator, values: cond.values });
        }
        try {
          VariantDAL.createVariant(projectId, event.id, { conditions: createConditions });
        } catch (err) {
          if (err instanceof ConflictError) {
            // second fix round ERROR A: never swallow this silently. A conditions_key clash means a
            // variant with these exact (canonical) conditions already exists — use it — but only if
            // it actually resolves; otherwise surface it instead of letting a dependent mapping step
            // write `variant_id: null`.
            if (findMatchingVariant(projectId, event.id, filter)) return;
            warnings.push(
              `Variant "${displayName}" already exists by name/conditions but could not be resolved after a conflict; check for a duplicate variant on event "${eventName}".`
            );
            return false;
          }
          throw err;
        }
      },
      dependsOn
    );
  }

  function planStandardEventMapping(se: DataMappingStandardEvent, eventName: string): void {
    const id = `standard_event_mapping:${se.key}`;
    if (plannedIds.has(id)) return;

    // second fix round ERROR A/WARNING B: canonicalize before naming/matching, same as planVariant
    // — this is the filter that `planVariant` for this same `se` planned/matched against, so the
    // two must agree on what "the" variant is called.
    const filter = canonicalizeFilter(se.filter);

    const existing = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, se.key);
    const fieldEntries = Object.entries(se.fieldMap);
    const fieldSummary = fieldEntries.length
      ? ` (field map: ${fieldEntries.map(([f, p]) => `${f}=${p ?? '—'}`).join(', ')})`
      : '';
    const target =
      filter.length > 0
        ? generateVariantName(
            eventName,
            filter.map((c) => ({ property_id: c.property, operator: c.operator, values: c.values })),
            Object.fromEntries(filter.map((c) => [c.property, c.property]))
          )
        : eventName;
    const variantItemId = filter.length > 0 ? `variant:${target}` : null;

    const currentEvent = existing ? EventDAL.getEventById(projectId, existing.event_id) : null;
    const currentVariant =
      existing?.variant_id ? VariantDAL.getVariantByIdInProject(projectId, existing.variant_id) : null;

    // Resolve the variant this mapping *should* point at right now, by name (fix round ERROR 2): a
    // re-import with a changed filter value must repoint an already-mapped standard event at the
    // new/created variant, not just notice "still has a variant" and stop looking. When the
    // desired variant does not exist yet, `desiredVariantLabel` still equals its deterministic
    // generated name (`target`), so the comparison below still detects the change; the real lookup
    // happens again in `run()` once the variant has actually been created.
    const desiredVariantLabel = filter.length > 0 ? target : null;

    // fix round WARNING 7: use the diff primitives so `changes` carries real field-level
    // before/after pairs the UI can render, instead of an empty array with only the note as prose.
    const changes: DiffItemChange[] = [];
    if (existing) {
      const eventDiff = diffValue('standard_event_mapping', se.key, 'event', currentEvent?.name ?? null, eventName);
      if (eventDiff) changes.push({ field: 'event', before: eventDiff.before, after: eventDiff.after });

      const variantDiff = diffValue(
        'standard_event_mapping',
        se.key,
        'variant',
        currentVariant?.name ?? null,
        desiredVariantLabel
      );
      if (variantDiff) changes.push({ field: 'variant', before: variantDiff.before, after: variantDiff.after });

      const currentFieldNames = Object.fromEntries(
        Object.entries(existing.field_map_json).map(([field, propId]) => [
          field,
          propId ? PropertyDAL.getPropertyById(projectId, propId)?.name ?? propId : null,
        ])
      );
      const fieldDiff = diffValue('standard_event_mapping', se.key, 'field_map_json', currentFieldNames, se.fieldMap);
      if (fieldDiff) changes.push({ field: 'field_map_json', before: fieldDiff.before, after: fieldDiff.after });
    }

    if (existing && changes.length === 0) return;

    const dependsOn = [
      depIf(`event:${eventName}`),
      variantItemId ? depIf(variantItemId) : null,
      ...Object.values(se.fieldMap).map((propName) => (propName ? depIf(`property:event:${propName}`) : null)),
      depIf(`project_addition:standard_event:${se.key}`),
    ].filter((d): d is string => d !== null);

    addItem(
      {
        id,
        op: existing ? 'update' : 'create',
        entity_type: 'standard_event_mapping',
        entity_key: se.key,
        changes,
        default_selected: true,
        note: `Map "${se.key}" -> ${target}${fieldSummary}.`,
      },
      () => {
        const event = findEventByName(projectId, eventName);
        if (!event) return false;

        // second fix round ERROR A: a mapping with a non-empty filter must never be written with
        // `variant_id: null` — if the variant this mapping needs cannot be resolved (its create
        // step was not selected/applied, or a name/conditions clash left it unresolvable), skip the
        // whole mapping write and report it as skipped with a warning instead of silently detaching
        // it to "the whole event".
        const variant = filter.length > 0 ? findMatchingVariant(projectId, event.id, filter) : null;
        if (filter.length > 0 && !variant) {
          warnings.push(
            `Skipped mapping "${se.key}": its variant "${target}" could not be resolved; re-run preview and select the variant's create step.`
          );
          return false;
        }

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

        const previousVariantId = existing?.variant_id ?? null;

        StandardEventMappingDAL.upsertStandardEventMapping(projectId, se.key, {
          event_id: event.id,
          variant_id: variant?.id ?? null,
          field_map_json: fieldMapIds,
        });

        // fix round ERROR 2: the old variant is left in place (imports are additive, D-04), but a
        // variant no longer referenced by any mapping after this repoint is worth flagging.
        const newVariantId = variant?.id ?? null;
        if (previousVariantId && previousVariantId !== newVariantId) {
          const stillUsed = StandardEventMappingDAL.listStandardEventMappings(projectId).some(
            (m) => m.variant_id === previousVariantId
          );
          if (!stillUsed) {
            const oldVariant = VariantDAL.getVariantByIdInProject(projectId, previousVariantId);
            warnings.push(
              `Variant "${oldVariant?.name ?? previousVariantId}" is no longer mapped by any standard event mapping.`
            );
          }
        }
      },
      dependsOn
    );
  }

  function planStandardEventAddition(se: DataMappingStandardEvent, additions: StandardEventSeed[]): void {
    const id = `project_addition:standard_event:${se.key}`;
    if (plannedIds.has(id)) return;
    // fix round ERROR 1: an unknown standard event with no field keys (e.g. only an `event` block,
    // no other fields in the object) still gets an addition — D-26 says the key is added, not
    // "added only if it has fields" — so it can be applied at all; `fields` may legitimately be [].
    const fields = Object.keys(se.fieldMap);
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

  /**
   * T-2-07/D-31: `computeRoundingDrift` (the old hard-coded comparison-3 check) is gone; a mapping
   * that maps both "purchase" and "purchase_item" now proposes instantiating the
   * `purchase_items_total` rule template instead, so the resulting rounding_drift finding comes
   * from a real, editable/disableable `Rule` row rather than an unconditional engine check. Only
   * proposed when the mapping names both standard events (this is a *mapping-level* signal, not a
   * check of the current DB state — the events/properties this needs may not exist yet and get
   * created earlier in this same plan); the actual applicability/idempotence check (does the rule
   * already exist, do the resolved properties actually satisfy the template) happens in `run()`,
   * once every earlier phase has actually written.
   */
  function planPurchaseItemsTotalRule(): void {
    const id = 'rule:purchase_items_total';
    if (plannedIds.has(id)) return;
    const purchaseSe = mappedEvents.find((se) => se.key === 'purchase');
    const itemSe = mappedEvents.find((se) => se.key === 'purchase_item');
    if (!purchaseSe || !itemSe) return;
    const purchaseEventName = purchaseSe.eventType as string;
    const itemEventName = itemSe.eventType as string;

    // Idempotence at *preview* time (fix round pattern shared with every other planXxx here, e.g.
    // planEvent's `findEventByName` check): if the purchase event already exists and already has a
    // rule from this template, this whole item must not be proposed again — otherwise every
    // re-preview after a full apply would keep showing a "create" item that `run()` alone would
    // silently no-op, breaking "apply idempotence" (an already-applied import proposes nothing).
    const existingPurchaseEvent = findEventByName(projectId, purchaseEventName);
    if (existingPurchaseEvent) {
      const existingRules = RuleDAL.listRulesByEvent(projectId, existingPurchaseEvent.id);
      if (existingRules.some((r) => r.template_key === 'purchase_items_total')) return;
    }

    const dependsOn = [
      depIf(`event:${purchaseEventName}`),
      depIf(`event:${itemEventName}`),
      depIf(`standard_event_mapping:${purchaseSe.key}`),
      depIf(`standard_event_mapping:${itemSe.key}`),
    ].filter((d): d is string => d !== null);

    addItem(
      {
        id,
        op: 'create',
        entity_type: 'rule',
        entity_key: 'purchase_items_total',
        changes: [],
        default_selected: true,
        note: `Apply the "Purchase total matches its items" rule template (rounding_drift, D-31) to "${purchaseEventName}", joined against "${itemEventName}" on purchase_id.`,
      },
      () => {
        const purchaseEvent = findEventByName(projectId, purchaseEventName);
        const itemEvent = findEventByName(projectId, itemEventName);
        if (!purchaseEvent || !itemEvent) return false;

        // Idempotent re-run (fix round pattern shared with every other step here): a rule this
        // template already created (tracked by `template_key`) is left alone, never duplicated.
        const existingRules = RuleDAL.listRulesByEvent(projectId, purchaseEvent.id);
        if (existingRules.some((r) => r.template_key === 'purchase_items_total')) return;

        const templates = RuleDAL.listRuleTemplates(projectId, purchaseEvent.id);
        const applicable = templates.find((t) => t.key === 'purchase_items_total')?.applicable ?? false;
        if (!applicable) {
          warnings.push(
            `Could not create the "Purchase total matches its items" rule: "${purchaseEventName}"/"${itemEventName}" total_price/purchase_id properties are not fully resolved yet; re-run preview once they are.`
          );
          return false;
        }
        RuleDAL.createRulesFromTemplate(projectId, purchaseEvent.id, 'purchase_items_total');
      },
      dependsOn
    );
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
  const runtimeWarnings: string[] = [];
  const run = db.transaction(() => {
    const { items, steps, warnings: planWarnings } = buildPlan(projectId, model);
    const stepById = new Map(steps.map((s) => [s.id, s]));

    // fix round WARNING 6: a step only actually runs when it is selected *and* every plan step it
    // depends on (its `dependsOn`, e.g. the property/variant a mapping needs) is also selected and
    // itself runnable — otherwise it is reported as skipped, with a reason, instead of writing a
    // partial/inconsistent record (a mapping upserted with `variant_id: null` because its variant
    // step never ran, or a variant silently created with 0 conditions).
    const runnable = new Map<string, boolean>();
    function canRun(id: string): boolean {
      if (runnable.has(id)) return runnable.get(id) as boolean;
      const step = stepById.get(id);
      if (!step || !selected.has(id)) {
        runnable.set(id, false);
        return false;
      }
      runnable.set(id, true); // provisional, guards against a cycle; overwritten below if a dep fails
      let ok = true;
      for (const dep of step.dependsOn ?? []) {
        if (!stepById.has(dep)) continue; // not something this run proposes; already satisfied
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
      // second fix round ERROR A: a step can be structurally "runnable" (selected, dependencies
      // met) yet still be unable to actually write (e.g. a mapping whose variant did not resolve
      // for a reason the dependency graph does not model, such as a `ConflictError` that itself
      // failed to resolve). `run()` returning `false` reclassifies it from applied to skipped
      // instead of leaving it reported as applied while nothing was written.
      if (result === false) {
        const idx = applied.indexOf(step.id);
        if (idx !== -1) applied.splice(idx, 1);
        if (!skipped.includes(step.id)) skipped.push(step.id);
      }
    }
    runtimeWarnings.push(...planWarnings);
  });
  run();

  const finalPlan = buildPlan(projectId, model);
  const warnings = Array.from(new Set([...finalPlan.warnings, ...runtimeWarnings]));
  return { applied, skipped, warnings };
}
