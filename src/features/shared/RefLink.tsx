/**
 * Cross-reference links (T-4-22). `resolveReference` (`references.ts`) decides where a reference
 * points; these two components only render it.
 *
 * - `SharedRefLink`: a same-page `#anchor` link; `onNavigate(anchor)` lets the page expand the target
 *   row and scroll to it (without it the browser's own hash navigation is used).
 * - `InternalRefLink`: opens the event card or the Properties editor through the store, the same
 *   pattern the Findings and Comments pages use. No `href` navigation, the store drives the tab.
 */
import React from 'react';
import { useStore } from '@/src/store';
import type { ReferenceTarget } from './references';

const LINK_CLASS = 'text-[var(--color-info)] hover:underline';

export function SharedRefLink({
  target,
  onNavigate,
  children,
}: {
  target: Extract<ReferenceTarget, { mode: 'shared' }>;
  onNavigate?: (anchor: string) => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={target.href}
      className={LINK_CLASS}
      onClick={(e) => {
        if (!onNavigate) return;
        e.preventDefault();
        onNavigate(target.anchor);
      }}
    >
      {children}
    </a>
  );
}

export function InternalRefLink({
  target,
  children,
}: {
  target: Extract<ReferenceTarget, { mode: 'internal' }>;
  children: React.ReactNode;
}) {
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const setSelectedItemIdToEdit = useStore((s) => s.setSelectedItemIdToEdit);
  return (
    <button
      type="button"
      className={LINK_CLASS}
      onClick={(e) => {
        e.stopPropagation();
        if (target.tab === 'eventCard' && target.eventCardId) setEventCardEventId(target.eventCardId);
        if (target.tab === 'properties' && target.editId) setSelectedItemIdToEdit(target.editId);
        setRequestedTab(target.tab);
      }}
    >
      {children}
    </button>
  );
}
