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

  it('an emptied list is stored as null (the derived default applies)', () => {
    const only = { ...web, identifiers_json: ['cart_id'] };
    expect(diffCarriedBy('cart_id', new Set(), [only], rules)).toEqual([{ event_id: 'web', identifiers: null }]);
  });
});
