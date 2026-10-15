/**
 * `useSortableTable` (T-4-24, item 7): click a column header to sort asc, again for desc, a third
 * time to return to the natural order. One hook for the Events, Properties, Findings, QA runs and
 * Use cases tables; `SortableTh` renders the header cell with the arrow and `aria-sort`.
 */
import React, { useMemo } from 'react';
import { hintFor, HintIcon, textOf } from '@/src/components/ui/FieldHint';
import { useTooltip } from '@/src/components/ui/Tooltip';
import { sortRows, type SortDir, type SortValue } from '@/src/domain/sortRows';
import { useViewState } from './useViewState';

export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

export interface SortState {
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
}

export function useSortableTable<T>(rows: readonly T[], accessors: SortAccessors<T>) {
  // Kept across visits inside a `ViewStateScope` (the portal lists, T-5-44); plain state otherwise.
  const [key, setKey] = useViewState<string | null>('sort.key', null);
  const [dir, setDir] = useViewState<SortDir>('sort.dir', 'asc');

  const toggle = (next: string) => {
    if (key !== next) {
      setKey(next);
      setDir('asc');
    } else if (dir === 'asc') {
      setDir('desc');
    } else {
      setKey(null);
      setDir('asc');
    }
  };

  const sorted = useMemo(
    () => sortRows(rows, key ? (accessors[key] ?? null) : null, dir),
    // accessors are declared inline by callers; the sort inputs are rows, key and dir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, key, dir]
  );

  return { sorted, sort: { key, dir, toggle } as SortState };
}

export function SortableTh({
  sort,
  column,
  className = '',
  hint,
  hintScope,
  children,
}: {
  sort: SortState;
  column: string;
  className?: string;
  hint?: string;
  hintScope?: string;
  children: React.ReactNode;
}) {
  const active = sort.key === column;
  const text = hintFor(hint ?? textOf(children), hintScope);
  const tip = useTooltip(text);
  return (
    <>
      <th
        className={className}
        ref={tip.anchorRef as React.Ref<HTMLTableCellElement>}
        onMouseEnter={tip.triggerProps.onMouseEnter}
        onMouseLeave={tip.triggerProps.onMouseLeave}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" onClick={() => sort.toggle(column)} className="inline-flex items-center font-[inherit] text-inherit select-none cursor-pointer">
          {children}
          <span className="ml-1 text-gray-400" aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
        </button>
        <HintIcon text={text} tip={tip} />
      </th>
      {tip.portal}
    </>
  );
}
