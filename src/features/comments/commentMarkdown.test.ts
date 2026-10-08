import { describe, expect, it } from 'vitest';
import { commentToMarkdown, resolveMarkdownAttachments, threadToMarkdown } from './commentMarkdown';
import type { CommentPanelRow } from './CommentsPanel';
const image = { id: 'image', file_path: 'project/comments/root/picture.png', mime: 'image/png', width: 10, height: 10 };
const row: CommentPanelRow = { id: 'root', author_name: 'Jane', body: '**Bold**\n\n- [x] Task\n\n![Root image](attachment:image)', via_share: true, parent_id: null, status: 'open', created_at: '2026-10-08T12:00:00Z', resolved_at: null, resolved_by: null, attachments: [image] };
const fileUrl = (path: string) => `/tracking-plan/api/shared/test-share/files/${path}`;
const base = 'https://tracking.example.test';
describe('permitted comment Markdown', () => {
  it('preserves author, timestamp, formatting and serves attachment references through the current view', () => {
    const markdown = commentToMarkdown(row, [image], fileUrl, base);
    expect(markdown).toContain('Jane');
    expect(markdown).toContain(row.created_at);
    expect(markdown).toContain('**Bold**\n\n- [x] Task');
    expect(markdown).toContain(`![Root image](<${base}${fileUrl(image.file_path)}>)`);
    expect(markdown).not.toContain('/api/projects/');
    expect(markdown).not.toContain('attachment:image');
  });
  it('resolves visible cross-reply attachments and includes every supplied reply in order', () => {
    const reply = { ...row, id: 'reply-3', parent_id: 'root', author_name: 'Guest', body: 'Later reply with ![Earlier image](attachment:image)', attachments: [] };
    const markdown = threadToMarkdown({ ...row, replies: [reply] }, fileUrl, base);
    expect(markdown.indexOf('Comment')).toBeLessThan(markdown.indexOf('Reply'));
    expect(markdown).toContain('Guest');
    expect(markdown).toContain(`![Earlier image](<${base}${fileUrl(image.file_path)}>)`);
  });
  it('does not turn missing or private references into file URLs, while code examples stay verbatim', () => {
    const body = '![Hidden](attachment:private-image)\n\n[visible]: attachment:image\n\n`attachment:image`\n\n```md\n![Example](attachment:image)\n```';
    const markdown = resolveMarkdownAttachments(body, [image], fileUrl, base);
    expect(markdown).toContain('![Hidden](#attachment-unavailable)');
    expect(markdown).not.toContain('private-image');
    expect(markdown).toContain(`[visible]: <${base}${fileUrl(image.file_path)}>`);
    expect(markdown).toContain('`attachment:image`');
    expect(markdown).toContain('```md\n![Example](attachment:image)\n```');
  });
  it('uses internal permitted URLs when copying from the staff view and escapes display metadata', () => {
    const markdown = commentToMarkdown({ ...row, author_name: 'Jane\n# injected' }, [image], (path) => `/tracking-plan/api/projects/project/files/${path}`, base);
    expect(markdown).toContain('/api/projects/project/files/');
    expect(markdown).not.toContain('/api/shared/');
    expect(markdown).not.toContain('Jane\n# injected');
  });
});
