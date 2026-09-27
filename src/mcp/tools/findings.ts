/**
 * `list_findings` (T-2-10, plan MCP table): default `status` is `open` (plan: "status? (default
 * open)") -- an agent asking "what's wrong" almost never wants resolved history unless it asks for
 * it explicitly. `event` accepts a name or id (`resolve.ts`).
 */
import * as FindingDAL from '../../backend/dal/finding.dal';
import { resolveEvent, resolveProject } from '../resolve';
import type { FindingRow } from '../../backend/dal/finding.dal';

export interface ListFindingsInput {
  project_key?: string;
  event?: string;
  severity?: string;
  comparison?: string;
  kind?: string;
  status?: string;
  qa_run_id?: string;
}

export async function listFindings(input: ListFindingsInput): Promise<FindingRow[]> {
  const project = resolveProject(input.project_key);
  const eventId = input.event ? resolveEvent(project.id, input.event).id : undefined;
  return FindingDAL.listFindings(project.id, {
    comparison: input.comparison,
    kind: input.kind,
    severity: input.severity,
    event_id: eventId,
    status: input.status ?? 'open',
    qa_run_id: input.qa_run_id,
  });
}
