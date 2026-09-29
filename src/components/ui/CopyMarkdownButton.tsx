/**
 * "Copy as Markdown" button (T-4-13). `getMarkdown` may be sync or async (the use case page fetches
 * the tracking document on click). Uses `navigator.clipboard`, falling back to a hidden textarea
 * plus `document.execCommand('copy')` where the async clipboard API is unavailable (plain http).
 */
import React, { useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyMarkdownButton({
  getMarkdown,
  label = 'Copy as Markdown',
  className = '',
}: {
  getMarkdown: () => string | Promise<string>;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const onClick = async () => {
    let ok = false;
    try {
      ok = await copyTextToClipboard(await getMarkdown());
    } catch {
      ok = false;
    }
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 ${className}`}
    >
      {state === 'copied' ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
