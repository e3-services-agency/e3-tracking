/**
 * Standard events table (T-5-40, D-88): each Bloomreach standard event with the project event and
 * variant it maps to. Unmapped rows stay muted; the mapping filter narrows to mapped or unmapped.
 */
import React, { useMemo, useState } from 'react';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { HintTh } from '@/src/components/ui/FieldHint';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { ActionsCell, CELL, EmptyDash, HEAD_TEXT, NoMatchRow, RowName, ViewFrame, ViewRow, ViewToolbar, useDensity } from './ViewParts';
import { matchesSearch } from './viewModel';
import type { StandardEventViewRow, ViewSlots } from './types';

export interface StandardEventsTableProps extends ViewSlots<StandardEventViewRow> {
  /** Mappings still loading: the mapped columns say so instead of a dash. */
  loading?: boolean;
}

export function StandardEventsTable({ rows, rowActions, onOpen, commentCount, commentsInActions, empty, toolbarExtra, loading = false }: StandardEventsTableProps) {
  const [density, setDensity] = useDensity();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [mappedFilter, setMappedFilter] = useState('');

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mappedFilter || (mappedFilter === 'mapped') === !!r.event_name) &&
          matchesSearch(debouncedSearch, r.key, r.event_name, r.variant_name)
      ),
    [rows, mappedFilter, debouncedSearch]
  );

  const cell = CELL[density];
  const hasActions = !!(rowActions || commentCount);
  const colSpan = 4 + (hasActions ? 1 : 0);
  const pending = <span className="text-xs text-gray-400">Loading…</span>;

  return (
    <div className="space-y-3">
      <ViewToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Search standard events"
        placeholder="Search standard event or mapped event"
        density={density}
        onDensity={setDensity}
        filters={[
          { label: 'Filter by mapping', value: mappedFilter, onChange: setMappedFilter, allLabel: 'Mapped and unmapped', options: [{ value: 'mapped', label: 'Mapped' }, { value: 'unmapped', label: 'Not mapped' }] },
        ]}
      >
        {toolbarExtra}
      </ViewToolbar>
      <ViewFrame label="Standard events">
        <thead className="border-b bg-gray-50">
          <tr>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Standard event" hintScope="StandardEvents">Standard event</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Fields" hintScope="StandardEvents">Fields</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Mapped event" hintScope="StandardEvents">Mapped event</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Variant" hintScope="StandardEvents">Variant</HintTh>
            {hasActions && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Actions" hintScope="StandardEvents">Actions</HintTh>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {visible.map((r) => {
            const open = onOpen ? () => onOpen(r) : undefined;
            return (
              <ViewRow key={r.id} onOpen={open} testId="standard-event-row">
                <td className={cell}>
                  <span className="inline-flex items-center gap-1.5">
                    <RowName name={r.key} onOpen={open} mono />
                    <CopyNameButton name={r.key} />
                  </span>
                </td>
                <td className={`${cell} tabular-nums text-gray-500`}>
                  {r.mapped_field_count === null ? r.field_count : `${r.mapped_field_count} / ${r.field_count}`}
                </td>
                <td className={`${cell} text-gray-700`}>{loading ? pending : r.event_name ?? <EmptyDash />}</td>
                <td className={`${cell} font-mono text-gray-500`}>{loading ? pending : r.variant_name ?? <EmptyDash />}</td>
                {hasActions && <ActionsCell className={cell} count={commentCount?.(r) ?? 0} actions={rowActions?.(r)} commentsInActions={commentsInActions} />}
              </ViewRow>
            );
          })}
          {rows.length === 0 && empty && <EmptyState colSpan={colSpan} message={empty.message} actionLabel={empty.actionLabel} onAction={empty.onAction} />}
          {rows.length > 0 && visible.length === 0 && <NoMatchRow colSpan={colSpan} what="standard events" />}
        </tbody>
      </ViewFrame>
    </div>
  );
}
