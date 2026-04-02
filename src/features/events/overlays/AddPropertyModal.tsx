import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { EventAttachPropertyPicker } from '@/src/features/events/components/EventAttachPropertyPicker';
import type { PropertyRow } from '@/src/types/schema';
import type { PropertyBundle } from '@/src/types';

export type AddPropertyModalProps = {
  isOpen: boolean;
  mode: 'event' | 'system';
  onClose: () => void;
  /** Catalog rows the user can pick from; picker filters internally. */
  availableProperties: PropertyRow[];
  /** Already attached / included ids (shown disabled + excluded from bulk add). */
  attachedIds: ReadonlySet<string>;
  bundles?: PropertyBundle[];
  hideBundlesTab?: boolean;
  /** Legacy event editor & bundle editor: no Required toggle. */
  hideAddRequiredToggle?: boolean;
  onAddSelected: (ids: string[]) => Promise<boolean>;
  adding?: boolean;
  workspaceActionsDisabled?: boolean;
};

export function AddPropertyModal({
  isOpen,
  mode,
  onClose,
  availableProperties,
  attachedIds,
  bundles = [],
  hideBundlesTab = false,
  hideAddRequiredToggle = false,
  onAddSelected,
  adding = false,
  workspaceActionsDisabled = false,
}: AddPropertyModalProps) {
  const [addRequired, setAddRequired] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAddRequired(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-[1000px] h-[500px] flex overflow-hidden flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-gray-900">
            Add {mode === 'event' ? 'Event' : 'System'} Property
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden p-6">
          <EventAttachPropertyPicker
            availableProperties={availableProperties}
            attachedIds={attachedIds}
            addRequired={hideAddRequiredToggle ? false : addRequired}
            onAddRequiredChange={hideAddRequiredToggle ? () => {} : setAddRequired}
            onAddSelected={onAddSelected}
            adding={adding}
            workspaceActionsDisabled={workspaceActionsDisabled}
            bundles={bundles}
            hideBundlesTab={hideBundlesTab}
            hideAddRequiredToggle={hideAddRequiredToggle}
          />
        </div>
      </div>
    </div>
  );
}
