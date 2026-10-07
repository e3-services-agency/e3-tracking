import { describe, expect, it } from 'vitest';
import { diffCarriedBy } from './carriedBy';
import type { IdentifierEventLike, IdentityRuleLike } from './identifiers';

const rules: IdentityRuleLike[] = [
  { id: 'r1', identifier_name: 'cookie', identity_type: 'soft' },
  { id: 'r2', identifier_name: 'email_id', identity_type: 'hard', sdk_call: 'identify' },
  { id: 'r3', identifier_name: 'cart_id', identity_type: 'soft', source_id: 's' },
];
const web: IdentifierEventLike = { id: 'web', name: 'view_item', implementation_method: 'client_web' };
const server: IdentifierEventLike = { id: 'srv', name: 'purchase', implementation_method: 'server_api', source_ids: ['s'] };
const events = [web, server];

describe('diffCarriedBy', () => {
  it('no change when the selection matches the derived carriers', () => {
    expect(diffCarriedBy('email_id', new Set(['web']), events, rules)).toEqual([]);
    expect(diffCarriedBy('cart_id', new Set(['srv']), events, rules)).toEqual([]);
  });

  it('ticking a non-derived event writes an explicit list in rule order', () => {
    expect(diffCarriedBy('cart_id', new Set(['srv', 'web']), events, rules)).toEqual([
      { event_id: 'web', identifiers: ['cookie', 'email_id', 'cart_id'] },
    ]);
  });

  it('unticking a derived event writes an explicit list without it', () => {
    expect(diffCarriedBy('email_id', new Set(), events, rules)).toEqual([{ event_id: 'web', identifiers: ['cookie'] }]);
  });

  it('removing from an explicit list that ends up equal to the derived default clears it', () => {
    const explicit = { ...web, identifiers_json: ['cookie', 'email_id', 'cart_id'] };
    expect(diffCarriedBy('cart_id', new Set<string>(), [explicit], rules)).toEqual([
      { event_id: 'web', identifiers: null },
    ]);
  });

  it('removing the last identifier writes an explicit [] (D-67 amendment 2)', () => {
    const only = { ...web, identifiers_json: ['cart_id'] };
    expect(diffCarriedBy('cart_id', new Set(), [only], rules)).toEqual([{ event_id: 'web', identifiers: [] }]);
    expect(diffCarriedBy('cart_id', new Set(), [server], rules)).toEqual([{ event_id: 'srv', identifiers: [] }]);
  });

  it('ticking an event that is explicitly empty adds the identifier, and drops no-op changes', () => {
    const none = { ...server, identifiers_json: [] as string[] };
    expect(diffCarriedBy('cart_id', new Set(['srv']), [none], rules)).toEqual([{ event_id: 'srv', identifiers: null }]);
    expect(diffCarriedBy('cart_id', new Set(), [none], rules)).toEqual([]);
  });

  it('a stale explicit list (no rule left) counts as derived, so unticking writes against the derived list', () => {
    const stale = { ...web, identifiers_json: ['ghost'] };
    expect(diffCarriedBy('email_id', new Set(), [stale], rules)).toEqual([{ event_id: 'web', identifiers: ['cookie'] }]);
  });
});
