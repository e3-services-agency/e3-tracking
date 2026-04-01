/**
 * Create/Edit Event slide-out sheet. API-powered.
 * Form: Name, Description, canonical structured triggers,
 * Property Picker + attached list.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Modal } from '@/src/components/ui/Modal';
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
  describeAttachedTriggerRequirement,
  isAttachedPropertyRequiredForTrigger,
} from '@/src/lib/effectiveEventSchema';
import {
  EVENT_TYPES,
  type CodegenEventNameOverrides,
  type CreateEventInput,
  type EventPropertyDefinitionUpsertPayload,
  type EventPropertyPresence,
  type EventRow,
  type EventType,
  type EventTriggerEntry,
  type EventVariantOverridesV1,
  type EventVariantRow,
  type SourceRow,
  type PropertyRow,
} from '@/src/types/schema';
import { EventVariantsApiSection } from '@/src/features/events/components/EventVariantsApiSection';
import type { ApiError, EventWithPropertiesResponse } from '@/src/features/events/hooks/useEvents';
import { useProperties } from '@/src/features/properties/hooks/useProperties';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { useStore } from '@/src/store';
import { Activity, AlertCircle, Layout, Plus, UserRound, X } from 'lucide-react';

// Presence options intentionally kept out of the simplified UI.

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
  createEventVariant: (
    eventId: string,
    payload: { name: string; description?: string | null; overrides_json?: EventVariantOverridesV1 }
  ) => Promise<{ success: true; data: EventVariantRow } | { success: false; error: ApiError }>;
  updateEventVariant: (
    eventId: string,
    variantId: string,
    patch: { name?: string; description?: string | null; overrides_json?: EventVariantOverridesV1 }
  ) => Promise<{ success: true; data: EventVariantRow } | { success: false; error: ApiError }>;
  deleteEventVariant: (
    eventId: string,
    variantId: string
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
  onEventCreated?: (eventId: string) => void;
  /** When opening the sheet for a base event, optionally open this variant’s edit modal after load. */
  initialVariantIdToOpen?: string | null;
  onInitialVariantIdConsumed?: () => void;
}

export function EventEditorSheet({
  isOpen,
  onClose,
  eventId,
  createEvent,
  updateEvent,
  attachProperty,
  detachProperty,
  updatePresence: _updatePresence,
  getEventWithProperties,
  getEffectivePropertyDefinitions,
  putEventPropertyDefinitions,
  deleteEventPropertyDefinition,
  createEventVariant,
  updateEventVariant,
  deleteEventVariant,
  mutationError,
  clearMutationError,
  onEventCreated,
  initialVariantIdToOpen = null,
  onInitialVariantIdConsumed,
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
  // UI simplification: Presence is no longer user-facing. Keep using the existing
  // backend contract by attaching as "Sometimes" (not always required by default).
  const [addPresence] = useState<EventPropertyPresence>('sometimes_sent');
  const [addingProperty, setAddingProperty] = useState(false);
  const [removingPropertyId, setRemovingPropertyId] = useState<string | null>(null);
  const [updatingRequirementPropertyId, setUpdatingRequirementPropertyId] = useState<string | null>(
    null
  );
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | null>(null);
  const [triggerDraft, setTriggerDraft] = useState<EventTriggerEntry>(createEmptyTrigger(0));
  const [triggerImageUploading, setTriggerImageUploading] = useState(false);
  const [triggerImageError, setTriggerImageError] = useState<string | null>(null);
  const [workspaceSources, setWorkspaceSources] = useState<SourceRow[]>([]);
  const [selectedEventSourceIds, setSelectedEventSourceIds] = useState<string[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [isInlineSourceCreateOpen, setIsInlineSourceCreateOpen] = useState(false);
  const [createSourceName, setCreateSourceName] = useState('');
  const [createSourceError, setCreateSourceError] = useState<string | null>(null);
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [attachedDescExpandedId, setAttachedDescExpandedId] = useState<string | null>(null);
  const [attachPropertyPickerOpen, setAttachPropertyPickerOpen] = useState(false);
  const [variants, setVariants] = useState<EventVariantRow[]>([]);
  const [pendingVariantOpenId, setPendingVariantOpenId] = useState<string | null>(null);
  const [codegenNameDataLayer, setCodegenNameDataLayer] = useState('');
  const [codegenNameBloomreachSdk, setCodegenNameBloomreachSdk] = useState('');
  const [codegenNameBloomreachApi, setCodegenNameBloomreachApi] = useState('');

  const isCreateMode = eventId === null && currentEventId === null;

  const codegenOverridesPayload = useMemo((): CodegenEventNameOverrides | null => {
    const dl = codegenNameDataLayer.trim();
    const sdk = codegenNameBloomreachSdk.trim();
    const api = codegenNameBloomreachApi.trim();
    if (!dl && !sdk && !api) return null;
    return {
      ...(dl ? { dataLayer: dl } : {}),
      ...(sdk ? { bloomreachSdk: sdk } : {}),
      ...(api ? { bloomreachApi: api } : {}),
    };
  }, [codegenNameDataLayer, codegenNameBloomreachSdk, codegenNameBloomreachApi]);

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
    setVariants([]);
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
      setSelectedEventSourceIds(result.source_ids ?? []);
      setAttached(result.attached_properties);
      setVariants(result.variants ?? []);
      const cg = result.event.codegen_event_name_overrides;
      setCodegenNameDataLayer(cg?.dataLayer?.trim() ?? '');
      setCodegenNameBloomreachSdk(cg?.bloomreachSdk?.trim() ?? '');
      setCodegenNameBloomreachApi(cg?.bloomreachApi?.trim() ?? '');
    } else {
      setSelectedEventSourceIds([]);
      setVariants([]);
      setCodegenNameDataLayer('');
      setCodegenNameBloomreachSdk('');
      setCodegenNameBloomreachApi('');
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
      setSelectedEventSourceIds([]);
      setAttached([]);
      setVariants([]);
      setCodegenNameDataLayer('');
      setCodegenNameBloomreachSdk('');
      setCodegenNameBloomreachApi('');
    }
    setAddPresence('always_sent');
    setAttachedDescExpandedId(null);
    setAttachPropertyPickerOpen(false);
  }, [isOpen, eventId, clearMutationError, loadEvent]);

  useEffect(() => {
    if (!isOpen) {
      setPendingVariantOpenId(null);
      return;
    }
    if (initialVariantIdToOpen) {
      setPendingVariantOpenId(initialVariantIdToOpen);
    }
  }, [isOpen, initialVariantIdToOpen]);

  useEffect(() => {
    if (!isOpen) setAttachPropertyPickerOpen(false);
  }, [isOpen]);

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
      source_ids: selectedEventSourceIds,
    };

    const result = await createEvent(payload);
    setSaving(false);

    if (result.success) {
      setCurrentEventId(result.data.id);
      const cg = result.data.codegen_event_name_overrides;
      setCodegenNameDataLayer(cg?.dataLayer?.trim() ?? '');
      setCodegenNameBloomreachSdk(cg?.bloomreachSdk?.trim() ?? '');
      setCodegenNameBloomreachApi(cg?.bloomreachApi?.trim() ?? '');
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
      source_ids: selectedEventSourceIds,
      codegen_event_name_overrides: codegenOverridesPayload,
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

  // Presence editing removed from simplified UI.

  const handlePropertyRequirementOverrideChange = async (
    propertyId: string,
    required: boolean
  ) => {
    if (!hasValidWorkspaceContext || !currentEventId) return;
    setUpdatingRequirementPropertyId(propertyId);
    clearMutationError();
    try {
      const payload: EventPropertyDefinitionUpsertPayload = {
        property_id: propertyId,
        required,
      };
      const result = await putEventPropertyDefinitions(currentEventId, [payload]);
      if (result.success) {
        const updated = await getEventWithProperties(currentEventId);
        if (updated) setAttached(updated.attached_properties);
      }
    } finally {
      setUpdatingRequirementPropertyId(null);
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
    useStore.getState().upsertSourceFromApi(result.data);
    setTriggerDraft((prev) => ({ ...prev, source: result.data.name }));
    setCreateSourceName('');
    setCreateSourceError(null);
    setIsInlineSourceCreateOpen(false);
  };

  const toggleEventSourceId = (sourceId: string) => {
    setSelectedEventSourceIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
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

        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50/80 p-3">
          <div>
            <label className="text-sm font-medium text-gray-800">
              Codegen output event names (optional)
            </label>
            <p className="text-xs text-gray-500 mt-0.5">
              Override the event name shown only in generated snippets (GTM dataLayer, Bloomreach SDK, Bloomreach API).
              The canonical event name above is unchanged.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Data Layer</label>
            <Input
              value={codegenNameDataLayer}
              onChange={(e) => setCodegenNameDataLayer(e.target.value)}
              placeholder="e.g. add_to_cart"
              className="font-mono text-sm"
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Bloomreach SDK</label>
            <Input
              value={codegenNameBloomreachSdk}
              onChange={(e) => setCodegenNameBloomreachSdk(e.target.value)}
              placeholder="e.g. add_to_cart"
              className="font-mono text-sm"
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Bloomreach API</label>
            <Input
              value={codegenNameBloomreachApi}
              onChange={(e) => setCodegenNameBloomreachApi(e.target.value)}
              placeholder="e.g. add_to_cart"
              className="font-mono text-sm"
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Sources</label>
          <p className="text-xs text-gray-500">
            Attach workspace sources to this event.
          </p>
          {sourcesError && (
            <p className="text-xs text-red-600">{sourcesError}</p>
          )}
          {workspaceSources.length === 0 ? (
            <p className="text-xs text-gray-500">
              {sourcesLoading ? 'Loading sources…' : 'No workspace sources found.'}
            </p>
          ) : (
            <div className="max-h-40 overflow-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
              {workspaceSources.map((source) => {
                const checked = selectedEventSourceIds.includes(source.id);
                return (
                  <label
                    key={source.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={checked}
                      onChange={() => toggleEventSourceId(source.id)}
                      disabled={saving || !hasValidWorkspaceContext}
                    />
                    <span className="text-gray-800">{source.name}</span>
                  </label>
                );
              })}
            </div>
          )}
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

        {currentEventId && (
          <>
            <hr className="border-gray-200" />
            {variants.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Variants
                </h3>
                <p className="text-xs text-gray-500">
                  Quick open a scenario variant; full create/edit stays below.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPendingVariantOpenId(v.id)}
                      className="inline-flex max-w-[min(100%,12rem)] truncate rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-900 hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={v.description ? `${v.name} — ${v.description}` : v.name}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <EventVariantsApiSection
              eventId={currentEventId}
              baseEventName={name.trim() || '—'}
              variants={variants}
              onReload={() => void loadEvent(currentEventId)}
              getEffectivePropertyDefinitions={getEffectivePropertyDefinitions}
              createEventVariant={createEventVariant}
              updateEventVariant={updateEventVariant}
              deleteEventVariant={deleteEventVariant}
              workspaceMutationsDisabled={!hasValidWorkspaceContext}
              variantIdToOpenOnLoad={loadingEvent ? null : pendingVariantOpenId}
              onConsumedVariantOpen={() => {
                setPendingVariantOpenId(null);
                onInitialVariantIdConsumed?.();
              }}
            />
          </>
        )}

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
                Each row highlights{' '}
                <span className="font-medium text-gray-700">required for trigger</span> (effective rule used by docs
                and validation). Advanced presence settings are hidden in this simplified UI.
              </p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 w-fit"
                onClick={() => setAttachPropertyPickerOpen(true)}
                disabled={!hasValidWorkspaceContext}
                title={
                  !hasValidWorkspaceContext
                    ? 'Select a valid workspace from the header before changing attachments.'
                    : undefined
                }
              >
                <Plus className="w-4 h-4" aria-hidden />
                Add Property
              </Button>

              <Modal
                isOpen={attachPropertyPickerOpen}
                onClose={() => setAttachPropertyPickerOpen(false)}
                title="Add properties"
                backdropClassName="z-[60]"
                className="z-[70] max-w-[min(560px,calc(100vw-1.5rem))] max-h-[min(90vh,720px)] flex flex-col"
                bodyClassName="p-4 min-h-0 flex-1 overflow-y-auto"
              >
                <EventAttachPropertyPicker
                  key={currentEventId}
                  availableProperties={availableProperties}
                  attachedIds={attachedIds}
                  addPresence={addPresence}
                  onAddPresenceChange={() => {}}
                  onAddSelected={handleAddSelectedProperties}
                  adding={addingProperty}
                  workspaceActionsDisabled={!hasValidWorkspaceContext}
                />
              </Modal>

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
                    const definitionRequired = a.property_required_override === true;
                    const requiredForTrigger = isAttachedPropertyRequiredForTrigger(
                      a.presence,
                      a.property_required_override
                    );
                    const triggerReq = describeAttachedTriggerRequirement(
                      a.presence,
                      a.property_required_override
                    );
                    return (
                      <li key={a.property_id} className="px-3 py-2 border-b border-gray-50 last:border-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-mono text-xs font-medium text-gray-900 truncate">
                              {a.property_name || a.property_id}
                            </div>
                            <p className="text-[11px] text-gray-600">
                              Trigger rule:{' '}
                              <span
                                className={
                                  requiredForTrigger
                                    ? 'font-semibold text-amber-900'
                                    : 'font-medium text-slate-600'
                                }
                              >
                                {requiredForTrigger
                                  ? triggerReq.primaryLabel.toLowerCase()
                                  : 'not required'}
                              </span>
                              {requiredForTrigger && triggerReq.reasonNote !== '—' ? (
                                <span className="text-[11px] text-gray-500">
                                  {' '}
                                  ({triggerReq.reasonNote})
                                </span>
                              ) : null}
                            </p>
                            <div className="text-[11px] text-gray-500">{meta?.data_type ?? '—'}</div>
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
                          <div className="flex items-center gap-2 shrink-0 pt-0.5">
                            <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">
                              Definition required
                            </span>
                            <button
                              type="button"
                              className="shrink-0"
                              title="Definition-level required (event_property_definitions.required). Separate from presence and effective trigger rule above."
                              aria-label={`Definition required for ${a.property_name || a.property_id}`}
                              aria-pressed={definitionRequired}
                              disabled={
                                removingPropertyId === a.property_id ||
                                updatingRequirementPropertyId === a.property_id ||
                                !hasValidWorkspaceContext
                              }
                              onClick={() =>
                                void handlePropertyRequirementOverrideChange(
                                  a.property_id,
                                  !definitionRequired
                                )
                              }
                            >
                              <div
                                className={`w-9 h-5 rounded-full relative transition-colors ${
                                  definitionRequired ? 'bg-green-500' : 'bg-gray-200'
                                } ${
                                  updatingRequirementPropertyId === a.property_id
                                    ? 'opacity-60 pointer-events-none'
                                    : ''
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${
                                    definitionRequired ? 'right-0.5' : 'left-0.5 border border-gray-200'
                                  }`}
                                />
                              </div>
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
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
