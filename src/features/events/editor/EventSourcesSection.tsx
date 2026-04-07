import React from 'react';
import { Source } from '@/src/types';
import { AddSourceModal } from '@/src/components/overlays/AddSourceModal';
import { getSourceIcon } from '@/src/features/events/lib/sourcePresentation';
import { X } from 'lucide-react';

type EventSourcesSectionProps = {
  variantId?: string;
  sources: Source[];
  allSources: Source[];
  isAddSourceModalOpen: boolean;
  onOpenAddSourceModal: () => void;
  onCloseAddSourceModal: () => void;
  onAddSelectedSources: (ids: string[]) => void | Promise<void>;
  onToggleSource: (source: Source) => void;
};

export function EventSourcesSection({
  variantId,
  sources,
  allSources,
  isAddSourceModalOpen,
  onOpenAddSourceModal,
  onCloseAddSourceModal,
  onAddSelectedSources,
  onToggleSource,
}: EventSourcesSectionProps) {
  const attachedIds = sources.map((s) => s.id);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 relative">
        <h3 className="text-[15px] font-bold text-gray-900">Sources</h3>
        {variantId && (
          <button type="button" className="text-[var(--color-info)] text-[13px] font-semibold hover:underline">
            Edit on variant
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="border border-orange-300 bg-orange-50 text-orange-700 p-4 rounded-lg text-[14px] font-medium mb-3">
          This event is not sent from any source yet
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3" aria-label="Attached sources">
          {sources.map((source) => (
            <span
              key={source.id}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 max-w-full"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white border border-gray-100">
                {getSourceIcon(source.name)}
              </span>
              <span className="truncate font-medium">{source.name}</span>
              {!variantId && (
                <button
                  type="button"
                  onClick={() => onToggleSource(source)}
                  className="rounded p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  aria-label={`Remove source ${source.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="mt-1">
        {!variantId && (
          <button
            type="button"
            onClick={onOpenAddSourceModal}
            className="text-[var(--color-info)] text-[14px] font-semibold hover:underline"
          >
            + Add Source
          </button>
        )}
      </div>

      <AddSourceModal
        isOpen={isAddSourceModalOpen}
        onClose={onCloseAddSourceModal}
        availableSources={allSources}
        attachedSourceIds={attachedIds}
        onAddSelected={onAddSelectedSources}
      />
    </div>
  );
}
