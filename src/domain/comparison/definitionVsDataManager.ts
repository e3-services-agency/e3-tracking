/**
 * Comparison 4: definition vs Data Manager (T-2-04, PLAN "Comparison engine design" > "Comparison
 * 4", D-28, D-37). Pure function, no DB or Express import (domain-model skill):
 * `src/backend/services/comparison.service.ts` builds a `DataManagerDefinitionSnapshot` from the
 * current `Event`/`Property` definitions and a `DataManagerEvidence` from the project's stored
 * `data_manager_events_json`/`data_manager_customers_json` snapshots (parsed with the same
 * `src/domain/import/dataManagerEvents.ts`/`dataManagerCustomers.ts` parsers the import planners
 * use, D-22) and calls `runDefinitionVsDataManager`.
 *
 * D-29 (custom events only): checks that touch events only look at `class === 'custom'` events;
 * `sdk`/`platform` events never produce findings here, matching comparisons 2/3.
 *
 * Severities: the T-2-04 task text is explicit and supersedes the plan table's "info" for
 * `unexpected_property` — `type_mismatch` is `error`; `unmapped_property`, `missing_event` and
 * `unexpected_property` are all `warning` (D-21 "one severity per kind" is a per-comparison
 * choice, not a cross-comparison constant: comparison 3 uses `info` for its own
 * `unexpected_property`/`unexpected_event`, comparison 4 uses `warning` for all its non-type
 * findings, since a Data Manager property the app definition never linked, or an app event/property
 * Data Manager does not (yet) hold, is stronger evidence than an unexpectedly-observed payload key).
 *
 * No findings at all when a snapshot is absent: `dataManager.events === null` skips every
 * event-scope check (`type_mismatch`/`unmapped_property`/`unexpected_property` on events,
 * `missing_event`); `dataManager.customers === null` skips every customer-scope check
 * (`data_manager_customers_json` can be absent even after an events import, T-2-02's documented
 * "no customers evidence yet" case) — a project that has never gone through either Data Manager
 * import produces zero comparison-4 findings, not a false "everything is missing".
 */
import { toDataManagerType } from '../bloomreach/dataManagerTypes';
import type { DataManagerEventsModel } from '../import/dataManagerEvents';
import type { DataManagerCustomersModel } from '../import/dataManagerCustomers';
import type { ComparisonId, EventClass } from '../enums';
import type { EngineFinding } from './definitionVsObservations';

export interface DmDefEventProperty {
  property_id: string;
  name: string;
  data_type: string;
  data_formats: string[];
}

export interface DmDefEvent {
  id: string;
  name: string;
  status: string;
  /** D-29: only `custom` events are validated by this comparison. */
  class: EventClass;
  properties: DmDefEventProperty[];
}

export interface DmDefCustomerProperty {
  property_id: string;
  name: string;
  data_type: string;
  data_formats: string[];
}

export interface DataManagerDefinitionSnapshot {
  events: DmDefEvent[];
  customer_properties: DmDefCustomerProperty[];
}

/** The project's two stored Data Manager snapshots, parsed; either may be absent (see module comment). */
export interface DataManagerEvidence {
  events: DataManagerEventsModel | null;
  customers: DataManagerCustomersModel | null;
}

const COMPARISON: ComparisonId = 'data_manager';

function fp(kind: EngineFinding['kind'], eventId: string | null, propertyId: string | null, detail: string): string {
  return [COMPARISON, kind, eventId ?? '', '', propertyId ?? '', detail].join('|');
}

/** Reverse-mapped Data Manager type string for a definition property (D-37, shared with the import planners). */
function defDmType(prop: { data_type: string; data_formats: string[] }): string {
  return toDataManagerType(prop.data_type, prop.data_formats).type;
}

export function runDefinitionVsDataManager(
  definition: DataManagerDefinitionSnapshot,
  dataManager: DataManagerEvidence
): EngineFinding[] {
  const findings: EngineFinding[] = [];

  // ---- Event-scope checks (only when an events snapshot is stored) ----
  if (dataManager.events) {
    const dmEventByType = new Map(dataManager.events.events.map((e) => [e.type, e]));
    const customEvents = definition.events.filter((e) => e.class === 'custom');

    for (const event of customEvents) {
      const dmEvent = dmEventByType.get(event.name);

      // missing_event: a defined custom event (not ignored) absent from the Data Manager events snapshot.
      if (!dmEvent) {
        if (event.status !== 'ignored') {
          findings.push({
            comparison: COMPARISON,
            kind: 'missing_event',
            severity: 'warning',
            event_id: event.id,
            variant_id: null,
            property_id: null,
            observation_id: null,
            expected_json: { event: event.name },
            actual_json: null,
            message: `Event "${event.name}" is defined in the app but absent from the Data Manager events snapshot.`,
            fingerprint: fp('missing_event', event.id, null, 'missing'),
          });
        }
        continue;
      }

      const dmPropByName = new Map(dmEvent.properties.map((p) => [p.property, p]));

      // type_mismatch: the Data Manager type for a linked property differs from the reverse-mapped
      // definition type, compared per event occurrence (so the same property name can mismatch on
      // one event and not another, e.g. cart_update.total_price vs purchase.total_price).
      for (const prop of event.properties) {
        const dmProp = dmPropByName.get(prop.name);
        if (!dmProp) continue; // handled by unmapped_property below
        const expectedDm = defDmType(prop);
        if (dmProp.type === expectedDm) continue;
        findings.push({
          comparison: COMPARISON,
          kind: 'type_mismatch',
          severity: 'error',
          event_id: event.id,
          variant_id: null,
          property_id: prop.property_id,
          observation_id: null,
          expected_json: { data_manager_type: expectedDm },
          actual_json: { data_manager_type: dmProp.type },
          message: `Property "${prop.name}" on event "${event.name}" is Data Manager type "${dmProp.type}", expected "${expectedDm}" (app data type "${prop.data_type}").`,
          fingerprint: fp('type_mismatch', event.id, prop.property_id, dmProp.type),
        });
      }

      // unmapped_property: a definition property linked to this event that Data Manager does not hold.
      for (const prop of event.properties) {
        if (dmPropByName.has(prop.name)) continue;
        findings.push({
          comparison: COMPARISON,
          kind: 'unmapped_property',
          severity: 'warning',
          event_id: event.id,
          variant_id: null,
          property_id: prop.property_id,
          observation_id: null,
          expected_json: { property: prop.name },
          actual_json: null,
          message: `Property "${prop.name}" on event "${event.name}" is defined in the app but Data Manager does not hold it.`,
          fingerprint: fp('unmapped_property', event.id, prop.property_id, 'missing'),
        });
      }

      // unexpected_property: a Data Manager property on this event that the definition does not link.
      const defPropByName = new Set(event.properties.map((p) => p.name));
      for (const dmProp of dmEvent.properties) {
        if (defPropByName.has(dmProp.property)) continue;
        findings.push({
          comparison: COMPARISON,
          kind: 'unexpected_property',
          severity: 'warning',
          event_id: event.id,
          variant_id: null,
          property_id: null,
          observation_id: null,
          expected_json: null,
          actual_json: { property: dmProp.property, data_manager_type: dmProp.type },
          message: `Data Manager property "${dmProp.property}" on event "${event.name}" is not linked in the app definition.`,
          fingerprint: fp('unexpected_property', event.id, null, dmProp.property),
        });
      }
    }
  }

  // ---- Customer-scope checks (only when a customers snapshot is stored) ----
  if (dataManager.customers) {
    const dmCustomerByName = new Map(dataManager.customers.properties.map((p) => [p.property, p]));

    for (const prop of definition.customer_properties) {
      const dmProp = dmCustomerByName.get(prop.name);
      if (!dmProp) {
        findings.push({
          comparison: COMPARISON,
          kind: 'unmapped_property',
          severity: 'warning',
          event_id: null,
          variant_id: null,
          property_id: prop.property_id,
          observation_id: null,
          expected_json: { property: prop.name },
          actual_json: null,
          message: `Customer property "${prop.name}" is defined in the app but the Data Manager customers snapshot does not hold it.`,
          fingerprint: fp('unmapped_property', null, prop.property_id, 'missing'),
        });
        continue;
      }
      const expectedDm = defDmType(prop);
      if (dmProp.type === expectedDm) continue;
      findings.push({
        comparison: COMPARISON,
        kind: 'type_mismatch',
        severity: 'error',
        event_id: null,
        variant_id: null,
        property_id: prop.property_id,
        observation_id: null,
        expected_json: { data_manager_type: expectedDm },
        actual_json: { data_manager_type: dmProp.type },
        message: `Customer property "${prop.name}" is Data Manager type "${dmProp.type}", expected "${expectedDm}" (app data type "${prop.data_type}").`,
        fingerprint: fp('type_mismatch', null, prop.property_id, dmProp.type),
      });
    }

    const defCustomerNames = new Set(definition.customer_properties.map((p) => p.name));
    for (const dmProp of dataManager.customers.properties) {
      if (defCustomerNames.has(dmProp.property)) continue;
      findings.push({
        comparison: COMPARISON,
        kind: 'unexpected_property',
        severity: 'warning',
        event_id: null,
        variant_id: null,
        property_id: null,
        observation_id: null,
        expected_json: null,
        actual_json: { property: dmProp.property, data_manager_type: dmProp.type },
        message: `Data Manager customer property "${dmProp.property}" is not linked in the app definition.`,
        fingerprint: fp('unexpected_property', null, null, dmProp.property),
      });
    }
  }

  return findings;
}
