import { describe, expect, it } from 'vitest';
import { groupRowsByCategory, toggleCollapsed } from './propertyTableGroups';
import { classifyProperty } from './propertyCategory';

const row = (name: string, extra: Record<string, unknown> = {}) => ({ name, scope: 'event', ...extra }) as any;

describe('groupRowsByCategory', () => {
  it('orders groups system customer, customer, sdk default, event and drops empty ones', () => {
    const rows = [row('purchase_total'), row('email', { scope: 'customer' }), row('loyalty_tier', { scope: 'customer' })];
    const groups = groupRowsByCategory(rows, classifyProperty);
    expect(groups.map((g) => g.category)).toEqual(['system_customer', 'customer', 'event']);
    expect(groups.map((g) => g.rows.length)).toEqual([1, 1, 1]);
  });
  it('keeps the input order inside a group so sorting applies within groups', () => {
    const rows = [row('b'), row('a'), row('c')];
    expect(groupRowsByCategory(rows, () => 'event')[0]!.rows.map((r: any) => r.name)).toEqual(['b', 'a', 'c']);
  });
  it('returns no groups for no rows', () => {
    expect(groupRowsByCategory([], () => 'event')).toEqual([]);
  });
  it('toggles collapse without mutating', () => {
    const a = new Set<any>();
    const b = toggleCollapsed(a, 'event');
    expect(a.size).toBe(0);
    expect(b.has('event')).toBe(true);
    expect(toggleCollapsed(b, 'event').has('event')).toBe(false);
  });
});
