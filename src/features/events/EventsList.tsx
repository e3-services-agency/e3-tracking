/**
 * Events data table. Powered by /api/events via useEvents.
 * Base events are parent rows; variants are nested child rows directly underneath.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { ApiError, EventWithPropertyCount } from '@/src/features/events/hooks/useEvents';
import type { EventType, EventVariantSummary } from '@/src/types/schema';
import { Search, Plus, Calendar, AlertCircle } from 'lucide-react';

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  track: 'Track',
  page: 'Page',
  identify: 'Identify',
};

/** One visual row: base event or a variant under its base. */
export type EventsListFlatRow =
  | { kind: 'base'; rowKey: string; event: EventWithPropertyCount }
  | {
      kind: 'variant';
      rowKey: string;
      baseEvent: EventWithPropertyCount;
      variant: EventVariantSummary;
    };

function buildFlatRows(events: EventWithPropertyCount[]): EventsListFlatRow[] {
  const out: EventsListFlatRow[] = [];
  for (const e of events) {
    out.push({ kind: 'base', rowKey: `base-${e.id}`, event: e });
    for (const v of e.variants ?? []) {
      out.push({
        kind: 'variant',
        rowKey: `variant-${e.id}-${v.id}`,
        baseEvent: e,
        variant: v,
      });
    }
  }
  return out;
}

function rowMatchesFilter(row: EventsListFlatRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (row.kind === 'base') {
    const e = row.event;
    return (
      e.name.toLowerCase().includes(needle) ||
      (e.description ?? '').toLowerCase().includes(needle) ||
      (e.purpose ?? '').toLowerCase().includes(needle)
    );
  }
  return (
    row.baseEvent.name.toLowerCase().includes(needle) ||
    row.variant.name.toLowerCase().includes(needle) ||
    (row.variant.description ?? '').toLowerCase().includes(needle)
  );
}

type EventsListProps = {
  onOpenCreate: () => void;
  /** When false, empty-state create is disabled (e.g. invalid workspace). */
  allowCreate?: boolean;
  /** Open base event, or base + variant (opens variant edit after load). */
  onOpenEvent: (eventId: string, variantId?: string | null) => void;
  events: EventWithPropertyCount[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
};

export function EventsList({
  onOpenCreate,
  allowCreate = true,
  onOpenEvent,
  events,
  isLoading,
  error,
  refetch,
  mutationError,
  clearMutationError,
}: EventsListProps) {
  const [filterText, setFilterText] = useState('');

  const flatRows = useMemo(() => buildFlatRows(events), [events]);

  const filteredRows = useMemo(() => {
    return flatRows.filter((row) => rowMatchesFilter(row, filterText));
  }, [flatRows, filterText]);

  const openRow = useCallback(
    (row: EventsListFlatRow) => {
      if (row.kind === 'base') {
        onOpenEvent(row.event.id, null);
      } else {
        onOpenEvent(row.baseEvent.id, row.variant.id);
      }
    },
    [onOpenEvent]
  );

  const columns = useMemo<ColumnDef<EventsListFlatRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) =>
          row.kind === 'base' ? row.event.name : row.variant.name,
        cell: ({ row }) => {
          const r = row.original;
          const isVariant = r.kind === 'variant';
          return (
            <div
              className={`min-w-[200px] flex items-start gap-2 ${isVariant ? 'pl-4 border-l-2 border-purple-200' : ''}`}
            >
              <Badge
                variant="outline"
                className="shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0"
              >
                {r.kind === 'base' ? 'Base' : 'Variant'}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="font-mono font-medium text-gray-900 truncate">
                  {r.kind === 'base' ? r.event.name : r.variant.name}
                </div>
                {isVariant ? (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate" title={r.baseEvent.name}>
                    {r.baseEvent.name}
                  </p>
                ) : null}
                {r.kind === 'base' && r.event.description ? (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {r.event.description}
                  </p>
                ) : null}
                {r.kind === 'base' && r.event.purpose ? (
                  <p
                    className="text-xs text-gray-600 mt-0.5 line-clamp-2"
                    title={r.event.purpose}
                  >
                    <span className="font-medium text-gray-700">Purpose</span>
                    {': '}
                    {r.event.purpose}
                  </p>
                ) : null}
                {isVariant && r.variant.description ? (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.variant.description}</p>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: 'event_type',
        header: 'Event type',
        accessorFn: (row) =>
          row.kind === 'base' ? row.event.event_type ?? '' : row.baseEvent.event_type ?? '',
        cell: ({ row }) => {
          const r = row.original;
          const t = r.kind === 'base' ? r.event.event_type : r.baseEvent.event_type;
          if (!t) return <span className="text-gray-400 text-sm">—</span>;
          return (
            <Badge variant="outline" className="font-mono text-xs">
              {EVENT_TYPE_LABELS[t] ?? t}
            </Badge>
          );
        },
      },
      {
        id: 'triggers',
        header: 'Triggers',
        accessorFn: (row) => {
          const triggers = row.kind === 'base' ? row.event.triggers : row.baseEvent.triggers;
          return triggers?.map((trigger) => trigger.title).join(', ') ?? '';
        },
        cell: ({ row, getValue }) => {
          const r = row.original;
          const triggers = r.kind === 'base' ? r.event.triggers : r.baseEvent.triggers;
          const value = getValue() as string;
          const count = triggers?.length ?? 0;
          if (!value) return <span className="text-gray-400 text-sm">—</span>;
          return (
            <span
              className="text-sm text-gray-600 line-clamp-2 max-w-[280px]"
              title={value}
            >
              {count > 1 ? `${count} triggers: ${value}` : value}
            </span>
          );
        },
      },
      {
        id: 'properties',
        header: 'Properties',
        accessorFn: (row) =>
          row.kind === 'base'
            ? row.event.attached_property_count
            : row.baseEvent.attached_property_count,
        cell: ({ row }) => {
          const r = row.original;
          const count =
            r.kind === 'base' ? r.event.attached_property_count : r.baseEvent.attached_property_count;
          return (
            <Badge variant="secondary" className="font-mono">
              {count} {count === 1 ? 'property' : 'properties'}
            </Badge>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    initialState: { pagination: { pageSize: 10 } },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 bg-white border rounded-lg">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Could not load events
        </h3>
        <p className="text-sm text-gray-600 text-center max-w-md mb-4">
          {error.message}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const isEmpty = !isLoading && events.length === 0;
  const hasNoResults =
    !isLoading && events.length > 0 && table.getRowModel().rows.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {mutationError && (
        <div
          className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start justify-between gap-4"
          role="alert"
        >
          <div>
            <p className="text-sm font-medium text-red-800">
              {mutationError.message}
            </p>
            {mutationError.details && (
              <p className="text-xs text-red-600 mt-1">{mutationError.details}</p>
            )}
          </div>
          <button
            type="button"
            onClick={clearMutationError}
            className="text-red-600 hover:text-red-800 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <p className="text-xs text-gray-600 mb-3 max-w-2xl">
        Events for the workspace selected in the header. Variants appear nested under their base event.
        Create and edits are saved on the server.
      </p>
      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Filter events and variants..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 bg-white border border-dashed border-gray-200 rounded-lg">
          <Calendar className="w-14 h-14 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No events yet</h3>
          <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
            Create an event to add it to this workspace.
          </p>
          <Button
            onClick={onOpenCreate}
            className="gap-2"
            disabled={!allowCreate}
            title={
              !allowCreate
                ? 'Select a valid workspace in the header before creating an event.'
                : undefined
            }
          >
            <Plus className="w-4 h-4" /> Create your first event
          </Button>
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-lg shadow-sm flex-1 overflow-auto min-h-0">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10 border-b">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      >
                        {flexRender(
                          h.column.columnDef.header,
                          h.getContext()
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      Loading events…
                    </td>
                  </tr>
                ) : hasNoResults ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No events match your filter.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((tableRow) => {
                    const flat = tableRow.original;
                    const isVariant = flat.kind === 'variant';
                    return (
                      <tr
                        key={tableRow.id}
                        className={`hover:bg-gray-50/80 transition-colors cursor-pointer ${isVariant ? 'bg-slate-50/60' : ''}`}
                        onClick={() => openRow(flat)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openRow(flat);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={
                          flat.kind === 'base'
                            ? `Open base event ${flat.event.name}`
                            : `Open variant ${flat.variant.name}`
                        }
                      >
                        {tableRow.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className="px-6 py-4 text-sm text-gray-900 align-top"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && events.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>
                Showing {table.getRowModel().rows.length} of {flatRows.length} row
                {flatRows.length === 1 ? '' : 's'} ({events.length} base event
                {events.length === 1 ? '' : 's'})
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
