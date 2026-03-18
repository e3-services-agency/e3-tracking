import React from 'react';
import type { PropertyBundle } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Check, Trash2 } from 'lucide-react';
import { useBundleEditor } from '@/src/features/properties/hooks/useBundleEditor';

type BundleEditorProps = {
  bundle: PropertyBundle | null | undefined;
  isCreating: boolean;
  onClose: () => void;
};

export function BundleEditor({
  bundle,
  isCreating,
  onClose,
}: BundleEditorProps) {
  const {
    properties,
    name,
    description,
    propertyIds,
    setName,
    setDescription,
    handleSave,
    handleDelete,
    toggleProperty,
  } = useBundleEditor({ bundle, isCreating, onClose });

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
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="What properties are included in this bundle?"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Included Properties ({propertyIds.length})
        </label>
        <div className="border rounded-md max-h-64 overflow-y-auto divide-y bg-gray-50">
          {properties.map((prop) => {
            const isSelected = propertyIds.includes(prop.id);
            return (
              <div
                key={prop.id}
                className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${
                  isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-100'
                }`}
                onClick={() => toggleProperty(prop.id)}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    isSelected
                      ? 'bg-[var(--color-info)] border-[var(--color-info)]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className="font-mono text-sm font-medium text-gray-900">
                    {prop.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {prop.description || 'No description'}
                  </div>
                </div>
              </div>
            );
          })}
          {properties.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-500">
              No properties available. Create some properties first.
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 right-0 w-[500px] p-6 bg-white border-t flex justify-between z-10">
        {!isCreating && bundle ? (
          <Button
            variant="destructive"
            onClick={handleDelete}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Bundle</Button>
        </div>
      </div>
    </div>
  );
}

