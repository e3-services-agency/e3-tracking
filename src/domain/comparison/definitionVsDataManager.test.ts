/**
 * Engine tests for comparison 4 (T-2-04), against the real `data-manager-events.json`/
 * `data-manager-customers.json` fixtures and a test definition that links the properties the plan's
 * "Comparison 4" table names (PLAN "Comparison engine design" > "Comparison 4", fixture
 * expectation): `type_mismatch` for `purchase_item.price`/`quantity`, `cart_update.total_price`/
 * `total_quantity`, `checkout.total_price`, `view_item.price`/`stock_level`; none for
 * `purchase.total_price`; `unexpected_property` on `purchase`'s many unlinked Data Manager
 * properties (e.g. `payment_method`, `region`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runDefinitionVsDataManager, type DataManagerDefinitionSnapshot } from './definitionVsDataManager';
import { parseDataManagerEvents } from '../import/dataManagerEvents';
import { parseDataManagerCustomers } from '../import/dataManagerCustomers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const eventsJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-manager-events.json'), 'utf-8')
);
const customersJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-manager-customers.json'), 'utf-8')
);

const dmEvents = parseDataManagerEvents(eventsJson);
const dmCustomers = parseDataManagerCustomers(customersJson);

function buildDefinition(): DataManagerDefinitionSnapshot {
  return {
    events: [
      {
        id: 'event_purchase',
        name: 'purchase',
        status: 'implemented',
        class: 'custom',
        properties: [
          { property_id: 'prop_total_price', name: 'total_price', data_type: 'number', data_formats: ['money'] },
          { property_id: 'prop_purchase_id', name: 'purchase_id', data_type: 'string', data_formats: [] },
        ],
      },
      {
        id: 'event_purchase_item',
        name: 'purchase_item',
        status: 'implemented',
        class: 'custom',
        properties: [
          { property_id: 'prop_price', name: 'price', data_type: 'number', data_formats: ['money'] },
          { property_id: 'prop_quantity', name: 'quantity', data_type: 'number', data_formats: [] },
          { property_id: 'prop_purchase_id2', name: 'purchase_id', data_type: 'string', data_formats: [] },
        ],
      },
      {
        id: 'event_cart_update',
        name: 'cart_update',
        status: 'implemented',
        class: 'custom',
        properties: [
          { property_id: 'prop_cu_total_price', name: 'total_price', data_type: 'number', data_formats: ['money'] },
          { property_id: 'prop_cu_total_quantity', name: 'total_quantity', data_type: 'number', data_formats: [] },
          { property_id: 'prop_cu_action', name: 'action', data_type: 'string', data_formats: [] },
        ],
      },
      {
        id: 'event_checkout',
        name: 'checkout',
        status: 'implemented',
        class: 'custom',
        properties: [{ property_id: 'prop_co_total_price', name: 'total_price', data_type: 'number', data_formats: ['money'] }],
      },
      {
        id: 'event_view_item',
        name: 'view_item',
        status: 'implemented',
        class: 'custom',
        properties: [
          { property_id: 'prop_vi_price', name: 'price', data_type: 'number', data_formats: ['money'] },
          { property_id: 'prop_vi_stock_level', name: 'stock_level', data_type: 'number', data_formats: [] },
        ],
      },
      {
        // Not present in the Data Manager events snapshot at all -> missing_event.
        id: 'event_not_in_snapshot',
        name: 'never_imported_event',
        status: 'implemented',
        class: 'custom',
        properties: [],
      },
      {
        // sdk/platform class -> D-29, never validated even though it is absent from the snapshot too.
        id: 'event_session_start',
        name: 'session_start',
        status: 'implemented',
        class: 'platform',
        properties: [],
      },
    ],
    customer_properties: [],
  };
}

describe('runDefinitionVsDataManager', () => {
  const definition = buildDefinition();

  it('produces no findings when no snapshot is stored', () => {
    const findings = runDefinitionVsDataManager(definition, { events: null, customers: null });
    expect(findings).toEqual([]);
  });

  it('reproduces the seven type_mismatch findings from the plan fixture, and none for purchase.total_price', () => {
    const findings = runDefinitionVsDataManager(definition, { events: dmEvents, customers: null });
    const mismatches = findings.filter((f) => f.kind === 'type_mismatch');
    const keys = mismatches.map((f) => `${f.event_id}:${f.property_id}`).sort();
    expect(keys).toEqual(
      [
        'event_purchase_item:prop_price',
        'event_purchase_item:prop_quantity',
        'event_cart_update:prop_cu_total_price',
        'event_cart_update:prop_cu_total_quantity',
        'event_checkout:prop_co_total_price',
        'event_view_item:prop_vi_price',
        'event_view_item:prop_vi_stock_level',
      ].sort()
    );
    expect(mismatches.every((f) => f.severity === 'error')).toBe(true);
    expect(findings.some((f) => f.event_id === 'event_purchase' && f.property_id === 'prop_total_price')).toBe(false);
  });

  it('produces unexpected_property (warning) for purchase Data Manager properties the definition does not link', () => {
    const findings = runDefinitionVsDataManager(definition, { events: dmEvents, customers: null });
    const purchaseUnexpected = findings.filter((f) => f.kind === 'unexpected_property' && f.event_id === 'event_purchase');
    const names = purchaseUnexpected.map((f) => (f.actual_json as { property: string }).property);
    expect(names).toContain('payment_method');
    expect(names).toContain('region');
    expect(purchaseUnexpected.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('produces missing_event (warning) for a defined custom event absent from the snapshot, but not for an sdk/platform event', () => {
    const findings = runDefinitionVsDataManager(definition, { events: dmEvents, customers: null });
    const missing = findings.filter((f) => f.kind === 'missing_event');
    expect(missing.map((f) => f.event_id)).toEqual(['event_not_in_snapshot']);
    expect(missing[0].severity).toBe('warning');
  });

  it('produces unmapped_property (warning) for a definition property the events snapshot does not hold', () => {
    const defWithExtra: DataManagerDefinitionSnapshot = {
      ...definition,
      events: definition.events.map((e) =>
        e.name === 'purchase'
          ? { ...e, properties: [...e.properties, { property_id: 'prop_made_up', name: 'not_a_real_property', data_type: 'string', data_formats: [] }] }
          : e
      ),
    };
    const findings = runDefinitionVsDataManager(defWithExtra, { events: dmEvents, customers: null });
    const unmapped = findings.filter((f) => f.kind === 'unmapped_property' && f.property_id === 'prop_made_up');
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].severity).toBe('warning');
  });

  it('checks customer-scope properties only when a customers snapshot is stored', () => {
    const defWithCustomer: DataManagerDefinitionSnapshot = {
      ...definition,
      customer_properties: [{ property_id: 'prop_cust_made_up', name: 'not_a_real_customer_property', data_type: 'string', data_formats: [] }],
    };
    const withoutSnapshot = runDefinitionVsDataManager(defWithCustomer, { events: null, customers: null });
    expect(withoutSnapshot).toEqual([]);

    const withSnapshot = runDefinitionVsDataManager(defWithCustomer, { events: null, customers: dmCustomers });
    const unmapped = withSnapshot.filter((f) => f.kind === 'unmapped_property' && f.property_id === 'prop_cust_made_up');
    expect(unmapped).toHaveLength(1);
  });
});
