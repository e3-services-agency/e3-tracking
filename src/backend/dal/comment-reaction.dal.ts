/**
 * Comment reactions (D-70 item 3, T-5-03): exactly three kinds (`seen`, `like`, `on_it`), one per
 * author per comment per kind (author compared case-insensitively, enforced by the unique index in
 * 0034), toggled on a second press. `on_it` also moves the root's status from open to on_it; a
 * share caller goes through the restricted status rules and a refused status change never blocks
 * the reaction. Not change-logged (comments are their own lightweight trail, D-49).
 */
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { ValidationError } from '../errors';
import { COMMENT_REACTION_KINDS, type CommentReactionKind } from '../../domain/enums';
import { getCommentOrThrow, setCommentStatus, StatusNotAllowedError, type CommentRow } from './comment.dal';

export interface ReactionSummary {
  kind: CommentReactionKind;
  count: number;
  authors: string[];
  /** Internal routes only: the requesting user's own reaction (a share visitor's name is known to the browser only). */
  mine?: boolean;
}

export function assertReactionKind(kind: unknown): asserts kind is CommentReactionKind {
  if (typeof kind !== 'string' || !(COMMENT_REACTION_KINDS as readonly string[]).includes(kind)) {
    throw new ValidationError(`kind must be one of ${COMMENT_REACTION_KINDS.join(', ')}.`, 'kind');
  }
}

/** Reactions of the given comments, aggregated per comment; kinds with no reaction are omitted. */
export function listReactionSummaries(projectId: string, commentIds?: string[], viewer?: string): Map<string, ReactionSummary[]> {
  const rows = getDb()
    .prepare('SELECT comment_id, author_name, kind FROM comment_reactions WHERE project_id = ? ORDER BY created_at, rowid')
    .all(projectId) as { comment_id: string; author_name: string; kind: CommentReactionKind }[];
  const wanted = commentIds ? new Set(commentIds) : null;
  const byComment = new Map<string, Map<CommentReactionKind, string[]>>();
  for (const r of rows) {
    if (wanted && !wanted.has(r.comment_id)) continue;
    const kinds = byComment.get(r.comment_id) ?? new Map<CommentReactionKind, string[]>();
    const authors = kinds.get(r.kind) ?? [];
    authors.push(r.author_name);
    kinds.set(r.kind, authors);
    byComment.set(r.comment_id, kinds);
  }
  const out = new Map<string, ReactionSummary[]>();
  for (const [id, kinds] of byComment) {
    out.set(
      id,
      COMMENT_REACTION_KINDS.filter((k) => kinds.has(k)).map((kind) => ({
        kind,
        count: kinds.get(kind)!.length,
        authors: kinds.get(kind)!,
        ...(viewer ? { mine: kinds.get(kind)!.some((a) => a.toLowerCase() === viewer.toLowerCase()) } : {}),
      }))
    );
  }
  return out;
}

/** Adds `reactions[]` (possibly empty) to each comment. */
export function attachReactions<T extends { id: string }>(
  projectId: string,
  comments: T[],
  viewer?: string
): (T & { reactions: ReactionSummary[] })[] {
  const map = listReactionSummaries(projectId, comments.map((c) => c.id), viewer);
  return comments.map((c) => ({ ...c, reactions: map.get(c.id) ?? [] }));
}

export interface ToggleResult {
  added: boolean;
  comment: CommentRow;
}

export function toggleReaction(
  projectId: string,
  commentId: string,
  kind: unknown,
  authorName: string,
  opts: { viaShare?: boolean } = {}
): ToggleResult {
  assertReactionKind(kind);
  const author = authorName?.trim();
  if (!author) throw new ValidationError('author_name is required.', 'author_name');
  if (author.length > 80) throw new ValidationError('author_name must be 80 characters or fewer.', 'author_name');
  const comment = getCommentOrThrow(projectId, commentId);
  if (kind === 'on_it' && comment.parent_id) {
    throw new ValidationError('"on_it" can only be given on a root comment.', 'kind');
  }
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM comment_reactions WHERE comment_id = ? AND lower(author_name) = lower(?) AND kind = ?')
    .get(commentId, author, kind) as { id: string } | undefined;
  if (existing) {
    db.prepare('DELETE FROM comment_reactions WHERE id = ?').run(existing.id);
    return { added: false, comment: getCommentOrThrow(projectId, commentId) };
  }
  db.prepare(
    'INSERT INTO comment_reactions (id, project_id, comment_id, author_name, kind, via_share, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), projectId, commentId, author, kind, opts.viaShare ? 1 : 0, nowIso());
  let result = getCommentOrThrow(projectId, commentId);
  if (kind === 'on_it' && result.status === 'open') {
    try {
      result = setCommentStatus(projectId, commentId, 'on_it', author, { restricted: !!opts.viaShare });
    } catch (err) {
      // The reaction stands even when the status change is refused.
      if (!(err instanceof StatusNotAllowedError)) throw err;
    }
  }
  return { added: true, comment: result };
}
