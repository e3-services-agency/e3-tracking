/**
 * "Set by" and "Carried by" cells for an identity rule (D-67 and amendment 1, T-4-28): the trigger
 * event, or a standalone call with no event, plus the rule's source as a `SourceBadge`.
 */
import React from 'react';
import { SourceBadge } from '@/src/components/ui/badges';
import type { IdentifierSetBy } from '@/src/domain/identity/identifiers';

export function SetByCell({ setBy, binds = [] }: { setBy: IdentifierSetBy | undefined; binds?: string[] }) {
  if (!setBy || setBy.kind === 'unknown') return <span className="text-gray-400">Not recorded</span>;
  const source = setBy.source ? (
    <SourceBadge system={setBy.source.system} method={setBy.source.method} color={setBy.source.color} label={setBy.source.name} />
  ) : null;
  if (setBy.kind === 'event') {
    return (
      <span className="flex flex-col gap-0.5">
        <span>Event: {setBy.event.name}</span>
        {source}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        Standalone {setBy.sdk_call ?? 'identify'} call{setBy.trigger_text ? ` on ${setBy.trigger_text}` : ''}
      </span>
      {binds.length > 1 && <span className="text-xs text-gray-400">binds {binds.join(', ')}</span>}
      {source}
    </span>
  );
}

export function CarriedByCell({ events }: { events: { id: string; name: string }[] | undefined }) {
  if (!events || events.length === 0) return <span className="text-gray-400">No event</span>;
  const shown = events.slice(0, 4).map((e) => e.name).join(', ');
  return <span title={events.map((e) => e.name).join(', ')}>{events.length > 4 ? `${shown} and ${events.length - 4} more` : shown}</span>;
}
