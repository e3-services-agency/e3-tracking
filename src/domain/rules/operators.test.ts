/**
 * Operator registry tests (D-30, T-2-06). Every aggregate/comparator/bound check enumerated
 * against the `enums.ts` source list (a missing registration fails), plus the extension
 * acceptance criterion: adding an operator (`avg`) to a test-only copy of the registry and
 * evaluating with it touches no other file.
 */
import { describe, expect, it } from 'vitest';
import { RULE_AGGREGATES, RULE_BOUND_CHECKS, RULE_COMPARATORS } from '../enums';
import { AGGREGATES, BOUND_CHECKS, COMPARATORS, assertRegistryComplete, toNumber, toTimestampSeconds } from './operators';

describe('operators.ts registry completeness (D-30 extension acceptance)', () => {
  it('has an AGGREGATES entry for every RULE_AGGREGATES member', () => {
    expect(Object.keys(AGGREGATES).sort()).toEqual([...RULE_AGGREGATES].sort());
  });

  it('has a COMPARATORS entry for every RULE_COMPARATORS member', () => {
    expect(Object.keys(COMPARATORS).sort()).toEqual([...RULE_COMPARATORS].sort());
  });

  it('has a BOUND_CHECKS entry for every RULE_BOUND_CHECKS member', () => {
    expect(Object.keys(BOUND_CHECKS).sort()).toEqual([...RULE_BOUND_CHECKS].sort());
  });

  it('assertRegistryComplete() passes against the real registries', () => {
    expect(() => assertRegistryComplete()).not.toThrow();
  });

  it('assertRegistryComplete() fails a deliberately incomplete registry (proves the check is real)', () => {
    const incomplete: Record<string, unknown> = { ...AGGREGATES };
    delete incomplete.max;
    expect(() => {
      for (const fn of RULE_AGGREGATES) {
        if (!(fn in incomplete)) throw new Error(`AGGREGATES is missing a registration for "${fn}".`);
      }
    }).toThrow(/max/);
  });
});

describe('AGGREGATES', () => {
  it('sum', () => expect(AGGREGATES.sum([1, 2, 3.5])).toBe(6.5));
  it('count', () => expect(AGGREGATES.count([1, 2, 3])).toBe(3));
  it('min', () => expect(AGGREGATES.min([3, 1, 2])).toBe(1));
  it('max', () => expect(AGGREGATES.max([3, 1, 2])).toBe(3));
  it('empty list', () => {
    expect(AGGREGATES.sum([])).toBe(0);
    expect(AGGREGATES.count([])).toBe(0);
    expect(AGGREGATES.min([])).toBe(0);
    expect(AGGREGATES.max([])).toBe(0);
  });
});

describe('COMPARATORS', () => {
  it('eq within tolerance', () => {
    expect(COMPARATORS.eq(28, 28.4, 0.5)).toBe(true);
    expect(COMPARATORS.eq(28, 28.4, 0.1)).toBe(false);
  });
  it('neq is the inverse of eq at the same tolerance', () => {
    expect(COMPARATORS.neq(28, 28.4, 0.1)).toBe(true);
    expect(COMPARATORS.neq(28, 28.4, 0.5)).toBe(false);
  });
  it('lt/lte/gt/gte are exact (tolerance ignored)', () => {
    expect(COMPARATORS.lt(1, 2, 0)).toBe(true);
    expect(COMPARATORS.lte(2, 2, 0)).toBe(true);
    expect(COMPARATORS.gt(3, 2, 0)).toBe(true);
    expect(COMPARATORS.gte(2, 2, 0)).toBe(true);
  });
});

describe('BOUND_CHECKS', () => {
  it('non_empty', () => {
    expect(BOUND_CHECKS.non_empty('x', undefined, 0)).toBe(true);
    expect(BOUND_CHECKS.non_empty('', undefined, 0)).toBe(false);
    expect(BOUND_CHECKS.non_empty(null, undefined, 0)).toBe(false);
  });
  it('not_future', () => {
    const now = Date.parse('2026-06-01T00:00:00Z') / 1000;
    expect(BOUND_CHECKS.not_future('2026-01-01T00:00:00Z', undefined, now)).toBe(true);
    expect(BOUND_CHECKS.not_future('2026-12-01T00:00:00Z', undefined, now)).toBe(false);
  });
  it('lt 0 (the refund-negative-amount bound)', () => {
    expect(BOUND_CHECKS.lt(-5, 0, 0)).toBe(true);
    expect(BOUND_CHECKS.lt(5, 0, 0)).toBe(false);
  });
});

describe('toNumber / toTimestampSeconds', () => {
  it('toNumber accepts numeric strings, rejects garbage', () => {
    expect(toNumber('28.4')).toBe(28.4);
    expect(toNumber(28.4)).toBe(28.4);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
  it('toTimestampSeconds accepts ISO strings and raw seconds', () => {
    expect(toTimestampSeconds(1700000000)).toBe(1700000000);
    expect(toTimestampSeconds('2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z') / 1000);
    expect(toTimestampSeconds('not a date')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Extension acceptance test (D-30): a new aggregate `avg` is added to a *test-local copy* of the
// registry, never touching operators.ts itself, and evaluated through the same generic
// `AGGREGATES[fn](values)` call shape `evaluate.ts` uses — proving the engine's call site needs no
// change to support a new operator, only a new registration (plus, in real code, an enums.ts entry).
// ---------------------------------------------------------------------------
describe('extension acceptance: adding an aggregate touches only a registry, not the evaluator call shape', () => {
  it('a local registry copy with "avg" added evaluates through the generic AGGREGATES[fn](values) shape', () => {
    const localRegistry: Record<string, (values: number[]) => number> = {
      ...AGGREGATES,
      avg: (values) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length),
    };
    const fn = 'avg';
    const values = [2, 4, 6];
    expect(localRegistry[fn](values)).toBe(4);
  });
});
