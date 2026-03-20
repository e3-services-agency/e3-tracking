import React from 'react';
import { Button } from '@/src/components/ui/Button';
import type { EventTriggerEntry } from '@/src/types/schema';
import { Image as ImageIcon, Pencil, Plus, Trash2, Zap } from 'lucide-react';

type EventTriggerCardsSectionProps = {
  triggers: EventTriggerEntry[];
  hasInvalidTriggers: boolean;
  onAddTrigger: () => void;
  onEditTrigger: (index: number) => void;
  onRemoveTrigger: (index: number) => void;
};

export function EventTriggerCardsSection({
  triggers,
  hasInvalidTriggers,
  onAddTrigger,
  onEditTrigger,
  onRemoveTrigger,
}: EventTriggerCardsSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-gray-700">Triggers</label>
        <Button type="button" variant="outline" size="sm" onClick={onAddTrigger} className="gap-1">
          <Plus className="w-4 h-4" /> Add Trigger
        </Button>
      </div>
      <div className="rounded-md border border-input bg-gray-50 px-3 py-3">
        {triggers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No triggers yet. Add at least one trigger when this event needs firing context.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {triggers.map((trigger, index) => (
              <div
                key={`${trigger.order}-${index}-${trigger.title}`}
                className="rounded-lg border-2 border-amber-400 bg-white shadow-sm overflow-hidden"
              >
                <div className="bg-amber-50 px-3 py-2 border-b border-amber-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-sm font-bold text-amber-900 truncate">
                      {trigger.title || `Trigger ${index + 1}`}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-amber-700 shrink-0">
                    Order {trigger.order}
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  <div className="h-28 rounded-md border bg-gray-50 overflow-hidden flex items-center justify-center">
                    {trigger.image ? (
                      <img
                        src={trigger.image}
                        alt={trigger.title || `Trigger ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    )}
                  </div>

                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    {trigger.source?.trim() || 'Source independent'}
                  </div>

                  <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4 min-h-[5rem]">
                    {trigger.description}
                  </p>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEditTrigger(index)}
                      className="gap-1"
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveTrigger(index)}
                      className="gap-1 text-gray-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" /> Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {hasInvalidTriggers ? (
          <p className="mt-3 text-xs text-red-600">
            Each trigger must include both a title and description before saving.
          </p>
        ) : null}
      </div>
    </div>
  );
}
