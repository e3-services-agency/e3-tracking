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
  /**
   * When set with `onAddRequiredChange`, the Required toggle is controlled by the parent
   * (e.g. API event sheet `handleAddSelectedProperties` reads parent `addRequired`).
   */
  addRequired?: boolean;
  onAddRequiredChange?: (required: boolean) => void;
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
  addRequired: addRequiredProp,
  onAddRequiredChange: onAddRequiredChangeProp,
  onAddSelected,
  adding = false,
  workspaceActionsDisabled = false,
}: AddPropertyModalProps) {
  const [internalAddRequired, setInternalAddRequired] = useState(false);
  const controlledRequired =
    typeof onAddRequiredChangeProp === 'function';
  const addRequired = controlledRequired
    ? (addRequiredProp ?? false)
    : internalAddRequired;
  const setAddRequired = controlledRequired
    ? onAddRequiredChangeProp!
    : setInternalAddRequired;

  useEffect(() => {
    if (!isOpen) return;
    if (!controlledRequired) setInternalAddRequired(false);
  }, [isOpen, controlledRequired]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-xl shadow-2xl w-[1000px] max-w-[95vw] h-[700px] max-h-[90vh] flex flex-col overflow-hidden">
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
        <div className="flex-1 min-h-0 overflow-hidden p-6 flex flex-col">
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
