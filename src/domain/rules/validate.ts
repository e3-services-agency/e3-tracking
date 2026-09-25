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

function requireProperty(properties: Record<string, ValidatableProperty>, propertyId: string, where: string): ValidatableProperty {
  const property = properties[propertyId];
  if (!property) fail(`${where}: property "${propertyId}" is not linked to this event.`);
  return property;
}

function requireListField(properties: Record<string, ValidatableProperty>, propertyId: string, field: string, where: string): void {
  const property = requireProperty(properties, propertyId, where);
  if (property.data_type !== 'array') {
    fail(`${where}: property "${propertyId}" must be data_type "array" to use a list field.`);
  }
  const schema = property.item_schema ?? [];
  if (!schema.some((f) => f.field === field)) {
    fail(`${where}: "${field}" is not a field of property "${propertyId}"'s item schema.`);
  }
}

function validateOperand(operand: Operand, properties: Record<string, ValidatableProperty>, where: string): void {
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
  requireListField(properties, expression.haystack.property_id, expression.haystack.field, 'membership.haystack');
}

function validateBound(expression: BoundExpression, properties: Record<string, ValidatableProperty>): void {
  if (!(RULE_BOUND_CHECKS as readonly string[]).includes(expression.check)) {
    fail(`bound: unknown check "${expression.check}".`);
  }
  validateOperand(expression.subject, properties, 'bound.subject');
  const needsBound = !['non_empty', 'not_future'].includes(expression.check);
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
  requireProperty(context.properties, expression.join.parent_property_id, 'cross_event.join.parent_property_id');
  requireProperty(childProperties, expression.join.child_property_id, 'cross_event.join.child_property_id');
  if (expression.child.ref !== 'aggregate') fail('cross_event.child must be an aggregate operand.');
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
