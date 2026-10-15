import React, { useId } from 'react';
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
    <div role="region" aria-label={`${label} table`} tabIndex={0} className="overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--color-info)]">
      <table className="w-full min-w-[720px] table-fixed text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <colgroup>{columns.map((c) => <col key={c.label} style={c.width ? { width: c.width } : undefined} />)}</colgroup>
        <thead className="border-b bg-gray-50 text-sm text-gray-500">
          <tr>{columns.map((c) => <HintTh key={c.label} scope="col" hintScope="Shared" className="px-4 py-2 text-xs font-medium">{c.label}</HintTh>)}</tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

/** An empty value reads as a faint dash so filled cells stand out (data-ink: the dash is not data). */
function isEmptyCell(cell: React.ReactNode): boolean {
  return cell === null || cell === undefined || cell === '' || cell === '—';
}

function EmptyCell() {
  return <span className="text-gray-300" aria-label="none">—</span>;
}

/** Secondary row actions (copy, link, Markdown): shown on row hover/focus/expand, always on touch (`.row-actions`, index.css). */
export function RowActions({ children }: { children: React.ReactNode }) {
  return <span className="row-actions inline-flex flex-nowrap items-center gap-1">{children}</span>;
}

export function SharedEntityRow({ anchor, name, kind, expanded, onToggle, cells, children, badges, nameSuffix, nameIndented = false, scrollMarginTop, highlighted = false }: {
  anchor?: string; name: string; kind?: EntityKind; expanded?: boolean; onToggle?: () => void;
  cells: React.ReactNode[]; children?: React.ReactNode; badges?: React.ReactNode; nameSuffix?: React.ReactNode; nameIndented?: boolean; scrollMarginTop?: number;
  /** T-5-42: the row a link landed on (marked until another link moves it). */
  highlighted?: boolean;
}) {
  const disclosureId = useId();
  const contentId = anchor ? `${anchor}-details` : undefined;
  const hasTextSelection = () => !!window.getSelection()?.toString().trim();
  const title = <>{kind && <EntityIcon kind={kind} />}<span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
    <span className={`min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap ${nameSuffix ? 'flex-1 basis-32' : ''}`}>{name}</span>
    {nameSuffix}
  </span></>;
  return (
    <>
      <tr id={anchor} style={{ scrollMarginTop }} className={`${highlighted ? 'bg-amber-50' : 'hover:bg-gray-50'} ${onToggle ? 'cursor-pointer' : ''}`}
        aria-current={highlighted || undefined} data-highlighted={highlighted || undefined}
        data-shared-expanded={expanded && onToggle ? 'true' : undefined}
        data-shared-name={name} data-shared-kind={kind} data-shared-disclosure={disclosureId}
        onClick={onToggle ? (event) => {
          if (event.defaultPrevented || event.button !== 0) return;
          const target = event.target as HTMLElement;
          const control = target.closest('button, a, input, select, textarea, label, summary, details, [role="button"], [role="link"], [contenteditable="true"], [tabindex]');
          if (control && event.currentTarget.contains(control)) return;
          if (hasTextSelection()) return;
          onToggle();
        } : undefined}>
        <th scope="row" className={`${nameIndented ? 'pl-8 pr-4' : 'px-4'} py-2 align-top font-medium text-gray-900`}>
          {onToggle ? (
            <button id={disclosureId} type="button" onClick={(event) => {
              // Native keyboard activation has detail 0; selecting a name with the pointer must not toggle it.
              if (event.defaultPrevented || (event.detail > 0 && hasTextSelection())) return;
              onToggle();
            }} aria-expanded={!!expanded} aria-controls={expanded ? contentId : undefined} className="flex w-full items-start gap-2 text-left rounded focus-visible:outline-2 focus-visible:outline-[var(--color-info)]">
              {expanded ? <ChevronDown size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
              {title}
            </button>
          ) : <span className="flex items-start gap-2">{title}</span>}
          {badges && <div className="mt-2 flex flex-wrap gap-1.5 font-normal">{badges}</div>}
        </th>
        {cells.map((cell, i) => <td key={i} className="px-4 py-2 align-top text-gray-600 whitespace-pre-wrap [overflow-wrap:anywhere]">{isEmptyCell(cell) ? <EmptyCell /> : cell}</td>)}
      </tr>
      {expanded && children && <tr><td id={contentId} colSpan={cells.length + 1} className="border-t bg-white p-4">{children}</td></tr>}
    </>
  );
}
