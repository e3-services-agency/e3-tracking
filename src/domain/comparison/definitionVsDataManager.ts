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
 * Severities (T-2-05 delta, corrected against the T-2-04 review): `type_mismatch` is `error`
 * except when the *Data Manager* type itself is not one of `KNOWN_DATA_MANAGER_TYPES` (an app type
 * genuinely cannot be compared against an unrecognized Bloomreach type — this is `warning`, not an
 * unconditional error the app cannot help the user fix, T-2-04 review LOW finding); `unmapped_property`
 * and `missing_event` are `warning`; `unexpected_property` is `info` per D-37/D-21 (the T-2-04 code
 * had shipped `warning`, a documented deviation the T-2-04 review flagged against the accepted
 * decision record — this task corrects the two literals back to `info`, D-40).
 *
 * D-38 (T-2-04 review WARNING, carried into this task's delta): `SDK_DEFAULT_PROPERTIES` (`os`,
 * `browser`, `device`, `location`) are never `unexpected_property` or `unmapped_property` on any
 * event, matching comparison 3's own exclusion (`definitionVsObservations.ts`) — a Data Manager
 * events file always lists them (the SDK adds them to every event), so without this guard every
 * custom event would carry four spurious findings whenever its properties were not individually
 * linked to those four names.
 *
 * No findings at all when a snapshot is absent: `dataManager.events === null` skips every
 * event-scope check (`type_mismatch`/`unmapped_property`/`unexpected_property` on events,
 * `missing_event`); `dataManager.customers === null` skips every customer-scope check
 * (`data_manager_customers_json` can be absent even after an events import, T-2-02's documented
 * "no customers evidence yet" case) — a project that has never gone through either Data Manager
 * import produces zero comparison-4 findings, not a false "everything is missing".
 */
import { toDataManagerType, KNOWN_DATA_MANAGER_TYPES } from '../bloomreach/dataManagerTypes';
import { SDK_DEFAULT_PROPERTIES, KNOWN_SYSTEM_EVENT_TYPES } from '../bloomreach';
import type { DataManagerEventsModel } from '../import/dataManagerEvents';
import type { DataManagerCustomersModel } from '../import/dataManagerCustomers';
import type { ComparisonId, EventClass, FindingSeverity } from '../enums';
import type { EngineFinding } from './definitionVsObservations';

export interface DmDefEventProperty {
  property_id: string;
  name: string;
  data_type: string;
  data_formats: string[];
  /** T-5-32: the property's PII flag; absent = unset. */
  pii?: boolean;
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
  pii?: boolean;
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

/** True for the eight Bloomreach types this module actually knows how to compare (D-37, T-2-05 delta). */
function isKnownDmType(dmType: string): boolean {
  return (KNOWN_DATA_MANAGER_TYPES as readonly string[]).includes(dmType);
}


function mk(
  kind: EngineFinding['kind'],
  severity: FindingSeverity,
  eventId: string | null,
  propertyId: string | null,
  detail: string,
  message: string,
  expected: Record<string, unknown> | null,
  actual: Record<string, unknown> | null
): EngineFinding {
  return {
    comparison: COMPARISON,
    kind,
    severity,
    event_id: eventId,
    variant_id: null,
    property_id: propertyId,
    observation_id: null,
    expected_json: expected,
    actual_json: actual,
    message,
    fingerprint: fp(kind, eventId, propertyId, detail),
  };
}

const AUTO_NOTE =
  'Bloomreach wrote this entry itself when unrecognised data arrived (source: data); the Data Manager declaration is descriptive, not designed.';

function pushPii(
  findings: EngineFinding[],
  eventId: string | null,
  eventName: string | null,
  prop: { property_id: string; name: string; pii?: boolean },
  dmPrivate: boolean
): void {
  const where = eventName ? ` on event "${eventName}"` : '';
  const label = eventName ? 'Property' : 'Customer property';
  const pii = prop.pii === true;
  if (dmPrivate && !pii) {
    findings.push(
      mk('pii_not_declared', 'error', eventId, prop.property_id, 'private',
        `${label} "${prop.name}"${where} is private in Data Manager but the plan does not mark it as PII.`,
        { pii: true }, { pii, private: true })
    );
  } else if (!dmPrivate && pii) {
    findings.push(
      mk('pii_not_private', 'warning', eventId, prop.property_id, 'not_private',
        `${label} "${prop.name}"${where} is marked PII in the plan but is not private in Data Manager.`,
        { private: true }, { pii: true, private: false })
    );
  }
}

/**
 * T-5-32: declaration checks, reading only the Data Manager flags `source`/`used`/`private`
 * (so they work on masked data). `dm_auto_declared` (warning), `dm_unused` (info),
 * `pii_not_declared` (error), `pii_not_private` (warning).
 */
function declarationChecks(
  definition: DataManagerDefinitionSnapshot,
  dataManager: DataManagerEvidence,
  findings: EngineFinding[]
): void {
  if (dataManager.events) {
    const planByName = new Map(definition.events.map((e) => [e.name, e]));
    for (const dmEvent of dataManager.events.events) {
      const event = planByName.get(dmEvent.type);
      if (!event) {
        if (dmEvent.source === 'data' && !KNOWN_SYSTEM_EVENT_TYPES.includes(dmEvent.type)) {
          findings.push(
            mk('dm_auto_declared', 'warning', null, null, `event:${dmEvent.type}`,
              `Data Manager event "${dmEvent.type}" was declared by Bloomreach from incoming data and is not in the plan. ${AUTO_NOTE}`,
              null, { event: dmEvent.type, source: 'data' })
          );
        }
        continue;
      }
      if (event.class !== 'custom') continue;
      if (!dmEvent.used && event.status === 'implemented') {
        findings.push(
          mk('dm_unused', 'info', event.id, null, 'event',
            `Event "${event.name}" is declared in Bloomreach but marked unused (the plan has it as implemented).`,
            { status: 'implemented' }, { used: false })
        );
      }
      const planProps = new Map(event.properties.map((p) => [p.name, p]));
      for (const dmProp of dmEvent.properties) {
        if (SDK_DEFAULT_PROPERTIES.includes(dmProp.property)) continue;
        const prop = planProps.get(dmProp.property);
        if (dmProp.source === 'data') {
          if (!prop) {
            findings.push(
              mk('dm_auto_declared', 'warning', event.id, null, dmProp.property,
                `Property "${dmProp.property}" on event "${event.name}" was declared by Bloomreach from incoming data and is not in the plan. ${AUTO_NOTE}`,
                null, { property: dmProp.property, source: 'data', data_manager_type: dmProp.type })
            );
          } else if (dmProp.type !== defDmType(prop)) {
            findings.push(
              mk('dm_auto_declared', 'warning', event.id, prop.property_id, dmProp.property,
                `Property "${dmProp.property}" on event "${event.name}" was declared by Bloomreach from incoming data as "${dmProp.type}", differing from the plan ("${defDmType(prop)}"). ${AUTO_NOTE}`,
                { data_manager_type: defDmType(prop) }, { source: 'data', data_manager_type: dmProp.type })
            );
          }
        }
        if (!prop) continue;
        if (!dmProp.used) {
          findings.push(
            mk('dm_unused', 'info', event.id, prop.property_id, 'property',
              `Property "${dmProp.property}" on event "${event.name}" is declared in Bloomreach but marked unused (the plan links it).`,
              { linked: true }, { used: false })
          );
        }
        pushPii(findings, event.id, event.name, prop, dmProp.private);
      }
    }
  }
  if (dataManager.customers) {
    const planProps = new Map(definition.customer_properties.map((p) => [p.name, p]));
    for (const dmProp of dataManager.customers.properties) {
      const prop = planProps.get(dmProp.property);
      if (dmProp.source === 'data') {
        if (!prop) {
          findings.push(
            mk('dm_auto_declared', 'warning', null, null, dmProp.property,
              `Customer property "${dmProp.property}" was declared by Bloomreach from incoming data and is not in the plan. ${AUTO_NOTE}`,
              null, { property: dmProp.property, source: 'data', data_manager_type: dmProp.type })
          );
        } else if (dmProp.type !== defDmType(prop)) {
          findings.push(
            mk('dm_auto_declared', 'warning', null, prop.property_id, dmProp.property,
              `Customer property "${dmProp.property}" was declared by Bloomreach from incoming data as "${dmProp.type}", differing from the plan ("${defDmType(prop)}"). ${AUTO_NOTE}`,
              { data_manager_type: defDmType(prop) }, { source: 'data', data_manager_type: dmProp.type })
          );
        }
      }
      if (!prop) continue;
      if (!dmProp.used) {
        findings.push(
          mk('dm_unused', 'info', null, prop.property_id, 'property',
            `Customer property "${dmProp.property}" is declared in Bloomreach but marked unused (the plan has it).`,
            { linked: true }, { used: false })
        );
      }
      pushPii(findings, null, null, prop, dmProp.private);
    }
  }
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
      // one event and not another, e.g. cart_update.total_price vs purchase.total_price). T-2-05
      // delta: when `dmProp.type` is not one of `KNOWN_DATA_MANAGER_TYPES` the app cannot represent
      // it at all, so the finding is a `warning` ("unknown Data Manager type") instead of an
      // unconditional `error` the user can only clear in Bloomreach, not in the app (T-2-04 review LOW).
      for (const prop of event.properties) {
        const dmProp = dmPropByName.get(prop.name);
        if (!dmProp) continue; // handled by unmapped_property below
        const expectedDm = defDmType(prop);
        if (dmProp.type === expectedDm) continue;
        const known = isKnownDmType(dmProp.type);
        const severity: FindingSeverity = known ? 'error' : 'warning';
        const message = known
          ? `Property "${prop.name}" on event "${event.name}" is Data Manager type "${dmProp.type}", expected "${expectedDm}" (app data type "${prop.data_type}").`
          : `Property "${prop.name}" on event "${event.name}" has unknown Data Manager type "${dmProp.type}", which the app cannot represent (app data type "${prop.data_type}").`;
        findings.push({
          comparison: COMPARISON,
          kind: 'type_mismatch',
          severity,
          event_id: event.id,
          variant_id: null,
          property_id: prop.property_id,
          observation_id: null,
          expected_json: { data_manager_type: expectedDm },
          actual_json: { data_manager_type: dmProp.type },
          message,
          fingerprint: fp('type_mismatch', event.id, prop.property_id, dmProp.type),
        });
      }

      // unmapped_property: a definition property linked to this event that Data Manager does not
      // hold. D-38: SDK_DEFAULT_PROPERTIES are attached to every event by the SDK itself, never a
      // real app-definition gap.
      for (const prop of event.properties) {
        if (dmPropByName.has(prop.name)) continue;
        if (SDK_DEFAULT_PROPERTIES.includes(prop.name)) continue;
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

      // unexpected_property: a Data Manager property on this event that the definition does not
      // link. D-37/D-21: `info` severity (T-2-05 delta corrects the T-2-04 code's `warning` back to
      // the accepted decision record). D-38: SDK_DEFAULT_PROPERTIES never count as unexpected.
      const defPropByName = new Set(event.properties.map((p) => p.name));
      for (const dmProp of dmEvent.properties) {
        if (defPropByName.has(dmProp.property)) continue;
        if (SDK_DEFAULT_PROPERTIES.includes(dmProp.property)) continue;
        findings.push({
          comparison: COMPARISON,
          kind: 'unexpected_property',
          severity: 'info',
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
      const known = isKnownDmType(dmProp.type);
      const severity: FindingSeverity = known ? 'error' : 'warning';
      const message = known
        ? `Customer property "${prop.name}" is Data Manager type "${dmProp.type}", expected "${expectedDm}" (app data type "${prop.data_type}").`
        : `Customer property "${prop.name}" has unknown Data Manager type "${dmProp.type}", which the app cannot represent (app data type "${prop.data_type}").`;
      findings.push({
        comparison: COMPARISON,
        kind: 'type_mismatch',
        severity,
        event_id: null,
        variant_id: null,
        property_id: prop.property_id,
        observation_id: null,
        expected_json: { data_manager_type: expectedDm },
        actual_json: { data_manager_type: dmProp.type },
        message,
        fingerprint: fp('type_mismatch', null, prop.property_id, dmProp.type),
      });
    }

    const defCustomerNames = new Set(definition.customer_properties.map((p) => p.name));
    for (const dmProp of dataManager.customers.properties) {
      if (defCustomerNames.has(dmProp.property)) continue;
      findings.push({
        comparison: COMPARISON,
        kind: 'unexpected_property',
        severity: 'info',
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

  declarationChecks(definition, dataManager, findings);
  return findings;
}
