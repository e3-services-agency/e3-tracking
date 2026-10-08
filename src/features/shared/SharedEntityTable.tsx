import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { HintTh } from '@/src/components/ui/FieldHint';
import type { EntityKind } from '@/src/components/layout/navIcons';

/** Semantic shared lists: fixed column allocation keeps long names independent of badges/actions.
 * A keyboard-scrollable region preserves readable columns on narrow screens. */
export function SharedEntityTable({ label, columns, children }: {
  label: string; columns: { label: string; width?: string }[]; children: React.ReactNode;
}) {
  return (
    <div role="region" aria-label={`${label} table`} tabIndex={0} className="overflow-x-auto rounded-md border bg-white focus-visible:outline-2 focus-visible:outline-[var(--color-info)]">
      <table className="w-full min-w-[720px] table-fixed text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <colgroup>{columns.map((c) => <col key={c.label} style={c.width ? { width: c.width } : undefined} />)}</colgroup>
        <thead className="border-b bg-gray-50 text-xs text-gray-500">
          <tr>{columns.map((c) => <HintTh key={c.label} scope="col" hintScope="Shared" className="px-3 py-3 font-semibold">{c.label}</HintTh>)}</tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function SharedEntityRow({ anchor, name, kind, expanded, onToggle, cells, children, badges, scrollMarginTop }: {
  anchor?: string; name: string; kind?: EntityKind; expanded?: boolean; onToggle?: () => void;
  cells: React.ReactNode[]; children?: React.ReactNode; badges?: React.ReactNode; scrollMarginTop?: number;
}) {
  const contentId = anchor ? `${anchor}-details` : undefined;
  const title = <>{kind && <EntityIcon kind={kind} />}<span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">{name}</span></>;
  return (
    <>
      <tr id={anchor} style={{ scrollMarginTop }} className={expanded ? 'bg-gray-50/60' : 'bg-white hover:bg-gray-50/60'}>
        <th scope="row" className="px-3 py-3 align-top font-semibold text-gray-900">
          {onToggle ? (
            <button type="button" onClick={onToggle} aria-expanded={!!expanded} aria-controls={expanded ? contentId : undefined} className="flex w-full items-start gap-2 text-left rounded focus-visible:outline-2 focus-visible:outline-[var(--color-info)]">
              {expanded ? <ChevronDown size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
              {title}
            </button>
          ) : <span className="flex items-start gap-2">{title}</span>}
          {badges && <div className="mt-2 flex flex-wrap gap-1.5 font-normal">{badges}</div>}
        </th>
        {cells.map((cell, i) => <td key={i} className="px-3 py-3 align-top text-gray-600 whitespace-pre-wrap [overflow-wrap:anywhere]">{cell ?? '—'}</td>)}
      </tr>
      {expanded && children && <tr><td id={contentId} colSpan={cells.length + 1} className="border-t bg-white p-4">{children}</td></tr>}
    </>
  );
}
