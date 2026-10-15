/**
 * Properties table (T-5-40, D-88): rows grouped by category (system customer, customer, SDK
 * default, event), each group collapsible; the definition count opens the row's definitions inline
 * through the `renderDefinitions` slot. Read-only mode drops the planning columns (priority,
 * status) that the public document does not carry.
 */
import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge, KindBadge, PriorityBadge, StatusBadge } from '@/src/components/ui/badges';
import { Button } from '@/src/components/ui/Button';
import { CategoryBadge } from '@/src/components/ui/CategoryBadge';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { DefinitionCountBadge } from '@/src/components/ui/DefinitionCountBadge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ExpandChevron } from '@/src/components/ui/ExpandChevron';
import { HintTh } from '@/src/components/ui/FieldHint';
import { SortableTh, useSortableTable } from '@/src/hooks/useSortableTable';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { ENTITY_STATUSES } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import { PROPERTY_CATEGORIES, PROPERTY_CATEGORY_LABELS, type PropertyCategory } from '@/src/domain/propertyCategory';
import { groupRowsByCategory, toggleCollapsed } from '@/src/domain/propertyTableGroups';
import { ActionsCell, CELL, HEAD_TEXT, NoMatchRow, RowName, ViewFrame, ViewRow, ViewToolbar, useDensity } from './ViewParts';
import { filterOptions, matchesFilter, matchesSearch, withKnownOrder } from './viewModel';
import type { PropertyViewRow, ViewSlots } from './types';

export interface PropertiesTableProps extends ViewSlots<PropertyViewRow> {
  /** The definition sub-rows of an expanded property (`DefinitionSubRows`), spanning `colSpan`. */
  renderDefinitions?: (row: PropertyViewRow, colSpan: number) => React.ReactNode;
  /** Message when rows exist upstream but the page's own filter (scope) left none. */
  filteredUpstream?: boolean;
}

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function PropertiesTable({
  rows,
  rowActions,
  onOpen,
  commentCount,
  commentsInActions,
  readOnly = false,
  empty,
  toolbarExtra,
  renderDefinitions,
  filteredUpstream = false,
}: PropertiesTableProps) {
  const [density, setDensity] = useDensity();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<PropertyCategory>>(new Set());

  const filtered = useMemo(
    () =>
      rows.filter(
        (p) =>
          matchesFilter(categoryFilter, p.category) &&
          matchesFilter(statusFilter, p.status) &&
          matchesSearch(debouncedSearch, p.name, p.description)
      ),
    [rows, categoryFilter, statusFilter, debouncedSearch]
  );
  const { sorted, sort } = useSortableTable(filtered, {
    name: (p) => p.name,
    scope: (p) => p.scope,
    data_type: (p) => p.data_type,
    kind: (p) => p.kind ?? 'event',
    enum: (p) => p.enum_count,
    priority: (p) => PRIORITY_ORDER.indexOf(p.priority ?? '') + 1 || null,
    status: (p) => p.status,
  });
  const groups = useMemo(() => groupRowsByCategory(sorted, (p) => p.category), [sorted]);

  const expandable = renderDefinitions ? sorted.filter((p) => p.definition_count > 0).map((p) => p.id) : [];
  const allExpanded = expandable.length > 0 && expandable.every((id) => expanded.has(id));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cell = CELL[density];
  const hasActions = !!(rowActions || commentCount);
  const colSpan = 6 + (readOnly ? 0 : 2) + (hasActions ? 1 : 0);
  const statusOptions = withKnownOrder(ENTITY_STATUSES, filterOptions(rows, (p) => p.status));

  return (
    <div className="space-y-3">
      <ViewToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Search properties"
        density={density}
        onDensity={setDensity}
        filters={[
          { label: 'Filter by category', value: categoryFilter, onChange: setCategoryFilter, allLabel: 'All categories', options: PROPERTY_CATEGORIES.map((c) => ({ value: c, label: PROPERTY_CATEGORY_LABELS[c] })) },
          ...(readOnly
            ? []
            : [{ label: 'Filter by status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All statuses', options: statusOptions.map((s) => ({ value: s, label: enumLabel('status', s) })) }]),
        ]}
      >
        {toolbarExtra}
        {renderDefinitions && (
          <Button variant="outline" onClick={() => setExpanded(allExpanded ? new Set() : new Set(expandable))} disabled={expandable.length === 0} className="h-9">
            {allExpanded ? 'Collapse all definitions' : 'Expand all definitions'}
          </Button>
        )}
      </ViewToolbar>
      <ViewFrame label="Properties" className="min-w-[1100px] table-fixed">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-[88px]" />
          <col className="w-[96px]" />
          <col className="w-[104px]" />
          <col className="w-[96px]" />
          {!readOnly && <col className="w-[88px]" />}
          {!readOnly && <col className="w-[140px]" />}
          {hasActions && <col className="w-[170px]" />}
        </colgroup>
        <thead className="border-b bg-gray-50">
          <tr>
            <HintTh className="px-1 py-2" hintScope="Properties"><span className="sr-only">Expand</span></HintTh>
            <SortableTh sort={sort} column="name" className={`${cell} ${HEAD_TEXT}`} hint="Name" hintScope="Properties">Name</SortableTh>
            <SortableTh sort={sort} column="scope" className={`${cell} ${HEAD_TEXT}`} hint="Scope" hintScope="Properties">Scope</SortableTh>
            <SortableTh sort={sort} column="data_type" className={`${cell} ${HEAD_TEXT}`} hint="Data type" hintScope="Properties">Data type</SortableTh>
            <SortableTh sort={sort} column="kind" className={`${cell} ${HEAD_TEXT}`} hint="Property type" hintScope="Properties">Type</SortableTh>
            <SortableTh sort={sort} column="enum" className={`${cell} ${HEAD_TEXT}`} hint="Enum" hintScope="Properties">Enum</SortableTh>
            {!readOnly && <SortableTh sort={sort} column="priority" className={`${cell} ${HEAD_TEXT}`} hint="Priority" hintScope="Properties">Priority</SortableTh>}
            {!readOnly && <SortableTh sort={sort} column="status" className={`${cell} ${HEAD_TEXT}`} hint="Status" hintScope="Properties">Status</SortableTh>}
            {hasActions && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Actions" hintScope="Properties">Actions</HintTh>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.category);
            return (
              <React.Fragment key={group.category}>
                <tr className="border-y border-gray-200 bg-gray-100" data-testid={`property-group-${group.category}`}>
                  <HintTh colSpan={colSpan} scope="colgroup" hint="" hintScope="Properties" className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsedGroups((c) => toggleCollapsed(c, group.category))}
                      className="inline-flex items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-200"
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                      <CategoryBadge category={group.category} />
                      <span className="font-normal text-gray-500">({group.rows.length})</span>
                    </button>
                  </HintTh>
                </tr>
                {!isCollapsed &&
                  group.rows.map((p) => {
                    const open = onOpen ? () => onOpen(p) : undefined;
                    const defLabel = `${expanded.has(p.id) ? 'Collapse' : 'Expand'} definitions for ${p.name} (${p.definition_count} ${p.definition_count === 1 ? 'definition' : 'definitions'})`;
                    const canExpand = !!renderDefinitions && p.definition_count > 0;
                    return (
                      <React.Fragment key={p.id}>
                        <ViewRow onOpen={open} testId="property-row">
                          <td className="px-1 py-1">
                            {canExpand && <ExpandChevron expanded={expanded.has(p.id)} label={defLabel} onToggle={() => toggle(p.id)} />}
                          </td>
                          <td className={`${cell} pl-8`}>
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap"><RowName name={p.name} onOpen={open} /></span>
                              {renderDefinitions ? (
                                <button
                                  type="button"
                                  disabled={!canExpand}
                                  aria-expanded={expanded.has(p.id)}
                                  aria-label={defLabel}
                                  className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-[var(--color-info)] disabled:cursor-default"
                                  onClick={() => toggle(p.id)}
                                >
                                  <DefinitionCountBadge count={p.definition_count} />
                                </button>
                              ) : (
                                p.definition_count > 1 && <DefinitionCountBadge count={p.definition_count} />
                              )}
                              <CopyNameButton name={p.name} />
                              {p.category_set_by_hand && <span className="text-xs font-normal text-gray-400" title="Category set by hand">(set)</span>}
                            </span>
                            {p.description && density === 'comfortable' && (
                              <span className={`mt-0.5 block text-xs text-gray-500 ${readOnly ? '' : 'truncate'}`} title={p.description}>{p.description}</span>
                            )}
                          </td>
                          <td className={`${cell} ${p.scope === 'customer' ? 'text-gray-700' : 'text-gray-400'}`}>{p.scope}</td>
                          <td className={`${cell} text-gray-500`}>{p.data_type}</td>
                          <td className={cell}><KindBadge kind={p.kind} /></td>
                          <td className={cell}>{p.enum_count > 0 ? <Badge tone="blue">enum · {p.enum_count}</Badge> : <span className="text-gray-300" aria-label="none">—</span>}</td>
                          {!readOnly && <td className={cell}><PriorityBadge priority={p.priority} /></td>}
                          {!readOnly && <td className={cell}><StatusBadge status={p.status} /></td>}
                          {hasActions && <ActionsCell className={cell} count={commentCount?.(p) ?? 0} actions={rowActions?.(p)} commentsInActions={commentsInActions} />}
                        </ViewRow>
                        {canExpand && expanded.has(p.id) && renderDefinitions!(p, colSpan)}
                      </React.Fragment>
                    );
                  })}
              </React.Fragment>
            );
          })}
          {sorted.length === 0 && (rows.length > 0 || filteredUpstream) && <NoMatchRow colSpan={colSpan} what="properties" />}
          {sorted.length === 0 && rows.length === 0 && !filteredUpstream && empty && (
            <EmptyState colSpan={colSpan} message={empty.message} actionLabel={empty.actionLabel} onAction={empty.onAction} />
          )}
        </tbody>
      </ViewFrame>
    </div>
  );
}
