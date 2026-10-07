/**
 * Comment attachment DAL (D-70 item 4, T-5-04). Rows only; bytes live in the FileStore. Never
 * change-logged (comments are not a definition write, D-44). `file_path` is the FileStore relative
 * path (`<projectId>/comments/<commentId>/<uuid>-<name>`).
 */
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { NotFoundError } from '../errors';

export interface CommentAttachmentRow {
  id: string;
  comment_id: string;
  project_id: string;
  file_path: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  size_bytes: number;
  sort_order: number;
  created_at: string;
}

/** Public projection: no project id. */
export type PublicCommentAttachment = Omit<CommentAttachmentRow, 'project_id'>;

export function toPublicAttachment(a: CommentAttachmentRow): PublicCommentAttachment {
  const { project_id: _p, ...rest } = a;
  return rest;
}

export function listAttachmentsForComment(projectId: string, commentId: string): CommentAttachmentRow[] {
  return getDb()
    .prepare('SELECT * FROM comment_attachments WHERE project_id = ? AND comment_id = ? ORDER BY sort_order, created_at, id')
    .all(projectId, commentId) as CommentAttachmentRow[];
}

/** One query for a whole comment list: comment id -> attachments in order. */
export function listAttachmentsByComment(projectId: string, commentIds: string[]): Map<string, CommentAttachmentRow[]> {
  const out = new Map<string, CommentAttachmentRow[]>();
  if (commentIds.length === 0) return out;
  const rows = getDb()
    .prepare('SELECT * FROM comment_attachments WHERE project_id = ? ORDER BY sort_order, created_at, id')
    .all(projectId) as CommentAttachmentRow[];
  const wanted = new Set(commentIds);
  for (const r of rows) {
    if (!wanted.has(r.comment_id)) continue;
    const list = out.get(r.comment_id) ?? [];
    list.push(r);
    out.set(r.comment_id, list);
  }
  return out;
}

export function countAttachments(projectId: string, commentId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM comment_attachments WHERE project_id = ? AND comment_id = ?')
    .get(projectId, commentId) as { n: number };
  return row.n;
}

export function getAttachmentByPath(projectId: string, filePath: string): CommentAttachmentRow | undefined {
  return getDb()
    .prepare('SELECT * FROM comment_attachments WHERE project_id = ? AND file_path = ?')
    .get(projectId, filePath) as CommentAttachmentRow | undefined;
}

export function getAttachmentOrThrow(projectId: string, commentId: string, id: string): CommentAttachmentRow {
  const row = getDb()
    .prepare('SELECT * FROM comment_attachments WHERE id = ? AND comment_id = ? AND project_id = ?')
    .get(id, commentId, projectId) as CommentAttachmentRow | undefined;
  if (!row) throw new NotFoundError('Attachment not found.', 'comment_attachment');
  return row;
}

export function insertAttachment(
  projectId: string,
  commentId: string,
  input: Pick<CommentAttachmentRow, 'file_path' | 'mime' | 'width' | 'height' | 'size_bytes'>
): CommentAttachmentRow {
  const id = newId();
  const next = countAttachments(projectId, commentId);
  getDb()
    .prepare(
      `INSERT INTO comment_attachments (id, comment_id, project_id, file_path, mime, width, height, size_bytes, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, commentId, projectId, input.file_path, input.mime, input.width, input.height, input.size_bytes, next, nowIso());
  return getAttachmentOrThrow(projectId, commentId, id);
}

export function deleteAttachment(projectId: string, commentId: string, id: string): CommentAttachmentRow {
  const row = getAttachmentOrThrow(projectId, commentId, id);
  getDb().prepare('DELETE FROM comment_attachments WHERE id = ?').run(id);
  return row;
}
