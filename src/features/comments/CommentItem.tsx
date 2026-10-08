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
import { CommentReactions } from './CommentReactions';
import type { CommentReactionKind } from '@/src/domain/enums';
import { AttachmentPicker } from './CommentAttachments';
import { CommentBody, threadAttachments as threadAttachmentsOf } from './CommentBody';
import { CommentAvatar } from './CommentIdentity';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';
import { COMMENT_BODY_MAX, resolveAttachmentSrc } from '@/src/domain/markdownEdit';

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
  fileUrl,
  onReact,
  ownName = '',
  nameMissing = false,
  nameRequired = false,
  composerIdentity,
  identityReady = true,
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
  /** Files URL of the current view; resolves `attachment:<id>` images in Markdown bodies (D-71). */
  fileUrl: (path: string) => string;
  /** T-5-03: reaction toggle (any comment id, root or reply); omit to hide the row. */
  onReact?: (comment: CommentPanelRow, kind: CommentReactionKind) => void;
  /** Shared visitor's remembered name (to highlight their own reactions). */
  ownName?: string;
  /** Shared view with no name entered yet: the reply box says so instead of posting. */
  nameMissing?: boolean;
  /** Shared link requires a name: reactions and status changes are blocked until one is entered. */
  nameRequired?: boolean;
  /** Shared root/reply attribution UI, kept synchronized by the parent external store. */
  composerIdentity?: React.ReactNode;
  identityReady?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  const hidden = thread.replies.length - REPLIES_COLLAPSED_AFTER;
  const visibleReplies = showAll || hidden <= 0 ? thread.replies : thread.replies.slice(0, REPLIES_COLLAPSED_AFTER);
  const statusOptions: readonly CommentStatus[] = mode === 'internal' ? COMMENT_STATUSES : SHARE_SETTABLE_COMMENT_STATUSES;
  // A share link may not reopen: once closed, the menu is gone for it.
  const canSetStatus = canComment && (mode === 'internal' || (thread.status !== 'done' && thread.status !== 'wont_do'));

  // An `attachment:<id>` reference resolves across the whole thread (root and every reply).
  const threadAttachments = threadAttachmentsOf(thread, thread.replies);

  const sendReply = () => {
    if (!replyBody.trim() || replying || !identityReady) return;
    if (nameMissing) {
      setReplyError('Enter your name first.');
      return;
    }
    setReplyError(null);
    setReplying(true);
    void onReply(replyBody, replyFiles).then((ok) => {
      if (ok) {
        setReplyBody('');
        setReplyFiles([]);
      }
      setReplying(false);
    });
  };

  const reactionsRow = (row: CommentPanelRow, isRoot: boolean) =>
    onReact ? (
      <CommentReactions
        reactions={identityReady ? row.reactions : row.reactions?.map((reaction) => ({ ...reaction, mine: false }))}
        isRoot={isRoot}
        ownName={ownName}
        nameRequired={nameRequired}
        busy={busy}
        onReact={(kind) => onReact(row, kind)}
      />
    ) : null;

  const meta = (row: CommentPanelRow) => (
    <>
      <CommentAvatar name={row.author_name} avatarUrl={row.avatar_url} kind={row.author_kind} />
      <span className="font-medium text-gray-700">{row.author_name}</span>
      {row.author_kind && row.author_kind !== 'legacy' && <span className="text-[10px] text-gray-500">{row.author_kind === 'guest' ? 'Guest' : row.author_kind === 'google' ? 'Google account' : 'Signed-in account'}</span>}
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
              value={mode === 'shared' ? '' : thread.status}
              disabled={busy || nameRequired}
              onChange={(e) => {
                if (!e.target.value) return;
                onSetStatus(e.target.value as CommentStatus);
              }}
              className="h-7 rounded border border-gray-300 bg-white px-1 text-xs"
            >
              {mode === 'shared' && <option value="" disabled>Set status…</option>}
              {statusOptions
                .filter((s) => mode === 'internal' || s !== thread.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {enumLabel('status', s)}
                  </option>
                ))}
            </select>
            {nameRequired && <span className="text-[11px] text-red-700">Enter your name first.</span>}
          </span>
        )}
      </div>
      <CommentBody className="mt-1" body={thread.body} attachments={threadAttachments} fileUrl={fileUrl} />
      {renderAttachments?.(thread)}
      {reactionsRow(thread, true)}

      {thread.replies.length > 0 && (
        <ul className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
          {visibleReplies.map((reply) => (
            <li key={reply.id} data-testid="comment-reply">
              <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">{meta(reply)}</div>
              <CommentBody className="mt-0.5" body={reply.body} attachments={threadAttachments} fileUrl={fileUrl} />
              {renderAttachments?.(reply)}
              {reactionsRow(reply, false)}
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
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendReply();
          }}
        >
          {composerIdentity}
          <MarkdownEditor
            value={replyBody}
            onChange={setReplyBody}
            onSubmit={sendReply}
            placeholder="Reply…"
            ariaLabel="Reply"
            rows={2}
            maxLength={COMMENT_BODY_MAX}
            disabled={replying}
            attachments={threadAttachments.map((a, i) => ({ id: a.id, label: `Image ${i + 1}` }))}
            pendingNames={replyFiles.map((f) => f.name)}
            resolveImage={(src) => resolveAttachmentSrc(src, threadAttachments, fileUrl)}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={replying || !identityReady || !replyBody.trim()}
              className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 disabled:opacity-50"
            >
              Reply
            </button>
            {replyError && <span className="text-[11px] text-red-700 self-center">{replyError}</span>}
          </div>
          <AttachmentPicker files={replyFiles} onChange={setReplyFiles} disabled={replying} />
        </form>
      )}
    </li>
  );
}
