import { describe, expect, it } from 'vitest';
import { buildReferenceIndex, propertyAnchors, propertyIdForHash, referenceHref, resolveReference } from './references';

const doc = {
  events: [
    { id: 'e1', name: 'purchase' },
    { id: 'e2', name: 'booking b' },
    { id: 'e3', name: 'booking-b' },
  ],
  properties: [{ property_id: 'c1', name: 'email' }],
  event_properties: [
    { property_id: 'p1', name: 'total_price' },
    { property_id: 'p2', name: 'email' },
  ],
};
const index = buildReferenceIndex(doc);

describe('referenceHref (T-4-22)', () => {
  it('shared mode: events by id or name map to the event anchors, deduplicated like eventAnchors', () => {
    expect(referenceHref({ kind: 'event', id: 'e1' }, 'shared', index)).toBe('#event-purchase');
    expect(referenceHref({ kind: 'event', name: 'booking b' }, 'shared', index)).toBe('#event-booking-b');
    expect(referenceHref({ kind: 'event', name: 'booking-b' }, 'shared', index)).toBe('#event-booking-b-2');
  });

  it('shared mode: properties map to unique property row anchors, scope disambiguates a shared name', () => {
    expect(referenceHref({ kind: 'property', id: 'p1' }, 'shared', index)).toBe('#property-total_price');
    expect(referenceHref({ kind: 'property', name: 'email', scope: 'customer' }, 'shared', index)).toBe('#property-email');
    expect(referenceHref({ kind: 'property', name: 'email', scope: 'event' }, 'shared', index)).toBe('#property-email-2');
    expect(propertyAnchors(doc).get('p2')).toBe('property-email-2');
  });

  it('internal mode: event card path and properties editor target', () => {
    expect(resolveReference({ kind: 'event', name: 'purchase' }, 'internal', index)).toEqual({
      mode: 'internal',
      href: '/events/e1/card',
      tab: 'eventCard',
      eventCardId: 'e1',
    });
    expect(resolveReference({ kind: 'property', id: 'p1' }, 'internal', index)).toEqual({
      mode: 'internal',
      href: '/properties',
      tab: 'properties',
      editId: 'p1',
    });
  });

  it('returns null for an unknown event or property (the caller renders plain text)', () => {
    expect(referenceHref({ kind: 'event', name: 'nope' }, 'shared', index)).toBeNull();
    expect(referenceHref({ kind: 'event', name: 'nope' }, 'internal', index)).toBeNull();
    expect(referenceHref({ kind: 'property', name: 'nope' }, 'shared', index)).toBeNull();
    expect(referenceHref({ kind: 'property', id: 'gone' }, 'shared', index)).toBeNull();
  });

  it('propertyIdForHash finds the property a hash points at, a bad percent-escape is tolerated', () => {
    expect(propertyIdForHash('#property-total_price', index)).toBe('p1');
    expect(propertyIdForHash('property-email-2', index)).toBe('p2');
    expect(propertyIdForHash('#event-purchase', index)).toBeNull();
    expect(propertyIdForHash('#property-%E0%A4%A', index)).toBeNull();
  });
});
