/** Copies the current page URL with the given anchor hash (T-4-14), or a given URL (T-5-42: a
 * portal item's own path). */
import React, { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { copyText } from '@/src/components/ui/clipboard';

export function anchorUrl(anchor: string): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}#${anchor}`;
}

export function CopyLinkButton({ anchor, url, label }: { anchor?: string; url?: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    const ok = await copyText(url ? new URL(url, window.location.origin).href : anchorUrl(anchor ?? ''));
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed' : `Copy link to ${label}`}
      aria-label={`Copy link to ${label}`}
      className="shrink-0 inline-flex items-center gap-1 p-1.5 text-xs rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900"
    >
      {state === 'copied' ? <Check size={14} className="text-green-600" /> : <Link2 size={14} />}
      {state === 'copied' && <span role="status">Copied</span>}
      {state === 'failed' && <span role="status" className="text-red-700">Copy failed</span>}
    </button>
  );
}
