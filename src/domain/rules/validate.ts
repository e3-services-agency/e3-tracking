/**
 * Expression validation (D-30, D-31, T-2-06): rejects an `expression_json` whose operator is not
 * in the registry, or whose `property_id`/`list_field` refs are not among the properties the
 * caller says are linked to the event (and, for a list_field/haystack/item-schema check, the
 * property must be `data_type: 'array'` with an `item_schema_json` containing the field). Pure;
 * throws a plain `Error` with a stable `.message` the DAL wraps as 400 `RULE_EXPRESSION_INVALID`
 * (see `rule.dal.ts`) — this module has no knowledge of HTTP.
 */
import { RULE_AGGREGATES, RULE_BOUND_CHECKS, RULE_COMPARATORS } from '../enums';
import type { RuleKind } from '../enums';
import type {
  AggregateOperand,
  BoundExpression,
  ItemSchemaField,
  ArithmeticExpression,
  CrossEventExpression,
  MembershipExpression,
  Operand,
  RuleExpression,
} from './types';

export interface ValidatableProperty {
  property_id: string;
  data_type: string;
  item_schema: ItemSchemaField[] | null;
}

export interface ValidationContext {
  /** Properties linked to the event (and, for cross_event, the child event) this rule may
   * reference, keyed by `property_id`. */
  properties: Record<string, ValidatableProperty>;
  /** For `cross_event` only: the properties linked to `child_event_id`. */
  childProperties?: Record<string, ValidatableProperty>;
}

export class RuleExpressionError extends Error {}

function fail(message: string): never {
  throw new RuleExpressionError(message);
}

/** `true` for a plain JSON object (not `null`, not an array) — the shape every operand/sub-object
 * in the expression grammar must have before its fields can be dereferenced. Used to turn a
 * malformed/missing part of `expression_json` (a client can submit anything) into a
 * `RuleExpressionError` instead of a raw `TypeError` reaching the DAL. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Fails with a clear message when `value` is not a non-empty string, e.g. a missing or `null`
 * `property_id`/`field` ref. */
function requirePropertyId(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value) fail(`${where}: a property reference is required.`);
  return value;
}

function requireProperty(properties: Record<string, ValidatableProperty>, propertyId: unknown, where: string): ValidatableProperty {
  const id = requirePropertyId(propertyId, where);
  const property = properties[id];
  if (!property) fail(`${where}: property "${id}" is not linked to this event.`);
  return property;
}

function requireListField(properties: Record<string, ValidatableProperty>, propertyId: unknown, field: unknown, where: string): void {
  const property = requireProperty(properties, propertyId, where);
  if (property.data_type !== 'array') {
    fail(`${where}: property "${String(propertyId)}" must be data_type "array" to use a list field.`);
  }
  const fieldName = requirePropertyId(field, `${where}.field`);
  const schema = property.item_schema ?? [];
  if (!schema.some((f) => f.field === fieldName)) {
    fail(`${where}: "${fieldName}" is not a field of property "${String(propertyId)}"'s item schema.`);
  }
}

/** Fails with a clear message when `object` is missing or not a plain object, e.g. a malformed
 * `haystack`/`join`/`child`/`subject` part of the expression. Returns `object` narrowed so the
 * caller can dereference its fields. */
function requireObject(object: unknown, where: string): Record<string, unknown> {
  if (!isPlainObject(object)) fail(`${where}: is required.`);
  return object;
}

function validateOperand(operand: Operand, properties: Record<string, ValidatableProperty>, where: string): void {
  if (!isPlainObject(operand) || typeof operand.ref !== 'string') {
    fail(`${where}: a valid operand is required.`);
  }
  switch (operand.ref) {
    case 'property':
      requireProperty(properties, operand.property_id, where);
      return;
    case 'list_field':
      requireListField(properties, operand.property_id, operand.field, where);
      return;
    case 'constant':
      return;
    case 'product':
      validateOperand(operand.left, properties, where);
      validateOperand(operand.right, properties, where);
      return;
    case 'aggregate':
      if (!(RULE_AGGREGATES as readonly string[]).includes(operand.fn)) {
        fail(`${where}: unknown aggregate "${operand.fn}".`);
      }
      validateOperand(operand.of, properties, where);
      return;
    default:
      fail(`${where}: unknown operand ref.`);
  }
}

function validateArithmetic(expression: ArithmeticExpression, properties: Record<string, ValidatableProperty>): void {
  if (!(RULE_COMPARATORS as readonly string[]).includes(expression.comparator)) {
    fail(`arithmetic: unknown comparator "${expression.comparator}".`);
  }
  validateOperand(expression.left, properties, 'arithmetic.left');
  validateOperand(expression.right, properties, 'arithmetic.right');
}

function validateMembership(expression: MembershipExpression, properties: Record<string, ValidatableProperty>): void {
  validateOperand(expression.needle, properties, 'membership.needle');
  const haystack = requireObject(expression.haystack, 'membership.haystack');
  requireListField(properties, haystack.property_id, haystack.field, 'membership.haystack');
}

function validateBound(expression: BoundExpression, properties: Record<string, ValidatableProperty>): void {
  if (!(RULE_BOUND_CHECKS as readonly string[]).includes(expression.check)) {
    fail(`bound: unknown check "${expression.check}".`);
  }
  validateOperand(expression.subject, properties, 'bound.subject');
  // Every bound check that is also a comparator (RULE_COMPARATORS) needs a "bound" operand to
  // compare against; the two comparator-less checks (non_empty/not_future) are exactly the
  // RULE_BOUND_CHECKS members outside RULE_COMPARATORS (enums.ts), so this is derived from the
  // enum rather than a hardcoded literal list (D-30 extension acceptance: a future bound check
  // needs no edit here unless it also needs a bound operand).
  const needsBound = (RULE_COMPARATORS as readonly string[]).includes(expression.check);
  if (needsBound && !expression.bound) fail(`bound: check "${expression.check}" requires a "bound" operand.`);
  if (expression.bound) validateOperand(expression.bound, properties, 'bound.bound');
}

function validateAggregateOperand(operand: AggregateOperand, where: string): void {
  if (!(RULE_AGGREGATES as readonly string[]).includes(operand.fn)) {
    fail(`${where}: unknown aggregate "${operand.fn}".`);
  }
}

function validateCrossEvent(expression: CrossEventExpression, context: ValidationContext): void {
  if (!expression.child_event_id) fail('cross_event: child_event_id is required.');
  const childProperties = context.childProperties ?? {};
  const join = requireObject(expression.join, 'cross_event.join');
  requireProperty(context.properties, join.parent_property_id, 'cross_event.join.parent_property_id');
  requireProperty(childProperties, join.child_property_id, 'cross_event.join.child_property_id');
  const child = requireObject(expression.child, 'cross_event.child');
  if (child.ref !== 'aggregate') fail('cross_event.child must be an aggregate operand.');
  validateAggregateOperand(expression.child, 'cross_event.child');
  validateOperand(expression.child.of, childProperties, 'cross_event.child.of');
  if (!(RULE_COMPARATORS as readonly string[]).includes(expression.comparator)) {
    fail(`cross_event: unknown comparator "${expression.comparator}".`);
  }
  validateOperand(expression.target, context.properties, 'cross_event.target');
}

/** Validates `expression` matches `kind` and every ref it names resolves in `context`. Throws
 * `RuleExpressionError` on the first problem found. */
export function validateExpression(kind: RuleKind, expression: RuleExpression, context: ValidationContext): void {
  if (expression.kind !== kind) {
    fail(`expression.kind "${expression.kind}" does not match rule kind "${kind}".`);
  }
  switch (kind) {
    case 'arithmetic':
      validateArithmetic(expression as ArithmeticExpression, context.properties);
      return;
    case 'membership':
      validateMembership(expression as MembershipExpression, context.properties);
      return;
    case 'bound':
      validateBound(expression as BoundExpression, context.properties);
      return;
    case 'cross_event':
      validateCrossEvent(expression as CrossEventExpression, context);
      return;
  }
}
