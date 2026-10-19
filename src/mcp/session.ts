import { httpMcpContext } from './httpContext';
import { getDb } from '../backend/db';
import { getActor } from '../backend/context/actor';
/**
 * Per-process agent-session `QaRun` cache (T-2-10, plan `submit_observation`: "creates an
 * `agent_session` run when `qa_run_id` is absent and reuses it on later calls within the same
 * process"). Keyed by project id; cleared only by process exit -- there is deliberately no TTL or
 * persistence, an MCP stdio process is one QA session by construction (D-19: a sibling process per
 * Claude Code session).
 */
const runIdByProjectId = new Map<string, string>();

export function getSessionRunId(projectId: string): string | undefined {
  const context=httpMcpContext();
  const agent = getActor().agent ?? '';
  return context ? (getDb().prepare('SELECT qa_run_id FROM mcp_agent_qa_runs WHERE grant_id=? AND project_id=? AND agent=?').get(context.grantId, projectId, agent) as { qa_run_id: string } | undefined)?.qa_run_id : runIdByProjectId.get(projectId + ':' + agent);
}

export function setSessionRunId(projectId: string, qaRunId: string): void {
  const context=httpMcpContext();
  const agent = getActor().agent ?? '';
  if(context)getDb().prepare('INSERT INTO mcp_agent_qa_runs VALUES(?,?,?,?) ON CONFLICT(grant_id,project_id,agent) DO UPDATE SET qa_run_id=excluded.qa_run_id').run(context.grantId,projectId,agent,qaRunId);else runIdByProjectId.set(projectId + ':' + agent, qaRunId);
}

/** Test-only reset so unrelated tests (and unrelated `:memory:` databases) never see a stale run id. */
export function resetSessionCache(): void {
  runIdByProjectId.clear();
}
