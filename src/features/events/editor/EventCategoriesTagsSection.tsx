import React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/src/components/ui/Input';

type EventCategoriesTagsSectionProps = {
  categories: string[];
  tags: string[];
  variantId?: string;
  newCategory: string;
  newTag: string;
  onChangeNewCategory: (value: string) => void;
  onChangeNewTag: (value: string) => void;
  onAddCategory: () => void;
  onAddTag: () => void;
  onRemoveCategory: (category: string) => void;
  onRemoveTag: (tag: string) => void;
};

export function EventCategoriesTagsSection({
  categories,
  tags,
  variantId,
  newCategory,
  newTag,
  onChangeNewCategory,
  onChangeNewTag,
  onAddCategory,
  onAddTag,
  onRemoveCategory,
  onRemoveTag,
}: EventCategoriesTagsSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-8">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-[15px] font-bold text-gray-800">Categories</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <span
              key={cat}
              className="flex items-center gap-2 text-[13px] font-medium bg-blue-50 text-blue-700 px-3 py-1.5 rounded border border-blue-100"
            >
              {cat}
              <button onClick={() => onRemoveCategory(cat)}>
                <X className="w-3 h-3 hover:text-red-500" />
              </button>
            </span>
          ))}
          {!variantId && (
            <div className="flex items-center">
              <Input
                value={newCategory}
                onChange={(e) => onChangeNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onAddCategory();
                  }
                }}
                placeholder="+ Add Category..."
                className="h-9 text-[13px] border-dashed w-40 border-gray-300"
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-[15px] font-bold text-gray-800">Tags</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-2 text-[13px] font-medium bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-100"
            >
              {tag}
              <button onClick={() => onRemoveTag(tag)}>
                <X className="w-3 h-3 hover:text-red-500" />
              </button>
            </span>
          ))}
          {!variantId && (
            <div className="flex items-center">
              <Input
                value={newTag}
                onChange={(e) => onChangeNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onAddTag();
                  }
                }}
                placeholder="+ Add tag..."
                className="h-9 text-[13px] border-dashed w-40 border-gray-300"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

