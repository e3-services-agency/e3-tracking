import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Source } from '@/src/types';
import { EventAddSourcePopover } from '@/src/features/events/overlays/EventAddSourcePopover';

type EventSourcesSectionProps = {
  variantId?: string;
  sources: Source[];
  allSources: Source[];
  isAddSourceModalOpen: boolean;
  onToggleAddSourceModal: () => void;
  onToggleSource: (source: Source) => void;
};

export function EventSourcesSection({
  variantId,
  sources,
  allSources,
  isAddSourceModalOpen,
  onToggleAddSourceModal,
  onToggleSource,
}: EventSourcesSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3 relative">
        <h3 className="text-[15px] font-bold text-gray-900">Sources</h3>
        {variantId && (
          <button className="text-[var(--color-info)] text-[13px] font-semibold hover:underline">
            Edit on variant
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="border border-orange-300 bg-orange-50 text-orange-700 p-4 rounded-lg text-[14px] font-medium mb-3">
          This event is not sent from any source yet
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {allSources.map((source) => {
            const isSelected = sources.find((s) => s.id === source.id);
            if (!isSelected && variantId) return null;

            return (
              <div
                key={source.id}
                className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-sm cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
                onClick={() => {
                  if (!variantId) {
                    onToggleSource(source);
                  }
                }}
              >
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <span
                  className={`text-[14px] font-bold ${
                    isSelected ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {source.name}
                </span>
                {isSelected && (
                  <div className="w-[16px] h-[16px] rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold ml-2 shadow-sm">
                    P
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="relative mt-3">
        {!variantId && (
          <button
            onClick={onToggleAddSourceModal}
            className="text-[var(--color-info)] text-[14px] font-semibold hover:underline"
          >
            + Add Source
          </button>
        )}
        <EventAddSourcePopover
          isOpen={isAddSourceModalOpen}
          sources={allSources}
          selectedSourceIds={sources.map((s) => s.id)}
          onSelectSource={onToggleSource}
          onClose={onToggleAddSourceModal}
        />
      </div>
    </div>
  );
}

