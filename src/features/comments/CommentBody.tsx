/**
 * `CommentBody` (D-71, T-5-05): renders a comment's Markdown through the one `MarkdownView`, in the
 * internal panels, the Comments page and the shared view. `attachment:<id>` images resolve against
 * the comment's own attachments with the view's files URL; raw HTML is never rendered.
 */
import React from 'react';
import { MarkdownView } from '@/src/components/ui/MarkdownView';
import { resolveAttachmentSrc } from '@/src/domain/markdownEdit';
import type { CommentAttachmentItem } from './CommentAttachments';

export function CommentBody({
  body,
  attachments,
  fileUrl,
  className = '',
}: {
  body: string;
  attachments?: CommentAttachmentItem[];
  fileUrl: (path: string) => string;
  className?: string;
}) {
  return (
    <div className={`text-sm text-gray-900 ${className}`} data-testid="comment-body">
      <MarkdownView source={body} resolveImage={(src) => resolveAttachmentSrc(src, attachments, fileUrl)} />
    </div>
  );
}
