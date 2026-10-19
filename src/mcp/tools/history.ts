/**
 * `get_history` (T-3-02): read-only access to a project's `change_log` (D-44) for an MCP agent --
 * useful to check what a previous import/agent write actually changed, or to review recent human
 * edits before making a new one. Mirrors `GET /api/projects/:id/history`'s `entity_type`/
 * `entity_id`/`limit` filters (`change-log.dal.ts#listChanges`); MCP `limit` defaults to 10, capped at
 * `MAX_LIMIT` (1000). MCP lists use compact pages with an explicit total and next_offset.
 */
import * as ChangeLogDAL from '../../backend/dal/change-log.dal';
import { pageBounds, pageRows, readSnapshot, type ListOptions } from '../readOptions';
import { CHANGE_LOG_ENTITY_TYPES } from '../../domain/enums';
import { resolveProject } from '../resolve';
import { McpToolError } from '../errors';

export interface GetHistoryInput extends ListOptions {
  project_key?: string;
  entity_type: string;
  entity_id: string;
}

export async function getHistory(input: GetHistoryInput) {
  return readSnapshot(() => {
  if (!(CHANGE_LOG_ENTITY_TYPES as readonly string[]).includes(input.entity_type)) {
    throw new McpToolError(
      'VALIDATION_ERROR',
      `entity_type must be one of: ${CHANGE_LOG_ENTITY_TYPES.join(', ')}.`
    );
  }
  if (!input.entity_id?.trim()) throw new McpToolError('VALIDATION_ERROR', 'entity_id is required.');
  const project = resolveProject(input.project_key);
  const filter = {
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    ...pageBounds(input),
  };
  const compact = ['id', 'entity_type', 'entity_id', 'entity_label', 'parent_entity_id', 'action', 'actor', 'agent', 'source', 'batch_id', 'changed_at'];
  return pageRows(ChangeLogDAL.listChanges(project.id, filter), ChangeLogDAL.countChanges(project.id, filter), input, compact, [...compact, 'diff_json'], { project_id: project.id, collection: 'history', filters: { entity_type: input.entity_type, entity_id: input.entity_id } });
  });
}
