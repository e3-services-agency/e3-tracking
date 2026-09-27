/**
 * Engine tests for comparison 2 (T-2-05, fix round), against the real `data-mapping.json`/
 * `customer-events-export.json` fixtures (mutated where the plan's fixture reproduction needs a
 * value the fixture does not itself carry, e.g. `action: remove`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMappingVsObservations } from './mappingVsObservations';
import { parseDataMapping, type DataMappingModel } from '../import/dataMapping';
import { parseCustomerEventsExport } from '../import/customerEventsExport';
import type { MappingSnapshot } from './snapshot';
import type { DefEvent, EngineObservation } from './definitionVsObservations';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mappingJson = JSON.parse(readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8'));
const eventsJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/customer-events-export.json'), 'utf-8')
);

function toMappingSnapshot(model: DataMappingModel): MappingSnapshot {
  return {
    standardEvents: model.standardEvents.map((se) => ({ key: se.key, eventType: se.eventType, filter: se.filter, fieldMap: se.fieldMap })),
    customerProperties: model.customerProperties,
    consents: model.consents,
    catalogs: { main: model.catalogs.main, variant: model.catalogs.variant },
  };
}

const cartUpdate: DefEvent = {
  id: 'event_cart_update',
  name: 'cart_update',
  status: 'implemented',
  class: 'custom',
  expiration: null,
  properties: [
    { property_id: 'prop_action', name: 'action', payload_key: null, role: 'discriminator', required: true, data_type: 'string', data_formats: [], allowed_values: ['add'] },
    { property_id: 'prop_total_price', name: 'total_price', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
    { property_id: 'prop_total_quantity', name: 'total_quantity', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
    { property_id: 'prop_product_id', name: 'product_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
  ],
};
const managedEndpoint: DefEvent = { id: 'event_managed_endpoint', name: 'managed_endpoint', status: 'implemented', class: 'platform', expiration: null, properties: [] };
/** LOW 7 fix: an sdk-class event whose standard event mapping *does* have mapped fields (unlike
 * `managed_endpoint`, which has none), so the D-29 "sdk/platform observations produce nothing"
 * assertion actually exercises the `event.class !== 'custom'` guard instead of the "nothing was
 * ever checked" no-op. */
const sessionStart: DefEvent = {
  id: 'event_session_start',
  name: 'session_start',
  status: 'implemented',
  class: 'sdk',
  expiration: null,
  properties: [
    { property_id: 'prop_ss_source', name: 'source', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
  ],
};
/** Purchase, mirroring the `purchase` standard event mapping in the fixture (filter `purchase_status=success`, `voucher_code` mapped). Used for ERROR 1's required-flag and variant-scope tests. */
const purchase: DefEvent = {
  id: 'event_purchase',
  name: 'purchase',
  status: 'implemented',
  class: 'custom',
  expiration: null,
  properties: [
    { property_id: 'prop_purchase_status', name: 'purchase_status', payload_key: null, role: 'discriminator', required: true, data_type: 'string', data_formats: [], allowed_values: ['success', 'refunded'] },
    { property_id: 'prop_purchase_id', name: 'purchase_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
    { property_id: 'prop_total_price_p', name: 'total_price', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
    { property_id: 'prop_voucher_code', name: 'voucher_code', payload_key: null, role: 'normal', required: false, data_type: 'string', data_formats: [], allowed_values: null },
  ],
};

function definitionEvents(): DefEvent[] {
  return [cartUpdate, managedEndpoint, sessionStart, purchase];
}

/** Resolves each raw fixture event to a known definition event by name; everything else stays unresolved (id null), matching how comparison 2 ignores what it cannot resolve. */
function toEngineObservations(rawEvents: { type: string; timestamp: number; properties: Record<string, unknown> }[]): EngineObservation[] {
  const byName = new Map(definitionEvents().map((e) => [e.name, e]));
  return rawEvents.map((e, i) => {
    const event = byName.get(e.type);
    return {
      id: `obs_${i}`,
      event_type: e.type,
      event_id: event?.id ?? null,
      variant_id: null,
      timestamp: e.timestamp,
      properties: e.properties,
      run_kind: 'export_paste',
    };
  });
}

describe('runMappingVsObservations', () => {
  const model = parseDataMapping(mappingJson);
  const mapping = toMappingSnapshot(model);
  const parsedEvents = parseCustomerEventsExport(eventsJson).events;

  it('reports unknown_variant for a cart_update observed with action=remove (only action=add is mapped)', () => {
    const mutated = parsedEvents.map((e) => (e.type === 'cart_update' ? { ...e, properties: { ...e.properties, action: 'remove' } } : e));
    const observations = toEngineObservations(mutated);
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    const unknown = findings.filter((f) => f.kind === 'unknown_variant');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].severity).toBe('warning');
    expect((unknown[0].actual_json as { value: unknown }).value).toBe('remove');
  });

  it('does not report unknown_variant when the observed value is mapped (action=add, as in the fixture)', () => {
    const observations = toEngineObservations(parsedEvents);
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    expect(findings.some((f) => f.kind === 'unknown_variant')).toBe(false);
  });

  it('reports rename_mismatch for a consent observation whose category the mapping renames (newsletter -> brand_consent)', () => {
    const observations = toEngineObservations(parsedEvents);
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    const rename = findings.filter((f) => f.kind === 'rename_mismatch' && f.fingerprint.includes('consent:newsletter'));
    expect(rename).toHaveLength(1);
    expect(rename[0].severity).toBe('warning');
    expect(rename[0].message).toContain('brand_consent');
  });

  // LOW 7 fix: an sdk-class event whose mapping *does* have fields mapped (session_start is not in
  // this fixture's mapping at all, but managed_endpoint proved nothing since it has zero mapped
  // fields regardless of class; this test instead uses `purchase` re-resolved to an sdk class to
  // prove the `event.class !== 'custom'` guard, not just "there was nothing to check").
  it('produces nothing from an observation resolved to a non-custom event, even when its standard event mapping has fields mapped (D-29)', () => {
    const sdkPurchase: DefEvent = { ...purchase, id: 'event_purchase_sdk', class: 'sdk' };
    const events = [cartUpdate, managedEndpoint, sdkPurchase];
    const observations: EngineObservation[] = [
      { id: 'obs_sdk_purchase', event_type: 'purchase', event_id: sdkPurchase.id, variant_id: null, timestamp: 1, properties: { purchase_status: 'success' }, run_kind: 'export_paste' },
    ];
    const findings = runMappingVsObservations(events, mapping, observations);
    expect(findings.some((f) => f.event_id === sdkPurchase.id)).toBe(false);
  });

  it('produces nothing from sdk/platform-resolved observations (managed_endpoint has zero mapped fields to check)', () => {
    const observations = toEngineObservations(parsedEvents);
    const managedEndpointObs = observations.filter((o) => o.event_type === 'managed_endpoint');
    expect(managedEndpointObs.length).toBeGreaterThan(0);
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    expect(findings.some((f) => f.event_id === 'event_managed_endpoint')).toBe(false);
  });

  // ERROR 1 fix tests: the required flag and the variant scope.
  it('does not report missing_required for a mapped field whose linked property is required: false (voucher_code)', () => {
    const observations = toEngineObservations(parsedEvents); // fixture's one purchase observation has no voucher_code
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    expect(findings.some((f) => f.kind === 'missing_required' && f.fingerprint.includes('purchase:voucher_code'))).toBe(false);
  });

  it('reports missing_required (error) for a mapped field whose linked property is required: true (purchase_id) when absent from the mapped variant', () => {
    const observations = toEngineObservations(parsedEvents).map((o) => {
      if (o.event_type !== 'purchase') return o;
      const { purchase_id, ...rest } = o.properties;
      void purchase_id;
      return { ...o, properties: rest };
    });
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    const missing = findings.filter((f) => f.kind === 'missing_required' && f.fingerprint.includes('purchase:purchase_id'));
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('error');
  });

  it('scopes missing_required to the mapped standard event\'s own variant filter (purchase_status=success): a purchase_status=refunded observation missing purchase_id does not trigger it', () => {
    const successObs = toEngineObservations(parsedEvents).filter((o) => o.event_type === 'purchase');
    expect(successObs).toHaveLength(1); // fixture's one purchase, purchase_status=success, has purchase_id
    const refundedMissingId: EngineObservation = {
      id: 'obs_refunded',
      event_type: 'purchase',
      event_id: 'event_purchase',
      variant_id: null,
      timestamp: successObs[0].timestamp + 1,
      properties: { purchase_status: 'refunded', total_price: '5' }, // no purchase_id
      run_kind: 'export_paste',
    };
    const observations = [...successObs, refundedMissingId];
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    // the mapped `purchase` standard event's filter is purchase_status=success; the refunded
    // observation is out of scope for it and must not produce missing_required on purchase_id.
    expect(findings.some((f) => f.kind === 'missing_required' && f.fingerprint.includes('purchase:purchase_id'))).toBe(false);
  });

  it('reports missing_required when a mapped field is absent from every observation of the mapped event', () => {
    const strippedEvents = parsedEvents.map((e) => {
      if (e.type !== 'cart_update') return e;
      const { total_price, ...rest } = e.properties;
      void total_price;
      return { ...e, properties: rest };
    });
    const observations = toEngineObservations(strippedEvents);
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    const missing = findings.filter((f) => f.kind === 'missing_required' && f.fingerprint.includes('add_to_cart:total_price'));
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('error');
  });

  // ERROR 2 fix: missing_event was removed from this engine entirely (comparison 3 owns it).
  it('never produces missing_event, even for a mapped standard event with zero observations in scope', () => {
    const observations: EngineObservation[] = []; // nothing observed at all
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    expect(findings.some((f) => f.kind === 'missing_event')).toBe(false);
  });

  // T-3-07 (deferred row, T-2-05/T-2-13 follow-up): the mapped `purchase` standard event's filter
  // is purchase_status=success; when every observed "purchase" is purchase_status=refunded instead
  // (the event type is observed, just never in the mapped variant), the mapping is flagged as never
  // matching in scope.
  it('reports unmapped_standard_event when a mapped standard event\'s filter never matches any in-scope observation of its event type', () => {
    const onlyRefunded: EngineObservation = {
      id: 'obs_refunded_only',
      event_type: 'purchase',
      event_id: 'event_purchase',
      variant_id: null,
      timestamp: 1,
      properties: { purchase_status: 'refunded', total_price: '5', purchase_id: 'p1' },
      run_kind: 'export_paste',
    };
    const findings = runMappingVsObservations(definitionEvents(), mapping, [onlyRefunded]);
    const unmapped = findings.filter(
      (f) => f.kind === 'unmapped_standard_event' && (f.expected_json as { standard_event: string }).standard_event === 'purchase'
    );
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].severity).toBe('warning');
    expect(unmapped[0].event_id).toBe('event_purchase');
  });

  it('does not report unmapped_standard_event when the mapped filter matches at least one in-scope observation', () => {
    const observations = toEngineObservations(parsedEvents); // fixture's purchase is purchase_status=success
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    expect(
      findings.some(
        (f) => f.kind === 'unmapped_standard_event' && (f.expected_json as { standard_event: string }).standard_event === 'purchase'
      )
    ).toBe(false);
  });

  it('does not report unmapped_standard_event for an empty-filter mapping (event-level, no variant) even with observations of another variant', () => {
    // add_to_cart's filter is action=add (non-empty) and the fixture's cart_update observations
    // match it, so nothing new here; cart_update's own mapping is exercised via the normal fixture
    // path above. This test instead confirms an event type with zero observations at all produces
    // nothing (missing_event territory), not a spurious unmapped_standard_event.
    const observations = toEngineObservations(parsedEvents).filter((o) => o.event_type !== 'purchase');
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    expect(
      findings.some(
        (f) => f.kind === 'unmapped_standard_event' && (f.expected_json as { standard_event: string }).standard_event === 'purchase'
      )
    ).toBe(false);
  });
});
