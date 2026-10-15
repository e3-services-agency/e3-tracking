import { describe, expect, it } from 'vitest';
import type { EventCard, TrackingDocument } from '@/src/domain/document/trackingDocument';
import {
  catalogRowsFromDocument,
  consentRowsFromDocument,
  eventRowFromCard,
  eventRowFromSummary,
  expirationFromDocument,
  identityRowsFromDocument,
  propertyRowsFromDocument,
  standardEventRowsFromDocument,
  useCaseRowsFromDocument,
} from './document';
import {
  catalogRowsFromInternal,
  consentRowsFromInternal,
  eventRowsFromInternal,
  expirationFromInternal,
  identityRowsFromInternal,
  propertyRowFromInternal,
  standardEventRowsFromInternal,
  useCaseRowsFromInternal,
} from './internal';

const card = (over: Partial<EventCard> = {}): EventCard =>
  ({
    id: 'e1',
    name: 'purchase',
    business_name: 'Purchase',
    class: 'custom',
    description: 'Order placed',
    status: 'implemented',
    sources: [{ id: 's1', name: 'Shopify', system: 'shopify', method: 'gtm', color: 'source-2' }],
    certification: { applicable: true, certified: false, reasons: ['open_errors: 2'] },
    expiration: { effective: { enabled: true, count: 2, units: 'years' }, source: 'project' },
    properties: [{}, {}, {}],
    variants: [{ id: 'v1', name: 'purchase[type=online]' }],
    ...over,
  }) as unknown as EventCard;

const definition = (n: number) => ({ id: `d${n}`, name: 'general', description: null, allowed_values: Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: null, standard_event: null })), formats: [], example_values: null });

const doc = {
  events: [card()],
  properties: [{ property_id: 'cp1', category: 'customer', name: 'loyalty_tier', data_type: 'string', data_formats: [], bloomreach_customer_property: null, pii: false, description: 'Tier', definitions: [definition(3), definition(1)] }],
  event_properties: [{ property_id: 'ep1', category: 'event', kind: 'item', name: 'item_id', data_type: 'string', data_formats: [], description: null, used_in_events: ['purchase', 'view_item'], definitions: [definition(0)] }],
  use_cases: [{ id: 'u1', code: 'UC-01', name: 'Abandoned cart', type: 'marketing', status: 'approved', narrative: 'Remind', requirements: [{}, {}], documentation_url: null, internal_notes: 'secret' }],
  identity_rules: [
    { id: 'r1', identifier_name: 'email_id', identity_type: 'hard', name: 'Email at login', transformations: [], sdk_call: 'identify', trigger_text: null, set_by: { kind: 'event', event: { id: 'e9', name: 'login' }, source: null }, carried_by: ['purchase'] },
    { id: 'r2', identifier_name: 'email_id', identity_type: 'hard', name: 'Email at newsletter', transformations: [], sdk_call: null, trigger_text: 'signup', set_by: { kind: 'standalone_call', sdk_call: 'identify', trigger_text: 'signup', source: null }, binds: ['email_id', 'cookie'] },
  ],
  catalogs: [
    { id: 'c1', name: 'products_de', mapping_role: 'products', status: 'implemented', kind: 'product', market: 'DE', language: 'de', version: 'v2', live_at: '2026-10-01', fields: [{}, {}] },
    { name: 'legacy', mapping_role: null, status: null },
  ],
  consent_categories: [{ id: 'k1', name: 'Newsletter', standard_key: 'newsletter', status: 'implemented' }, { name: 'VIP', standard_key: null, status: null }],
  standard_event_mappings: [
    { standard_event: 'purchase', event_name: 'purchase', variant_name: null, field_map: { total_price: 'total', currency: null } },
    { standard_event: 'purchase', event_name: 'purchase', variant_name: 'purchase[type=pos]', field_map: { total_price: 'total' } },
  ],
} as unknown as TrackingDocument;

describe('document adapters', () => {
  it('maps an event card to a one-line event row', () => {
    const row = eventRowFromCard(card());
    expect(row).toEqual({
      id: 'e1',
      name: 'purchase',
      business_name: 'Purchase',
      description: 'Order placed',
      class: 'custom',
      sources: [{ id: 's1', name: 'Shopify', system: 'shopify', method: 'gtm', color: 'source-2' }],
      status: 'implemented',
      certified: 'no',
      certified_reasons: ['open_errors: 2'],
      expiration: { label: 'project default', inherited: true },
      property_count: 3,
      variants: [{ id: 'v1', name: 'purchase[type=online]', description: null }],
    });
    expect(eventRowFromCard(card({ class: 'sdk', certification: { applicable: false, certified: false, reasons: [] } })).certified).toBe('n/a');
    expect(eventRowFromCard(card({ certification: { applicable: true, certified: true, reasons: [] } })).certified).toBe('yes');
    expect(eventRowFromCard(card({ sources: undefined, variants: [], properties: [] }))).toMatchObject({ sources: [], variants: [], property_count: 0 });
  });

  it('T-5-42: maps a summary event without expiration, with its property count and variant names', () => {
    const row = eventRowFromSummary({
      id: 'e1', name: 'purchase', business_name: 'Purchase', class: 'custom', status: 'implemented', priority: null, description: 'Order placed',
      sources: [{ id: 's1', name: 'Shopify', system: 'shopify', method: 'gtm', color: 'source-2' }],
      certification: { applicable: true, certified: true, reasons: [] },
      quality: { acknowledged: { error: 0, warning: 0, info: 0 } },
      variant_names: ['purchase[type=online]'], property_count: 7, open_finding_count: 0,
    } as never);
    expect(row).toMatchObject({ id: 'e1', certified: 'yes', expiration: null, property_count: 7, variants: [{ id: 'purchase[type=online]', name: 'purchase[type=online]', description: null }] });
    expect(row.sources).toEqual([{ id: 's1', name: 'Shopify', system: 'shopify', method: 'gtm', color: 'source-2' }]);
  });

  it("reads only the event's own expiration as set; everything else is the project default", () => {
    expect(expirationFromDocument(null)).toEqual({ label: 'project default', inherited: true });
    expect(expirationFromDocument({ effective: null, source: null })).toEqual({ label: 'project default', inherited: true });
    expect(expirationFromDocument({ effective: { enabled: true, count: 30, units: 'days' }, source: 'event' })).toEqual({ label: '30 days', inherited: false });
    expect(expirationFromDocument({ effective: { enabled: false, count: null, units: null }, source: 'event' })).toEqual({ label: 'Disabled', inherited: false });
  });

  it('lists customer then event properties with category, kind, enum and definition counts', () => {
    expect(propertyRowsFromDocument(doc)).toEqual([
      { id: 'cp1', name: 'loyalty_tier', scope: 'customer', description: 'Tier', category: 'customer', category_set_by_hand: false, data_type: 'string', kind: null, enum_count: 3, priority: null, status: null, definition_count: 2, used_by_count: 0 },
      { id: 'ep1', name: 'item_id', scope: 'event', description: null, category: 'event', category_set_by_hand: false, data_type: 'string', kind: 'item', enum_count: 0, priority: null, status: null, definition_count: 1, used_by_count: 2 },
    ]);
    expect(propertyRowsFromDocument({ properties: [], event_properties: undefined as never })).toEqual([]);
  });

  it('keeps only whitelisted use case fields (no internal notes), with the requirement count', () => {
    const [row] = useCaseRowsFromDocument(doc);
    expect(row).toEqual({ id: 'u1', code: 'UC-01', name: 'Abandoned cart', type: 'marketing', description: 'Remind', priority: null, status: 'approved', owner: null, requirement_count: 2 });
    expect(JSON.stringify(row)).not.toContain('secret');
  });

  it('counts acts per identifier and derives the trigger event from set_by', () => {
    const rows = identityRowsFromDocument(doc);
    expect(rows.map((r) => [r.identifier_act_count, r.trigger_event, r.binds, r.carried_by])).toEqual([
      [2, 'login', [], [{ id: 'purchase', name: 'purchase' }]],
      [2, null, ['email_id', 'cookie'], []],
    ]);
    expect(rows[0].status).toBeNull();
  });

  it('maps catalogs with market label, live flag and field count, falling back to the name as id', () => {
    expect(catalogRowsFromDocument(doc)).toEqual([
      { id: 'c1', name: 'products_de', description: null, kind: 'product', market_label: 'DE / de', version: 'v2', live: true, mapping_role: 'products', status: 'implemented', field_count: 2 },
      { id: 'legacy', name: 'legacy', description: null, kind: null, market_label: '', version: null, live: false, mapping_role: null, status: null, field_count: 0 },
    ]);
  });

  it('maps consent categories and standard event mappings with unique ids', () => {
    expect(consentRowsFromDocument(doc).map((c) => c.id)).toEqual(['k1', 'VIP']);
    expect(standardEventRowsFromDocument(doc)).toEqual([
      { id: 'purchase', key: 'purchase', field_count: 2, mapped_field_count: 1, event_name: 'purchase', variant_name: null },
      { id: 'purchase#2', key: 'purchase', field_count: 1, mapped_field_count: 1, event_name: 'purchase', variant_name: 'purchase[type=pos]' },
    ]);
  });
});

describe('internal adapters', () => {
  it('maps REST events with their variants and defaults', () => {
    const [row] = eventRowsFromInternal(
      [{ id: 'e1', name: 'view_item', business_name: null, description: null, class: 'sdk', status: 'planned', expiration_json: { enabled: true, count: 90, units: 'days' } }],
      { e1: [{ id: 'v1', name: 'view_item[a=b]', description: 'B' }] }
    );
    expect(row).toMatchObject({ sources: [], certified: 'n/a', certified_reasons: [], property_count: 0, expiration: { label: '90 days', inherited: false } });
    expect(row.variants).toEqual([{ id: 'v1', name: 'view_item[a=b]', description: 'B' }]);
    expect(expirationFromInternal(null)).toEqual({ label: 'project default', inherited: true });
    expect(expirationFromInternal({ enabled: false, count: 1, units: 'days' })).toEqual({ label: 'Disabled', inherited: false });
  });

  it('classifies properties, flags a hand-set category and counts enum values and definitions', () => {
    const base = { id: 'p', scope: 'event', description: null, data_type: 'string', priority: 'high', status: 'planned' };
    expect(propertyRowFromInternal({ ...base, name: 'browser' })).toMatchObject({ category: 'sdk_default', category_set_by_hand: false, kind: null, enum_count: 0, definition_count: 0 });
    expect(propertyRowFromInternal({ ...base, name: 'x', category_override: 'customer', allowed_values_json: [1, 2], definitions: [1], used_by_events: [1, 2, 3], kind: 'item' })).toMatchObject({
      category: 'customer',
      category_set_by_hand: true,
      kind: 'item',
      enum_count: 2,
      definition_count: 1,
      used_by_count: 3,
    });
  });

  it('maps use cases, identity rules, catalogs, consents and standard events', () => {
    expect(useCaseRowsFromInternal([{ id: 'u', code: null, name: 'N', type: null, description: null, priority: null, status: null, owner: 'CRM' }])[0]).toMatchObject({ owner: 'CRM', requirement_count: null });
    const rules = identityRowsFromInternal(
      [
        { id: 'r1', name: 'A', identifier_name: 'cookie', identity_type: 'soft', sdk_call: null, trigger_event_id: 'e1', status: 'planned' },
        { id: 'r2', name: 'B', identifier_name: 'email_id', identity_type: 'hard', sdk_call: 'identify', trigger_event_id: 'gone', status: null, carried_by: [{ id: 'e1', name: 'login' }] },
      ],
      [{ id: 'e1', name: 'login' }]
    );
    expect(rules.map((r) => [r.trigger_event, r.identifier_act_count, r.carried_by.length])).toEqual([['login', 1, 0], [null, 1, 1]]);
    expect(catalogRowsFromInternal([{ id: 'c', name: 'n', description: null, kind: 'other', market: null, language: 'en', version: 'v1', live_at: null, mapping_role: null, status: null }])[0]).toMatchObject({ market_label: 'en', live: false, field_count: null });
    expect(consentRowsFromInternal([{ id: 'k', name: 'N', standard_key: null, status: null }])).toEqual([{ id: 'k', name: 'N', standard_key: null, status: null }]);
    expect(standardEventRowsFromInternal([{ key: 'cart_update', fieldCount: 4, mapping: null, mappedEventName: null, mappedVariantName: null }])).toEqual([
      { id: 'cart_update', key: 'cart_update', field_count: 4, mapped_field_count: null, event_name: null, variant_name: null },
    ]);
  });
});
