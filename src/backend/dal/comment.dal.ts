/**
 * Comment Data Access Layer (D-49, T-4-02, capability 13). `comments.entity_id` is deliberately
 * not a foreign key (0019_comments.sql): a comment must survive its target's soft delete, and a
 * requirement's target can even be replaced by `replaceRequirements` (T-4-02 keeps a requirement's
 * id stable across an unchanged-target save specifically so a comment on it does not orphan on a
 * plain reorder/edit; it still can on a genuine target swap or removal). `createComment` still
 * checks the target exists at write time (404 `NOT_FOUND` otherwise) -- only after creation can a
 * comment legitimately outlive its target.
 *
 * Not change-logged (D-44 lists comments as their own lightweight trail, not a definition write).
 * `entity_label` is resolved on read, not stored here -- see `src/backend/services/comments.service.ts`.
 */
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { NotFoundError, ValidationError } from '../errors';
import { COMMENT_ENTITY_TYPES, type CommentEntityType } from '../../domain/enums';
import { getEventById } from './event.dal';
import { getPropertyById } from './property.dal';
import { getUseCaseById } from './use-case.dal';
import { getRequirementInProject } from './requirement.dal';

export interface CommentRow {
  id: string;
  project_id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  author_name: string;
  via_share: boolean;
  /** D-49 amendment 2, T-4-10: never returned by the public share routes. */
  internal_only: boolean;
  body: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

type CommentDbRow = Omit<CommentRow, 'via_share' | 'internal_only'> & { via_share: number; internal_only: number };

function mapCommentRow(row: CommentDbRow): CommentRow {
  return { ...row, via_share: !!row.via_share, internal_only: !!row.internal_only };
}

export interface CommentInput {
  entity_type: string;
  entity_id: string;
  author_name: string;
  body: string;
  via_share?: boolean;
  internal_only?: boolean;
}

export interface ListCommentsFilter {
  entity_type?: string;
  entity_id?: string;
  /** `true`/`false` filters resolved vs. open; omitted lists both. */
  resolved?: boolean;
  /** Public share route (T-4-10): drop internal-only rows. */
  excludeInternalOnly?: boolean;
  /** Public share route (T-4-10): keep only rows posted through a share link. */
  viaShareOnly?: boolean;
  /** Comments page filter: only internal-only rows (true) or only non-internal rows (false). */
  internalOnly?: boolean;
}

function validateEntityType(entityType: string): asserts entityType is CommentEntityType {
  if (!(COMMENT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new ValidationError(
      `entity_type must be one of ${COMMENT_ENTITY_TYPES.join(', ')}.`,
      'entity_type'
    );
  }
}

/** Confirms `entity_id` names a real, in-project row of the given type (T-4-02 acceptance: 404 on an unknown id). */
function assertEntityExists(projectId: string, entityType: CommentEntityType, entityId: string): void {
  let found = false;
  switch (entityType) {
    case 'event':
      found = !!getEventById(projectId, entityId);
      break;
    case 'property':
      found = !!getPropertyById(projectId, entityId);
      break;
    case 'use_case':
      found = !!getUseCaseById(projectId, entityId);
      break;
    case 'requirement':
      found = !!getRequirementInProject(projectId, entityId);
      break;
  }
  if (!found) {
    throw new NotFoundError(`${entityType} not found in this project.`, entityType);
  }
}

export function listComments(projectId: string, filter: ListCommentsFilter = {}): CommentRow[] {
  const conditions: string[] = ['project_id = ?'];
  const params: unknown[] = [projectId];
  if (filter.entity_type) {
    conditions.push('entity_type = ?');
    params.push(filter.entity_type);
  }
  if (filter.entity_id) {
    conditions.push('entity_id = ?');
    params.push(filter.entity_id);
  }
  if (filter.resolved !== undefined) {
    conditions.push(filter.resolved ? 'resolved_at IS NOT NULL' : 'resolved_at IS NULL');
  }
  if (filter.excludeInternalOnly) conditions.push('internal_only = 0');
  if (filter.viaShareOnly) conditions.push('via_share = 1');
  if (filter.internalOnly !== undefined) conditions.push(filter.internalOnly ? 'internal_only = 1' : 'internal_only = 0');
  const rows = getDb()
    .prepare(`SELECT * FROM comments WHERE ${conditions.join(' AND ')} ORDER BY created_at, id`)
    .all(...params) as CommentDbRow[];
  return rows.map(mapCommentRow);
}

export function getCommentOrThrow(projectId: string, id: string): CommentRow {
  const row = getDb()
    .prepare('SELECT * FROM comments WHERE id = ? AND project_id = ?')
    .get(id, projectId) as CommentDbRow | undefined;
  if (!row) throw new NotFoundError('Comment not found.', 'comment');
  return mapCommentRow(row);
}

export function createComment(projectId: string, input: CommentInput): CommentRow {
  validateEntityType(input.entity_type);
  const entityId = input.entity_id?.trim();
  if (!entityId) throw new ValidationError('entity_id is required.', 'entity_id');
  assertEntityExists(projectId, input.entity_type, entityId);

  const authorName = input.author_name?.trim();
  if (!authorName) throw new ValidationError('author_name is required.', 'author_name');
  if (authorName.length > 80) {
    throw new ValidationError('author_name must be 80 characters or fewer.', 'author_name');
  }

  const body = input.body?.trim();
  if (!body) throw new ValidationError('body is required.', 'body');
  if (body.length > 4000) {
    throw new ValidationError('body must be 4000 characters or fewer.', 'body');
  }

  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO comments (id, project_id, entity_type, entity_id, author_name, via_share, internal_only, body, created_at, resolved_at, resolved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
  ).run(id, projectId, input.entity_type, entityId, authorName, input.via_share ? 1 : 0, input.internal_only ? 1 : 0, body, now);
  return getCommentOrThrow(projectId, id);
}

/** Internal-only triage toggle; never reachable through the public share route (D-49). */
export function setCommentResolved(projectId: string, id: string, resolved: boolean, resolvedBy: string): CommentRow {
  getCommentOrThrow(projectId, id);
  const db = getDb();
  if (resolved) {
    db.prepare('UPDATE comments SET resolved_at = ?, resolved_by = ? WHERE id = ? AND project_id = ?').run(
      nowIso(),
      resolvedBy,
      id,
      projectId
    );
  } else {
    db.prepare('UPDATE comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ? AND project_id = ?').run(
      id,
      projectId
    );
  }
  return getCommentOrThrow(projectId, id);
}

/** Internal-only toggle (T-4-10): flips whether the comment may ever appear on the shared view. */
export function setCommentInternalOnly(projectId: string, id: string, internalOnly: boolean): CommentRow {
  getCommentOrThrow(projectId, id);
  getDb()
    .prepare('UPDATE comments SET internal_only = ? WHERE id = ? AND project_id = ?')
    .run(internalOnly ? 1 : 0, id, projectId);
  return getCommentOrThrow(projectId, id);
}

/** Internal-only (D-49); there is no edit, only resolve, the internal-only toggle, and delete. */
export function deleteComment(projectId: string, id: string): void {
  getCommentOrThrow(projectId, id);
  getDb().prepare('DELETE FROM comments WHERE id = ? AND project_id = ?').run(id, projectId);
}
