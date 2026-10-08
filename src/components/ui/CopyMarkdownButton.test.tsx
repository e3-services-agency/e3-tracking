// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CopyMarkdownButton } from './CopyMarkdownButton';
it('keeps compact copy accessible, copies exact payload without toggling the row, and announces both outcomes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); const toggle = vi.fn(); const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  try {
    await act(async () => root.render(<div onClick={toggle}><CopyMarkdownButton iconOnly label="Copy property complete_name as Markdown" getMarkdown={() => '# complete_name\nExact content'} /></div>));
    const button = node.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Copy property complete_name as Markdown');
    expect(button.title).toBe('Copy property complete_name as Markdown');
    expect(button.className.split(' ')).toContain('relative');
    expect(button.querySelector('span')!.className).toBe('sr-only');
    await act(async () => button.click());
    expect(copy).toHaveBeenCalledWith('# complete_name\nExact content'); expect(toggle).not.toHaveBeenCalled();
    expect(button.title).toBe('Copied'); expect(button.querySelector('[aria-live]')!.textContent).toBe('Copied');
    copy.mockRejectedValue(new Error('denied'));
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
    await act(async () => button.click());
    expect(button.title).toBe('Copy failed'); expect(button.querySelector('[aria-live]')!.textContent).toBe('Copy failed');
  } finally {
    await act(async () => root.unmount()); node.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  }
});
