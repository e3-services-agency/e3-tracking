/**
 * `list_findings` (T-2-10, plan MCP table): default `status` is `open` (plan: "status? (default
 * open)") -- an agent asking "what's wrong" almost never wants resolved history unless it asks for
 * it explicitly. `event` accepts a name or id (`resolve.ts`).
 *
 * D-89 (T-5-47): rows carry `priority`, `priority_rank` and `priority_reasons` and come back in
 * priority order, the same as the internal `GET /findings` default; `priority` ("P1,P2") filters.
 */
import * as FindingDAL from '../../backend/dal/finding.dal';
import {
  filterByFindingPriority,
  loadFindingPriorityContext,
  sortByFindingPriority,
  withFindingPriority,
  type WithFindingPriority,
} from '../../backend/services/findingPriority.service';
import { parseFindingPriorityFilter } from '../../domain/findingPriority';
import { McpToolError } from '../errors';
import { resolveEvent, resolveProject } from '../resolve';
import type { FindingRow } from '../../backend/dal/finding.dal';

export interface ListFindingsInput {
  project_key?: string;
  event?: string;
  severity?: string;
  priority?: string;
  comparison?: string;
  kind?: string;
  status?: string;
  qa_run_id?: string;
}

export async function listFindings(input: ListFindingsInput): Promise<WithFindingPriority<FindingRow>[]> {
  const project = resolveProject(input.project_key);
  let priorities: ReturnType<typeof parseFindingPriorityFilter>;
  try {
    priorities = parseFindingPriorityFilter(input.priority);
  } catch (err) {
    throw new McpToolError('PRIORITY_INVALID', (err as Error).message);
  }
  const eventId = input.event ? resolveEvent(project.id, input.event).id : undefined;
  const rows = FindingDAL.listFindings(project.id, {
    comparison: input.comparison,
    kind: input.kind,
    severity: input.severity,
    event_id: eventId,
    status: input.status ?? 'open',
    qa_run_id: input.qa_run_id,
  });
  return sortByFindingPriority(filterByFindingPriority(withFindingPriority(rows, loadFindingPriorityContext(project.id)), priorities));
}
