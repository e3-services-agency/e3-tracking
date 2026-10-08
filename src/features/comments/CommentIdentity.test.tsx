import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentIdentity, CommentAvatar } from './CommentIdentity';
import { CommentsPanel, type CommentPanelRow } from './CommentsPanel';
const participant = { name: 'Blue Otter', kind: 'guest' as const, avatar_url: null, verified: false, name_chosen: false };
describe('comment attribution UI', () => {
  it('shows guest animal and editable optional or required name', () => {
    const optional = renderToStaticMarkup(<CommentIdentity participant={participant} guestName="" onGuestNameChange={() => {}} />);
    expect(optional).toContain('Posting as'); expect(optional).toContain('Blue Otter'); expect(optional).toContain('🦦'); expect(optional).toContain('Your name (optional)');
    expect(renderToStaticMarkup(<CommentIdentity participant={participant} guestName="Alex" onGuestNameChange={() => {}} requireName />)).toContain('required=""');
  });
  it('shows loading/unavailable states without a fabricated posting name or avatar', () => {
    const pending = renderToStaticMarkup(<CommentIdentity participant={{ ...participant, name: '', ready: false, loading: true }} guestName="" onGuestNameChange={() => {}} />);
    expect(pending).toContain('Loading posting identity');
    expect(pending).not.toContain('Posting as');
    expect(pending).not.toContain('Blue Otter');
    expect(pending).not.toContain('🦦');
    const failed = renderToStaticMarkup(<CommentIdentity participant={{ ...participant, ready: false, loading: false, error: 'Posting identity unavailable. Retry before posting.' }} guestName="Alex" onGuestNameChange={() => {}} onRetry={() => {}} />);
    expect(failed).toContain('Retry');
    expect(failed).not.toContain('Posting as');
  });
  it('shows verified metadata without an editable impersonation field or arbitrary avatar URL', () => {
    const google = renderToStaticMarkup(<CommentIdentity participant={{ ...participant, kind: 'google', verified: true, name: 'Jane', avatar_url: 'https://lh3.googleusercontent.com/photo' }} guestName="Forged" onGuestNameChange={() => {}} />);
    expect(google).toContain('Jane'); expect(google).toContain('Google account'); expect(google).not.toContain('Forged'); expect(google).not.toContain('<input'); expect(google).toContain('no-referrer');
    expect(renderToStaticMarkup(<CommentAvatar name="Alex" avatarUrl="https://evil.test/photo" />)).not.toContain('<img');
  });
  it('renders synchronized editable attribution in both the root and reply editors', () => {
    const root: CommentPanelRow = { id: 'root', author_name: 'Original', via_share: true, body: 'Thread', created_at: '2026-10-08', resolved_at: null, resolved_by: null, parent_id: null, status: 'open', reactions: [{ kind: 'like', count: 1, authors: ['Original'], mine: true }] };
    const html = renderToStaticMarkup(<CommentsPanel entityType="event" entityId="event" api={{ mode: 'shared', token: 'test-share', access: 'comment' }} rows={[root]} />);
    expect(html.match(/data-testid="comment-identity"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Your name"/g)).toHaveLength(2);
    expect(html).toContain('Loading posting identity');
    expect(html).not.toContain('Posting as');
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Reply<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Post comment<\/button>/);
  });
});
