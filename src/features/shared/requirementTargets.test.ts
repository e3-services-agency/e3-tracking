import { describe, expect, it } from 'vitest';
import { buildReferenceIndex } from './references';
import { requirementTargetView } from './requirementTargets';

const index = buildReferenceIndex({
  events: [{ id: 'e1', name: 'purchase', variants: [{ id: 'v1', name: 'mobile' }] }],
  properties: [{ property_id: 'c1', name: 'email' }],
  event_properties: [{ property_id: 'p1', name: 'total' }],
  catalogs: [{ id: 'k1', name: 'Products' }, { id: 'k2', name: 'Products' }],
  consent_categories: [{ id: 'n1', name: 'newsletter' }],
});
const view = (r: Parameters<typeof requirementTargetView>[0]) => requirementTargetView(r, index);

describe('requirementTargetView (T-4-25)', () => {
  it('labels each kind and links event, variant, customer property, catalog and consent', () => {
    expect(view({ target_label: 'purchase', target_kind: 'event', event_id: 'e1' })).toMatchObject({ typeLabel: 'Event', icon: 'events', parts: [{ href: '#event-purchase' }] });
    expect(view({ target_label: 'mobile', target_kind: 'variant', variant_id: 'v1' })).toMatchObject({ typeLabel: 'Variant', parts: [{ href: '#variants-event-purchase' }] });
    expect(view({ target_label: 'email', target_kind: 'customer_property', property_id: 'c1' })).toMatchObject({ typeLabel: 'Customer property', parts: [{ href: '#property-email' }] });
    expect(view({ target_label: 'x', target_kind: 'catalog_attribute', catalog_id: 'k2' })).toMatchObject({ typeLabel: 'Catalog attribute', icon: 'catalogs', parts: [{ href: '#catalog-Products-2' }] });
    expect(view({ target_label: 'newsletter', target_kind: 'consent', consent_category_id: 'n1' })).toMatchObject({ typeLabel: 'Consent', parts: [{ href: '#consent-newsletter' }] });
  });
  it('event.property gives two linked parts, labelled Property', () => {
    const v = view({ target_label: 'purchase.total', target_kind: 'event_property', event_id: 'e1', property_id: 'p1' });
    expect(v.typeLabel).toBe('Property');
    expect(v.parts.map((p) => [p.text, p.href])).toEqual([['purchase', '#event-purchase'], ['total', '#property-total']]);
  });
  it('an unresolved or removed target stays plain text', () => {
    expect(view({ target_label: '(removed)', target_kind: 'event', event_id: null }).parts).toEqual([{ text: '(removed)', href: null, anchor: null }]);
    expect(view({ target_label: 'a', target_kind: 'consent', consent_category_id: 'zz' }).parts[0].href).toBeNull();
  });
});
