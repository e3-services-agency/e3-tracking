import { describe, expect, it } from 'vitest';
import {
  buildFindingPriorityContext,
  computeFindingPriority,
  parseFindingPriorityFilter,
  type FindingPriorityContextInput,
} from './findingPriority';

/**
 * Fixture events, one per tier:
 * - ev_tx: server_api (transactional), priority low
 * - ev_req: client_web, required by UC-01 through its variant
 * - ev_imp: client_web, priority high, no requirement
 * - ev_norm: client_web, priority medium
 * - ev_prop: client_web, R requirement only on property p_price (event_property) and p_qty (variant_property)
 * - ev_nopri: client_web, no priority at all
 */
function input(overrides: Partial<FindingPriorityContextInput> = {}): FindingPriorityContextInput {
  return {
    events: [
      { id: 'ev_tx', name: 'purchase', priority: 'low', implementation_method: 'server_api' },
      { id: 'ev_req', name: 'cart_update', priority: 'medium', implementation_method: 'client_web' },
      { id: 'ev_imp', name: 'view_item', priority: 'high', implementation_method: 'client_web' },
      { id: 'ev_norm', name: 'page_visit', priority: 'medium', implementation_method: 'client_web' },
      { id: 'ev_prop', name: 'checkout', priority: 'low', implementation_method: 'client_web' },
      { id: 'ev_nopri', name: 'search', priority: null, implementation_method: 'client_web' },
    ],
    variants: [
      { id: 'va_add', event_id: 'ev_req' },
      { id: 'va_step', event_id: 'ev_prop' },
    ],
    useCases: [
      { id: 'uc1', code: 'UC-01', name: 'Abandoned cart', status: 'live' },
      { id: 'uc2', code: 'UC-02', name: 'Checkout', status: 'approved' },
      { id: 'uc_dropped', code: 'UC-09', name: 'Old', status: 'dropped' },
      { id: 'uc_opt', code: 'UC-05', name: 'Optional', status: 'live' },
    ],
    requirements: [
      { use_case_id: 'uc1', target_kind: 'variant', level: 'R', event_id: null, variant_id: 'va_add', property_id: null },
      { use_case_id: 'uc2', target_kind: 'event_property', level: 'R', event_id: 'ev_prop', variant_id: null, property_id: 'p_price' },
      { use_case_id: 'uc2', target_kind: 'variant_property', level: 'R', event_id: null, variant_id: 'va_step', property_id: 'p_qty' },
      { use_case_id: 'uc_dropped', target_kind: 'event', level: 'R', event_id: 'ev_norm', variant_id: null, property_id: null },
      { use_case_id: 'uc_opt', target_kind: 'event', level: 'O', event_id: 'ev_imp', variant_id: null, property_id: null },
    ],
    ...overrides,
  };
}

const ctx = buildFindingPriorityContext(input());
const prio = (severity: string, event_id: string | null, property_id: string | null = null, finding_sequence = 1) =>
  computeFindingPriority({ severity, event_id, property_id, finding_sequence }, ctx);

describe('computeFindingPriority matrix (D-89)', () => {
  const cases: [string, string, string | null, string][] = [
    ['error', 'transactional', 'ev_tx', 'P1'],
    ['error', 'required', 'ev_req', 'P1'],
    ['error', 'important', 'ev_imp', 'P2'],
    ['error', 'normal', 'ev_norm', 'P2'],
    ['warning', 'transactional', 'ev_tx', 'P2'],
    ['warning', 'required', 'ev_req', 'P3'],
    ['warning', 'important', 'ev_imp', 'P3'],
    ['warning', 'normal', 'ev_norm', 'P4'],
    ['info', 'transactional', 'ev_tx', 'P3'],
    ['info', 'required', 'ev_req', 'P4'],
    ['info', 'important', 'ev_imp', 'P4'],
    ['info', 'normal', 'ev_norm', 'P4'],
  ];
  it.each(cases)('%s on a %s event is %s', (severity, tier, eventId, expected) => {
    const result = prio(severity, eventId);
    expect(result.tier).toBe(tier);
    expect(result.priority).toBe(expected);
  });
});

describe('tier predicates', () => {
  it('transactional wins over required and important, and names every tier that holds', () => {
    const c = buildFindingPriorityContext(
      input({
        events: [{ id: 'ev_tx', name: 'purchase', priority: 'critical', implementation_method: 'server_api' }],
        requirements: [{ use_case_id: 'uc1', target_kind: 'event', level: 'R', event_id: 'ev_tx', variant_id: null, property_id: null }],
      })
    );
    const r = computeFindingPriority({ severity: 'warning', event_id: 'ev_tx', property_id: null }, c);
    expect(r.tier).toBe('transactional');
    expect(r.priority).toBe('P2');
    expect(r.reasons).toEqual(['Warning', 'Transactional backend event', 'Required by UC-01', 'Event priority critical']);
  });

  it('a missing implementation method falls back to the default rule by name', () => {
    const c = buildFindingPriorityContext(input({ events: [{ id: 'e', name: 'purchase_item', priority: null, implementation_method: null }] }));
    expect(computeFindingPriority({ severity: 'error', event_id: 'e', property_id: null }, c).tier).toBe('transactional');
  });

  it('a dropped use case does not make an event required', () => {
    expect(prio('error', 'ev_norm').tier).toBe('normal');
  });

  it('an O-level requirement does not make an event required', () => {
    const r = prio('warning', 'ev_imp');
    expect(r.tier).toBe('important');
    expect(r.reasons).toEqual(['Warning', 'Event priority high']);
  });

  it('a variant requirement makes the whole event required, whatever the finding variant or property', () => {
    expect(prio('error', 'ev_req', 'p_any').reasons).toEqual(['Error: blocks certification', 'Required by UC-01']);
  });

  it('an event_property requirement applies only to findings on that property', () => {
    expect(prio('error', 'ev_prop', 'p_price').tier).toBe('required');
    expect(prio('error', 'ev_prop', 'p_other').tier).toBe('normal');
    expect(prio('error', 'ev_prop', null).tier).toBe('normal');
  });

  it('a property requirement on one event never makes the same property required on another event', () => {
    // p_price is required on ev_prop (event_property), p_qty on ev_prop's variant (variant_property).
    expect(prio('error', 'ev_norm', 'p_price')).toMatchObject({ tier: 'normal', priority: 'P2', reasons: ['Error: blocks certification'] });
    expect(prio('warning', 'ev_norm', 'p_qty')).toMatchObject({ tier: 'normal', priority: 'P4', reasons: ['Warning'] });
    expect(prio('error', 'ev_prop', 'p_price').tier).toBe('required');
  });

  it('a variant_property requirement applies to the property on the variant event', () => {
    const r = prio('warning', 'ev_prop', 'p_qty');
    expect(r.tier).toBe('required');
    expect(r.priority).toBe('P3');
    expect(r.reasons).toEqual(['Warning', 'Required by UC-02']);
  });

  it('a project-level finding (no event) is normal', () => {
    const r = prio('error', null);
    expect(r).toMatchObject({ tier: 'normal', priority: 'P2', reasons: ['Error: blocks certification'] });
  });

  it('a finding on an unknown or deleted event is normal', () => {
    expect(prio('error', 'ev_gone').tier).toBe('normal');
  });

  it('a missing event priority is not important and sorts after low', () => {
    const none = prio('warning', 'ev_nopri', null, 5);
    expect(none).toMatchObject({ tier: 'normal', priority: 'P4', reasons: ['Warning'] });
    const low = computeFindingPriority(
      { severity: 'warning', event_id: 'x', property_id: null, finding_sequence: 5 },
      buildFindingPriorityContext(input({ events: [{ id: 'x', name: 'x', priority: 'low', implementation_method: 'client_web' }] }))
    );
    expect(low.rank).toBeLessThan(none.rank);
  });

  it('lists at most three use cases, then +N, sorted by code', () => {
    const useCases = ['UC-10', 'UC-02', 'UC-03', 'UC-01', 'UC-04'].map((code, i) => ({ id: `u${i}`, code, name: code, status: 'live' }));
    const c = buildFindingPriorityContext(
      input({
        useCases,
        requirements: useCases.map((uc) => ({ use_case_id: uc.id, target_kind: 'event', level: 'R', event_id: 'ev_norm', variant_id: null, property_id: null })),
      })
    );
    expect(computeFindingPriority({ severity: 'info', event_id: 'ev_norm', property_id: null }, c).reasons).toEqual([
      'Info',
      'Required by UC-01, UC-02, UC-03 +2',
    ]);
  });

  it('merges event and property requirements without duplicates', () => {
    const c = buildFindingPriorityContext(
      input({
        requirements: [
          { use_case_id: 'uc1', target_kind: 'event', level: 'R', event_id: 'ev_norm', variant_id: null, property_id: null },
          { use_case_id: 'uc1', target_kind: 'event_property', level: 'R', event_id: 'ev_norm', variant_id: null, property_id: 'p' },
          { use_case_id: 'uc2', target_kind: 'event_property', level: 'R', event_id: 'ev_norm', variant_id: null, property_id: 'p' },
        ],
      })
    );
    expect(computeFindingPriority({ severity: 'error', event_id: 'ev_norm', property_id: 'p' }, c).reasons[1]).toBe('Required by UC-01, UC-02');
  });

  it('falls back to the use case name when it has no code', () => {
    const c = buildFindingPriorityContext(
      input({
        useCases: [{ id: 'u', code: null, name: 'Welcome flow', status: 'proposed' }],
        requirements: [{ use_case_id: 'u', target_kind: 'event', level: 'R', event_id: 'ev_norm', variant_id: null, property_id: null }],
      })
    );
    expect(computeFindingPriority({ severity: 'error', event_id: 'ev_norm', property_id: null }, c).reasons[1]).toBe('Required by Welcome flow');
  });
});

describe('rank', () => {
  it('orders by priority, then severity, then tier, then event priority, then finding_sequence', () => {
    const p1transactional = prio('error', 'ev_tx', null, 9);
    const p1required = prio('error', 'ev_req', null, 1);
    expect(p1transactional.rank).toBeLessThan(p1required.rank); // same priority and severity, tier before sequence
    const p2error = prio('error', 'ev_imp', null, 1);
    const p2warning = prio('warning', 'ev_tx', null, 1);
    expect(p1required.rank).toBeLessThan(p2error.rank);
    expect(p2error.rank).toBeLessThan(p2warning.rank); // same priority, error before warning
    const p3important = prio('warning', 'ev_imp', null, 1);
    const p3required = prio('warning', 'ev_req', null, 99);
    expect(p3required.rank).toBeLessThan(p3important.rank); // same priority and severity, required tier first
    const p2errorNormalMedium = prio('error', 'ev_norm', null, 1);
    expect(p2error.rank).toBeLessThan(p2errorNormalMedium.rank); // important before normal
    expect(prio('info', 'ev_norm', null, 3).rank).toBeLessThan(prio('info', 'ev_norm', null, 4).rank);
  });

  it('is stable for identical inputs and a missing sequence sorts last', () => {
    expect(prio('error', 'ev_tx', null, 7)).toEqual(prio('error', 'ev_tx', null, 7));
    const missing = computeFindingPriority({ severity: 'error', event_id: 'ev_tx', property_id: null }, ctx);
    expect(missing.rank).toBeGreaterThan(prio('error', 'ev_tx', null, 9_000_000).rank);
    expect(Number.isSafeInteger(prio('info', null, null, 9_999_999).rank)).toBe(true);
  });
});

describe('parseFindingPriorityFilter', () => {
  it('parses comma lists and repeated values', () => {
    expect([...parseFindingPriorityFilter('P1,p2')!]).toEqual(['P1', 'P2']);
    expect([...parseFindingPriorityFilter(['P3', 'P4'])!]).toEqual(['P3', 'P4']);
    expect(parseFindingPriorityFilter(undefined)).toBeNull();
    expect(parseFindingPriorityFilter('')).toBeNull();
  });
  it('throws on an unknown value', () => {
    expect(() => parseFindingPriorityFilter('P5')).toThrow(RangeError);
    expect(() => parseFindingPriorityFilter('high')).toThrow(RangeError);
  });
});
