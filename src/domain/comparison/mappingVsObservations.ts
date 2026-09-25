/**
 * Comparison 2: mapping vs observations (T-2-05, PLAN "Comparison engine design" > "Comparison 2",
 * D-21, D-29). Pure function, no DB/Express import (domain-model skill):
 * `src/backend/services/comparison.service.ts` builds the stored `MappingSnapshot`
 * (`src/domain/comparison/snapshot.ts`) and resolved `EngineObservation[]` (same shape comparison 3
 * uses) and calls `runMappingVsObservations`. There is no preview-side use of this comparison (D-22:
 * a pasted mapping has nothing observed against it yet) — it only ever runs against the stored
 * mapping and the project's observations.
 *
 * D-29 engine-wide rule: only observations resolved to a `class: custom` event are considered by
 * `missing_required`/`unknown_variant`; an observation resolved to `sdk`/`platform`, or not resolved
 * at all, never produces a finding here except the `consent` check below, which reads the *raw*
 * event type/properties directly (a `consent` observation is itself a `platform`-class event with no
 * definition `Event` row to resolve to, so it would otherwise never be seen by this engine at all).
 *
 * Checks implemented (this task's description, matching the plan table where the two agree):
 * - `unknown_variant` (warning): an observation of a mapped event carries a discriminator value that
 *   is not covered by any of that event's mapped variants (e.g. `cart_update.action = remove` when
 *   only `add_to_cart`'s `action = add` filter is mapped).
 * - `rename_mismatch` (warning): a `consent` observation's `category` equals a standard consent key
 *   the mapping renames (`category: newsletter` observed, `mapping.consents.newsletter = "brand_consent"`).
 * - `missing_required` (error): a mapped standard field whose property is absent from every
 *   observation of the mapped event.
 * - `missing_event` (warning): a mapped standard event (class `custom`) with zero observations of
 *   its raw type in scope.
 *
 * Not implemented (documented gap, T-2-05 scope note, matching `definitionVsMapping.ts`'s own
 * documented gap): the plan table's `unmapped_standard_event` row ("the filter never matches in
 * scope") — no test requires it; left for a later task alongside comparison 1's `expiration_mismatch`.
 */
import type { ComparisonId } from '../enums';
import type { DefEvent, EngineFinding, EngineObservation } from './definitionVsObservations';
import type { MappingSnapshot } from './snapshot';

const COMPARISON: ComparisonId = 'mapping_vs_observations';

function fp(kind: EngineFinding['kind'], eventId: string | null, propertyId: string | null, detail: string): string {
  return [COMPARISON, kind, eventId ?? '', '', propertyId ?? '', detail].join('|');
}

function payloadKeyFor(prop: { payload_key: string | null; name: string }): string {
  return prop.payload_key ?? prop.name;
}

export function runMappingVsObservations(
  definitionEvents: DefEvent[],
  mapping: MappingSnapshot,
  observations: EngineObservation[]
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  const eventByName = new Map(definitionEvents.map((e) => [e.name, e]));
  const eventById = new Map(definitionEvents.map((e) => [e.id, e]));

  // D-29: only observations resolved to a `class: custom` event feed missing_required/unknown_variant/missing_event below.
  const customResolved = observations.filter((o) => {
    if (!o.event_id) return false;
    const event = eventById.get(o.event_id);
    return event?.class === 'custom';
  });

  // ---- rename_mismatch (consent): raw `consent` observations, independent of event resolution ----
  const consentSeen = new Map<string, EngineObservation>();
  for (const obs of observations) {
    if (obs.event_type !== 'consent') continue;
    const category = obs.properties.category;
    if (typeof category !== 'string') continue;
    const mappedName = mapping.consents[category];
    if (!mappedName || mappedName === category) continue;
    if (!consentSeen.has(category)) consentSeen.set(category, obs);
  }
  for (const [category, obs] of consentSeen) {
    const mappedName = mapping.consents[category] as string;
    findings.push({
      comparison: COMPARISON,
      kind: 'rename_mismatch',
      severity: 'warning',
      event_id: null,
      variant_id: null,
      property_id: null,
      observation_id: obs.id,
      expected_json: { standard_key: category, mapped_name: mappedName },
      actual_json: { category },
      message: `Observed consent category "${category}" matches standard key "${category}", which the mapping renames to "${mappedName}".`,
      fingerprint: fp('rename_mismatch', null, null, `consent:${category}`),
    });
  }

  // ---- Per mapped standard event: missing_required, unknown_variant, missing_event ----
  const obsByEventName = new Map<string, EngineObservation[]>();
  for (const obs of customResolved) {
    const list = obsByEventName.get(obs.event_type) ?? [];
    list.push(obs);
    obsByEventName.set(obs.event_type, list);
  }
  // Every raw observation (resolved or not) grouped by type, for missing_event's "zero observations of this raw type in scope".
  const anyObsByEventType = new Map<string, EngineObservation[]>();
  for (const obs of observations) {
    const list = anyObsByEventType.get(obs.event_type) ?? [];
    list.push(obs);
    anyObsByEventType.set(obs.event_type, list);
  }

  // unknown_variant needs the union of filter conditions across every mapped standard event sharing
  // the same underlying event type, grouped per (eventType, discriminator property name).
  const allowedByEventProperty = new Map<string, Set<string>>();
  for (const se of mapping.standardEvents) {
    if (!se.eventType || se.filter.length === 0) continue;
    for (const cond of se.filter) {
      const key = `${se.eventType}|${cond.property}`;
      const set = allowedByEventProperty.get(key) ?? new Set<string>();
      cond.values.forEach((v) => set.add(v));
      allowedByEventProperty.set(key, set);
    }
  }
  const discriminatorPropsByEventType = new Map<string, Set<string>>();
  for (const key of allowedByEventProperty.keys()) {
    const [eventType, propName] = key.split('|');
    const set = discriminatorPropsByEventType.get(eventType) ?? new Set<string>();
    set.add(propName);
    discriminatorPropsByEventType.set(eventType, set);
  }

  const unknownVariantSeen = new Map<string, { obs: EngineObservation; value: unknown }>();
  for (const [eventType, propNames] of discriminatorPropsByEventType) {
    const event = eventByName.get(eventType);
    if (!event) continue;
    for (const obs of obsByEventName.get(eventType) ?? []) {
      for (const propName of propNames) {
        const prop = event.properties.find((p) => p.name === propName);
        const key = prop ? payloadKeyFor(prop) : propName;
        const raw = obs.properties[key];
        if (raw === undefined || raw === null) continue;
        const allowed = allowedByEventProperty.get(`${eventType}|${propName}`);
        if (!allowed || allowed.has(String(raw))) continue;
        const vkey = `${eventType}|${propName}`;
        if (!unknownVariantSeen.has(vkey)) unknownVariantSeen.set(vkey, { obs, value: raw });
      }
    }
  }
  for (const [key, { obs, value }] of unknownVariantSeen) {
    const [eventType, propName] = key.split('|');
    const event = eventByName.get(eventType);
    const prop = event?.properties.find((p) => p.name === propName);
    findings.push({
      comparison: COMPARISON,
      kind: 'unknown_variant',
      severity: 'warning',
      event_id: event?.id ?? null,
      variant_id: obs.variant_id,
      property_id: prop?.property_id ?? null,
      observation_id: obs.id,
      expected_json: { property: propName },
      actual_json: { value },
      message: `Observed "${eventType}" with ${propName} = "${String(value)}" is not covered by any mapped standard event variant.`,
      fingerprint: fp('unknown_variant', event?.id ?? null, prop?.property_id ?? null, `${propName}:${String(value)}`),
    });
  }

  // missing_required / missing_event, per mapped standard event
  const missingRequiredSeen = new Map<string, EngineObservation>();
  for (const se of mapping.standardEvents) {
    if (!se.eventType) continue;
    const event = eventByName.get(se.eventType);
    if (!event || event.class !== 'custom') continue;

    const scoped = obsByEventName.get(se.eventType) ?? [];
    for (const [field, propName] of Object.entries(se.fieldMap)) {
      if (!propName || scoped.length === 0) continue;
      const prop = event.properties.find((p) => p.name === propName);
      const key = prop ? payloadKeyFor(prop) : propName;
      const presentSomewhere = scoped.some((obs) => obs.properties[key] !== undefined && obs.properties[key] !== null);
      if (presentSomewhere) continue;
      const mkey = `${se.key}|${field}`;
      if (!missingRequiredSeen.has(mkey)) missingRequiredSeen.set(mkey, scoped[0]);
    }

    // missing_event: mapped standard event, zero observations of its raw type anywhere in scope.
    if (!(anyObsByEventType.get(se.eventType)?.length)) {
      findings.push({
        comparison: COMPARISON,
        kind: 'missing_event',
        severity: 'warning',
        event_id: event.id,
        variant_id: null,
        property_id: null,
        observation_id: null,
        expected_json: { standard_event: se.key, event: se.eventType },
        actual_json: null,
        message: `Mapped standard event "${se.key}" (event "${se.eventType}") has zero observations in scope.`,
        fingerprint: fp('missing_event', event.id, null, se.key),
      });
    }
  }
  for (const [key, obs] of missingRequiredSeen) {
    const [seKey, field] = key.split('|');
    const se = mapping.standardEvents.find((s) => s.key === seKey);
    const event = se?.eventType ? eventByName.get(se.eventType) : undefined;
    const propName = se?.fieldMap[field] ?? null;
    const prop = event?.properties.find((p) => p.name === propName);
    findings.push({
      comparison: COMPARISON,
      kind: 'missing_required',
      severity: 'error',
      event_id: event?.id ?? null,
      variant_id: obs.variant_id,
      property_id: prop?.property_id ?? null,
      observation_id: obs.id,
      expected_json: { standard_event: seKey, field },
      actual_json: null,
      message: `Mapped field "${seKey}.${field}" (property "${propName}") is absent from every observation of event "${se?.eventType}".`,
      fingerprint: fp('missing_required', event?.id ?? null, prop?.property_id ?? null, `${seKey}:${field}`),
    });
  }

  return findings;
}
