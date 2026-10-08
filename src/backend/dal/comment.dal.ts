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
import type { CommentAuthorKind } from '../../domain/commentIdentity';
import { COMMENT_BODY_MAX } from '../../domain/markdownEdit';
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { COMMENT_ENTITY_TYPES, COMMENT_STATUSES, SHARE_SETTABLE_COMMENT_STATUSES, type CommentEntityType, type CommentStatus } from '../../domain/enums';
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
  participant_id: string | null;
  author_kind: CommentAuthorKind;
  avatar_url: string | null;
  via_share: boolean;
  /** D-49 amendment 2, T-4-10: never returned by the public share routes. */
  internal_only: boolean;
  body: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  /** D-70, T-5-02: reply -> its root comment id (one level); null on a root. */
  parent_id: string | null;
  status: CommentStatus;
  status_changed_by: string | null;
  status_changed_at: string | null;
}

export interface CommentThread extends CommentRow {
  replies: CommentRow[];
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
  participant_id?: string;
  author_kind?: CommentAuthorKind;
  avatar_url?: string | null;
  via_share?: boolean;
  internal_only?: boolean;
  /** D-70: makes this a reply; entity and internal_only are inherited from the root. */
  parent_id?: string | null;
}

export interface ListCommentsFilter {
  entity_type?: string;
  entity_id?: string;
  /** D-70: filter by status (replies stay open, so filter roots via groupThreads). */
  status?: string;
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
/** One inventory query for a project-wide shared discussion list (no per-comment lookup). */
export function visibleCommentTargetKeys(projectId: string): Set<string> {
 const rows = getDb().prepare(`
 SELECT 'event' AS type,id FROM events WHERE project_id = @project AND deleted_at IS NULL
 UNION ALL SELECT 'property',id FROM properties WHERE project_id = @project AND deleted_at IS NULL
 UNION ALL SELECT 'use_case',id FROM use_cases WHERE project_id = @project AND deleted_at IS NULL
 UNION ALL SELECT 'requirement',r.id FROM requirements r JOIN use_cases u ON u.id = r.use_case_id WHERE u.project_id = @project AND u.deleted_at IS NULL
 UNION ALL SELECT 'qa_report',id FROM qa_reports WHERE project_id = @project
 UNION ALL SELECT 'finding',f.id FROM findings f WHERE f.project_id = @project AND (f.status='open' OR f.resolved_by='user') AND (f.event_id IS NULL OR EXISTS(SELECT 1 FROM events e WHERE e.id=f.event_id AND e.project_id=f.project_id AND e.deleted_at IS NULL))
 UNION ALL SELECT 'finding',finding_id FROM qa_report_findings WHERE project_id = @project AND public_visible=1
 UNION ALL SELECT 'identity_rule',id FROM identity_rules WHERE project_id = @project
 UNION ALL SELECT 'catalog',id FROM catalogs WHERE project_id = @project AND deleted_at IS NULL
 UNION ALL SELECT 'property_definition',d.id FROM property_definitions d JOIN properties p ON p.id = d.property_id WHERE p.project_id = @project AND d.project_id = p.project_id AND p.deleted_at IS NULL AND d.deleted_at IS NULL
 `).all({project:projectId}) as {type:string;id:string}[];
 return new Set(rows.map((r) => `${r.type}:${r.id}`));
}
export function isCommentTargetVisible(projectId: string, entityType: string, entityId: string): boolean {
  if (!(COMMENT_ENTITY_TYPES as readonly string[]).includes(entityType)) return false;
  if(entityType==='finding')return visibleCommentTargetKeys(projectId).has(`finding:${entityId}`);
  try { assertEntityExists(projectId, entityType as CommentEntityType, entityId); return true; } catch { return false; }
}

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
    case 'finding':
      found = !!getDb().prepare('SELECT id FROM findings WHERE project_id=? AND id=? UNION ALL SELECT finding_id FROM qa_report_findings WHERE project_id=? AND finding_id=?').get(projectId,entityId,projectId,entityId);
      break;
    case 'qa_report':
      found = !!getDb().prepare('SELECT id FROM qa_reports WHERE project_id=? AND id=?').get(projectId,entityId);
      break;
    case 'identity_rule':
      found = !!getDb().prepare('SELECT id FROM identity_rules WHERE project_id = ? AND id = ?').get(projectId, entityId);
      break;
    case 'catalog':
      found = !!getDb().prepare('SELECT id FROM catalogs WHERE project_id = ? AND id = ? AND deleted_at IS NULL').get(projectId, entityId);
      break;
    case 'property_definition':
      found = !!getDb().prepare('SELECT d.id FROM property_definitions d JOIN properties p ON p.id = d.property_id WHERE p.project_id = ? AND d.project_id = p.project_id AND d.id = ? AND d.deleted_at IS NULL AND p.deleted_at IS NULL').get(projectId, entityId);
      break;
    case 'requirement':
      const requirement = getRequirementInProject(projectId, entityId);
      found = !!requirement && !!getUseCaseById(projectId, requirement.use_case_id);
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
  if (filter.status) {
    if (!(COMMENT_STATUSES as readonly string[]).includes(filter.status)) {
      throw new ValidationError(`status must be one of ${COMMENT_STATUSES.join(', ')}.`, 'status');
    }
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.excludeInternalOnly) conditions.push('internal_only = 0');
  if (filter.viaShareOnly) conditions.push('via_share = 1');
  if (filter.internalOnly !== undefined) conditions.push(filter.internalOnly ? 'internal_only = 1' : 'internal_only = 0');
  const rows = getDb()
    .prepare(`SELECT * FROM comments WHERE ${conditions.join(' AND ')} ORDER BY created_at, rowid`)
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
  let entityType = input.entity_type;
  let entityIdRaw = input.entity_id;
  let internalOnlyFlag = !!input.internal_only;
  let parentId: string | null = null;
  if (input.parent_id !== undefined && input.parent_id !== null) {
    // Replies attach to the root; entity and visibility come from it, never from the body.
    const parent = getCommentOrThrow(projectId, input.parent_id);
    const root = parent.parent_id ? getCommentOrThrow(projectId, parent.parent_id) : parent;
    parentId = root.id;
    entityType = root.entity_type;
    entityIdRaw = root.entity_id;
    internalOnlyFlag = root.internal_only;
  }
  validateEntityType(entityType);
  const entityId = entityIdRaw?.trim();
  if (!entityId) throw new ValidationError('entity_id is required.', 'entity_id');
  if (!parentId) assertEntityExists(projectId, entityType, entityId);

  const authorName = input.author_name?.trim();
  if (!authorName) throw new ValidationError('author_name is required.', 'author_name');
  if (authorName.length > 80) {
    throw new ValidationError('author_name must be 80 characters or fewer.', 'author_name');
  }

  const body = input.body?.trim();
  if (!body) throw new ValidationError('body is required.', 'body');
  if (body.length > COMMENT_BODY_MAX) {
    throw new ValidationError('body must be 10000 characters or fewer.', 'body');
  }

  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO comments (id, project_id, entity_type, entity_id, author_name, via_share, internal_only, body, created_at, resolved_at, resolved_by, parent_id, participant_id, author_kind, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
  ).run(id, projectId, entityType, entityId, authorName, input.via_share ? 1 : 0, internalOnlyFlag ? 1 : 0, body, now, parentId, input.participant_id ?? null, input.author_kind ?? 'legacy', input.avatar_url ?? null);
  return getCommentOrThrow(projectId, id);
}

export class StatusNotAllowedError extends ForbiddenError {
  readonly code = 'STATUS_NOT_ALLOWED';
  constructor(message: string) {
    super(message);
    this.name = 'StatusNotAllowedError';
  }
}

/**
 * Sets a root comment's status (D-70). `by` records who; `restricted` (the share route) allows only
 * on_it/done and never a reopen. resolved_at/resolved_by mirror `done` for older readers.
 */
export function setCommentStatus(
  projectId: string,
  id: string,
  status: string,
  by: string,
  opts: { restricted?: boolean } = {}
): CommentRow {
  if (!(COMMENT_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError(`status must be one of ${COMMENT_STATUSES.join(', ')}.`, 'status');
  }
  const current = getCommentOrThrow(projectId, id);
  if (current.parent_id) throw new ValidationError('Only a root comment has a status.', 'status');
  if (opts.restricted) {
    if (!(SHARE_SETTABLE_COMMENT_STATUSES as readonly string[]).includes(status)) {
      throw new StatusNotAllowedError('This status cannot be set through a share link.');
    }
    if (current.status === 'done' || current.status === 'wont_do') {
      throw new StatusNotAllowedError('A closed comment cannot be reopened through a share link.');
    }
  }
  const now = nowIso();
  const done = status === 'done';
  getDb()
    .prepare(
      'UPDATE comments SET status = ?, status_changed_by = ?, status_changed_at = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND project_id = ?'
    )
    .run(status, by, now, done ? now : null, done ? by : null, id, projectId);
  return getCommentOrThrow(projectId, id);
}

/** Compatibility wrapper for the old resolved flag: true -> done, false -> open. */
export function setCommentResolved(projectId: string, id: string, resolved: boolean, resolvedBy: string): CommentRow {
  return setCommentStatus(projectId, id, resolved ? 'done' : 'open', resolvedBy);
}

export { groupThreads, countByStatus } from '../../domain/commentThreads';

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

/** The one share visibility predicate (D-49 amendment 2, D-70): internal-only never; via_share_only needs a share-posted root. */
export function isRootShareVisible(root: CommentRow, shareComments: string): boolean {
  if (root.internal_only) return false;
  return shareComments !== 'via_share_only' || root.via_share;
}

/**
 * Resolves a comment id (a root or a reply) to its ROOT, only when that root is visible to a share
 * link; otherwise null, identically for missing, other-project and hidden ids.
 */
export function getShareVisibleRoot(projectId: string, id: string, shareComments: string): CommentRow | null {
  let row: CommentRow;
  try {
    row = getCommentOrThrow(projectId, id);
    if (row.parent_id) row = getCommentOrThrow(projectId, row.parent_id);
  } catch {
    return null;
  }
  return isRootShareVisible(row, shareComments) && isCommentTargetVisible(projectId, row.entity_type, row.entity_id) ? row : null;
}
