/** Copies the current page URL with the given anchor hash (T-4-14). */
import React, { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

export function anchorUrl(anchor: string): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}#${anchor}`;
}

export function CopyLinkButton({ anchor, label }: { anchor: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(anchorUrl(anchor));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[CopyLinkButton] copy failed', err);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Link copied' : `Copy link to ${label}`}
      aria-label={`Copy link to ${label}`}
      className="shrink-0 p-1.5 rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900"
    >
      {copied ? <Check size={14} className="text-green-600" /> : <Link2 size={14} />}
    </button>
  );
}
