/**
 * Engine tests for comparison 3 (T-1-09), reproducing the required findings from the plan and the
 * T-1-09 delta correction on `customer-events-export.json` with a test definition that mirrors the
 * mapping fixture (events purchase, purchase_item, cart_update, checkout, view_item, view_category
 * with the properties typed as in the legacy workbook).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  runDefinitionVsObservations,
  isEventCertified,
  type DefEvent,
  type DefinitionSnapshot,
  type EngineObservation,
} from './definitionVsObservations';

interface FixtureEvent {
  type: string;
  timestamp: number;
  properties: Record<string, unknown>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture: { events: FixtureEvent[] } = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/customer-events-export.json'), 'utf-8')
);

// ---- Test definition mirroring the data-mapping fixture (T-1-09 acceptance) ----

const PROP = {
  totalPrice: 'prop_total_price', // purchase.total_price, number, money
  purchaseId: 'prop_purchase_id', // shared by purchase and purchase_item
  purchaseStatus: 'prop_purchase_status',
  productIds: 'prop_product_ids', // array on purchase, string on checkout/cart_update
  price: 'prop_price', // purchase_item unit price ("price" in the raw payload), number, money
  quantity: 'prop_quantity', // purchase_item quantity, number
  isNew: 'prop_is_new', // purchase_item.is_new, boolean
  action: 'prop_action', // cart_update discriminator, allowed_values ["add"] only
};

const EVENT = {
  purchase: 'event_purchase',
  purchaseItem: 'event_purchase_item',
  cartUpdate: 'event_cart_update',
  checkout: 'event_checkout',
  viewItem: 'event_view_item',
  viewCategory: 'event_view_category',
  sessionStart: 'event_session_start',
};

const VARIANT_CART_UPDATE_ADD = 'variant_cart_update_add';

function buildDefinition(): DefinitionSnapshot {
  const events: DefEvent[] = [
    {
      id: EVENT.purchase,
      name: 'purchase',
      status: 'implemented',
      expiration: null,
      properties: [
        { property_id: PROP.totalPrice, name: 'total_price', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: ['money'], allowed_values: null },
        { property_id: PROP.purchaseId, name: 'purchase_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
        { property_id: PROP.purchaseStatus, name: 'purchase_status', payload_key: null, role: 'normal', required: false, data_type: 'string', data_formats: [], allowed_values: ['success'] },
        { property_id: PROP.productIds, name: 'product_ids', payload_key: null, role: 'normal', required: false, data_type: 'array', data_formats: [], allowed_values: null },
      ],
    },
    {
      id: EVENT.purchaseItem,
      name: 'purchase_item',
      status: 'implemented',
      expiration: null,
      properties: [
        { property_id: PROP.price, name: 'price', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: ['money'], allowed_values: null },
        { property_id: PROP.quantity, name: 'quantity', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: [], allowed_values: null },
        { property_id: PROP.isNew, name: 'is_new', payload_key: null, role: 'normal', required: false, data_type: 'boolean', data_formats: [], allowed_values: null },
        { property_id: PROP.purchaseId, name: 'purchase_id', payload_key: null, role: 'normal', required: true, data_type: 'string', data_formats: [], allowed_values: null },
      ],
    },
    {
      // `product_ids` is deliberately *not* linked here: the real data-mapping fixture only maps
      // `product_ids` on `purchase` (`add_to_cart`/`cart_update`'s `product_ids` field is `null`).
      // ERROR 3 fix round: shape_inconsistent must still fire from the raw observed payload key
      // regardless of link status; hand-linking it here (as the pre-fix-round test did) would hide
      // that regression instead of reproducing the plan's scenario.
      id: EVENT.cartUpdate,
      name: 'cart_update',
      status: 'implemented',
      expiration: null,
      properties: [
        { property_id: PROP.action, name: 'action', payload_key: null, role: 'discriminator', required: true, data_type: 'string', data_formats: [], allowed_values: ['add'] },
      ],
    },
    {
      // `checkout` has no fields at all in the data-mapping fixture (`"checkout": {"event": ...}`).
      id: EVENT.checkout,
      name: 'checkout',
      status: 'implemented',
      expiration: null,
      properties: [],
    },
    {
      id: EVENT.viewItem,
      name: 'view_item',
      status: 'implemented',
      expiration: null,
      properties: [
        { property_id: PROP.price, name: 'price', payload_key: null, role: 'normal', required: false, data_type: 'number', data_formats: ['money'], allowed_values: null },
      ],
    },
    {
      id: EVENT.viewCategory,
      name: 'view_category',
      status: 'implemented',
      expiration: null,
      properties: [],
    },
    {
      // Deliberately not present in the fixture's observed events, but has a long expiration so
      // `missing_event` is suppressed (T-1-09 acceptance): "no missing_event for session_start
      // when its 3-month expiration suppresses it".
      id: EVENT.sessionStart,
      name: 'session_start',
      status: 'implemented',
      expiration: { enabled: true, count: 3, units: 'months' },
      properties: [],
    },
  ];

  return {
    project_default_expiration: null,
    events,
    variants: [
      {
        id: VARIANT_CART_UPDATE_ADD,
        event_id: EVENT.cartUpdate,
        name: 'cart_update[action=add]',
        conditions: [{ property_id: PROP.action, operator: 'equals', values: ['add'] }],
        expiration: null,
      },
    ],
    standard_event_mappings: [
      {
        standard_event: 'purchase',
        event_id: EVENT.purchase,
        variant_id: null,
        field_map: { total_price: PROP.totalPrice, purchase_id: PROP.purchaseId, purchase_status: PROP.purchaseStatus, product_ids: PROP.productIds },
      },
      {
        standard_event: 'purchase_item',
        event_id: EVENT.purchaseItem,
        variant_id: null,
        // Field renames per the T-1-08 data-mapping contract: std field "total_price" -> property
        // "price", std field "total_quantity" -> property "quantity".
        field_map: { total_price: PROP.price, total_quantity: PROP.quantity, purchase_id: PROP.purchaseId },
      },
    ],
  };
}

/** Resolves the fixture's raw events into `EngineObservation[]` against `buildDefinition()`, exactly like `comparison.service.ts` would after `customerEventsExportImport.service.ts` stored them. */
function buildObservations(runKind: string, mutateAction?: 'remove'): EngineObservation[] {
  const raw = fixture.events;
  const nameToEventId: Record<string, string> = {
    purchase: EVENT.purchase,
    purchase_item: EVENT.purchaseItem,
    cart_update: EVENT.cartUpdate,
    checkout: EVENT.checkout,
    view_item: EVENT.viewItem,
    view_category: EVENT.viewCategory,
  };
  return raw.map((evt, index) => {
    const eventId = nameToEventId[evt.type] ?? null;
    let variantId: string | null = null;
    let properties = evt.properties;
    if (evt.type === 'cart_update') {
      if (mutateAction) properties = { ...evt.properties, action: mutateAction };
      if (properties.action === 'add') variantId = VARIANT_CART_UPDATE_ADD;
    }
    return {
      id: `obs_${index}`,
      event_type: evt.type,
      event_id: eventId,
      variant_id: variantId,
      timestamp: evt.timestamp,
      properties,
      run_kind: runKind,
    };
  });
}

// Fixed "now" so `missing_event`/expiration-suppression assertions never depend on wall-clock
// drift: safely after every fixture timestamp (the latest, `managed_endpoint`, is 2026-05-08) and
// far enough past it that session_start's 3-month window has elapsed since the newest observation.
const FIXED_NOW = Date.parse('2026-12-01T00:00:00Z') / 1000;

describe('runDefinitionVsObservations (T-1-09 fixture reproduction)', () => {
  const definition = buildDefinition();
  const observations = buildObservations('export_paste');
  const findings = runDefinitionVsObservations(definition, observations, { now: FIXED_NOW });

  it('flags type_mismatch on purchase.total_price ("28" vs number)', () => {
    const finding = findings.find((f) => f.kind === 'type_mismatch' && f.event_id === EVENT.purchase && f.property_id === PROP.totalPrice);
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
  });

  it('flags type_mismatch on purchase_item.is_new ("TRUE" vs boolean)', () => {
    const finding = findings.find((f) => f.kind === 'type_mismatch' && f.event_id === EVENT.purchaseItem && f.property_id === PROP.isNew);
    expect(finding).toBeDefined();
  });

  it('flags shape_inconsistent on product_ids (array on purchase, string on checkout/cart_update)', () => {
    const finding = findings.find((f) => f.kind === 'shape_inconsistent' && f.property_id === PROP.productIds);
    expect(finding).toBeDefined();
    expect((finding?.actual_json as { types: string[] }).types.sort()).toEqual(['array', 'string']);
  });

  it('flags rounding_drift 28 (purchase.total_price) vs 28.4 (sum of purchase_item price*quantity)', () => {
    const finding = findings.find((f) => f.kind === 'rounding_drift');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
    expect(finding?.expected_json).toEqual({ items_total: 28.4 });
    expect(finding?.actual_json).toEqual({ purchase_total: 28 });
  });

  it('flags unexpected_event only for paper_catalogue and loyalty_update (known Bloomreach system types are suppressed)', () => {
    const unexpectedTypes = findings.filter((f) => f.kind === 'unexpected_event').map((f) => (f.actual_json as { event_type: string }).event_type).sort();
    expect(unexpectedTypes).toEqual(['loyalty_update', 'paper_catalogue']);
  });

  it('does not flag missing_event for session_start (suppressed by its 3-month expiration)', () => {
    const finding = findings.find((f) => f.kind === 'missing_event' && f.event_id === EVENT.sessionStart);
    expect(finding).toBeUndefined();
  });
});

describe('unknown_variant (mutated discriminator value)', () => {
  it('flags unknown_variant when cart_update.action is mutated to "remove" (not in allowed_values)', () => {
    const definition = buildDefinition();
    const observations = buildObservations('export_paste', 'remove');
    const findings = runDefinitionVsObservations(definition, observations, { now: FIXED_NOW });
    const finding = findings.find((f) => f.kind === 'unknown_variant' && f.event_id === EVENT.cartUpdate && f.property_id === PROP.action);
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect((finding?.actual_json as { value: string }).value).toBe('remove');
  });
});

describe('missing_event severity by run kind (D-25 Q4)', () => {
  const definitionWithExtraEvent = (): DefinitionSnapshot => {
    const def = buildDefinition();
    def.events.push({
      id: 'event_never_observed',
      name: 'wishlist_view',
      status: 'implemented',
      expiration: null,
      properties: [],
    });
    return def;
  };

  it('is error when the scope includes an agent_session run', () => {
    const definition = definitionWithExtraEvent();
    const observations = buildObservations('agent_session');
    const findings = runDefinitionVsObservations(definition, observations, { now: FIXED_NOW });
    const finding = findings.find((f) => f.kind === 'missing_event' && f.event_id === 'event_never_observed');
    expect(finding?.severity).toBe('error');
  });

  it('is warning when the scope is export_paste only', () => {
    const definition = definitionWithExtraEvent();
    const observations = buildObservations('export_paste');
    const findings = runDefinitionVsObservations(definition, observations, { now: FIXED_NOW });
    const finding = findings.find((f) => f.kind === 'missing_event' && f.event_id === 'event_never_observed');
    expect(finding?.severity).toBe('warning');
  });
});

describe('isEventCertified', () => {
  it('is false whenever an open error finding exists', () => {
    expect(isEventCertified([{ severity: 'error', status: 'open' }])).toBe(false);
  });
  it('is true when every error finding is resolved and no other error remains', () => {
    expect(isEventCertified([{ severity: 'error', status: 'resolved' }, { severity: 'warning', status: 'open' }])).toBe(true);
  });
  it('is true with no findings at all', () => {
    expect(isEventCertified([])).toBe(true);
  });
});
