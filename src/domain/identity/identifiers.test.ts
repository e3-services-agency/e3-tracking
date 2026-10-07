import { describe, expect, it } from 'vitest';
import {
  buildIdentificationFlow,
  describeTrigger,
  deriveEventIdentifiers,
  effectiveEventIdentifiers,
  type IdentifierEventLike,
  type IdentityRuleLike,
} from './identifiers';

const rules: IdentityRuleLike[] = [
  { id: 'r1', identifier_name: 'cookie', identity_type: 'soft', sdk_call: null },
  { id: 'r2', identifier_name: 'registered', identity_type: 'hard', sdk_call: 'identify', trigger_event_id: 'e-login', source_id: 's-web' },
  { id: 'r3', identifier_name: 'cart_id', identity_type: 'hard', sdk_call: null, source_id: 's-shop', trigger_text: 'the cart page.' },
];
const sources = [
  { id: 's-web', name: 'Web', system: 'shopify', method: 'web_sdk_gtm_datalayer', color: 'source-1' },
  { id: 's-shop', name: 'Backend', system: 'custom_backend', method: 'tracking_api', color: 'source-4' },
];
const web: IdentifierEventLike = { id: 'e-web', name: 'page_visit', implementation_method: 'client_web', source_ids: ['s-web'] };
const auto: IdentifierEventLike = { id: 'e-auto', name: 'session_start', implementation_method: 'sdk_auto' };
const server: IdentifierEventLike = { id: 'e-srv', name: 'purchase', implementation_method: 'server_api', source_ids: ['s-shop'] };
const login: IdentifierEventLike = { id: 'e-login', name: 'login', implementation_method: 'client_web' };

describe('deriveEventIdentifiers', () => {
  it('client and sdk events carry the cookie and identify rules', () => {
    expect(deriveEventIdentifiers(web, rules, sources)).toEqual(['cookie', 'registered']);
    expect(deriveEventIdentifiers(auto, rules, sources)).toEqual(['cookie', 'registered']);
  });
  it('server events carry the identifiers of their own source, else none', () => {
    expect(deriveEventIdentifiers(server, rules, sources)).toEqual(['cart_id']);
    expect(deriveEventIdentifiers({ ...server, source_ids: [] }, rules, sources)).toEqual([]);
    expect(deriveEventIdentifiers({ ...server, source_ids: ['gone'] }, rules, sources)).toEqual([]);
  });
});

describe('effectiveEventIdentifiers', () => {
  it('an explicit list wins and keeps rule order, dropping unknown names', () => {
    const e = { ...server, identifiers_json: ['registered', 'cart_id', 'ghost'] };
    expect(effectiveEventIdentifiers(e, rules, sources)).toEqual(['registered', 'cart_id']);
  });
  it('an explicit list that filters to nothing falls back to the derived default', () => {
    const e = { ...server, identifiers_json: ['ghost'] };
    expect(effectiveEventIdentifiers(e, rules, sources)).toEqual(['cart_id']);
  });
  it('null or empty falls back to the derived default', () => {
    expect(effectiveEventIdentifiers({ ...server, identifiers_json: null }, rules, sources)).toEqual(['cart_id']);
    expect(effectiveEventIdentifiers({ ...server, identifiers_json: [] }, rules, sources)).toEqual(['cart_id']);
  });
});

describe('buildIdentificationFlow', () => {
  const flow = buildIdentificationFlow(rules, [web, auto, server, login], sources);
  it('lists set_by and carried_by per rule', () => {
    const registered = flow.rules.find((r) => r.identifier_name === 'registered')!;
    expect(registered.set_by).toMatchObject({ kind: 'event', event: { name: 'login' }, source: { label: 'Shopify via GTM data layer' } });
    expect(registered.binds).toEqual([]);
    expect(registered.carried_by.map((e) => e.name)).toEqual(['login', 'page_visit', 'session_start']);
    expect(flow.rules.find((r) => r.identifier_name === 'cart_id')!.carried_by.map((e) => e.name)).toEqual(['purchase']);
  });
  it('writes a deterministic paragraph', () => {
    expect(flow.paragraph).toContain('A customer is identified by 3 identifiers: cookie (soft), registered (hard), cart_id (hard).');
    expect(flow.paragraph).toContain('registered is set when the login event fires, by Shopify via GTM data layer through the SDK identify call.');
    expect(flow.paragraph).toContain('cart_id is set by a standalone identify call on the cart page via Backend;');
    expect(flow.paragraph).toContain('purchase is sent with cart_id only and is merged into the profile through it.');
    expect(buildIdentificationFlow(rules, [web, auto, server, login], sources).paragraph).toBe(flow.paragraph);
  });
  it('handles no rules and unreferenced rules', () => {
    expect(buildIdentificationFlow([], [web], sources).paragraph).toMatch(/No identity rules/);
    const none = buildIdentificationFlow([rules[2]], [], sources);
    expect(none.paragraph).toContain('No event sends it in customer_ids yet.');
  });
});

describe('standalone identify call (D-67 amendment 1)', () => {
  const rs: IdentityRuleLike[] = [
    { id: 'c', identifier_name: 'cookie', identity_type: 'soft', sdk_call: null },
    { id: 'k', identifier_name: 'cart_id', identity_type: 'soft', sdk_call: 'identify', trigger_text: 'the checkout page', source_id: 's-web' },
    { id: 'u', identifier_name: 'unrecorded', identity_type: 'soft' },
  ];
  const cartUpdate: IdentifierEventLike = {
    id: 'e-cart', name: 'cart_update', implementation_method: 'server_api', source_ids: ['s-shop'], identifiers_json: ['cart_id'],
  };
  const flow = buildIdentificationFlow(rs, [cartUpdate, web], sources);
  it('types set_by as standalone_call, event or unknown', () => {
    const [, cart, unrecorded] = flow.rules;
    expect(cart.set_by).toMatchObject({ kind: 'standalone_call', sdk_call: 'identify', trigger_text: 'the checkout page', source: { name: 'Web' } });
    expect(unrecorded.set_by).toEqual({ kind: 'unknown' });
    const withEvent = buildIdentificationFlow([{ ...rs[1], trigger_event_id: 'e-web' }], [web], sources);
    expect(withEvent.rules[0].set_by.kind).toBe('event');
  });
  it('binds the cookie for a web source and the source ids for a server source', () => {
    expect(flow.rules[1].binds).toEqual(['cart_id', 'cookie']);
    const server = buildIdentificationFlow(
      [{ id: 'a', identifier_name: 'cart_id', identity_type: 'soft', sdk_call: 'identify', source_id: 's-shop' }, { id: 'b', identifier_name: 'order_id', identity_type: 'soft', source_id: 's-shop' }],
      [],
      sources
    );
    expect(server.rules[0].binds).toEqual(['cart_id', 'order_id']);
  });
  it('names the merge in the paragraph', () => {
    expect(flow.paragraph).toContain(
      'cart_id is set by a standalone identify call on the checkout page via Web together with cookie; cart_update is sent with cart_id only and is merged into the profile through it.'
    );
  });
});

describe('describeTrigger', () => {
  it('lower-cases the first letter, strips the period and picks on or when', () => {
    expect(describeTrigger('The SMS consent form is submitted.')).toEqual({ preposition: 'when', text: 'the SMS consent form is submitted' });
    expect(describeTrigger('the checkout page loads')).toEqual({ preposition: 'when', text: 'the checkout page loads' });
    expect(describeTrigger('First page view of a new visitor')).toEqual({ preposition: 'on', text: 'the first page view of a new visitor' });
    expect(describeTrigger('Checkout page.')).toEqual({ preposition: 'on', text: 'checkout page' });
    expect(describeTrigger('GTM push')).toEqual({ preposition: 'on', text: 'GTM push' });
    expect(describeTrigger('cart_id is set by the page')).toEqual({ preposition: 'when', text: 'cart_id is set by the page' });
  });
});
