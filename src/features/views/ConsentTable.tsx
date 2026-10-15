/**
 * Consent categories table (T-5-40, D-88): the client category, the Bloomreach standard key it
 * maps to (missing key highlighted) and status, with reorder controls on the internal page.
 */
import React, { useMemo, useState } from 'react';
import { StatusBadge } from '@/src/components/ui/badges';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { HintTh } from '@/src/components/ui/FieldHint';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { ENTITY_STATUSES } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import { ActionsCell, CELL, HEAD_TEXT, NoMatchRow, RowName, ViewFrame, ViewRow, ViewToolbar, useDensity } from './ViewParts';
import { filterOptions, matchesFilter, matchesSearch, withKnownOrder } from './viewModel';
import type { ConsentViewRow, ViewSlots } from './types';

export interface ConsentTableProps extends ViewSlots<ConsentViewRow> {
  /** Reorder controls for the row at `index` in the unfiltered order; adds the Order column. */
  orderControls?: (row: ConsentViewRow, index: number) => React.ReactNode;
}

export function ConsentTable({ rows, rowActions, onOpen, commentCount, commentsInActions, readOnly = false, empty, toolbarExtra, highlightId, orderControls }: ConsentTableProps) {
  const [density, setDensity] = useDensity();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [statusFilter, setStatusFilter] = useState('');

  const indexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const visible = useMemo(
    () => rows.filter((c) => matchesFilter(statusFilter, c.status) && matchesSearch(debouncedSearch, c.name, c.standard_key)),
    [rows, statusFilter, debouncedSearch]
  );

  const cell = CELL[density];
  const showOrder = !readOnly && !!orderControls;
  const hasActions = !!(rowActions || commentCount);
  const colSpan = 3 + (showOrder ? 1 : 0) + (hasActions ? 1 : 0);
  const statusOptions = withKnownOrder(ENTITY_STATUSES, filterOptions(rows, (c) => c.status));

  return (
    <div className="space-y-3">
      <ViewToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Search consent categories"
        placeholder="Search category or standard key"
        density={density}
        onDensity={setDensity}
        filters={[
          { label: 'Filter by status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All statuses', options: statusOptions.map((s) => ({ value: s, label: enumLabel('status', s) })) },
        ]}
      >
        {toolbarExtra}
      </ViewToolbar>
      <ViewFrame label="Consent categories">
        <thead className="border-b bg-gray-50">
          <tr>
            {showOrder && <HintTh className={`${cell} ${HEAD_TEXT} w-20`} hint="Order" hintScope="Consents">Order</HintTh>}
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Client category" hintScope="Consents">Client category</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Standard key" hintScope="Consents">Standard key</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Status" hintScope="Consents">Status</HintTh>
            {hasActions && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Actions" hintScope="Consents">Actions</HintTh>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {visible.map((c) => {
            const open = onOpen ? () => onOpen(c) : undefined;
            return (
              <ViewRow key={c.id} testId="consent-row" rowId={c.id} highlighted={highlightId === c.id}>
                {showOrder && <td className={cell}>{orderControls!(c, indexById.get(c.id) ?? 0)}</td>}
                <td className={cell}>
                  <span className="inline-flex items-center gap-1.5">
                    <EntityIcon kind="consent" />
                    <RowName name={c.name} onOpen={open} />
                    <CopyNameButton name={c.name} />
                  </span>
                </td>
                <td className={cell}>
                  {c.standard_key ? <span className="font-mono text-gray-700">{c.standard_key}</span> : <span className="text-xs text-amber-700">not mapped</span>}
                </td>
                <td className={cell}><StatusBadge status={c.status} /></td>
                {hasActions && <ActionsCell className={cell} count={commentCount?.(c) ?? 0} actions={rowActions?.(c)} commentsInActions={commentsInActions} />}
              </ViewRow>
            );
          })}
          {rows.length === 0 && empty && <EmptyState colSpan={colSpan} message={empty.message} actionLabel={empty.actionLabel} onAction={empty.onAction} />}
          {rows.length > 0 && visible.length === 0 && <NoMatchRow colSpan={colSpan} what="consent categories" />}
        </tbody>
      </ViewFrame>
    </div>
  );
}
