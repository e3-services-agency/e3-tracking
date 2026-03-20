/**
 * Properties data table (Avo-style). Powered by /api/properties via useProperties.
 * Columns: Name/Description, Type, PII, Catalog Mapping, Presence.
 */
import React, { useMemo, useState, useEffect } from 'react';
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
import { useCatalogs } from '@/src/features/catalogs/hooks/useCatalogs';
import type { PropertyRow, PropertyContext } from '@/src/types/schema';
import type { CatalogFieldRow } from '@/src/types/schema';
import type { ApiError } from '@/src/features/properties/hooks/useProperties';
import { Search, Plus, FileQuestion, AlertCircle, Link2, Braces, Brackets, Clock3, Hash, Type, ToggleLeft } from 'lucide-react';

const CONTEXT_LABELS: Record<PropertyContext, string> = {
  event_property: 'Event Property',
  user_property: 'User Property',
  system_property: 'System Property',
};

type PropertiesListProps = {
  onOpenCreate: () => void;
  onOpenProperty: (id: string) => void;
  properties: PropertyRow[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
};

export function PropertiesList({
  onOpenCreate,
  onOpenProperty,
  properties,
  isLoading,
  error,
  refetch,
  mutationError,
  clearMutationError,
}: PropertiesListProps) {
  const { catalogs, fetchCatalogFields } = useCatalogs();
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [fieldsByCatalogId, setFieldsByCatalogId] = useState<Record<string, CatalogFieldRow[]>>({});

  const catalogIdsWithMapping = useMemo(
    () => Array.from(new Set(properties.filter((p) => p.mapped_catalog_id).map((p) => p.mapped_catalog_id!).filter(Boolean))),
    [properties]
  );
  useEffect(() => {
    catalogIdsWithMapping.forEach((cid) => {
      if (fieldsByCatalogId[cid]) return;
      fetchCatalogFields(cid).then((fields) =>
        setFieldsByCatalogId((prev) => ({ ...prev, [cid]: fields }))
      );
    });
  }, [catalogIdsWithMapping.join(','), fetchCatalogFields]);

  const getMappingLabel = (p: PropertyRow): string | null => {
    if (!p.mapped_catalog_id || !p.mapped_catalog_field_id) return null;
    const catalog = catalogs.find((c) => c.id === p.mapped_catalog_id);
    const fields = fieldsByCatalogId[p.mapped_catalog_id];
    const field = fields?.find((f) => f.id === p.mapped_catalog_field_id);
    if (!catalog || !field) return null;
    return `${catalog.name}.${field.name}`;
  };

  const columns = useMemo<ColumnDef<PropertyRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) => row.name,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="min-w-[180px]">
              <button
                type="button"
                onClick={() => onOpenProperty(p.id)}
                className="text-left font-mono font-medium text-[var(--color-info)] hover:underline"
              >
                {p.name}
              </button>
              {p.description ? (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'context',
        header: 'Context',
        accessorFn: (row) => row.context,
        cell: ({ getValue }) => {
          const value = getValue() as PropertyContext;
          return <Badge variant="secondary">{CONTEXT_LABELS[value] ?? value}</Badge>;
        },
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (row) => row.data_type,
        cell: ({ row }) => {
          const p = row.original;
          const uiType = p.data_type;
          const formatsLabel = p.data_formats?.join(', ') ?? '';
          const icon =
            uiType === 'array' ? <Brackets className="w-3.5 h-3.5" /> :
            uiType === 'object' ? <Braces className="w-3.5 h-3.5" /> :
            uiType === 'boolean' ? <ToggleLeft className="w-3.5 h-3.5" /> :
            uiType === 'number' ? <Hash className="w-3.5 h-3.5" /> :
            uiType === 'timestamp' ? <Clock3 className="w-3.5 h-3.5" /> :
            <Type className="w-3.5 h-3.5" />;
          return (
            <div className="space-y-1">
              <Badge variant="outline" className="font-mono text-xs inline-flex items-center gap-1.5">
                {icon}
                {uiType === 'array' ? 'array []' : uiType === 'object' ? 'object {}' : uiType}
              </Badge>
              {formatsLabel ? (
                <p className="text-xs text-gray-500 font-mono">{formatsLabel}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'pii',
        header: 'PII',
        accessorFn: (row) => row.pii,
        cell: ({ getValue }) => {
          const v = Boolean(getValue());
          return <Badge variant={v ? 'destructive' : 'secondary'}>{v ? 'Yes' : 'No'}</Badge>;
        },
      },
      {
        id: 'catalog_mapping',
        header: 'Catalog',
        accessorFn: (row) => getMappingLabel(row),
        cell: ({ row }) => {
          const label = getMappingLabel(row.original);
          if (!label) return <span className="text-gray-400 text-sm">—</span>;
          return (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-emerald-50 text-emerald-800 px-2 py-1 rounded border border-emerald-200">
              <Link2 className="w-3 h-3 shrink-0" />
              Maps to {label}
            </span>
          );
        },
      },
      {
        id: 'presence',
        header: 'Presence',
        cell: () => (
          <span className="text-gray-400 text-sm">—</span>
        ),
      },
    ],
    [onOpenProperty, catalogs, fieldsByCatalogId]
  );

  const table = useReactTable({
    data: properties,
    columns,
    state: { globalFilter, columnFilters },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 bg-white border rounded-lg">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Could not load properties</h3>
        <p className="text-sm text-gray-600 text-center max-w-md mb-4">{error.message}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const isEmpty = !isLoading && properties.length === 0;
  const hasNoResults = !isLoading && properties.length > 0 && table.getRowModel().rows.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {mutationError && (
        <div
          className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start justify-between gap-4"
          role="alert"
        >
          <div>
            <p className="text-sm font-medium text-red-800">{mutationError.message}</p>
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
            placeholder="Filter properties..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 bg-white border border-dashed border-gray-200 rounded-lg">
          <FileQuestion className="w-14 h-14 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No properties yet</h3>
          <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
            Create your first property to define event, user, or system attributes for your tracking plan.
          </p>
          <Button onClick={onOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Create your first Property
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
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                      Loading properties…
                    </td>
                  </tr>
                ) : hasNoResults ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                      No properties match your filter.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50/80 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-6 py-4 text-sm text-gray-900">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && properties.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>
                Showing {table.getRowModel().rows.length} of {properties.length} properties
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
