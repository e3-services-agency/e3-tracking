/**
 * Rule evaluator (D-30, D-31, T-2-06). Pure: walks a `RuleDefinition`'s expression against one
 * observation (plus, for `cross_event`, the set of sibling observations to search children in)
 * and a `RuleSnapshot`. Never names an aggregate/comparator/bound-check literal — every operator
 * call goes through `operators.ts`'s registries (D-30 extension acceptance criterion, asserted by
 * `evaluate.test.ts`'s source-scan test). `comparison.service.ts` builds the `RuleSnapshot` and
 * calls this per rule per observation (wired in T-2-07, not here).
 */
import { AGGREGATES, BOUND_CHECKS, COMPARATORS, toNumber } from './operators';
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

const NO_MATCH_OUTCOME: RuleOutcome = { passed: true, expected: null, actual: null, detail: 'any' };

function readProperty(observation: RuleObservation, propertyId: string, snapshot: RuleSnapshot): unknown {
  const ref = snapshot.propertiesById[propertyId];
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

function resolveAggregateOverList(operand: AggregateOperand, observation: RuleObservation, snapshot: RuleSnapshot): number {
  const listPropertyId = findListPropertyId(operand.of);
  if (!listPropertyId) return AGGREGATES[operand.fn]([]);
  const ref = snapshot.propertiesById[listPropertyId];
  const raw = ref ? observation.properties[ref.payload_key] : undefined;
  const items = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const values = items
    .map((item) => toNumber(resolveItemOperand(operand.of, item)))
    .filter((v): v is number => v !== null);
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
  const haystackRef = snapshot.propertiesById[expression.haystack.property_id];
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
  const parentJoinRef = snapshot.propertiesById[expression.join.parent_property_id];
  const childJoinRef = snapshot.propertiesById[expression.join.child_property_id];
  const joinKeyRaw = parentJoinRef ? parentObservation.properties[parentJoinRef.payload_key] : undefined;
  if (joinKeyRaw === undefined || joinKeyRaw === null || !childJoinRef) return NO_MATCH_OUTCOME;
  const joinKey = String(joinKeyRaw);

  const children = siblingObservations.filter(
    (o) => o.event_id === expression.child_event_id && String(o.properties[childJoinRef.payload_key]) === joinKey
  );

  const values = children
    .map((child) => toNumber(resolveObservationOperand(expression.child.of, child, snapshot)))
    .filter((v): v is number => v !== null);
  const childValue = AGGREGATES[expression.child.fn](values);

  const target = toNumber(resolveObservationOperand(expression.target, parentObservation, snapshot));
  if (target === null) return NO_MATCH_OUTCOME;

  const tolerance = resolveTolerance(rule.tolerance_mode, rule.tolerance_value, target, snapshot);
  const passed = COMPARATORS[expression.comparator](childValue, target, tolerance);
  return { passed, expected: childValue, actual: target, detail: joinKey };
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
