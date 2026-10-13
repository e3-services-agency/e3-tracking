/**
 * Comparison 3: definition vs observations (T-1-09, PLAN "Three-way comparison engine design" >
 * "Comparison 3", D-21, D-25 Q4/Q5/Q12). Pure function, no DB or Express import (domain-model
 * skill): `src/backend/services/comparison.service.ts` loads a `DefinitionSnapshot` and resolved
 * `EngineObservation[]` from the DAL and calls `runDefinitionVsObservations`; unit tests feed the
 * fixture straight into this module.
 *
 * Every row of the plan's comparison-3 table is implemented here except certification itself
 * (phase 2, D-05) — `isEventCertified` is exposed as a pure helper for that later use, taking the
 * findings this module already produced.
 *
 * Format checks implemented for `format_violation` (T-1-09 task: "document which are
 * implemented"), against `src/domain/enums.ts`'s `PROPERTY_DATA_FORMATS`: `email`, `uri`, `uuid`,
 * `iso8601_date`, `iso8601_datetime`, `currency_code`, `country_code`, `language_code`,
 * `e164_phone`. Not checked: `unix_seconds`/`unix_milliseconds` (a plain number cannot be
 * distinguished from any other number without a plausible-range heuristic, which would be more
 * guess than check) and `money` (drives the `rounding_drift` rule instead of a format check — D-25
 * Q12). `jsType`/`matchesDataType`/`FORMAT_CHECKS` moved to `./valueChecks.ts` (T-2-05: the single
 * shared value-check module every comparison engine and the rules evaluator import).
 */
import { KNOWN_SYSTEM_EVENT_TYPES, SDK_DEFAULT_PROPERTIES } from '../bloomreach';
import type { VariantCondition } from '../variants';
import type { ComparisonId, EventClass, FindingKind, FindingSeverity } from '../enums';
import { jsType, matchesDataType, FORMAT_CHECKS } from './valueChecks';
import { isMaskedValue } from '../redaction';

export interface ExpirationBlock {
  enabled: boolean;
  count: number | null;
  units: 'days' | 'weeks' | 'months' | 'years' | null;
}

export interface DefEventProperty {
  property_id: string;
  name: string;
  payload_key: string | null;
  role: 'normal' | 'discriminator' | 'context';
  required: boolean;
  data_type: string;
  data_formats: string[];
  allowed_values: string[] | null;
  /**
   * T-2-05 addition: the `standard_event` hint recorded per allowed value when the data-mapping
   * import created/grew this discriminator's value list (`dataMappingImport.service.ts`'s
   * `planEventProperty`) — `null` for a value added by hand or with no hint. Optional/additive: only
   * `comparison/definitionVsMapping.ts`'s `unmapped_standard_event` check reads it; every other
   * consumer of `DefEventProperty` (comparisons 3/4, the rules evaluator) ignores it.
   */
  allowed_value_hints?: { value: string; standard_event: string | null }[];
  /**
   * T-2-05 fix round addition: the linked property's `item_schema_json` (D-30 ItemSchema), carried
   * through so `comparison.service.ts`'s `buildRuleSnapshot`/`buildItemSchemaChecks` (T-2-07) can
   * derive both the rules `RuleSnapshot` and the item-schema checks from this one already-loaded
   * `DefinitionSnapshot` instead of a second `EventDAL.getEventWithProperties` read per event.
   * `undefined`/`null` for a non-array property or one with no schema set; every other consumer of
   * `DefEventProperty` ignores this field, same convention as `allowed_value_hints`.
   */
  item_schema?: { field: string; data_type: string; data_formats?: string[]; required?: boolean }[] | null;
  /** D-63 (T-4-17): property kind and derivation rule; only rules/stateLists.ts reads them. */
  kind?: string;
  derivation?: unknown;
  /** D-65 (T-4-22): the stored category override, read only by the naming check (comparison 1). */
  category_override?: string | null;
}

export interface DefVariant {
  id: string;
  event_id: string;
  name: string;
  conditions: VariantCondition[];
  expiration: ExpirationBlock | null;
}

export interface DefEvent {
  id: string;
  name: string;
  status: string;
  /** D-29, D-36: the engine validates `custom` events only; `sdk`/`platform` never produce findings. */
  class: EventClass;
  expiration: ExpirationBlock | null;
  properties: DefEventProperty[];
  /** D-67 (T-4-28): the identifier names the event carries in `customer_ids` (effective: explicit list, else derived). */
  identifiers?: string[];
}

export interface StandardMappingRef {
  standard_event: string;
  event_id: string;
  variant_id: string | null;
  field_map: Record<string, string | null>;
}

export interface DefinitionSnapshot {
  project_default_expiration: ExpirationBlock | null;
  events: DefEvent[];
  variants: DefVariant[];
  standard_event_mappings: StandardMappingRef[];
}

export interface EngineObservation {
  id: string;
  event_type: string;
  event_id: string | null;
  variant_id: string | null;
  timestamp: number;
  properties: Record<string, unknown>;
  /** D-67 (T-4-28): the observation's `customer_ids` when it carries any (read from `properties.customer_ids`); absent = not recorded. */
  customer_ids?: Record<string, unknown>;
  /** QaRun.kind this observation belongs to (D-25 Q4: `missing_event` severity depends on it). */
  run_kind: string;
}

export interface EngineFinding {
  comparison: ComparisonId;
  kind: FindingKind;
  severity: FindingSeverity;
  event_id: string | null;
  variant_id: string | null;
  property_id: string | null;
  observation_id: string | null;
  expected_json: unknown;
  actual_json: unknown;
  message: string;
  fingerprint: string;
}

const COMPARISON: ComparisonId = 'definition_vs_observations';
const UNIT_SECONDS: Record<string, number> = {
  days: 86400,
  weeks: 7 * 86400,
  months: 30 * 86400,
  years: 365 * 86400,
};

function fp(kind: FindingKind, eventId: string | null, variantId: string | null, propertyId: string | null, detail: string): string {
  return [COMPARISON, kind, eventId ?? '', variantId ?? '', propertyId ?? '', detail].join('|');
}

function payloadKeyFor(prop: DefEventProperty): string {
  return prop.payload_key ?? prop.name;
}

function effectiveExpiration(event: DefEvent, variant: DefVariant | null, projectDefault: ExpirationBlock | null): ExpirationBlock | null {
  return variant?.expiration ?? event.expiration ?? projectDefault;
}

function windowSeconds(expiration: ExpirationBlock): number | null {
  if (!expiration.enabled || expiration.count === null || !expiration.units) return null;
  return expiration.count * (UNIT_SECONDS[expiration.units] ?? 0);
}

/** Certification precondition (D-05, phase 2 use): false whenever an open error finding exists. */
export function isEventCertified(findings: { severity: FindingSeverity; status?: string }[]): boolean {
  return !findings.some((f) => f.severity === 'error' && f.status !== 'resolved');
}

export interface RunOptions {
  /** Unix seconds "now"; defaults to `Date.now() / 1000`. Exposed for deterministic tests. */
  now?: number;
}

export function runDefinitionVsObservations(
  definition: DefinitionSnapshot,
  observations: EngineObservation[],
  options: RunOptions = {}
): EngineFinding[] {
  const now = options.now ?? Date.now() / 1000;
  const findings: EngineFinding[] = [];

  const eventsById = new Map(definition.events.map((e) => [e.id, e]));
  const variantsById = new Map(definition.variants.map((v) => [v.id, v]));
  const propertyNameById = new Map<string, string>();
  for (const event of definition.events) {
    for (const prop of event.properties) propertyNameById.set(prop.property_id, prop.name);
  }

  // D-29/D-36: only `class = custom` events are validated. An observation resolved to a known
  // sdk/platform event (non-null `event_id`, but that event's class is not `custom`) is treated
  // like an unresolved-but-known observation below: no unexpected_event (its type is already
  // suppressed via `KNOWN_SYSTEM_EVENT_TYPES`), and it never enters the custom-only checks or
  // `missing_event`.
  const customEventIds = new Set(definition.events.filter((e) => e.class === 'custom').map((e) => e.id));
  const resolved = observations.filter((o) => o.event_id !== null && customEventIds.has(o.event_id));
  const unresolved = observations.filter((o) => o.event_id === null);

  // ---- unexpected_event (info; suppressed for known Bloomreach system types, D-25 Q5) ----
  const unexpectedByType = new Map<string, EngineObservation>();
  for (const obs of unresolved) {
    if (KNOWN_SYSTEM_EVENT_TYPES.includes(obs.event_type)) continue;
    if (!unexpectedByType.has(obs.event_type)) unexpectedByType.set(obs.event_type, obs);
  }
  for (const [type, obs] of unexpectedByType) {
    findings.push({
      comparison: COMPARISON,
      kind: 'unexpected_event',
      severity: 'info',
      event_id: null,
      variant_id: null,
      property_id: null,
      observation_id: obs.id,
      expected_json: null,
      actual_json: { event_type: type },
      message: `Observed event type "${type}" has no matching Event definition.`,
      fingerprint: fp('unexpected_event', null, null, null, type),
    });
  }

  // ---- Group resolved observations by (event_id, variant_id) for missing_required/type_mismatch/enum/unexpected_property ----
  const byEvent = new Map<string, EngineObservation[]>();
  for (const obs of resolved) {
    const list = byEvent.get(obs.event_id as string) ?? [];
    list.push(obs);
    byEvent.set(obs.event_id as string, list);
  }

  // missing_required / type_mismatch / format_violation / enum_violation / unknown_variant / unexpected_property
  const missingRequiredSeen = new Map<string, EngineObservation>();
  const typeMismatchSeen = new Map<string, { obs: EngineObservation; actualType: string }>();
  const formatViolationSeen = new Map<string, EngineObservation>();
  const enumViolationSeen = new Map<string, { obs: EngineObservation; value: unknown }>();
  const unknownVariantSeen = new Map<string, { obs: EngineObservation; value: unknown }>();
  const unexpectedPropertySeen = new Map<string, EngineObservation>();

  for (const [eventId, obsList] of byEvent) {
    const event = eventsById.get(eventId);
    if (!event) continue;
    const linkedKeys = new Set(event.properties.map((p) => payloadKeyFor(p)));

    for (const prop of event.properties) {
      const key = payloadKeyFor(prop);
      let missingObs: EngineObservation | null = null;
      for (const obs of obsList) {
        const raw = obs.properties[key];
        const present = raw !== undefined && raw !== null;
        if (!present) {
          if (prop.required && !missingObs) missingObs = obs;
          continue;
        }

        // T-5-30: a masked value (`[redacted:geo]`) is present but unverifiable; skip type/format/enum.
        if (isMaskedValue(raw)) continue;

        if (!matchesDataType(prop.data_type, raw)) {
          const mkey = `${eventId}|${prop.property_id}`;
          if (!typeMismatchSeen.has(mkey)) typeMismatchSeen.set(mkey, { obs, actualType: jsType(raw) });
          continue; // a value with the wrong JS type cannot also be meaningfully format/enum-checked
        }

        if (typeof raw === 'string') {
          for (const format of prop.data_formats) {
            const check = FORMAT_CHECKS[format];
            if (check && !check(raw)) {
              const fkey = `${eventId}|${prop.property_id}|${format}`;
              if (!formatViolationSeen.has(fkey)) formatViolationSeen.set(fkey, obs);
            }
          }
        }

        if (prop.allowed_values && prop.allowed_values.length > 0) {
          const strValue = String(raw);
          if (!prop.allowed_values.includes(strValue)) {
            const vkey = `${eventId}|${prop.property_id}`;
            if (prop.role === 'discriminator') {
              if (!unknownVariantSeen.has(vkey)) unknownVariantSeen.set(vkey, { obs, value: strValue });
            } else if (!enumViolationSeen.has(vkey)) {
              enumViolationSeen.set(vkey, { obs, value: strValue });
            }
          }
        }
      }
      if (missingObs) missingRequiredSeen.set(`${eventId}|${prop.property_id}`, missingObs);
    }

    // unexpected_property: payload key present but not linked to the event
    for (const obs of obsList) {
      for (const key of Object.keys(obs.properties)) {
        if (linkedKeys.has(key)) continue;
        // D-38: attributes the Bloomreach SDK attaches to every event are never unexpected.
        if (SDK_DEFAULT_PROPERTIES.includes(key)) continue;
        const ukey = `${eventId}|${key}`;
        if (!unexpectedPropertySeen.has(ukey)) unexpectedPropertySeen.set(ukey, obs);
      }
    }
  }

  for (const [key, obs] of missingRequiredSeen) {
    const [eventId, propertyId] = key.split('|');
    findings.push({
      comparison: COMPARISON,
      kind: 'missing_required',
      severity: 'error',
      event_id: eventId,
      variant_id: obs.variant_id,
      property_id: propertyId,
      observation_id: obs.id,
      expected_json: { required: true },
      actual_json: null,
      message: `Required property "${propertyNameById.get(propertyId) ?? propertyId}" is missing from an observation of event "${eventsById.get(eventId)?.name ?? eventId}".`,
      fingerprint: fp('missing_required', eventId, null, propertyId, 'missing'),
    });
  }

  for (const [key, { obs, actualType }] of typeMismatchSeen) {
    const [eventId, propertyId] = key.split('|');
    const event = eventsById.get(eventId);
    const prop = event?.properties.find((p) => p.property_id === propertyId);
    findings.push({
      comparison: COMPARISON,
      kind: 'type_mismatch',
      severity: 'error',
      event_id: eventId,
      variant_id: obs.variant_id,
      property_id: propertyId,
      observation_id: obs.id,
      expected_json: { data_type: prop?.data_type ?? null },
      actual_json: { value: prop ? obs.properties[payloadKeyFor(prop)] : undefined, js_type: actualType },
      message: `Property "${prop?.name ?? propertyId}" on event "${event?.name ?? eventId}" is ${actualType}, expected ${prop?.data_type ?? '?'}.`,
      fingerprint: fp('type_mismatch', eventId, null, propertyId, actualType),
    });
  }

  for (const [key, obs] of formatViolationSeen) {
    const [eventId, propertyId, format] = key.split('|');
    const event = eventsById.get(eventId);
    const prop = event?.properties.find((p) => p.property_id === propertyId);
    findings.push({
      comparison: COMPARISON,
      kind: 'format_violation',
      severity: 'warning',
      event_id: eventId,
      variant_id: obs.variant_id,
      property_id: propertyId,
      observation_id: obs.id,
      expected_json: { data_format: format },
      actual_json: { value: prop ? obs.properties[payloadKeyFor(prop)] : null },
      message: `Property "${prop?.name ?? propertyId}" on event "${event?.name ?? eventId}" does not match format "${format}".`,
      fingerprint: fp('format_violation', eventId, null, propertyId, format),
    });
  }

  for (const [key, { obs, value }] of enumViolationSeen) {
    const [eventId, propertyId] = key.split('|');
    const event = eventsById.get(eventId);
    const prop = event?.properties.find((p) => p.property_id === propertyId);
    findings.push({
      comparison: COMPARISON,
      kind: 'enum_violation',
      severity: 'error',
      event_id: eventId,
      variant_id: obs.variant_id,
      property_id: propertyId,
      observation_id: obs.id,
      expected_json: { allowed_values: prop?.allowed_values ?? [] },
      actual_json: { value },
      message: `Property "${prop?.name ?? propertyId}" on event "${event?.name ?? eventId}" has value "${String(value)}" outside its allowed values.`,
      fingerprint: fp('enum_violation', eventId, null, propertyId, String(value)),
    });
  }

  for (const [key, { obs, value }] of unknownVariantSeen) {
    const [eventId, propertyId] = key.split('|');
    const event = eventsById.get(eventId);
    const prop = event?.properties.find((p) => p.property_id === propertyId);
    findings.push({
      comparison: COMPARISON,
      kind: 'unknown_variant',
      severity: 'error',
      event_id: eventId,
      variant_id: obs.variant_id,
      property_id: propertyId,
      observation_id: obs.id,
      expected_json: { allowed_values: prop?.allowed_values ?? [] },
      actual_json: { value },
      message: `Discriminator "${prop?.name ?? propertyId}" on event "${event?.name ?? eventId}" observed value "${String(value)}" outside its allowed values; no variant matches.`,
      fingerprint: fp('unknown_variant', eventId, null, propertyId, String(value)),
    });
  }

  for (const [key, obs] of unexpectedPropertySeen) {
    const [eventId, payloadKey] = key.split('|');
    const event = eventsById.get(eventId);
    findings.push({
      comparison: COMPARISON,
      kind: 'unexpected_property',
      severity: 'info',
      event_id: eventId,
      variant_id: obs.variant_id,
      property_id: null,
      observation_id: obs.id,
      expected_json: null,
      actual_json: { payload_key: payloadKey },
      message: `Observed payload key "${payloadKey}" on event "${event?.name ?? eventId}" is not linked to the event.`,
      fingerprint: fp('unexpected_property', eventId, null, null, payloadKey),
    });
  }

  // ---- shape_inconsistent (error; whole scope, by *raw payload key* regardless of link status) ----
  // ERROR 3 fix: compare the same observed payload key across every resolved observation
  // regardless of whether it happens to be linked to the event it was observed on — e.g.
  // `product_ids` is linked as a Property only on `purchase` in the real data-mapping fixture, but
  // `checkout`/`cart_update` still observe the same raw key as an *unlinked* payload key; both must
  // join the same shape bucket. When the key is linked to at least one event as a property, the
  // finding references that property (`property_id` set, display name used); otherwise it
  // references the raw key by name (`property_id: null`).
  const payloadKeyToProperty = new Map<string, { property_id: string; name: string }>();
  for (const event of definition.events) {
    for (const prop of event.properties) {
      const key = payloadKeyFor(prop);
      if (!payloadKeyToProperty.has(key)) payloadKeyToProperty.set(key, { property_id: prop.property_id, name: prop.name });
    }
  }

  const shapeByKey = new Map<string, Map<string, EngineObservation>>();
  for (const obs of resolved) {
    for (const [rawKey, rawValue] of Object.entries(obs.properties)) {
      if (rawValue === undefined || rawValue === null) continue;
      const type = jsType(rawValue);
      const shapeMap = shapeByKey.get(rawKey) ?? new Map<string, EngineObservation>();
      if (!shapeMap.has(type)) shapeMap.set(type, obs);
      shapeByKey.set(rawKey, shapeMap);
    }
  }

  for (const [key, typeMap] of shapeByKey) {
    if (typeMap.size <= 1) continue;
    const types = Array.from(typeMap.keys()).sort();
    const [, firstObs] = Array.from(typeMap.entries())[0];
    const linked = payloadKeyToProperty.get(key);
    const propertyId = linked?.property_id ?? null;
    const label = linked?.name ?? key;
    findings.push({
      comparison: COMPARISON,
      kind: 'shape_inconsistent',
      severity: 'error',
      event_id: null,
      variant_id: null,
      property_id: propertyId,
      observation_id: firstObs.id,
      expected_json: null,
      actual_json: { types },
      message: `Property "${label}" is observed with inconsistent JSON types across events: ${types.join(', ')}.`,
      fingerprint: fp('shape_inconsistent', null, null, propertyId, `${key}:${types.join(',')}`),
    });
  }

  // rounding_drift (D-21/D-25 Q12) used to be hard-coded here as `computeRoundingDrift`; T-2-07/
  // D-31 replaces it with the `purchase_items_total` rule template, evaluated by
  // `src/domain/rules/runRules.ts` inside the same `definition_vs_observations` comparison
  // (`comparison.service.ts` merges its findings with this function's) — not duplicated here.

  // ---- identifier_missing (warning, D-67): an observation that records customer_ids lacks an identifier its event carries ----
  const identifierSeen = new Set<string>();
  for (const obs of resolved) {
    if (!obs.customer_ids) continue;
    const event = eventsById.get(obs.event_id as string);
    for (const name of event?.identifiers ?? []) {
      if (name in obs.customer_ids) continue;
      const fingerprint = fp('identifier_missing', event!.id, null, null, name);
      if (identifierSeen.has(fingerprint)) continue;
      identifierSeen.add(fingerprint);
      findings.push({
        comparison: COMPARISON,
        kind: 'identifier_missing',
        severity: 'warning',
        event_id: event!.id,
        variant_id: null,
        property_id: null,
        observation_id: obs.id,
        expected_json: { identifier: name },
        actual_json: { customer_ids: Object.keys(obs.customer_ids) },
        message: `Event "${event!.name}" should carry the identifier "${name}" in customer_ids, but an observation does not.`,
        fingerprint,
      });
    }
  }

  // ---- missing_event (error for agent_session, warning otherwise, D-25 Q4) + expiration suppression ----
  const observedEventIds = new Set(resolved.map((o) => o.event_id as string));
  const newestObservationTimestamp = observations.length > 0 ? Math.max(...observations.map((o) => o.timestamp)) : null;
  const hasAgentSession = observations.some((o) => o.run_kind === 'agent_session');
  const missingEventSeverity: FindingSeverity = hasAgentSession ? 'error' : 'warning';

  for (const event of definition.events) {
    if (event.class !== 'custom') continue;
    if (event.status === 'ignored') continue;
    if (observedEventIds.has(event.id)) continue;
    const expiration = effectiveExpiration(event, null, definition.project_default_expiration);
    if (expiration) {
      const seconds = windowSeconds(expiration);
      if (seconds !== null) {
        const cutoff = now - seconds;
        const suppressed = newestObservationTimestamp === null || newestObservationTimestamp < cutoff;
        if (suppressed) continue;
      }
    }
    findings.push({
      comparison: COMPARISON,
      kind: 'missing_event',
      severity: missingEventSeverity,
      event_id: event.id,
      variant_id: null,
      property_id: null,
      observation_id: null,
      expected_json: { event: event.name },
      actual_json: null,
      message: `Event "${event.name}" has zero observations in scope.`,
      fingerprint: fp('missing_event', event.id, null, null, 'missing'),
    });
  }

  // ---- expiration_mismatch (info; observation side): an observation older than its event/variant's
  // effective window, one finding per event (fix round LOW 5: the old `break` stopped after the
  // globally-first stale observation project-wide, not per event as the comment claimed, so with
  // two events both having stale observations only the first-by-timestamp got a finding, and since
  // the fingerprint carries `event_id` the finding flipped between events across runs — reopen/
  // resolve churn with no underlying change) ----
  const expirationFlaggedEventIds = new Set<string>();
  for (const obs of resolved) {
    const event = eventsById.get(obs.event_id as string);
    if (!event) continue;
    if (expirationFlaggedEventIds.has(event.id)) continue;
    const variant = obs.variant_id ? variantsById.get(obs.variant_id) ?? null : null;
    const expiration = effectiveExpiration(event, variant, definition.project_default_expiration);
    if (!expiration) continue;
    const seconds = windowSeconds(expiration);
    if (seconds === null) continue;
    if (now - obs.timestamp <= seconds) continue;
    findings.push({
      comparison: COMPARISON,
      kind: 'expiration_mismatch',
      severity: 'info',
      event_id: event.id,
      variant_id: obs.variant_id,
      property_id: null,
      observation_id: obs.id,
      expected_json: { expiration },
      actual_json: { age_seconds: now - obs.timestamp },
      message: `An observation of event "${event.name}" is older than its effective expiration window.`,
      fingerprint: fp('expiration_mismatch', event.id, obs.variant_id, null, 'observed_stale'),
    });
    expirationFlaggedEventIds.add(event.id); // one info finding per event is enough evidence; avoid one row per stale observation
  }

  return findings;
}

