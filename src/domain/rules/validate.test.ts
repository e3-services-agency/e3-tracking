import { describe, expect, it } from 'vitest';
import { RuleExpressionError, validateExpression, type ValidationContext } from './validate';
import type { ArithmeticExpression, BoundExpression, CrossEventExpression, MembershipExpression } from './types';

const productList = { property_id: 'p_list', data_type: 'array', item_schema: [{ field: 'product_id', data_type: 'string' }] };
const productId = { property_id: 'p_id', data_type: 'string', item_schema: null };
const totalPrice = { property_id: 'p_total', data_type: 'number', item_schema: null };

const context: ValidationContext = {
  properties: { p_list: productList, p_id: productId, p_total: totalPrice },
};

describe('validateExpression: membership', () => {
  const expression: MembershipExpression = {
    kind: 'membership',
    needle: { ref: 'property', property_id: 'p_id' },
    haystack: { property_id: 'p_list', field: 'product_id' },
  };

  it('accepts a valid membership expression', () => {
    expect(() => validateExpression('membership', expression, context)).not.toThrow();
  });

  it('rejects a needle property not linked to the event', () => {
    const bad: MembershipExpression = { ...expression, needle: { ref: 'property', property_id: 'not_linked' } };
    expect(() => validateExpression('membership', bad, context)).toThrow(RuleExpressionError);
  });

  it('rejects a haystack property that is not data_type array', () => {
    const bad: MembershipExpression = { ...expression, haystack: { property_id: 'p_total', field: 'x' } };
    expect(() => validateExpression('membership', bad, context)).toThrow(/data_type "array"/);
  });

  it('rejects a haystack field absent from the item schema', () => {
    const bad: MembershipExpression = { ...expression, haystack: { property_id: 'p_list', field: 'not_a_field' } };
    expect(() => validateExpression('membership', bad, context)).toThrow(/item schema/);
  });

  it('rejects a mismatched expression.kind', () => {
    expect(() => validateExpression('arithmetic', expression as unknown as ArithmeticExpression, context)).toThrow(
      /does not match rule kind/
    );
  });
});

describe('validateExpression: arithmetic', () => {
  it('rejects an unknown comparator', () => {
    const expression = {
      kind: 'arithmetic',
      left: { ref: 'property', property_id: 'p_total' },
      comparator: 'approx',
      right: { ref: 'constant', value: 1 },
    } as unknown as ArithmeticExpression;
    expect(() => validateExpression('arithmetic', expression, context)).toThrow(/unknown comparator/);
  });

  it('rejects an unknown aggregate inside an operand', () => {
    const expression: ArithmeticExpression = {
      kind: 'arithmetic',
      left: { ref: 'aggregate', fn: 'avg' as never, of: { ref: 'list_field', property_id: 'p_list', field: 'product_id' } },
      comparator: 'eq',
      right: { ref: 'property', property_id: 'p_total' },
    };
    expect(() => validateExpression('arithmetic', expression, context)).toThrow(/unknown aggregate/);
  });
});

describe('validateExpression: bound', () => {
  it('accepts non_empty with no bound operand', () => {
    const expression: BoundExpression = { kind: 'bound', subject: { ref: 'property', property_id: 'p_id' }, check: 'non_empty' };
    expect(() => validateExpression('bound', expression, context)).not.toThrow();
  });

  it('rejects lt with no bound operand', () => {
    const expression: BoundExpression = { kind: 'bound', subject: { ref: 'property', property_id: 'p_total' }, check: 'lt' };
    expect(() => validateExpression('bound', expression, context)).toThrow(/requires a "bound"/);
  });
});

describe('validateExpression: cross_event', () => {
  const childProps = {
    p_child_purchase_id: { property_id: 'p_child_purchase_id', data_type: 'string', item_schema: null },
    p_price: { property_id: 'p_price', data_type: 'number', item_schema: null },
    p_quantity: { property_id: 'p_quantity', data_type: 'number', item_schema: null },
  };
  const crossContext: ValidationContext = {
    properties: { p_purchase_id: { property_id: 'p_purchase_id', data_type: 'string', item_schema: null }, p_total: totalPrice },
    childProperties: childProps,
  };
  const expression: CrossEventExpression = {
    kind: 'cross_event',
    child_event_id: 'event_purchase_item',
    join: { parent_property_id: 'p_purchase_id', child_property_id: 'p_child_purchase_id' },
    child: {
      ref: 'aggregate',
      fn: 'sum',
      of: {
        ref: 'product',
        left: { ref: 'property', property_id: 'p_price' },
        right: { ref: 'property', property_id: 'p_quantity' },
      },
    },
    comparator: 'eq',
    target: { ref: 'property', property_id: 'p_total' },
  };

  it('accepts a valid cross_event expression', () => {
    expect(() => validateExpression('cross_event', expression, crossContext)).not.toThrow();
  });

  it('rejects a join property not on the child', () => {
    const bad: CrossEventExpression = {
      ...expression,
      join: { ...expression.join, child_property_id: 'not_on_child' },
    };
    expect(() => validateExpression('cross_event', bad, crossContext)).toThrow(RuleExpressionError);
  });

  it('rejects a non-aggregate child operand', () => {
    const bad = { ...expression, child: { ref: 'property', property_id: 'p_price' } } as unknown as CrossEventExpression;
    expect(() => validateExpression('cross_event', bad, crossContext)).toThrow(/must be an aggregate/);
  });
});
