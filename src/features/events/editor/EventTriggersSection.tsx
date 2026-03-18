import React from 'react';
import { X, Image as ImageIcon } from 'lucide-react';

type EventTrigger = {
  id: string;
  image?: string;
  source?: string;
  desc?: string;
  name?: string;
};

type EventTriggersSectionProps = {
  triggers: EventTrigger[];
  onOpenTriggerModal: () => void;
  onEditTrigger?: (trigger: EventTrigger) => void;
  onRemoveTrigger: (id: string) => void;
};

export function EventTriggersSection({
  triggers,
  onOpenTriggerModal,
  onEditTrigger,
  onRemoveTrigger,
}: EventTriggersSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[15px] font-bold text-gray-900">
          Triggered when
        </h3>
        <button
          onClick={onOpenTriggerModal}
          className="text-[13px] font-semibold text-[var(--color-info)] hover:underline"
        >
          + New Trigger
        </button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {triggers.length > 0 ? (
          triggers.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => onEditTrigger?.(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEditTrigger?.(t);
                }
              }}
              className="border border-gray-200 rounded-lg p-4 w-48 bg-white flex flex-col gap-2 shrink-0 shadow-sm cursor-pointer hover:border-[var(--color-info)] hover:border-2 hover:shadow-md transition-all relative group"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTrigger(t.id);
                }}
                className="absolute top-2 right-2 text-white bg-black/50 p-1 rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-500"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="w-full h-28 bg-gray-50 rounded-md flex items-center justify-center border border-gray-100 overflow-hidden relative">
                {t.image ? (
                  <img
                    src={t.image}
                    className="object-cover w-full h-full"
                    alt="Trigger"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2">
                {t.source || 'Source Independent'}
              </div>
              <div className="text-[14px] font-bold text-gray-900 leading-tight line-clamp-2">
                {t.name || 'Unnamed trigger'}
              </div>
              <div className="text-[12px] text-gray-500 line-clamp-1">
                {t.desc || 'No description...'}
              </div>
            </div>
          ))
        ) : (
          <div className="text-[13px] text-gray-500 italic p-1">
            No triggers defined. Add a trigger to show exactly when this
            event fires.
          </div>
        )}
      </div>
    </div>
  );
}

