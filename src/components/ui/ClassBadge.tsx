/**
 * Event class badge (T-4-19, item 5): sdk and platform events carry the Bloomreach accent
 * (`--brand-bloomreach`, defined in `src/index.css`); custom keeps the neutral style.
 */
import React from 'react';

export function isBloomreachClass(eventClass: string): boolean {
  return eventClass === 'sdk' || eventClass === 'platform';
}

export function ClassBadge({ eventClass, className = '' }: { eventClass: string; className?: string }) {
  const accent = isBloomreachClass(eventClass);
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${
        accent ? 'border-transparent bg-[var(--brand-bloomreach)] text-[var(--brand-bloomreach-text)]' : 'border-gray-200 bg-gray-50 text-gray-600'
      } ${className}`}
    >
      {eventClass}
    </span>
  );
}
