/**
 * Engine tests for comparison 2 (T-2-05), against the real `data-mapping.json`/
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

function definitionEvents(): DefEvent[] {
  return [cartUpdate, managedEndpoint];
}

/** Resolves each raw fixture event to `cart_update`/`managed_endpoint` by name; everything else stays unresolved (id null), matching how comparison 2 ignores what it cannot resolve. */
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

  it('produces nothing from sdk/platform-resolved observations (managed_endpoint has zero mapped fields to check)', () => {
    const observations = toEngineObservations(parsedEvents);
    const managedEndpointObs = observations.filter((o) => o.event_type === 'managed_endpoint');
    expect(managedEndpointObs.length).toBeGreaterThan(0);
    const findings = runMappingVsObservations(definitionEvents(), mapping, observations);
    expect(findings.some((f) => f.event_id === 'event_managed_endpoint')).toBe(false);
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
});
