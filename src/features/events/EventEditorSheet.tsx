/**
 * Create/Edit Event slide-out sheet. API-powered.
 * Form: Name, Description, canonical structured triggers,
 * Property Picker + attached list with Presence.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { EventTriggerCardsSection } from '@/src/features/events/components/EventTriggerCardsSection';
import { EventTriggerEditorModal } from '@/src/features/events/components/EventTriggerEditorModal';
import { uploadEventTriggerImage } from '@/src/features/events/lib/eventTriggerImageStorage';
import type {
  CreateEventInput,
  EventPropertyPresence,
  EventRow,
  EventType,
  EventTriggerEntry,
} from '@/src/types/schema';
import type { ApiError, EventWithPropertiesResponse } from '@/src/features/events/hooks/useEvents';
import { useProperties } from '@/src/features/properties/hooks/useProperties';
import { useActiveData, useStore } from '@/src/store';
import { AlertCircle, Plus, X } from 'lucide-react';

const PRESENCE_OPTIONS: { value: EventPropertyPresence; label: string }[] = [
  { value: 'always_sent', label: 'Always sent' },
  { value: 'sometimes_sent', label: 'Sometimes sent' },
  { value: 'never_sent', label: 'Never sent' },
];

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'track', label: 'Track' },
  { value: 'page', label: 'Page' },
  { value: 'identify', label: 'Identify' },
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

function sortTriggersForEditor(triggers: EventTriggerEntry[]): EventTriggerEntry[] {
  return [...triggers].sort((a, b) => a.order - b.order);
}

function normalizeTokenList(value: string): string[] | null {
  const normalized = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? [...new Set(normalized)] : null;
}

export interface EventEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string | null;
  createEvent: (payload: CreateEventInput) => Promise<
    | { success: true; data: EventRow }
    | { success: false; error: ApiError }
  >;
  updateEvent: (
    eventId: string,
    payload: CreateEventInput
  ) => Promise<
    | { success: true; data: EventRow }
    | { success: false; error: ApiError }
  >;
  attachProperty: (
    eventId: string,
    propertyId: string,
    presence: EventPropertyPresence
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  detachProperty: (
    eventId: string,
    propertyId: string
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
  detachProperty,
  updatePresence,
  getEventWithProperties,
  mutationError,
  clearMutationError,
  onEventCreated,
}: EventEditorSheetProps) {
  const activeData = useActiveData();
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const { properties: allProperties } = useProperties();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState('');
  const [eventType, setEventType] = useState<EventType | ''>('track');
  const [ownerTeamId, setOwnerTeamId] = useState('');
  const [categoriesText, setCategoriesText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [triggers, setTriggers] = useState<EventTriggerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(eventId);
  const [attached, setAttached] = useState<EventWithPropertiesResponse['attached_properties']>([]);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [addPresence, setAddPresence] = useState<EventPropertyPresence>('always_sent');
  const [addingProperty, setAddingProperty] = useState(false);
  const [removingPropertyId, setRemovingPropertyId] = useState<string | null>(null);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | null>(null);
  const [triggerDraft, setTriggerDraft] = useState<EventTriggerEntry>(createEmptyTrigger(0));
  const [triggerImageUploading, setTriggerImageUploading] = useState(false);
  const [triggerImageError, setTriggerImageError] = useState<string | null>(null);

  const isCreateMode = eventId === null && currentEventId === null;

  const loadEvent = useCallback(async (id: string) => {
    setLoadingEvent(true);
    const result = await getEventWithProperties(id);
    setLoadingEvent(false);
    if (result) {
      setName(result.event.name);
      setDescription(result.event.description ?? '');
      setPurpose(result.event.purpose ?? '');
      setEventType(result.event.event_type ?? '');
      setOwnerTeamId(result.event.owner_team_id ?? '');
      setCategoriesText((result.event.categories ?? []).join(', '));
      setTagsText((result.event.tags ?? []).join(', '));
      setTriggers(sortTriggersForEditor(result.event.triggers ?? []));
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
      setPurpose('');
      setEventType('track');
      setOwnerTeamId('');
      setCategoriesText('');
      setTagsText('');
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
      purpose: purpose.trim() || null,
      event_type: eventType || null,
      owner_team_id: ownerTeamId || null,
      categories: normalizeTokenList(categoriesText),
      tags: normalizeTokenList(tagsText),
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
      purpose: purpose.trim() || null,
      event_type: eventType || null,
      owner_team_id: ownerTeamId || null,
      categories: normalizeTokenList(categoriesText),
      tags: normalizeTokenList(tagsText),
      triggers: normalizedTriggers,
    };

    const result = await updateEvent(currentEventId, payload);
    setSaving(false);

    if (result.success) {
      setName(result.data.name);
      setDescription(result.data.description ?? '');
      setPurpose(result.data.purpose ?? '');
      setEventType(result.data.event_type ?? '');
      setOwnerTeamId(result.data.owner_team_id ?? '');
      setCategoriesText((result.data.categories ?? []).join(', '));
      setTagsText((result.data.tags ?? []).join(', '));
      setTriggers(sortTriggersForEditor(result.data.triggers ?? []));
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

  const handleDetachProperty = async (propertyId: string) => {
    if (!currentEventId) return;
    setRemovingPropertyId(propertyId);
    clearMutationError();
    const result = await detachProperty(currentEventId, propertyId);
    setRemovingPropertyId(null);
    if (result.success) {
      const updated = await getEventWithProperties(currentEventId);
      if (updated) {
        setAttached(updated.attached_properties);
      } else {
        setAttached((prev) => prev.filter((item) => item.property_id !== propertyId));
      }
    }
  };

  const attachedIds = new Set(attached.map((a) => a.property_id));
  const availableProperties = allProperties.filter((p) => !attachedIds.has(p.id));
  const normalizedTriggers = normalizeTriggers(triggers);
  const hasInvalidTriggers = normalizedTriggers.some(
    (trigger) => !trigger.title || !trigger.description
  );

  const openTriggerModalForCreate = () => {
    setEditingTriggerIndex(null);
    setTriggerDraft(createEmptyTrigger(triggers.length));
    setTriggerImageError(null);
    setTriggerImageUploading(false);
    setIsTriggerModalOpen(true);
  };

  const openTriggerModalForEdit = (index: number) => {
    const trigger = triggers[index];
    if (!trigger) return;
    setEditingTriggerIndex(index);
    setTriggerDraft({ ...trigger });
    setTriggerImageError(null);
    setTriggerImageUploading(false);
    setIsTriggerModalOpen(true);
  };

  const closeTriggerModal = () => {
    setIsTriggerModalOpen(false);
    setEditingTriggerIndex(null);
    setTriggerDraft(createEmptyTrigger(0));
    setTriggerImageUploading(false);
    setTriggerImageError(null);
  };

  const saveTriggerDraft = () => {
    const nextTrigger: EventTriggerEntry = {
      title: triggerDraft.title,
      description: triggerDraft.description,
      image: triggerDraft.image?.trim() || null,
      source: triggerDraft.source?.trim() || null,
      order:
        typeof triggerDraft.order === 'number' && Number.isFinite(triggerDraft.order)
          ? triggerDraft.order
          : triggers.length,
    };

    setTriggers((prev) => {
      const updated =
        editingTriggerIndex === null
          ? [...prev, nextTrigger]
          : prev.map((trigger, index) =>
              index === editingTriggerIndex ? nextTrigger : trigger
            );
      return sortTriggersForEditor(updated);
    });
    closeTriggerModal();
  };

  const removeTrigger = (index: number) => {
    setTriggers((prev) =>
      sortTriggersForEditor(prev.filter((_, triggerIndex) => triggerIndex !== index))
    );
  };

  const handleTriggerImageUpload = async (file: File) => {
    if (!currentEventId) {
      setTriggerImageError('Save the event first before uploading a trigger image.');
      return;
    }
    if (!activeWorkspaceId) {
      setTriggerImageError('Workspace context missing. Please refresh and try again.');
      return;
    }

    setTriggerImageUploading(true);
    setTriggerImageError(null);
    const result = await uploadEventTriggerImage({
      eventId: currentEventId,
      file,
      workspaceId: activeWorkspaceId,
    });
    setTriggerImageUploading(false);

    if (!result.success) {
      setTriggerImageError(result.error);
      return;
    }

    setTriggerDraft((prev) => ({ ...prev, image: result.url }));
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
          <label className="text-sm font-medium text-gray-700">Purpose</label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Why is this event in the tracking plan?"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Categories</label>
          <Input
            value={categoriesText}
            onChange={(e) => setCategoriesText(e.target.value)}
            placeholder="Comma-separated categories"
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Tags</label>
          <Input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="Comma-separated tags"
            disabled={saving}
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
          <label className="text-sm font-medium text-gray-700">Event Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType | '')}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Not set</option>
            {EVENT_TYPE_OPTIONS.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <EventTriggerCardsSection
          triggers={triggers}
          hasInvalidTriggers={hasInvalidTriggers}
          onAddTrigger={openTriggerModalForCreate}
          onEditTrigger={openTriggerModalForEdit}
          onRemoveTrigger={removeTrigger}
        />

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
                      <div className="flex items-center gap-2">
                        <select
                          value={a.presence}
                          onChange={(e) =>
                            handlePresenceChange(
                              a.property_id,
                              e.target.value as EventPropertyPresence
                            )
                          }
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={removingPropertyId === a.property_id}
                        >
                          {PRESENCE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDetachProperty(a.property_id)}
                          disabled={removingPropertyId === a.property_id}
                          className="h-8 px-2 text-gray-500 hover:text-red-600"
                          aria-label={`Remove ${a.property_name || a.property_id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
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

      <EventTriggerEditorModal
        isOpen={isTriggerModalOpen}
        trigger={triggerDraft}
        imageUploadEnabled={!!currentEventId}
        imageUploading={triggerImageUploading}
        imageUploadError={triggerImageError}
        onChange={(patch) => {
          setTriggerDraft((prev) => ({ ...prev, ...patch }));
          if ('image' in patch || 'title' in patch || 'description' in patch || 'source' in patch) {
            setTriggerImageError(null);
          }
        }}
        onUploadImage={handleTriggerImageUpload}
        onClearImage={() => setTriggerDraft((prev) => ({ ...prev, image: null }))}
        onSave={saveTriggerDraft}
        onClose={closeTriggerModal}
      />
    </Sheet>
  );
}
