/**
 * One layout rule for every page (T-4-12, D-07): a left-aligned content column capped at
 * `PAGE_MAX_WIDTH_CLASS`; scrolling happens once, on the surrounding `<main>` in `Layout.tsx`
 * (pages must not add their own `overflow-y-auto` scrollers). Tables and matrices use the full
 * content width; forms and cards use `FORM_CARD_WIDTH_CLASS`.
 */
import React from 'react';

export const PAGE_MAX_WIDTH_CLASS = 'max-w-[1400px]';
/** Width cap for forms and standalone cards; tables and matrices stay full width. */
export const FORM_CARD_WIDTH_CLASS = 'w-full max-w-3xl';

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className={`w-full ${PAGE_MAX_WIDTH_CLASS} flex-1 flex flex-col`}>{children}</div>;
}
