/**
 * Events table (T-5-40, D-88): one line per event in compact density (description beside the
 * name), the description on its own line in comfortable density; variant sub-rows on demand.
 * Defaults are muted (project default expiration, not certified, no properties); certified and
 * set values stand out. Used by the internal Events page and, later, the client portal.
 */
import React, { useMemo } from 'react';
import { Badge, ClassBadge, SourceBadge, StatusBadge } from '@/src/components/ui/badges';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { ExpandChevron } from '@/src/components/ui/ExpandChevron';
import { Button } from '@/src/components/ui/Button';
import { HintTh } from '@/src/components/ui/FieldHint';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { SortableTh, useSortableTable } from '@/src/hooks/useSortableTable';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { useViewState } from '@/src/hooks/useViewState';
import { EVENT_CLASSES, EVENT_STATUSES } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import { sourceViaLabel } from '@/src/domain/sources';
import { ActionsCell, CELL, EmptyDash, HEAD_TEXT, NoMatchRow, RowName, ViewFrame, ViewRow, ViewToolbar, useDensity } from './ViewParts';
import { filterOptions, matchesFilter, matchesSearch, withKnownOrder } from './viewModel';
import type { EventViewRow, ViewSlots } from './types';

export interface EventsTableProps extends ViewSlots<EventViewRow> {
  /** Initial class filter: `custom` on the internal page, `''` (all) by default. */
  defaultClass?: string;
}

const sourceLabels = (ev: EventViewRow) => ev.sources.map((s) => sourceViaLabel(s.system, s.method));

export function EventsTable({ rows, rowActions, onOpen, commentCount, commentsInActions, readOnly = false, empty, toolbarExtra, highlightId, defaultClass = '' }: EventsTableProps) {
  const [density, setDensity] = useDensity();
  const [search, setSearch] = useViewState('search', '');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [classFilter, setClassFilter] = useViewState('class', defaultClass);
  const [statusFilter, setStatusFilter] = useViewState('status', '');
  const [sourceFilter, setSourceFilter] = useViewState('source', '');
  const [expanded, setExpanded] = useViewState<Set<string>>('expanded', new Set());

  const filtered = useMemo(
    () =>
      rows.filter(
        (ev) =>
          matchesFilter(classFilter, ev.class) &&
          matchesFilter(statusFilter, ev.status) &&
          matchesFilter(sourceFilter, sourceLabels(ev)) &&
          matchesSearch(debouncedSearch, ev.name, ev.business_name, ev.description)
      ),
    [rows, classFilter, statusFilter, sourceFilter, debouncedSearch]
  );
  const { sorted, sort } = useSortableTable(filtered, {
    name: (ev) => ev.name,
    class: (ev) => ev.class,
    source: (ev) => sourceLabels(ev).join(', '),
    status: (ev) => ev.status,
    certified: (ev) => ev.certified,
    expiration: (ev) => ev.expiration?.label ?? '',
    properties: (ev) => ev.property_count,
  });

  const withVariants = sorted.filter((ev) => ev.variants.length > 0);
  const allExpanded = withVariants.length > 0 && withVariants.every((ev) => expanded.has(ev.id));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cell = CELL[density];
  const hasActions = !!(rowActions || commentCount);
  const showExpiration = rows.some((ev) => ev.expiration);
  const colSpan = 7 + (hasActions ? 1 : 0) + (showExpiration ? 1 : 0);
  const sourceOptions = filterOptions(rows, sourceLabels);
  const classOptions = withKnownOrder(EVENT_CLASSES, filterOptions(rows, (ev) => ev.class));
  const statusOptions = withKnownOrder(EVENT_STATUSES, filterOptions(rows, (ev) => ev.status));

  return (
    <div className="space-y-3">
      <ViewToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Search events"
        density={density}
        onDensity={setDensity}
        filters={[
          { label: 'Filter by class', value: classFilter, onChange: setClassFilter, allLabel: 'All classes', options: classOptions.map((c) => ({ value: c, label: enumLabel('class', c) })) },
          { label: 'Filter by status', value: statusFilter, onChange: setStatusFilter, allLabel: 'All statuses', options: statusOptions.map((s) => ({ value: s, label: enumLabel('status', s) })) },
          ...(sourceOptions.length > 0
            ? [{ label: 'Filter by source', value: sourceFilter, onChange: setSourceFilter, allLabel: 'All sources', options: sourceOptions.map((s) => ({ value: s, label: s })) }]
            : []),
        ]}
      >
        <Button variant="outline" onClick={() => setExpanded(allExpanded ? new Set() : new Set(withVariants.map((ev) => ev.id)))} disabled={withVariants.length === 0} className="h-9">
          {allExpanded ? 'Collapse all variants' : 'Expand all variants'}
        </Button>
        {toolbarExtra}
      </ViewToolbar>
      <ViewFrame label="Events">
        <thead className="border-b bg-gray-50">
          <tr>
            <HintTh className="w-10 px-2 py-2" hintScope="Events"><span className="sr-only">Expand</span></HintTh>
            <SortableTh sort={sort} column="name" className={`${cell} ${HEAD_TEXT}`} hint="Name" hintScope="Events">Name</SortableTh>
            <SortableTh sort={sort} column="class" className={`${cell} ${HEAD_TEXT}`} hint="Class" hintScope="Events">Class</SortableTh>
            <SortableTh sort={sort} column="source" className={`${cell} ${HEAD_TEXT}`} hint="Source" hintScope="Events">Source</SortableTh>
            <SortableTh sort={sort} column="status" className={`${cell} ${HEAD_TEXT}`} hint="Status" hintScope="Events">Status</SortableTh>
            <SortableTh sort={sort} column="certified" className={`${cell} ${HEAD_TEXT}`} hint="Certified" hintScope="Events">
              <GlossaryTerm glossaryKey="certified">Certified</GlossaryTerm>
            </SortableTh>
            {showExpiration && <SortableTh sort={sort} column="expiration" className={`${cell} ${HEAD_TEXT}`} hint="Expiration" hintScope="Events">Expiration</SortableTh>}
            <SortableTh sort={sort} column="properties" className={`${cell} ${HEAD_TEXT}`} hint="Properties" hintScope="Events">Properties</SortableTh>
            {hasActions && <HintTh className={`${cell} ${HEAD_TEXT}`} hint="Actions" hintScope="Events">Actions</HintTh>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((ev) => {
            const open = onOpen ? () => onOpen(ev) : undefined;
            const isExpanded = expanded.has(ev.id);
            const description = ev.description ? (
              <span className="text-xs text-gray-500" title={ev.description} data-testid="event-description">
                {ev.description}
              </span>
            ) : (
              <span className="text-xs text-gray-300" data-testid="event-description">No description</span>
            );
            return (
              <React.Fragment key={ev.id}>
                <ViewRow onOpen={open} testId="event-row" rowId={ev.id} highlighted={highlightId === ev.id}>
                  <td className="w-10 px-2 py-1">
                    {ev.variants.length > 0 && (
                      <ExpandChevron
                        expanded={isExpanded}
                        label={`${ev.variants.length} variant(s): click to ${isExpanded ? 'collapse' : 'expand'}`}
                        onToggle={() => toggle(ev.id)}
                      />
                    )}
                  </td>
                  {/* Internal: the name column takes the width left over (w-full + max-w-0) and the one-line description truncates in it. */}
                  <td className={`${cell} min-w-[18rem] ${readOnly ? '' : 'w-full max-w-0'}`}>
                    <span className={`flex min-w-0 gap-1.5 ${density === 'compact' ? 'items-center' : 'flex-wrap items-center'}`}>
                      <EntityIcon kind="event" />
                      <RowName name={ev.name} onOpen={open} />
                      <CopyNameButton name={ev.name} />
                      {ev.business_name && ev.business_name !== ev.name && <span className="shrink-0 text-xs text-gray-500">{ev.business_name}</span>}
                      {density === 'compact' && <span className={`min-w-0 flex-1 ${readOnly ? '' : 'truncate'}`}>{description}</span>}
                    </span>
                    {density === 'comfortable' && <span className={`mt-0.5 block min-w-0 ${readOnly ? '' : 'truncate'}`}>{description}</span>}
                  </td>
                  <td className={cell}><ClassBadge eventClass={ev.class} /></td>
                  <td className={cell} data-testid="event-source-cell">
                    {ev.sources.length === 0 ? (
                      <EmptyDash />
                    ) : (
                      <span className={`flex gap-x-2 gap-y-0.5 ${density === 'compact' ? 'flex-wrap' : 'flex-col'}`}>
                        {ev.sources.map((s) => <SourceBadge key={s.id} system={s.system} method={s.method} color={s.color} />)}
                      </span>
                    )}
                  </td>
                  <td className={cell}><StatusBadge status={ev.status} /></td>
                  <td className={cell}>
                    {ev.certified === 'yes' ? (
                      <Badge tone="green">Yes</Badge>
                    ) : ev.certified === 'no' ? (
                      <Badge title={ev.certified_reasons.join(', ') || undefined} className="text-gray-500">No</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">n/a</span>
                    )}
                  </td>
                  {showExpiration && <td className={`${cell} whitespace-nowrap ${ev.expiration?.inherited ? 'text-xs text-gray-400' : 'text-gray-700'}`}>{ev.expiration?.label ?? <EmptyDash />}</td>}
                  <td className={`${cell} tabular-nums ${ev.property_count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{ev.property_count}</td>
                  {hasActions && (
                    <ActionsCell className={cell} count={commentCount?.(ev) ?? 0} actions={rowActions?.(ev)} commentsInActions={commentsInActions} />
                  )}
                </ViewRow>
                {isExpanded &&
                  ev.variants.map((v) => (
                    <tr key={v.id} className="bg-gray-50 text-xs text-gray-600" data-testid="event-variant-row">
                      <td className="w-10" />
                      <td className="px-4 py-1.5" colSpan={colSpan - 1}>
                        <span className="inline-flex items-center gap-1.5 font-medium text-gray-800"><EntityIcon kind="variant" />{v.name}</span>
                        {v.description && <span className="ml-2 text-gray-500">{v.description}</span>}
                      </td>
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
          {rows.length === 0 && empty && <EmptyState colSpan={colSpan} message={empty.message} actionLabel={empty.actionLabel} onAction={empty.onAction} />}
          {rows.length > 0 && sorted.length === 0 && <NoMatchRow colSpan={colSpan} what="events" />}
        </tbody>
      </ViewFrame>
    </div>
  );
}
