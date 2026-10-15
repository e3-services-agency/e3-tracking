/**
 * Building blocks shared by every view table (T-5-40): the frame, the search and filter bar with
 * the density toggle, the faint empty dash, the actions cell (comment count always visible above
 * zero, other actions on hover) and a row that opens on click without stealing clicks from its
 * own controls or text selection.
 */
import React, { useCallback, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Input } from '@/src/components/ui/Input';
import { browserStorage, readDensity, writeDensity, type Density } from './viewModel';

/** Cell padding per density; headers use the same padding so columns line up. */
export const CELL: Record<Density, string> = {
  compact: 'px-3 py-1',
  comfortable: 'px-4 py-2.5',
};

export const HEAD_TEXT = 'font-medium text-gray-500 whitespace-nowrap';

/** The density this browser last chose, shared by every view table. */
export function useDensity(): [Density, (next: Density) => void] {
  const [density, setDensity] = useState<Density>(() => readDensity(browserStorage()));
  const update = useCallback((next: Density) => {
    setDensity(next);
    writeDensity(browserStorage(), next);
  }, []);
  return [density, update];
}

export function DensityToggle({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
  return (
    <span role="group" aria-label="Row density" className="inline-flex h-9 overflow-hidden rounded-md border border-gray-300 bg-white text-xs">
      {(['compact', 'comfortable'] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={density === d}
          onClick={() => onChange(d)}
          className={`px-2.5 ${density === d ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          {d === 'compact' ? 'Compact' : 'Comfortable'}
        </button>
      ))}
    </span>
  );
}

export interface FilterDef {
  /** Accessible name, e.g. "Filter by status". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Label of the "no filter" option, e.g. "All statuses". */
  allLabel: string;
  options: readonly { value: string; label: string }[];
}

export function ViewToolbar({
  search,
  onSearch,
  searchLabel,
  placeholder = 'Search name or description',
  filters = [],
  density,
  onDensity,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchLabel: string;
  placeholder?: string;
  filters?: readonly FilterDef[];
  density: Density;
  onDensity: (d: Density) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="view-toolbar">
      <Input type="search" aria-label={searchLabel} placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} className="h-9 w-64" />
      {filters.map((f) => (
        <select
          key={f.label}
          aria-label={f.label}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
        >
          <option value="">{f.allLabel}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
      {children}
      <span className="ml-auto">
        <DensityToggle density={density} onChange={onDensity} />
      </span>
    </div>
  );
}

export function ViewFrame({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={`${label} table`} className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className={`w-full text-left text-sm ${className}`}>{children}</table>
    </div>
  );
}

/** An empty value reads as a faint dash so filled cells stand out. */
export function EmptyDash() {
  return <span className="text-gray-300" aria-label="none">—</span>;
}

/** `value` or the faint dash. */
export function OrDash({ value }: { value: React.ReactNode }) {
  return value === null || value === undefined || value === '' ? <EmptyDash /> : <>{value}</>;
}

export function CommentCount({ count, className = '' }: { count: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-gray-700 ${className}`}
      title={`${count} comment${count === 1 ? '' : 's'}`}
      aria-label={`${count} comment${count === 1 ? '' : 's'}`}
      data-testid="view-comment-count"
    >
      <MessageSquare size={14} aria-hidden="true" />
      {count}
    </span>
  );
}

/** The comment count stays visible above zero; when the actions carry their own comment control,
 * the count steps aside on hover (`.row-idle`) so it does not show twice. */
export function ActionsCell({
  className,
  count,
  actions,
  commentsInActions = false,
}: {
  className: string;
  count: number;
  actions: React.ReactNode;
  commentsInActions?: boolean;
}) {
  return (
    <td className={`${className} whitespace-nowrap`}>
      <span className="inline-flex items-center gap-1">
        {count > 0 && <CommentCount count={count} className={commentsInActions && actions ? 'row-idle' : ''} />}
        {actions && <span className="row-actions inline-flex flex-nowrap items-center gap-1">{actions}</span>}
      </span>
    </td>
  );
}

const CONTROL = 'button, a, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable="true"]';

/** A body row. With `onOpen`, a click anywhere outside the row's own controls opens it. */
export function ViewRow({
  onOpen,
  className = '',
  children,
  testId,
}: {
  onOpen?: () => void;
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <tr
      data-testid={testId}
      className={`hover:bg-gray-50 ${onOpen ? 'cursor-pointer' : ''} ${className}`}
      onClick={
        onOpen
          ? (event) => {
              if (event.defaultPrevented || event.button !== 0) return;
              const control = (event.target as HTMLElement).closest?.(CONTROL);
              if (control && event.currentTarget.contains(control)) return;
              if (window.getSelection?.()?.toString().trim()) return;
              onOpen();
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

/** Row name: a button when the row opens (keyboard reachable), plain text otherwise. Never truncated. */
export function RowName({ name, onOpen, mono = false }: { name: string; onOpen?: () => void; mono?: boolean }) {
  // `break-word`, not `anywhere`: a long name still wraps, but the column never shrinks below its longest word.
  const cls = `font-medium text-gray-900 [overflow-wrap:break-word] ${mono ? 'font-mono' : ''}`;
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${cls} rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-info)]`}>
      {name}
    </button>
  ) : (
    <span className={cls}>{name}</span>
  );
}

/** Body row when rows exist but none match the search and filters. */
export function NoMatchRow({ colSpan, what }: { colSpan: number; what: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-gray-500">
        No {what} match this filter.
      </td>
    </tr>
  );
}
