import React, { useState, useEffect } from 'react';
import { useStore } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Plus } from 'lucide-react';
import { PropertiesList } from '@/src/features/properties/PropertiesList';
import { PropertyEditorSheet } from '@/src/features/properties/PropertyEditorSheet';
import { useProperties } from '@/src/features/properties/hooks/useProperties';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';

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
  const [isNewPropertySheetOpen, setIsNewPropertySheetOpen] = useState(false);
  const [apiPropertyEditId, setApiPropertyEditId] = useState<string | null>(null);

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
    }
    setSelectedItemIdToEdit(null);
  }, [selectedItemIdToEdit, apiProperties, apiPropertiesLoading, setSelectedItemIdToEdit]);

  const handleCloseApiPropertySheet = () => {
    setIsNewPropertySheetOpen(false);
    setApiPropertyEditId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Definitions for the current workspace, loaded and saved via the API.
          </p>
        </div>
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
      </div>

      <div className="p-8 flex-1 overflow-hidden flex flex-col">
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
    </div>
  );
}
