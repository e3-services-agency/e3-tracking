/**
 * Identity view (T-5-40, D-88): the identification flow, the rules table and the identity codegen.
 * The flow and the codegen come in as slots: the structured flow (`IdentificationFlowView`) is
 * owned by its own feature and passed in by the page, never rebuilt here. The internal page keeps
 * its own flow block and only uses the table part.
 */
import React, { useMemo, useState } from 'react';
import { StatusBadge } from '@/src/components/ui/badges';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { HintTh } from '@/src/components/ui/FieldHint';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { ENTITY_STATUSES, IDENTITY_TYPES } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import { CarriedByCell, SetByCell } from '@/src/features/identity/SetByCell';
import { ActionsCell, CELL, HEAD_TEXT, NoMatchRow, OrDash, RowName, ViewFrame, ViewRow, ViewToolbar, useDensity } from './ViewParts';
import { filterOptions, matchesFilter, matchesSearch, withKnownOrder } from './viewModel';
import type { IdentityRuleViewRow, ViewSlots } from './types';

export type IdentitySection = 'set_by' | 'carried_by';

export interface IdentityViewProps extends ViewSlots<IdentityRuleViewRow> {
  /** The identification flow above the table (e.g. `IdentificationFlowView`). */
  flow?: React.ReactNode;
  /** The identity codegen below the table. */
  codegen?: React.ReactNode;
  /** Reorder controls for the row at `index` in the unfiltered order; adds the Order column. */
  orderControls?: (row: IdentityRuleViewRow, index: number) => React.ReactNode;
  /** Opens the row's editor at one section (internal page: click on Set by or Carried by). */
  onOpenSection?: (row: IdentityRuleViewRow, section: IdentitySection) => void;
}

export function IdentityView({
  rows,
  rowActions,
  onOpen,
  commentCount,
  commentsInActions,
  readOnly = false,
  empty,
  toolbarExtra,
  highlightId,
  flow,
  codegen,
  orderControls,
  onOpenSection,
}: IdentityViewProps) {
  const [density, setDensity] = useDensity();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const indexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesFilter(typeFilter, r.identity_type) &&
          matchesFilter(statusFilter, r.status) &&
          matchesSearch(debouncedSearch, r.name, r.identifier_name, r.sdk_call, r.trigger_event, ...r.carried_by.map((e) => e.name))
      ),
    [rows, typeFilter, statusFilter, debouncedSearch]
  );

  const cell = CELL[density];
  const showOrder = !readOnly && !!orderControls;
  const showStatus = !readOnly || rows.some((r) => r.status);
  const hasActions = !!(rowActions || commentCount);
  const colSpan = 7 + (showOrder ? 1 : 0) + (showStatus ? 1 : 0) + (hasActions ? 1 : 0);
  const typeOptions = withKnownOrder(IDENTITY_TYPES, filterOptions(rows, (r) => r.identity_type));
  const statusOptions = withKnownOrder(ENTITY_STATUSES, filterOptions(rows, (r) => r.status));

  return (
    <div className="space-y-6">
      {flow}
      <div className="space-y-3">
        <ViewToolbar
          search={search}
          onSearch={setSearch}
          searchLabel="Search identity rules"
          placeholder="Search name, identifier or event"
          density={density}
          onDensity={setDensity}
          filters={[
            { label: 'Filter by identity type', value: typeFilter, onChange: setTypeFilter, allLabel: 'Hard and soft', options: typeOptions.map((t) => ({ value: t, label: enumLabel('identity_type', t) })) },
            ...(showStatus
              ? [{ label: 'Filter by status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All statuses', options: statusOptions.map((s) => ({ value: s, label: enumLabel('status', s) })) }]
              : []),
          ]}
        >
          {toolbarExtra}
        </ViewToolbar>
        <ViewFrame label="Identity rules">
          <thead className="border-b bg-gray-50">
            <tr>
              {showOrder && <HintTh className={`${cell} ${HEAD_TEXT} w-20`} hint="Order" hintScope="Identity">Order</HintTh>}
              <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Name" hintScope="Identity">Name</HintTh>
              <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Identifier name" hintScope="Identity">Identifier</HintTh>
              <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Type" hintScope="Identity">Type</HintTh>
              <HintTh className={`${cell} ${HEAD_TEXT}`} hint="SDK call" hintScope="Identity">SDK call</HintTh>
              <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Trigger event" hintScope="Identity">Trigger event</HintTh>
              <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Set by" hintScope="Identity">Set by</HintTh>
              <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Carried by" hintScope="Identity">Carried by</HintTh>
              {showStatus && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Status" hintScope="Identity">Status</HintTh>}
              {hasActions && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Actions" hintScope="Identity">Actions</HintTh>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((rule) => {
              const open = onOpen ? () => onOpen(rule) : undefined;
              const section = (s: IdentitySection) =>
                onOpenSection
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      className: 'cursor-pointer rounded hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-info)]',
                      title: s === 'set_by' ? 'Edit how this identifier is set' : 'Edit which events carry this identifier',
                      onClick: () => onOpenSection(rule, s),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenSection(rule, s);
                        }
                      },
                    }
                  : {};
              return (
                <ViewRow key={rule.id} testId="identity-rule-row" rowId={rule.id} highlighted={highlightId === rule.id}>
                  {showOrder && <td className={cell}>{orderControls!(rule, indexById.get(rule.id) ?? 0)}</td>}
                  <td className={`${cell} min-w-[10rem]`}>
                    <span className="inline-flex items-center gap-1.5">
                      <RowName name={rule.name} onOpen={open} />
                      <CopyNameButton name={rule.name} />
                    </span>
                  </td>
                  <td className={`${cell} text-gray-700`}>
                    <span className="font-mono">{rule.identifier_name}</span>
                    {rule.identifier_act_count > 1 && <span className="ml-1 text-xs text-gray-400">({rule.identifier_act_count} acts)</span>}
                  </td>
                  <td className={`${cell} whitespace-nowrap ${rule.identity_type === 'hard' ? 'text-gray-700' : 'text-gray-500'}`} title={enumLabel('identity_type', rule.identity_type)}>{rule.identity_type}</td>
                  <td className={`${cell} text-gray-500`}><OrDash value={rule.sdk_call} /></td>
                  <td className={`${cell} text-gray-500`}><OrDash value={rule.trigger_event} /></td>
                  <td className={`${cell} text-gray-500`}><span {...section('set_by')}><SetByCell setBy={rule.set_by} binds={rule.binds} /></span></td>
                  <td className={`${cell} text-gray-500`}><span {...section('carried_by')}><CarriedByCell events={rule.carried_by} /></span></td>
                  {showStatus && <td className={cell}><StatusBadge status={rule.status} /></td>}
                  {hasActions && <ActionsCell className={cell} count={commentCount?.(rule) ?? 0} actions={rowActions?.(rule)} commentsInActions={commentsInActions} />}
                </ViewRow>
              );
            })}
            {rows.length === 0 && empty && <EmptyState colSpan={colSpan} message={empty.message} actionLabel={empty.actionLabel} onAction={empty.onAction} />}
            {rows.length > 0 && visible.length === 0 && <NoMatchRow colSpan={colSpan} what="identity rules" />}
          </tbody>
        </ViewFrame>
      </div>
      {codegen}
    </div>
  );
}
