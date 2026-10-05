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
import { buildMappingSnapshotFromDefinition } from './snapshot';
import type { MappingSnapshot } from './snapshot';
import type { DefEvent, DefinitionSnapshot } from './definitionVsObservations';

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

  // T-3-07 follow-up (T-2-05 review): an empty-filter mapping of a hinted standard event onto the
  // same event is as unmapped as no mapping at all, since it fails to distinguish the discriminator
  // value the hint names from the event's other discriminator values.
  it('reports unmapped_standard_event when a mapping matches its event with an empty filter, even though the standard event is technically mapped', () => {
    const definition = buildDefinition();
    const model = parseDataMapping(fixtureJson);
    const mapping = toMappingSnapshot(model);
    const emptyFilterMapping: MappingSnapshot = {
      ...mapping,
      standardEvents: mapping.standardEvents.map((se) =>
        se.key === 'add_to_cart' ? { ...se, filter: [] } : se
      ),
    };
    const findings = runDefinitionVsMapping(definition, emptyFilterMapping);
    const unmapped = findings.filter((f) => f.kind === 'unmapped_standard_event');
    expect(unmapped.map((f) => (f.expected_json as { standard_event: string }).standard_event)).toContain(
      'add_to_cart'
    );
    expect(unmapped.find((f) => (f.expected_json as { standard_event: string }).standard_event === 'add_to_cart')?.message).toContain(
      'empty filter'
    );
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

  // WARNING 3 fix: a consent category with no standard_key tag while a standard key is unfilled.
  it('reports rename_mismatch for a consent category with no standard_key while a standard key is unfilled', () => {
    const model = parseDataMapping(fixtureJson); // fixture leaves sms/marketing/etc. unmapped (null)
    const mapping = toMappingSnapshot(model);
    const definition = { ...buildDefinition(), consentCategories: [{ name: 'sms_consent', standard_key: null }] };
    const findings = runDefinitionVsMapping(definition, mapping);
    const untagged = findings.filter((f) => f.kind === 'rename_mismatch' && f.fingerprint.includes('consent_untagged:sms_consent'));
    expect(untagged).toHaveLength(1);
    expect(untagged[0].severity).toBe('warning');
  });

  it('does not report the untagged-category rename_mismatch when every consent category is tagged', () => {
    const model = parseDataMapping(fixtureJson);
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(buildDefinition(), mapping); // buildDefinition's one category is tagged "newsletter"
    expect(findings.some((f) => f.fingerprint.includes('consent_untagged:'))).toBe(false);
  });

  // WARNING 4 fix: a mapping whose variant_id no longer resolves to an existing Variant is
  // projected (via snapshot.ts) as fully unmapped, so it still reports unmapped_standard_event.
  it('reports unmapped_standard_event when a mapping points at a variant that no longer exists', () => {
    const definitionSnapshot: DefinitionSnapshot = {
      project_default_expiration: null,
      events: [
        {
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
          ],
        },
      ],
      variants: [], // the variant the mapping below points at ("v_gone") does not exist
      standard_event_mappings: [{ standard_event: 'add_to_cart', event_id: 'event_cart_update', variant_id: 'v_gone', field_map: {} }],
    };
    const mappingSnapshot = buildMappingSnapshotFromDefinition(
      definitionSnapshot,
      [{ key: 'add_to_cart', fields: ['product_id'] }],
      [],
      [],
      {},
      { main: null, variant: null }
    );
    expect(mappingSnapshot.standardEvents[0].eventType).toBeNull();
    expect(mappingSnapshot.standardEvents[0].filter).toEqual([]);
    const findings = runDefinitionVsMapping({ events: definitionSnapshot.events, hasCatalog: false, consentCategories: [] }, mappingSnapshot);
    const unmapped = findings.filter((f) => f.kind === 'unmapped_standard_event');
    expect(unmapped.map((f) => (f.expected_json as { standard_event: string }).standard_event)).toContain('add_to_cart');
  });

  // WARNING 5 fix / LOW 6 fix: unmapped_property excludes properties represented by the mapping's
  // filter (discriminators in variant conditions) and SDK default properties.
  it('does not report unmapped_property for a required discriminator represented by the mapping filter', () => {
    const model = parseDataMapping(fixtureJson); // add_to_cart's filter is action=add; field map has no "action" field
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(buildDefinition(), mapping);
    expect(findings.some((f) => f.kind === 'unmapped_property' && f.property_id === 'prop_action')).toBe(false);
  });

  it('does not report unmapped_property for a required SDK default property (os/browser/device/location)', () => {
    const definition = buildDefinition();
    definition.events = definition.events.map((e) =>
      e.name === 'purchase'
        ? { ...e, properties: [...e.properties, { property_id: 'prop_os', name: 'os', payload_key: null, role: 'normal' as const, required: true, data_type: 'string', data_formats: [], allowed_values: null }] }
        : e
    );
    const model = parseDataMapping(fixtureJson);
    const mapping = toMappingSnapshot(model);
    const findings = runDefinitionVsMapping(definition, mapping);
    expect(findings.some((f) => f.kind === 'unmapped_property' && f.property_id === 'prop_os')).toBe(false);
  });
});

describe('naming_violation (D-65, T-4-22)', () => {
  const prop = (property_id: string, name: string, extra: Partial<DefEvent['properties'][number]> = {}): DefEvent['properties'][number] => ({
    property_id,
    name,
    payload_key: null,
    role: 'normal',
    required: false,
    data_type: 'string',
    data_formats: [],
    allowed_values: null,
    ...extra,
  });
  const ev = (id: string, name: string, cls: DefEvent['class'], properties: DefEvent['properties']): DefEvent => ({
    id,
    name,
    status: 'implemented',
    class: cls,
    expiration: null,
    properties,
  });
  const empty: MappingSnapshot = {
    standardEvents: [],
    customerProperties: {},
    consents: {},
    catalogs: { main: null, variant: null },
  };
  const run = (input: Partial<DefinitionVsMappingInput>) =>
    runDefinitionVsMapping({ events: [], hasCatalog: false, consentCategories: [], ...input }, empty).filter((f) => f.kind === 'naming_violation');

  it('flags nonconforming custom event, event property and customer property names as warnings', () => {
    const findings = run({
      namingConvention: 'snake_case',
      events: [ev('e1', 'orderPlaced', 'custom', [prop('p1', 'orderTotal'), prop('p2', 'order_id')])],
      customerProperties: [{ id: 'c1', name: 'loyalty-tier' }],
    });
    expect(findings.map((f) => [f.event_id, f.property_id, f.severity])).toEqual([
      ['e1', null, 'warning'],
      ['e1', 'p1', 'warning'],
      [null, 'c1', 'warning'],
    ]);
    expect(findings[0].message).toContain('snake_case');
    expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(3);
  });

  it('exempts sdk/platform events, SDK default and system customer properties', () => {
    const findings = run({
      namingConvention: 'snake_case',
      events: [
        ev('e1', 'sessionStart', 'sdk', [prop('p1', 'someProp')]),
        ev('e2', 'my_event', 'custom', [prop('p2', 'os'), prop('p3', 'device')]),
      ],
      customerProperties: [{ id: 'c1', name: 'first_name' }, { id: 'c2', name: 'email' }],
    });
    expect(findings).toEqual([]);
  });

  it('follows the configured convention and reports a shared property once', () => {
    const shared = prop('p1', 'order_total');
    const findings = run({
      namingConvention: 'camel_case',
      events: [ev('e1', 'orderPlaced', 'custom', [shared]), ev('e2', 'orderShipped', 'custom', [shared])],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].property_id).toBe('p1');
  });

  it('runs no naming check when the input carries no convention', () => {
    expect(run({ events: [ev('e1', 'orderPlaced', 'custom', [])] })).toEqual([]);
  });
});
