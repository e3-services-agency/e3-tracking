import React from 'react';
import { Trash2 } from 'lucide-react';
import { EventVariant, TrackingStatus } from '@/src/types';

const STATUS_COLORS: Record<TrackingStatus, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Ready: 'bg-blue-100 text-blue-700',
  Implementing: 'bg-yellow-100 text-yellow-700',
  Implemented: 'bg-emerald-100 text-emerald-700',
};

type EventVariantsSectionProps = {
  variants: EventVariant[];
  onSelectVariant: (id: string) => void;
  onRemoveVariant: (variant: EventVariant) => void;
  onOpenCreateVariantModal: () => void;
};

export function EventVariantsSection({
  variants,
  onSelectVariant,
  onRemoveVariant,
  onOpenCreateVariantModal,
}: EventVariantsSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[15px] font-bold text-gray-900">Variants</h3>
        <button
          className="text-[13px] font-semibold text-[#3E52FF] hover:underline"
          onClick={onOpenCreateVariantModal}
        >
          + New Variant
        </button>
      </div>
      <div className="border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 text-[13px] font-bold text-gray-700">
          {variants.length} Variant{variants.length !== 1 && 's'}
        </div>
        {variants.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {variants.map((v) => (
              <div
                key={v.id}
                className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => onSelectVariant(v.id)}
                >
                  <div className="text-[15px] font-bold text-gray-900 group-hover:text-[#3E52FF]">
                    {v.name}
                  </div>
                  <div className="text-[13px] font-semibold text-[#3E52FF] mt-1.5">
                    {Object.keys(v.propertyOverrides).length} Overrides
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-[11px] px-3 py-1 rounded-full border font-medium ${STATUS_COLORS[v.trackingStatus ?? 'Draft']}`}>
                    {v.trackingStatus ?? 'Draft'}
                  </span>
                  <button
                    onClick={() => onRemoveVariant(v)}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[14px] text-gray-500 bg-white p-5 text-center italic">
            No variants created.
          </div>
        )}
      </div>
    </div>
  );
}

