/**
 * Create/Edit Event slide-out sheet. API-powered.
 * Form: Name, Description, canonical structured triggers,
 * Property Picker + attached list with Presence.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { IconSelect, type IconSelectOption } from '@/src/components/ui/IconSelect';
import { EventAttachPropertyPicker } from '@/src/features/events/components/EventAttachPropertyPicker';
import {
  EventPropertyOverridesSection,
  type EventPropertyOverridesSectionProps,
} from '@/src/features/events/components/EventPropertyOverridesSection';
import { EventTriggerCardsSection } from '@/src/features/events/components/EventTriggerCardsSection';
import { EventTriggerEditorModal } from '@/src/features/events/components/EventTriggerEditorModal';
import { uploadEventTriggerImage } from '@/src/features/events/lib/eventTriggerImageStorage';
import {
  createWorkspaceSource,
  listWorkspaceSources,
} from '@/src/features/events/lib/eventTriggerSourcesApi';
import {
  EVENT_TYPES,
  type CreateEventInput,
  type EventPropertyPresence,
  type EventRow,
  type EventType,
  type EventTriggerEntry,
  type SourceRow,
  type PropertyRow,
} from '@/src/types/schema';
import type { ApiError, EventWithPropertiesResponse } from '@/src/features/events/hooks/useEvents';
import { useProperties } from '@/src/features/properties/hooks/useProperties';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { Activity, AlertCircle, Layout, UserRound, X } from 'lucide-react';

const PRESENCE_OPTIONS: { value: EventPropertyPresence; label: string }[] = [
  { value: 'always_sent', label: 'Always sent' },
  { value: 'sometimes_sent', label: 'Sometimes sent' },
  { value: 'never_sent', label: 'Never sent' },
];

/** ~20% wider than legacy 520px; capped on narrow viewports. */
const EVENT_EDITOR_SHEET_WIDTH_CLASS = 'w-[min(624px,calc(100vw-1rem))]';

const ATTACHED_DESC_PREVIEW_CHARS = 50;

/**
 * Maps API `event_type` into editor state without defaulting to `track`.
 * Additional product types (e.g. update customer, anonymize customer) need schema + API support before UI options.
 */
function classifyLoadedEventType(
  raw: string | null | undefined
):
  | { kind: 'unset' }
  | { kind: 'known'; value: EventType }
  | { kind: 'unsupported'; raw: string } {
  if (raw === null || raw === undefined) return { kind: 'unset' };
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (t === '') return { kind: 'unset' };
  if ((EVENT_TYPES as readonly string[]).includes(t)) {
    return { kind: 'known', value: t as EventType };
  }
  return { kind: 'unsupported', raw: t };
}

function applyEventTypeLoad(
  raw: string | null | undefined,
  setSelection: (v: EventType | '') => void,
  setUnsupported: (v: string | null) => void
) {
  const c = classifyLoadedEventType(raw);
  if (c.kind === 'unset') {
    setSelection('');
    setUnsupported(null);
  } else if (c.kind === 'known') {
    setSelection(c.value);
    setUnsupported(null);
  } else {
    setSelection('');
    setUnsupported(c.raw);
  }
}

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
  getEffectivePropertyDefinitions: EventPropertyOverridesSectionProps['getEffectivePropertyDefinitions'];
  putEventPropertyDefinitions: EventPropertyOverridesSectionProps['putEventPropertyDefinitions'];
  deleteEventPropertyDefinition: EventPropertyOverridesSectionProps['deleteEventPropertyDefinition'];
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
  getEffectivePropertyDefinitions,
  putEventPropertyDefinitions,
  deleteEventPropertyDefinition,
  mutationError,
  clearMutationError,
  onEventCreated,
}: EventEditorSheetProps) {
  const { activeWorkspaceId, hasValidWorkspaceContext } = useWorkspaceShell();
  const { properties: allProperties } = useProperties();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState('');
  /** '' means persisted null / not set in the API. */
  const [eventTypeSelection, setEventTypeSelection] = useState<EventType | ''>('');
  const [storedUnsupportedEventType, setStoredUnsupportedEventType] = useState<string | null>(null);
  /**
   * Snapshot of `owner_team_id` from the server for the event being edited only. Not user-editable.
   * Create flow always sends `owner_team_id: null`; updates send this ref so we never rely on mutable form state.
   */
  const ownerTeamIdPersistedRef = useRef<string | null>(null);
  const [categoriesText, setCategoriesText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [triggers, setTriggers] = useState<EventTriggerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(eventId);
  const [attached, setAttached] = useState<EventWithPropertiesResponse['attached_properties']>([]);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [addPresence, setAddPresence] = useState<EventPropertyPresence>('always_sent');
  const [addingProperty, setAddingProperty] = useState(false);
  const [removingPropertyId, setRemovingPropertyId] = useState<string | null>(null);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | null>(null);
  const [triggerDraft, setTriggerDraft] = useState<EventTriggerEntry>(createEmptyTrigger(0));
  const [triggerImageUploading, setTriggerImageUploading] = useState(false);
  const [triggerImageError, setTriggerImageError] = useState<string | null>(null);
  const [workspaceSources, setWorkspaceSources] = useState<SourceRow[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [isInlineSourceCreateOpen, setIsInlineSourceCreateOpen] = useState(false);
  const [createSourceName, setCreateSourceName] = useState('');
  const [createSourceError, setCreateSourceError] = useState<string | null>(null);
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [attachedDescExpandedId, setAttachedDescExpandedId] = useState<string | null>(null);

  const isCreateMode = eventId === null && currentEventId === null;

  const propertyById = useMemo(() => {
    const m = new Map<string, PropertyRow>();
    for (const p of allProperties) m.set(p.id, p);
    return m;
  }, [allProperties]);

  const eventTypeSelectOptions = useMemo((): IconSelectOption<EventType>[] => {
    const core: IconSelectOption<EventType>[] = [
      { value: 'track', label: 'Track Event', icon: <Activity className="h-4 w-4" /> },
      { value: 'identify', label: 'Identify Customer', icon: <UserRound className="h-4 w-4" /> },
    ];
    if (eventTypeSelection === 'page') {
      return [
        {
          value: 'page',
          label: 'Page view (legacy)',
          icon: <Layout className="h-4 w-4" />,
        },
        ...core,
      ];
    }
    return core;
  }, [eventTypeSelection]);

  const loadEvent = useCallback(async (id: string) => {
    setLoadingEvent(true);
    ownerTeamIdPersistedRef.current = null;
    const result = await getEventWithProperties(id);
    setLoadingEvent(false);
    if (result) {
      setName(result.event.name);
      setDescription(result.event.description ?? '');
      setPurpose(result.event.purpose ?? '');
      applyEventTypeLoad(result.event.event_type, setEventTypeSelection, setStoredUnsupportedEventType);
      const ownerRaw = result.event.owner_team_id;
      ownerTeamIdPersistedRef.current =
        typeof ownerRaw === 'string' && ownerRaw.trim() !== '' ? ownerRaw.trim() : null;
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
      setEventTypeSelection('');
      setStoredUnsupportedEventType(null);
      ownerTeamIdPersistedRef.current = null;
      setCategoriesText('');
      setTagsText('');
      setTriggers([]);
      setAttached([]);
    }
    setAddPresence('always_sent');
    setAttachedDescExpandedId(null);
  }, [isOpen, eventId, clearMutationError, loadEvent]);

  const loadWorkspaceSources = useCallback(async () => {
    if (!activeWorkspaceId) {
      setWorkspaceSources([]);
      setSourcesError('Workspace context missing. Please refresh and try again.');
      return;
    }
    setSourcesLoading(true);
    setSourcesError(null);
    const result = await listWorkspaceSources(activeWorkspaceId);
    setSourcesLoading(false);
    if (!result.success) {
      setWorkspaceSources([]);
      if ('error' in result) {
        setSourcesError(result.error);
      } else {
        setSourcesError('Failed to load workspace sources.');
      }
      return;
    }
    setWorkspaceSources(result.data);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadWorkspaceSources();
  }, [isOpen, loadWorkspaceSources]);

  useEffect(() => {
    if (hasValidWorkspaceContext) return;
    setIsInlineSourceCreateOpen(false);
    setCreateSourceName('');
    setCreateSourceError(null);
  }, [hasValidWorkspaceContext]);

  const handleSaveNewEvent = async () => {
    if (!hasValidWorkspaceContext) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSaving(true);
    clearMutationError();

    const payload: CreateEventInput = {
      name: trimmedName,
      description: description.trim() || undefined,
      purpose: purpose.trim() || null,
      event_type: eventTypeSelection === '' ? null : eventTypeSelection,
      owner_team_id: null,
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
    if (!hasValidWorkspaceContext) return;
    if (!currentEventId) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSaving(true);
    clearMutationError();

    const payload: CreateEventInput = {
      name: trimmedName,
      description: description.trim() || undefined,
      purpose: purpose.trim() || null,
      event_type: eventTypeSelection === '' ? null : eventTypeSelection,
      owner_team_id: ownerTeamIdPersistedRef.current,
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
      applyEventTypeLoad(result.data.event_type, setEventTypeSelection, setStoredUnsupportedEventType);
      const ownerRaw = result.data.owner_team_id;
      ownerTeamIdPersistedRef.current =
        typeof ownerRaw === 'string' && ownerRaw.trim() !== '' ? ownerRaw.trim() : null;
      setCategoriesText((result.data.categories ?? []).join(', '));
      setTagsText((result.data.tags ?? []).join(', '));
      setTriggers(sortTriggersForEditor(result.data.triggers ?? []));
    }
  };

  const handleAddSelectedProperties = async (
    propertyIds: string[]
  ): Promise<boolean> => {
    if (!hasValidWorkspaceContext || !currentEventId || propertyIds.length === 0) {
      return false;
    }
    setAddingProperty(true);
    clearMutationError();
    try {
      for (const propertyId of propertyIds) {
        const result = await attachProperty(currentEventId, propertyId, addPresence);
        if (!result.success) {
          const synced = await getEventWithProperties(currentEventId);
          if (synced) setAttached(synced.attached_properties);
          return false;
        }
      }
      const updated = await getEventWithProperties(currentEventId);
      if (updated) setAttached(updated.attached_properties);
      return true;
    } finally {
      setAddingProperty(false);
    }
  };

  const handlePresenceChange = async (
    propertyId: string,
    presence: EventPropertyPresence
  ) => {
    if (!hasValidWorkspaceContext) return;
    if (!currentEventId) return;
    const result = await updatePresence(currentEventId, propertyId, presence);
    if (result.success) {
      const updated = await getEventWithProperties(currentEventId);
      if (updated) setAttached(updated.attached_properties);
    }
  };

  const handleDetachProperty = async (propertyId: string) => {
    if (!hasValidWorkspaceContext) return;
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
  /** Avoid sending null and wiping an API value we cannot represent until the user picks a supported type. */
  const eventTypeSaveBlocked =
    Boolean(storedUnsupportedEventType) && eventTypeSelection === '';

  const openTriggerModalForCreate = () => {
    setEditingTriggerIndex(null);
    setTriggerDraft(createEmptyTrigger(triggers.length));
    setTriggerImageError(null);
    setTriggerImageUploading(false);
    setCreateSourceName('');
    setCreateSourceError(null);
    setIsInlineSourceCreateOpen(false);
    setIsTriggerModalOpen(true);
  };

  const openTriggerModalForEdit = (index: number) => {
    const trigger = triggers[index];
    if (!trigger) return;
    setEditingTriggerIndex(index);
    setTriggerDraft({ ...trigger });
    setTriggerImageError(null);
    setTriggerImageUploading(false);
    setCreateSourceName('');
    setCreateSourceError(null);
    setIsInlineSourceCreateOpen(false);
    setIsTriggerModalOpen(true);
  };

  const closeTriggerModal = () => {
    setIsTriggerModalOpen(false);
    setEditingTriggerIndex(null);
    setTriggerDraft(createEmptyTrigger(0));
    setTriggerImageUploading(false);
    setTriggerImageError(null);
    setCreateSourceName('');
    setCreateSourceError(null);
    setIsInlineSourceCreateOpen(false);
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
    if (!hasValidWorkspaceContext) {
      setTriggerImageError('Select a valid workspace from the header before uploading.');
      return;
    }
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
      if ('error' in result) {
        setTriggerImageError(result.error);
      } else {
        setTriggerImageError('Failed to upload trigger image.');
      }
      return;
    }

    setTriggerDraft((prev) => ({ ...prev, image: result.url }));
  };

  const handleCreateTriggerSource = async () => {
    if (!hasValidWorkspaceContext) {
      setCreateSourceError('Select a valid workspace from the header before creating a source.');
      return;
    }
    if (!activeWorkspaceId) {
      setCreateSourceError('Workspace context missing. Please refresh and try again.');
      return;
    }
    const trimmedName = createSourceName.trim();
    if (!trimmedName) {
      setCreateSourceError('Source name is required.');
      return;
    }

    setIsCreatingSource(true);
    setCreateSourceError(null);
    const result = await createWorkspaceSource({
      workspaceId: activeWorkspaceId,
      name: trimmedName,
      color: null,
    });
    setIsCreatingSource(false);

    if (!result.success) {
      if ('error' in result) {
        setCreateSourceError(result.error);
      } else {
        setCreateSourceError('Failed to create source.');
      }
      return;
    }

    setWorkspaceSources((prev) =>
      [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name))
    );
    setTriggerDraft((prev) => ({ ...prev, source: result.data.name }));
    setCreateSourceName('');
    setCreateSourceError(null);
    setIsInlineSourceCreateOpen(false);
  };

  const title = isCreateMode && !currentEventId
    ? 'New Event'
    : currentEventId
      ? 'Edit Event'
      : 'New Event';

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={title} className={EVENT_EDITOR_SHEET_WIDTH_CLASS}>
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Required</h3>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="event-editor-name">
            Name
          </label>
          <Input
            id="event-editor-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. checkout_completed, page_viewed"
            className="font-mono"
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" id="event-type-label">
            Event type
          </label>
          {storedUnsupportedEventType && (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              role="status"
            >
              Stored value{' '}
              <span className="font-mono">{storedUnsupportedEventType}</span> is not supported in this editor. Select a
              supported type below before saving.
            </div>
          )}
          <IconSelect<EventType>
            value={eventTypeSelection}
            onChange={(next) => {
              setEventTypeSelection(next);
              if (next !== '') setStoredUnsupportedEventType(null);
            }}
            options={eventTypeSelectOptions}
            allowEmpty
            emptyLabel="Not set"
            disabled={saving}
            aria-labelledby="event-type-label"
          />
        </div>

        <hr className="border-gray-200" />

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Optional</h3>
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
          <p className="text-xs text-gray-500 leading-relaxed">
            Owner assignment is not yet supported in Workspace. Existing server values are left unchanged when you save
            other fields.
          </p>
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

              <EventAttachPropertyPicker
                key={currentEventId}
                availableProperties={availableProperties}
                attachedIds={attachedIds}
                addPresence={addPresence}
                onAddPresenceChange={setAddPresence}
                onAddSelected={handleAddSelectedProperties}
                adding={addingProperty}
                workspaceActionsDisabled={!hasValidWorkspaceContext}
              />

              <ul className="border rounded-lg divide-y divide-gray-100">
                {attached.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-500">
                    No properties attached yet.
                  </li>
                ) : (
                  attached.map((a) => {
                    const meta = propertyById.get(a.property_id);
                    const descRaw = meta?.description?.trim() ?? '';
                    const expanded = attachedDescExpandedId === a.property_id;
                    const needsTruncate = descRaw.length > ATTACHED_DESC_PREVIEW_CHARS;
                    const descShown =
                      !descRaw
                        ? null
                        : expanded || !needsTruncate
                          ? descRaw
                          : `${descRaw.slice(0, ATTACHED_DESC_PREVIEW_CHARS)}…`;
                    return (
                      <li
                        key={a.property_id}
                        className="flex items-start justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-mono text-xs font-medium text-gray-900 truncate">
                            {a.property_name || a.property_id}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {meta?.data_type ?? '—'}
                          </div>
                          {descShown !== null && (
                            <p className="text-[11px] text-gray-600 leading-snug break-words">
                              {descShown}
                            </p>
                          )}
                          {descRaw && needsTruncate && (
                            <button
                              type="button"
                              className="text-[11px] font-medium text-[var(--brand-primary)] hover:underline"
                              onClick={() =>
                                setAttachedDescExpandedId((id) =>
                                  id === a.property_id ? null : a.property_id
                                )
                              }
                            >
                              {expanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <select
                            value={a.presence}
                            onChange={(e) =>
                              handlePresenceChange(
                                a.property_id,
                                e.target.value as EventPropertyPresence
                              )
                            }
                            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-w-[9.5rem]"
                            disabled={
                              removingPropertyId === a.property_id ||
                              !hasValidWorkspaceContext
                            }
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
                            disabled={
                              removingPropertyId === a.property_id ||
                              !hasValidWorkspaceContext
                            }
                            className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                            aria-label={`Remove ${a.property_name || a.property_id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <EventPropertyOverridesSection
              eventId={currentEventId}
              attached={attached}
              allProperties={allProperties}
              getEffectivePropertyDefinitions={getEffectivePropertyDefinitions}
              putEventPropertyDefinitions={putEventPropertyDefinitions}
              deleteEventPropertyDefinition={deleteEventPropertyDefinition}
              workspaceMutationsDisabled={!hasValidWorkspaceContext}
            />
          </>
        )}
      </div>

      <div
        className={`fixed bottom-0 right-0 ${EVENT_EDITOR_SHEET_WIDTH_CLASS} p-6 bg-white border-t flex justify-end gap-2 z-10 max-w-[calc(100vw-1rem)]`}
      >
        <Button variant="outline" onClick={onClose} disabled={saving}>
          {currentEventId ? 'Close' : 'Cancel'}
        </Button>
        {isCreateMode && !currentEventId ? (
          <Button
            onClick={handleSaveNewEvent}
            disabled={
              saving ||
              !name.trim() ||
              hasInvalidTriggers ||
              !hasValidWorkspaceContext ||
              eventTypeSaveBlocked
            }
            title={
              !hasValidWorkspaceContext
                ? 'Select a valid workspace from the header before creating events.'
                : eventTypeSaveBlocked
                  ? 'Choose a supported event type before saving.'
                  : undefined
            }
          >
            {saving ? 'Creating…' : 'Create Event'}
          </Button>
        ) : (
          <Button
            onClick={handleSaveExistingEvent}
            disabled={
              saving ||
              !name.trim() ||
              !currentEventId ||
              hasInvalidTriggers ||
              !hasValidWorkspaceContext ||
              eventTypeSaveBlocked ||
              loadingEvent
            }
            title={
              !hasValidWorkspaceContext
                ? 'Select a valid workspace from the header before saving changes.'
                : eventTypeSaveBlocked
                  ? 'Choose a supported event type before saving.'
                  : loadingEvent
                    ? 'Wait until the event has finished loading before saving.'
                    : undefined
            }
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        )}
      </div>

      <EventTriggerEditorModal
        isOpen={isTriggerModalOpen}
        allowInlineSourceCreate={hasValidWorkspaceContext}
        trigger={triggerDraft}
        sources={workspaceSources}
        sourcesLoading={sourcesLoading}
        sourcesError={sourcesError}
        isCreatingSource={isCreatingSource}
        createSourceName={createSourceName}
        createSourceError={createSourceError}
        isInlineSourceCreateOpen={isInlineSourceCreateOpen}
        imageUploadEnabled={!!currentEventId}
        imageUploading={triggerImageUploading}
        imageUploadError={triggerImageError}
        onChange={(patch) => {
          setTriggerDraft((prev) => ({ ...prev, ...patch }));
          if ('title' in patch || 'description' in patch || 'source' in patch) {
            setTriggerImageError(null);
          }
          if ('source' in patch) {
            setCreateSourceError(null);
          }
        }}
        onUploadImage={handleTriggerImageUpload}
        onClearImage={() => setTriggerDraft((prev) => ({ ...prev, image: null }))}
        onChangeCreateSourceName={(value) => {
          setCreateSourceName(value);
          setCreateSourceError(null);
        }}
        onOpenInlineSourceCreate={() => {
          setCreateSourceError(null);
          setIsInlineSourceCreateOpen(true);
        }}
        onCancelInlineSourceCreate={() => {
          setCreateSourceName('');
          setCreateSourceError(null);
          setIsInlineSourceCreateOpen(false);
        }}
        onCreateSource={handleCreateTriggerSource}
        onSave={saveTriggerDraft}
        onClose={closeTriggerModal}
      />
    </Sheet>
  );
}
