import React from 'react';
import type { Property } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { AlertCircle, Trash2, X } from 'lucide-react';
import { usePropertyEditor } from '@/src/features/properties/hooks/usePropertyEditor';

type PropertyEditorProps = {
  property: Property | null | undefined;
  isCreating: boolean;
  onClose: () => void;
};

export function PropertyEditor({
  property,
  isCreating,
  onClose,
}: PropertyEditorProps) {
  const {
    auditConfig,
    customPropertyFields,
    name,
    propertyValueType,
    isList,
    description,
    categories,
    tags,
    valueConstraints,
    customFields,
    newCategory,
    newTag,
    suggestedName,
    setName,
    setPropertyValueType,
    setIsList,
    setDescription,
    setCategories,
    setTags,
    setValueConstraints,
    setCustomFields,
    setNewCategory,
    setNewTag,
    handleSave,
    handleDelete,
    addCategory,
    addTag,
  } = usePropertyEditor({ property, isCreating, onClose });

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Property Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. ${
            auditConfig.propertyNaming === 'snake_case'
              ? 'user_id'
              : 'User Id'
          }`}
          className="font-mono"
        />
        {suggestedName && name.trim().length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded-md border border-gray-200">
            <AlertCircle className="w-4 h-4" />
            <span>Format:</span>
            <button
              onClick={() => setName(suggestedName!)}
              className="text-xs font-mono bg-white border px-1.5 py-0.5 rounded hover:bg-gray-100"
            >
              {suggestedName}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Value Type
          </label>
          <select
            value={propertyValueType}
            onChange={(e) =>
              setPropertyValueType(e.target.value as PropertyValueType)
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="string">String</option>
            <option value="integer">Integer</option>
            <option value="float">Float</option>
            <option value="boolean">Boolean</option>
          </select>
        </div>
        <div className="space-y-2 flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isList}
              onChange={(e) => setIsList(e.target.checked)}
              className="rounded border-gray-300 text-[var(--color-info)] focus:ring-[var(--color-info)]"
            />
            Is List (Array)
          </label>
        </div>
      </div>

      {customPropertyFields.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2">
            Custom Fields
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {customPropertyFields.map((cf) => (
              <div key={cf.id}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {cf.name}
                </label>
                {cf.type === 'boolean' ? (
                  <select
                    value={
                      customFields[cf.id] !== undefined
                        ? String(customFields[cf.id])
                        : ''
                    }
                    onChange={(e) =>
                      setCustomFields({
                        ...customFields,
                        [cf.id]: e.target.value === 'true',
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select...</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <Input
                    type={cf.type === 'number' ? 'number' : 'text'}
                    value={customFields[cf.id] || ''}
                    onChange={(e) =>
                      setCustomFields({
                        ...customFields,
                        [cf.id]:
                          cf.type === 'number'
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                    placeholder={cf.type === 'url' ? 'https://...' : ''}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Value Constraints (Optional)
        </label>
        <Input
          value={valueConstraints}
          onChange={(e) => setValueConstraints(e.target.value)}
          placeholder="e.g. Free, Pro, Enterprise (comma separated) or regex"
        />
        <p className="text-xs text-gray-500">
          Comma-separated list for enums, or a regex pattern.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="What does this property represent?"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Categories</label>
        <div className="flex gap-2">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="Add category..."
          />
          <Button type="button" onClick={addCategory} variant="outline">
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {categories.map((cat) => (
            <span
              key={cat}
              className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md border border-blue-200"
            >
              {cat}
              <button
                onClick={() =>
                  setCategories(categories.filter((c) => c !== cat))
                }
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Tags</label>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add tag..."
          />
          <Button type="button" onClick={addTag} variant="outline">
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md border border-gray-200"
            >
              {tag}
              <button
                onClick={() => setTags(tags.filter((t) => t !== tag))}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 right-0 w-[500px] p-6 bg-white border-t flex justify-between z-10">
        {!isCreating && property ? (
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
          <Button onClick={handleSave}>Save Property</Button>
        </div>
      </div>
    </div>
  );
}

