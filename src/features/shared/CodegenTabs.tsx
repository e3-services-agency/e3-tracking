/**
 * "Implementation" block (T-4-14): one tab strip per event (GTM / Web SDK / Tracking API), one
 * snippet visible at a time, the whole block collapsed until asked for. The snippet mounts only
 * when open. Shared by the internal event card and the shared view through `EventCardView`.
 */
import React, { useState } from 'react';
import { CodeBlock } from '@/src/components/ui/CodeBlock';
import { CODEGEN_TABS, selectCodegenTab, type CodegenTabKey } from './viewHelpers';

/** `defaultOpen`: the internal card starts expanded, the shared view collapsed. */
export function CodegenTabs({ codegen, defaultOpen = false }: { codegen: Record<CodegenTabKey, string>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<CodegenTabKey>(() => selectCodegenTab(codegen));
  const active = CODEGEN_TABS.find((t) => t.key === tab) ?? CODEGEN_TABS[0];
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-sm font-medium text-[var(--color-info)] hover:underline"
      >
        {open ? 'Hide implementation snippets' : 'Show implementation snippets'}
      </button>
      {open && (
        <div className="mt-3">
          <div role="tablist" className="flex gap-1 border-b mb-3">
            {CODEGEN_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === tab}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium -mb-px border-b-2 ${
                  t.key === tab ? 'border-[var(--color-info)] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <CodeBlock code={codegen[active.key] ?? ''} language={active.language} />
        </div>
      )}
    </div>
  );
}
