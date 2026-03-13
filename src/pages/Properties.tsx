import React, { useState, useMemo } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Property, PropertyBundle } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { Sheet } from '@/src/components/ui/Sheet';
import { Search, Plus, Trash2, Package, CheckCircle2, Columns, GitMerge } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  ColumnFiltersState,
  VisibilityState,
} from '@tanstack/react-table';
import { computePropertyDiff } from '@/src/features/properties/lib/propertyDiff';
import { getPropertyTableColumns } from '@/src/features/properties/page/propertyTableColumns';
import { PropertyEditor } from '@/src/features/properties/editor/PropertyEditor';
import { BundleEditor } from '@/src/features/properties/editor/BundleEditor';

export function Properties() {
  const data = useActiveData();
  const { activeBranchId, branches, mergeBranch, approveBranch, selectedItemIdToEdit, setSelectedItemIdToEdit } = useStore();
  
  const [activeTab, setActiveTab] = useState<'properties' | 'bundles'>('properties');
  
  // Table state
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Property state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isPropertySheetOpen, setIsPropertySheetOpen] = useState(false);
  const [isCreatingProperty, setIsCreatingProperty] = useState(false);

  // Bundle state
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [isBundleSheetOpen, setIsBundleSheetOpen] = useState(false);
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);

  React.useEffect(() => {
    if (selectedItemIdToEdit) {
      const property = data.properties.find(p => p.id === selectedItemIdToEdit);
      if (property) {
        setSelectedPropertyId(property.id);
        setIsCreatingProperty(false);
        setIsPropertySheetOpen(true);
        setActiveTab('properties');
        setSelectedItemIdToEdit(null);
      }
    }
  }, [selectedItemIdToEdit, data.properties, setSelectedItemIdToEdit]);

  const handleOpenProperty = (id: string) => {
    setSelectedPropertyId(id);
    setIsCreatingProperty(false);
    setIsPropertySheetOpen(true);
  };

  const handleCreateNewProperty = () => {
    setSelectedPropertyId(null);
    setIsCreatingProperty(true);
    setIsPropertySheetOpen(true);
  };

  const handleOpenBundle = (id: string) => {
    setSelectedBundleId(id);
    setIsCreatingBundle(false);
    setIsBundleSheetOpen(true);
  };

  const handleCreateNewBundle = () => {
    setSelectedBundleId(null);
    setIsCreatingBundle(true);
    setIsBundleSheetOpen(true);
  };

  const selectedProperty = selectedPropertyId ? data.properties.find(p => p.id === selectedPropertyId) : null;
  const selectedBundle = selectedBundleId ? data.propertyBundles.find(b => b.id === selectedBundleId) : null;
  const activeBranch = branches.find(b => b.id === activeBranchId);

  // Diff logic
  const diff = useMemo(() => {
    return computePropertyDiff({
      activeBranchId,
      activeBranch,
    });
  }, [activeBranchId, activeBranch]);

  const canMerge = activeBranch && activeBranch.approvals.length > 0;

  const columns = useMemo<ColumnDef<Property>[]>(() => {
    return getPropertyTableColumns({
      customPropertyFields: data.settings.customPropertyFields,
      diff,
      onOpenProperty: handleOpenProperty,
    });
  }, [data.settings.customPropertyFields, diff, handleOpenProperty]);

  const table = useReactTable({
    data: data.properties,
    columns,
    state: {
      globalFilter,
      columnFilters,
      columnVisibility,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filteredBundles = data.propertyBundles.filter(b =>
    b.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
    b.description.toLowerCase().includes(globalFilter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties & Bundles</h1>
          <p className="text-sm text-gray-500 mt-1">Manage global properties and reusable property bundles.</p>
        </div>
        <div className="flex gap-3">
          {activeBranchId !== 'main' && (
            <Button 
              variant={canMerge ? "default" : "secondary"}
              onClick={() => canMerge && mergeBranch(activeBranchId)}
              disabled={!canMerge}
              className="gap-2"
            >
              <GitMerge className="w-4 h-4" /> Merge Branch
            </Button>
          )}
          {activeTab === 'properties' ? (
            <Button onClick={handleCreateNewProperty} className="gap-2">
              <Plus className="w-4 h-4" /> Add Property
            </Button>
          ) : (
            <Button onClick={handleCreateNewBundle} className="gap-2">
              <Plus className="w-4 h-4" /> Add Bundle
            </Button>
          )}
        </div>
      </div>

      <div className="px-8 pt-4 border-b bg-white">
        <div className="flex space-x-6">
          <button
            onClick={() => setActiveTab('properties')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'properties'
                ? 'border-[#3E52FF] text-[#3E52FF]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveTab('bundles')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'bundles'
                ? 'border-[#3E52FF] text-[#3E52FF]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Property Bundles
          </button>
        </div>
      </div>

      <div className="p-8 flex-1 overflow-hidden flex flex-col">
        {activeTab === 'properties' && diff && (diff.newProps.length > 0 || diff.modifiedProps.length > 0) && (
          <div className="mb-8 p-4 bg-white border rounded-lg shadow-sm shrink-0">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-[#3E52FF]" /> Workbench Summary
            </h3>
            <div className="flex gap-4">
              {diff.newProps.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                  {diff.newProps.length} New
                </div>
              )}
              {diff.modifiedProps.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full bg-purple-400"></span>
                  {diff.modifiedProps.length} Modified
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Review changes before merging.
              </div>
              {activeBranch && activeBranch.approvals.length === 0 && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => approveBranch(activeBranchId, 't1')}
                  className="gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Approve Changes
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={`Search ${activeTab}...`}
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          {activeTab === 'properties' && (
            <div className="flex items-center gap-2">
              <div className="relative group">
                <Button variant="outline" className="gap-2">
                  <Columns className="w-4 h-4" /> Customize Columns
                </Button>
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded-md shadow-lg p-2 hidden group-hover:block z-50">
                  {table.getAllLeafColumns().map(column => {
                    return (
                      <div key={column.id} className="px-1 py-1">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            {...{
                              type: 'checkbox',
                              checked: column.getIsVisible(),
                              onChange: column.getToggleVisibilityHandler(),
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          {column.columnDef.header as string}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {activeTab === 'properties' ? (
          <>
            <div className="bg-white border rounded-lg shadow-sm flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th key={header.id} className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y">
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                        No properties found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between shrink-0">
              <div className="text-sm text-gray-500">
                Showing {table.getRowModel().rows.length} of {data.properties.length} properties
              </div>
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
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-8">
            {filteredBundles.map(bundle => (
              <div
                key={bundle.id}
                onClick={() => handleOpenBundle(bundle.id)}
                className="bg-white border rounded-lg p-6 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-[#3E52FF]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-[#3E52FF]" />
                    <h3 className="font-semibold text-gray-900">{bundle.name}</h3>
                  </div>
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {bundle.propertyIds.length} props
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{bundle.description}</p>
                <div className="flex flex-wrap gap-2">
                  {bundle.propertyIds.slice(0, 3).map(pid => {
                    const prop = data.properties.find(p => p.id === pid);
                    if (!prop) return null;
                    return (
                      <span key={pid} className="text-xs font-mono bg-gray-50 border px-2 py-1 rounded text-gray-600">
                        {prop.name}
                      </span>
                    );
                  })}
                  {bundle.propertyIds.length > 3 && (
                    <span className="text-xs font-medium text-gray-500 px-2 py-1">
                      +{bundle.propertyIds.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            ))}
            {filteredBundles.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white border rounded-lg border-dashed">
                No property bundles found. Create one to group related properties.
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet
        isOpen={isPropertySheetOpen}
        onClose={() => setIsPropertySheetOpen(false)}
        title={isCreatingProperty ? "Create Property" : "Edit Property"}
      >
        {isPropertySheetOpen && (
          <PropertyEditor
            property={selectedProperty}
            isCreating={isCreatingProperty}
            onClose={() => setIsPropertySheetOpen(false)}
          />
        )}
      </Sheet>

      <Sheet
        isOpen={isBundleSheetOpen}
        onClose={() => setIsBundleSheetOpen(false)}
        title={isCreatingBundle ? "Create Property Bundle" : "Edit Property Bundle"}
      >
        {isBundleSheetOpen && (
          <BundleEditor
            bundle={selectedBundle}
            isCreating={isCreatingBundle}
            onClose={() => setIsBundleSheetOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}