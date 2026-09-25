import { describe, expect, it } from 'vitest';
import { generateUseCaseNarrative, type NarrativeRequirement, type NarrativeRule } from './useCaseNarrative';

const useCase = {
  name: 'Add to cart to purchase',
  type: 'transactional',
  description: 'Tracks the shopper from adding an item to a confirmed purchase.',
};

const requirements: NarrativeRequirement[] = [
  {
    target_kind: 'variant',
    level: 'R',
    status: 'resolved',
    note: null,
    event_label: 'cart_update',
    variant_label: 'cart_update[action=add]',
    property_label: null,
  },
  {
    target_kind: 'variant_property',
    level: 'R',
    status: 'resolved',
    note: null,
    event_label: 'cart_update',
    variant_label: 'cart_update[action=add]',
    property_label: 'product_id',
  },
  {
    target_kind: 'variant_property',
    level: 'R',
    status: 'resolved',
    note: null,
    event_label: 'cart_update',
    variant_label: 'cart_update[action=add]',
    property_label: 'total_price',
  },
  {
    target_kind: 'variant_property',
    level: 'O',
    status: 'resolved',
    note: null,
    event_label: 'cart_update',
    variant_label: 'cart_update[action=add]',
    property_label: 'voucher_code',
  },
  {
    target_kind: 'event',
    level: 'R',
    status: 'resolved',
    note: null,
    event_label: 'checkout',
    variant_label: null,
    property_label: null,
  },
  {
    target_kind: 'event_property',
    level: 'R',
    status: 'gap',
    note: null,
    event_label: 'checkout',
    variant_label: null,
    property_label: 'total_price',
  },
  {
    target_kind: 'event',
    level: 'R',
    status: 'resolved',
    note: null,
    event_label: 'purchase',
    variant_label: null,
    property_label: null,
  },
  {
    target_kind: 'event_property',
    level: 'R',
    status: 'resolved',
    note: null,
    event_label: 'purchase',
    variant_label: null,
    property_label: 'total_price',
  },
  {
    target_kind: 'customer_property',
    level: 'R',
    status: 'resolved',
    note: null,
    event_label: null,
    variant_label: null,
    property_label: 'email',
  },
  {
    target_kind: 'customer_property',
    level: 'O',
    status: 'gap',
    note: 'Client has not confirmed a loyalty id property yet.',
    event_label: null,
    variant_label: null,
    property_label: 'loyalty_id',
  },
];

const rules: NarrativeRule[] = [
  {
    event_label: 'purchase',
    name: 'purchase_items_total',
    message: 'Sum of purchase_item totals should match purchase.total_price within tolerance.',
  },
];

describe('generateUseCaseNarrative', () => {
  it('matches the snapshot for a synthetic add-to-cart / checkout / purchase use case', () => {
    expect(generateUseCaseNarrative(useCase, requirements, rules)).toMatchSnapshot();
  });

  it('folds variant_property requirements into the variant step that introduced them, splitting required vs optional', () => {
    const text = generateUseCaseNarrative(useCase, requirements, []);
    expect(text).toContain(
      'The site sends `cart_update[action=add]` with required `product_id`, `total_price` and optional `voucher_code`.'
    );
  });

  it('lists gaps with their note', () => {
    const text = generateUseCaseNarrative(useCase, requirements, []);
    expect(text).toContain('- checkout.total_price: not yet mapped.');
    expect(text).toContain('- loyalty_id: Client has not confirmed a loyalty id property yet.');
  });

  it('renders a minimal narrative when there are no requirements', () => {
    const text = generateUseCaseNarrative(useCase, [], []);
    expect(text).toBe(
      'Add to cart to purchase is a transactional use case. Tracks the shopper from adding an item to a confirmed purchase.\n\nNo requirements have been defined for this use case yet.'
    );
  });

  it('omits the Guardrails section when no rules are passed', () => {
    const text = generateUseCaseNarrative(useCase, requirements, []);
    expect(text).not.toContain('## Guardrails');
  });

  it('includes the Guardrails section with the event, name and message when rules are passed', () => {
    const text = generateUseCaseNarrative(useCase, requirements, rules);
    expect(text).toContain('## Guardrails');
    expect(text).toContain('`purchase`: purchase_items_total -- Sum of purchase_item totals should match purchase.total_price within tolerance.');
  });
});
