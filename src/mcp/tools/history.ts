/**
 * `get_history` (T-3-02): read-only access to a project's `change_log` (D-44) for an MCP agent --
 * useful to check what a previous import/agent write actually changed, or to review recent human
 * edits before making a new one. Mirrors `GET /api/projects/:id/history`'s `entity_type`/
 * `entity_id`/`limit` filters (`change-log.dal.ts#listChanges`); `limit` defaults to 100, capped at
 * `MAX_LIMIT` (1000) by the DAL itself. No paging cursor here (an agent asking for history wants a
 * recent slice, not to page through the whole log) -- the route already covers full pagination for
 * the History page.
 */
import * as ChangeLogDAL from '../../backend/dal/change-log.dal';
import type { ChangeLogRow } from '../../backend/dal/change-log.dal';
import { CHANGE_LOG_ENTITY_TYPES } from '../../domain/enums';
import { resolveProject } from '../resolve';
import { McpToolError } from '../errors';

export interface GetHistoryInput {
  project_key?: string;
  entity_type: string;
  entity_id: string;
  limit?: number;
}

export async function getHistory(input: GetHistoryInput): Promise<ChangeLogRow[]> {
  if (!(CHANGE_LOG_ENTITY_TYPES as readonly string[]).includes(input.entity_type)) {
    throw new McpToolError(
      'VALIDATION_ERROR',
      `entity_type must be one of: ${CHANGE_LOG_ENTITY_TYPES.join(', ')}.`
    );
  }
  if (!input.entity_id?.trim()) throw new McpToolError('VALIDATION_ERROR', 'entity_id is required.');
  const project = resolveProject(input.project_key);
  return ChangeLogDAL.listChanges(project.id, {
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    limit: input.limit,
  });
}
