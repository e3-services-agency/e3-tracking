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
import { PropertiesList } from '@/src/features/properties/PropertiesList';
import { PropertyEditorSheet } from '@/src/features/properties/PropertyEditorSheet';
import { useProperties } from '@/src/features/properties/hooks/useProperties';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';

export function Properties() {
  const data = useActiveData();
  const { activeBranchId, branches, mergeBranch, approveBranch, selectedItemIdToEdit, setSelectedItemIdToEdit } = useStore();
  const { hasValidWorkspaceContext } = useWorkspaceShell();

  const [activeTab, setActiveTab] = useState<'properties' | 'bundles'>('properties');
  
  // API-powered properties (new)
  const {
    properties: apiProperties,
    isLoading: apiPropertiesLoading,
    error: apiPropertiesError,
    refetch: refetchApiProperties,
    createProperty,
    updateProperty,
    deleteProperty,
    mutationError,
    clearMutationError,
  } = useProperties();
  const [isNewPropertySheetOpen, setIsNewPropertySheetOpen] = useState(false);
  const [apiPropertyEditId, setApiPropertyEditId] = useState<string | null>(null);

  // Table state (legacy, for bundles and branch diff)
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Property state (legacy Zustand-backed edit sheet)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isPropertySheetOpen, setIsPropertySheetOpen] = useState(false);
  const [isCreatingProperty, setIsCreatingProperty] = useState(false);

  // Bundle state
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [isBundleSheetOpen, setIsBundleSheetOpen] = useState(false);
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);

  React.useEffect(() => {
    if (selectedItemIdToEdit) {
      const property = apiProperties.find(p => p.id === selectedItemIdToEdit);
      if (property) {
        setApiPropertyEditId(property.id);
        setIsNewPropertySheetOpen(true);
        setActiveTab('properties');
        setSelectedItemIdToEdit(null);
      }
    }
  }, [selectedItemIdToEdit, apiProperties, setSelectedItemIdToEdit]);

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

  const handleCreateNewApiProperty = () => {
    setApiPropertyEditId(null);
    setIsNewPropertySheetOpen(true);
  };

  const handleOpenApiProperty = (id: string) => {
    setApiPropertyEditId(id);
    setIsNewPropertySheetOpen(true);
  };

  const handleCloseApiPropertySheet = () => {
    setIsNewPropertySheetOpen(false);
    setApiPropertyEditId(null);
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
            <Button
              onClick={() => setIsNewPropertySheetOpen(true)}
              className="gap-2"
              disabled={!hasValidWorkspaceContext}
              title={
                !hasValidWorkspaceContext
                  ? 'Select a valid workspace in the header before creating a property.'
                  : undefined
              }
            >
              <Plus className="w-4 h-4" /> New property
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
                ? 'border-[var(--color-info)] text-[var(--color-info)]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveTab('bundles')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'bundles'
                ? 'border-[var(--color-info)] text-[var(--color-info)]'
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
              <GitMerge className="w-4 h-4 text-[var(--color-info)]" /> Workbench Summary
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

        {activeTab === 'bundles' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search bundles..."
                value={globalFilter ?? ''}
                onChange={e => setGlobalFilter(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        )}

        {activeTab === 'properties' ? (
          <PropertiesList
            onOpenCreate={handleCreateNewApiProperty}
            allowCreate={hasValidWorkspaceContext}
            onOpenProperty={handleOpenApiProperty}
            properties={apiProperties}
            isLoading={apiPropertiesLoading}
            error={apiPropertiesError}
            refetch={refetchApiProperties}
            mutationError={mutationError}
            clearMutationError={clearMutationError}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-8">
            {filteredBundles.map(bundle => (
              <div
                key={bundle.id}
                onClick={() => handleOpenBundle(bundle.id)}
                className="bg-white border rounded-lg p-6 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-[var(--color-info)]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-[var(--color-info)]" />
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

      <PropertyEditorSheet
        isOpen={isNewPropertySheetOpen}
        onClose={handleCloseApiPropertySheet}
        initialProperty={apiPropertyEditId ? apiProperties.find((p) => p.id === apiPropertyEditId) ?? null : null}
        createProperty={createProperty}
        updateProperty={updateProperty}
        deleteProperty={deleteProperty}
        mutationError={mutationError}
        clearMutationError={clearMutationError}
      />

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