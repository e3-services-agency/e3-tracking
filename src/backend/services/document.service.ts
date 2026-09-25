/**
 * Event card and tracking document builder (D-05, D-21, D-34, T-2-08, plan "Event card and
 * tracking document"). `buildEventCard` computes the whole `EventCard` for one event (the in-app
 * card page, the HTML documentation, `GET /export/tracking-document.json` and MCP `get_event_card`
 * all consume it, T-2-09/T-2-10); `buildTrackingDocument` assembles the project-wide export per
 * `src/domain/document/trackingDocument.ts`'s contract.
 *
 * Certification (D-05) and the coverage grid (D-21) are pure functions in `src/domain/
 * certification.ts`/`src/domain/coverage.ts`; this module only gathers their inputs from the DAL
 * and a live-resolved observation set (`eventResolution.ts`'s `createEventResolver`, the same
 * resolution `useCaseCoverage.service.ts` uses -- an observation counts as soon as the definitions
 * catch up, with no need to run a comparison recompute first).
 */
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as RuleDAL from '../dal/rule.dal';
import * as FindingDAL from '../dal/finding.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as LimitsService from './limits.service';
import { createEventResolver } from './eventResolution';
import { computeCertification } from '../../domain/certification';
import { computeEventCoverage, type CoverageObservation } from '../../domain/coverage';
import { buildTargetLabelResolver } from './requirements-matrix.service';
import {
  buildCodegenSnippets,
  jsonSampleValueForProperty,
  toAttachedPropertyForCodegen,
  attachedPropertiesForVariant,
  type AttachedPropertyForCodegen,
} from './codegen.service';
import { SDK_DEFAULT_PROPERTIES } from '../../domain/bloomreach';
import type { EventPropertyWithDetails, EventRow } from '../dal/event.dal';
import type { VariantRow } from '../dal/variant.dal';
import type { RuleRow } from '../dal/rule.dal';
import type { FindingRow } from '../dal/finding.dal';
import type { Operand, RuleExpression } from '../../domain/rules/types';
import type { CodegenEventNameOverrides } from '../../types/schema';
import {
  TRACKING_DOCUMENT_FORMAT,
  TRACKING_DOCUMENT_VERSION,
  type EventCard,
  type EventCardAllowedValue,
  type EventCardContext,
  type EventCardCoverage,
  type EventCardProperty,
  type EventCardRule,
  type EventCardStandardEventMapping,
  type EventCardVariant,
  type FindingSeverityCounts,
  type TrackingDocument,
} from '../../domain/document/trackingDocument';

// ---------------------------------------------------------------------------
// Shared small helpers
// ---------------------------------------------------------------------------

function emptySeverityCounts(): FindingSeverityCounts {
  return { error: 0, warning: 0, info: 0 };
}

function tallyFindings(findings: FindingRow[]): { open: FindingSeverityCounts; by_comparison: Record<string, FindingSeverityCounts> } {
  const open = emptySeverityCounts();
  const by_comparison: Record<string, FindingSeverityCounts> = {};
  for (const f of findings) {
    open[f.severity] += 1;
    const bucket = by_comparison[f.comparison] ?? emptySeverityCounts();
    bucket[f.severity] += 1;
    by_comparison[f.comparison] = bucket;
  }
  return { open, by_comparison };
}

function sampleFromAttached(attached: AttachedPropertyForCodegen[]): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const p of attached) sample[p.property_name] = jsonSampleValueForProperty(p);
  return sample;
}

/** Per-project cache: (event_id, property_id) -> property name, for resolving rule expressions and field maps to readable names without a `getEventWithProperties` re-read per rule. */
function buildPropertyNameResolver(projectId: string): (eventId: string, propertyId: string) => string {
  const cache = new Map<string, Map<string, string>>();
  return (eventId, propertyId) => {
    let names = cache.get(eventId);
    if (!names) {
      names = new Map<string, string>();
      try {
        const { properties } = EventDAL.getEventWithProperties(projectId, eventId);
        for (const link of properties) names.set(link.property_id, link.property.name);
      } catch {
        // event_id no longer resolves (deleted); leave the cache empty, callers fall back to the raw id.
      }
      cache.set(eventId, names);
    }
    return names.get(propertyId) ?? propertyId;
  };
}

// ---------------------------------------------------------------------------
// Rule expression -> readable text (plan EventCard field "rules[] {... expression (names resolved)}")
// ---------------------------------------------------------------------------

function describeOperand(op: Operand, eventId: string, nameOf: (eventId: string, propertyId: string) => string): string {
  switch (op.ref) {
    case 'property':
      return nameOf(eventId, op.property_id);
    case 'list_field':
      return `${nameOf(eventId, op.property_id)}[].${op.field}`;
    case 'constant':
      return JSON.stringify(op.value);
    case 'product':
      return `(${describeOperand(op.left, eventId, nameOf)} * ${describeOperand(op.right, eventId, nameOf)})`;
    case 'aggregate':
      return `${op.fn}(${describeOperand(op.of, eventId, nameOf)})`;
    default:
      return '?';
  }
}

/** Human-readable text for one rule's `expression_json`, every `property_id` resolved to its name. */
export function describeRuleExpression(
  eventId: string,
  expression: RuleExpression,
  nameOf: (eventId: string, propertyId: string) => string,
  eventNameById: Map<string, string>
): string {
  switch (expression.kind) {
    case 'arithmetic':
      return `${describeOperand(expression.left, eventId, nameOf)} ${expression.comparator} ${describeOperand(expression.right, eventId, nameOf)}`;
    case 'membership':
      return `${describeOperand(expression.needle, eventId, nameOf)} in ${nameOf(eventId, expression.haystack.property_id)}[].${expression.haystack.field}`;
    case 'bound': {
      const subject = describeOperand(expression.subject, eventId, nameOf);
      if (expression.check === 'non_empty' || expression.check === 'not_future') return `${subject} ${expression.check}`;
      return `${subject} ${expression.check} ${expression.bound ? describeOperand(expression.bound, eventId, nameOf) : ''}`.trim();
    }
    case 'cross_event': {
      const childEventName = eventNameById.get(expression.child_event_id) ?? expression.child_event_id;
      const joinText = `${nameOf(eventId, expression.join.parent_property_id)} = ${childEventName}.${nameOf(expression.child_event_id, expression.join.child_property_id)}`;
      const childText = describeOperand(expression.child, expression.child_event_id, nameOf);
      const targetText = describeOperand(expression.target, eventId, nameOf);
      return `${childText} (joined on ${joinText}) ${expression.comparator} ${targetText}`;
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Live observation resolution, shared by freshness/certification/coverage
// ---------------------------------------------------------------------------

interface ResolvedObservationForCard {
  event_id: string | null;
  variant_id: string | null;
  properties: Record<string, unknown>;
  context_values: Record<string, unknown> | null;
  timestamp: number;
}

function resolveObservationsInScope(projectId: string): ResolvedObservationForCard[] {
  const resolve = createEventResolver(projectId);
  return ObservationDAL.listObservationsInScope(projectId).map((o) => {
    const resolution = resolve(o.event_type, o.properties_json);
    return {
      event_id: resolution.event_id,
      variant_id: resolution.variant_id,
      properties: o.properties_json,
      context_values: (o.context_values_json as Record<string, unknown> | null) ?? null,
      timestamp: o.timestamp,
    };
  });
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

function toEventCardProperty(link: EventPropertyWithDetails): EventCardProperty {
  const allowedValuesRaw = Array.isArray(link.property.allowed_values_json)
    ? (link.property.allowed_values_json as { value: string; label?: string | null; standard_event?: string | null }[])
    : [];
  const allowedValues: EventCardAllowedValue[] | null =
    allowedValuesRaw.length > 0
      ? allowedValuesRaw.map((v) => ({ value: v.value, label: v.label ?? null, standard_event: v.standard_event ?? null }))
      : null;
  return {
    property_id: link.property_id,
    name: link.property.name,
    payload_key: link.payload_key?.trim() || link.property.name,
    data_type: link.property.data_type,
    data_formats: Array.isArray(link.property.data_formats_json) ? (link.property.data_formats_json as string[]) : [],
    required: link.required,
    role: (link.role as EventCardProperty['role']) ?? 'normal',
    allowed_values: allowedValues,
    item_schema: Array.isArray(link.property.item_schema_json) ? (link.property.item_schema_json as EventCardProperty['item_schema']) : null,
    example: jsonSampleValueForProperty(toAttachedPropertyForCodegen(link)),
    description: link.description_override?.trim() || link.property.description || null,
    pii: link.property.pii,
  };
}

function toEventCardVariant(
  variant: VariantRow,
  properties: EventPropertyWithDetails[],
  propertyNameById: Map<string, string>,
  standardEventByVariantId: Map<string, string>
): EventCardVariant {
  const attached = attachedPropertiesForVariant(properties, variant);
  return {
    id: variant.id,
    name: variant.name,
    conditions: variant.conditions_json.map((c) => ({
      property_id: c.property_id,
      property_name: propertyNameById.get(c.property_id) ?? c.property_id,
      operator: c.operator,
      values: c.values,
    })),
    standard_event: standardEventByVariantId.get(variant.id) ?? null,
    expected_payload: sampleFromAttached(attached),
  };
}

function computeExpiration(event: EventRow, project: ProjectDAL.ProjectRow): EventCard['expiration'] {
  const eventExpiration = event.expiration_json as EventCard['expiration']['effective'];
  if (eventExpiration) return { effective: eventExpiration, source: 'event' };
  const projectDefault = project.default_expiration_json as EventCard['expiration']['effective'];
  if (projectDefault) return { effective: projectDefault, source: 'project' };
  return { effective: null, source: null };
}

/** Builds the full `EventCard` for one event (plan "Event card and tracking document"). */
export function buildEventCard(projectId: string, eventId: string): EventCard {
  const { event, properties } = EventDAL.getEventWithProperties(projectId, eventId);
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const variants = VariantDAL.listVariants(projectId, eventId);
  const allMappings = StandardEventMappingDAL.listStandardEventMappings(projectId);
  const mappingsForEvent = allMappings.filter((m) => m.event_id === eventId);
  const standardEventByVariantId = new Map(
    allMappings.filter((m) => m.variant_id).map((m) => [m.variant_id as string, m.standard_event])
  );
  const variantNameById = new Map(variants.map((v) => [v.id, v.name]));

  const propertyNameById = new Map(properties.map((link) => [link.property_id, link.property.name]));
  const nameOf = buildPropertyNameResolver(projectId);
  const eventNameById = new Map(EventDAL.listEvents(projectId).map((e) => [e.id, e.name]));

  const openFindingsForEvent = FindingDAL.listFindings(projectId, { event_id: eventId, status: 'open' });
  const quality = tallyFindings(openFindingsForEvent);
  const openErrorFindingCount = quality.open.error;

  const resolvedObservations = resolveObservationsInScope(projectId);
  const observationsForEvent = resolvedObservations.filter((o) => o.event_id === eventId);
  const freshness = {
    last_observation_at: observationsForEvent.length > 0 ? Math.max(...observationsForEvent.map((o) => o.timestamp)) : null,
    observation_count: observationsForEvent.length,
  };

  const certification = computeCertification({
    applicable: event.class === 'custom',
    status: event.status,
    openErrorFindingCount,
    hasObservation: observationsForEvent.length > 0,
  });

  const contextProperties = properties.filter((link) => link.role === 'context');
  const contexts: EventCardContext[] = contextProperties.map((link) => ({
    property_id: link.property_id,
    property: link.property.name,
    values: Array.isArray(link.property.allowed_values_json)
      ? (link.property.allowed_values_json as { value: string }[]).map((v) => v.value)
      : [],
  }));

  const coverageObservations: CoverageObservation[] = resolvedObservations.map((o) => ({
    event_id: o.event_id,
    variant_id: o.variant_id,
    properties: o.properties,
    context_values: o.context_values,
    timestamp: o.timestamp,
  }));
  const grid = computeEventCoverage(
    eventId,
    variants.map((v) => ({ id: v.id, name: v.name })),
    contexts.map((c) => ({ property_id: c.property_id, name: c.property, payload_key: propertyNameById.get(c.property_id) ?? c.property, values: c.values })),
    coverageObservations
  );
  const coverage: EventCardCoverage = {
    rows: grid.rows,
    columns: grid.columns.map((c) => ({ property_id: c.property_id, name: c.name, values: c.values })),
    observed_count: grid.cells.length,
    unobserved_count: grid.unobserved.length,
  };

  const rules: EventCardRule[] = RuleDAL.listRulesByEvent(projectId, eventId).map((rule: RuleRow) => ({
    id: rule.id,
    name: rule.name,
    kind: rule.kind,
    message: rule.message,
    expression_text: describeRuleExpression(eventId, rule.expression_json, nameOf, eventNameById),
    tolerance: { mode: rule.tolerance_mode, value: rule.tolerance_value },
    enabled: rule.enabled,
  }));

  const standardEventMappings: EventCardStandardEventMapping[] = mappingsForEvent.map((m) => ({
    standard_event: m.standard_event,
    variant_id: m.variant_id,
    variant_name: m.variant_id ? variantNameById.get(m.variant_id) ?? m.variant_id : null,
    field_map: Object.fromEntries(
      Object.entries(m.field_map_json).map(([field, propertyId]) => [field, propertyId ? propertyNameById.get(propertyId) ?? propertyId : null])
    ),
  }));

  const requirementsForEvent = RequirementDAL.listRequirementsByEvent(projectId, eventId);
  const levelByUseCaseId = new Map<string, string>();
  for (const req of requirementsForEvent) {
    const current = levelByUseCaseId.get(req.use_case_id);
    if (!current || (current !== 'R' && req.level === 'R')) levelByUseCaseId.set(req.use_case_id, req.level);
  }
  const use_cases = [...levelByUseCaseId.entries()]
    .map(([useCaseId, level]) => {
      const useCase = UseCaseDAL.getUseCaseById(projectId, useCaseId);
      return useCase ? { code: useCase.code, name: useCase.name, level } : null;
    })
    .filter((v): v is { code: string | null; name: string; level: string } => v !== null);

  const attachedForCodegen = properties.map(toAttachedPropertyForCodegen);
  const codegenSnippets = buildCodegenSnippets(
    event.name,
    attachedForCodegen,
    event.codegen_event_name_overrides_json as CodegenEventNameOverrides | null
  );

  return {
    id: event.id,
    name: event.name,
    business_name: event.business_name,
    class: event.class,
    description: event.description,
    purpose: event.purpose,
    page: event.page,
    trigger: event.trigger_text,
    grain: event.grain,
    identity_note: event.identity_note,
    owners: { business: event.owner_business, technical: event.owner_technical },
    priority: event.priority,
    status: event.status,
    certification,
    expiration: computeExpiration(event, project),
    properties: properties.map(toEventCardProperty),
    variants: variants.map((v) => toEventCardVariant(v, properties, propertyNameById, standardEventByVariantId)),
    standard_event_mappings: standardEventMappings,
    contexts,
    coverage,
    rules,
    derived_metrics: event.derived_metrics_json,
    not_suitable_for: event.not_suitable_for,
    use_cases,
    freshness,
    quality,
    agent_instructions: event.agent_instructions,
    codegen: { gtm: codegenSnippets.dataLayer, web_sdk: codegenSnippets.bloomreachSdk, tracking_api: codegenSnippets.bloomreachApi },
    sdk_default_properties: [...SDK_DEFAULT_PROPERTIES],
  };
}

/** `GET /events/:id/certification`: the `certification` block alone, without building the rest of the card (T-2-08 route). */
export function computeEventCertification(projectId: string, eventId: string): EventCard['certification'] {
  return buildEventCard(projectId, eventId).certification;
}

/** `GET /events/:id/coverage`: the full per-event grid (row/column/cell detail), distinct from the card's summary counts. */
export function computeEventCoverageGrid(projectId: string, eventId: string) {
  const { properties } = EventDAL.getEventWithProperties(projectId, eventId);
  const variants = VariantDAL.listVariants(projectId, eventId);
  const contextProperties = properties.filter((link) => link.role === 'context');
  const contextColumns = contextProperties.map((link) => ({
    property_id: link.property_id,
    name: link.property.name,
    payload_key: link.payload_key?.trim() || link.property.name,
    values: Array.isArray(link.property.allowed_values_json)
      ? (link.property.allowed_values_json as { value: string }[]).map((v) => v.value)
      : [],
  }));
  const observations: CoverageObservation[] = resolveObservationsInScope(projectId);
  return computeEventCoverage(
    eventId,
    variants.map((v) => ({ id: v.id, name: v.name })),
    contextColumns,
    observations
  );
}

// ---------------------------------------------------------------------------
// TrackingDocument (D-34)
// ---------------------------------------------------------------------------

/** `GET /export/tracking-document.json` per the schema, `version: 1` (D-34). Custom events first, then sdk/platform (plan: "events: EventCard[] (custom first, then sdk/platform with a reduced card)"). */
export function buildTrackingDocument(projectId: string): TrackingDocument {
  const project = ProjectDAL.getProjectWithClient(projectId);
  const events = EventDAL.listEvents(projectId);
  const orderedEventIds = [...events.filter((e) => e.class === 'custom'), ...events.filter((e) => e.class !== 'custom')].map((e) => e.id);
  const eventCards = orderedEventIds.map((id) => buildEventCard(projectId, id));

  const customerProperties = PropertyDAL.listProperties(projectId, { scope: 'customer' }).map((p) => ({
    property_id: p.id,
    name: p.name,
    data_type: p.data_type,
    data_formats: Array.isArray(p.data_formats_json) ? (p.data_formats_json as string[]) : [],
    bloomreach_customer_property: p.bloomreach_customer_property,
    pii: p.pii,
    description: p.description,
  }));

  const identityRules = IdentityRuleDAL.listIdentityRules(projectId).map((r) => ({
    identifier_name: r.identifier_name,
    identity_type: r.identity_type,
    name: r.name,
    transformations: r.transformations_json,
    sdk_call: r.sdk_call,
    trigger_text: r.trigger_text,
  }));

  const consentCategories = ConsentCategoryDAL.listConsentCategories(projectId).map((c) => ({
    name: c.name,
    standard_key: c.standard_key,
    status: c.status,
  }));

  const catalogs = CatalogDAL.listCatalogs(projectId).map((c) => ({ name: c.name, mapping_role: c.mapping_role, status: c.status }));

  const labelFor = buildTargetLabelResolver(projectId);
  const useCases = UseCaseDAL.listUseCases(projectId).map((uc) => {
    const requirements = RequirementDAL.listRequirements(projectId, uc.id);
    return {
      code: uc.code,
      name: uc.name,
      type: uc.type,
      status: uc.status,
      narrative: uc.narrative,
      requirements: requirements.map((r) => ({ target_label: labelFor(r), level: r.level, status: r.status })),
    };
  });

  const eventNameById = new Map(events.map((e) => [e.id, e.name]));
  const variantNameById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  const nameOf = buildPropertyNameResolver(projectId);
  const standardEventMappings = StandardEventMappingDAL.listStandardEventMappings(projectId).map((m) => ({
    standard_event: m.standard_event,
    event_name: eventNameById.get(m.event_id) ?? m.event_id,
    variant_name: m.variant_id ? variantNameById.get(m.variant_id) ?? m.variant_id : null,
    field_map: Object.fromEntries(
      Object.entries(m.field_map_json).map(([field, propertyId]) => [field, propertyId ? nameOf(m.event_id, propertyId) : null])
    ),
  }));

  const findingsSummary = tallyFindings(FindingDAL.listFindings(projectId, { status: 'open' }));

  const eventTypeLimit = LimitsService.getEventTypeLimitSummary(projectId);
  const propertyLimits = LimitsService.getEventPropertyLimitSummaries(projectId);

  return {
    format: TRACKING_DOCUMENT_FORMAT,
    version: TRACKING_DOCUMENT_VERSION,
    generated_at: new Date().toISOString(),
    project: {
      key: project.key,
      name: project.name,
      client: project.client?.name ?? null,
      bloomreach_project_url: project.bloomreach_project_url,
      money_tolerance: { percent: project.money_tolerance_percent, floor: project.money_tolerance_floor },
    },
    events: eventCards,
    properties: customerProperties,
    identity_rules: identityRules,
    consent_categories: consentCategories,
    catalogs,
    use_cases: useCases,
    standard_event_mappings: standardEventMappings,
    findings_summary: findingsSummary,
    limits: {
      event_types: { count: eventTypeLimit.count, limit: eventTypeLimit.limit },
      max_properties_per_event: propertyLimits.map((p) => ({ event_id: p.event_id, event_name: p.event_name, count: p.count, limit: p.limit })),
    },
  };
}
