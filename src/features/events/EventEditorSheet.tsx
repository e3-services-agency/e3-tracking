/**
 * Create/Edit Event slide-out sheet. API-powered.
 * Form: Name, Description, Triggers Markdown (Bloomreach). Mapping: Property Picker + attached list with Presence.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { CreateEventInput, EventPropertyPresence } from '@/src/types/schema';
import type { ApiError, EventWithPropertiesResponse } from '@/src/features/events/hooks/useEvents';
import { useProperties } from '@/src/features/properties/hooks/useProperties';
import { AlertCircle, Link2, Plus } from 'lucide-react';

const PRESENCE_OPTIONS: { value: EventPropertyPresence; label: string }[] = [
  { value: 'always_sent', label: 'Always sent' },
  { value: 'sometimes_sent', label: 'Sometimes sent' },
  { value: 'never_sent', label: 'Never sent' },
];

export interface EventEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string | null;
  createEvent: (payload: CreateEventInput) => Promise<
    | { success: true; data: { id: string } }
    | { success: false; error: ApiError }
  >;
  attachProperty: (
    eventId: string,
    propertyId: string,
    presence: EventPropertyPresence
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  updatePresence: (
    eventId: string,
    propertyId: string,
    presence: EventPropertyPresence
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  getEventWithProperties: (eventId: string) => Promise<EventWithPropertiesResponse | null>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
  onEventCreated?: (eventId: string) => void;
}

export function EventEditorSheet({
  isOpen,
  onClose,
  eventId,
  createEvent,
  attachProperty,
  updatePresence,
  getEventWithProperties,
  mutationError,
  clearMutationError,
  onEventCreated,
}: EventEditorSheetProps) {
  const { properties: allProperties } = useProperties();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggersMarkdown, setTriggersMarkdown] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(eventId);
  const [attached, setAttached] = useState<EventWithPropertiesResponse['attached_properties']>([]);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [addPresence, setAddPresence] = useState<EventPropertyPresence>('always_sent');
  const [addingProperty, setAddingProperty] = useState(false);

  const isCreateMode = eventId === null && currentEventId === null;

  const loadEvent = useCallback(async (id: string) => {
    setLoadingEvent(true);
    const result = await getEventWithProperties(id);
    setLoadingEvent(false);
    if (result) {
      setName(result.event.name);
      setDescription(result.event.description ?? '');
      setTriggersMarkdown(result.event.triggers_markdown ?? '');
      setAttached(result.attached_properties);
    }
  }, [getEventWithProperties]);

  useEffect(() => {
    if (!isOpen) return;
    clearMutationError();
    if (eventId) {
      setCurrentEventId(eventId);
      loadEvent(eventId);
    } else {
      setCurrentEventId(null);
      setName('');
      setDescription('');
      setTriggersMarkdown('');
      setAttached([]);
    }
    setSelectedPropertyId('');
    setAddPresence('always_sent');
  }, [isOpen, eventId, clearMutationError, loadEvent]);

  const handleSaveNewEvent = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSaving(true);
    clearMutationError();

    const payload: CreateEventInput = {
      name: trimmedName,
      description: description.trim() || undefined,
      triggers_markdown: triggersMarkdown.trim() || undefined,
    };

    const result = await createEvent(payload);
    setSaving(false);

    if (result.success) {
      setCurrentEventId(result.data.id);
      onEventCreated?.(result.data.id);
    }
  };

  const handleAddProperty = async () => {
    if (!currentEventId || !selectedPropertyId) return;
    setAddingProperty(true);
    clearMutationError();
    const result = await attachProperty(currentEventId, selectedPropertyId, addPresence);
    setAddingProperty(false);
    if (result.success) {
      const updated = await getEventWithProperties(currentEventId);
      if (updated) setAttached(updated.attached_properties);
      setSelectedPropertyId('');
    }
  };

  const handlePresenceChange = async (
    propertyId: string,
    presence: EventPropertyPresence
  ) => {
    if (!currentEventId) return;
    const result = await updatePresence(currentEventId, propertyId, presence);
    if (result.success) {
      const updated = await getEventWithProperties(currentEventId);
      if (updated) setAttached(updated.attached_properties);
    }
  };

  const attachedIds = new Set(attached.map((a) => a.property_id));
  const availableProperties = allProperties.filter((p) => !attachedIds.has(p.id));

  const title = isCreateMode && !currentEventId
    ? 'New Event'
    : currentEventId
      ? 'Edit Event'
      : 'New Event';

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={title} className="w-[520px]">
      <div className="space-y-6 pb-32">
        {mutationError && (
          <div
            className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">
                {mutationError.message}
              </p>
              {mutationError.details && (
                <p className="text-xs text-red-600 mt-1">
                  {mutationError.details}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. checkout_completed, page_viewed"
            className="font-mono"
            disabled={!!currentEventId}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What user action does this event represent?"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-gray-500" />
            Triggers (Markdown) — Bloomreach / technical rules
          </label>
          <textarea
            value={triggersMarkdown}
            onChange={(e) => setTriggersMarkdown(e.target.value)}
            placeholder="Document when this event fires (e.g. Bloomreach weblayer conditions, DOM selectors, or API triggers). Use Markdown for structure."
            rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="text-xs text-gray-500">
            Use this field to document exactly when a Bloomreach weblayer or other
            trigger fires. Supports Markdown.
          </p>
        </div>

        {loadingEvent && currentEventId && (
          <p className="text-sm text-gray-500">Loading event…</p>
        )}

        {currentEventId && (
          <>
            <hr className="border-gray-200" />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Attached properties
              </h3>
              <p className="text-xs text-gray-500">
                Add properties to define the payload for this event. Set presence
                (Always / Sometimes / Never sent).
              </p>

              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-[200px]"
                >
                  <option value="">Select a property…</option>
                  {availableProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.data_type})
                    </option>
                  ))}
                </select>
                <select
                  value={addPresence}
                  onChange={(e) =>
                    setAddPresence(e.target.value as EventPropertyPresence)
                  }
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {PRESENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddProperty}
                  disabled={!selectedPropertyId || addingProperty}
                  className="gap-1"
                >
                  <Plus className="w-4 h-4" /> Add
                </Button>
              </div>

              <ul className="border rounded-lg divide-y divide-gray-100">
                {attached.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-gray-500">
                    No properties attached yet.
                  </li>
                ) : (
                  attached.map((a) => (
                    <li
                      key={a.property_id}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <span className="font-mono text-sm text-gray-900 truncate">
                        {a.property_name || a.property_id}
                      </span>
                      <select
                        value={a.presence}
                        onChange={(e) =>
                          handlePresenceChange(
                            a.property_id,
                            e.target.value as EventPropertyPresence
                          )
                        }
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {PRESENCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>
        )}
      </div>

      <div className="fixed bottom-0 right-0 w-[520px] p-6 bg-white border-t flex justify-end gap-2 z-10">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          {currentEventId ? 'Close' : 'Cancel'}
        </Button>
        {isCreateMode && !currentEventId ? (
          <Button
            onClick={handleSaveNewEvent}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Creating…' : 'Create Event'}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
