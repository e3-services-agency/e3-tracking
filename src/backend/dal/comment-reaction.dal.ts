/**
 * Comment reactions (D-79): Seen/Like are writable, legacy on_it remains readable, one per
 * author per comment per kind (author compared case-insensitively, enforced by the unique index in
 * 0034), toggled on a second press. New reactions never alter thread status.
 * Stored legacy evidence remains backup/restorable. Not change-logged (D-49).
 */
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { ValidationError } from '../errors';
import { COMMENT_REACTION_KINDS, WRITABLE_COMMENT_REACTION_KINDS, type CommentReactionKind, type WritableCommentReactionKind } from '../../domain/enums';
import { getCommentOrThrow, type CommentRow } from './comment.dal';

export interface ReactionSummary {
  kind: CommentReactionKind;
  count: number;
  authors: string[];
  /** Current authenticated/guest participant owns this reaction; public IDs never leave the server. */
  mine?: boolean;
}

export function assertReactionKind(kind: unknown): asserts kind is WritableCommentReactionKind {
  if (typeof kind !== 'string' || !(WRITABLE_COMMENT_REACTION_KINDS as readonly string[]).includes(kind)) {
    throw new ValidationError(`kind must be one of ${WRITABLE_COMMENT_REACTION_KINDS.join(', ')}.`, 'kind');
  }
}

/** Reactions of the given comments, aggregated per comment; kinds with no reaction are omitted. */
export function listReactionSummaries(projectId: string, commentIds?: string[], viewer?: string, participantId?: string): Map<string, ReactionSummary[]> {
  const rows = getDb()
    .prepare('SELECT comment_id, author_name, participant_id, via_share, kind FROM comment_reactions WHERE project_id = ? ORDER BY created_at, rowid')
    .all(projectId) as { comment_id: string; author_name: string; participant_id: string | null; via_share: number; kind: CommentReactionKind }[];
  const wanted = commentIds ? new Set(commentIds) : null;
  const byComment = new Map<string, Map<CommentReactionKind, string[]>>();
  const mine = new Set<string>();
  for (const r of rows) {
    if (wanted && !wanted.has(r.comment_id)) continue;
    const legacyMine = !!viewer && (!participantId || participantId.startsWith('staff:')) && r.participant_id === null && !r.via_share && r.author_name.toLowerCase() === viewer.toLowerCase();
    const ownsReaction = participantId ? r.participant_id === participantId || legacyMine : !!viewer && (r.participant_id === `staff:${viewer}` || r.author_name.toLowerCase() === viewer.toLowerCase());
    if (ownsReaction) mine.add(`${r.comment_id}:${r.kind}`);
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
        ...(participantId || viewer ? { mine: mine.has(`${id}:${kind}`) } : {}),
      }))
    );
  }
  return out;
}

/** Adds `reactions[]` (possibly empty) to each comment. */
export function attachReactions<T extends { id: string }>(
  projectId: string,
  comments: T[],
  viewer?: string,
  participantId?: string
): (T & { reactions: ReactionSummary[] })[] {
  const map = listReactionSummaries(projectId, comments.map((c) => c.id), viewer, participantId);
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
  opts: { viaShare?: boolean; participantId?: string; legacyAuthorName?: string } = {}
): ToggleResult {
  assertReactionKind(kind);
  const author = authorName?.trim();
  if (!author) throw new ValidationError('author_name is required.', 'author_name');
  if (author.length > 80) throw new ValidationError('author_name must be 80 characters or fewer.', 'author_name');
  getCommentOrThrow(projectId, commentId);
  const db = getDb();
  let existing = db
    .prepare(opts.participantId ? 'SELECT id FROM comment_reactions WHERE comment_id = ? AND participant_id = ? AND kind = ?' : 'SELECT id FROM comment_reactions WHERE comment_id = ? AND participant_id IS NULL AND lower(author_name) = lower(?) AND kind = ?')
    .get(commentId, opts.participantId ?? author, kind) as { id: string } | undefined;
  // Only the internal route supplies this server-derived actor name. A shared participant,
  // even one with the same display name, must never claim a legacy reaction by name.
  if (!existing && !opts.viaShare && opts.participantId?.startsWith('staff:') && opts.legacyAuthorName) {
    existing = db.prepare('SELECT id FROM comment_reactions WHERE comment_id = ? AND participant_id IS NULL AND via_share = 0 AND lower(author_name) = lower(?) AND kind = ?')
      .get(commentId, opts.legacyAuthorName, kind) as { id: string } | undefined;
  }
  if (existing) {
    db.prepare('DELETE FROM comment_reactions WHERE id = ?').run(existing.id);
    return { added: false, comment: getCommentOrThrow(projectId, commentId) };
  }
  db.prepare(
    'INSERT INTO comment_reactions (id, project_id, comment_id, author_name, kind, via_share, created_at, participant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), projectId, commentId, author, kind, opts.viaShare ? 1 : 0, nowIso(), opts.participantId ?? null);
  return { added: true, comment: getCommentOrThrow(projectId, commentId) };
}
