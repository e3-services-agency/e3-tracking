/**
 * Comparison 3 orchestration (T-1-09, D-21): loads a `DefinitionSnapshot` and every resolved
 * `Observation` of every non-archived `QaRun` from the DAL, calls the pure engine
 * (`src/domain/comparison/definitionVsObservations.ts`), and upserts the results as `Finding`
 * rows by fingerprint — reopening/refreshing a matching existing row, resolving any `open` finding
 * of this comparison that was not produced this run (D-21: "no manual mute").
 *
 * D-21 is explicit that `runComparison` always recomputes over *every* non-archived run of the
 * project — comparison 3's findings are a project-wide, deterministic snapshot, not scoped to
 * whichever run/event triggered the recompute. The `scope` parameter (plan "API shape": `POST
 * /comparison/run` takes `{event?, qa_run_id?}`) is accepted for the caller's convenience (e.g. "I
 * just applied this run, show me what changed") but never narrows *what gets computed* — it would
 * otherwise let an event's findings go stale whenever a different run's observations change
 * something about it (e.g. `shape_inconsistent`, which spans events). `event`/`qa_run_id` only
 * narrow the *returned* summary counts, computed after the full recompute.
 */
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as FindingDAL from '../dal/finding.dal';
import {
  runDefinitionVsObservations,
  type DefEvent,
  type DefEventProperty,
  type DefVariant,
  type DefinitionSnapshot,
  type EngineObservation,
  type ExpirationBlock,
  type StandardMappingRef,
} from '../../domain/comparison/definitionVsObservations';
import type { AllowedValue } from '../dal/property.dal';

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

export function buildEngineObservations(projectId: string): EngineObservation[] {
  const runs = new Map(QaRunDAL.listNonArchivedQaRuns(projectId).map((r) => [r.id, r]));
  const observations = ObservationDAL.listObservations(projectId, { archived: false });
  return observations
    .filter((o) => runs.has(o.qa_run_id))
    .map((o) => ({
      id: o.id,
      event_type: o.event_type,
      event_id: o.event_id,
      variant_id: o.variant_id,
      timestamp: o.timestamp,
      properties: o.properties_json,
      run_kind: runs.get(o.qa_run_id)?.kind ?? 'manual',
    }));
}

export interface ComparisonSummary {
  open: Record<string, number>;
  produced: number;
  resolved: number;
}

/** Recomputes comparison 3 over the whole project (D-21) and upserts/resolves `Finding` rows. */
export function runComparison(projectId: string): ComparisonSummary {
  const definition = buildDefinitionSnapshot(projectId);
  const observations = buildEngineObservations(projectId);
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
      qa_run_id: null,
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
