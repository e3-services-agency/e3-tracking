/**
 * State list consistency checks (D-63, T-4-17): list lengths agree, ids are typed consistently,
 * the interacted id is present after add and absent after remove with quantity 0. Fixture: a
 * `cart_update` event with product_ids / product_list / variant_ids, observations built from the
 * wishlist-style payload.
 */
import { describe, expect, it } from 'vitest';
import type { DefinitionSnapshot, EngineObservation } from '../comparison/definitionVsObservations';
import { buildStateListChecks, runStateListChecks } from './stateLists';

const EVENT_ID = 'ev-cart';

function definition(extra: Partial<DefinitionSnapshot['events'][number]> = {}): DefinitionSnapshot {
  const base = (id: string, name: string, kind: string, derivation: unknown) => ({
    property_id: id,
    name,
    payload_key: null,
    role: 'normal' as const,
    required: true,
    data_type: 'array',
    data_formats: [],
    allowed_values: null,
    kind,
    derivation,
  });
  return {
    project_default_expiration: null,
    variants: [],
    standard_event_mappings: [],
    events: [
      {
        id: EVENT_ID,
        name: 'cart_update',
        status: 'planned',
        class: 'custom',
        expiration: null,
        properties: [
          base('p-ids', 'product_ids', 'state_list', { source: 'items', id_field: 'product_id', form: 'ids' }),
          base('p-list', 'product_list', 'state_list', { source: 'items', id_field: 'product_id', form: 'id_quantity', quantity_field: 'quantity' }),
          base('p-vids', 'variant_ids', 'state_list', { source: 'items', id_field: 'variant_id', form: 'ids' }),
          base('p-total', 'total_price', 'state_list', { source: 'items', sum: 'price*quantity' }),
          base('p-plain', 'placement', 'event', null),
        ],
        ...extra,
      },
    ] as DefinitionSnapshot['events'],
  };
}

let n = 0;
function obs(properties: Record<string, unknown>): EngineObservation {
  n += 1;
  return {
    id: `obs-${n}`,
    event_type: 'cart_update',
    event_id: EVENT_ID,
    variant_id: null,
    timestamp: 1_700_000_000 + n,
    properties,
    run_kind: 'manual',
  };
}

const checks = buildStateListChecks(definition(), [EVENT_ID]);

describe('buildStateListChecks', () => {
  it('collects list derivations only, and only for custom events', () => {
    expect(checks).toHaveLength(1);
    expect(checks[0].lists.map((l) => l.payload_key)).toEqual(['product_ids', 'product_list', 'variant_ids']);
    expect(buildStateListChecks(definition(), [])).toEqual([]);
  });
});

describe('runStateListChecks', () => {
  it('passes a consistent add', () => {
    const findings = runStateListChecks(checks, [
      obs({
        action: 'add',
        product_id: 'a',
        product_ids: ['a', 'b'],
        product_list: [{ product_id: 'a', quantity: 1 }, { product_id: 'b', quantity: 2 }],
        variant_ids: ['v1'],
      }),
    ]);
    expect(findings).toEqual([]);
  });

  it('flags lists of different lengths', () => {
    const findings = runStateListChecks(checks, [
      obs({ product_ids: ['a', 'b'], product_list: [{ product_id: 'a', quantity: 1 }] }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: 'state_list_mismatch',
      severity: 'error',
      comparison: 'definition_vs_observations',
      event_id: EVENT_ID,
      property_id: 'p-ids',
      actual_json: { product_ids: 2, product_list: 1 },
    });
    expect(findings[0].message).toContain('product_ids has 2, product_list has 1');
  });

  it('flags ids typed inconsistently across lists', () => {
    const findings = runStateListChecks(checks, [
      obs({ product_ids: ['1'], product_list: [{ product_id: 1, quantity: 1 }] }),
    ]);
    expect(findings.map((f) => f.fingerprint.split('|').pop())).toEqual(['type:product_id']);
    expect(findings[0].actual_json).toEqual({ types: ['number', 'string'] });
  });

  it('flags an add whose interacted id is missing from the lists', () => {
    const findings = runStateListChecks(checks, [
      obs({ action: 'add', product_id: 'z', product_ids: ['a'], product_list: [{ product_id: 'a', quantity: 1 }] }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].fingerprint.split('|').pop()).toBe('add_missing:product_id');
    expect(findings[0].actual_json).toEqual({ missing_in: ['product_ids', 'product_list'] });
  });

  it('flags a remove with quantity 0 whose id is still listed, but not a remove that keeps quantity', () => {
    const bad = runStateListChecks(checks, [
      obs({ action: 'remove', quantity: 0, product_id: 'a', product_ids: ['a'], product_list: [{ product_id: 'a', quantity: 1 }] }),
    ]);
    expect(bad).toHaveLength(1);
    expect(bad[0].fingerprint.split('|').pop()).toBe('remove_present:product_id');

    const partial = runStateListChecks(checks, [
      obs({ action: 'remove', quantity: 1, product_id: 'a', product_ids: ['a'], product_list: [{ product_id: 'a', quantity: 1 }] }),
    ]);
    expect(partial).toEqual([]);

    const gone = runStateListChecks(checks, [
      obs({ action: 'remove', quantity: 0, product_id: 'a', product_ids: [], product_list: [] }),
    ]);
    expect(gone).toEqual([]);
  });

  it('coerces ids for the interacted comparison (number vs string) and ignores absent lists', () => {
    expect(
      runStateListChecks(checks, [obs({ action: 'add', product_id: 7, product_ids: ['7'], product_list: [{ product_id: '7', quantity: 1 }] })])
        .map((f) => f.fingerprint.split('|').pop())
    ).toEqual([]);
    // No lists in the payload at all: nothing to compare, missing_required covers absence.
    expect(runStateListChecks(checks, [obs({ action: 'add', product_id: 'a' })])).toEqual([]);
  });

  it('reports one finding per fingerprint, anchored on the first offending observation', () => {
    const first = obs({ product_ids: ['a', 'b'], product_list: [] });
    const second = obs({ product_ids: ['a'], product_list: [] });
    const findings = runStateListChecks(checks, [first, second]);
    expect(findings).toHaveLength(1);
    expect(findings[0].observation_id).toBe(first.id);
  });

  it('ignores observations of other events', () => {
    const other = { ...obs({ product_ids: ['a'], product_list: [] }), event_id: 'other' };
    expect(runStateListChecks(checks, [other])).toEqual([]);
  });
});
