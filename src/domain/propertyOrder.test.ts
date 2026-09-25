import { describe, expect, it } from 'vitest';
import { mergeFrozenOrder } from './propertyOrder';

describe('mergeFrozenOrder', () => {
  it('keeps a renamed row in its previous position while the editor stays open', () => {
    // "action" (id a2) renamed to "zzz_action" would sort last alphabetically, but the frozen
    // order (from before the rename) must hold: a1, a2, a3 stay in their original slots.
    const previousOrder = ['a1', 'a2', 'a3'];
    const currentIds = ['a1', 'a2', 'a3']; // same ids, server order irrelevant once frozen
    expect(mergeFrozenOrder(previousOrder, currentIds)).toEqual(['a1', 'a2', 'a3']);
  });

  it('appends a newly created id at the end instead of wherever the server sorts it', () => {
    const previousOrder = ['a1', 'a2'];
    const currentIds = ['a1', 'a0-new', 'a2']; // server sorts the new id first alphabetically
    expect(mergeFrozenOrder(previousOrder, currentIds)).toEqual(['a1', 'a2', 'a0-new']);
  });

  it('drops a deleted id without shifting the rest', () => {
    const previousOrder = ['a1', 'a2', 'a3'];
    const currentIds = ['a1', 'a3'];
    expect(mergeFrozenOrder(previousOrder, currentIds)).toEqual(['a1', 'a3']);
  });

  it('re-syncs to the server order once the caller stops freezing (empty previous order in, current order out)', () => {
    // Once the editor closes, `Properties.tsx` stops calling this helper and uses `properties`
    // directly; simulating a fresh freeze (previousOrder reset) reduces to the current server order.
    const currentIds = ['b', 'a', 'c'];
    expect(mergeFrozenOrder([], currentIds)).toEqual(['b', 'a', 'c']);
  });
});
