/**
 * `useSortableTable` (T-4-24, item 7): click a column header to sort asc, again for desc, a third
 * time to return to the natural order. One hook for the Events, Properties, Findings, QA runs and
 * Use cases tables; `SortableTh` renders the header cell with the arrow and `aria-sort`.
 */
import React, { useMemo, useState } from 'react';
import { sortRows, type SortDir, type SortValue } from '@/src/domain/sortRows';

export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

export interface SortState {
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
}

export function useSortableTable<T>(rows: readonly T[], accessors: SortAccessors<T>) {
  const [key, setKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>('asc');

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
  title,
  children,
}: {
  sort: SortState;
  column: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const active = sort.key === column;
  return (
    <th
      className={`${className} cursor-pointer select-none`}
      title={title}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => sort.toggle(column)}
    >
      {children}
      <span className="ml-1 text-gray-400" aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
    </th>
  );
}
