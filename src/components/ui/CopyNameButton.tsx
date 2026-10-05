/**
 * Copy-name button (T-4-22): copies the exact entity name, nothing else, next to the name on the
 * shared page and the internal list pages and editors. Reuses `copyText` (T-4-14) with the same
 * "Copied" / "Copy failed" feedback as `CopyLinkButton`. Stops click propagation so it can sit
 * inside a clickable table row.
 */
import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from './clipboard';

export function CopyNameButton({ name, className = '' }: { name: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await copyText(name);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={state === 'copied' ? 'Name copied' : state === 'failed' ? 'Copy failed' : `Copy name "${name}"`}
      aria-label={`Copy name ${name}`}
      className={`shrink-0 inline-flex items-center gap-1 rounded p-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${className}`}
    >
      {state === 'copied' ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
      {state === 'copied' && <span role="status" className="text-green-700">Copied</span>}
      {state === 'failed' && <span role="status" className="text-red-700">Copy failed</span>}
    </button>
  );
}
