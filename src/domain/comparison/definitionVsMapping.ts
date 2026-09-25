/**
 * Comparison 1: definition vs mapping (T-2-05, PLAN "Comparison engine design" > "Comparison 1",
 * D-21). Pure function, no DB/Express import (domain-model skill). Runs against a `MappingSnapshot`
 * built either from stored entities (`comparison.service.ts`, persisted run) or from a parsed
 * `data-mapping.json` (`dataMappingImport.service.ts`'s `previewDataMapping`, findings returned in
 * the preview response, never persisted, D-22) — both sides produce the exact same
 * `MappingSnapshot` shape (`src/domain/comparison/snapshot.ts`), so this engine never knows which
 * source it is looking at.
 *
 * Checks implemented (plan table):
 * - `unmapped_standard_event` (warning): a discriminator allowed value carrying a `standard_event`
 *   hint (set by `dataMappingImport.service.ts`'s `planEventProperty` when the mapping first
 *   proposed the value) whose standard event key has no mapping at all, or is mapped with
 *   `eventType: null`.
 * - `unmapped_property` (warning): a mapped standard event's *required* custom-event property is
 *   not represented by any field in that standard event's field map, nor by a discriminator the
 *   mapping's `filter` already represents (fix round WARNING 5) — a required discriminator with a
 *   variant filter condition on it (e.g. `cart_update.action` on the `add_to_cart` mapping's
 *   `action=add` filter) is represented by the filter, not the field map, so it is never flagged. A
 *   property matching `SDK_DEFAULT_PROPERTIES` (`os`/`browser`/`device`/`location`) is never flagged
 *   either (fix round LOW 6, the same engine-wide rule comparison 3 applies).
 * - `rename_mismatch` (warning), three sources: (a) a mapped field's property is not actually linked
 *   to the mapped event, or its `payload_key ?? name` differs from the field name; (b) a mapping
 *   consent name differs from the definition-side consent category tagged with that standard key;
 *   (c) fix round WARNING 3: a definition-side consent category exists with no `standard_key` tag
 *   while at least one standard consent key has no mapping (`mapping.consents[key] === null`) — an
 *   untagged category left sitting next to an unfilled standard slot is exactly the ambiguous state
 *   this row exists to flag, independent of whether the two happen to share a name.
 * - `unmapped_catalog` (warning): a Catalog exists in the definition (`hasCatalog`) while the
 *   mapping's `catalogs.main`/`catalogs.variant` are both empty.
 *
 * Fix round WARNING 4 (`snapshot.ts`): a `StandardEventMapping` whose `variant_id` no longer
 * resolves to an existing `Variant` (the variant was deleted after the mapping was made) is
 * projected as fully unmapped (`eventType: null`, not a faked empty `filter`) so this module's
 * `unmapped_standard_event` check — and comparison 2's per-event checks — see it as "not really
 * mapped" rather than as a valid event-level (no-variant) mapping.
 *
 * Not implemented (documented gap, T-2-05 scope note): the plan's "preview only: pasted expiration
 * or mapping differs from the stored definition" `expiration_mismatch` row — no test requires it and
 * it needs a second full expiration-settings snapshot this task does not otherwise touch; left for a
 * later task.
 */
import type { ComparisonId } from '../enums';
import type { DefEvent } from './definitionVsObservations';
import type { EngineFinding } from './definitionVsObservations';
import type { DefConsentCategory, MappingSnapshot } from './snapshot';
import { SDK_DEFAULT_PROPERTIES } from '../bloomreach';

export interface DefinitionVsMappingInput {
  events: DefEvent[];
  hasCatalog: boolean;
  consentCategories: DefConsentCategory[];
}

const COMPARISON: ComparisonId = 'definition_vs_mapping';

function fp(kind: EngineFinding['kind'], eventId: string | null, propertyId: string | null, detail: string): string {
  return [COMPARISON, kind, eventId ?? '', '', propertyId ?? '', detail].join('|');
}

function payloadKeyFor(prop: { payload_key: string | null; name: string }): string {
  return prop.payload_key ?? prop.name;
}

export function runDefinitionVsMapping(definition: DefinitionVsMappingInput, mapping: MappingSnapshot): EngineFinding[] {
  const findings: EngineFinding[] = [];
  const mappingByKey = new Map(mapping.standardEvents.map((se) => [se.key, se]));
  const customEvents = definition.events.filter((e) => e.class === 'custom');

  // ---- unmapped_standard_event: a discriminator value hinting at a standard event key that is not mapped ----
  const seenHintKeys = new Set<string>();
  for (const event of customEvents) {
    for (const prop of event.properties) {
      if (prop.role !== 'discriminator' || !prop.allowed_value_hints) continue;
      for (const hint of prop.allowed_value_hints) {
        if (!hint.standard_event || seenHintKeys.has(hint.standard_event)) continue;
        const se = mappingByKey.get(hint.standard_event);
        if (se && se.eventType) continue; // mapped
        seenHintKeys.add(hint.standard_event);
        findings.push({
          comparison: COMPARISON,
          kind: 'unmapped_standard_event',
          severity: 'warning',
          event_id: event.id,
          variant_id: null,
          property_id: prop.property_id,
          observation_id: null,
          expected_json: { standard_event: hint.standard_event },
          actual_json: null,
          message: `Standard event "${hint.standard_event}" (hinted by property "${prop.name}"'s allowed value "${hint.value}") has no mapping.`,
          fingerprint: fp('unmapped_standard_event', event.id, prop.property_id, hint.standard_event),
        });
      }
    }
  }

  // ---- unmapped_property / rename_mismatch (field map) on mapped standard events ----
  for (const se of mapping.standardEvents) {
    if (!se.eventType) continue;
    const event = customEvents.find((e) => e.name === se.eventType);
    if (!event) continue;

    const mappedPropertyNames = new Set(Object.values(se.fieldMap).filter((v): v is string => v !== null));
    // WARNING 5 fix: a required discriminator represented by the mapping's own `filter` (a variant
    // condition, e.g. `action=add`) is represented, even though the field map never mentions it.
    const filterPropertyNames = new Set(se.filter.map((c) => c.property));

    // unmapped_property: a required property on the mapped event absent from every field of this
    // mapping and from its filter; SDK default properties are never flagged (LOW 6 fix).
    for (const prop of event.properties) {
      if (!prop.required) continue;
      if (mappedPropertyNames.has(prop.name)) continue;
      if (filterPropertyNames.has(prop.name)) continue;
      if (SDK_DEFAULT_PROPERTIES.includes(payloadKeyFor(prop))) continue;
      findings.push({
        comparison: COMPARISON,
        kind: 'unmapped_property',
        severity: 'warning',
        event_id: event.id,
        variant_id: null,
        property_id: prop.property_id,
        observation_id: null,
        expected_json: { standard_event: se.key, property: prop.name },
        actual_json: null,
        message: `Required property "${prop.name}" on event "${event.name}" is not represented in the "${se.key}" standard event mapping's field map.`,
        fingerprint: fp('unmapped_property', event.id, prop.property_id, se.key),
      });
    }

    // rename_mismatch: a mapped field's property is not linked to the event, or its payload_key ?? name differs from the field name.
    for (const [field, propName] of Object.entries(se.fieldMap)) {
      if (!propName) continue;
      const prop = event.properties.find((p) => p.name === propName);
      if (!prop) {
        findings.push({
          comparison: COMPARISON,
          kind: 'rename_mismatch',
          severity: 'warning',
          event_id: event.id,
          variant_id: null,
          property_id: null,
          observation_id: null,
          expected_json: { standard_event: se.key, field, property: propName },
          actual_json: null,
          message: `"${se.key}.${field}" maps to property "${propName}", which is not linked to event "${event.name}".`,
          fingerprint: fp('rename_mismatch', event.id, null, `${se.key}:${field}`),
        });
        continue;
      }
      const expectedKey = payloadKeyFor(prop);
      if (expectedKey === field) continue;
      findings.push({
        comparison: COMPARISON,
        kind: 'rename_mismatch',
        severity: 'warning',
        event_id: event.id,
        variant_id: null,
        property_id: prop.property_id,
        observation_id: null,
        expected_json: { field, payload_key: expectedKey },
        actual_json: { field },
        message: `"${se.key}.${field}" maps to property "${propName}" whose payload key ("${expectedKey}") differs from the standard field name ("${field}").`,
        fingerprint: fp('rename_mismatch', event.id, prop.property_id, `${se.key}:${field}`),
      });
    }
  }

  // ---- rename_mismatch (consent): mapping consent name differs from the definition category tagged with that standard key ----
  for (const [stdKey, mappedName] of Object.entries(mapping.consents)) {
    if (!mappedName) continue;
    const category = definition.consentCategories.find((c) => c.standard_key === stdKey);
    if (!category || category.name === mappedName) continue;
    findings.push({
      comparison: COMPARISON,
      kind: 'rename_mismatch',
      severity: 'warning',
      event_id: null,
      variant_id: null,
      property_id: null,
      observation_id: null,
      expected_json: { standard_key: stdKey, category_name: category.name },
      actual_json: { mapped_name: mappedName },
      message: `Consent key "${stdKey}" mapping names "${mappedName}", but the definition's consent category tagged "${stdKey}" is named "${category.name}".`,
      fingerprint: fp('rename_mismatch', null, null, `consent:${stdKey}`),
    });
  }

  // ---- rename_mismatch (consent, WARNING 3 fix): a definition consent category with no
  // `standard_key` tag while at least one standard consent key's mapping is unfilled (null) ----
  const hasUnfilledStandardKey = Object.values(mapping.consents).some((v) => v === null || v === undefined);
  if (hasUnfilledStandardKey) {
    for (const category of definition.consentCategories) {
      if (category.standard_key !== null) continue;
      findings.push({
        comparison: COMPARISON,
        kind: 'rename_mismatch',
        severity: 'warning',
        event_id: null,
        variant_id: null,
        property_id: null,
        observation_id: null,
        expected_json: { category_name: category.name },
        actual_json: { standard_key: null },
        message: `Consent category "${category.name}" has no standard_key tag, while at least one standard consent key has no mapping.`,
        fingerprint: fp('rename_mismatch', null, null, `consent_untagged:${category.name}`),
      });
    }
  }

  // ---- unmapped_catalog: a Catalog exists but the mapping's catalog block is empty ----
  if (definition.hasCatalog && mapping.catalogs.main === null && mapping.catalogs.variant === null) {
    findings.push({
      comparison: COMPARISON,
      kind: 'unmapped_catalog',
      severity: 'warning',
      event_id: null,
      variant_id: null,
      property_id: null,
      observation_id: null,
      expected_json: null,
      actual_json: null,
      message: 'A Catalog exists in the definition, but the mapping\'s catalogs.main and catalogs.variant are both empty.',
      fingerprint: fp('unmapped_catalog', null, null, 'catalogs'),
    });
  }

  return findings;
}
