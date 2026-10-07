/**
 * `CommentItem` (D-70, T-5-02): one comment thread. A root with its status badge and status menu,
 * its replies (collapsed after two, "Show n more"), and a reply box. Pure presentation: the
 * parent panel owns all fetching and posting and passes callbacks, so the same item renders on the
 * internal pages and the shared view.
 *
 * `attachments` is the slot T-5-04 (comment images) fills: a node rendered under each comment's
 * body (root and replies alike), so thumbnails can be added without touching this layout.
 */
import React, { useState } from 'react';
import { Badge } from '@/src/components/ui/badges';
import { StatusBadge } from '@/src/components/ui/badges';
import { COMMENT_STATUSES, SHARE_SETTABLE_COMMENT_STATUSES, type CommentStatus } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import type { CommentPanelRow } from './CommentsPanel';
import { AttachmentPicker } from './CommentAttachments';

export const REPLIES_COLLAPSED_AFTER = 2;

export interface CommentThreadView extends CommentPanelRow {
  replies: CommentPanelRow[];
}

export function CommentItem({
  thread,
  mode,
  canComment,
  busy,
  onSetStatus,
  onReply,
  renderAttachments,
}: {
  thread: CommentThreadView;
  mode: 'internal' | 'shared';
  /** Internal always; shared only when the link has comment access (hides menu and reply box). */
  canComment: boolean;
  busy: boolean;
  onSetStatus: (status: CommentStatus) => void;
  /** Resolves true when the reply was posted (the box then clears). */
  onReply: (body: string, files: File[]) => Promise<boolean>;
  /** T-5-04 slot: attachments (thumbnails) under a comment's body. */
  renderAttachments?: (comment: CommentPanelRow) => React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  const hidden = thread.replies.length - REPLIES_COLLAPSED_AFTER;
  const visibleReplies = showAll || hidden <= 0 ? thread.replies : thread.replies.slice(0, REPLIES_COLLAPSED_AFTER);
  const statusOptions: readonly CommentStatus[] = mode === 'internal' ? COMMENT_STATUSES : SHARE_SETTABLE_COMMENT_STATUSES;
  // A share link may not reopen: once closed, the menu is gone for it.
  const canSetStatus = canComment && (mode === 'internal' || (thread.status !== 'done' && thread.status !== 'wont_do'));

  const meta = (row: CommentPanelRow) => (
    <>
      <span className="font-medium text-gray-700">{row.author_name}</span>
      {mode === 'internal' && row.via_share && (
        <Badge tone="blue" className="text-[10px]">via share link</Badge>
      )}
      {mode === 'internal' && row.internal_only && (
        <Badge tone="amber" className="text-[10px]">Internal only</Badge>
      )}
      <span>·</span>
      <span>{new Date(row.created_at).toLocaleString()}</span>
    </>
  );

  return (
    <li className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2" data-testid="comment-thread">
      <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
        {meta(thread)}
        <StatusBadge status={thread.status} />
        {canSetStatus && (
          <span className="ml-auto flex items-center gap-1">
            <span className="sr-only">Status</span>
            <select
              aria-label="Set status"
              value={thread.status}
              disabled={busy}
              onChange={(e) => onSetStatus(e.target.value as CommentStatus)}
              className="h-7 rounded border border-gray-300 bg-white px-1 text-xs"
            >
              {mode === 'shared' && <option value={thread.status}>{enumLabel('status', thread.status)}</option>}
              {statusOptions
                .filter((s) => mode === 'internal' || s !== thread.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {enumLabel('status', s)}
                  </option>
                ))}
            </select>
          </span>
        )}
      </div>
      <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{thread.body}</p>
      {renderAttachments?.(thread)}

      {thread.replies.length > 0 && (
        <ul className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
          {visibleReplies.map((reply) => (
            <li key={reply.id} data-testid="comment-reply">
              <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">{meta(reply)}</div>
              <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{reply.body}</p>
              {renderAttachments?.(reply)}
            </li>
          ))}
          {hidden > 0 && !showAll && (
            <li>
              <button type="button" onClick={() => setShowAll(true)} className="text-xs text-[var(--brand-primary)] hover:underline">
                Show {hidden} more
              </button>
            </li>
          )}
        </ul>
      )}

      {canComment && (
        <form
          className="mt-2 flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!replyBody.trim()) return;
            setReplying(true);
            void onReply(replyBody, replyFiles).then((ok) => {
              if (ok) {
                setReplyBody('');
                setReplyFiles([]);
              }
              setReplying(false);
            });
          }}
        >
          <input
            type="text"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Reply…"
            aria-label="Reply"
            maxLength={4000}
            className="h-8 flex-1 rounded-md border border-gray-300 bg-white px-2 text-xs"
          />
          <button
            type="submit"
            disabled={replying || !replyBody.trim()}
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 disabled:opacity-50"
          >
            Reply
          </button>
          <div className="w-full">
            <AttachmentPicker files={replyFiles} onChange={setReplyFiles} disabled={replying} />
          </div>
        </form>
      )}
    </li>
  );
}
