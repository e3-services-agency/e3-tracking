/**
 * Catalogs table (T-5-40, D-88): name, kind, market and language, version (live highlighted),
 * mapping role and status; a field count when the rows carry their fields (public document).
 */
import React, { useMemo, useState } from 'react';
import { Badge, StatusBadge } from '@/src/components/ui/badges';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { HintTh } from '@/src/components/ui/FieldHint';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { CATALOG_KINDS, ENTITY_STATUSES } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import { ActionsCell, CELL, HEAD_TEXT, NoMatchRow, OrDash, RowName, ViewFrame, ViewRow, ViewToolbar, useDensity } from './ViewParts';
import { filterOptions, matchesFilter, matchesSearch, withKnownOrder } from './viewModel';
import type { CatalogViewRow, ViewSlots } from './types';

export function CatalogsTable({ rows, rowActions, onOpen, commentCount, commentsInActions, readOnly = false, empty, toolbarExtra }: ViewSlots<CatalogViewRow>) {
  const [density, setDensity] = useDensity();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [kindFilter, setKindFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const visible = useMemo(
    () =>
      rows.filter(
        (c) =>
          matchesFilter(kindFilter, c.kind) &&
          matchesFilter(statusFilter, c.status) &&
          matchesSearch(debouncedSearch, c.name, c.description, c.market_label)
      ),
    [rows, kindFilter, statusFilter, debouncedSearch]
  );

  const cell = CELL[density];
  const hasActions = !!(rowActions || commentCount);
  const showFields = rows.some((c) => c.field_count !== null);
  const colSpan = 6 + (showFields ? 1 : 0) + (hasActions ? 1 : 0);
  const kindOptions = withKnownOrder(CATALOG_KINDS, filterOptions(rows, (c) => c.kind));
  const statusOptions = withKnownOrder(ENTITY_STATUSES, filterOptions(rows, (c) => c.status));

  return (
    <div className="space-y-3">
      <ViewToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Search catalogs"
        density={density}
        onDensity={setDensity}
        filters={[
          { label: 'Filter by kind', value: kindFilter, onChange: setKindFilter, allLabel: 'All kinds', options: kindOptions.map((k) => ({ value: k, label: k })) },
          { label: 'Filter by status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All statuses', options: statusOptions.map((s) => ({ value: s, label: enumLabel('status', s) })) },
        ]}
      >
        {toolbarExtra}
      </ViewToolbar>
      <ViewFrame label="Catalogs">
        <thead className="border-b bg-gray-50">
          <tr>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Name" hintScope="Catalogs">Name</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Kind" hintScope="Catalogs">Kind</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Market / language" hintScope="Catalogs">Market / language</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Version" hintScope="Catalogs">Version</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Mapping role" hintScope="Catalogs">Mapping role</HintTh>
            <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Status" hintScope="Catalogs">Status</HintTh>
            {showFields && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Fields" hintScope="Catalogs">Fields</HintTh>}
            {hasActions && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Actions" hintScope="Catalogs">Actions</HintTh>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {visible.map((c) => {
            const open = onOpen ? () => onOpen(c) : undefined;
            return (
              <ViewRow key={c.id} onOpen={open} testId="catalog-row">
                <td className={`${cell} ${readOnly ? '' : 'max-w-xl'}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <EntityIcon kind="catalog" />
                    <RowName name={c.name} onOpen={open} />
                    <CopyNameButton name={c.name} />
                  </span>
                  {c.description && density === 'comfortable' && (
                    <span className={`mt-0.5 block text-xs text-gray-500 ${readOnly ? 'whitespace-pre-wrap' : 'truncate'}`} title={c.description}>{c.description}</span>
                  )}
                </td>
                <td className={`${cell} text-gray-500`}><OrDash value={c.kind} /></td>
                <td className={`${cell} text-gray-500`}><OrDash value={c.market_label} /></td>
                <td className={`${cell} whitespace-nowrap text-gray-500`}>
                  <OrDash value={c.version} />
                  {c.live && <Badge tone="green" className="ml-1.5">live</Badge>}
                </td>
                <td className={`${cell} text-gray-500`}><OrDash value={c.mapping_role} /></td>
                <td className={cell}><StatusBadge status={c.status} /></td>
                {showFields && <td className={`${cell} tabular-nums ${c.field_count ? 'text-gray-600' : 'text-gray-300'}`}>{c.field_count ?? '—'}</td>}
                {hasActions && <ActionsCell className={cell} count={commentCount?.(c) ?? 0} actions={rowActions?.(c)} commentsInActions={commentsInActions} />}
              </ViewRow>
            );
          })}
          {rows.length === 0 && empty && <EmptyState colSpan={colSpan} message={empty.message} actionLabel={empty.actionLabel} onAction={empty.onAction} />}
          {rows.length > 0 && visible.length === 0 && <NoMatchRow colSpan={colSpan} what="catalogs" />}
        </tbody>
      </ViewFrame>
    </div>
  );
}
