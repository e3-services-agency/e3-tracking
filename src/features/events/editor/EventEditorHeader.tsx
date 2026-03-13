import React from 'react';
import { X } from 'lucide-react';
import type { TrackingStatus } from '@/src/types';

const STATUS_OPTIONS: TrackingStatus[] = ['Draft', 'Ready', 'Implementing', 'Implemented'];

const STATUS_COLORS: Record<TrackingStatus, string> = {
  Draft: 'bg-gray-100 text-gray-600 border-gray-200',
  Ready: 'bg-blue-100 text-blue-700 border-blue-200',
  Implementing: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Implemented: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

type EventEditorHeaderProps = {
  variantId?: string;
  name: string;
  activeVariantName?: string;
  trackingStatus: TrackingStatus;
  onChangeName: (value: string) => void;
  onChangeVariantName: (value: string) => void;
  onChangeTrackingStatus: (value: TrackingStatus) => void;
  onClose: () => void;
};

export function EventEditorHeader({
  variantId,
  name,
  activeVariantName,
  trackingStatus,
  onChangeName,
  onChangeVariantName,
  onChangeTrackingStatus,
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
        <div className="flex items-center w-full max-w-[800px] mb-1 gap-4 flex-wrap">
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
          <select
            value={trackingStatus}
            onChange={(e) => onChangeTrackingStatus(e.target.value as TrackingStatus)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full border cursor-pointer ${STATUS_COLORS[trackingStatus] ?? STATUS_COLORS.Draft}`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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

