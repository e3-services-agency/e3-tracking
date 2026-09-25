/**
 * Rule evaluator (D-30, D-31, T-2-06). Pure: walks a `RuleDefinition`'s expression against one
 * observation (plus, for `cross_event`, the set of sibling observations to search children in)
 * and a `RuleSnapshot`. Never names an aggregate/comparator/bound-check literal — every operator
 * call goes through `operators.ts`'s registries (D-30 extension acceptance criterion, asserted by
 * `evaluate.test.ts`'s source-scan test). `comparison.service.ts` builds the `RuleSnapshot` and
 * calls this per rule per observation (wired in T-2-07, not here).
 *
 * T-2-05 fix round (Finding 2): every `snapshot.propertiesById` lookup goes through `refKey(eventId,
 * propertyId)` (`types.ts`), not a bare `property_id` — see that type's doc comment. `eventId` is
 * always the event the observation/expression side under resolution actually belongs to: the
 * observation's own `event_id` for a plain property/aggregate/membership haystack read (every such
 * read already receives the right `observation`, including a `cross_event` child during its own
 * per-child resolution), `parentObservation.event_id` for the join's parent side, and
 * `CrossEventExpression.child_event_id` for the join's child side (the one place no single
 * observation is in scope yet — the join key must be read before any child is found).
 */
import { AGGREGATES, BOUND_CHECKS, COMPARATORS, toNumber } from './operators';
import { refKey } from './types';
import type {
  AggregateOperand,
  ArithmeticExpression,
  BoundExpression,
  CrossEventExpression,
  MembershipExpression,
  Operand,
  RuleDefinition,
  RuleObservation,
  RuleOutcome,
  RuleSnapshot,
} from './types';

// `passed: true` (not a violation) plus `skipped: true` (not actually evaluated either) — the
// operand(s) this rule needs are absent from the observation (e.g. an optional property the
// caller didn't send), same "nothing to check" case as cross_event's no-joined-children skip.
const NO_MATCH_OUTCOME: RuleOutcome = {
  passed: true,
  expected: null,
  actual: null,
  detail: 'any',
  skipped: true,
  reason: 'required operand value is missing from the observation',
};

function readProperty(observation: RuleObservation, propertyId: string, snapshot: RuleSnapshot): unknown {
  const ref = snapshot.propertiesById[refKey(observation.event_id ?? '', propertyId)];
  if (!ref) return undefined;
  return observation.properties[ref.payload_key];
}

/** Finds the `property_id` of the first `list_field` ref reachable from `operand`, i.e. which
 * list property an aggregate's `of` operand is iterating (arithmetic/membership rules only). */
function findListPropertyId(operand: Operand): string | null {
  switch (operand.ref) {
    case 'list_field':
      return operand.property_id;
    case 'product':
      return findListPropertyId(operand.left) ?? findListPropertyId(operand.right);
    case 'aggregate':
      return findListPropertyId(operand.of);
    default:
      return null;
  }
}

/** Resolves an operand against one list item (`ListFieldOperand`/`ConstantOperand`/`ProductOperand`
 * of those). Not valid for `property`/nested `aggregate` — those have no meaning per-item. */
function resolveItemOperand(operand: Operand, item: Record<string, unknown>): number | string | boolean | null {
  switch (operand.ref) {
    case 'list_field':
      return (item[operand.field] as number | string | boolean | null) ?? null;
    case 'constant':
      return operand.value;
    case 'product': {
      const left = toNumber(resolveItemOperand(operand.left, item));
      const right = toNumber(resolveItemOperand(operand.right, item));
      return left === null || right === null ? null : left * right;
    }
    default:
      return null;
  }
}

/** Resolves an operand against a whole observation (the default context): `property` reads the
 * raw payload, `aggregate` reduces over the referenced list property's items, `product` multiplies
 * two observation-level operands (used by cross_event's per-child resolution, where each "item" is
 * itself a full sibling observation, not a list item). */
function resolveObservationOperand(
  operand: Operand,
  observation: RuleObservation,
  snapshot: RuleSnapshot
): number | string | boolean | null {
  switch (operand.ref) {
    case 'constant':
      return operand.value;
    case 'property':
      return (readProperty(observation, operand.property_id, snapshot) as number | string | boolean | null) ?? null;
    case 'list_field':
      // Only meaningful inside a per-item context; at observation level there is no single item.
      return null;
    case 'product': {
      const left = toNumber(resolveObservationOperand(operand.left, observation, snapshot));
      const right = toNumber(resolveObservationOperand(operand.right, observation, snapshot));
      return left === null || right === null ? null : left * right;
    }
    case 'aggregate':
      return resolveAggregateOverList(operand, observation, snapshot);
  }
}

/**
 * T-2-07 (fix round from T-2-06 review): when the aggregate's list property is entirely absent
 * from the observation (`raw === undefined`, the payload key was never sent), returns `null` so
 * the caller treats this the same as a missing operand (`NO_MATCH_OUTCOME`, skipped) — the same
 * "nothing to check" outcome `cross_event` already returns for a purchase with zero joined
 * `purchase_item` siblings. Before this fix, an absent list silently aggregated as `[]` (`sum`/
 * `count`/`min`/`max` of nothing = `0`), which a `sum(...) eq total_price` rule then reported as a
 * false `0 != target` violation instead of "cannot evaluate, the list was never sent". A list
 * property that *is* present but not an array (or `null`) still aggregates over `[]` as before —
 * that is a shape problem `type_mismatch` already reports elsewhere, not this rule's job to skip.
 */
function resolveAggregateOverList(operand: AggregateOperand, observation: RuleObservation, snapshot: RuleSnapshot): number | null {
  const listPropertyId = findListPropertyId(operand.of);
  if (!listPropertyId) return AGGREGATES[operand.fn]([]);
  const ref = snapshot.propertiesById[refKey(observation.event_id ?? '', listPropertyId)];
  const raw = ref ? observation.properties[ref.payload_key] : undefined;
  if (raw === undefined) return null;
  const items = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  // Raw, uncoerced per-item values: AGGREGATES[fn] owns its own numeric coercion (operators.ts),
  // so `count` can count non-numeric items too (an id list, not just amounts).
  const values = items.map((item) => resolveItemOperand(operand.of, item));
  return AGGREGATES[operand.fn](values);
}

/** `money` -> `max(floor, percent/100 * |target|)`; `absolute`/`percent` use `toleranceValue`;
 * `none` is exact (D-30). */
export function resolveTolerance(
  mode: RuleDefinition['tolerance_mode'],
  toleranceValue: number | null | undefined,
  target: number,
  snapshot: RuleSnapshot
): number {
  switch (mode) {
    case 'none':
      return 0;
    case 'absolute':
      return toleranceValue ?? 0;
    case 'percent':
      return Math.abs(target) * ((toleranceValue ?? 0) / 100);
    case 'money':
      return Math.max(snapshot.money_tolerance_floor, (snapshot.money_tolerance_percent / 100) * Math.abs(target));
  }
}

function evaluateArithmetic(
  expression: ArithmeticExpression,
  observation: RuleObservation,
  snapshot: RuleSnapshot,
  rule: RuleDefinition
): RuleOutcome {
  const left = toNumber(resolveObservationOperand(expression.left, observation, snapshot));
  const right = toNumber(resolveObservationOperand(expression.right, observation, snapshot));
  if (left === null || right === null) return NO_MATCH_OUTCOME;
  const tolerance = resolveTolerance(rule.tolerance_mode, rule.tolerance_value, right, snapshot);
  const passed = COMPARATORS[expression.comparator](left, right, tolerance);
  return { passed, expected: right, actual: left, detail: 'any' };
}

function evaluateMembership(expression: MembershipExpression, observation: RuleObservation, snapshot: RuleSnapshot): RuleOutcome {
  const needle = resolveObservationOperand(expression.needle, observation, snapshot);
  const haystackRef = snapshot.propertiesById[refKey(observation.event_id ?? '', expression.haystack.property_id)];
  const raw = haystackRef ? observation.properties[haystackRef.payload_key] : undefined;
  const items = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const values = items.map((item) => item[expression.haystack.field]);
  if (needle === null || needle === undefined) return NO_MATCH_OUTCOME;
  const passed = values.some((v) => v !== null && v !== undefined && String(v) === String(needle));
  return { passed, expected: { in: values }, actual: { value: needle }, detail: 'any' };
}

function evaluateBound(expression: BoundExpression, observation: RuleObservation, snapshot: RuleSnapshot, nowSeconds: number): RuleOutcome {
  const subject = resolveObservationOperand(expression.subject, observation, snapshot);
  if (subject === null || subject === undefined) return NO_MATCH_OUTCOME;
  const bound = expression.bound ? resolveObservationOperand(expression.bound, observation, snapshot) : null;
  const passed = BOUND_CHECKS[expression.check](subject, bound, nowSeconds);
  return { passed, expected: { check: expression.check, bound }, actual: { value: subject }, detail: 'any' };
}

function evaluateCrossEvent(
  expression: CrossEventExpression,
  parentObservation: RuleObservation,
  siblingObservations: RuleObservation[],
  snapshot: RuleSnapshot,
  rule: RuleDefinition
): RuleOutcome {
  const parentJoinRef = snapshot.propertiesById[refKey(parentObservation.event_id ?? '', expression.join.parent_property_id)];
  const childJoinRef = snapshot.propertiesById[refKey(expression.child_event_id, expression.join.child_property_id)];
  const joinKeyRaw = parentJoinRef ? parentObservation.properties[parentJoinRef.payload_key] : undefined;
  if (joinKeyRaw === undefined || joinKeyRaw === null || !childJoinRef) return NO_MATCH_OUTCOME;
  const joinKey = String(joinKeyRaw);

  const children = siblingObservations.filter(
    (o) => o.event_id === expression.child_event_id && String(o.properties[childJoinRef.payload_key]) === joinKey
  );
  // No joined children: there is nothing to aggregate, so this observation cannot be evaluated
  // (phase 1's `computeRoundingDrift`, `definitionVsObservations.ts:596-598`, skipped a purchase
  // with no purchase_item siblings the same way, by never producing a finding for it). Report it
  // as skipped, not as a `0` vs target mismatch, so a lone parent submission does not raise a
  // false rounding_drift.
  if (children.length === 0) {
    return { passed: true, expected: null, actual: null, detail: joinKey, skipped: true, reason: 'no joined child observations' };
  }

  // Raw, uncoerced per-child values (see resolveAggregateOverList's comment).
  const values = children.map((child) => resolveObservationOperand(expression.child.of, child, snapshot));
  const childValue = AGGREGATES[expression.child.fn](values);

  const target = toNumber(resolveObservationOperand(expression.target, parentObservation, snapshot));
  if (target === null) return NO_MATCH_OUTCOME;

  const tolerance = resolveTolerance(rule.tolerance_mode, rule.tolerance_value, target, snapshot);
  const passed = COMPARATORS[expression.comparator](childValue, target, tolerance);
  // expected/actual orientation (documented on RuleOutcome): `expected` is always the defined/
  // target-side value (arithmetic's `right` operand; cross_event's `target`, the parent property),
  // `actual` is always the observed/computed side (arithmetic's `left`; cross_event's aggregated
  // `childValue`) — kept consistent across kinds so a downstream finding reads the same way
  // regardless of rule kind (T-2-07).
  return { passed, expected: target, actual: childValue, detail: joinKey };
}

/** Evaluates one rule against one observation. `siblingObservations` is only consulted for
 * cross_event rules (searched for children by `event_id` + the join value); pass `[]` for the
 * other three kinds. `now` (Unix seconds) drives the not-in-the-future bound check; defaults to
 * the real current time. */
export function evaluateRule(
  rule: RuleDefinition,
  observation: RuleObservation,
  siblingObservations: RuleObservation[],
  snapshot: RuleSnapshot,
  options?: { now?: number }
): RuleOutcome {
  const now = options?.now ?? Date.now() / 1000;
  switch (rule.kind) {
    case 'arithmetic':
      return evaluateArithmetic(rule.expression as ArithmeticExpression, observation, snapshot, rule);
    case 'membership':
      return evaluateMembership(rule.expression as MembershipExpression, observation, snapshot);
    case 'bound':
      return evaluateBound(rule.expression as BoundExpression, observation, snapshot, now);
    case 'cross_event':
      return evaluateCrossEvent(rule.expression as CrossEventExpression, observation, siblingObservations, snapshot, rule);
  }
}
