import { describe, expect, it } from 'vitest';
import { isValidItemSchemaShape, validateItems } from './itemSchema';
import type { ItemSchemaField } from './types';

const PRODUCT_LIST_SCHEMA: ItemSchemaField[] = [
  { field: 'product_id', data_type: 'string', required: true },
  { field: 'price', data_type: 'number', required: true },
  { field: 'quantity', data_type: 'number', required: true },
];

describe('validateItems', () => {
  it('reports a missing required field', () => {
    const violations = validateItems([{ product_id: 'p1', price: 10 }], PRODUCT_LIST_SCHEMA);
    expect(violations).toEqual([{ index: 0, field: 'quantity', reason: 'missing_required' }]);
  });

  it('reports a wrong item type', () => {
    const violations = validateItems([{ product_id: 'p1', price: 'ten', quantity: 1 }], PRODUCT_LIST_SCHEMA);
    expect(violations).toEqual([{ index: 0, field: 'price', reason: 'wrong_type' }]);
  });

  it('reports a format violation', () => {
    const schema: ItemSchemaField[] = [{ field: 'phone', data_type: 'string', data_formats: ['e164_phone'], required: true }];
    const violations = validateItems([{ phone: '12345' }], schema);
    expect(violations).toEqual([{ index: 0, field: 'phone', reason: 'format_violation' }]);
  });

  it('passes a fully valid item', () => {
    const violations = validateItems([{ product_id: 'p1', price: 10, quantity: 2 }], PRODUCT_LIST_SCHEMA);
    expect(violations).toEqual([]);
  });

  it('checks every item, indexed', () => {
    const violations = validateItems(
      [
        { product_id: 'p1', price: 10, quantity: 2 },
        { product_id: 'p2', price: 5 },
      ],
      PRODUCT_LIST_SCHEMA
    );
    expect(violations).toEqual([{ index: 1, field: 'quantity', reason: 'missing_required' }]);
  });

  it('skips malformed (non-object) items instead of throwing', () => {
    expect(() => validateItems(['not-an-object', null, 5], PRODUCT_LIST_SCHEMA)).not.toThrow();
  });
});

describe('isValidItemSchemaShape', () => {
  it('accepts a valid schema', () => {
    expect(isValidItemSchemaShape(PRODUCT_LIST_SCHEMA)).toBe(true);
  });
  it('rejects a non-array', () => {
    expect(isValidItemSchemaShape({})).toBe(false);
  });
  it('rejects an entry with no field/data_type', () => {
    expect(isValidItemSchemaShape([{ data_type: 'string' }])).toBe(false);
    expect(isValidItemSchemaShape([{ field: 'x' }])).toBe(false);
  });
});
