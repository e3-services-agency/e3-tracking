/** Copies only the supplied permitted thread; no entity export or hidden comment fetch. */
import type { CommentPanelRow } from './CommentsPanel';
import type { CommentAttachmentItem } from './CommentAttachments';

const metadata = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]<>#|]/g, (char) => `\\${char}`);
function attachmentUrl(attachment: CommentAttachmentItem, fileUrl: (path: string) => string, base: string): string {
  const url = new URL(fileUrl(attachment.file_path), base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Attachment URL unavailable.');
  return url.href.replace(/[<>]/g, (char) => encodeURIComponent(char));
}

/** Retains Markdown/code verbatim except attachment destinations. Unknown references contain no id/path. */
export function resolveMarkdownAttachments(body: string, attachments: readonly CommentAttachmentItem[], fileUrl: (path: string) => string, base: string): string {
  const urls = new Map(attachments.map((attachment) => [attachment.id, attachmentUrl(attachment, fileUrl, base)]));
  // Skip fenced and inline code. Process image/link destinations and reference definitions only.
  return body.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1[^\n]*(?:\n|$)|(`+)[^`]*?\2|(?<=\]\()[ \t]*<?attachment:([A-Za-z0-9_-]+)>?|(^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*)<?attachment:([A-Za-z0-9_-]+)>?/gm,
    (match, fence, inline, destinationId, prefix, referenceId) => {
      if (fence || inline) return match;
      const url = urls.get(destinationId ?? referenceId);
      return `${prefix ?? ''}${url ? `<${url}>` : '#attachment-unavailable'}`;
    });
}

export function commentToMarkdown(row: CommentPanelRow, permittedAttachments: readonly CommentAttachmentItem[], fileUrl: (path: string) => string, base: string): string {
  const author = metadata(row.author_name);
  const time = metadata(row.created_at);
  const body = resolveMarkdownAttachments(row.body, permittedAttachments, fileUrl, base);
  const attachments = (row.attachments ?? []).filter((attachment) => permittedAttachments.some((permitted) => permitted.id === attachment.id)).map((attachment, index) => `![Image ${index + 1}](<${attachmentUrl(attachment, fileUrl, base)}>)`);
  return [`### ${row.parent_id ? 'Reply' : 'Comment'} — ${author} · ${time}`, body, ...attachments].join('\n\n');
}

export function threadToMarkdown(thread: CommentPanelRow & { replies: CommentPanelRow[] }, fileUrl: (path: string) => string, base: string): string {
  const rows = [thread, ...thread.replies];
  const attachments = rows.flatMap((row) => row.attachments ?? []);
  return rows.map((row) => commentToMarkdown(row, attachments, fileUrl, base)).join('\n\n---\n\n');
}
