import React from 'react';
import { X } from 'lucide-react';

type EventEditorHeaderProps = {
  variantId?: string;
  name: string;
  activeVariantName?: string;
  onChangeName: (value: string) => void;
  onChangeVariantName: (value: string) => void;
  onClose: () => void;
};

export function EventEditorHeader({
  variantId,
  name,
  activeVariantName,
  onChangeName,
  onChangeVariantName,
  onClose,
}: EventEditorHeaderProps) {
  const inputValue = variantId ? activeVariantName ?? '' : name;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (variantId) {
      onChangeVariantName(e.target.value);
    } else {
      onChangeName(e.target.value);
    }
  };

  return (
    <div className="px-8 py-6 flex justify-between items-start border-b border-gray-100 sticky top-0 bg-white z-20 shadow-sm">
      <div className="flex-1 pr-4">
        <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2 uppercase flex items-center gap-2">
          Event {variantId ? 'Variant' : ''}
        </div>
        <div className="flex items-center w-full max-w-[800px] mb-1">
          {variantId && (
            <span className="text-[28px] font-bold text-gray-400 mr-2 whitespace-nowrap">
              {name} -
            </span>
          )}
          <input
            value={inputValue}
            onChange={handleChange}
            className="text-[28px] font-bold border-none px-0 h-auto focus-visible:ring-0 flex-1 min-w-0 shadow-none outline-none text-gray-900"
            placeholder="Event Name"
          />
        </div>
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-700 bg-gray-50 rounded-full p-2 mt-2 shrink-0"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

