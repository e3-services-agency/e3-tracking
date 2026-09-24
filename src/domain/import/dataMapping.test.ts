import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseDataMapping } from './dataMapping';

const fixturePath = path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

describe('parseDataMapping on the fixture', () => {
  const model = parseDataMapping(fixture);

  it('parses _id, catalogs, custom_events verbatim', () => {
    expect(model.id).toBe('6af4ecbc-28c9-11ef-890d-52cb804997ac');
    expect(model.catalogs).toEqual({ main: null, variant: null, mainColumns: expect.objectContaining({ active: null, title: null }) });
    expect(model.customEvents).toEqual([]);
  });

  it('parses consents, mapped and unmapped', () => {
    expect(model.consents.newsletter).toBe('brand_consent');
    expect(model.consents.email).toBeNull();
  });

  it('parses customer_properties, mapped and unmapped', () => {
    expect(model.customerProperties.address).toBe('address');
    expect(model.customerProperties.birthday).toBeNull();
  });

  it('produces no warnings on the well-formed fixture', () => {
    expect(model.warnings).toEqual([]);
  });

  it('parses the add_to_cart standard event: type, filter, field map', () => {
    const addToCart = model.standardEvents.find((se) => se.key === 'add_to_cart')!;
    expect(addToCart.eventType).toBe('cart_update');
    expect(addToCart.filter).toEqual([{ property: 'action', operator: 'equals', values: ['add'] }]);
    expect(addToCart.fieldMap.total_price).toBe('total_price');
    expect(addToCart.fieldMap.total_quantity).toBe('total_quantity');
    expect(addToCart.fieldMap.price).toBeNull();
  });

  it('parses purchase_item field renames (total_price -> price, total_quantity -> quantity)', () => {
    const purchaseItem = model.standardEvents.find((se) => se.key === 'purchase_item')!;
    expect(purchaseItem.fieldMap.total_price).toBe('price');
    expect(purchaseItem.fieldMap.total_quantity).toBe('quantity');
  });

  it('treats an unmapped standard event (event: null) as no eventType and empty filter', () => {
    const addToWishlist = model.standardEvents.find((se) => se.key === 'add_to_wishlist')!;
    expect(addToWishlist.eventType).toBeNull();
    expect(addToWishlist.filter).toEqual([]);
  });

  it('parses an event with an empty filter (checkout)', () => {
    const checkout = model.standardEvents.find((se) => se.key === 'checkout')!;
    expect(checkout.eventType).toBe('checkout');
    expect(checkout.filter).toEqual([]);
  });
});

describe('parseDataMapping malformed inputs', () => {
  it('returns a warning and empty model for a non-object root', () => {
    const model = parseDataMapping('not an object');
    expect(model.warnings).toContain('data-mapping JSON must be an object.');
    expect(model.standardEvents).toEqual([]);
  });

  it('returns a warning and empty model for null', () => {
    const model = parseDataMapping(null);
    expect(model.warnings.length).toBeGreaterThan(0);
  });

  it('warns and skips a filter item with an unsupported operator instead of crashing', () => {
    const model = parseDataMapping({
      standard_events: {
        add_to_cart: {
          event: {
            type: 'cart_update',
            filter: [
              {
                attribute: { property: 'action', type: 'property' },
                constraint: { operands: [{ type: 'constant', value: 'add' }], operator: 'greater_than', type: 'string' },
              },
            ],
          },
        },
      },
    });
    const addToCart = model.standardEvents.find((se) => se.key === 'add_to_cart')!;
    expect(addToCart.filter).toEqual([]);
    expect(model.warnings.some((w) => w.includes('greater_than'))).toBe(true);
  });

  it('handles missing keys with warnings, not a throw', () => {
    const model = parseDataMapping({ standard_events: { checkout: {} } });
    expect(model.standardEvents).toHaveLength(1);
    expect(model.consents).toEqual({});
    expect(model.customerProperties).toEqual({});
  });

  it('warns on a malformed customer_properties entry instead of throwing', () => {
    const model = parseDataMapping({ customer_properties: { email: 'not-an-object' } });
    expect(model.customerProperties.email).toBeNull();
    expect(model.warnings.some((w) => w.includes('customer_properties.email'))).toBe(true);
  });
});
