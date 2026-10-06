/**
 * Hover hint helper (T-4-24, item 1): a `title` tooltip for a form label or table column header,
 * sourced from `src/domain/fieldHints.ts`. `FieldHint` wraps arbitrary content; pages that already
 * render a `<label>`/`<th>` use `title={hintFor('Name', 'Events')}` directly.
 */
import React from 'react';
import { hintFor } from '@/src/domain/fieldHints';

export { hintFor };

export function FieldHint({ label, scope, children }: { label: string; scope?: string; children?: React.ReactNode }) {
  return <span title={hintFor(label, scope)}>{children ?? label}</span>;
}
