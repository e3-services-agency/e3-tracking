import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBody } from './CommentBody';

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
});
