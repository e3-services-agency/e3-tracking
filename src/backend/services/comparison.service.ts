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
import * as ObservationDAL from '../dal/observation.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as FindingDAL from '../dal/finding.dal';
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
} from '../../domain/comparison/definitionVsDataManager';
import { parseDataManagerEvents, type DataManagerEventsModel } from '../../domain/import/dataManagerEvents';
import { parseDataManagerCustomers, type DataManagerCustomersModel } from '../../domain/import/dataManagerCustomers';
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
  const events: DefEvent[] = EventDAL.listEvents(projectId).map((event) => {
    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    const defProperties: DefEventProperty[] = properties.map((link) => {
      const allowedValuesRaw = Array.isArray(link.property.allowed_values_json)
        ? (link.property.allowed_values_json as AllowedValue[])
        : [];
      return {
        property_id: link.property_id,
        name: link.property.name,
        payload_key: link.payload_key,
        role: (link.role as DefEventProperty['role']) ?? 'normal',
        required: link.required,
        data_type: link.property.data_type,
        data_formats: Array.isArray(link.property.data_formats_json) ? (link.property.data_formats_json as string[]) : [],
        allowed_values: allowedValuesRaw.length > 0 ? allowedValuesRaw.map((v) => v.value) : null,
      };
    });
    return {
      id: event.id,
      name: event.name,
      status: event.status,
      class: event.class,
      expiration: toExpirationBlock(event.expiration_json),
      properties: defProperties,
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
    return {
      id: o.id,
      event_type: o.event_type,
      event_id: resolution.event_id,
      variant_id: resolution.variant_id,
      timestamp: o.timestamp,
      properties: o.properties_json,
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
 * `DataManagerDefinitionSnapshot` for comparison 4 (T-2-04): every event's `custom`-only property
 * links (event scope) plus every customer-scope Property, both reduced to just the name/data
 * type/formats the engine compares against Data Manager. Built separately from
 * `buildDefinitionSnapshot` (comparison 3's snapshot) since the two engines need different shapes
 * of the same underlying `Event`/`Property` rows and there is no shared consumer of the combined
 * shape yet (plan's `snapshot.ts` extension is deferred to whichever later task actually needs one
 * `DefinitionSnapshot` shared by every comparison).
 */
export function buildDataManagerDefinitionSnapshot(projectId: string): DataManagerDefinitionSnapshot {
  const events: DataManagerDefinitionSnapshot['events'] = EventDAL.listEvents(projectId).map((event) => {
    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    return {
      id: event.id,
      name: event.name,
      status: event.status,
      class: event.class,
      properties: properties.map((link) => ({
        property_id: link.property_id,
        name: link.property.name,
        data_type: link.property.data_type,
        data_formats: Array.isArray(link.property.data_formats_json) ? (link.property.data_formats_json as string[]) : [],
      })),
    };
  });

  const customer_properties: DataManagerDefinitionSnapshot['customer_properties'] = PropertyDAL.listProperties(projectId, {
    scope: 'customer',
  }).map((p) => ({
    property_id: p.id,
    name: p.name,
    data_type: p.data_type,
    data_formats: Array.isArray(p.data_formats_json) ? (p.data_formats_json as string[]) : [],
  }));

  return { events, customer_properties };
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

export interface ComparisonSummary {
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
export function runComparison(projectId: string): ComparisonSummary {
  const definition = buildDefinitionSnapshot(projectId);
  const resolve = createEventResolver(projectId);
  const { observations, qaRunIdByObservationId } = buildEngineObservations(projectId, resolve);
  const dataManagerDefinition = buildDataManagerDefinitionSnapshot(projectId);
  const dataManagerEvidence = buildDataManagerEvidence(projectId);

  const runs: EngineRun[] = [
    {
      comparison: 'definition_vs_observations',
      findings: runDefinitionVsObservations(definition, observations),
      qaRunIdByObservationId,
    },
    {
      comparison: 'data_manager',
      findings: runDefinitionVsDataManager(dataManagerDefinition, dataManagerEvidence),
      qaRunIdByObservationId: null,
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

  return { open, produced, resolved, by_comparison };
}
