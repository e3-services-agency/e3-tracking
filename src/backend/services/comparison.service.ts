import { getDb } from '../db';
import * as QaReportDAL from '../dal/qa-report.dal';
import { NotFoundError,ValidationError } from '../errors';
/**
 * Multi-comparison orchestrator (T-1-09 built comparison 3 alone; T-2-04, D-21, D-28: generalized
 * to run a list of comparison engines in one recompute). Loads a `DefinitionSnapshot` and every
 * `Observation` of every non-archived `QaRun` from the DAL, re-resolves each observation's
 * `event_id`/`variant_id` against the *current* definitions (fix round ERROR 1 — a stale
 * `event_id`/`variant_id` captured at import time would otherwise never notice a later rename, a
 * newly linked discriminator, or a newly created variant) using a batched `createEventResolver`
 * (T-2-11/T-2-04: one `listEvents` call for the whole recompute instead of one per observation),
 * persists any resolution change, calls each pure engine (`src/domain/comparison/
 * definitionVsObservations.ts` for comparison 3, `definitionVsDataManager.ts` for comparison 4),
 * and upserts every engine's findings as `Finding` rows by fingerprint — reopening/refreshing a
 * matching existing row.
 *
 * Per-comparison stale resolution (T-2-04): `FindingDAL.resolveStaleFindings` is scoped by
 * `comparison`, so each engine's produced fingerprints only resolve *that engine's own* previously
 * open findings — a finding from comparison 3 is never resolved by comparison 4's recompute (a
 * different engine simply never mentions it) and vice versa, even though both run in the same
 * `runComparison` call.
 *
 * D-21 is explicit that `runComparison` always recomputes over *every* non-archived run of the
 * project — comparison 3's findings are a project-wide, deterministic snapshot, not scoped to
 * whichever run/event triggered the recompute. The `scope` parameter (plan "API shape": `POST
 * /comparison/run` takes `{event?, qa_run_id?}`) is accepted for the caller's convenience (e.g. "I
 * just applied this run, show me what changed") but never narrows *what gets computed* — it would
 * otherwise let an event's findings go stale whenever a different run's observations change
 * something about it (e.g. `shape_inconsistent`, which spans events). `event`/`qa_run_id` only
 * narrow the *returned* summary counts, computed after the full recompute.
 *
 * `Finding.qa_run_id` semantics (fix round ERROR 2): the fingerprint (`src/domain/comparison/
 * definitionVsObservations.ts`'s `fp()`) never includes a run id, so a fingerprint's identity — and
 * therefore whether a recompute reopens/resolves it — stays stable regardless of which run's
 * observations happen to produce it on a given run of the engine. `qa_run_id` is a *separate*,
 * best-effort "which run last produced this" pointer, overwritten on every recompute (not sticky):
 * for a finding kind that is anchored to one observation (`missing_required`, `type_mismatch`,
 * `format_violation`, `enum_violation`, `unknown_variant`, `unexpected_property`, `unexpected_event`,
 * `rounding_drift`, `expiration_mismatch`) it is that observation's `qa_run_id`; for a finding kind
 * that is inherently project-wide and not attributable to a single run (`missing_event` — zero
 * observations in scope, by definition no run produced it; `shape_inconsistent` — spans every run's
 * observations of a payload key by design; every comparison-4 finding — Data Manager evidence is
 * never anchored to an observation at all) it is always `null`. This is what lets the Import page's
 * post-apply landing and QaRuns' "View findings for this run" filter the Findings page down to "the
 * findings this run's observations are currently implicated in", without making the finding rows
 * themselves scoped to a run (D-21 forbids that).
 */
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as PropertyDefinitionDAL from '../dal/property-definition.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as FindingDAL from '../dal/finding.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as RuleDAL from '../dal/rule.dal';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as SourceDAL from '../dal/source.dal';
import * as IdentifierDAL from '../dal/identifier.dal';
import { effectiveEventIdentifiers } from '../../domain/identity/identifiers';
import { createEventResolver } from './eventResolution';
import {
  runDefinitionVsObservations,
  type DefEvent,
  type DefEventProperty,
  type DefVariant,
  type DefinitionSnapshot,
  type EngineFinding,
  type EngineObservation,
  type ExpirationBlock,
  type StandardMappingRef,
} from '../../domain/comparison/definitionVsObservations';
import {
  runDefinitionVsDataManager,
  type DataManagerDefinitionSnapshot,
  type DataManagerEvidence,
  type DmDefCustomerProperty,
} from '../../domain/comparison/definitionVsDataManager';
import { runDefinitionVsMapping, type DefinitionVsMappingInput } from '../../domain/comparison/definitionVsMapping';
import { runMappingVsObservations } from '../../domain/comparison/mappingVsObservations';
import { runCatalogChecks, type CatalogCheckInput } from '../../domain/comparison/catalogChecks';
import { toDataManagerDefinitionSnapshot, buildMappingSnapshotFromDefinition, type MappingSnapshot, type DefConsentCategory } from '../../domain/comparison/snapshot';
import { buildStateListChecks, runStateListChecks } from '../../domain/rules/stateLists';
import { runRules, runItemSchemaChecks, type ItemSchemaCheck, type RulesEngineRule } from '../../domain/rules/runRules';
import { refKey } from '../../domain/rules/types';
import type { ItemSchemaField, RulePropertyRef, RuleSnapshot } from '../../domain/rules/types';
import { parseDataManagerEvents, type DataManagerEventsModel } from '../../domain/import/dataManagerEvents';
import { parseDataManagerCustomers, type DataManagerCustomersModel } from '../../domain/import/dataManagerCustomers';
import { mergeStandardEvents, mergeConsentKeys, STANDARD_CUSTOMER_PROPERTIES, type StandardEventSeed } from '../../domain/bloomreach';
import type { AllowedValue } from '../dal/property.dal';
import type { ComparisonId, FindingKind } from '../../domain/enums';

/** Finding kinds that are inherently project-wide, not attributable to a single QaRun (see the module comment). */
const PROJECT_LEVEL_FINDING_KINDS: ReadonlySet<FindingKind> = new Set(['missing_event', 'shape_inconsistent']);

function toExpirationBlock(value: unknown): ExpirationBlock | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    count: typeof v.count === 'number' ? v.count : null,
    units: (v.units as ExpirationBlock['units']) ?? null,
  };
}

export function buildDefinitionSnapshot(projectId: string): DefinitionSnapshot {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  // Fix round WARNING 3: one query for every definition in the project, reused for every event's
  // `getEventWithProperties` call below instead of one definition query per link.
  const definitionsById = PropertyDefinitionDAL.listAllDefinitionsById(projectId);
  const identityRules = IdentityRuleDAL.listIdentityRules(projectId);
  const allSources = SourceDAL.listSources(projectId);
  const sourcesByEventId = SourceDAL.listEventSourcesByProject(projectId);
  const events: DefEvent[] = EventDAL.listEvents(projectId).map((event) => {
    const { properties } = EventDAL.getEventWithProperties(projectId, event.id, definitionsById);
    const defProperties: DefEventProperty[] = properties.map((link) => {
      // D-58: allowed values and format are per-event, read from the link's own definition
      // (falling back to the shared Property's fields when the link carries no definition --
      // defensive only, every link is resolved to a real definition by the DAL). This is what lets
      // `action: accept` be an `enum_violation` on `cart_update` (allowed `add`/`remove`) but pass
      // on `consent` (allowed `accept`/`reject`) even though both link the same `action` property.
      const definitionAllowedRaw = Array.isArray(link.definition?.allowed_values_json)
        ? (link.definition!.allowed_values_json as AllowedValue[])
        : null;
      const allowedValuesRaw =
        definitionAllowedRaw ??
        (Array.isArray(link.property.allowed_values_json) ? (link.property.allowed_values_json as AllowedValue[]) : []);
      // Fix round ERROR 1: `formats_json` is the definition's *whole* format list (a property can
      // carry several, e.g. `email` and `uri` both ticked), not a single scalar -- every one of
      // them must be checked, not just the first.
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
        payload_key: link.payload_key,
        role: (link.role as DefEventProperty['role']) ?? 'normal',
        required: link.required,
        data_type: link.property.data_type,
        data_formats: dataFormats,
        allowed_values: allowedValuesRaw.length > 0 ? allowedValuesRaw.map((v) => v.value) : null,
        // T-2-05: carried through for `definitionVsMapping.ts`'s `unmapped_standard_event` check.
        allowed_value_hints:
          allowedValuesRaw.length > 0
            ? allowedValuesRaw.map((v) => ({ value: v.value, standard_event: v.standard_event ?? null }))
            : undefined,
        // T-2-05 fix round Finding 1: carried through so `buildRuleSnapshot`/`buildItemSchemaChecks`
        // never need a second `getEventWithProperties` read.
        item_schema: Array.isArray(link.property.item_schema_json)
          ? (link.property.item_schema_json as DefEventProperty['item_schema'])
          : null,
        // D-63 (T-4-17): read by rules/stateLists.ts only.
        kind: link.property.kind,
        derivation: link.property.derivation_json,
        category_override: link.property.category_override ?? null,
      };
    });
    return {
      id: event.id,
      name: event.name,
      status: event.status,
      class: event.class,
      expiration: toExpirationBlock(event.expiration_json),
      properties: defProperties,
      identifiers: effectiveEventIdentifiers(
        { ...event, source_ids: (sourcesByEventId.get(event.id) ?? []).map((s) => s.id) },
        identityRules,
        allSources,
        IdentifierDAL.listIdentifiers(projectId)
      ),
    };
  });

  const variants: DefVariant[] = VariantDAL.listVariantsByProject(projectId).map((v) => ({
    id: v.id,
    event_id: v.event_id,
    name: v.name,
    conditions: v.conditions_json,
    expiration: toExpirationBlock(v.expiration_json),
  }));

  const standardEventMappings: StandardMappingRef[] = StandardEventMappingDAL.listStandardEventMappings(projectId).map(
    (m) => ({
      standard_event: m.standard_event,
      event_id: m.event_id,
      variant_id: m.variant_id,
      field_map: m.field_map_json,
    })
  );

  return {
    project_default_expiration: toExpirationBlock(project.default_expiration_json),
    events,
    variants,
    standard_event_mappings: standardEventMappings,
  };
}

/**
 * Re-resolves every observation in scope (every non-archived run) against the *current*
 * definitions and persists any change (fix round ERROR 1), then builds the engine's input. Returns
 * both the `EngineObservation[]` and a `qa_run_id` lookup by observation id, so `runComparison` can
 * stamp each produced finding with "which run's observation last produced this" (ERROR 2).
 *
 * `resolve` (T-2-04, D-21 "Batched resolution"): the caller's `createEventResolver(projectId)`
 * instance, built once per `runComparison` call — resolving every observation in scope this way
 * issues one `listEvents` call total instead of one per observation (measured: ~8.7 statements per
 * observation before this change). Exposed as a required parameter, not built internally, so a
 * single resolver instance can also be reused by the customer-events import
 * (`customerEventsExportImport.service.ts`), which resolves observations before any `QaRun` (and
 * therefore this function) exists.
 */
export function buildEngineObservations(
  projectId: string,
  resolve: (eventType: string, properties: Record<string, unknown>) => { event_id: string | null; variant_id: string | null }
): { observations: EngineObservation[]; qaRunIdByObservationId: Map<string, string> } {
  const runs = new Map(QaRunDAL.listNonArchivedQaRuns(projectId).map((r) => [r.id, r]));
  const rows = ObservationDAL.listObservations(projectId, { archived: false }).filter((o) => runs.has(o.qa_run_id));

  const qaRunIdByObservationId = new Map<string, string>();
  const observations: EngineObservation[] = rows.map((o) => {
    qaRunIdByObservationId.set(o.id, o.qa_run_id);
    const resolution = resolve(o.event_type, o.properties_json);
    if (resolution.event_id !== o.event_id || resolution.variant_id !== o.variant_id) {
      ObservationDAL.updateObservationResolution(projectId, o.id, resolution.event_id, resolution.variant_id);
    }
    // D-67: an observation that records `customer_ids` (an object in its properties) is checked by
    // comparison 3's identifier_missing; the object is not a property of the event itself.
    const { customer_ids: rawIds, ...restProperties } = o.properties_json;
    const hasIds = typeof rawIds === 'object' && rawIds !== null && !Array.isArray(rawIds);
    return {
      id: o.id,
      event_type: o.event_type,
      event_id: resolution.event_id,
      variant_id: resolution.variant_id,
      timestamp: o.timestamp,
      properties: hasIds ? restProperties : o.properties_json,
      ...(hasIds ? { customer_ids: rawIds as Record<string, unknown> } : {}),
      run_kind: runs.get(o.qa_run_id)?.kind ?? 'manual',
    };
  });
  return { observations, qaRunIdByObservationId };
}

/** `Finding.qa_run_id` per the module comment: `null` for project-level kinds, else the producing observation's run. */
function qaRunIdForFinding(finding: EngineFinding, qaRunIdByObservationId: Map<string, string>): string | null {
  if (PROJECT_LEVEL_FINDING_KINDS.has(finding.kind)) return null;
  if (!finding.observation_id) return null;
  return qaRunIdByObservationId.get(finding.observation_id) ?? null;
}

/**
 * `DataManagerDefinitionSnapshot` for comparison 4 (T-2-04, T-2-05 delta). T-2-05 fix (T-2-04
 * review LOW: "one recompute now calls `listEvents` three times"): derived by the pure
 * `snapshot.ts#toDataManagerDefinitionSnapshot` from the *already-loaded* comparison-3
 * `DefinitionSnapshot` instead of re-querying `EventDAL.listEvents`/`getEventWithProperties` —
 * `DefEventProperty` is a strict superset of what comparison 4 needs. Customer-scope properties
 * still need their own `PropertyDAL.listProperties(scope: 'customer')` read (a different table,
 * not part of the `listEvents` duplication this fix removes).
 */
export function buildDataManagerDefinitionSnapshot(projectId: string, definition: DefinitionSnapshot): DataManagerDefinitionSnapshot {
  const customer_properties: DmDefCustomerProperty[] = PropertyDAL.listProperties(projectId, {
    scope: 'customer',
  }).map((p) => ({
    property_id: p.id,
    name: p.name,
    data_type: p.data_type,
    data_formats: Array.isArray(p.data_formats_json) ? (p.data_formats_json as string[]) : [],
  }));

  return toDataManagerDefinitionSnapshot(definition, customer_properties);
}

/**
 * `MappingSnapshot` for comparisons 1 and 2 (T-2-05), built from the already-loaded `definition`
 * (events/variants/standard event mappings, no extra `listEvents` call) plus the standard-event
 * seed list, consent categories and catalog existence, each a small dedicated DAL read.
 */
export function buildMappingSnapshot(projectId: string, definition: DefinitionSnapshot): MappingSnapshot {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const standardAdditions = (project.standard_event_additions_json as StandardEventSeed[] | null) ?? [];
  const allStandardEvents = mergeStandardEvents(standardAdditions);
  const consentAdditions = (project.consent_key_additions_json as string[] | null) ?? [];
  const consentKeys = mergeConsentKeys(consentAdditions);
  const consentCategories: DefConsentCategory[] = ConsentCategoryDAL.listConsentCategories(projectId).map((c) => ({
    name: c.name,
    standard_key: c.standard_key,
  }));
  const customerProps = PropertyDAL.listProperties(projectId, { scope: 'customer' });
  const customerPropertiesByStandardKey: Record<string, string | null> = {};
  for (const key of STANDARD_CUSTOMER_PROPERTIES) {
    const prop = customerProps.find((p) => p.bloomreach_customer_property === key);
    customerPropertiesByStandardKey[key] = prop ? prop.name : null;
  }
  const meta = (project.bloomreach_mapping_meta_json ?? null) as { catalogs?: { main?: string | null; variant?: string | null } } | null;
  const catalogs = { main: meta?.catalogs?.main ?? null, variant: meta?.catalogs?.variant ?? null };

  return buildMappingSnapshotFromDefinition(
    definition,
    allStandardEvents,
    consentCategories,
    consentKeys,
    customerPropertiesByStandardKey,
    catalogs
  );
}

/** `DefinitionVsMappingInput` for comparison 1 (T-2-05): the subset of `definition` plus catalog existence and consent categories. */
export function buildDefinitionVsMappingInput(projectId: string, definition: DefinitionSnapshot): DefinitionVsMappingInput {
  const consentCategories: DefConsentCategory[] = ConsentCategoryDAL.listConsentCategories(projectId).map((c) => ({
    name: c.name,
    standard_key: c.standard_key,
  }));
  return {
    events: definition.events,
    hasCatalog: CatalogDAL.listCatalogs(projectId).length > 0,
    consentCategories,
    // D-65 (T-4-22): the naming check needs the convention and the customer properties (which are
    // not linked to any event).
    namingConvention: ProjectDAL.getProjectOrThrow(projectId).naming_convention,
    customerProperties: PropertyDAL.listProperties(projectId, { scope: 'customer' }).map((p) => ({
      id: p.id,
      name: p.name,
      category_override: p.category_override ?? null,
    })),
  };
}

/** Parses the project's two stored Data Manager snapshots (T-2-04); absent snapshot -> `null` (no findings, see `definitionVsDataManager.ts`'s module comment). */
export function buildDataManagerEvidence(projectId: string): DataManagerEvidence {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const eventsSnapshot = project.data_manager_events_json as { payload?: unknown } | null;
  const customersSnapshot = project.data_manager_customers_json as { payload?: unknown } | null;
  const events: DataManagerEventsModel | null = eventsSnapshot?.payload ? parseDataManagerEvents(eventsSnapshot.payload) : null;
  const customers: DataManagerCustomersModel | null = customersSnapshot?.payload
    ? parseDataManagerCustomers(customersSnapshot.payload)
    : null;
  return { events, customers };
}

/**
 * `RuleSnapshot.propertiesById` for the whole project (T-2-07), derived from the already-loaded
 * `DefinitionSnapshot` (T-2-05 fix round Finding 1: no extra `EventDAL.listEvents`/
 * `getEventWithProperties` calls — `definition.events[].properties[]` already carries every
 * event's own linked-property rows, `payload_key` and `item_schema` included). Every event's
 * properties are covered, not just one event's — a `cross_event` rule's `child` side needs to
 * resolve a *different* event's properties than the rule's own `event_id`.
 *
 * Keyed by `refKey(event.id, property.property_id)` (T-2-05 fix round Finding 2, `types.ts`'s
 * `RuleSnapshot` doc comment), not bare `property_id`: the same `Property` row can be linked to more
 * than one event with a different per-link `payload_key` on each (D-16, e.g. `purchase_id` linked to
 * both `purchase` and `purchase_item`) — keying by `property_id` alone silently kept only whichever
 * event's link this loop visited last.
 */
export function buildRuleSnapshot(projectId: string, definition: DefinitionSnapshot): RuleSnapshot {
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const propertiesById: Record<string, RulePropertyRef> = {};
  for (const event of definition.events) {
    for (const prop of event.properties) {
      propertiesById[refKey(event.id, prop.property_id)] = {
        property_id: prop.property_id,
        payload_key: prop.payload_key ?? prop.name,
        data_type: prop.data_type,
        item_schema: (prop.item_schema as ItemSchemaField[] | null | undefined) ?? null,
      };
    }
  }
  return {
    propertiesById,
    money_tolerance_percent: project.money_tolerance_percent,
    money_tolerance_floor: project.money_tolerance_floor,
  };
}

/** Every *enabled* rule on a *custom*-class event (D-29: only custom events are validated), mapped
 * to `runRules`'s input shape (T-2-07). A disabled rule is simply omitted here — see
 * `runRules.ts`'s module comment for why that alone is enough to resolve its findings. */
export function buildRulesEngineRules(projectId: string, customEventIds: Iterable<string>): RulesEngineRule[] {
  const rules: RulesEngineRule[] = [];
  for (const eventId of customEventIds) {
    for (const row of RuleDAL.listRulesByEvent(projectId, eventId)) {
      if (!row.enabled) continue;
      rules.push({
        id: row.id,
        version: row.version,
        event_id: row.event_id,
        variant_id: row.variant_id,
        name: row.name,
        message: row.message,
        severity: row.severity,
        report_kind: row.report_kind as RulesEngineRule['report_kind'],
        definition: {
          kind: row.kind,
          expression: row.expression_json,
          tolerance_mode: row.tolerance_mode,
          tolerance_value: row.tolerance_value,
        },
      });
    }
  }
  return rules;
}

/** Every array-typed linked property with a non-empty `item_schema_json` on a *custom*-class event
 * (T-2-07, D-30 ItemSchema). T-2-05 fix round Finding 1: derived from the already-loaded
 * `DefinitionSnapshot`, no `getEventWithProperties` read per event. */
export function buildItemSchemaChecks(definition: DefinitionSnapshot, customEventIds: Iterable<string>): ItemSchemaCheck[] {
  const customEventIdSet = new Set(customEventIds);
  const checks: ItemSchemaCheck[] = [];
  for (const event of definition.events) {
    if (!customEventIdSet.has(event.id)) continue;
    for (const prop of event.properties) {
      const itemSchema = (prop.item_schema as ItemSchemaField[] | null | undefined) ?? null;
      if (prop.data_type !== 'array' || !itemSchema || itemSchema.length === 0) continue;
      checks.push({
        event_id: event.id,
        property_id: prop.property_id,
        property_name: prop.name,
        payload_key: prop.payload_key ?? prop.name,
        item_schema: itemSchema,
      });
    }
  }
  return checks;
}

/**
 * Input of the `catalogs` comparison (D-61, T-4-11B): every catalog with its fields, plus every
 * property (for the linked-field type check and the id-property link check).
 */
export function buildCatalogCheckInput(projectId: string): CatalogCheckInput {
  const catalogs = CatalogDAL.listCatalogs(projectId).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    market: c.market,
    language: c.language,
    version: c.version,
    live_at: c.live_at,
    searchable_snapshot: c.searchable_snapshot_json,
    fields: CatalogDAL.listCatalogFields(projectId, c.id).map((f) => ({
      id: f.id,
      name: f.name,
      data_type: f.data_type,
      is_lookup_key: f.is_lookup_key,
      is_searchable: f.is_searchable,
      client_field_name: f.client_field_name,
      bloomreach_column: f.bloomreach_column,
    })),
  }));
  const properties = PropertyDAL.listProperties(projectId).map((p) => ({
    id: p.id,
    name: p.name,
    scope: p.scope,
    data_type: p.data_type,
    mapped_catalog_id: p.mapped_catalog_id,
    mapped_catalog_field_id: p.mapped_catalog_field_id,
  }));
  return { catalogs, properties };
}

export interface ComparisonSummary {
  report_id?: string;
  report_sequence?: number;
  open: Record<string, number>;
  produced: number;
  resolved: number;
  /** Per-comparison `{open, produced, resolved}`, same shape as the totals (T-2-04). */
  by_comparison: Record<string, { open: Record<string, number>; produced: number; resolved: number }>;
}

/** One comparison engine's findings for one `runComparison` call, ready to upsert. */
interface EngineRun {
  comparison: ComparisonId;
  findings: EngineFinding[];
  /** `null` for engines that never anchor a finding to an observation (comparison 4: nothing to stamp). */
  qaRunIdByObservationId: Map<string, string> | null;
}

function upsertAndResolve(projectId: string, run: EngineRun): { open: Record<string, number>; produced: number; resolved: number } {
  const producedFingerprints: string[] = [];
  for (const finding of run.findings) {
    FindingDAL.upsertFinding(projectId, {
      comparison: finding.comparison,
      kind: finding.kind,
      severity: finding.severity,
      event_id: finding.event_id,
      variant_id: finding.variant_id,
      property_id: finding.property_id,
      observation_id: finding.observation_id,
      qa_run_id: run.qaRunIdByObservationId ? qaRunIdForFinding(finding, run.qaRunIdByObservationId) : null,
      expected_json: finding.expected_json,
      actual_json: finding.actual_json,
      message: finding.message,
      fingerprint: finding.fingerprint,
    });
    producedFingerprints.push(finding.fingerprint);
  }
  const openBefore = FindingDAL.listFindings(projectId, { comparison: run.comparison, status: 'open' });
  const staleCount = openBefore.filter((f) => !producedFingerprints.includes(f.fingerprint)).length;
  FindingDAL.resolveStaleFindings(projectId, run.comparison, producedFingerprints);

  const openAfter = FindingDAL.listFindings(projectId, { comparison: run.comparison, status: 'open' });
  const open: Record<string, number> = { error: 0, warning: 0, info: 0 };
  for (const f of openAfter) open[f.severity] = (open[f.severity] ?? 0) + 1;

  return { open, produced: producedFingerprints.length, resolved: staleCount };
}

/**
 * Orchestrator (T-2-04, D-21, D-28): recomputes every comparison engine over the whole project in
 * one call and upserts/resolves `Finding` rows, each engine's stale resolution scoped to its own
 * `comparison` id (see module comment). Returns both the project-wide totals (unchanged shape,
 * `open`/`produced`/`resolved`) and `by_comparison`, keyed by `ComparisonId`.
 */
export function runComparison(projectId: string, options: {captureReport?: boolean;event?:string;qa_run_id?:string} = {}): ComparisonSummary {
 return getDb().transaction(() => {
 ProjectDAL.getProjectOrThrow(projectId);
 for(const key of ['event','qa_run_id'] as const)if(options[key]!==undefined&&(typeof options[key]!=='string'||!options[key]!.trim()))throw new ValidationError(`${key} must be a nonempty identifier.`,key);
 if(options.event && !EventDAL.getEventById(projectId,options.event))throw new NotFoundError('Event not found.');
 if(options.qa_run_id && !QaRunDAL.getQaRunById(projectId,options.qa_run_id))throw new NotFoundError('QA run not found.');
 const previous=FindingDAL.listFindings(projectId);

  // T-2-05: `definition` is the one `EventDAL.listEvents` call for the whole recompute; every other
  // engine's own snapshot (`dataManagerDefinition`, `mappingSnapshot`, `definitionVsMappingInput`) is
  // derived from it purely, or reads a different, small table (customer properties, consent
  // categories, catalogs) — never a second `listEvents` (T-2-04 review LOW, snapshot builder spy test).
  const definition = buildDefinitionSnapshot(projectId);
  const resolve = createEventResolver(projectId);
  const { observations, qaRunIdByObservationId } = buildEngineObservations(projectId, resolve);
  const dataManagerDefinition = buildDataManagerDefinitionSnapshot(projectId, definition);
  const dataManagerEvidence = buildDataManagerEvidence(projectId);
  const mappingSnapshot = buildMappingSnapshot(projectId, definition);
  const definitionVsMappingInput = buildDefinitionVsMappingInput(projectId, definition);

  // T-2-07: the rules evaluator and item schema checks run as part of `definition_vs_observations`
  // (plan "Rules evaluator" / "T-2-07"), not a separate comparison — their findings are merged
  // into the same engine's output array before upsert, so they share its stale-fingerprint
  // resolution scope.
  const customEventIds = definition.events.filter((e) => e.class === 'custom').map((e) => e.id);
  const ruleSnapshot = buildRuleSnapshot(projectId, definition);
  const rulesEngineRules = buildRulesEngineRules(projectId, customEventIds);
  const itemSchemaChecks = buildItemSchemaChecks(definition, customEventIds);
  const stateListChecks = buildStateListChecks(definition, customEventIds);

  const runs: EngineRun[] = [
    {
      comparison: 'definition_vs_observations',
      findings: [
        ...runDefinitionVsObservations(definition, observations),
        ...runRules(rulesEngineRules, observations, ruleSnapshot),
        ...runItemSchemaChecks(itemSchemaChecks, observations),
        ...runStateListChecks(stateListChecks, observations),
      ],
      qaRunIdByObservationId,
    },
    {
      comparison: 'data_manager',
      findings: runDefinitionVsDataManager(dataManagerDefinition, dataManagerEvidence),
      qaRunIdByObservationId: null,
    },
    {
      comparison: 'definition_vs_mapping',
      findings: runDefinitionVsMapping(definitionVsMappingInput, mappingSnapshot),
      qaRunIdByObservationId: null,
    },
    {
      comparison: 'catalogs',
      findings: runCatalogChecks(buildCatalogCheckInput(projectId)),
      qaRunIdByObservationId: null,
    },
    {
      comparison: 'mapping_vs_observations',
      findings: runMappingVsObservations(definition.events, mappingSnapshot, observations),
      qaRunIdByObservationId,
    },
  ];

  const by_comparison: ComparisonSummary['by_comparison'] = {};
  const open: Record<string, number> = { error: 0, warning: 0, info: 0 };
  let produced = 0;
  let resolved = 0;

  for (const run of runs) {
    const summary = upsertAndResolve(projectId, run);
    by_comparison[run.comparison] = summary;
    for (const [severity, count] of Object.entries(summary.open)) open[severity] = (open[severity] ?? 0) + count;
    produced += summary.produced;
    resolved += summary.resolved;
  }

  const summary={open,produced,resolved,by_comparison};
  if(options.captureReport===false)return summary;
  const fingerprints=new Set(runs.flatMap(r=>r.findings.map(f=>f.fingerprint)));
  const before=new Map(previous.map(f=>[f.id,f]));
  const items=FindingDAL.listFindings(projectId).flatMap<{finding:FindingDAL.FindingRow;disposition:'produced'|'resolved'}>(f=>fingerprints.has(f.fingerprint)?[{finding:f,disposition:'produced' as const}]:
   before.has(f.id) && (before.get(f.id)!.status==='open'||before.get(f.id)!.resolved_by==='user') && f.status==='resolved' && f.resolved_by===null?[{finding:f,disposition:'resolved' as const}]:[]);
  const report=QaReportDAL.captureQaReport(projectId,{type:'whole_project',comparison_ids:runs.map(r=>r.comparison),requested_event_id:options.event??null,requested_qa_run_id:options.qa_run_id??null,participating_runs:QaRunDAL.listNonArchivedQaRuns(projectId).map(r=>({id:r.id,environment:r.environment,kind:r.kind,started_at:r.started_at}))},summary,items);
  return {...summary,report_id:report.id,report_sequence:report.report_sequence};
 }).immediate();
}
