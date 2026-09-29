/**
 * One layout rule for every page (T-4-12, D-07): scrolling happens once, on the surrounding
 * `<main>` in `Layout.tsx` (pages must not add their own `overflow-y-auto` scrollers). `PageHeader`
 * and `PageBody` span the full width of `<main>` while their content is left-aligned and capped at
 * `PAGE_MAX_WIDTH_CLASS`, the single source of the 1400px. Tables and matrices use the full content
 * width; forms and cards use `FORM_CARD_WIDTH_CLASS`.
 */
import React from 'react';

export const PAGE_MAX_WIDTH_CLASS = 'max-w-[1400px]';
/** Width cap for forms and standalone cards; tables and matrices stay full width. */
export const FORM_CARD_WIDTH_CLASS = 'w-full max-w-3xl';

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="w-full flex-1 flex flex-col">{children}</div>;
}

/** Full-width header bar; `className` applies to the capped inner wrapper (e.g. `flex items-center justify-between`). */
export function PageHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="border-b bg-white">
      <div className={`${PAGE_MAX_WIDTH_CLASS} p-8 ${className}`.trim()}>{children}</div>
    </div>
  );
}

/** Full-width body region; `className` applies to the capped inner wrapper (e.g. `space-y-4`). */
export function PageBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex-1">
      <div className={`${PAGE_MAX_WIDTH_CLASS} p-8 ${className}`.trim()}>{children}</div>
    </div>
  );
}
