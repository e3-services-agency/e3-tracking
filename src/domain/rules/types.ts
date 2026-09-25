/**
 * Rules grammar (D-30, D-31, T-2-06): typed JSON parts, no string DSL. `Rule.expression_json`
 * holds one of `ArithmeticExpression | MembershipExpression | BoundExpression |
 * CrossEventExpression`, matching `Rule.kind`. Pure types only; no DB or Express import
 * (domain-model skill) — the DAL/route layer is responsible for resolving `property_id`s to
 * actual `properties` rows before calling `validate.ts`, and for building the `RuleSnapshot`
 * `evaluate.ts` needs to resolve a property ref against a raw observation payload.
 */
import type { RuleAggregate, RuleBoundCheck, RuleComparator, RuleKind, RuleReportKind, RuleSeverity, RuleToleranceMode } from '../enums';

// ----- Operand (the plan's grammar, PLAN-PHASE2-2026-09-25.md "Rules evaluator") -----

export interface PropertyOperand {
  ref: 'property';
  property_id: string;
}

/** One item's field of a list-typed (`data_type = 'array'`) linked property, e.g. `product_list[].price`. */
export interface ListFieldOperand {
  ref: 'list_field';
  property_id: string;
  field: string;
}

export interface ConstantOperand {
  ref: 'constant';
  value: number | string | boolean | null;
}

/** `left * right`, evaluated per item when nested inside an `aggregate.of` over a list property. */
export interface ProductOperand {
  ref: 'product';
  left: Operand;
  right: Operand;
}

/** Reduces `of` over a list property's items (arithmetic/membership rules) or over sibling child
 * observations (cross_event rules) — which domain applies is determined by `Rule.kind`, not by
 * this operand itself; see `evaluate.ts`. */
export interface AggregateOperand {
  ref: 'aggregate';
  fn: RuleAggregate;
  of: Operand;
}

export type Operand = PropertyOperand | ListFieldOperand | ConstantOperand | ProductOperand | AggregateOperand;

// ----- Expression shapes (one per RuleKind) -----

export interface ArithmeticExpression {
  kind: 'arithmetic';
  left: Operand;
  comparator: RuleComparator;
  right: Operand;
}

export interface MembershipExpression {
  kind: 'membership';
  /** The value being looked for; typically `{ref: 'property', property_id}`. */
  needle: Operand;
  /** The list property and item field it must appear in, e.g. `product_list[].product_id`. */
  haystack: { property_id: string; field: string };
}

export interface BoundExpression {
  kind: 'bound';
  subject: Operand;
  check: RuleBoundCheck;
  /** Required for the comparator checks (`lt`/`lte`/`gt`/`gte`/`eq`/`neq`); absent for
   * `non_empty`/`not_future`. */
  bound?: Operand;
}

export interface CrossEventExpression {
  kind: 'cross_event';
  child_event_id: string;
  join: { parent_property_id: string; child_property_id: string };
  /** Must be an `AggregateOperand`; its `of` is resolved against each joined child observation
   * directly (no list-item context). */
  child: AggregateOperand;
  comparator: RuleComparator;
  /** Typically `{ref: 'property', property_id}` on the parent event. */
  target: Operand;
}

export type RuleExpression = ArithmeticExpression | MembershipExpression | BoundExpression | CrossEventExpression;

// ----- Item schema (D-30 ItemSchema, `properties.item_schema_json`) -----

export interface ItemSchemaField {
  field: string;
  data_type: string;
  data_formats?: string[];
  required?: boolean;
}

// ----- Evaluator inputs/outputs -----

/** One resolved property reference the evaluator needs: where to read its value in a raw
 * observation payload (`payload_key ?? name`, same convention as
 * `src/domain/comparison/definitionVsObservations.ts`), plus its item schema when it is a list. */
export interface RulePropertyRef {
  property_id: string;
  payload_key: string;
  data_type: string;
  item_schema?: ItemSchemaField[] | null;
}

export interface RuleSnapshot {
  propertiesById: Record<string, RulePropertyRef>;
  money_tolerance_percent: number;
  money_tolerance_floor: number;
}

/** A raw observation, keyed exactly like `definitionVsObservations.ts`'s `EngineObservation`:
 * `properties` is the raw payload keyed by payload key/name, not by `property_id`. */
export interface RuleObservation {
  id: string;
  event_id: string | null;
  variant_id: string | null;
  properties: Record<string, unknown>;
}

export interface RuleDefinition {
  kind: RuleKind;
  expression: RuleExpression;
  tolerance_mode: RuleToleranceMode;
  tolerance_value?: number | null;
}

export interface RuleOutcome {
  passed: boolean;
  /** The defined/target-side value: arithmetic's `right` operand, cross_event's `target` (the
   * parent property) — always the same side across every kind, so a downstream finding
   * (T-2-07) reads consistently regardless of `Rule.kind`. */
  expected: unknown;
  /** The observed/computed side: arithmetic's `left` operand, cross_event's aggregated
   * `childValue` — always the counterpart of `expected` above. */
  actual: unknown;
  /** Join key for a cross_event rule (the parent's join property value) or `'any'` for every
   * other kind; used as part of the finding fingerprint (D-31, wired in T-2-07). */
  detail: string;
  /** `true` when this observation could not be evaluated at all (e.g. a cross_event rule whose
   * parent has no joined children) — distinct from `passed: true` (evaluated and matched) and
   * `passed: false` (evaluated and violated). A skipped outcome must not be reported as either a
   * pass or a violation (T-2-07 should not create/resolve a finding from it). */
  skipped?: boolean;
  /** Human-readable reason, set only when `skipped` is `true`. */
  reason?: string;
}

export interface ItemSchemaViolation {
  index: number;
  field: string;
  reason: 'missing_required' | 'wrong_type' | 'format_violation';
}

export type { RuleAggregate, RuleBoundCheck, RuleComparator, RuleKind, RuleReportKind, RuleSeverity, RuleToleranceMode };
