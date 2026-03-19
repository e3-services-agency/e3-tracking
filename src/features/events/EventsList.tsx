/**
 * Events data table. Powered by /api/events via useEvents.
 * Columns: Name (description under), Triggers (truncate), Badge for attached_property_count.
 */
import React, { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { ApiError, EventWithPropertyCount } from '@/src/features/events/hooks/useEvents';
import { Search, Plus, Calendar, AlertCircle } from 'lucide-react';

type EventsListProps = {
  onOpenCreate: () => void;
  onOpenEvent: (id: string) => void;
  events: EventWithPropertyCount[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
};

export function EventsList({
  onOpenCreate,
  onOpenEvent,
  events,
  isLoading,
  error,
  refetch,
  mutationError,
  clearMutationError,
}: EventsListProps) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo<ColumnDef<EventWithPropertyCount>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) => row.name,
        cell: ({ row }) => {
          const e = row.original;
          return (
            <div className="min-w-[200px]">
              <button
                type="button"
                onClick={() => onOpenEvent(e.id)}
                className="text-left font-mono font-medium text-[var(--color-info)] hover:underline"
              >
                {e.name}
              </button>
              {e.description ? (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                  {e.description}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'triggers',
        header: 'Triggers',
        accessorFn: (row) => row.triggers_markdown ?? '',
        cell: ({ getValue }) => {
          const v = getValue() as string;
          if (!v) return <span className="text-gray-400 text-sm">—</span>;
          return (
            <span className="text-sm text-gray-600 line-clamp-2 max-w-[280px]" title={v}>
              {v}
            </span>
          );
        },
      },
      {
        id: 'properties',
        header: 'Properties',
        accessorFn: (row) => row.attached_property_count,
        cell: ({ row }) => {
          const count = row.original.attached_property_count;
          return (
            <Badge variant="secondary" className="font-mono">
              {count} {count === 1 ? 'property' : 'properties'}
            </Badge>
          );
        },
      },
    ],
    [onOpenEvent]
  );

  const table = useReactTable({
    data: events,
    columns,
    state: { globalFilter, columnFilters },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(10),
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

      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Filter events..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 bg-white border border-dashed border-gray-200 rounded-lg">
          <Calendar className="w-14 h-14 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            No events yet
          </h3>
          <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
            Create your first event to define user actions and map properties for
            your tracking plan.
          </p>
          <Button onClick={onOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Create your first Event
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
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50/80 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-6 py-4 text-sm text-gray-900"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && events.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>
                Showing {table.getRowModel().rows.length} of {events.length}{' '}
                events
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
