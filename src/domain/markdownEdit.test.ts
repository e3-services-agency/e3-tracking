import { describe, it, expect } from 'vitest';
import {
  wrapSelection, toggleLinePrefix, continueList, indentList, insertLink, resolveAttachmentSrc, externalHost, attachmentImageMarkdown,
} from './markdownEdit';

describe('markdownEdit', () => {
  it('wraps and unwraps', () => {
    const w = wrapSelection({ text: 'a bold b', start: 2, end: 6 }, '**');
    expect(w.text).toBe('a **bold** b');
    expect(w.text.slice(w.start, w.end)).toBe('bold');
    expect(wrapSelection(w, '**').text).toBe('a bold b');
    // wrapper only unwraps when outside the selection; snake_case is left alone
    expect(wrapSelection({ text: 'a_b_c', start: 2, end: 3 }, '*').text).toBe('a_*b*_c');
  });
  it('toggles list prefixes over several lines', () => {
    const a = toggleLinePrefix({ text: 'one\ntwo', start: 0, end: 7 }, 'number');
    expect(a.text).toBe('1. one\n2. two');
    expect(toggleLinePrefix(a, 'number').text).toBe('one\ntwo');
    expect(toggleLinePrefix({ text: '- x', start: 0, end: 3 }, 'task').text).toBe('- [ ] x');
    expect(toggleLinePrefix({ text: 'q', start: 0, end: 1 }, 'quote').text).toBe('> q');
  });
  it('continues lists and exits on an empty item', () => {
    expect(continueList({ text: '- a', start: 3, end: 3 })!.text).toBe('- a\n- ');
    expect(continueList({ text: '2. a', start: 4, end: 4 })!.text).toBe('2. a\n3. ');
    expect(continueList({ text: '- [x] a', start: 7, end: 7 })!.text).toBe('- [x] a\n- [ ] ');
    expect(continueList({ text: '- a\n- ', start: 6, end: 6 })!.text).toBe('- a\n');
    expect(continueList({ text: 'plain', start: 5, end: 5 })).toBeNull();
  });
  it('indents and outdents list lines only', () => {
    expect(indentList({ text: '- a', start: 3, end: 3 }, false)!.text).toBe('  - a');
    expect(indentList({ text: '  - a', start: 5, end: 5 }, true)!.text).toBe('- a');
    expect(indentList({ text: 'a', start: 1, end: 1 }, false)).toBeNull();
  });
  it('handles caret at 0 on an empty first line and splits lines', () => {
    expect(toggleLinePrefix({ text: '\nabc', start: 0, end: 0 }, 'bullet').text).toBe('- \nabc');
    expect(continueList({ text: '- \nrest', start: 2, end: 2 })!.text).toBe('\nrest');
    expect(continueList({ text: '- ab cd', start: 4, end: 4 })!.text).toBe('- ab\n-  cd');
  });
  it('inserts a link and selects the url', () => {
    const r = insertLink({ text: 'see docs', start: 4, end: 8 });
    expect(r.text).toBe('see [docs](https://)');
    expect(r.text.slice(r.start, r.end)).toBe('https://');
  });
  it('resolves attachment images and hosts', () => {
    const att = [{ id: 'a1', file_path: 'p/x.png' }];
    const f = (p: string) => `/files/${p}`;
    expect(resolveAttachmentSrc('attachment:a1', att, f)).toBe('/files/p/x.png');
    expect(resolveAttachmentSrc('attachment:zz', att, f)).toBeNull();
    expect(resolveAttachmentSrc('https://x/y.png', att, f)).toBeNull();
    expect(attachmentImageMarkdown('a1', 'sh[o]t')).toBe('![shot](attachment:a1)');
    expect(externalHost('https://example.com/a')).toBe('example.com');
    expect(externalHost('/local')).toBeNull();
    expect(externalHost('//cdn.example.com/x')).toBe('cdn.example.com');
  });
});
