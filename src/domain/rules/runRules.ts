/**
 * Rules + item schema evaluation as part of comparison `definition_vs_observations` (T-2-07, D-30,
 * D-31, plan "Rules evaluator" / "T-2-07"). Pure: `comparison.service.ts` builds a
 * `RulesEngineRule[]` (from `rule.dal.ts`'s rows, enabled only) and a project-wide `RuleSnapshot`
 * (every event's property refs, so a `cross_event` rule can resolve its child event's properties
 * too), then calls `runRules`/`runItemSchemaChecks` alongside `runDefinitionVsObservations` and
 * merges every array under the same `comparison: 'definition_vs_observations'` id — `Finding` rows
 * from rules/item-schema checks are not a separate comparison, they are part of this one (plan
 * T-2-07: "The rules evaluator and item schema checks run inside the comparison orchestrator as
 * part of definition_vs_observations").
 *
 * Disabling a rule (T-2-07 acceptance): `comparison.service.ts` only ever includes `enabled` rules
 * in `RulesEngineRule[]`, so a disabled rule simply stops producing its fingerprint on the next
 * recompute — the per-comparison stale-fingerprint resolution in `comparison.service.ts` then
 * resolves it, with no special-casing needed here.
 *
 * Editing a rule / version bump (T-2-07 acceptance): the fingerprint includes `rule.version`
 * (`rule:<id>:v<version>:<detail>`, D-31's fingerprint shape), so an edit that increments `version`
 * (every `updateRule` call, `rule.dal.ts`) changes the fingerprint outright — the old one stops
 * being produced (resolved) and the new one is produced fresh, without either side needing to know
 * about the other.
 */
import { evaluateRule } from './evaluate';
import { validateItems } from './itemSchema';
import type { ItemSchemaField, ItemSchemaViolation, RuleDefinition, RuleObservation, RuleOutcome, RuleSnapshot } from './types';
import type { ComparisonId, FindingKind, FindingSeverity } from '../enums';
import type { EngineFinding, EngineObservation } from '../comparison/definitionVsObservations';

const COMPARISON: ComparisonId = 'definition_vs_observations';

export interface RulesEngineRule {
  id: string;
  version: number;
  event_id: string;
  /** `null`: applies to every observation of the event regardless of variant. Non-null: only
   * observations resolved to that exact variant are evaluated (plan T-2-07: "matched variant"). */
  variant_id: string | null;
  name: string;
  message: string;
  severity: FindingSeverity;
  /** A `RuleReportKind` value; every member is also a `FindingKind` (D-30/D-31), so it doubles as
   * the produced finding's `kind` with no extra mapping table. */
  report_kind: 'rule_violation' | 'bound_violation' | 'rounding_drift';
  definition: RuleDefinition;
}

export interface ItemSchemaCheck {
  event_id: string;
  property_id: string;
  property_name: string;
  payload_key: string;
  item_schema: ItemSchemaField[];
}

function fp(kind: FindingKind, eventId: string, variantId: string | null, propertyId: string | null, detail: string): string {
  return [COMPARISON, kind, eventId, variantId ?? '', propertyId ?? '', detail].join('|');
}

/** The property id the finding should reference (plan T-2-07's field list carries `property_id`
 * "the target property when it exists"): the expected/target-side operand of the expression when
 * it is a plain property reference; `null` for a shape that names no single property (e.g.
 * membership's haystack, an aggregate). Kept consistent with `RuleOutcome.expected`'s orientation
 * (`types.ts`'s doc comment): arithmetic's `right`, bound's `subject`, cross_event's `target`. */
function targetPropertyId(rule: RulesEngineRule): string | null {
  const expr = rule.definition.expression;
  switch (expr.kind) {
    case 'arithmetic':
      return expr.right.ref === 'property' ? expr.right.property_id : null;
    case 'bound':
      return expr.subject.ref === 'property' ? expr.subject.property_id : null;
    case 'cross_event':
      return expr.target.ref === 'property' ? expr.target.property_id : null;
    case 'membership':
      return expr.needle.ref === 'property' ? expr.needle.property_id : null;
    default:
      return null;
  }
}

function toRuleObservation(o: EngineObservation): RuleObservation {
  return { id: o.id, event_id: o.event_id, variant_id: o.variant_id, properties: o.properties };
}

/**
 * Evaluates every rule against the observations of its own event (and matched variant, if scoped),
 * one finding per unique `(rule, outcome.detail)` — `detail` is `'any'` for arithmetic/membership/
 * bound (so at most one finding per rule) and the join key for `cross_event` (so `rounding_drift`
 * still produces one finding per distinct `purchase_id` that drifts, phase-1 parity). `skipped`
 * outcomes (an absent operand, or a cross_event parent with zero joined children) never produce or
 * resolve a finding either way — see `evaluate.ts`'s `RuleOutcome.skipped` doc comment.
 */
export function runRules(
  rules: RulesEngineRule[],
  observations: EngineObservation[],
  snapshot: RuleSnapshot,
  options: { now?: number } = {}
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  const allRuleObservations = observations.map(toRuleObservation);

  for (const rule of rules) {
    const scoped = allRuleObservations.filter(
      (o) => o.event_id === rule.event_id && (rule.variant_id === null || o.variant_id === rule.variant_id)
    );
    const propertyId = targetPropertyId(rule);
    const seenByDetail = new Map<string, { obs: RuleObservation; outcome: RuleOutcome }>();
    for (const obs of scoped) {
      const outcome = evaluateRule(rule.definition, obs, allRuleObservations, snapshot, options);
      if (outcome.skipped || outcome.passed) continue;
      if (!seenByDetail.has(outcome.detail)) seenByDetail.set(outcome.detail, { obs, outcome });
    }
    for (const [detail, { obs, outcome }] of seenByDetail) {
      const kind = rule.report_kind as FindingKind;
      findings.push({
        comparison: COMPARISON,
        kind,
        severity: rule.severity,
        event_id: rule.event_id,
        variant_id: obs.variant_id,
        property_id: propertyId,
        observation_id: obs.id,
        expected_json: {
          rule_id: rule.id,
          rule_name: rule.name,
          version: rule.version,
          expression: rule.definition.expression,
          tolerance: { mode: rule.definition.tolerance_mode, value: rule.definition.tolerance_value ?? null },
          expected: outcome.expected,
        },
        actual_json: { values: outcome.actual },
        message: rule.message,
        fingerprint: fp(kind, rule.event_id, rule.variant_id, propertyId, `rule:${rule.id}:v${rule.version}:${detail}`),
      });
    }
  }
  return findings;
}

/**
 * Validates every array-typed linked property with an `item_schema_json` against every observation
 * of its event (D-30 ItemSchema); one `item_schema_violation` per `(event, property, field,
 * reason)`, anchored on the first observation that violates it (same "first offender, not one row
 * per observation" convention as `definitionVsObservations.ts`'s other per-property checks).
 */
export function runItemSchemaChecks(checks: ItemSchemaCheck[], observations: EngineObservation[]): EngineFinding[] {
  const seen = new Map<string, { obs: EngineObservation; check: ItemSchemaCheck; violation: ItemSchemaViolation }>();
  for (const check of checks) {
    const scoped = observations.filter((o) => o.event_id === check.event_id);
    for (const obs of scoped) {
      const raw = obs.properties[check.payload_key];
      if (!Array.isArray(raw)) continue;
      for (const violation of validateItems(raw, check.item_schema)) {
        const key = `${check.event_id}|${check.property_id}|${violation.field}|${violation.reason}`;
        if (!seen.has(key)) seen.set(key, { obs, check, violation });
      }
    }
  }
  const findings: EngineFinding[] = [];
  for (const { obs, check, violation } of seen.values()) {
    findings.push({
      comparison: COMPARISON,
      kind: 'item_schema_violation',
      severity: 'error',
      event_id: check.event_id,
      variant_id: obs.variant_id,
      property_id: check.property_id,
      observation_id: obs.id,
      expected_json: { field: violation.field, reason: violation.reason },
      actual_json: { index: violation.index },
      message: `Item "${violation.index}" of "${check.property_name}[]" has a "${violation.field}" ${
        violation.reason === 'missing_required'
          ? 'missing'
          : violation.reason === 'wrong_type'
            ? 'of the wrong type'
            : 'that does not match its format'
      }.`,
      fingerprint: fp('item_schema_violation', check.event_id, null, check.property_id, `${violation.field}:${violation.reason}`),
    });
  }
  return findings;
}
