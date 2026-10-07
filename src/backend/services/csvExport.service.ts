/**
 * CSV export per entity (D-46, T-3-03, capability 9, qa-roundtrip scenario 6). Every entity's rows
 * are mapped to plain objects keyed by `src/domain/csv.ts`'s declared header list, then handed to
 * `papaparse.unparse` for RFC 4180 quoting; `buildCsvFile` adds the UTF-8 BOM and forces CRLF line
 * endings (Excel-friendly, D-46). Soft-deleted rows are excluded: most DAL `list*` functions used
 * here already filter `deleted_at IS NULL` (or the table has no soft-delete column at all), but a
 * child table whose own list function does *not* join its parent's `deleted_at` (`rules`, D-46
 * pre-QA fix WARNING 2) needs an explicit filter in its row builder below -- `event.dal.ts`'s
 * `deleteEvent` does not yet clean up a soft-deleted event's rules (pre-existing, tracked as a
 * follow-up), so `RuleDAL.listRulesByProject` still returns them. Ids sit next to resolved names so
 * a spreadsheet user can join files.
 *
 * Pre-QA fix (reviewer 23:22, supervisor decision 23:24, WARNING 1): every row builder and
 * `listCsvEntityCounts` run a small, fixed number of SQL statements regardless of project size --
 * one project-wide query per table (plus small in-memory maps for name resolution), never one
 * query per row or per link. `csvExport.service.test.ts` patches `db.prepare` to assert this stays
 * true for `events`, `event_properties` and the listing route.
 */
import Papa from 'papaparse';
import { getDb } from '../db';
import { CSV_ENTITIES, type CsvEntity } from '../../domain/csv';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as IdentifierDAL from '../dal/identifier.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import { classifyProperty } from '../../domain/propertyCategory';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as RuleDAL from '../dal/rule.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as FindingDAL from '../dal/finding.dal';
import * as SourceDAL from '../dal/source.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import * as CommentDAL from '../dal/comment.dal';
import { describeRuleExpression, computeCertificationsForProject } from './document.service';
import { withEntityLabels } from './comments.service';
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

/** ISO string from an epoch-seconds timestamp (D-46 pre-QA fix, LOW 3); empty for null/undefined/non-finite. */
function timestampIsoCell(epochSeconds: number | null | undefined): string {
  if (epochSeconds === null || epochSeconds === undefined) return '';
  const ms = epochSeconds * 1000;
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
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
    implementation_method: e.implementation_method,
    dl_event_name: textCell(e.dl_event_name),
    identifiers_json: textCell(e.identifiers_json ? JSON.stringify(e.identifiers_json) : null),
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
    property_category: classifyProperty(p),
    category_override: textCell(p.category_override),
    description: textCell(p.description),
    data_type: p.data_type,
    data_formats_json: jsonCell(p.data_formats_json),
    pii: boolCell(p.pii),
    property_type: p.property_type,
    allowed_values_json: jsonCell(p.allowed_values_json),
    example_values_json: jsonCell(p.example_values_json),
    item_schema_json: jsonCell(p.item_schema_json),
    kind: p.kind,
    derivation_json: jsonCell(p.derivation_json),
    bloomreach_customer_property: textCell(p.bloomreach_customer_property),
    priority: textCell(p.priority),
    status: textCell(p.status),
    notes: textCell(p.notes),
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

interface EventPropertyJoinRow {
  event_id: string;
  event_name: string;
  property_id: string;
  role: string;
  required: number;
  payload_key: string | null;
  priority: string | null;
  status: string | null;
  source_id: string | null;
  definition_id: string | null;
  sort_order: number;
}

/**
 * D-46 pre-QA fix (WARNING 1): one project-wide join instead of one `getEventWithProperties` call
 * per event (which itself ran one `getPropertyById` per link) -- on the Data Manager fixture (62
 * events, 1020 links) the old shape ran 2291 SQL statements; this runs 3 (this query, the property
 * name map, the source name map), independent of row count.
 */
function buildEventPropertiesRows(projectId: string): CsvRow[] {
  const propertyNameById = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
  const sourceNameById = new Map(SourceDAL.listSources(projectId).map((s) => [s.id, s.name]));
  // D-58: one batched query for every definition name in the project, instead of one lookup per
  // link (same "no N+1" contract this whole file guards with its own statement-count test).
  const definitionNameById = new Map(
    (
      getDb().prepare('SELECT id, name FROM property_definitions WHERE project_id = ?').all(projectId) as {
        id: string;
        name: string;
      }[]
    ).map((d) => [d.id, d.name])
  );

  const rows = getDb()
    .prepare(
      `SELECT ep.event_id as event_id, e.name as event_name, ep.property_id as property_id,
              ep.role as role, ep.required as required, ep.payload_key as payload_key,
              ep.priority as priority, ep.status as status, ep.source_id as source_id,
              ep.definition_id as definition_id, ep.sort_order as sort_order
       FROM event_properties ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       WHERE e.project_id = ?
       ORDER BY e.name, ep.sort_order, ep.created_at`
    )
    .all(projectId) as EventPropertyJoinRow[];

  return rows.map((row) => ({
    event_id: row.event_id,
    event_name: row.event_name,
    property_id: row.property_id,
    property_name: propertyNameById.get(row.property_id) ?? row.property_id,
    role: row.role,
    required: boolCell(row.required === 1),
    payload_key: textCell(row.payload_key),
    priority: textCell(row.priority),
    status: textCell(row.status),
    source_id: textCell(row.source_id),
    source_name: textCell(row.source_id ? (sourceNameById.get(row.source_id) ?? row.source_id) : null),
    definition_id: textCell(row.definition_id),
    definition_name: textCell(row.definition_id ? (definitionNameById.get(row.definition_id) ?? null) : null),
    sort_order: row.sort_order,
  }));
}

/**
 * D-58 (T-4-00): one row per `property_definitions` row, `using_events` a `; `-joined list of the
 * event names currently linked to it (comma inside a name is not a CSV concern here since event
 * names are ASCII identifiers, `validateAsciiName`). One batched query per lookup, same "no N+1"
 * contract as the rest of this file.
 */
function buildPropertyDefinitionsRows(projectId: string): CsvRow[] {
  const propertyNameById = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
  const usingEventsByDefinitionId = new Map<string, string[]>();
  for (const row of getDb()
    .prepare(
      `SELECT ep.definition_id as definition_id, e.name as event_name
       FROM event_properties ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       WHERE e.project_id = ? AND ep.definition_id IS NOT NULL
       ORDER BY e.name`
    )
    .all(projectId) as { definition_id: string; event_name: string }[]) {
    const list = usingEventsByDefinitionId.get(row.definition_id) ?? [];
    list.push(row.event_name);
    usingEventsByDefinitionId.set(row.definition_id, list);
  }

  // Fix round ERROR 2: exclude a definition whose own property was soft-deleted (`deleteProperty`
  // now cascades the soft-delete to its definitions, but the join here is a second, independent
  // guard against a definition ever outliving its property in this export).
  const rows = getDb()
    .prepare(
      `SELECT pd.id as id, pd.property_id as property_id, pd.name as name, pd.description as description,
              pd.allowed_values_json as allowed_values_json, pd.formats_json as formats_json,
              pd.example_values_json as example_values_json
       FROM property_definitions pd
       JOIN properties p ON p.id = pd.property_id AND p.deleted_at IS NULL
       WHERE pd.project_id = ? AND pd.deleted_at IS NULL
       ORDER BY pd.property_id, pd.sort_order, pd.name`
    )
    .all(projectId) as {
    id: string;
    property_id: string;
    name: string;
    description: string | null;
    allowed_values_json: string | null;
    formats_json: string | null;
    example_values_json: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    property_id: row.property_id,
    property_name: propertyNameById.get(row.property_id) ?? row.property_id,
    name: row.name,
    description: textCell(row.description),
    allowed_values_json: jsonCell(JSON.parse(row.allowed_values_json ?? '[]')),
    formats_json: jsonCell(JSON.parse(row.formats_json ?? '[]')),
    example_values_json: jsonCell(JSON.parse(row.example_values_json ?? '[]')),
    using_events: textCell((usingEventsByDefinitionId.get(row.id) ?? []).join('; ') || null),
  }));
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

function buildIdentifiersRows(projectId: string): CsvRow[] {
  return IdentifierDAL.listIdentifiers(projectId).map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type,
    description: textCell(i.description),
    is_cookie: boolCell(i.is_cookie),
    sort_order: i.sort_order,
  }));
}

function buildIdentityRulesRows(projectId: string): CsvRow[] {
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));
  const sourceNameById = new Map(SourceDAL.listSources(projectId).map((s) => [s.id, s.name]));
  return IdentityRuleDAL.listIdentityRules(projectId).map((r) => ({
    id: r.id,
    identifier_id: textCell(r.identifier_id),
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
    kind: c.kind,
    market: textCell(c.market),
    language: textCell(c.language),
    version: c.version,
    live_at: textCell(c.live_at),
  }));
}

function buildSourcesRows(projectId: string): CsvRow[] {
  const defaultSourceId = ProjectDAL.getProjectOrThrow(projectId).default_source_id;
  return SourceDAL.listSources(projectId).map((s) => ({
    id: s.id,
    name: s.name,
    system: s.system,
    method: textCell(s.method),
    color: textCell(s.color),
    is_default: boolCell(s.id === defaultSourceId),
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
    internal_notes: textCell(uc.internal_notes),
    internal_url: textCell(uc.internal_url),
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

  // D-46 pre-QA fix (WARNING 2): `RuleDAL.listRulesByProject` does not join `events.deleted_at`
  // (`deleteEvent` does not yet clean up a soft-deleted event's rules, a pre-existing gap tracked
  // as a follow-up), so a rule whose event was deleted must be filtered out here explicitly --
  // `eventNameById` already excludes soft-deleted events (built from `EventDAL.listEvents`).
  return RuleDAL.listRulesByProject(projectId)
    .filter((rule) => eventNameById.has(rule.event_id))
    .map((rule) => ({
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
    timestamp_iso: timestampIsoCell(o.timestamp),
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

/**
 * T-4-02 (D-49): comments' `entity_label` is resolved the same way the internal API resolves it
 * (`comments.service.ts#withEntityLabels`, one requirement-label-resolver build for the whole
 * list, not per row), ordered oldest first (matches `comment.dal.ts#listComments`).
 */
function buildCommentsRows(projectId: string): CsvRow[] {
  const rows = withEntityLabels(projectId, CommentDAL.listComments(projectId));
  return rows.map((c) => ({
    id: c.id,
    entity_type: c.entity_type,
    entity_id: c.entity_id,
    entity_label: textCell(c.entity_label),
    author_name: c.author_name,
    via_share: boolCell(c.via_share),
    internal_only: boolCell(c.internal_only),
    body: c.body,
    created_at: c.created_at,
    resolved_at: textCell(c.resolved_at),
    resolved_by: textCell(c.resolved_by),
    parent_id: textCell(c.parent_id),
    status: c.status,
  }));
}

function buildCommentReactionsRows(projectId: string): CsvRow[] {
  if (!tableExists('comment_reactions')) return [];
  const rows = getDb()
    .prepare('SELECT * FROM comment_reactions WHERE project_id = ? ORDER BY created_at, id')
    .all(projectId) as { id: string; comment_id: string; author_name: string; kind: string; via_share: number; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    comment_id: r.comment_id,
    author_name: r.author_name,
    kind: r.kind,
    via_share: boolCell(!!r.via_share),
    created_at: r.created_at,
  }));
}

/** T-5-04: one row per comment image, oldest comment first. */
function buildCommentAttachmentsRows(projectId: string): CsvRow[] {
  if (!tableExists('comment_attachments')) return [];
  const rows = getDb()
    .prepare('SELECT * FROM comment_attachments WHERE project_id = ? ORDER BY created_at, id')
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    comment_id: String(r.comment_id),
    file_path: String(r.file_path),
    mime: String(r.mime),
    width: String(r.width),
    height: String(r.height),
    size_bytes: String(r.size_bytes),
    sort_order: String(r.sort_order),
    created_at: String(r.created_at),
  }));
}

interface ChangeLogDbRow {
  id: string;
  changed_at: string;
  actor: string;
  source: string;
  batch_id: string | null;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  action: string;
  diff_json: string | null;
}

/** `true` once T-3-01's migration (0015) or T-4-02's (0019) has run; guards `change_log`/`comments`
 *  reads in case this ever runs against an older schema snapshot. */
function tableExists(name: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

/**
 * QA fix (T-3-05 QA round, 2026-09-28): T-3-01's `change_log` table now exists (this branch has it
 * merged), so its CSV export reads the real rows instead of staying headers-only forever. One
 * project-wide query, newest first (matches `change-log.dal.ts#listChanges`'s own default order); `diff_json` is
 * already a JSON array column, re-emitted compactly via `jsonCell` (its stored text always parses,
 * since `recordChange` is the only writer and always writes through `toJsonColumn`).
 */
function buildChangeLogRows(projectId: string): CsvRow[] {
  if (!tableExists('change_log')) return [];
  const rows = getDb()
    .prepare('SELECT * FROM change_log WHERE project_id = ? ORDER BY changed_at DESC, id DESC')
    .all(projectId) as ChangeLogDbRow[];
  return rows.map((r) => ({
    id: r.id,
    changed_at: r.changed_at,
    actor: r.actor,
    source: r.source,
    batch_id: textCell(r.batch_id),
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    entity_label: textCell(r.entity_label),
    action: r.action,
    diff_json: jsonCell(JSON.parse(r.diff_json ?? '[]')),
  }));
}

const ROW_BUILDERS: Record<CsvEntity, (projectId: string) => CsvRow[]> = {
  events: buildEventsRows,
  properties: buildPropertiesRows,
  event_properties: buildEventPropertiesRows,
  property_definitions: buildPropertyDefinitionsRows,
  variants: buildVariantsRows,
  standard_event_mappings: buildStandardEventMappingsRows,
  identifiers: buildIdentifiersRows,
  identity_rules: buildIdentityRulesRows,
  catalogs: buildCatalogsRows,
  sources: buildSourcesRows,
  catalog_fields: buildCatalogFieldsRows,
  consent_categories: buildConsentCategoriesRows,
  use_cases: buildUseCasesRows,
  requirements: buildRequirementsRows,
  rules: buildRulesRows,
  qa_runs: buildQaRunsRows,
  observations: buildObservationsRows,
  findings: buildFindingsRows,
  change_log: buildChangeLogRows,
  comments: buildCommentsRows,
  comment_reactions: buildCommentReactionsRows,
  comment_attachments: buildCommentAttachmentsRows,
};

export function buildCsvRows(projectId: string, entity: CsvEntity): CsvRow[] {
  return ROW_BUILDERS[entity](projectId);
}

function countOf(sql: string, projectId: string): number {
  return (getDb().prepare(sql).get(projectId) as { n: number }).n;
}

/**
 * One `COUNT(*)` per entity (D-46 pre-QA fix, WARNING 1): `GET /export/csv` used to build every
 * entity's full row set just to report its length (3145 statements on the Data Manager fixture);
 * each query below mirrors the corresponding row builder's soft-delete/parent-join filter exactly,
 * so the count always matches the file's row count. `change_log` (T-3-01) and `comments` (T-4-02)
 * both count their real tables.
 */
const COUNT_QUERIES: Record<CsvEntity, (projectId: string) => number> = {
  events: (projectId) => countOf('SELECT COUNT(*) as n FROM events WHERE project_id = ? AND deleted_at IS NULL', projectId),
  properties: (projectId) => countOf('SELECT COUNT(*) as n FROM properties WHERE project_id = ? AND deleted_at IS NULL', projectId),
  event_properties: (projectId) =>
    countOf(
      `SELECT COUNT(*) as n FROM event_properties ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       WHERE e.project_id = ?`,
      projectId
    ),
  property_definitions: (projectId) =>
    countOf('SELECT COUNT(*) as n FROM property_definitions WHERE project_id = ? AND deleted_at IS NULL', projectId),
  variants: (projectId) => countOf('SELECT COUNT(*) as n FROM variants WHERE project_id = ?', projectId),
  standard_event_mappings: (projectId) =>
    countOf(
      `SELECT COUNT(*) as n FROM standard_event_mappings m
       JOIN events e ON e.id = m.event_id AND e.deleted_at IS NULL
       WHERE m.project_id = ?`,
      projectId
    ),
  identifiers: (projectId) => countOf('SELECT COUNT(*) as n FROM identifiers WHERE project_id = ?', projectId),
  identity_rules: (projectId) => countOf('SELECT COUNT(*) as n FROM identity_rules WHERE project_id = ?', projectId),
  catalogs: (projectId) => countOf('SELECT COUNT(*) as n FROM catalogs WHERE project_id = ? AND deleted_at IS NULL', projectId),
  sources: (projectId) => countOf('SELECT COUNT(*) as n FROM sources WHERE project_id = ?', projectId),
  catalog_fields: (projectId) =>
    countOf(
      `SELECT COUNT(*) as n FROM catalog_fields cf
       JOIN catalogs c ON c.id = cf.catalog_id
       WHERE c.project_id = ? AND c.deleted_at IS NULL`,
      projectId
    ),
  consent_categories: (projectId) => countOf('SELECT COUNT(*) as n FROM consent_categories WHERE project_id = ?', projectId),
  use_cases: (projectId) => countOf('SELECT COUNT(*) as n FROM use_cases WHERE project_id = ? AND deleted_at IS NULL', projectId),
  requirements: (projectId) =>
    countOf(
      `SELECT COUNT(*) as n FROM requirements r
       JOIN use_cases uc ON uc.id = r.use_case_id AND uc.deleted_at IS NULL
       WHERE uc.project_id = ?`,
      projectId
    ),
  // Mirrors buildRulesRows' explicit soft-deleted-event filter (WARNING 2) so the count matches.
  rules: (projectId) =>
    countOf(
      `SELECT COUNT(*) as n FROM rules r
       JOIN events e ON e.id = r.event_id AND e.deleted_at IS NULL
       WHERE r.project_id = ?`,
      projectId
    ),
  qa_runs: (projectId) => countOf('SELECT COUNT(*) as n FROM qa_runs WHERE project_id = ?', projectId),
  observations: (projectId) => countOf('SELECT COUNT(*) as n FROM observations WHERE project_id = ?', projectId),
  findings: (projectId) => countOf('SELECT COUNT(*) as n FROM findings WHERE project_id = ?', projectId),
  // QA fix (2026-09-28): matches buildChangeLogRows now that the table exists (T-3-01).
  change_log: (projectId) => (tableExists('change_log') ? countOf('SELECT COUNT(*) as n FROM change_log WHERE project_id = ?', projectId) : 0),
  // T-4-02: matches buildCommentsRows now that `comments` exists.
  comment_reactions: (projectId) =>
    tableExists('comment_reactions') ? countOf('SELECT COUNT(*) as n FROM comment_reactions WHERE project_id = ?', projectId) : 0,
  comments: (projectId) => (tableExists('comments') ? countOf('SELECT COUNT(*) as n FROM comments WHERE project_id = ?', projectId) : 0),
  comment_attachments: (projectId) =>
    tableExists('comment_attachments') ? countOf('SELECT COUNT(*) as n FROM comment_attachments WHERE project_id = ?', projectId) : 0,
};

/** `GET /export/csv`: every declared entity with its current row count (D-46). */
export function listCsvEntityCounts(projectId: string): { entity: CsvEntity; count: number }[] {
  return (Object.keys(CSV_ENTITIES) as CsvEntity[]).map((entity) => ({
    entity,
    count: COUNT_QUERIES[entity](projectId),
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
