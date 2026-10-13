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

  it('produces unexpected_property (info) for exactly the 24 purchase Data Manager properties the definition does not link, excluding SDK_DEFAULT_PROPERTIES (T-2-05 delta, D-37, D-38)', () => {
    const findings = runDefinitionVsDataManager(definition, { events: dmEvents, customers: null });
    const purchaseUnexpected = findings.filter((f) => f.kind === 'unexpected_property' && f.event_id === 'event_purchase');
    const names = purchaseUnexpected.map((f) => (f.actual_json as { property: string }).property).sort();
    // 30 properties on `purchase` in the fixture, minus the 2 the test definition links
    // (total_price, purchase_id), minus the 4 SDK_DEFAULT_PROPERTIES (os, browser, device, location).
    expect(names).toEqual(
      [
        'currency',
        'has_voucher',
        'is_gift',
        'is_sample',
        'local_currency',
        'payment_method',
        'payment_type',
        'product_ids',
        'product_list',
        'purchase_reason',
        'purchase_source_id',
        'purchase_source_name',
        'purchase_source_type',
        'purchase_status',
        'region',
        'retailer',
        'shipping_company',
        'shipping_cost',
        'shipping_country',
        'shipping_type',
        'source',
        'total_price_local_currency',
        'total_quantity',
        'voucher_code',
      ].sort()
    );
    expect(names).not.toContain('os');
    expect(names).not.toContain('browser');
    expect(names).not.toContain('device');
    expect(names).not.toContain('location');
    expect(purchaseUnexpected.every((f) => f.severity === 'info')).toBe(true);
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

  it('never raises unmapped_property/unexpected_property for SDK_DEFAULT_PROPERTIES even when explicitly linked (T-2-05 delta, D-38)', () => {
    const defWithSdkDefault: DataManagerDefinitionSnapshot = {
      ...definition,
      events: definition.events.map((e) =>
        e.name === 'purchase'
          ? { ...e, properties: [...e.properties, { property_id: 'prop_browser', name: 'browser', data_type: 'string', data_formats: [] }] }
          : e
      ),
    };
    const findings = runDefinitionVsDataManager(defWithSdkDefault, { events: dmEvents, customers: null });
    expect(findings.some((f) => f.property_id === 'prop_browser')).toBe(false);
    expect(findings.some((f) => f.kind === 'unexpected_property' && (f.actual_json as { property: string })?.property === 'browser')).toBe(
      false
    );
  });

  it('reports an unrecognized Data Manager type as a type_mismatch warning, not an unconditional error (T-2-05 delta, T-2-04 review LOW)', () => {
    const defWithGeo: DataManagerDefinitionSnapshot = {
      events: [],
      customer_properties: [{ property_id: 'prop_geo', name: 'geo', data_type: 'string', data_formats: [] }],
    };
    const dmCustomersWithGeo = {
      ...dmCustomers,
      properties: [
        ...dmCustomers.properties,
        {
          property: 'geo',
          type: 'geo_point',
          source: 'user',
          private: false,
          used: true,
          deleting: false,
          locked_for_contact_migration: false,
          description: null,
          example_values: null,
          dm_index: 999,
          group: null,
        },
      ],
    };
    const findings = runDefinitionVsDataManager(defWithGeo, { events: null, customers: dmCustomersWithGeo });
    const mismatch = findings.find((f) => f.kind === 'type_mismatch' && f.property_id === 'prop_geo');
    expect(mismatch?.severity).toBe('warning');
    expect(mismatch?.message).toMatch(/unknown Data Manager type/i);
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

describe('T-5-32 declaration findings (dm_auto_declared, dm_unused, pii_not_declared, pii_not_private)', () => {
  const prop = (property: string, type: string, extra: Record<string, unknown> = {}) => ({
    property, type, description: '', example_values: '', private: false, source: 'user', used: true, deleting: false, ...extra,
  });
  const evt = (type: string, props: unknown[], extra: Record<string, unknown> = {}) => ({
    type, description: '', source: 'user', used: true, forbidden: false, deleting: false, real_time_analytics: false,
    properties: { are_all_used: false, default_group: { properties: props }, groups: [] }, ...extra,
  });
  const model = (events: unknown[]) =>
    parseDataManagerEvents({ default_forbidden: false, default_private: false, default_group: { events }, groups: [] });
  const def = (pii?: boolean, status = 'implemented'): DataManagerDefinitionSnapshot => ({
    events: [
      {
        id: 'e1', name: 'signup', status, class: 'custom',
        properties: [{ property_id: 'p_email', name: 'email_addr', data_type: 'string', data_formats: [], pii }],
      },
    ],
    customer_properties: [],
  });
  const kinds = <T extends { kind: string }>(f: T[], k: string) => f.filter((x) => x.kind === k);

  it('dm_auto_declared: source data and not in plan, or declared differently; stable fingerprints', () => {
    const dm = model([
      evt('signup', [prop('email_addr', 'number', { source: 'data' }), prop('ghost', 'string', { source: 'data' })]),
      evt('stray_event', [], { source: 'data' }),
    ]);
    const f = runDefinitionVsDataManager(def(), { events: dm, customers: null });
    const auto = kinds(f, 'dm_auto_declared');
    expect(auto).toHaveLength(3);
    expect(auto.every((x) => x.severity === 'warning' && /descriptive, not designed/.test(x.message))).toBe(true);
    const again = runDefinitionVsDataManager(def(), { events: dm, customers: null });
    expect(kinds(again, 'dm_auto_declared').map((x) => x.fingerprint)).toEqual(auto.map((x) => x.fingerprint));
  });

  it('dm_auto_declared negative: source data but declared correctly in the plan', () => {
    const dm = model([evt('signup', [prop('email_addr', 'string', { source: 'data' })])]);
    expect(kinds(runDefinitionVsDataManager(def(), { events: dm, customers: null }), 'dm_auto_declared')).toEqual([]);
  });

  it('dm_unused: used false on an implemented event and a linked property (info); none for planned events', () => {
    const dm = model([evt('signup', [prop('email_addr', 'string', { used: false })], { used: false })]);
    const f = kinds(runDefinitionVsDataManager(def(), { events: dm, customers: null }), 'dm_unused');
    expect(f).toHaveLength(2);
    expect(f.every((x) => x.severity === 'info')).toBe(true);
    const planned = kinds(runDefinitionVsDataManager(def(undefined, 'planned'), { events: dm, customers: null }), 'dm_unused');
    expect(planned).toHaveLength(1); // the linked property only
  });

  it('pii_not_declared (error) when private but plan pii unset/false; none when declared; pii_not_private (warning) reverse', () => {
    const priv = model([evt('signup', [prop('email_addr', 'string', { private: true })])]);
    const nd = kinds(runDefinitionVsDataManager(def(), { events: priv, customers: null }), 'pii_not_declared');
    expect(nd).toHaveLength(1);
    expect(nd[0].severity).toBe('error');
    expect(kinds(runDefinitionVsDataManager(def(true), { events: priv, customers: null }), 'pii_not_declared')).toEqual([]);
    const open = model([evt('signup', [prop('email_addr', 'string')])]);
    const np = kinds(runDefinitionVsDataManager(def(true), { events: open, customers: null }), 'pii_not_private');
    expect(np).toHaveLength(1);
    expect(np[0].severity).toBe('warning');
    expect(kinds(runDefinitionVsDataManager(def(false), { events: open, customers: null }), 'pii_not_private')).toEqual([]);
  });
});
