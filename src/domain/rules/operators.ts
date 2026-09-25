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

/** A raw numeric timestamp above this magnitude is assumed to be Unix milliseconds, at or below
 * it Unix seconds (a seconds timestamp does not reach 1e12 until the year 33658; a milliseconds
 * timestamp already passed 1e12 in 2001) — the same "look at the magnitude" heuristic Bloomreach's
 * own event payloads rely on, since a raw observation carries no format metadata alongside the
 * value itself. */
const MS_TIMESTAMP_THRESHOLD = 1e12;

/** Coerces a value to a Unix-seconds timestamp, or `null` when it cannot be parsed. Accepts a
 * number or a numeric string (`toNumber`, magnitude decides seconds vs milliseconds — see
 * `MS_TIMESTAMP_THRESHOLD`) or a non-numeric string parsed as ISO-8601 (`Date.parse`, e.g.
 * `"2026-01-01T00:00:00Z"`); Bloomreach event payloads commonly send timestamps as strings, so
 * `toNumber`'s string handling is tried first before falling back to `Date.parse`. */
export function toTimestampSeconds(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric !== null) {
    return Math.abs(numeric) > MS_TIMESTAMP_THRESHOLD ? numeric / 1000 : numeric;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed / 1000 : null;
  }
  return null;
}

/** `count` counts every *present* item regardless of type (only `null`/`undefined` are dropped);
 * `sum`/`min`/`max` are numeric aggregates and coerce each value with `toNumber` first, dropping
 * whatever does not coerce. Each function owns its own coercion so `evaluate.ts` can pass the raw
 * per-item/per-child values straight through without knowing which aggregates are numeric (D-30
 * extension acceptance: a new aggregate is only a new entry here). */
export const AGGREGATES: Record<RuleAggregate, (values: unknown[]) => number> = {
  sum: (values) => values.reduce<number>((total, v) => { const n = toNumber(v); return n === null ? total : total + n; }, 0),
  count: (values) => values.filter((v) => v !== null && v !== undefined).length,
  min: (values) => {
    const nums = values.map(toNumber).filter((v): v is number => v !== null);
    return nums.length === 0 ? 0 : Math.min(...nums);
  },
  max: (values) => {
    const nums = values.map(toNumber).filter((v): v is number => v !== null);
    return nums.length === 0 ? 0 : Math.max(...nums);
  },
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
