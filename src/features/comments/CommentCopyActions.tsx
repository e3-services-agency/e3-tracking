import React, { useState } from 'react';
import { ClipboardCopy, Copy, Link2 } from 'lucide-react';
import { copyText } from '@/src/components/ui/clipboard';
import type { CommentPanelRow } from './CommentsPanel';
import type { CommentLinkTarget } from './commentLinks';
import { commentToMarkdown, threadToMarkdown } from './commentMarkdown';
import { threadAttachments } from './CommentBody';

/** Each root and reply exposes labelled actions and persistent accessible clipboard feedback. */
export function CommentCopyActions({ mode, row, thread, getLink, fileUrl }: {
  mode: 'internal' | 'shared'; row: CommentPanelRow; thread: CommentPanelRow & { replies: CommentPanelRow[] };
  getLink: (target: CommentLinkTarget) => string; fileUrl: (path: string) => string;
}) {
  const [feedback, setFeedback] = useState('');
  const [copying, setCopying] = useState(false);
  const copy = async (kind: 'link' | 'markdown' | 'thread') => {
    if (copying) return;
    setCopying(true);
    setFeedback('');
    try {
      const base = window.location.origin;
      // Public projections already enforce this; keep export safe if a caller retains mixed rows.
      if (mode === 'shared' && (row.internal_only || thread.internal_only)) throw new Error('Comment unavailable.');
      const permittedThread = mode === 'shared' ? { ...thread, replies: thread.replies.filter((reply) => !reply.internal_only) } : thread;
      const text = kind === 'link' ? getLink({ entityType: row.entity_type as CommentLinkTarget['entityType'], entityId: row.entity_id!, threadId: thread.id, commentId: row.id })
        : kind === 'thread' ? threadToMarkdown(permittedThread, fileUrl, base)
        : commentToMarkdown(row, threadAttachments(permittedThread, permittedThread.replies), fileUrl, base);
      const ok = await copyText(text);
      setFeedback(ok ? kind === 'link' ? 'Link copied.' : kind === 'thread' ? 'Thread Markdown copied.' : 'Markdown copied.' : 'Copy failed. Your browser could not access the clipboard. Try again.');
    } catch { setFeedback('Copy failed. The link or Markdown is unavailable. Try again.'); }
    finally { setCopying(false); }
  };
  const buttonClass = 'inline-flex items-center gap-1 rounded border border-gray-200 bg-white p-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50';
  return <span className="inline-flex flex-wrap items-center gap-1">
    <button type="button" aria-label="Copy comment link" title="Copy comment link" aria-disabled={copying} className={buttonClass} onClick={() => void copy('link')}><Link2 size={14} aria-hidden="true" /><span className="sr-only">Copy link</span></button>
    <button type="button" aria-label="Copy comment Markdown" title="Copy comment Markdown" aria-disabled={copying} className={buttonClass} onClick={() => void copy('markdown')}><ClipboardCopy size={14} aria-hidden="true" /><span className="sr-only">Copy Markdown</span></button>
    {!row.parent_id && <button type="button" aria-label="Copy thread Markdown" title="Copy thread Markdown" aria-disabled={copying} className={buttonClass} onClick={() => void copy('thread')}><Copy size={14} aria-hidden="true" /><span className="sr-only">Copy thread Markdown</span></button>}
    <span role="status" aria-live="polite" className="text-xs">{feedback}</span>
  </span>;
}
