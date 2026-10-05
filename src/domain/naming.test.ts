import { describe, expect, it } from 'vitest';
import { NAMING_CONVENTIONS } from './enums';
import { isNamingExempt, matchesConvention, namingNote, namingWarning } from './naming';

describe('matchesConvention (D-65)', () => {
  it('snake_case', () => {
    for (const ok of ['order', 'order_total', 'cart_update2', 'a_1']) expect(matchesConvention(ok, 'snake_case')).toBe(true);
    for (const bad of ['orderTotal', 'order-total', 'Order', 'order__total', '_order', 'order_', '2order', 'order total', '']) {
      expect(matchesConvention(bad, 'snake_case')).toBe(false);
    }
  });
  it('kebab_case', () => {
    for (const ok of ['order', 'order-total', 'cart-update2']) expect(matchesConvention(ok, 'kebab_case')).toBe(true);
    for (const bad of ['order_total', 'orderTotal', 'Order-total', 'order--total', '-order', 'order-']) {
      expect(matchesConvention(bad, 'kebab_case')).toBe(false);
    }
  });
  it('camel_case', () => {
    for (const ok of ['order', 'orderTotal', 'cartUpdate2', 'userId']) expect(matchesConvention(ok, 'camel_case')).toBe(true);
    for (const bad of ['order_total', 'order-total', 'OrderTotal', 'orderT', 'orderTOTAL']) {
      expect(matchesConvention(bad, 'camel_case')).toBe(false);
    }
  });
  it('a single lower-case word follows every convention', () => {
    for (const c of NAMING_CONVENTIONS) expect(matchesConvention('purchase', c)).toBe(true);
  });
});

describe('isNamingExempt', () => {
  it('exempts sdk and platform events but not custom ones', () => {
    expect(isNamingExempt({ kind: 'event', class: 'sdk' })).toBe(true);
    expect(isNamingExempt({ kind: 'event', class: 'platform' })).toBe(true);
    expect(isNamingExempt({ kind: 'event', class: 'custom' })).toBe(false);
  });
  it('exempts SDK default and reserved system customer properties, honouring an override', () => {
    expect(isNamingExempt({ kind: 'property', scope: 'event', name: 'os' })).toBe(true);
    expect(isNamingExempt({ kind: 'property', scope: 'customer', name: 'first_name' })).toBe(true);
    expect(isNamingExempt({ kind: 'property', scope: 'customer', name: 'loyaltyTier' })).toBe(false);
    expect(isNamingExempt({ kind: 'property', scope: 'event', name: 'orderTotal' })).toBe(false);
    expect(isNamingExempt({ kind: 'property', scope: 'customer', name: 'email', category_override: 'customer' })).toBe(false);
    expect(isNamingExempt({ kind: 'property', scope: 'event', name: 'weird-name', category_override: 'sdk_default' })).toBe(true);
  });
  it('exempts standard event keys', () => {
    expect(isNamingExempt({ kind: 'standard_event_key' })).toBe(true);
  });
});

describe('namingWarning and namingNote', () => {
  it('warns only for a non-empty, non-exempt, non-conforming name', () => {
    const ev = { kind: 'event' as const, class: 'custom' };
    expect(namingWarning(ev, 'orderPlaced', 'snake_case')).toContain('snake_case');
    expect(namingWarning(ev, 'order_placed', 'snake_case')).toBeNull();
    expect(namingWarning(ev, '', 'snake_case')).toBeNull();
    expect(namingWarning({ kind: 'event', class: 'sdk' }, 'sessionStart', 'snake_case')).toBeNull();
  });
  it('writes the shared page note', () => {
    expect(namingNote('snake_case')).toBe('Naming convention: snake_case (system items exempt)');
    expect(namingNote('kebab_case')).toContain('kebab-case');
  });
});
