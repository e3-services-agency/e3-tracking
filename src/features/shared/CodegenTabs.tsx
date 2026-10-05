/**
 * "Implementation" block (T-4-14, D-63 T-4-17): one tab strip per event, one snippet visible at a
 * time, the whole block collapsed until asked for. Which tabs exist depends on the event's
 * implementation method (client_web: GTM / dataLayer, Web SDK, Web SDK legacy, Tracking API;
 * server_api: Tracking API; sdk_auto: emitting call and SDK default properties). The snippet mounts
 * only when open. Shared by the internal event card and the shared view through `EventCardView`.
 */
import React, { useState } from 'react';
import { CodeBlock } from '@/src/components/ui/CodeBlock';
import { codegenTabsFor, defaultCodegenTab, type CodegenData, type CodegenTabId } from './codegenMethodTabs';

/** `defaultOpen`: the internal card starts expanded, the shared view collapsed. */
export function CodegenTabs({
  codegen,
  method,
  sourceMethod,
  defaultOpen = false,
}: {
  codegen: CodegenData;
  method?: string | null;
  /** D-62: the event's source collection method, picks the default tab. */
  sourceMethod?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const tabs = codegenTabsFor(codegen, method);
  const [tab, setTab] = useState<CodegenTabId | null>(null);
  const active = tabs.find((t) => t.key === tab) ?? defaultCodegenTab(tabs, sourceMethod);
  return (
    <div>
      {codegen.note && <p className="text-xs text-gray-600 mb-2">{codegen.note}</p>}
      {active && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-sm font-medium text-[var(--color-info)] hover:underline"
        >
          {open ? 'Hide implementation snippets' : 'Show implementation snippets'}
        </button>
      )}
      {open && active && (
        <div className="mt-3">
          <div role="tablist" className="flex gap-1 border-b mb-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === active.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium -mb-px border-b-2 ${
                  t.key === active.key ? 'border-[var(--color-info)] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <CodeBlock code={(codegen[active.key] as string | undefined) ?? ''} language={active.language} />
        </div>
      )}
    </div>
  );
}
