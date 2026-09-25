/**
 * Rule Data Access Layer (D-30, D-31, T-2-06). Every function takes `projectId`; rules also
 * always take `eventId` on write (a rule is required to attach to an event, optionally scoped to
 * one of its variants). `expression_json` is validated against the operator registry and the
 * event's linked properties on every write (`src/domain/rules/validate.ts`); `version` increments
 * on every update (D-31, so an edited rule resolves its own old finding fingerprint once T-2-07
 * wires this into the comparison engine).
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn, toSqliteBool, fromSqliteBool, mapWriteError } from '../db/util';
import { BadRequestError, NotFoundError, RuleExpressionInvalidError, ValidationError } from '../errors';
import { RULE_KINDS, RULE_REPORT_KINDS, RULE_SEVERITIES, RULE_TOLERANCE_MODES } from '../../domain/enums';
import type { RuleKind, RuleReportKind, RuleSeverity, RuleToleranceMode } from '../../domain/enums';
import { RuleExpressionError, validateExpression, type ValidatableProperty, type ValidationContext } from '../../domain/rules/validate';
import {
  RULE_TEMPLATES,
  getRuleTemplate,
  listApplicableTemplates,
  type RuleTemplateInstance,
  type TemplateContext,
  type TemplateEventSnapshot,
} from '../../domain/rules/templates';
import type { ItemSchemaField, RuleExpression } from '../../domain/rules/types';
import type { VariantCondition } from '../../domain/variants';
import { getEventOrThrow, getEventWithProperties } from './event.dal';
import { getVariantByIdInProject, listVariants } from './variant.dal';
import { listStandardEventMappings } from './standard-event-mapping.dal';

export interface RuleRow {
  id: string;
  project_id: string;
  event_id: string;
  variant_id: string | null;
  kind: RuleKind;
  name: string;
  message: string;
  expression_json: RuleExpression;
  tolerance_mode: RuleToleranceMode;
  tolerance_value: number | null;
  report_kind: RuleReportKind;
  severity: RuleSeverity;
  template_key: string | null;
  enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

type RuleDbRow = Omit<RuleRow, 'expression_json' | 'enabled'>;

function mapRuleRow(row: RuleDbRow): RuleRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    expression_json: parseJsonColumn(raw.expression_json, {} as RuleExpression),
    enabled: fromSqliteBool(raw.enabled),
  };
}

export interface RuleInput {
  variant_id?: string | null;
  kind: string;
  name: string;
  message?: string | null;
  expression_json: unknown;
  tolerance_mode?: string;
  tolerance_value?: number | null;
  report_kind?: string;
  severity?: string;
  template_key?: string | null;
  enabled?: boolean;
}

export function listRulesByEvent(projectId: string, eventId: string): RuleRow[] {
  getEventOrThrow(projectId, eventId);
  return (
    getDb()
      .prepare('SELECT * FROM rules WHERE project_id = ? AND event_id = ? ORDER BY created_at')
      .all(projectId, eventId) as RuleDbRow[]
  ).map(mapRuleRow);
}

export function listRulesByProject(projectId: string): RuleRow[] {
  return (
    getDb().prepare('SELECT * FROM rules WHERE project_id = ? ORDER BY event_id, created_at').all(projectId) as RuleDbRow[]
  ).map(mapRuleRow);
}

export function getRuleById(projectId: string, id: string): RuleRow | null {
  const row = getDb().prepare('SELECT * FROM rules WHERE id = ? AND project_id = ?').get(id, projectId) as
    | RuleDbRow
    | undefined;
  return row ? mapRuleRow(row) : null;
}

export function getRuleOrThrow(projectId: string, id: string): RuleRow {
  const row = getRuleById(projectId, id);
  if (!row) throw new NotFoundError('Rule not found.', 'rule');
  return row;
}

// ---------------------------------------------------------------------------
// Building a validation/template context from stored entities.
// ---------------------------------------------------------------------------

function propertiesById(projectId: string, eventId: string): Record<string, ValidatableProperty> {
  const { properties } = getEventWithProperties(projectId, eventId);
  const result: Record<string, ValidatableProperty> = {};
  for (const link of properties) {
    result[link.property_id] = {
      property_id: link.property_id,
      data_type: link.property.data_type,
      item_schema: (link.property.item_schema_json as ItemSchemaField[] | null) ?? null,
    };
  }
  return result;
}

/** `expression_json.child_event_id` (cross_event only) must belong to this project; its own
 * linked properties become `ValidationContext.childProperties`. */
function childPropertiesFor(projectId: string, expression: unknown): Record<string, ValidatableProperty> | undefined {
  if (typeof expression !== 'object' || expression === null) return undefined;
  const childEventId = (expression as { child_event_id?: unknown }).child_event_id;
  if (typeof childEventId !== 'string' || !childEventId) return undefined;
  try {
    return propertiesById(projectId, childEventId);
  } catch {
    // getEventWithProperties throws NotFoundError for a child_event_id outside this project;
    // validate.ts's own "not linked" check on the join/child refs surfaces that as a 400.
    return {};
  }
}

export function buildTemplateEventSnapshot(projectId: string, eventId: string): TemplateEventSnapshot {
  const { event, properties } = getEventWithProperties(projectId, eventId);
  const variants = listVariants(projectId, eventId);
  const standardFieldMap: Record<string, string | null> = {};
  for (const mapping of listStandardEventMappings(projectId)) {
    if (mapping.event_id === eventId) Object.assign(standardFieldMap, mapping.field_map_json);
  }
  return {
    event_id: event.id,
    event_name: event.name,
    properties: properties.map((link) => ({
      property_id: link.property_id,
      name: link.property.name,
      role: link.role as 'normal' | 'discriminator' | 'context',
      data_type: link.property.data_type,
      item_schema: (link.property.item_schema_json as ItemSchemaField[] | null) ?? null,
    })),
    standard_field_map: standardFieldMap,
    variants: variants.map((v) => ({ id: v.id, name: v.name, conditions: v.conditions_json as VariantCondition[] })),
  };
}

/** Resolves the event mapped to the `purchase_item` standard event in this project, if any
 * (needed by the `purchase_items_total` template's `TemplateContext.childEvent`). */
function findPurchaseItemChildSnapshot(projectId: string): TemplateEventSnapshot | null {
  const mapping = listStandardEventMappings(projectId).find((m) => m.standard_event === 'purchase_item');
  if (!mapping) return null;
  return buildTemplateEventSnapshot(projectId, mapping.event_id);
}

function buildTemplateContext(projectId: string): TemplateContext {
  return { childEvent: findPurchaseItemChildSnapshot(projectId) };
}

// ---------------------------------------------------------------------------
// Write-time validation
// ---------------------------------------------------------------------------

const DEFAULT_TOLERANCE_MODE: RuleToleranceMode = 'none';
const DEFAULT_SEVERITY: RuleSeverity = 'error';

function defaultReportKind(kind: RuleKind): RuleReportKind {
  return kind === 'bound' ? 'bound_violation' : 'rule_violation';
}

interface ValidatedRuleFields {
  kind: RuleKind;
  name: string;
  message: string;
  expression: RuleExpression;
  tolerance_mode: RuleToleranceMode;
  tolerance_value: number | null;
  report_kind: RuleReportKind;
  severity: RuleSeverity;
  variant_id: string | null;
}

function validateRuleFields(projectId: string, eventId: string, input: RuleInput): ValidatedRuleFields {
  const kind = input.kind;
  if (!(RULE_KINDS as readonly string[]).includes(kind)) {
    throw new BadRequestError(`kind must be one of: ${RULE_KINDS.join(', ')}.`, 'kind');
  }
  const name = input.name?.trim();
  if (!name) throw new ValidationError('Rule name is required.', 'name');

  let variantId: string | null = null;
  if (input.variant_id) {
    const variant = getVariantByIdInProject(projectId, input.variant_id);
    if (!variant || variant.event_id !== eventId) {
      throw new BadRequestError('variant_id does not belong to this event.', 'variant_id');
    }
    variantId = variant.id;
  }

  const toleranceMode = (input.tolerance_mode ?? DEFAULT_TOLERANCE_MODE) as RuleToleranceMode;
  if (!(RULE_TOLERANCE_MODES as readonly string[]).includes(toleranceMode)) {
    throw new BadRequestError(`tolerance_mode must be one of: ${RULE_TOLERANCE_MODES.join(', ')}.`, 'tolerance_mode');
  }
  if ((toleranceMode === 'absolute' || toleranceMode === 'percent') && input.tolerance_value == null) {
    throw new BadRequestError(`tolerance_value is required when tolerance_mode is "${toleranceMode}".`, 'tolerance_value');
  }

  const severity = (input.severity ?? DEFAULT_SEVERITY) as RuleSeverity;
  if (!(RULE_SEVERITIES as readonly string[]).includes(severity)) {
    throw new BadRequestError(`severity must be one of: ${RULE_SEVERITIES.join(', ')}.`, 'severity');
  }

  const reportKind = (input.report_kind ?? defaultReportKind(kind as RuleKind)) as RuleReportKind;
  if (!(RULE_REPORT_KINDS as readonly string[]).includes(reportKind)) {
    throw new BadRequestError(`report_kind must be one of: ${RULE_REPORT_KINDS.join(', ')}.`, 'report_kind');
  }
  // D-31: rounding_drift is allowed only for a cross_event rule with tolerance_mode money.
  if (reportKind === 'rounding_drift' && !(kind === 'cross_event' && toleranceMode === 'money')) {
    throw new BadRequestError(
      'report_kind "rounding_drift" is only valid for a cross_event rule with tolerance_mode "money".',
      'report_kind'
    );
  }

  if (typeof input.expression_json !== 'object' || input.expression_json === null) {
    throw new BadRequestError('expression_json is required.', 'expression_json');
  }
  const expression = input.expression_json as RuleExpression;
  const context: ValidationContext = {
    properties: propertiesById(projectId, eventId),
    childProperties: childPropertiesFor(projectId, expression),
  };
  try {
    validateExpression(kind as RuleKind, expression, context);
  } catch (err) {
    if (err instanceof RuleExpressionError) {
      throw new RuleExpressionInvalidError(err.message, 'expression_json');
    }
    throw err;
  }

  const message = input.message?.trim() || `Guardrail "${name}" violated.`;

  return {
    kind: kind as RuleKind,
    name,
    message,
    expression,
    tolerance_mode: toleranceMode,
    tolerance_value: input.tolerance_value ?? null,
    report_kind: reportKind,
    severity,
    variant_id: variantId,
  };
}

export function createRule(projectId: string, eventId: string, input: RuleInput): RuleRow {
  getEventOrThrow(projectId, eventId);
  const fields = validateRuleFields(projectId, eventId, input);

  const db = getDb();
  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO rules (
        id, project_id, event_id, variant_id, kind, name, message, expression_json,
        tolerance_mode, tolerance_value, report_kind, severity, template_key, enabled, version,
        created_at, updated_at
      ) VALUES (
        @id, @project_id, @event_id, @variant_id, @kind, @name, @message, @expression_json,
        @tolerance_mode, @tolerance_value, @report_kind, @severity, @template_key, @enabled, 1,
        @created_at, @updated_at
      )`
    ).run({
      id,
      project_id: projectId,
      event_id: eventId,
      variant_id: fields.variant_id,
      kind: fields.kind,
      name: fields.name,
      message: fields.message,
      expression_json: toJsonColumn(fields.expression),
      tolerance_mode: fields.tolerance_mode,
      tolerance_value: fields.tolerance_value,
      report_kind: fields.report_kind,
      severity: fields.severity,
      template_key: input.template_key?.trim() || null,
      enabled: toSqliteBool(input.enabled ?? true),
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    mapWriteError(
      err,
      `A rule named "${fields.name}" already exists on this event${fields.variant_id ? ' for this variant' : ''}.`,
      `Failed to create rule: ${(err as Error).message}`
    );
  }
  return getRuleOrThrow(projectId, id);
}

export function updateRule(projectId: string, id: string, updates: Partial<RuleInput>): RuleRow {
  const current = getRuleOrThrow(projectId, id);

  const merged: RuleInput = {
    variant_id: updates.variant_id !== undefined ? updates.variant_id : current.variant_id,
    kind: updates.kind ?? current.kind,
    name: updates.name ?? current.name,
    message: updates.message !== undefined ? updates.message : current.message,
    expression_json: updates.expression_json ?? current.expression_json,
    tolerance_mode: updates.tolerance_mode ?? current.tolerance_mode,
    tolerance_value: updates.tolerance_value !== undefined ? updates.tolerance_value : current.tolerance_value,
    report_kind: updates.report_kind ?? current.report_kind,
    severity: updates.severity ?? current.severity,
    template_key: updates.template_key !== undefined ? updates.template_key : current.template_key,
    enabled: updates.enabled !== undefined ? updates.enabled : current.enabled,
  };
  const fields = validateRuleFields(projectId, current.event_id, merged);

  const db = getDb();
  try {
    db.prepare(
      `UPDATE rules SET
        variant_id = @variant_id, kind = @kind, name = @name, message = @message,
        expression_json = @expression_json, tolerance_mode = @tolerance_mode,
        tolerance_value = @tolerance_value, report_kind = @report_kind, severity = @severity,
        template_key = @template_key, enabled = @enabled, version = version + 1, updated_at = @updated_at
       WHERE id = @id AND project_id = @project_id`
    ).run({
      id,
      project_id: projectId,
      variant_id: fields.variant_id,
      kind: fields.kind,
      name: fields.name,
      message: fields.message,
      expression_json: toJsonColumn(fields.expression),
      tolerance_mode: fields.tolerance_mode,
      tolerance_value: fields.tolerance_value,
      report_kind: fields.report_kind,
      severity: fields.severity,
      template_key: merged.template_key?.trim() || null,
      enabled: toSqliteBool(merged.enabled ?? true),
      updated_at: nowIso(),
    });
  } catch (err) {
    mapWriteError(
      err,
      `A rule named "${fields.name}" already exists on this event${fields.variant_id ? ' for this variant' : ''}.`,
      `Failed to update rule: ${(err as Error).message}`
    );
  }
  return getRuleOrThrow(projectId, id);
}

export function deleteRule(projectId: string, id: string): void {
  getRuleOrThrow(projectId, id);
  getDb().prepare('DELETE FROM rules WHERE id = ? AND project_id = ?').run(id, projectId);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface RuleTemplateSummary {
  key: string;
  name: string;
  description: string;
  applicable: boolean;
}

/** `GET /rule-templates`: every seed template, with `applicable` computed against `eventId` when
 * given (plan: "with applicable per event"); `true` for every template when `eventId` is omitted
 * would be misleading, so it is left `false` instead — a caller browsing without an event in mind
 * gets the catalog, not a false "yes". */
export function listRuleTemplates(projectId: string, eventId?: string): RuleTemplateSummary[] {
  if (!eventId) {
    return RULE_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, applicable: false }));
  }
  getEventOrThrow(projectId, eventId);
  const snapshot = buildTemplateEventSnapshot(projectId, eventId);
  const context = buildTemplateContext(projectId);
  return RULE_TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    applicable: t.applicable(snapshot, context),
  }));
}

/** `POST /events/:id/rules/from-template/:key`: instantiates the template (which may produce more
 * than one rule, e.g. `cart_update_totals`) and creates each as a real `Rule` row. */
export function createRulesFromTemplate(projectId: string, eventId: string, templateKey: string): RuleRow[] {
  getEventOrThrow(projectId, eventId);
  const template = getRuleTemplate(templateKey);
  if (!template) throw new NotFoundError(`Unknown rule template "${templateKey}".`, 'rule_template');

  const snapshot = buildTemplateEventSnapshot(projectId, eventId);
  const context = buildTemplateContext(projectId);
  if (!template.applicable(snapshot, context)) {
    throw new BadRequestError(
      `Template "${templateKey}" is not applicable to this event (its required properties/item schema/variant are not set up).`,
      'template_key'
    );
  }

  const instances: RuleTemplateInstance[] = template.instantiate(snapshot, context);
  return instances.map((instance) =>
    createRule(projectId, eventId, {
      variant_id: instance.variant_id ?? null,
      kind: instance.kind,
      name: instance.name,
      message: instance.message,
      expression_json: instance.expression,
      tolerance_mode: instance.tolerance_mode,
      tolerance_value: instance.tolerance_value,
      report_kind: instance.report_kind,
      severity: instance.severity,
      template_key: templateKey,
      enabled: true,
    })
  );
}

export { listApplicableTemplates };
