/**
 * Comparison 3 orchestration (T-1-09, D-21): loads a `DefinitionSnapshot` and every `Observation`
 * of every non-archived `QaRun` from the DAL, re-resolves each observation's `event_id`/
 * `variant_id` against the *current* definitions (fix round ERROR 1 — a stale `event_id`/
 * `variant_id` captured at import time would otherwise never notice a later rename, a newly linked
 * discriminator, or a newly created variant), persists any change, calls the pure engine
 * (`src/domain/comparison/definitionVsObservations.ts`), and upserts the results as `Finding` rows
 * by fingerprint — reopening/refreshing a matching existing row, resolving any `open` finding of
 * this comparison that was not produced this run (D-21: "no manual mute").
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
 * observations of a payload key by design) it is always `null`. This is what lets the Import page's
 * post-apply landing and QaRuns' "View findings for this run" filter the Findings page down to "the
 * findings this run's observations are currently implicated in", without making the finding rows
 * themselves scoped to a run (D-21 forbids that).
 */
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as FindingDAL from '../dal/finding.dal';
import { resolveEventAndVariant } from './eventResolution';
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
import type { AllowedValue } from '../dal/property.dal';
import type { FindingKind } from '../../domain/enums';

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
 */
export function buildEngineObservations(
  projectId: string
): { observations: EngineObservation[]; qaRunIdByObservationId: Map<string, string> } {
  const runs = new Map(QaRunDAL.listNonArchivedQaRuns(projectId).map((r) => [r.id, r]));
  const rows = ObservationDAL.listObservations(projectId, { archived: false }).filter((o) => runs.has(o.qa_run_id));

  const qaRunIdByObservationId = new Map<string, string>();
  const observations: EngineObservation[] = rows.map((o) => {
    qaRunIdByObservationId.set(o.id, o.qa_run_id);
    const resolution = resolveEventAndVariant(projectId, o.event_type, o.properties_json);
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

export interface ComparisonSummary {
  open: Record<string, number>;
  produced: number;
  resolved: number;
}

/** Recomputes comparison 3 over the whole project (D-21) and upserts/resolves `Finding` rows. */
export function runComparison(projectId: string): ComparisonSummary {
  const definition = buildDefinitionSnapshot(projectId);
  const { observations, qaRunIdByObservationId } = buildEngineObservations(projectId);
  const engineFindings = runDefinitionVsObservations(definition, observations);

  const producedFingerprints: string[] = [];
  for (const finding of engineFindings) {
    FindingDAL.upsertFinding(projectId, {
      comparison: finding.comparison,
      kind: finding.kind,
      severity: finding.severity,
      event_id: finding.event_id,
      variant_id: finding.variant_id,
      property_id: finding.property_id,
      observation_id: finding.observation_id,
      qa_run_id: qaRunIdForFinding(finding, qaRunIdByObservationId),
      expected_json: finding.expected_json,
      actual_json: finding.actual_json,
      message: finding.message,
      fingerprint: finding.fingerprint,
    });
    producedFingerprints.push(finding.fingerprint);
  }
  const openBefore = FindingDAL.listFindings(projectId, { comparison: 'definition_vs_observations', status: 'open' });
  const staleCount = openBefore.filter((f) => !producedFingerprints.includes(f.fingerprint)).length;
  FindingDAL.resolveStaleFindings(projectId, 'definition_vs_observations', producedFingerprints);

  const openAfter = FindingDAL.listFindings(projectId, { comparison: 'definition_vs_observations', status: 'open' });
  const open: Record<string, number> = { error: 0, warning: 0, info: 0 };
  for (const f of openAfter) open[f.severity] = (open[f.severity] ?? 0) + 1;

  return { open, produced: producedFingerprints.length, resolved: staleCount };
}
