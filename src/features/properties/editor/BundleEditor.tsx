import React, { useEffect, useMemo, useState } from 'react';
import type { Property, PropertyBundle, PropertyValueType } from '@/src/types';
import type { PropertyRow, PropertyDataType } from '@/src/types/schema';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Trash2, Loader2, Plus, X } from 'lucide-react';
import { useBundleEditor } from '@/src/features/properties/hooks/useBundleEditor';
import { AddPropertyModal } from '@/src/features/events/overlays/AddPropertyModal';

type BundleEditorProps = {
  bundle: PropertyBundle | null | undefined;
  isCreating: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  workspaceProperties: PropertyRow[];
};

function dataTypeToValueType(dt: PropertyDataType): PropertyValueType {
  if (dt === 'boolean') return 'boolean';
  if (dt === 'number') return 'integer';
  return 'string';
}

function propertyRowToModalProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    property_value_type: dataTypeToValueType(row.data_type),
    is_list: false,
    attached_events: [],
    value_constraints: [],
    categories: [],
    tags: [],
  };
}

export function BundleEditor({
  bundle,
  isCreating,
  onClose,
  onSuccess,
  workspaceProperties,
}: BundleEditorProps) {
  const {
    name,
    description,
    propertyIds,
    setName,
    setDescription,
    isSaving,
    saveError,
    handleSave,
    handleDelete,
    addPropertyId,
    removePropertyId,
  } = useBundleEditor({ bundle, isCreating, onClose, onSuccess, workspaceProperties });

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [hoveredPropId, setHoveredPropId] = useState<string | null>(null);
  const [propSearch, setPropSearch] = useState('');

  const allPropertiesModal = useMemo(
    () => workspaceProperties.map(propertyRowToModalProperty),
    [workspaceProperties],
  );

  const filteredAvailableProps = useMemo(() => {
    const q = propSearch.toLowerCase();
    return workspaceProperties
      .filter((p) => !propertyIds.includes(p.id))
      .map(propertyRowToModalProperty)
      .filter((p) => p.name.toLowerCase().includes(q));
  }, [workspaceProperties, propertyIds, propSearch]);

  useEffect(() => {
    if (!addModalOpen) return;
    if (filteredAvailableProps.length === 0) {
      setHoveredPropId(null);
      return;
    }
    if (!hoveredPropId || !filteredAvailableProps.some((p) => p.id === hoveredPropId)) {
      setHoveredPropId(filteredAvailableProps[0].id);
    }
  }, [addModalOpen, filteredAvailableProps, hoveredPropId]);

  const selectedPropertyRows = useMemo(() => {
    return propertyIds
      .map((id) => workspaceProperties.find((p) => p.id === id))
      .filter((p): p is PropertyRow => Boolean(p));
  }, [propertyIds, workspaceProperties]);

  const openAddPropertyModal = () => {
    setPropSearch('');
    setHoveredPropId(null);
    setAddModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Bundle Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. E-commerce Properties"
          disabled={isSaving}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSaving}
          className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="What properties are included in this bundle?"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-gray-700">
            Included properties ({propertyIds.length})
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={openAddPropertyModal}
            disabled={isSaving || workspaceProperties.length === 0}
          >
            <Plus className="w-4 h-4" />
            Add property
          </Button>
        </div>
        {workspaceProperties.length === 0 && (
          <p className="text-sm text-gray-500">
            No workspace properties yet. Create properties on the Properties tab first.
          </p>
        )}
        {selectedPropertyRows.length > 0 ? (
          <ul className="border rounded-md divide-y bg-gray-50/80 max-h-56 overflow-y-auto">
            {selectedPropertyRows.map((prop) => (
              <li
                key={prop.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-mono font-medium text-gray-900 truncate">
                    {prop.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {prop.description || 'No description'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePropertyId(prop.id)}
                  disabled={isSaving}
                  className="shrink-0 rounded p-1 text-gray-500 hover:text-red-600 hover:bg-red-50"
                  aria-label={`Remove ${prop.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 border border-dashed rounded-md px-3 py-4 text-center">
            No properties in this bundle yet. Use &quot;Add property&quot; to pick from the catalog.
          </p>
        )}
      </div>

      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {saveError}
        </div>
      )}

      <div className="fixed bottom-0 right-0 w-[500px] p-6 bg-white border-t flex justify-between z-10">
        {!isCreating && bundle ? (
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={isSaving}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save Bundle'
            )}
          </Button>
        </div>
      </div>

      <AddPropertyModal
        isOpen={addModalOpen}
        mode="event"
        filteredAvailableProps={filteredAvailableProps}
        hoveredPropId={hoveredPropId}
        onHoverProperty={setHoveredPropId}
        onSelectProperty={(p) => {
          addPropertyId(p.id);
          setAddModalOpen(false);
          setPropSearch('');
        }}
        search={propSearch}
        onChangeSearch={setPropSearch}
        allProperties={allPropertiesModal}
        onClose={() => {
          setAddModalOpen(false);
          setPropSearch('');
        }}
        hideBundlesTab
      />
    </div>
  );
}
