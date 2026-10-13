import { httpMcpContext } from './httpContext';
import { remoteRun, setRemoteRun } from '../backend/dal/mcp-oauth.dal';
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
  return context ? remoteRun(context.grantId,projectId) : runIdByProjectId.get(projectId);
}

export function setSessionRunId(projectId: string, qaRunId: string): void {
  const context=httpMcpContext();
  if(context)setRemoteRun(context.grantId,projectId,qaRunId);else runIdByProjectId.set(projectId, qaRunId);
}

/** Test-only reset so unrelated tests (and unrelated `:memory:` databases) never see a stale run id. */
export function resetSessionCache(): void {
  runIdByProjectId.clear();
}
