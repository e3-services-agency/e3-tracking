/**
 * Use cases table (T-5-40, D-88): code, name, type, status, with priority and owner on the
 * internal page only (the public document does not carry them) and a requirement count when the
 * rows carry their requirements.
 */
import {ConfigurationCell,QaEvidenceCell} from './Implementation';
import type {UseCaseImplementation} from '@/src/domain/assetLinks';
import React, { useMemo } from 'react';
import { PriorityBadge, StatusBadge } from '@/src/components/ui/badges';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { HintTh } from '@/src/components/ui/FieldHint';
import { SortableTh, useSortableTable } from '@/src/hooks/useSortableTable';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { useViewState } from '@/src/hooks/useViewState';
import { USE_CASE_STATUSES, USE_CASE_TYPES } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import { ActionsCell, CELL, HEAD_TEXT, NoMatchRow, OrDash, RowName, ViewFrame, ViewRow, ViewToolbar, useDensity } from './ViewParts';
import { filterOptions, matchesFilter, matchesSearch, withKnownOrder } from './viewModel';
import type { UseCaseViewRow, ViewSlots } from './types';

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function UseCasesTable({ rows, rowActions, onOpen, commentCount, commentsInActions, readOnly = false, empty, toolbarExtra, implementation }: ViewSlots<UseCaseViewRow>&{implementation?:Record<string,UseCaseImplementation>}) {
  const [density, setDensity] = useDensity();
  const [search, setSearch] = useViewState('search', '');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [statusFilter, setStatusFilter] = useViewState('status', '');
  const [typeFilter, setTypeFilter] = useViewState('type', '');

  const filtered = useMemo(
    () =>
      rows.filter(
        (u) =>
          matchesFilter(statusFilter, u.status) &&
          matchesFilter(typeFilter, u.type) &&
          matchesSearch(debouncedSearch, u.code, u.name, u.description, u.owner)
      ),
    [rows, statusFilter, typeFilter, debouncedSearch]
  );
  const { sorted, sort } = useSortableTable(filtered, {
    code: (u) => u.code,
    name: (u) => u.name,
    type: (u) => u.type,
    priority: (u) => PRIORITY_ORDER.indexOf(u.priority ?? '') + 1 || null,
    status: (u) => u.status,
    owner: (u) => u.owner,
    requirements: (u) => u.requirement_count,
  });

  const cell = CELL[density];
  const hasActions = !!(rowActions || commentCount);
  const showRequirements = rows.some((u) => u.requirement_count !== null);
  const colSpan = (implementation ? 2 : 0) + 4 + (readOnly ? 0 : 2) + (showRequirements ? 1 : 0) + (hasActions ? 1 : 0);
  const statusOptions = withKnownOrder(USE_CASE_STATUSES, filterOptions(rows, (u) => u.status));
  const typeOptions = withKnownOrder(USE_CASE_TYPES, filterOptions(rows, (u) => u.type));

  return (
    <div className="space-y-3">
      <ViewToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Search use cases"
        placeholder="Search code, name or description"
        density={density}
        onDensity={setDensity}
        filters={[
          { label: 'Filter by status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All statuses', options: statusOptions.map((s) => ({ value: s, label: enumLabel('status', s) })) },
          { label: 'Filter by type', value: typeFilter, onChange: setTypeFilter, allLabel: 'All types', options: typeOptions.map((t) => ({ value: t, label: enumLabel('use_case_type', t) })) },
        ]}
      >
        {toolbarExtra}
      </ViewToolbar>
      <ViewFrame label="Use cases">
        <thead className="border-b bg-gray-50">
          <tr>
            <SortableTh sort={sort} column="code" className={`${cell} ${HEAD_TEXT} w-24`} hint="Code" hintScope="UseCases">Code</SortableTh>
            <SortableTh sort={sort} column="name" className={`${cell} ${HEAD_TEXT}`} hint="Name" hintScope="UseCases">Name</SortableTh>
            <SortableTh sort={sort} column="type" className={`${cell} ${HEAD_TEXT}`} hint="Type" hintScope="UseCases">Type</SortableTh>
            {!readOnly && <SortableTh sort={sort} column="priority" className={`${cell} ${HEAD_TEXT}`} hint="Priority" hintScope="UseCases">Priority</SortableTh>}
            <SortableTh sort={sort} column="status" className={`${cell} ${HEAD_TEXT}`} hint="Status" hintScope="UseCases">{implementation?'Agreed lifecycle':'Status'}</SortableTh>
            {implementation&&<><HintTh className={`${cell} ${HEAD_TEXT}`} hint="Mapped configuration">Mapped configuration</HintTh><HintTh className={`${cell} ${HEAD_TEXT}`} hint="QA evidence">QA evidence</HintTh></>}
            {!readOnly && <SortableTh sort={sort} column="owner" className={`${cell} ${HEAD_TEXT}`} hint="Owner" hintScope="UseCases">Owner</SortableTh>}
            {showRequirements && <SortableTh sort={sort} column="requirements" className={`${cell} ${HEAD_TEXT}`} hint="Requirements" hintScope="UseCases">Requirements</SortableTh>}
            {hasActions && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Actions" hintScope="UseCases">Actions</HintTh>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((u) => {
            const open = onOpen ? () => onOpen(u) : undefined;
            return (
              <ViewRow key={u.id} onOpen={open} testId="use-case-row">
                <td className={`${cell} whitespace-nowrap text-gray-500`}><OrDash value={u.code} /></td>
                <td className={`${cell} ${readOnly ? '' : 'max-w-xl'}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <EntityIcon kind="use_case" />
                    <RowName name={u.name} onOpen={open} />
                    <CopyNameButton name={u.name} />
                  </span>
                  {u.description && density === 'comfortable' && (
                    <span className={`mt-0.5 block text-xs text-gray-500 ${readOnly ? 'whitespace-pre-wrap' : 'truncate'}`} title={u.description}>{u.description}</span>
                  )}
                </td>
                <td className={`${cell} text-gray-500`}><OrDash value={u.type ? enumLabel('use_case_type', u.type) : null} /></td>
                {!readOnly && <td className={cell}><PriorityBadge priority={u.priority} /></td>}
                <td className={cell}><StatusBadge status={u.status} /></td>
                {implementation&&<><td className={cell}><ConfigurationCell row={implementation[u.id]}/></td><td className={cell}><QaEvidenceCell row={implementation[u.id]}/></td></>}
                {!readOnly && <td className={`${cell} text-gray-500`}><OrDash value={u.owner} /></td>}
                {showRequirements && <td className={`${cell} tabular-nums ${u.requirement_count ? 'text-gray-600' : 'text-gray-300'}`}>{u.requirement_count ?? '—'}</td>}
                {hasActions && <ActionsCell className={cell} count={commentCount?.(u) ?? 0} actions={rowActions?.(u)} commentsInActions={commentsInActions} />}
              </ViewRow>
            );
          })}
          {rows.length === 0 && empty && <EmptyState colSpan={colSpan} message={empty.message} actionLabel={empty.actionLabel} onAction={empty.onAction} />}
          {rows.length > 0 && sorted.length === 0 && <NoMatchRow colSpan={colSpan} what="use cases" />}
        </tbody>
      </ViewFrame>
    </div>
  );
}
