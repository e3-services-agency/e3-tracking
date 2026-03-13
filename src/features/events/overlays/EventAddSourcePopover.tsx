import React from 'react';
import { Source } from '@/src/types';
import { getSourceIcon } from '@/src/features/events/lib/sourcePresentation';

type EventAddSourcePopoverProps = {
  isOpen: boolean;
  sources: Source[];
  selectedSourceIds: string[];
  onSelectSource: (source: Source) => void;
  onClose: () => void;
};

export function EventAddSourcePopover({
  isOpen,
  sources,
  selectedSourceIds,
  onSelectSource,
  onClose,
}: EventAddSourcePopoverProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      ></div>
      <div className="absolute top-full left-0 mt-2 w-[220px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-2">
        {sources.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectSource(s)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left text-[14px] font-medium text-gray-700"
          >
            {getSourceIcon(s.name)}
            {s.name}
          </button>
        ))}
        <div className="border-t border-gray-100 mt-1 pt-1">
          <button className="w-full flex items-center px-4 py-2.5 text-left text-[14px] font-semibold text-[#3E52FF] hover:underline">
            + Set Up New Source
          </button>
        </div>
      </div>
    </>
  );
}

