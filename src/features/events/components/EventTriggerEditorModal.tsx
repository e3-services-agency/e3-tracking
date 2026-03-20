import React, { useEffect } from 'react';
import { Button } from '@/src/components/ui/Button';
import type { EventTriggerEntry } from '@/src/types/schema';
import type { SourceRow } from '@/src/types/schema';
import { Image as ImageIcon, Plus, UploadCloud, X, Zap } from 'lucide-react';

type EventTriggerEditorModalProps = {
  isOpen: boolean;
  trigger: EventTriggerEntry;
  sources: SourceRow[];
  sourcesLoading: boolean;
  sourcesError: string | null;
  isCreatingSource: boolean;
  createSourceName: string;
  createSourceError: string | null;
  isInlineSourceCreateOpen: boolean;
  imageUploadEnabled: boolean;
  imageUploading: boolean;
  imageUploadError: string | null;
  onChange: (patch: Partial<EventTriggerEntry>) => void;
  onUploadImage: (file: File) => Promise<void>;
  onClearImage: () => void;
  onChangeCreateSourceName: (value: string) => void;
  onOpenInlineSourceCreate: () => void;
  onCancelInlineSourceCreate: () => void;
  onCreateSource: () => Promise<void>;
  onSave: () => void;
  onClose: () => void;
};

export function EventTriggerEditorModal({
  isOpen,
  trigger,
  sources,
  sourcesLoading,
  sourcesError,
  isCreatingSource,
  createSourceName,
  createSourceError,
  isInlineSourceCreateOpen,
  imageUploadEnabled,
  imageUploading,
  imageUploadError,
  onChange,
  onUploadImage,
  onClearImage,
  onChangeCreateSourceName,
  onOpenInlineSourceCreate,
  onCancelInlineSourceCreate,
  onCreateSource,
  onSave,
  onClose,
}: EventTriggerEditorModalProps) {
  useEffect(() => {
    if (!isOpen || !imageUploadEnabled) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) return;
        e.preventDefault();
        void onUploadImage(file);
        return;
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [imageUploadEnabled, isOpen, onUploadImage]);

  if (!isOpen) return null;

  const saveDisabled = !trigger.title.trim() || !trigger.description.trim() || imageUploading;
  const selectedSourceValue = trigger.source?.trim() || '';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
      <div className="flex h-[640px] w-[960px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex-1 border-r border-amber-200 bg-amber-50/40 p-8">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ImageIcon className="h-4 w-4" />
            <span>Trigger Image</span>
          </div>

          <label
            className={`flex h-[500px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white p-6 text-center ${
              imageUploadEnabled
                ? 'border-amber-300 hover:bg-amber-50/40'
                : 'cursor-not-allowed border-gray-200'
            }`}
          >
            {trigger.image ? (
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
                <img
                  src={trigger.image}
                  alt={trigger.title || 'Trigger preview'}
                  className="max-h-full max-w-full object-contain"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClearImage();
                  }}
                  className="absolute right-3 top-3 rounded bg-black/60 p-1 text-white hover:bg-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 text-center text-gray-500">
                <ImageIcon className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm font-medium">No trigger image selected</p>
                <p className="mt-1 text-xs">
                  Upload or paste an image here. Successful uploads are stored in `assets`.
                </p>
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!imageUploadEnabled || imageUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void onUploadImage(file);
                e.currentTarget.value = '';
              }}
            />
          </label>

          <div className="mt-3 flex items-start gap-2 text-xs text-gray-500">
            <UploadCloud className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              {!imageUploadEnabled ? (
                <p>
                  Save the event first, then reopen this trigger to upload an image into `assets`.
                </p>
              ) : (
                <p>Click or paste in this image area to upload a trigger image.</p>
              )}
              {imageUploadError ? (
                <p className="mt-2 text-red-600">{imageUploadError}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex w-[340px] flex-col bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Event Trigger
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                value={trigger.title}
                onChange={(e) => onChange({ title: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                placeholder="e.g. Add to cart button tap"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-gray-700">Source</label>
                {!isInlineSourceCreateOpen ? (
                  <button
                    type="button"
                    onClick={onOpenInlineSourceCreate}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New source
                  </button>
                ) : null}
              </div>

              <select
                value={selectedSourceValue}
                onChange={(e) => onChange({ source: e.target.value || null })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                disabled={sourcesLoading || isCreatingSource}
              >
                <option value="">Source independent</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>

              {sourcesLoading ? (
                <p className="mt-1 text-xs text-gray-500">Loading workspace sources…</p>
              ) : null}
              {sourcesError ? (
                <p className="mt-1 text-xs text-red-600">{sourcesError}</p>
              ) : null}

              {isInlineSourceCreateOpen ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-amber-800">
                    Create workspace source
                  </label>
                  <input
                    type="text"
                    value={createSourceName}
                    onChange={(e) => onChangeCreateSourceName(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    placeholder="e.g. Web App"
                    disabled={isCreatingSource}
                  />
                  {createSourceError ? (
                    <p className="mt-2 text-xs text-red-600">{createSourceError}</p>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" onClick={onCancelInlineSourceCreate} disabled={isCreatingSource}>
                      Cancel
                    </Button>
                    <Button onClick={() => void onCreateSource()} disabled={isCreatingSource || !createSourceName.trim()}>
                      {isCreatingSource ? 'Creating…' : 'Create Source'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Order</label>
              <input
                type="number"
                min={0}
                value={String(trigger.order)}
                onChange={(e) =>
                  onChange({
                    order: Number.isFinite(e.currentTarget.valueAsNumber)
                      ? e.currentTarget.valueAsNumber
                      : 0,
                  })
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={trigger.description}
                onChange={(e) => onChange({ description: e.target.value })}
                className="h-32 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                placeholder="Describe exactly when this trigger fires."
              />
            </div>

          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saveDisabled}>
              Save Trigger
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
