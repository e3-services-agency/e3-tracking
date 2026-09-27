/**
 * `get_tracking_document` (T-2-10): the same project-wide export as `GET
 * /export/tracking-document.json` (D-34, `document.service.ts#buildTrackingDocument`), for an agent
 * that wants the whole project in one call instead of walking `list_events`/`get_event_card` one at
 * a time. Not in the plan table's original twelve (`PLAN-PHASE2-2026-09-25.md` lines ~205-225);
 * shipped alongside the full plan table (including `finish_qa_run`, `src/mcp/tools/qaRuns.ts`) per
 * the T-2-10 addendum, for thirteen tools total.
 */
import { buildTrackingDocument } from '../../backend/services/document.service';
import { resolveProject } from '../resolve';
import type { TrackingDocument } from '../../domain/document/trackingDocument';

export interface GetTrackingDocumentInput {
  project_key?: string;
}

export async function getTrackingDocument(input: GetTrackingDocumentInput): Promise<TrackingDocument> {
  const project = resolveProject(input.project_key);
  return buildTrackingDocument(project.id);
}
