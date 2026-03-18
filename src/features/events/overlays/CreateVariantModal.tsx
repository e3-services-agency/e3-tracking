import React from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';

type CreateVariantModalProps = {
  isOpen: boolean;
  name: string;
  newVariantName: string;
  onChangeNewVariantName: (value: string) => void;
  onCreateVariant: () => void;
  onClose: () => void;
};

export function CreateVariantModal({
  isOpen,
  name,
  newVariantName,
  onChangeNewVariantName,
  onCreateVariant,
  onClose,
}: CreateVariantModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl w-[500px] overflow-hidden">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Create event variant
          </h2>
          <p className="text-[15px] text-gray-700 leading-relaxed mb-6">
            Give the variant a descriptive name. It will not impact how the
            event name is sent to destinations.
          </p>

          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-gray-900 whitespace-nowrap">
              {name} -
            </span>
            <Input
              value={newVariantName}
              onChange={(e) => onChangeNewVariantName(e.target.value)}
              placeholder="Type a variant name..."
              className="flex-1 text-[15px] h-10 border-2 border-[var(--color-info)] focus-visible:ring-0 rounded-lg shadow-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateVariant();
              }}
            />
          </div>
        </div>
        <div className="px-8 py-5 bg-white flex justify-end gap-3 border-t border-gray-100">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-10 px-6 text-[15px] text-gray-600 border-gray-300 rounded-lg"
          >
            Cancel
          </Button>
          <Button
            onClick={onCreateVariant}
            disabled={!newVariantName.trim()}
            className="h-10 px-6 text-[15px] bg-[var(--surface-disabled)] text-white disabled:opacity-100 rounded-lg border-none shadow-none font-bold data-[valid=true]:bg-[var(--brand-primary)]"
            data-valid={!!newVariantName.trim()}
          >
            Create variant
          </Button>
        </div>
      </div>
    </div>
  );
}

