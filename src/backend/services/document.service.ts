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
import { triggerImages } from '../../domain/document/triggerImages';
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
import * as IdentifierDAL from '../dal/identifier.dal';
import { buildIdentityCodegen } from './codegen.service';
import { listIdentityRulesForCodegen } from './identification.service';
import { buildIdentificationFlow, effectiveEventIdentifiers, identifiersAreDerived, type IdentificationFlow } from '../../domain/identity/identifiers';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as SourceDAL from '../dal/source.dal';
import { isHttpUrl } from '../dal/urlValidation';
import * as LimitsService from './limits.service';
import { createEventResolver } from './eventResolution';
import { computeCertification } from '../../domain/certification';
import { computeEventCoverage, type CoverageContextProperty, type CoverageObservation } from '../../domain/coverage';
import { buildTargetLabelResolver } from './requirements-matrix.service';
import {
  buildCodegenV2,
  jsonSampleValueForProperty,
  toAttachedPropertyForCodegen,
  attachedPropertiesForVariant,
  type AttachedPropertyForCodegen,
} from './codegen.service';
import { marketsLabel, type CatalogLinkForCodegen } from '../../domain/codegen/catalogLinks';
import { SDK_DEFAULT_PROPERTIES } from '../../domain/bloomreach';
import { classifyProperty } from '../../domain/propertyCategory';
import type { EventPropertyWithDetails, EventPropertyWithDetailsExtended, EventRow } from '../dal/event.dal';
import * as PropertyDefinitionDAL from '../dal/property-definition.dal';
import * as BundleDAL from '../dal/bundle.dal';
import { dataLayerPath, parseDerivation } from '../../domain/codegen/derivation';
import type { VariantRow } from '../dal/variant.dal';
import type { RuleRow } from '../dal/rule.dal';
import type { FindingRow } from '../dal/finding.dal';
import type { Operand, RuleExpression } from '../../domain/rules/types';
import type { CodegenEventNameOverrides, PropertyExampleValue } from '../../types/schema';
import {
  TRACKING_DOCUMENT_FORMAT,
  TRACKING_DOCUMENT_VERSION,
  type EventCard,
  type EventCardAllowedValue,
  type EventCardContext,
  type EventCardCoverage,
  type EventCardFinding,
  type EventCardProperty,
  type EventCardRule,
  type EventCardStandardEventMapping,
  type EventCardTrigger,
  type EventCardVariant,
  type FindingSeverityCounts,
  type TrackingDocument,
} from '../../domain/document/trackingDocument';
import type { StandardEventMappingRow } from '../dal/standard-event-mapping.dal';

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

/** D-42 (T-2-09 fix round): severity counts of the findings a person acknowledged by hand for one
 * event (`FindingDAL.listAcknowledgedFindings`) -- no `by_comparison` breakdown, unlike `open`,
 * since `EventCard.certification` only ever needs the error count and the card's quality block
 * just needs the total per severity. */
function tallySeverityOnly(findings: FindingRow[]): FindingSeverityCounts {
  const counts = emptySeverityCounts();
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** D-50 (T-4-03): `Event.triggers_json` raw shape (`title`, `description`, `image_path`, `source`
 * -- `source` is the page the screenshot was captured on, exposed as `page_url` below), the same
 * shape `export.service.ts`'s `TriggerEntry`/`pages/Events.tsx` read and write. */
interface RawTriggerEntry {
  title?: string | null;
  description?: string | null;
  image_path?: string | null;
  images?: string[];
  source?: string | null;
  order?: number;
}

function toEventCardTriggers(raw: unknown): EventCardTrigger[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawTriggerEntry[])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => {
      // T-4-03 pre-QA fix: `event.dal.ts` validates a new/updated `source` as http(s) at write
      // time, but a value written before that validation existed (or restored from an older
      // backup) can still be a non-http(s) string on read -- null it out here rather than render
      // it as an `href` in `EventCardView`/`SharedProject`.
      const source = t.source?.trim() || null;
      return {
        title: t.title?.trim() || null,
        description: t.description?.trim() || null,
        image_path: triggerImages(t)[0] ?? null,
        // Additive: only present for a trigger with several screenshots (keeps the single-image shape unchanged).
        ...(triggerImages(t).length > 1 ? { images: triggerImages(t) } : {}),
        page_url: source && isHttpUrl(source) ? source : null,
      };
    });
}

function sampleFromAttached(attached: AttachedPropertyForCodegen[]): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const p of attached) sample[p.property_name] = jsonSampleValueForProperty(p);
  return sample;
}

/** Per-project cache: (event_id, property_id) -> property name, for resolving rule expressions and field maps to readable names without a `getEventWithProperties` re-read per rule. */
function buildPropertyNameResolver(projectId: string): (eventId: string, propertyId: string) => string {
  const cache = new Map<string, Map<string, string>>();
  // T-4-22: a finding with no event (e.g. a customer property `naming_violation`) or whose property
  // is no longer linked to its event still resolves to the property's name, not its raw id.
  let projectNames: Map<string, string> | null = null;
  const projectName = (propertyId: string): string | undefined => {
    if (!projectNames) {
      projectNames = new Map(PropertyDAL.listProperties(projectId).map((p) => [p.id, p.name]));
    }
    return projectNames.get(propertyId);
  };
  return (eventId, propertyId) => {
    if (!eventId) return projectName(propertyId) ?? propertyId;
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
    return names.get(propertyId) ?? projectName(propertyId) ?? propertyId;
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

/**
 * Shared, project-wide inputs for `buildEventCard`, gathered once (WARNING 5 fix round: building
 * every event's card used to re-resolve every project observation and re-list mappings/findings
 * per event, an O(events x observations) cost -- 2.5s for 40 events x 2,000 observations measured
 * before this fix). `buildEventCards`/`buildTrackingDocument`/the docs export build this once per
 * document/export and pass it to every `buildEventCard` call; the single-event routes
 * (`GET /events/:id/card`) let `buildEventCard` build its own (still just one project-wide pass, for
 * one event).
 */
export interface EventCardBuildContext {
  project: ProjectDAL.ProjectRow;
  events: EventRow[];
  eventNameById: Map<string, string>;
  /** Every variant of the project (not just one event's), keyed by id -- used to resolve
   * `StandardEventMapping.variant_id` and `Rule.variant_id` to a display name (ERROR 3 fix round). */
  variantNameById: Map<string, string>;
  allMappings: StandardEventMappingRow[];
  /** Every resolved observation of the project, grouped by its live-resolved `event_id` (WARNING 5:
   * "resolve observations once, group by event id"), so each card does a `Map.get` instead of an
   * O(observations) filter. */
  observationsByEventId: Map<string, ResolvedObservationForCard[]>;
  /** Every currently-open finding of the project (used for `TrackingDocument.findings_summary`,
   * which is not scoped to one event). */
  openFindings: FindingRow[];
  /** `openFindings` grouped by `event_id` (findings with no `event_id`, e.g. `unexpected_event`,
   * are project-level and never appear in a card). */
  openFindingsByEventId: Map<string, FindingRow[]>;
  /** D-42 (T-2-09 fix round): every finding a person resolved by hand
   * (`status = 'resolved' AND resolved_by = 'user'`), grouped by `event_id`. These still count
   * against certification (`acknowledged_errors: n`) and the card's `quality.acknowledged`, even
   * though they are excluded from `openFindings`/`EventCard.findings[]`. */
  acknowledgedFindingsByEventId: Map<string, FindingRow[]>;
  nameOf: (eventId: string, propertyId: string) => string;
  /** Fix round WARNING 3: every non-deleted `property_definitions` row of the project, loaded
   * once and passed to every `getEventWithProperties` call in this file so `buildEventCard`/
   * `buildTrackingDocument` never run one definition query per link. */
  definitionsById: Map<string, PropertyDefinitionDAL.PropertyDefinitionRow>;
  /** D-63 (T-4-17): bundle names per property id (comma-joined), for `EventCardProperty.bundle`. */
  bundleNameByPropertyId: Map<string, string>;
  /** D-63: the project's `kind = 'context'` event properties, for the `sdk_auto` default properties snippet. */
  projectContextProperties: { name: string; sample: unknown }[];
  hardIdKey: string | null;
  /** D-67 (T-4-28): the project's identity rules, sources and the batched identification flow (built once). */
  identityRules: IdentityRuleDAL.IdentityRuleRow[];
  /** D-69 (T-4-35): the project's identifiers registry. */
  identifiers: IdentifierDAL.IdentifierRow[];
  allSources: SourceDAL.SourceRow[];
  identificationFlow: IdentificationFlow;
  /** D-62 (T-4-11B): each event's linked sources, keyed by event id. */
  sourcesByEventId: Map<string, SourceDAL.SourceRow[]>;
  /** D-61 (T-4-11B): `catalog.field` label per catalog field id, for `EventCardProperty.catalog_field`. */
  catalogFieldLabelById: Map<string, string>;
  /** D-61 amendment: per catalog field id, what the codegen comment needs (catalog, field, markets). */
  catalogLinkByFieldId: Map<string, { catalog: string; field: string; markets: string }>;
}

/** Exported for `export.service.ts`'s HTML documentation export, which also calls `buildEventCard`
 * once per event (WARNING 5 fix round) and should share one context across the whole document
 * instead of building a fresh one per event. */
export function buildEventCardContext(projectId: string): EventCardBuildContext {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const events = EventDAL.listEvents(projectId);
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));
  const variantNameById = new Map(VariantDAL.listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  const allMappings = StandardEventMappingDAL.listStandardEventMappings(projectId);

  const observationsByEventId = new Map<string, ResolvedObservationForCard[]>();
  for (const o of resolveObservationsInScope(projectId)) {
    if (!o.event_id) continue;
    const bucket = observationsByEventId.get(o.event_id);
    if (bucket) bucket.push(o);
    else observationsByEventId.set(o.event_id, [o]);
  }

  const openFindings = FindingDAL.listFindings(projectId, { status: 'open' });
  const openFindingsByEventId = new Map<string, FindingRow[]>();
  for (const f of openFindings) {
    if (!f.event_id) continue;
    const bucket = openFindingsByEventId.get(f.event_id);
    if (bucket) bucket.push(f);
    else openFindingsByEventId.set(f.event_id, [f]);
  }

  const acknowledgedFindingsByEventId = new Map<string, FindingRow[]>();
  for (const f of FindingDAL.listAcknowledgedFindings(projectId)) {
    if (!f.event_id) continue;
    const bucket = acknowledgedFindingsByEventId.get(f.event_id);
    if (bucket) bucket.push(f);
    else acknowledgedFindingsByEventId.set(f.event_id, [f]);
  }

  const bundleNames = new Map<string, string[]>();
  for (const bundle of BundleDAL.listBundles(projectId)) {
    for (const propertyId of bundle.property_ids) {
      const list = bundleNames.get(propertyId);
      if (list) list.push(bundle.name);
      else bundleNames.set(propertyId, [bundle.name]);
    }
  }
  const catalogFieldLabelById = new Map<string, string>();
  const catalogLinkByFieldId = new Map<string, { catalog: string; field: string; markets: string }>();
  const allCatalogs = CatalogDAL.listCatalogs(projectId).map((c) => ({ c, fields: CatalogDAL.listCatalogFields(projectId, c.id) }));
  for (const { c, fields } of allCatalogs) {
    const sameKind = c.kind === 'other' ? [c.id] : allCatalogs.filter((x) => x.c.kind === c.kind).map((x) => x.c.id);
    for (const f of fields) {
      catalogFieldLabelById.set(f.id, `${c.name}.${f.name}`);
      catalogLinkByFieldId.set(f.id, {
        catalog: c.name,
        field: f.name,
        markets: marketsLabel(
          allCatalogs
            .filter((x) => sameKind.includes(x.c.id))
            .map((x) => ({ name: x.c.name, market: x.c.market, has_field: x.fields.some((y) => y.name === f.name) }))
        ),
      });
    }
  }
  const projectContextProperties = PropertyDAL.listProperties(projectId, { scope: 'event' })
    .filter((p) => p.kind === 'context')
    .map((p) => ({
      name: p.name,
      sample: jsonSampleValueForProperty({
        property_name: p.name,
        required: false,
        property_data_type: p.data_type,
        property_data_formats: (p.data_formats_json as string[] | null) ?? null,
        property_example_values_json: (p.example_values_json as PropertyExampleValue[] | null) ?? null,
      }),
    }));

  const identityRules = IdentityRuleDAL.listIdentityRules(projectId);
  const identifierRows = IdentifierDAL.listIdentifiers(projectId);
  const allSources = SourceDAL.listSources(projectId);
  const sourcesByEventId = SourceDAL.listEventSourcesByProject(projectId);
  return {
    project,
    events,
    eventNameById,
    variantNameById,
    allMappings,
    observationsByEventId,
    openFindings,
    openFindingsByEventId,
    acknowledgedFindingsByEventId,
    nameOf: buildPropertyNameResolver(projectId),
    definitionsById: PropertyDefinitionDAL.listAllDefinitionsById(projectId),
    bundleNameByPropertyId: new Map([...bundleNames].map(([id, names]) => [id, names.join(', ')])),
    projectContextProperties,
    hardIdKey: identityRules.find((r) => r.identity_type === 'hard')?.identifier_name ?? null,
    identityRules,
    identifiers: identifierRows,
    allSources,
    identificationFlow: buildIdentificationFlow(
      identityRules,
      events.map((e) => ({ ...e, source_ids: (sourcesByEventId.get(e.id) ?? []).map((s) => s.id) })),
      allSources,
      identifierRows
    ),
    sourcesByEventId,
    catalogFieldLabelById,
    catalogLinkByFieldId,
  };
}

/** Shared by the card's `coverage`/`contexts` summary and `computeEventCoverageGrid` (ERROR 2 fix
 * round: the card used to key its coverage columns by the property's display name, diverging from
 * the full grid -- which was already correctly keyed by `payload_key` -- whenever the two differed). */
function buildContextColumns(properties: EventPropertyWithDetails[]): CoverageContextProperty[] {
  return properties
    .filter((link) => link.role === 'context')
    .map((link) => ({
      property_id: link.property_id,
      name: link.property.name,
      payload_key: link.payload_key?.trim() || link.property.name,
      values: Array.isArray(link.property.allowed_values_json)
        ? (link.property.allowed_values_json as { value: string }[]).map((v) => v.value)
        : [],
    }));
}

/** `expected_json.rule_name` (`runRules.ts`'s `RulesEngineRule.name` echoed into the finding) is
 * the only place a rule-produced finding's rule name survives; `null` for every other finding kind. */
function findingRuleName(finding: FindingRow): string | null {
  const expected = finding.expected_json;
  if (expected && typeof expected === 'object' && 'rule_name' in (expected as Record<string, unknown>)) {
    const name = (expected as Record<string, unknown>).rule_name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

/** `FindingDAL.listFindings` orders by severity then `last_seen_at DESC` with no further
 * tiebreaker, so two findings sharing a severity and (in a test, all stamped in the same
 * transaction) an identical `last_seen_at` come back in an arbitrary, run-to-run-unstable order --
 * invisible while `EventCard` only exposed *counts* (`quality`), but a direct problem now that
 * `findings[]` is itself an ordered array (D-40 Q9 fix round; caught by the snapshot test's
 * sequential id placeholders shifting between otherwise-identical runs). Sorted here by content
 * (severity, comparison, kind, property/variant/message) instead, which is both deterministic and a
 * more useful default reading order for a consumer than an arbitrary DB tie order. */
function sortEventCardFindings(findings: EventCardFinding[]): EventCardFinding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
    if (bySeverity !== 0) return bySeverity;
    if (a.comparison !== b.comparison) return a.comparison < b.comparison ? -1 : 1;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    const propA = a.property ?? '';
    const propB = b.property ?? '';
    if (propA !== propB) return propA < propB ? -1 : 1;
    const varA = a.variant ?? '';
    const varB = b.variant ?? '';
    if (varA !== varB) return varA < varB ? -1 : 1;
    const msgA = a.message ?? '';
    const msgB = b.message ?? '';
    if (msgA !== msgB) return msgA < msgB ? -1 : 1;
    // Fix round 2: two findings can share severity/comparison/kind/property/variant/message and
    // still differ only in `expected`/`actual` (e.g. a `cross_event` rule violated by two different
    // parent rows), which the reviewer's fix-round PASS flagged as a non-total ordering (WARNING 1).
    // Falls back to a content-based tie-break, then `id`, so the order is fully deterministic.
    const expA = JSON.stringify(a.expected);
    const expB = JSON.stringify(b.expected);
    if (expA !== expB) return expA < expB ? -1 : 1;
    const actA = JSON.stringify(a.actual);
    const actB = JSON.stringify(b.actual);
    if (actA !== actB) return actA < actB ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function toEventCardFinding(
  finding: FindingRow,
  nameOf: (eventId: string, propertyId: string) => string,
  variantNameById: Map<string, string>
): EventCardFinding {
  return {
    id: finding.id,
    comparison: finding.comparison,
    kind: finding.kind,
    severity: finding.severity,
    property_id: finding.property_id,
    property: finding.property_id ? nameOf(finding.event_id ?? '', finding.property_id) : null,
    variant_id: finding.variant_id,
    variant: finding.variant_id ? variantNameById.get(finding.variant_id) ?? finding.variant_id : null,
    rule: findingRuleName(finding),
    message: finding.message,
    expected: finding.expected_json,
    actual: finding.actual_json,
    qa_run_id: finding.qa_run_id,
    first_seen: finding.first_seen_at,
    last_seen: finding.last_seen_at,
  };
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

/** D-61 amendment: one codegen comment entry per catalog-linked property of an event. */
export function catalogLinksForProperties(
  properties: { property: { name: string; mapped_catalog_field_id: string | null } }[],
  context: Pick<EventCardBuildContext, 'catalogLinkByFieldId'>
): CatalogLinkForCodegen[] {
  const out: CatalogLinkForCodegen[] = [];
  for (const link of properties) {
    const target = link.property.mapped_catalog_field_id ? context.catalogLinkByFieldId.get(link.property.mapped_catalog_field_id) : undefined;
    if (target) out.push({ property: link.property.name, catalog: target.catalog, field: target.field, markets: target.markets });
  }
  return out;
}

function toEventCardProperty(
  link: EventPropertyWithDetailsExtended,
  bundleNameByPropertyId?: Map<string, string>,
  method: string = 'client_web',
  catalogFieldLabelById?: Map<string, string>
): EventCardProperty {
  const kind = link.property.kind ?? 'event';
  const derivation = parseDerivation(link.property.derivation_json);
  // D-58: allowed values, description and example are per-event, sourced from the link's own
  // definition (falling back to the shared Property's fields when the link carries no
  // definition -- defensive only, every link is resolved to a real definition by the DAL).
  const definitionAllowedRaw = Array.isArray(link.definition?.allowed_values_json)
    ? (link.definition!.allowed_values_json as { value: string; label?: string | null; standard_event?: string | null }[])
    : null;
  const allowedValuesRaw =
    definitionAllowedRaw ??
    (Array.isArray(link.property.allowed_values_json)
      ? (link.property.allowed_values_json as { value: string; label?: string | null; standard_event?: string | null }[])
      : []);
  const allowedValues: EventCardAllowedValue[] | null =
    allowedValuesRaw.length > 0
      ? allowedValuesRaw.map((v) => ({ value: v.value, label: v.label ?? null, standard_event: v.standard_event ?? null }))
      : null;
  // Fix round 2 ERROR 1: same fallback chain as comparison.service.ts's buildDefinitionSnapshot
  // and codegen.service.ts's toAttachedPropertyForCodegen -- the definition's own formats_json
  // when non-empty, else the shared Property's. Without this the event card, the tracking
  // document and MCP get_expected_payload kept showing the property's formats even when the link
  // uses a definition with its own, narrower list (e.g. `contact` allows `email`+`uri` on the
  // property but only `uri` on the `consent` definition).
  const definitionFormats = Array.isArray(link.definition?.formats_json)
    ? (link.definition!.formats_json as string[])
    : null;
  const dataFormats =
    definitionFormats && definitionFormats.length > 0
      ? definitionFormats
      : Array.isArray(link.property.data_formats_json)
        ? (link.property.data_formats_json as string[])
        : [];
  return {
    property_id: link.property_id,
    name: link.property.name,
    payload_key: link.payload_key?.trim() || link.property.name,
    data_type: link.property.data_type,
    data_formats: dataFormats,
    required: link.required,
    role: (link.role as EventCardProperty['role']) ?? 'normal',
    allowed_values: allowedValues,
    item_schema: Array.isArray(link.property.item_schema_json) ? (link.property.item_schema_json as EventCardProperty['item_schema']) : null,
    example: jsonSampleValueForProperty(toAttachedPropertyForCodegen(link)),
    description: link.definition?.description?.trim() || link.property.description || null,
    pii: link.property.pii,
    definition_id: link.definition?.id ?? null,
    definition_name: link.definition?.name ?? null,
    kind,
    derivation,
    category: classifyProperty({ scope: link.property.scope, name: link.property.name, category_override: link.property.category_override }),
    datalayer_path: method === 'client_web' ? dataLayerPath(kind, link.payload_key?.trim() || link.property.name, derivation) : null,
    bundle: bundleNameByPropertyId?.get(link.property_id) ?? null,
    catalog_field: link.property.mapped_catalog_field_id ? (catalogFieldLabelById?.get(link.property.mapped_catalog_field_id) ?? null) : null,
  };
}

/** WARNING 4 fix round: this variant's own `expiration_json` override, or `null` when it has none
 * (the variant then follows the event/project-level `EventCard.expiration`). */
function variantExpiration(variant: VariantRow): EventCard['expiration'] | null {
  const raw = variant.expiration_json as EventCard['expiration']['effective'] | null;
  if (!raw) return null;
  return { effective: raw, source: 'variant' };
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
    required_keys: attached.filter((p) => p.required).map((p) => p.property_name),
    expiration: variantExpiration(variant),
  };
}

function computeExpiration(event: EventRow, project: ProjectDAL.ProjectRow): EventCard['expiration'] {
  const eventExpiration = event.expiration_json as EventCard['expiration']['effective'];
  if (eventExpiration) return { effective: eventExpiration, source: 'event' };
  const projectDefault = project.default_expiration_json as EventCard['expiration']['effective'];
  if (projectDefault) return { effective: projectDefault, source: 'project' };
  return { effective: null, source: null };
}

/** Builds the full `EventCard` for one event (plan "Event card and tracking document"). `ctx` is
 * the shared, project-wide context (WARNING 5 fix round); omit it for a single-event call (the
 * `GET /events/:id/card` route), which then builds its own one-off context. */
export function buildEventCard(projectId: string, eventId: string, ctx?: EventCardBuildContext): EventCard {
  const context = ctx ?? buildEventCardContext(projectId);
  const { event, properties } = EventDAL.getEventWithProperties(projectId, eventId, context.definitionsById);
  const project = context.project;
  const variants = VariantDAL.listVariants(projectId, eventId);
  const mappingsForEvent = context.allMappings.filter((m) => m.event_id === eventId);
  const standardEventByVariantId = new Map(
    context.allMappings.filter((m) => m.variant_id).map((m) => [m.variant_id as string, m.standard_event])
  );
  const variantNameById = context.variantNameById;

  const propertyNameById = new Map(properties.map((link) => [link.property_id, link.property.name]));
  const nameOf = context.nameOf;
  const eventNameById = context.eventNameById;

  const openFindingsForEvent = context.openFindingsByEventId.get(eventId) ?? [];
  const acknowledgedFindingsForEvent = context.acknowledgedFindingsByEventId.get(eventId) ?? [];
  const quality = { ...tallyFindings(openFindingsForEvent), acknowledged: tallySeverityOnly(acknowledgedFindingsForEvent) };
  const findings = sortEventCardFindings(openFindingsForEvent.map((f) => toEventCardFinding(f, nameOf, variantNameById)));
  const openErrorFindingCount = quality.open.error;
  // D-42 (T-2-09 fix round): a person resolving a finding by hand is an acknowledgement, not a
  // fix -- it still blocks certification while the fingerprint keeps reproducing.
  const acknowledgedErrorFindingCount = quality.acknowledged.error;

  const observationsForEvent = context.observationsByEventId.get(eventId) ?? [];
  const freshness = {
    last_observation_at: observationsForEvent.length > 0 ? Math.max(...observationsForEvent.map((o) => o.timestamp)) : null,
    observation_count: observationsForEvent.length,
  };

  const certification = computeCertification({
    applicable: event.class === 'custom',
    status: event.status,
    openErrorFindingCount,
    acknowledgedErrorFindingCount,
    hasObservation: observationsForEvent.length > 0,
  });

  const contextColumns = buildContextColumns(properties);
  const contexts: EventCardContext[] = contextColumns.map((c) => ({
    property_id: c.property_id,
    property: c.name,
    payload_key: c.payload_key,
    values: c.values,
  }));

  // Already filtered to this event (`observationsByEventId`/single-event fallback above), so this
  // is an O(this event's observations) pass, not an O(project observations) one (WARNING 5).
  const coverageObservations: CoverageObservation[] = observationsForEvent.map((o) => ({
    event_id: o.event_id,
    variant_id: o.variant_id,
    properties: o.properties,
    context_values: o.context_values,
    timestamp: o.timestamp,
  }));
  const grid = computeEventCoverage(
    eventId,
    variants.map((v) => ({ id: v.id, name: v.name })),
    contextColumns,
    coverageObservations
  );
  const coverage: EventCardCoverage = {
    rows: grid.rows,
    columns: grid.columns.map((c) => ({ property_id: c.property_id, name: c.name, payload_key: c.payload_key, values: c.values })),
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
    variant_id: rule.variant_id,
    variant_name: rule.variant_id ? variantNameById.get(rule.variant_id) ?? rule.variant_id : null,
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

  // F2 (D-63): with variants, the card's snippets show the first variant's discriminator values
  // as literals ('add', 'success'); without variants a discriminator falls back to its first allowed value.
  const attachedForCodegen =
    variants.length > 0 ? attachedPropertiesForVariant(properties, variants[0]) : properties.map(toAttachedPropertyForCodegen);
  const identifierEvent = { ...event, source_ids: (context.sourcesByEventId.get(event.id) ?? []).map((s) => s.id) };
  const identifiers = effectiveEventIdentifiers(identifierEvent, context.identityRules, context.allSources, context.identifiers);
  const codegenSnippets = buildCodegenV2(
    event.name,
    attachedForCodegen,
    {
      method: event.implementation_method,
      dlEventName: event.dl_event_name,
      eventClass: event.class,
      projectContext: context.projectContextProperties,
      hardIdKey: context.hardIdKey,
      identifierKeys: identifiers,
      identifierNone: Array.isArray(event.identifiers_json) && event.identifiers_json.length === 0,
      identifierHasSoft: context.identifiers.some((i) => i.type === 'soft' && identifiers.includes(i.name)),
      catalogLinks: catalogLinksForProperties(properties, context),
    },
    event.codegen_event_name_overrides_json as CodegenEventNameOverrides | null
  );

  return {
    id: event.id,
    name: event.name,
    business_name: event.business_name,
    class: event.class,
    implementation_method: event.implementation_method,
    dl_event_name: event.dl_event_name,
    sources: (context.sourcesByEventId.get(event.id) ?? []).map((s) => ({ id: s.id, name: s.name, system: s.system, method: s.method, color: s.color })),
    identifiers,
    identifiers_derived: identifiersAreDerived(identifierEvent, context.identityRules, context.identifiers),
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
    properties: properties.map((link) => toEventCardProperty(link, context.bundleNameByPropertyId, event.implementation_method, context.catalogFieldLabelById)),
    variants: variants.map((v) => toEventCardVariant(v, properties, propertyNameById, standardEventByVariantId)),
    standard_event_mappings: standardEventMappings,
    contexts,
    triggers: toEventCardTriggers(event.triggers_json),
    coverage,
    rules,
    derived_metrics: event.derived_metrics_json,
    not_suitable_for: event.not_suitable_for,
    use_cases,
    freshness,
    quality,
    findings,
    agent_instructions: event.agent_instructions,
    codegen: codegenSnippets,
    sdk_default_properties: [...SDK_DEFAULT_PROPERTIES],
  };
}

/** `GET /events/:id/certification`: the `certification` block alone, without building the rest of the card (T-2-08 route). */
export function computeEventCertification(projectId: string, eventId: string): EventCard['certification'] {
  return buildEventCard(projectId, eventId).certification;
}

/**
 * Every event's `certification` in one project-wide pass (T-2-09, plan "Events table: certified
 * column ... fed by ... a batched endpoint ... computed via the EventCardBuildContext so it stays
 * one pass"): reuses the same `EventCardBuildContext` inputs `buildEventCard` uses for one event's
 * certification (open error findings, observation presence) without building every event's full
 * card (rules, use cases, coverage grid, codegen -- all unused by `GET /events`'s `certified`
 * column). `GET /events` (`routes/events.ts`) merges this into the list response.
 */
export function computeCertificationsForProject(projectId: string, ctx?: EventCardBuildContext): Map<string, EventCard['certification']> {
  const context = ctx ?? buildEventCardContext(projectId);
  const result = new Map<string, EventCard['certification']>();
  for (const event of context.events) {
    const openFindingsForEvent = context.openFindingsByEventId.get(event.id) ?? [];
    const openErrorFindingCount = openFindingsForEvent.filter((f) => f.severity === 'error').length;
    const acknowledgedFindingsForEvent = context.acknowledgedFindingsByEventId.get(event.id) ?? [];
    const acknowledgedErrorFindingCount = acknowledgedFindingsForEvent.filter((f) => f.severity === 'error').length;
    const observationsForEvent = context.observationsByEventId.get(event.id) ?? [];
    result.set(
      event.id,
      computeCertification({
        applicable: event.class === 'custom',
        status: event.status,
        openErrorFindingCount,
        acknowledgedErrorFindingCount,
        hasObservation: observationsForEvent.length > 0,
      })
    );
  }
  return result;
}

/** `GET /events/:id/coverage`: the full per-event grid (row/column/cell detail), distinct from the card's summary counts. */
export function computeEventCoverageGrid(projectId: string, eventId: string) {
  const { properties } = EventDAL.getEventWithProperties(projectId, eventId);
  const variants = VariantDAL.listVariants(projectId, eventId);
  const contextColumns = buildContextColumns(properties);
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

/**
 * Every currently-open finding of `ctx` whose `event_id` is `null`, or names an event not present
 * in `ctx.events` (fix round 2: `TrackingDocument.unattached_findings`, and the HTML export's "Open
 * findings without an event" table -- one call, shared by both, no second findings query). Same row
 * shape and sort as `EventCard.findings`.
 */
export function buildUnattachedFindings(ctx: EventCardBuildContext): EventCardFinding[] {
  const eventIds = new Set(ctx.events.map((e) => e.id));
  return sortEventCardFindings(
    ctx.openFindings
      .filter((f) => !f.event_id || !eventIds.has(f.event_id))
      .map((f) => toEventCardFinding(f, ctx.nameOf, ctx.variantNameById))
  );
}

/** `GET /export/tracking-document.json` per the schema, `version: 1` (D-34). Custom events first,
 * then sdk/platform (plan: "events: EventCard[] (custom first, then sdk/platform with a reduced
 * card)"). Builds one `EventCardBuildContext` (WARNING 5 fix round) and reuses it for every card
 * plus the mapping/variant lookups below, instead of a fresh project-wide pass per event. */
export function buildTrackingDocument(projectId: string): TrackingDocument {
  const project = ProjectDAL.getProjectWithClient(projectId);
  const ctx = buildEventCardContext(projectId);
  const events = ctx.events;
  const orderedEventIds = [...events.filter((e) => e.class === 'custom'), ...events.filter((e) => e.class !== 'custom')].map((e) => e.id);
  const eventCards = orderedEventIds.map((id) => buildEventCard(projectId, id, ctx));

  // D-62 (T-4-11B): the project's sources with how many events use each.
  const sourceRows = SourceDAL.listSources(projectId);
  const eventSourceCounts = new Map<string, number>();
  for (const linked of ctx.sourcesByEventId.values()) {
    for (const s of linked) eventSourceCounts.set(s.id, (eventSourceCounts.get(s.id) ?? 0) + 1);
  }

  const allPropertyRows = PropertyDAL.listProperties(projectId);
  const customerPropertyRows = allPropertyRows.filter((p) => p.scope === 'customer');
  const eventPropertyRows = allPropertyRows.filter((p) => p.scope === 'event');
  // Fix round WARNING 3: one batched query for every customer property's definitions, not one
  // `listDefinitions` call per property.
  const customerDefinitionsByPropertyId = new Map<string, PropertyDefinitionDAL.PropertyDefinitionRow[]>();
  for (const [, def] of PropertyDefinitionDAL.listAllDefinitionsById(projectId)) {
    const list = customerDefinitionsByPropertyId.get(def.property_id) ?? [];
    list.push(def);
    customerDefinitionsByPropertyId.set(def.property_id, list);
  }
  for (const list of customerDefinitionsByPropertyId.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  const definitionsOf = (propertyId: string) =>
    (customerDefinitionsByPropertyId.get(propertyId) ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      allowed_values: Array.isArray(d.allowed_values_json)
        ? (d.allowed_values_json as { value: string; label?: string | null; standard_event?: string | null }[]).map((v) => ({
            value: v.value,
            label: v.label ?? null,
            standard_event: v.standard_event ?? null,
          }))
        : null,
      formats: Array.isArray(d.formats_json) ? (d.formats_json as string[]) : [],
      example_values: d.example_values_json,
    }));

  const usedInEvents = new Map<string, Set<string>>();
  for (const card of eventCards) {
    for (const link of card.properties) {
      const set = usedInEvents.get(link.property_id) ?? new Set<string>();
      set.add(card.name);
      usedInEvents.set(link.property_id, set);
    }
  }

  const eventProperties = eventPropertyRows.map((p) => ({
    property_id: p.id,
    category: classifyProperty(p),
    kind: p.kind,
    name: p.name,
    data_type: p.data_type,
    data_formats: Array.isArray(p.data_formats_json) ? (p.data_formats_json as string[]) : [],
    description: p.description,
    used_in_events: [...(usedInEvents.get(p.id) ?? [])].sort((a, b) => a.localeCompare(b)),
    definitions: definitionsOf(p.id),
  }));

  const customerProperties = customerPropertyRows.map((p) => ({
    property_id: p.id,
    category: classifyProperty(p),
    name: p.name,
    data_type: p.data_type,
    data_formats: Array.isArray(p.data_formats_json) ? (p.data_formats_json as string[]) : [],
    bloomreach_customer_property: p.bloomreach_customer_property,
    pii: p.pii,
    description: p.description,
    definitions: definitionsOf(p.id),
  }));

  const flowByRuleId = new Map(ctx.identificationFlow.rules.map((r) => [r.rule_id, r]));
  const identityRules = ctx.identityRules.map((r) => {
    const flowRule = flowByRuleId.get(r.id);
    return {
      identifier_name: r.identifier_name,
      identity_type: r.identity_type,
      name: r.name,
      transformations: r.transformations_json,
      sdk_call: r.sdk_call,
      trigger_text: r.trigger_text,
      set_by: flowRule?.set_by ?? { kind: 'unknown' as const },
      binds: flowRule?.binds ?? [],
      carried_by: (flowRule?.carried_by ?? []).map((e) => e.name),
    };
  });

  const consentCategories = ConsentCategoryDAL.listConsentCategories(projectId).map((c) => ({
    id: c.id,
    name: c.name,
    standard_key: c.standard_key,
    status: c.status,
  }));

  // D-64 (T-4-20): a catalog with its fields and the properties that look up into it. `owner`,
  // `client_name` and `priority` are left out; `source_system`/`sync_method` stay (client-facing).
  const catalogFieldNameById = new Map<string, string>();
  const catalogIdByFieldId = new Map<string, string>();
  const catalogs = CatalogDAL.listCatalogs(projectId).map((c) => {
    const fields = CatalogDAL.listCatalogFields(projectId, c.id);
    for (const f of fields) {
      catalogFieldNameById.set(f.id, f.name);
      catalogIdByFieldId.set(f.id, c.id);
    }
    return {
      id: c.id,
      name: c.name,
      mapping_role: c.mapping_role,
      status: c.status,
      description: c.description,
      source_system: c.source_system,
      sync_method: c.sync_method,
      update_frequency: c.update_frequency,
      catalog_type: c.catalog_type,
      purpose: c.purpose,
      kind: c.kind,
      market: c.market,
      language: c.language,
      version: c.version,
      live_at: c.live_at,
      searchable_count: fields.filter((f) => f.is_searchable).length,
      lookup_key: fields.find((f) => f.is_lookup_key)?.name ?? null,
      fields: fields.map((f) => ({
        name: f.name,
        description: f.description,
        data_type: f.data_type,
        is_lookup_key: f.is_lookup_key,
        is_searchable: f.is_searchable,
        is_required: f.is_required,
      })),
      mapped_properties: PropertyDAL.listPropertiesLookingUpCatalog(projectId, c),
    };
  });

  const labelFor = buildTargetLabelResolver(projectId);
  const useCases = UseCaseDAL.listUseCases(projectId).map((uc) => {
    const requirements = RequirementDAL.listRequirements(projectId, uc.id);
    return {
      id: uc.id,
      code: uc.code,
      name: uc.name,
      type: uc.type,
      status: uc.status,
      narrative: uc.narrative,
      requirements: requirements.map((r) => ({
        id: r.id,
        target_label: labelFor(r),
        level: r.level,
        status: r.status,
        target_kind: r.target_kind,
        event_id: r.event_id,
        property_id: r.property_id,
        variant_id: r.variant_id,
        catalog_id: r.catalog_field_id ? catalogIdByFieldId.get(r.catalog_field_id) ?? null : null,
        consent_category_id: r.consent_category_id,
      })),
      // D-59 amendment 1 (additive). `internal_notes`/`internal_url` never appear here (amendment 2).
      documentation_url: uc.documentation_url,
    };
  });

  const standardEventMappings = ctx.allMappings.map((m) => ({
    standard_event: m.standard_event,
    event_name: ctx.eventNameById.get(m.event_id) ?? m.event_id,
    variant_name: m.variant_id ? ctx.variantNameById.get(m.variant_id) ?? m.variant_id : null,
    field_map: Object.fromEntries(
      Object.entries(m.field_map_json).map(([field, propertyId]) => [field, propertyId ? ctx.nameOf(m.event_id, propertyId) : null])
    ),
  }));

  const findingsSummary = tallyFindings(ctx.openFindings);
  const unattachedFindings = buildUnattachedFindings(ctx);

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
      naming_convention: project.naming_convention,
      default_source: project.default_source_id ? (sourceRows.find((s) => s.id === project.default_source_id)?.name ?? null) : null,
    },
    events: eventCards,
    properties: customerProperties,
    event_properties: eventProperties,
    identifiers: ctx.identifiers.map((i) => ({
      name: i.name,
      type: i.type,
      description: i.description,
      is_cookie: i.is_cookie,
      acts: ctx.identityRules.filter((r) => r.identifier_id === i.id).map((r) => r.name),
    })),
    identity_rules: identityRules,
    identification_flow: ctx.identificationFlow.paragraph,
    identity_codegen: buildIdentityCodegen(listIdentityRulesForCodegen(projectId), customerPropertyRows),
    consent_categories: consentCategories,
    catalogs,
    sources: sourceRows.map((s) => ({ id: s.id, name: s.name, system: s.system, method: s.method, color: s.color, event_count: eventSourceCounts.get(s.id) ?? 0 })),
    use_cases: useCases,
    standard_event_mappings: standardEventMappings,
    findings_summary: findingsSummary,
    unattached_findings: unattachedFindings,
    limits: {
      event_types: { count: eventTypeLimit.count, limit: eventTypeLimit.limit },
      max_properties_per_event: propertyLimits.map((p) => ({ event_id: p.event_id, event_name: p.event_name, count: p.count, limit: p.limit })),
    },
  };
}

/**
 * Deep-strips every object key starting with `internal_` (any depth, arrays included). Forward
 * compatible with T-4-08's `internal_notes`/`internal_url` on templates/use cases -- neither field
 * exists on `TrackingDocument` yet, but this walk needs no update once they land, matching the D-48
 * amendment's "any internal_* field at any depth" wording rather than an explicit field list here.
 */
function stripInternalKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripInternalKeysDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (key.startsWith('internal_')) continue;
      out[key] = stripInternalKeysDeep(source[key]);
    }
    return out as T;
  }
  return value;
}

/**
 * Public projection of `TrackingDocument` (D-48 amendment, fix round, 2026-09-28): the shape a
 * `GET /api/shared/:token/tracking-document.json` response is allowed to carry. Strips, in addition
 * to the deep `internal_*` sweep above: `project.bloomreach_project_url` (the internal Bloomreach
 * console link), and per event `identity_note`, `owners` and `agent_instructions` (QA-agent prompts,
 * never meant for a client). `not_suitable_for` is deliberately kept -- it is client-facing
 * guidance, not an internal note. Never mutates `doc`; `buildTrackingDocument`'s own return value is
 * untouched (the internal route and MCP tools call it directly, without this projection).
 */
export function toPublicTrackingDocument(doc: TrackingDocument): TrackingDocument {
  const stripped = stripInternalKeysDeep(doc);
  return {
    ...stripped,
    project: { ...stripped.project, bloomreach_project_url: null },
    // agent_instructions is deleted, not nulled: the key does not exist in the public document.
    events: stripped.events.map(({ agent_instructions: _dropped, ...event }) => ({
      ...event,
      identity_note: null,
      owners: { business: null, technical: null },
    })) as unknown as TrackingDocument['events'],
  };
}
