/** T-4-26: presentational parts of the Properties table, mirroring the Events variant sub-rows. */
import React, { useRef } from 'react';
import { HintTh } from '@/src/components/ui/FieldHint';
import { useModalA11y } from '@/src/components/ui/useModalA11y';
import { Button } from '@/src/components/ui/Button';

export interface PropertyDefinitionSummary {
  id: string;
  name: string;
  description: string | null;
  using_events: { id: string; name: string }[];
}

export interface PropertyUsageEvent {
  id: string;
  name: string;
  role: string;
  definition_id: string | null;
}

export function DefinitionSubRows({
  definitions,
  colSpan,
  onOpenEvent,
}: {
  definitions: PropertyDefinitionSummary[];
  colSpan: number;
  onOpenEvent: (eventId: string) => void;
}) {
  return (
    <>
      {definitions.map((d) => (
        <tr key={d.id} className="bg-gray-50 text-xs text-gray-600">
          <td className="pl-24 pr-6 py-2 [overflow-wrap:anywhere]" colSpan={colSpan}>
            <span className="font-medium text-gray-800">{d.name}</span>
            {d.description && <span className="ml-2 text-gray-500">{d.description}</span>}
            <span className="ml-2 text-gray-500">
              {d.using_events.length === 0 ? 'not used by an event' : 'used by '}
              {d.using_events.map((e, i) => (
                <React.Fragment key={e.id}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onOpenEvent(e.id); }}
                    className="text-blue-600 hover:underline"
                  >
                    {e.name}
                  </button>
                </React.Fragment>
              ))}
            </span>
          </td>
        </tr>
      ))}
    </>
  );
}

export function UsedByModal({
  propertyName,
  events,
  definitions,
  onOpenEvent,
  onClose,
}: {
  propertyName: string;
  events: PropertyUsageEvent[];
  definitions: PropertyDefinitionSummary[];
  onOpenEvent: (eventId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(ref, onClose);
  const defName = (id: string | null) => definitions.find((d) => d.id === id)?.name ?? '-';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Events using ${propertyName}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg space-y-3"
      >
        <h2 className="text-base font-semibold text-gray-900">Used by: {propertyName}</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No event uses this property.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500"><HintTh className="py-1" hintScope="Properties">Event</HintTh><HintTh className="py-1" hintScope="Properties">Role</HintTh><HintTh className="py-1" hintScope="Properties">Definition</HintTh></tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5">
                    <button type="button" onClick={() => onOpenEvent(e.id)} className="text-blue-600 hover:underline">{e.name}</button>
                  </td>
                  <td className="py-1.5 text-gray-600">{e.role}</td>
                  <td className="py-1.5 text-gray-600">{defName(e.definition_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-end"><Button variant="outline" size="sm" onClick={onClose}>Close</Button></div>
      </div>
    </div>
  );
}

/** Toggle one id in an expanded set (pure, unit-tested). */
export function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** "Expand all" target: every id expanded unless they all already are (then none). */
export function toggleAll(current: Set<string>, ids: string[]): Set<string> {
  return ids.length > 0 && ids.every((id) => current.has(id)) ? new Set() : new Set(ids);
}
