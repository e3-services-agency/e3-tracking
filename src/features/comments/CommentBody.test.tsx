import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBody, threadAttachments } from './CommentBody';

const att = [{ id: 'a1', file_path: 'comments/x.png', mime: 'image/png', width: 1, height: 1 }];
const render = (body: string) => renderToStaticMarkup(<CommentBody body={body} attachments={att} fileUrl={(p) => `/files/${p}`} />);

describe('CommentBody (server-side render; jsdom is not installed)', () => {
  it('escapes raw HTML', () => {
    const html = render('hi <script>alert(1)</script> <b onclick="x">y</b>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b ');
    expect(html).toContain('&lt;script&gt;');
  });
  it('external links get rel, target and the host suffix', () => {
    const html = render('[docs](https://example.com/a)');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('(example.com)');
  });
  it('resolves attachment images and drops unknown or remote ones to alt text', () => {
    expect(render('![shot](attachment:a1)')).toContain('src="/files/comments/x.png"');
    const unknown = render('![nope](attachment:zz) ![far](https://evil.test/p.png)');
    expect(unknown).not.toContain('<img');
    expect(unknown).toContain('nope');
  });
  it('renders formatting', () => {
    const html = render('**b** ~~s~~\n\n- [ ] t\n\n> q');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<del>s</del>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<blockquote>');
  });
  it('a reply can reference an attachment of the root (thread-wide pool)', () => {
    const pool = threadAttachments({ attachments: att }, [{ attachments: [] }]);
    const html = renderToStaticMarkup(<CommentBody body="![shot](attachment:a1)" attachments={pool} fileUrl={(p) => `/files/${p}`} />);
    expect(html).toContain('src="/files/comments/x.png"');
  });
  it('unsafe links render as plain text, protocol-relative links are external, URL text has no suffix', () => {
    const bad = render('[x](javascript:alert(1)) [y](data:text/html,hi)');
    expect(bad).not.toContain('<a');
    expect(bad).toContain('x');
    const rel = render('[cdn](//cdn.example.com/a)');
    expect(rel).toContain('target="_blank"');
    expect(rel).toContain('(cdn.example.com)');
    expect(render('<https://example.com/a>')).not.toContain('(example.com)');
  });
  it('fenced code renders in a pre, even one line without a language', () => {
    expect(render('```\nconst a = 1\n```')).toContain('<pre');
    expect(render('```text\nline1\nline2\n```')).toContain('<pre');
  });
});
