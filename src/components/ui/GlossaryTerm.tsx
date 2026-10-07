/**
 * Wraps a term's first occurrence in a page header or table column with a shared `Tooltip` (T-4-29)
 *  sourced from `src/domain/glossary.ts` (T-4-09). Deliberately plain (D-07 simplified UI):
 * a dotted underline plus the browser's own tooltip, no popover library.
 */
import React from 'react';
import { Tooltip } from './Tooltip';
import { getGlossaryEntry } from '@/src/domain/glossary';
import { findingTermParts } from '@/src/domain/findingsCatalog';

export function GlossaryTerm({ glossaryKey, children }: { glossaryKey: string; children: React.ReactNode }) {
  const entry = getGlossaryEntry(glossaryKey);
  if (!entry) return <>{children}</>;
  return (
    <Tooltip content={entry.definition} className="border-b border-dotted border-gray-400 cursor-help">
      {children}
    </Tooltip>
  );
}

/** T-4-21: a comparison id or finding kind rendered as its human label, the explanation (and next
 * step) in the tooltip; the raw id stays in the exports. Unknown ids render as they are. */
export function FindingTerm({ comparison, kind }: { comparison?: string; kind?: string }) {
  const { label, tooltip } = findingTermParts({ comparison, kind });
  if (!tooltip) return <>{label}</>;
  return (
    <Tooltip content={tooltip} className="border-b border-dotted border-gray-400 cursor-help">
      {label}
    </Tooltip>
  );
}
