/**
 * Create/Edit Event slide-out sheet. API-powered.
 * Form: Name, Description, canonical structured triggers,
 * Property Picker + attached list with Presence.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type {
  CreateEventInput,
  EventPropertyPresence,
  EventTriggerEntry,
} from '@/src/types/schema';
import type { ApiError, EventWithPropertiesResponse } from '@/src/features/events/hooks/useEvents';
import { useProperties } from '@/src/features/properties/hooks/useProperties';
import { useActiveData } from '@/src/store';
import { AlertCircle, Plus, X } from 'lucide-react';

const PRESENCE_OPTIONS: { value: EventPropertyPresence; label: string }[] = [
  { value: 'always_sent', label: 'Always sent' },
  { value: 'sometimes_sent', label: 'Sometimes sent' },
  { value: 'never_sent', label: 'Never sent' },
];

function createEmptyTrigger(order: number): EventTriggerEntry {
  return {
    title: '',
    description: '',
    image: '',
    source: '',
    order,
  };
}

function normalizeTriggers(triggers: EventTriggerEntry[]): EventTriggerEntry[] {
  return triggers
    .map((trigger, index) => ({
      title: trigger.title.trim(),
      description: trigger.description.trim(),
      image: trigger.image?.trim() || null,
      source: trigger.source?.trim() || null,
      order:
        typeof trigger.order === 'number' && Number.isFinite(trigger.order)
          ? trigger.order
          : index,
    }))
    .sort((a, b) => a.order - b.order);
}

export interface EventEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string | null;
  createEvent: (payload: CreateEventInput) => Promise<
    | { success: true; data: { id: string } }
    | { success: false; error: ApiError }
  >;
  updateEvent: (
    eventId: string,
    payload: CreateEventInput
  ) => Promise<
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
  updateEvent,
  attachProperty,
  updatePresence,
  getEventWithProperties,
  mutationError,
  clearMutationError,
  onEventCreated,
}: EventEditorSheetProps) {
  const activeData = useActiveData();
  const { properties: allProperties } = useProperties();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerTeamId, setOwnerTeamId] = useState('');
  const [triggers, setTriggers] = useState<EventTriggerEntry[]>([]);
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
      setOwnerTeamId(result.event.owner_team_id ?? '');
      setTriggers(result.event.triggers ?? []);
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
      setOwnerTeamId('');
      setTriggers([]);
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
      owner_team_id: ownerTeamId || null,
      triggers: normalizedTriggers,
    };

    const result = await createEvent(payload);
    setSaving(false);

    if (result.success) {
      setCurrentEventId(result.data.id);
      onEventCreated?.(result.data.id);
    }
  };

  const handleSaveExistingEvent = async () => {
    if (!currentEventId) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSaving(true);
    clearMutationError();

    const payload: CreateEventInput = {
      name: trimmedName,
      description: description.trim() || undefined,
      owner_team_id: ownerTeamId || null,
      triggers: normalizedTriggers,
    };

    const result = await updateEvent(currentEventId, payload);
    setSaving(false);

    if (result.success) {
      setName(result.data.name);
      setDescription(result.data.description ?? '');
      setOwnerTeamId(result.data.owner_team_id ?? '');
      setTriggers(result.data.triggers ?? []);
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
  const normalizedTriggers = normalizeTriggers(triggers);
  const hasInvalidTriggers = normalizedTriggers.some(
    (trigger) => !trigger.title || !trigger.description
  );

  const updateTrigger = (
    index: number,
    patch: Partial<EventTriggerEntry>
  ) => {
    setTriggers((prev) =>
      prev.map((trigger, triggerIndex) =>
        triggerIndex === index ? { ...trigger, ...patch } : trigger
      )
    );
  };

  const addTrigger = () => {
    setTriggers((prev) => [...prev, createEmptyTrigger(prev.length)]);
  };

  const removeTrigger = (index: number) => {
    setTriggers((prev) => prev.filter((_, triggerIndex) => triggerIndex !== index));
  };

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
            disabled={saving}
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
          <label className="text-sm font-medium text-gray-700">Owner</label>
          <select
            value={ownerTeamId}
            onChange={(e) => setOwnerTeamId(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">No owner selected</option>
            {activeData.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-gray-700">Triggers</label>
            <Button type="button" variant="outline" size="sm" onClick={addTrigger} className="gap-1">
              <Plus className="w-4 h-4" /> Add Trigger
            </Button>
          </div>
          <div className="rounded-md border border-input bg-gray-50 px-3 py-3">
            {triggers.length === 0 ? (
              <p className="text-sm text-gray-500">
                No triggers yet. Add at least one trigger when this event needs firing context.
              </p>
            ) : (
              <div className="space-y-3">
                {triggers.map((trigger, index) => (
                  <div key={index} className="rounded-md border bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Trigger {index + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTrigger(index)}
                        className="text-gray-400 hover:text-red-600"
                        aria-label={`Remove trigger ${index + 1}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Title</label>
                        <Input
                          value={trigger.title}
                          onChange={(e) => updateTrigger(index, { title: e.target.value })}
                          placeholder="e.g. Add to cart tap"
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Order</label>
                        <Input
                          type="number"
                          min={0}
                          value={String(trigger.order)}
                          onChange={(e) =>
                            updateTrigger(index, {
                              order: Number.isFinite(e.target.valueAsNumber)
                                ? e.target.valueAsNumber
                                : index,
                            })
                          }
                          disabled={saving}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Description</label>
                      <textarea
                        value={trigger.description}
                        onChange={(e) =>
                          updateTrigger(index, { description: e.target.value })
                        }
                        placeholder="Describe when this trigger fires."
                        rows={3}
                        disabled={saving}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Image URL</label>
                        <Input
                          value={trigger.image ?? ''}
                          onChange={(e) => updateTrigger(index, { image: e.target.value })}
                          placeholder="Optional screenshot URL"
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Source</label>
                        <Input
                          value={trigger.source ?? ''}
                          onChange={(e) => updateTrigger(index, { source: e.target.value })}
                          placeholder="Optional source"
                          disabled={saving}
                        />
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
            disabled={saving || !name.trim() || hasInvalidTriggers}
          >
            {saving ? 'Creating…' : 'Create Event'}
          </Button>
        ) : (
          <Button
            onClick={handleSaveExistingEvent}
            disabled={saving || !name.trim() || !currentEventId || hasInvalidTriggers}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
