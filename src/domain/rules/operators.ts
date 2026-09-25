/**
 * Operator registry (D-30, D-31, T-2-06): the only place that names an aggregate, comparator or
 * bound check. `evaluate.ts` walks expressions and indexes into these three `Record`s by the
 * enum value carried in the expression; it never names an operator itself. Extension acceptance
 * criterion (D-30): adding a new aggregate/comparator/bound check touches only `src/domain/enums.ts`
 * (a new member on `RULE_AGGREGATES`/`RULE_COMPARATORS`/`RULE_BOUND_CHECKS`), this file (a new
 * registry entry) and one test — see `operators.test.ts`.
 */
import { RULE_AGGREGATES, RULE_BOUND_CHECKS, RULE_COMPARATORS } from '../enums';
import type { RuleAggregate, RuleBoundCheck, RuleComparator } from '../enums';

/** Coerces a value to a finite number, or `null` when that is not possible (string numbers from
 * raw JSON payloads are accepted, same convention as `definitionVsObservations.ts`'s `toNumber`). */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerces a value to a Unix-seconds timestamp, or `null`. Accepts a number (assumed seconds) or
 * an ISO-8601 string. */
export function toTimestampSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed / 1000 : null;
  }
  return null;
}

export const AGGREGATES: Record<RuleAggregate, (values: number[]) => number> = {
  sum: (values) => values.reduce((total, v) => total + v, 0),
  count: (values) => values.length,
  min: (values) => (values.length === 0 ? 0 : Math.min(...values)),
  max: (values) => (values.length === 0 ? 0 : Math.max(...values)),
};

/** `(left, right, tolerance) => boolean`. `tolerance` (always >= 0) only affects `eq`/`neq`: the
 * two exact-comparators are tolerance-aware ("equal within tolerance") while the four ordering
 * comparators are exact, per D-30 ("compared with ==, <, <=, >, >= ... with tolerance"). */
export const COMPARATORS: Record<RuleComparator, (left: number, right: number, tolerance: number) => boolean> = {
  eq: (left, right, tolerance) => Math.abs(left - right) <= tolerance,
  neq: (left, right, tolerance) => Math.abs(left - right) > tolerance,
  lt: (left, right) => left < right,
  lte: (left, right) => left <= right,
  gt: (left, right) => left > right,
  gte: (left, right) => left >= right,
};

/** `(value, bound, nowSeconds) => boolean`. The four comparator-named checks reuse `COMPARATORS`
 * with a numeric coercion of `value`/`bound` (tolerance 0 — bound checks are exact); `non_empty`
 * and `not_future` ignore `bound`. */
export const BOUND_CHECKS: Record<RuleBoundCheck, (value: unknown, bound: unknown, nowSeconds: number) => boolean> = {
  non_empty: (value) => value !== null && value !== undefined && String(value).trim() !== '',
  not_future: (value, _bound, nowSeconds) => {
    const t = toTimestampSeconds(value);
    return t !== null && t <= nowSeconds;
  },
  eq: (value, bound) => {
    const v = toNumber(value);
    const b = toNumber(bound);
    return v !== null && b !== null && COMPARATORS.eq(v, b, 0);
  },
  neq: (value, bound) => {
    const v = toNumber(value);
    const b = toNumber(bound);
    return v !== null && b !== null && COMPARATORS.neq(v, b, 0);
  },
  lt: (value, bound) => {
    const v = toNumber(value);
    const b = toNumber(bound);
    return v !== null && b !== null && COMPARATORS.lt(v, b, 0);
  },
  lte: (value, bound) => {
    const v = toNumber(value);
    const b = toNumber(bound);
    return v !== null && b !== null && COMPARATORS.lte(v, b, 0);
  },
  gt: (value, bound) => {
    const v = toNumber(value);
    const b = toNumber(bound);
    return v !== null && b !== null && COMPARATORS.gt(v, b, 0);
  },
  gte: (value, bound) => {
    const v = toNumber(value);
    const b = toNumber(bound);
    return v !== null && b !== null && COMPARATORS.gte(v, b, 0);
  },
};

/** Every registry actually covers its enum (used by `operators.test.ts`'s extension-acceptance
 * test): a missing registration is a startup-time failure, not a silent `undefined` at eval time. */
export function assertRegistryComplete(): void {
  for (const fn of RULE_AGGREGATES) {
    if (!(fn in AGGREGATES)) throw new Error(`AGGREGATES is missing a registration for "${fn}".`);
  }
  for (const comparator of RULE_COMPARATORS) {
    if (!(comparator in COMPARATORS)) throw new Error(`COMPARATORS is missing a registration for "${comparator}".`);
  }
  for (const check of RULE_BOUND_CHECKS) {
    if (!(check in BOUND_CHECKS)) throw new Error(`BOUND_CHECKS is missing a registration for "${check}".`);
  }
}
