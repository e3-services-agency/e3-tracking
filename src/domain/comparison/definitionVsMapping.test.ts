/**
 * Engine tests for comparison 1 (T-2-05), against the real `data-mapping.json` fixture (parsed the
 * same way `previewDataMapping` does) and a hand-built `DefinitionVsMappingInput` matching what the
 * fixture, once applied, defines.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runDefinitionVsMapping, type DefinitionVsMappingInput } from './definitionVsMapping';
import { parseDataMapping, type DataMappingModel } from '../import/dataMapping';
import type { MappingSnapshot } from './snapshot';
import type { DefEvent } from './definitionVsObservations';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureJson = JSON.parse(readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8'));

/** Same projection `previewDataMapping` will use (T-2-05): `DataMappingModel` -> `MappingSnapshot`. */
function toMappingSnapshot(model: DataMappingModel): MappingSnapshot {
  return {
    standardEvents: model.standardEvents.map((se) => ({ key: se.key, eventType: se.eventType, filter: se.filter, fieldMap: se.fieldMap })),
    customerProperties: model.customerProperties,
    consents: model.consents,
    catalogs: { main: model.catalogs.main, variant: model.catalogs.variant },
  };
}

function buildDefinition(): DefinitionVsMappingInput {
  const cartUpdate: DefEvent = {
    id: 'event_cart_update',
    name: 'cart_update',
    status: 'implemented',
    class: 'custom',
    expiration: null,
    properties: [
      {
        property_id: 'prop_action',
        name: 'action',
        payload_key: null,
        role: 'discriminator',
        required: true,
        data_type: 'string',
        data_formats: [],
        allowed_values: ['add'],
        allowed_value_hints: [{ value: 'add', standard_event: 'add_to_cart' }],
      },
      { property_id: 'prop_product_id', name: 'product_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
      { property_id: 'prop_total_price', name: 'total_price', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: ['money'], allowed_values: null },
      { property_id: 'prop_total_quantity', name: 'total_quantity', payload_key: null, role: 'normal', required: false, data_type: 'number', data_formats: [], allowed_values: null },
    ],
  };
  const purchase: DefEvent = {
    id: 'event_purchase',
    name: 'purchase',
    status: 'implemented',
    class: 'custom',
    expiration: null,
    properties: [
      { property_id: 'prop_purchase_status', name: 'purchase_status', payload_key: null, role: 'discriminator', required: true, data_type: 'string', data_formats: [], allowed_values: ['success'], allowed_value_hints: [{ value: 'success', standard_event: 'purchase' }] },
      { property_id: 'prop_purchase_id', name: 'purchase_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
      { property_id: 'prop_p_total_price', name: 'total_price', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: ['money'], allowed_values: null },
      { property_id: 'prop_product_ids', name: 'product_ids', payload_key: null, role: 'normal', required: false, data_type: 'string', data_formats: [], allowed_values: null },
      { property_id: 'prop_product_list', name: 'product_list', payload_key: null, role: 'normal', required: false, data_type: 'array', data_formats: [], allowed_values: null },
      { property_id: 'prop_voucher_code', name: 'voucher_code', payload_key: null, role: 'normal', required: false, data_type: 'string', data_formats: [], allowed_values: null },
    ],
  };
  const purchaseItem: DefEvent = {
    id: 'event_purchase_item',
    name: 'purchase_item',
    status: 'implemented',
    class: 'custom',
    expiration: null,
    properties: [
      { property_id: 'prop_pi_purchase_id', name: 'purchase_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
      { property_id: 'prop_price', name: 'price', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: ['money'], allowed_values: null },
      { property_id: 'prop_quantity', name: 'quantity', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: [], allowed_values: null },
      { property_id: 'prop_pi_product_id', name: 'product_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
    ],
  };
  const checkout: DefEvent = { id: 'event_checkout', name: 'checkout', status: 'implemented', class: 'custom', expiration: null, properties: [] };
  const viewItem: DefEvent = {
    id: 'event_view_item',
    name: 'view_item',
    status: 'implemented',
    class: 'custom',
    expiration: null,
    properties: [
      { property_id: 'prop_vi_product_id', name: 'product_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
      { property_id: 'prop_vi_price', name: 'price', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: ['money'], allowed_values: null },
      { property_id: 'prop_vi_stock_level', name: 'stock_level', payload_key: null, role: 'normal', required: false, data_type: 'number', data_formats: [], allowed_values: null },
      { property_id: 'prop_vi_title', name: 'title', payload_key: null, role: 'normal', required: false, data_type: 'string', data_formats: [], allowed_values: null },
    ],
  };

  return {
    events: [cartUpdate, purchase, purchaseItem, checkout, viewItem],
    hasCatalog: true,
    consentCategories: [{ name: 'brand_consent', standard_key: 'newsletter' }],
  };
}

describe('runDefinitionVsMapping', () => {
  it('reports unmapped_catalog when a Catalog exists and the mapping catalogs block is empty (fixture)', () => {
    const model = parseDataMapping(fixtureJson);
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(buildDefinition(), mapping);
    const catalogFindings = findings.filter((f) => f.kind === 'unmapped_catalog');
    expect(catalogFindings).toHaveLength(1);
    expect(catalogFindings[0].severity).toBe('warning');
  });

  it('reports no unmapped_catalog when the definition has no Catalog', () => {
    const model = parseDataMapping(fixtureJson);
    const mapping = toMappingSnapshot(model);
    const definition = { ...buildDefinition(), hasCatalog: false };
    const findings = runDefinitionVsMapping(definition, mapping);
    expect(findings.some((f) => f.kind === 'unmapped_catalog')).toBe(false);
  });

  it('reports rename_mismatch when a consent is renamed in the pasted mapping', () => {
    const mutated = JSON.parse(JSON.stringify(fixtureJson));
    mutated.consents.newsletter = 'newsletter_consent'; // fixture has "brand_consent"; definition category is also "brand_consent"
    const model = parseDataMapping(mutated);
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(buildDefinition(), mapping);
    const consentMismatch = findings.filter((f) => f.kind === 'rename_mismatch' && f.fingerprint.endsWith('consent:newsletter'));
    expect(consentMismatch).toHaveLength(1);
    expect(consentMismatch[0].severity).toBe('warning');
    expect(consentMismatch[0].message).toContain('newsletter_consent');
  });

  it('reports no consent rename_mismatch when the mapping matches the definition (fixture as-is)', () => {
    const model = parseDataMapping(fixtureJson);
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(buildDefinition(), mapping);
    expect(findings.some((f) => f.kind === 'rename_mismatch' && f.fingerprint.includes('consent:'))).toBe(false);
  });

  it('reports unmapped_standard_event when a discriminator value hints at a standard event with no mapping', () => {
    const definition = buildDefinition();
    definition.events = definition.events.map((e) =>
      e.name === 'cart_update'
        ? {
            ...e,
            properties: e.properties.map((p) =>
              p.name === 'action'
                ? { ...p, allowed_values: ['add', 'remove'], allowed_value_hints: [...(p.allowed_value_hints ?? []), { value: 'remove', standard_event: 'remove_from_cart' }] }
                : p
            ),
          }
        : e
    );
    const model = parseDataMapping(fixtureJson); // remove_from_cart has event: null in the fixture
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(definition, mapping);
    const unmapped = findings.filter((f) => f.kind === 'unmapped_standard_event');
    expect(unmapped.map((f) => (f.expected_json as { standard_event: string }).standard_event)).toContain('remove_from_cart');
  });

  it('reports unmapped_property when a required property on a mapped event is absent from the field map', () => {
    const definition = buildDefinition();
    definition.events = definition.events.map((e) =>
      e.name === 'purchase'
        ? { ...e, properties: [...e.properties, { property_id: 'prop_made_up', name: 'not_in_mapping', payload_key: null, role: 'normal' as const, required: true, data_type: 'string', data_formats: [], allowed_values: null }] }
        : e
    );
    const model = parseDataMapping(fixtureJson);
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(definition, mapping);
    const unmapped = findings.filter((f) => f.kind === 'unmapped_property' && f.property_id === 'prop_made_up');
    expect(unmapped).toHaveLength(1);
  });

  it('reports rename_mismatch when a field map points at a property not linked to the event', () => {
    const mutated = JSON.parse(JSON.stringify(fixtureJson));
    mutated.standard_events.purchase.total_price = { property: 'ghost_property' };
    const model = parseDataMapping(mutated);
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(buildDefinition(), mapping);
    const rename = findings.filter((f) => f.kind === 'rename_mismatch' && f.fingerprint.includes('purchase:total_price'));
    expect(rename).toHaveLength(1);
    expect(rename[0].message).toContain('ghost_property');
  });
});
