/**
 * CSV export per entity (D-46, T-3-03, capability 9, qa-roundtrip scenario 6). Every entity's rows
 * are mapped to plain objects keyed by `src/domain/csv.ts`'s declared header list, then handed to
 * `papaparse.unparse` for RFC 4180 quoting; `buildCsvFile` adds the UTF-8 BOM and forces CRLF line
 * endings (Excel-friendly, D-46). Soft-deleted rows are excluded because every DAL `list*` function
 * used here already filters `deleted_at IS NULL` (or has no soft-delete column at all); ids sit
 * next to resolved names so a spreadsheet user can join files.
 */
import Papa from 'papaparse';
import { CSV_ENTITIES, type CsvEntity } from '../../domain/csv';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as RuleDAL from '../dal/rule.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as FindingDAL from '../dal/finding.dal';
import * as SourceDAL from '../dal/source.dal';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { describeRuleExpression, computeCertificationsForProject } from './document.service';
import type { VariantCondition } from '../../domain/variants';

type CsvRow = Record<string, unknown>;

/** Compact JSON string for a `*_json` column; `null`/`undefined` still renders as the literal `null`. */
function jsonCell(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Explicit `true`/`false` (D-46); `null`/`undefined` renders as an empty cell. */
function boolCell(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value ? 'true' : 'false';
}

function textCell(value: string | number | null | undefined): string | number {
  return value === null || value === undefined ? '' : value;
}

/** `prop=value` / `prop in (a|b)` per condition, comma-joined (no event/bracket wrapper, unlike `generateVariantName`). */
function conditionsText(conditions: VariantCondition[], propertyNameById: Map<string, string>): string {
  return conditions
    .map((c) => {
      const name = propertyNameById.get(c.property_id) ?? c.property_id;
      return c.operator === 'equals' ? `${name}=${c.values[0] ?? ''}` : `${name} in (${c.values.join('|')})`;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Per-entity row builders
// ---------------------------------------------------------------------------

function buildEventsRows(projectId: string): CsvRow[] {
  const events = EventDAL.listEvents(projectId);
  const variantCounts = new Map<string, number>();
  for (const v of VariantDAL.listVariantsByProject(projectId)) {
    variantCounts.set(v.event_id, (variantCounts.get(v.event_id) ?? 0) + 1);
  }
  // Certification is computed the same way the Events page column is (T-2-09's batched pass).
  const certificationByEventId = computeCertificationsForProject(projectId);

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    business_name: textCell(e.business_name),
    class: e.class,
    category: textCell(e.category),
    status: e.status,
    certified: boolCell(certificationByEventId.get(e.id)?.certified ?? false),
    priority: textCell(e.priority),
    description: textCell(e.description),
    purpose: textCell(e.purpose),
    page: textCell(e.page),
    trigger_text: textCell(e.trigger_text),
    grain: textCell(e.grain),
    identity_note: textCell(e.identity_note),
    owner_business: textCell(e.owner_business),
    owner_technical: textCell(e.owner_technical),
    expiration_json: jsonCell(e.expiration_json),
    not_suitable_for: textCell(e.not_suitable_for),
    agent_instructions: textCell(e.agent_instructions),
    derived_metrics_json: jsonCell(e.derived_metrics_json),
    tags_json: jsonCell(e.tags_json),
    property_count: e.attached_property_count,
    variant_count: variantCounts.get(e.id) ?? 0,
    created_at: e.created_at,
    updated_at: e.updated_at,
  }));
}

function buildPropertiesRows(projectId: string): CsvRow[] {
  return PropertyDAL.listProperties(projectId).map((p) => ({
    id: p.id,
    scope: p.scope,
    name: p.name,
    category: textCell(p.category),
    description: textCell(p.description),
    data_type: p.data_type,
    data_formats_json: jsonCell(p.data_formats_json),
    pii: boolCell(p.pii),
    property_type: p.property_type,
    allowed_values_json: jsonCell(p.allowed_values_json),
    example_values_json: jsonCell(p.example_values_json),
    item_schema_json: jsonCell(p.item_schema_json),
    bloomreach_customer_property: textCell(p.bloomreach_customer_property),
    priority: textCell(p.priority),
    status: textCell(p.status),
    notes: textCell(p.notes),
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

function buildEventPropertiesRows(projectId: string): CsvRow[] {
  const events = EventDAL.listEvents(projectId);
  const sourceNameById = new Map(SourceDAL.listSources(projectId).map((s) => [s.id, s.name]));
  const rows: CsvRow[] = [];
  for (const event of events) {
    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    for (const link of properties) {
      rows.push({
        event_id: event.id,
        event_name: event.name,
        property_id: link.property_id,
        property_name: link.property.name,
        role: link.role,
        required: boolCell(link.required),
        payload_key: textCell(link.payload_key),
        priority: textCell(link.priority),
        status: textCell(link.status),
        source_id: textCell(link.source_id),
        source_name: textCell(link.source_id ? (sourceNameById.get(link.source_id) ?? link.source_id) : null),
        description_override: textCell(link.description_override),
        sort_order: link.sort_order,
      });
    }
  }
  return rows;
}

function buildVariantsRows(projectId: string): CsvRow[] {
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const propertyNameById = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
  const standardEventByVariantId = new Map(
    StandardEventMappingDAL.listStandardEventMappings(projectId)
      .filter((m) => m.variant_id)
      .map((m) => [m.variant_id as string, m.standard_event])
  );
  return VariantDAL.listVariantsByProject(projectId).map((v) => ({
    id: v.id,
    event_id: v.event_id,
    event_name: eventNameById.get(v.event_id) ?? v.event_id,
    name: v.name,
    description: textCell(v.description),
    conditions_json: jsonCell(v.conditions_json),
    conditions_text: conditionsText(v.conditions_json, propertyNameById),
    expiration_json: jsonCell(v.expiration_json),
    standard_event: textCell(standardEventByVariantId.get(v.id) ?? null),
  }));
}

function buildStandardEventMappingsRows(projectId: string): CsvRow[] {
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const variantNameById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  const propertyNameById = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
  return StandardEventMappingDAL.listStandardEventMappings(projectId).map((m) => {
    const fieldMapByName: Record<string, string | null> = {};
    for (const [field, propertyId] of Object.entries(m.field_map_json)) {
      fieldMapByName[field] = propertyId ? (propertyNameById.get(propertyId) ?? propertyId) : null;
    }
    return {
      id: m.id,
      standard_event: m.standard_event,
      event_id: m.event_id,
      event_name: eventNameById.get(m.event_id) ?? m.event_id,
      variant_id: textCell(m.variant_id),
      variant_name: textCell(m.variant_id ? (variantNameById.get(m.variant_id) ?? m.variant_id) : null),
      field_map_json: jsonCell(fieldMapByName),
    };
  });
}

function buildIdentityRulesRows(projectId: string): CsvRow[] {
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const sourceNameById = new Map(SourceDAL.listSources(projectId).map((s) => [s.id, s.name]));
  return IdentityRuleDAL.listIdentityRules(projectId).map((r) => ({
    id: r.id,
    identifier_name: r.identifier_name,
    identity_type: r.identity_type,
    name: r.name,
    description: textCell(r.description),
    sdk_call: textCell(r.sdk_call),
    transformations_json: jsonCell(r.transformations_json),
    trigger_event_id: textCell(r.trigger_event_id),
    trigger_event_name: textCell(r.trigger_event_id ? (eventNameById.get(r.trigger_event_id) ?? r.trigger_event_id) : null),
    trigger_text: textCell(r.trigger_text),
    value_rule: textCell(r.value_rule),
    example: textCell(r.example),
    owner: textCell(r.owner),
    source_name: textCell(r.source_id ? (sourceNameById.get(r.source_id) ?? r.source_id) : null),
    tracker: textCell(r.tracker),
    priority: textCell(r.priority),
    status: textCell(r.status),
    sort_order: r.sort_order,
  }));
}

function buildCatalogsRows(projectId: string): CsvRow[] {
  return CatalogDAL.listCatalogs(projectId).map((c) => ({
    id: c.id,
    name: c.name,
    description: textCell(c.description),
    mapping_role: textCell(c.mapping_role),
    client_name: textCell(c.client_name),
    purpose: textCell(c.purpose),
    catalog_type: textCell(c.catalog_type),
    owner: textCell(c.owner),
    source_system: textCell(c.source_system),
    sync_method: textCell(c.sync_method),
    update_frequency: textCell(c.update_frequency),
    priority: textCell(c.priority),
    status: textCell(c.status),
  }));
}

function buildCatalogFieldsRows(projectId: string): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const catalog of CatalogDAL.listCatalogs(projectId)) {
    for (const field of CatalogDAL.listCatalogFields(projectId, catalog.id)) {
      rows.push({
        id: field.id,
        catalog_id: field.catalog_id,
        catalog_name: catalog.name,
        name: field.name,
        description: textCell(field.description),
        data_type: textCell(field.data_type),
        is_lookup_key: boolCell(field.is_lookup_key),
        is_searchable: boolCell(field.is_searchable),
        is_required: boolCell(field.is_required),
        client_field_name: textCell(field.client_field_name),
        bloomreach_column: textCell(field.bloomreach_column),
        purpose: textCell(field.purpose),
        field_family: textCell(field.field_family),
        item_level: textCell(field.item_level),
        priority: textCell(field.priority),
        status: textCell(field.status),
      });
    }
  }
  return rows;
}

function buildConsentCategoriesRows(projectId: string): CsvRow[] {
  return ConsentCategoryDAL.listConsentCategories(projectId).map((c) => ({
    id: c.id,
    name: c.name,
    description: textCell(c.description),
    standard_key: textCell(c.standard_key),
    status: textCell(c.status),
    sort_order: c.sort_order,
  }));
}

function buildUseCasesRows(projectId: string): CsvRow[] {
  const templateById = new Map(UseCaseTemplateDAL.listUseCaseTemplates().map((t) => [t.id, t]));
  const requirementCountByUseCaseId = new Map<string, number>();
  for (const r of RequirementDAL.listRequirementsByProject(projectId)) {
    requirementCountByUseCaseId.set(r.use_case_id, (requirementCountByUseCaseId.get(r.use_case_id) ?? 0) + 1);
  }
  return UseCaseDAL.listUseCases(projectId).map((uc) => ({
    id: uc.id,
    code: textCell(uc.code),
    name: uc.name,
    type: textCell(uc.type),
    description: textCell(uc.description),
    priority: textCell(uc.priority),
    status: textCell(uc.status),
    owner: textCell(uc.owner),
    notes: textCell(uc.notes),
    template_id: textCell(uc.template_id),
    template_code: textCell(uc.template_id ? (templateById.get(uc.template_id)?.code ?? null) : null),
    requirement_count: requirementCountByUseCaseId.get(uc.id) ?? 0,
    narrative: textCell(uc.narrative),
    // D-56: use_cases.activation/assets_json do not exist until T-4-06; emit stable empty values.
    activation: '',
    assets_json: jsonCell([]),
  }));
}

function buildRequirementsRows(projectId: string): CsvRow[] {
  const useCaseById = new Map(UseCaseDAL.listUseCases(projectId).map((uc) => [uc.id, uc]));
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const variantNameById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  const propertyNameById = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));

  const labelPart = (map: Map<string, string>, id: string | null): string => {
    if (!id) return '(removed)';
    return map.get(id) ?? id;
  };
  const targetLabel = (req: RequirementDAL.RequirementRow): string => {
    switch (req.target_kind) {
      case 'customer_property':
        return labelPart(propertyNameById, req.property_id);
      case 'event':
        return labelPart(eventNameById, req.event_id);
      case 'variant':
        return labelPart(variantNameById, req.variant_id);
      case 'event_property':
        return `${labelPart(eventNameById, req.event_id)}.${labelPart(propertyNameById, req.property_id)}`;
      case 'variant_property':
        return `${labelPart(variantNameById, req.variant_id)}.${labelPart(propertyNameById, req.property_id)}`;
      default:
        return '';
    }
  };

  return RequirementDAL.listRequirementsByProject(projectId).map((r) => {
    const useCase = useCaseById.get(r.use_case_id);
    return {
      id: r.id,
      use_case_id: r.use_case_id,
      use_case_code: textCell(useCase?.code ?? null),
      use_case_name: textCell(useCase?.name ?? null),
      sort_order: r.sort_order,
      target_kind: r.target_kind,
      target_label: targetLabel(r),
      event_name: textCell(r.event_id ? (eventNameById.get(r.event_id) ?? r.event_id) : null),
      variant_name: textCell(r.variant_id ? (variantNameById.get(r.variant_id) ?? r.variant_id) : null),
      property_name: textCell(r.property_id ? (propertyNameById.get(r.property_id) ?? r.property_id) : null),
      level: r.level,
      status: textCell(r.status),
      note: textCell(r.note),
    };
  });
}

function buildRulesRows(projectId: string): CsvRow[] {
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const variantNameById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  const propertyNameById = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
  const nameOf = (_eventId: string, propertyId: string): string => propertyNameById.get(propertyId) ?? propertyId;

  return RuleDAL.listRulesByProject(projectId).map((rule) => ({
    id: rule.id,
    event_id: rule.event_id,
    event_name: eventNameById.get(rule.event_id) ?? rule.event_id,
    variant_name: textCell(rule.variant_id ? (variantNameById.get(rule.variant_id) ?? rule.variant_id) : null),
    kind: rule.kind,
    name: rule.name,
    message: rule.message,
    expression_text: describeRuleExpression(rule.event_id, rule.expression_json, nameOf, eventNameById),
    tolerance_mode: rule.tolerance_mode,
    tolerance_value: textCell(rule.tolerance_value),
    report_kind: rule.report_kind,
    severity: rule.severity,
    enabled: boolCell(rule.enabled),
    version: rule.version,
  }));
}

function buildQaRunsRows(projectId: string): CsvRow[] {
  const observationCountByRunId = new Map<string, number>();
  for (const o of ObservationDAL.listObservations(projectId)) {
    observationCountByRunId.set(o.qa_run_id, (observationCountByRunId.get(o.qa_run_id) ?? 0) + 1);
  }
  return QaRunDAL.listQaRuns(projectId).map((run) => ({
    id: run.id,
    kind: run.kind,
    actor: textCell(run.actor),
    environment: textCell(run.environment),
    started_at: run.started_at,
    finished_at: textCell(run.finished_at),
    archived: boolCell(run.archived),
    customer_id: textCell(run.customer_id),
    observation_count: observationCountByRunId.get(run.id) ?? 0,
    notes: textCell(run.notes),
  }));
}

function buildObservationsRows(projectId: string): CsvRow[] {
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const variantNameById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  return ObservationDAL.listObservations(projectId).map((o) => ({
    id: o.id,
    qa_run_id: o.qa_run_id,
    source: o.source,
    event_type: o.event_type,
    event_name: textCell(o.event_id ? (eventNameById.get(o.event_id) ?? o.event_id) : null),
    variant_name: textCell(o.variant_id ? (variantNameById.get(o.variant_id) ?? o.variant_id) : null),
    timestamp: o.timestamp,
    page_url: textCell(o.page_url),
    properties_json: jsonCell(o.properties_json),
    context_values_json: jsonCell(o.context_values_json),
    captured_at: textCell(o.captured_at),
  }));
}

function buildFindingsRows(projectId: string): CsvRow[] {
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const variantNameById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  const propertyNameById = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
  return FindingDAL.listFindings(projectId).map((f) => ({
    id: f.id,
    comparison: f.comparison,
    kind: f.kind,
    severity: f.severity,
    status: f.status,
    event_name: textCell(f.event_id ? (eventNameById.get(f.event_id) ?? f.event_id) : null),
    variant_name: textCell(f.variant_id ? (variantNameById.get(f.variant_id) ?? f.variant_id) : null),
    property_name: textCell(f.property_id ? (propertyNameById.get(f.property_id) ?? f.property_id) : null),
    message: textCell(f.message),
    expected_json: jsonCell(f.expected_json),
    actual_json: jsonCell(f.actual_json),
    first_seen_at: f.first_seen_at,
    last_seen_at: f.last_seen_at,
    resolved_at: textCell(f.resolved_at),
    resolved_by: textCell(f.resolved_by),
  }));
}

/** T-3-01/T-4-02 add the `change_log`/`comments` tables; until then both export headers-only. */
function buildEmptyRows(_projectId: string): CsvRow[] {
  return [];
}

const ROW_BUILDERS: Record<CsvEntity, (projectId: string) => CsvRow[]> = {
  events: buildEventsRows,
  properties: buildPropertiesRows,
  event_properties: buildEventPropertiesRows,
  variants: buildVariantsRows,
  standard_event_mappings: buildStandardEventMappingsRows,
  identity_rules: buildIdentityRulesRows,
  catalogs: buildCatalogsRows,
  catalog_fields: buildCatalogFieldsRows,
  consent_categories: buildConsentCategoriesRows,
  use_cases: buildUseCasesRows,
  requirements: buildRequirementsRows,
  rules: buildRulesRows,
  qa_runs: buildQaRunsRows,
  observations: buildObservationsRows,
  findings: buildFindingsRows,
  change_log: buildEmptyRows,
  comments: buildEmptyRows,
};

export function buildCsvRows(projectId: string, entity: CsvEntity): CsvRow[] {
  return ROW_BUILDERS[entity](projectId);
}

export function countCsvRows(projectId: string, entity: CsvEntity): number {
  return buildCsvRows(projectId, entity).length;
}

/** `GET /export/csv`: every declared entity with its current row count (D-46). */
export function listCsvEntityCounts(projectId: string): { entity: CsvEntity; count: number }[] {
  return (Object.keys(CSV_ENTITIES) as CsvEntity[]).map((entity) => ({
    entity,
    count: countCsvRows(projectId, entity),
  }));
}

/**
 * Full CSV file text for one entity: header row (the declared contract, so an empty table still
 * produces a valid, joinable file), RFC 4180 quoting via papaparse, CRLF line endings, UTF-8 BOM
 * prefix (Excel opens it correctly; any CSV reader strips the BOM) (D-46).
 */
export function buildCsvFile(projectId: string, entity: CsvEntity): string {
  const headers = CSV_ENTITIES[entity].headers as unknown as string[];
  const rows = buildCsvRows(projectId, entity);
  const body = Papa.unparse(
    { fields: headers, data: rows },
    { newline: '\r\n' }
  );
  return `﻿${body}`;
}
