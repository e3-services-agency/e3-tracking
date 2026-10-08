/** D-75: versioned comment fragments. Resolution uses only the current view's permitted rows. */
import { COMMENT_ENTITY_TYPES, type CommentEntityType } from '@/src/domain/enums';
import { buildAppPageUrl } from '@/src/config/env';

export interface CommentLinkTarget { entityType: CommentEntityType; entityId: string; threadId: string; commentId: string }
export type ParsedCommentLink = { kind: 'none' } | { kind: 'invalid' } | { kind: 'target'; target: CommentLinkTarget };
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const KEYS = ['comment', 'type', 'entity', 'thread', 'target'];

export function parseCommentLink(hash: string): ParsedCommentLink {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith('comment=')) return { kind: 'none' };
  try {
    if (raw.length > 1024) return { kind: 'invalid' };
    decodeURIComponent(raw); // URLSearchParams otherwise silently accepts broken percent escapes.
    const params = new URLSearchParams(raw);
    if (params.size !== KEYS.length || KEYS.some((key) => params.getAll(key).length !== 1) || params.get('comment') !== 'v1') return { kind: 'invalid' };
    const entityType = params.get('type') as CommentEntityType;
    const entityId = params.get('entity')!;
    const threadId = params.get('thread')!;
    const commentId = params.get('target')!;
    if (!COMMENT_ENTITY_TYPES.includes(entityType) || ![entityId, threadId, commentId].every((id) => ID.test(id))) return { kind: 'invalid' };
    return { kind: 'target', target: { entityType, entityId, threadId, commentId } };
  } catch { return { kind: 'invalid' }; }
}

export function commentFragment(target: CommentLinkTarget): string {
  const params = new URLSearchParams({ comment: 'v1', type: target.entityType, entity: target.entityId, thread: target.threadId, target: target.commentId });
  const hash = `#${params}`;
  if (parseCommentLink(hash).kind !== 'target') throw new Error('Invalid comment target.');
  return hash;
}

export type CommentLinkView = { mode: 'shared'; token: string } | { mode: 'internal'; projectKey: string | null };
export function commentLinkUrl(view: CommentLinkView, target: CommentLinkTarget): string {
  if (view.mode === 'internal' && !view.projectKey) throw new Error('Select a project before copying its link.');
  const path = view.mode === 'shared' ? `/shared/${encodeURIComponent(view.token)}` : `/p/${encodeURIComponent(view.projectKey!)}/comments`;
  return buildAppPageUrl(path) + commentFragment(target);
}

interface LinkRow { id: string; parent_id: string | null; entity_type?: string; entity_id?: string }
export function resolveCommentTarget<T extends LinkRow>(rows: readonly T[], target: CommentLinkTarget): { root: T; comment: T } | null {
  const root = rows.find((row) => row.id === target.threadId && !row.parent_id && row.entity_type === target.entityType && row.entity_id === target.entityId);
  const comment = rows.find((row) => row.id === target.commentId && row.entity_type === target.entityType && row.entity_id === target.entityId && (row.id === root?.id || row.parent_id === root?.id));
  return root && comment ? { root, comment } : null;
}

export const commentDomId = (id: string) => `comment-${id}`;
export const COMMENT_TARGET_CLASS = 'ring-2 ring-[var(--color-info)] rounded-md scroll-mt-24';
export function focusComment(element: HTMLElement | null): void {
  element?.scrollIntoView?.({ block: 'center' });
  element?.focus({ preventScroll: true });
}
