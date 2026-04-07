import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Plus, Loader2, AlertCircle, Layers } from 'lucide-react';
import { PropertiesList } from '@/src/features/properties/PropertiesList';
import { PropertyEditorSheet } from '@/src/features/properties/PropertyEditorSheet';
import { BundleEditor } from '@/src/features/properties/editor/BundleEditor';
import {
  useProperties,
  type PropertyUpdatePayload,
} from '@/src/features/properties/hooks/useProperties';
import { useBundles } from '@/src/features/properties/hooks/useBundles';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { Sheet } from '@/src/components/ui/Sheet';
import { Badge } from '@/src/components/ui/Badge';
import type { CreatePropertyInput, PropertyRow } from '@/src/types/schema';

function BundlePropertyBadges({
  propertyIds,
  properties,
}: {
  propertyIds: string[];
  properties: PropertyRow[];
}) {
  if (propertyIds.length === 0) {
    return <span className="text-gray-400 italic text-xs">Empty</span>;
  }

  const visibleIds = propertyIds.slice(0, 3);
  const restCount = propertyIds.length > 3 ? propertyIds.length - 3 : 0;

  return (
    <div
      className="flex flex-wrap gap-1.5 items-center max-w-xl min-w-0"
      onClick={(e) => e.stopPropagation()}
    >
      {visibleIds.map((id) => {
        const row = properties.find((p) => p.id === id);
        if (row) {
          return (
            <Badge
              key={id}
              variant="secondary"
              className="font-normal font-sans text-gray-700 bg-gray-100 border-0 max-w-[12rem] truncate"
              title={row.name}
            >
              {row.name}
            </Badge>
          );
        }
        return (
          <span
            key={id}
            className="inline-flex max-w-[10rem] truncate rounded-md bg-amber-50 px-2 py-0.5 text-xs font-mono text-amber-800 ring-1 ring-amber-200/80"
            title={`Missing from catalog: ${id}`}
          >
            Missing: {id}
          </span>
        );
      })}
      {restCount > 0 ? (
        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          +{restCount} more
        </span>
      ) : null}
    </div>
  );
}

export function Properties() {
  const { selectedItemIdToEdit, setSelectedItemIdToEdit } = useStore();
  const { hasValidWorkspaceContext } = useWorkspaceShell();
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

  const {
    bundles,
    isLoading: bundlesLoading,
    error: bundlesError,
    refetch: refetchBundles,
  } = useBundles();

  const updatePropertyWithBundleSync = useCallback(
    async (id: string, payload: PropertyUpdatePayload) => {
      const result = await updateProperty(id, payload);
      if (result.success && Object.prototype.hasOwnProperty.call(payload, 'bundle_ids')) {
        await refetchBundles();
      }
      return result;
    },
    [updateProperty, refetchBundles]
  );

  const createPropertyWithBundleSync = useCallback(
    async (payload: CreatePropertyInput) => {
      const result = await createProperty(payload);
      if (
        result.success &&
        Array.isArray(payload.bundle_ids) &&
        payload.bundle_ids.length > 0
      ) {
        await refetchBundles();
      }
      return result;
    },
    [createProperty, refetchBundles]
  );

  const [mainTab, setMainTab] = useState<'properties' | 'bundles'>('properties');
  const [isNewPropertySheetOpen, setIsNewPropertySheetOpen] = useState(false);
  const [apiPropertyEditId, setApiPropertyEditId] = useState<string | null>(null);

  const [bundleSheetOpen, setBundleSheetOpen] = useState(false);
  const [bundleEditId, setBundleEditId] = useState<string | null>(null);
  const [bundleCreating, setBundleCreating] = useState(false);

  /**
   * Same contract as Events: resolve after properties finish loading; never leave selectedItemIdToEdit stuck;
   * no fallback if the id is not in the workspace API list.
   */
  useEffect(() => {
    if (!selectedItemIdToEdit) return;
    if (apiPropertiesLoading) return;

    const property = apiProperties.find((p) => p.id === selectedItemIdToEdit);
    if (property) {
      setApiPropertyEditId(property.id);
      setIsNewPropertySheetOpen(true);
      setMainTab('properties');
    }
    setSelectedItemIdToEdit(null);
  }, [selectedItemIdToEdit, apiProperties, apiPropertiesLoading, setSelectedItemIdToEdit]);

  const handleCloseApiPropertySheet = () => {
    setIsNewPropertySheetOpen(false);
    setApiPropertyEditId(null);
  };

  const handleCloseBundleSheet = () => {
    setBundleSheetOpen(false);
    setBundleEditId(null);
    setBundleCreating(false);
  };

  const selectedBundle = bundleEditId ? bundles.find((b) => b.id === bundleEditId) ?? null : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Definitions for the current workspace, loaded and saved via the API.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mainTab === 'properties' ? (
            <Button
              onClick={() => {
                setApiPropertyEditId(null);
                setIsNewPropertySheetOpen(true);
              }}
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
            <Button
              onClick={() => {
                setBundleEditId(null);
                setBundleCreating(true);
                setBundleSheetOpen(true);
              }}
              className="gap-2"
              disabled={!hasValidWorkspaceContext}
              title={
                !hasValidWorkspaceContext
                  ? 'Select a valid workspace in the header before creating a bundle.'
                  : undefined
              }
            >
              <Plus className="w-4 h-4" /> Create bundle
            </Button>
          )}
        </div>
      </div>

      <div className="px-8 pt-4 border-b bg-white shrink-0">
        <nav className="flex gap-1" aria-label="Properties workspace sections">
          <button
            type="button"
            onClick={() => setMainTab('properties')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
              mainTab === 'properties'
                ? 'border-[var(--color-info)] text-[var(--color-info)] bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Properties
          </button>
          <button
            type="button"
            onClick={() => setMainTab('bundles')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors inline-flex items-center gap-2 ${
              mainTab === 'bundles'
                ? 'border-[var(--color-info)] text-[var(--color-info)] bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Layers className="w-4 h-4" /> Bundles
          </button>
        </nav>
      </div>

      <div className="p-8 flex-1 overflow-hidden flex flex-col">
        {mainTab === 'properties' && (
          <PropertiesList
            onOpenCreate={() => {
              setApiPropertyEditId(null);
              setIsNewPropertySheetOpen(true);
            }}
            allowCreate={hasValidWorkspaceContext}
            onOpenProperty={(id) => {
              setApiPropertyEditId(id);
              setIsNewPropertySheetOpen(true);
            }}
            properties={apiProperties}
            isLoading={apiPropertiesLoading}
            error={apiPropertiesError}
            refetch={refetchApiProperties}
            mutationError={mutationError}
            clearMutationError={clearMutationError}
          />
        )}

        {mainTab === 'bundles' && (
          <div className="flex-1 flex flex-col min-h-0">
            {bundlesLoading && (
              <div className="flex items-center gap-2 text-gray-600 py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading bundles…
              </div>
            )}
            {!bundlesLoading && bundlesError && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex gap-2 items-start"
                role="alert"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                {bundlesError}
              </div>
            )}
            {!bundlesLoading && !bundlesError && (
              <div className="bg-white rounded-lg border shadow-sm flex-1 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                      <th className="px-6 py-3 font-medium text-gray-500">Description</th>
                      <th className="px-6 py-3 font-medium text-gray-500">Properties</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bundles.map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => {
                          setBundleCreating(false);
                          setBundleEditId(b.id);
                          setBundleSheetOpen(true);
                        }}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-gray-900">{b.name}</td>
                        <td className="px-6 py-4 text-gray-600 max-w-md truncate">
                          {b.description || '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-500 align-top min-w-0">
                          <BundlePropertyBadges
                            propertyIds={b.propertyIds}
                            properties={apiProperties}
                          />
                        </td>
                      </tr>
                    ))}
                    {bundles.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-10 text-center text-gray-500">
                          No bundles yet. Create one to group properties for faster event setup.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <PropertyEditorSheet
        isOpen={isNewPropertySheetOpen}
        onClose={handleCloseApiPropertySheet}
        initialProperty={apiPropertyEditId ? apiProperties.find((p) => p.id === apiPropertyEditId) ?? null : null}
        workspaceProperties={apiProperties}
        createProperty={createPropertyWithBundleSync}
        updateProperty={updatePropertyWithBundleSync}
        deleteProperty={deleteProperty}
        mutationError={mutationError}
        clearMutationError={clearMutationError}
      />

      <Sheet
        isOpen={bundleSheetOpen}
        onClose={handleCloseBundleSheet}
        title={bundleCreating ? 'Create bundle' : 'Edit bundle'}
        className="w-[500px]"
      >
        <BundleEditor
          key={bundleCreating ? 'new' : bundleEditId ?? 'none'}
          bundle={bundleCreating ? null : selectedBundle}
          isCreating={bundleCreating}
          onClose={handleCloseBundleSheet}
          onSuccess={() => void refetchBundles()}
          workspaceProperties={apiProperties}
        />
      </Sheet>
    </div>
  );
}
