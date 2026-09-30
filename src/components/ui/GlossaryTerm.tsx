/**
 * Wraps a term's first occurrence in a page header or table column with a native title-attribute
 * tooltip sourced from `src/domain/glossary.ts` (T-4-09). Deliberately plain (D-07 simplified UI):
 * a dotted underline plus the browser's own tooltip, no popover library.
 */
import React from 'react';
import { getGlossaryEntry } from '@/src/domain/glossary';

export function GlossaryTerm({ glossaryKey, children }: { glossaryKey: string; children: React.ReactNode }) {
  const entry = getGlossaryEntry(glossaryKey);
  if (!entry) return <>{children}</>;
  return (
    <span title={entry.definition} className="border-b border-dotted border-gray-400 cursor-help">
      {children}
    </span>
  );
}

/** T-4-21: a comparison id or finding kind rendered as its human label, the explanation (and next
 * step) in the tooltip; the raw id stays in the exports. Unknown ids render as they are. */
export function FindingTerm({ comparison, kind }: { comparison?: string; kind?: string }) {
  const id = comparison ? `comparison:${comparison}` : `kind:${kind}`;
  const entry = getGlossaryEntry(id);
  const raw = comparison ?? kind ?? '';
  if (!entry) return <>{raw}</>;
  return (
    <span title={entry.definition} className="border-b border-dotted border-gray-400 cursor-help">
      {entry.term}
    </span>
  );
}
