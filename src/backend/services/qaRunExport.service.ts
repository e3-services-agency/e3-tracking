/**
 * QA run export (T-2-11, PLAN "QA run export"): re-emits a run's observations as the Bloomreach
 * `customer-events-export.json` shape (`src/domain/import/customerEventsExport.ts`), so a run
 * captured through the app (agent session or pasted export) can be downloaded and diffed the same
 * way the original paste was. `customer_id` and `project` come from the run/project settings
 * (there is nowhere else to get them from: the source file's own `project` field is discarded on
 * import, see `customerEventsExportImport.service.ts` -- it keeps only `url`/`events_listed`/
 * `note` in `source_meta_json`), `url`/`events_listed`/`note` from `source_meta_json` (set on
 * import; `null`/absent for an `agent_session` run). Events are sorted by timestamp desc, same as
 * `listObservationsByRun`, with raw properties untouched.
 *
 * `events_listed` (LOW 4 fix round) is always overwritten with `events.length`, the count actually
 * exported here, not the original paste's count from `source_meta_json`: a run applied with only a
 * subset of its source paste selected must not claim a `events_listed` the export does not contain
 * (`events_listed` originates from Bloomreach's own "N events retrieved" header, so it is meant to
 * describe *this* file, and this file only ever holds the run's own observations).
 */
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as ProjectDAL from '../dal/project.dal';
import type { CustomerEventsExportEvent } from '../../domain/import/customerEventsExport';

export interface QaRunExport {
  customer_id: string | null;
  project: string | null;
  url?: string | null;
  events_listed?: number | null;
  events: CustomerEventsExportEvent[];
  note?: string | null;
}

export function exportQaRunAsCustomerEventsExport(projectId: string, runId: string): QaRunExport {
  const run = QaRunDAL.getQaRunOrThrow(projectId, runId);
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const observations = ObservationDAL.listObservationsByRun(projectId, runId); // already timestamp DESC

  const sourceMeta = (run.source_meta_json ?? null) as { url?: string | null; events_listed?: number | null; note?: string | null } | null;

  const events: CustomerEventsExportEvent[] = observations.map((o) => ({
    type: o.event_type,
    timestamp: o.timestamp,
    properties: o.properties_json,
  }));

  const result: QaRunExport = {
    customer_id: run.customer_id,
    project: project.key,
    events,
  };
  if (sourceMeta?.url !== undefined) result.url = sourceMeta.url;
  if (sourceMeta?.events_listed !== undefined) result.events_listed = events.length;
  if (sourceMeta?.note !== undefined) result.note = sourceMeta.note;
  return result;
}
