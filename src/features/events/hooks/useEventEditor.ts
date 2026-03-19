import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useActiveData, useStore } from '@/src/store';
import {
  Event,
  Source,
  EventAction,
  EventVariant,
  Property,
  Team,
  TrackingStatus,
} from '@/src/types';
import { toSnakeCase, toPascalCase } from '@/src/lib/utils';

type EventTrigger = {
  id: string;
  image?: string | null;
  source?: string;
  desc?: string;
  name?: string;
};

type UseEventEditorArgs = {
  event: Event | null | undefined;
  variantId?: string;
  isCreating: boolean;
  onClose: () => void;
  onSwitchVariant?: (id: string) => void;
  deleteEventApi: (
    eventId: string
  ) => Promise<
    | { success: true }
    | { success: false; error: { message: string } }
  >;
};

export function useEventEditor({
  event,
  variantId,
  isCreating,
  onClose,
  onSwitchVariant,
  deleteEventApi,
}: UseEventEditorArgs) {
  const data = useActiveData();
  const { addEvent, updateEvent, deleteEvent, auditConfig } = useStore();

  const [name, setName] = useState(event?.name || '');
  const [description, setDescription] = useState(event?.description || '');
  const [ownerTeamId, setOwnerTeamId] = useState<string>(
    event?.ownerTeamId || data.teams[0]?.id || '',
  );
  const [stakeholderTeamIds, setStakeholderTeamIds] = useState<string[]>(
    event?.stakeholderTeamIds || [],
  );
  const [categories, setCategories] = useState<string[]>(
    event?.categories || [],
  );
  const [tags, setTags] = useState<string[]>(event?.tags || []);
  const [sources, setSources] = useState<Source[]>(event?.sources || []);
  const [actions, setActions] = useState<EventAction[]>(
    event?.actions || [
      {
        id: uuidv4(),
        type: 'Log Event',
        eventProperties: [],
        systemProperties: [],
        pinnedProperties: {},
      },
    ],
  );
  const [variants, setVariants] = useState<EventVariant[]>(
    event?.variants || [],
  );
  const [triggers, setTriggers] = useState<EventTrigger[]>(
    (event?.customFields?.triggers as EventTrigger[]) || [],
  );
  const [activityLog, setActivityLog] = useState<
    { user: string; text: string; date: string }[]
  >(event?.customFields?.activityLog || []);

  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>(() => {
    if (variantId && event) {
      const v = event.variants?.find((x) => x.id === variantId);
      return (v?.trackingStatus as TrackingStatus) || 'Draft';
    }
    return (event?.customFields?.trackingStatus as TrackingStatus) || 'Draft';
  });

  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newComment, setNewComment] = useState('');

  // Modals inside Panel
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');

  const [isAddActionPopoverOpen, setIsAddActionPopoverOpen] = useState(false);
  const [isAddSourceModalOpen, setIsAddSourceModalOpen] = useState(false);
  const [isAddStakeholderOpen, setIsAddStakeholderOpen] = useState(false);

  // Trigger state
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [triggerImgBase64, setTriggerImgBase64] = useState<string | null>(null);
  const [triggerSource, setTriggerSource] =
    useState<string>('Source Independent');
  const [triggerDesc, setTriggerDesc] = useState<string>('');
  const [triggerName, setTriggerName] = useState<string>('');

  // Property Add Modals
  const [isAddEventPropertyModalOpen, setIsAddEventPropertyModalOpen] =
    useState<string | null>(null); // holds actionId
  const [isAddSystemPropertyModalOpen, setIsAddSystemPropertyModalOpen] =
    useState<string | null>(null); // holds actionId
  const [hoveredPropId, setHoveredPropId] = useState<string | null>(null);
  const [propSearch, setPropSearch] = useState('');

  const activeVariant = variants.find((v) => v.id === variantId);

  useEffect(() => {
    if (variantId && event) {
      const v = event.variants?.find((x) => x.id === variantId);
      setTrackingStatus((v?.trackingStatus as TrackingStatus) || 'Draft');
    } else {
      setTrackingStatus((event?.customFields?.trackingStatus as TrackingStatus) || 'Draft');
    }
  }, [variantId, event?.customFields?.trackingStatus, event?.variants]);

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      setNewCategory('');
      return;
    }
    setCategories([...categories, trimmed]);
    setNewCategory('');
  };

  const addTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setNewTag('');
      return;
    }
    setTags([...tags, trimmed]);
    setNewTag('');
  };

  // Helper to log changes to the activity log
  const logAction = (text: string) => {
    setActivityLog((prev) => [
      { user: 'You', text, date: 'Just now' },
      ...prev,
    ]);
  };

  const handleAddComment = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newComment.trim()) {
      logAction(`commented: "${newComment.trim()}"`);
      setNewComment('');
    }
  };

  const handleCreateVariant = () => {
    if (!newVariantName.trim()) return;
    const newV: EventVariant = {
      id: uuidv4(),
      name: newVariantName,
      propertyOverrides: {},
    };
    setVariants([...variants, newV]);
    logAction(`created the variant: ${newVariantName}`);
    setIsVariantModalOpen(false);
    setNewVariantName('');
    if (onSwitchVariant) onSwitchVariant(newV.id);
  };

  const handleAddAction = (type: string) => {
    setActions([
      ...actions,
      {
        id: uuidv4(),
        type,
        eventProperties: [],
        systemProperties: [],
        pinnedProperties: {},
      },
    ]);
    logAction(`added the action ${type}`);
    setIsAddActionPopoverOpen(false);
  };

  const openTriggerModalForNew = () => {
    setEditingTriggerId(null);
    setTriggerImgBase64(null);
    setTriggerSource('Source Independent');
    setTriggerDesc('');
    setTriggerName('');
    setIsTriggerModalOpen(true);
  };

  const openTriggerModalForEdit = (trigger: EventTrigger) => {
    setEditingTriggerId(trigger.id);
    setTriggerImgBase64(trigger.image ?? null);
    setTriggerSource(trigger.source ?? 'Source Independent');
    setTriggerDesc(trigger.desc ?? '');
    setTriggerName(trigger.name ?? '');
    setIsTriggerModalOpen(true);
  };

  const saveTrigger = () => {
    const newTrigger = {
      id: uuidv4(),
      image: triggerImgBase64,
      source: triggerSource,
      desc: triggerDesc,
    };
    setTriggers([...triggers, newTrigger]);
    logAction(`added a new trigger`);
    setIsTriggerModalOpen(false);
    setTriggerImgBase64(null);
    setTriggerDesc('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) =>
        setTriggerImgBase64(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleImagePaste = (dataUrl: string) => {
    setTriggerImgBase64(dataUrl);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    let finalName = name;
    if (auditConfig.eventNaming === 'snake_case') finalName = toSnakeCase(name);
    else if (auditConfig.eventNaming === 'Title Case')
      finalName = toPascalCase(name).replace(/([A-Z])/g, ' $1').trim();
    else if (auditConfig.eventNaming === 'camelCase')
      finalName = toPascalCase(name).replace(
        /^./,
        (str) => str.toLowerCase(),
      );
    else if (auditConfig.eventNaming === 'PascalCase')
      finalName = toPascalCase(name);
    else if (auditConfig.eventNaming === 'Sentence case') {
      const spaced = name.replace(/[-_]+/g, ' ').trim();
      finalName =
        spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
    }

    const eventData = {
      name: finalName,
      description,
      categories,
      tags,
      sources,
      actions,
      variants:
        variantId && activeVariant
          ? variants.map((v) =>
              v.id === variantId ? { ...v, trackingStatus } : v,
            )
          : variants,
      ownerTeamId,
      stakeholderTeamIds,
      customFields: {
        ...event?.customFields,
        triggers,
        activityLog,
        ...(variantId ? {} : { trackingStatus }),
      },
    };

    if (isCreating) addEvent(eventData as Event);
    else if (event) updateEvent(event.id, eventData);

    onClose();
  };

  const handleArchive = () => {
    if (!event) return;
    void (async () => {
      const result = await deleteEventApi(event.id);
      if (!result.success) {
        window.alert(result.error.message);
        return;
      }
      deleteEvent(event.id);
      onClose();
    })();
  };

  const generateCodegen = () => {
    const fnName = toPascalCase(name).replace(/^./, (str) => str.toLowerCase());
    const variantSuffix = activeVariant ? toPascalCase(activeVariant.name) : '';
    const props = Array.from(
      new Set(
        actions.flatMap((a) => [...a.eventProperties, ...a.systemProperties]),
      ),
    );

    return `Avo.${fnName}${variantSuffix}({
${props
  .map((pid) => {
    const p = data.properties.find((prop) => prop.id === pid);
    if (!p) return '';
    const camelProp = toPascalCase(p.name).replace(
      /^./,
      (s) => s.toLowerCase(),
    );
    return `  ${camelProp}: ${camelProp}, // ${p.property_value_type}`;
  })
  .filter(Boolean)
  .join('\n')}
});`;
  };

  const availableEventProps = data.properties.filter(
    (p) => !actions.flatMap((a) => a.eventProperties).includes(p.id),
  );
  const availableSystemProps = data.properties.filter(
    (p) => !actions.flatMap((a) => a.systemProperties).includes(p.id),
  );

  const filteredAvailableProps: Property[] = (
    isAddEventPropertyModalOpen ? availableEventProps : availableSystemProps
  ).filter((p) =>
    p.name.toLowerCase().includes(propSearch.toLowerCase()),
  );

  // Automatically select first item in property picker
  useEffect(() => {
    if (filteredAvailableProps.length > 0) {
      if (
        !hoveredPropId ||
        !filteredAvailableProps.find((p) => p.id === hoveredPropId)
      ) {
        setHoveredPropId(filteredAvailableProps[0].id);
      }
    } else {
      setHoveredPropId(null);
    }
  }, [filteredAvailableProps, hoveredPropId]);

  const handleSelectProperty = (property: Property) => {
    const actionId =
      isAddEventPropertyModalOpen || isAddSystemPropertyModalOpen;
    const listType: 'eventProperties' | 'systemProperties' =
      isAddEventPropertyModalOpen ? 'eventProperties' : 'systemProperties';
    if (actionId) {
      setActions(
        actions.map((a) =>
          a.id === actionId && !a[listType].includes(property.id)
            ? {
                ...a,
                [listType]: [...a[listType], property.id],
              }
            : a,
        ),
      );
      logAction(`added property ${property.name}`);
    }
    setIsAddEventPropertyModalOpen(null);
    setIsAddSystemPropertyModalOpen(null);
    setPropSearch('');
  };

  const handleClosePropertyModal = () => {
    setIsAddEventPropertyModalOpen(null);
    setIsAddSystemPropertyModalOpen(null);
    setPropSearch('');
  };

  const addStakeholder = (teamId: string) => {
    const team = data.teams.find((t) => t.id === teamId);
    setStakeholderTeamIds([...stakeholderTeamIds, teamId]);
    if (team) logAction(`added the stakeholder ${team.name}`);
  };

  const removeStakeholder = (teamId: string) => {
    const team = data.teams.find((t) => t.id === teamId);
    setStakeholderTeamIds(
      stakeholderTeamIds.filter((tid) => tid !== teamId),
    );
    if (team) logAction(`removed the stakeholder ${team.name}`);
  };

  const changeOwnerTeam = (teamId: string) => {
    setOwnerTeamId(teamId);
    const team = data.teams.find((tm) => tm.id === teamId);
    if (team) logAction(`changed owner to ${team.name}`);
  };

  const removeVariant = (variant: EventVariant) => {
    setVariants(variants.filter((x) => x.id !== variant.id));
    logAction(`removed variant ${variant.name}`);
  };

  const removeTrigger = (id: string) => {
    setTriggers(triggers.filter((x) => x.id !== id));
    logAction('removed a trigger');
  };

  const toggleSource = (source: Source) => {
    const isSelected = sources.find((s) => s.id === source.id);
    if (isSelected) {
      setSources(sources.filter((s) => s.id !== source.id));
      logAction(`removed the source ${source.name}`);
    } else {
      setSources([...sources, source]);
      logAction(`added the source ${source.name}`);
    }
  };

  const removeCategory = (category: string) => {
    setCategories(categories.filter((c) => c !== category));
    logAction(`removed category ${category}`);
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    logAction(`removed tag ${tag}`);
  };

  const changeVariantName = (id: string | undefined, value: string) => {
    if (!id) return;
    setVariants(
      variants.map((v) =>
        v.id === id ? { ...v, name: value } : v,
      ),
    );
  };

  const changeVariantDescription = (id: string | undefined, value: string) => {
    if (!id) return;
    setVariants(
      variants.map((v) =>
        v.id === id ? { ...v, description: value } : v,
      ),
    );
  };

  const isPropertyModalOpen =
    !!isAddEventPropertyModalOpen || !!isAddSystemPropertyModalOpen;
  const propertyModalMode: 'event' | 'system' =
    isAddEventPropertyModalOpen ? 'event' : 'system';

  return {
    data: {
      teams: data.teams as Team[],
      sources: data.sources as Source[],
      properties: data.properties as Property[],
    },
    form: {
      name,
      description,
      ownerTeamId,
      stakeholderTeamIds,
      categories,
      tags,
      sources,
      actions,
      variants,
      triggers,
      activityLog,
      activeVariant,
      trackingStatus,
    },
    ui: {
      newCategory,
      newTag,
      newComment,
      isVariantModalOpen,
      newVariantName,
      isAddActionPopoverOpen,
      isAddSourceModalOpen,
      isAddStakeholderOpen,
      isTriggerModalOpen,
      triggerImgBase64,
      triggerSource,
      triggerDesc,
      triggerName,
      isPropertyModalOpen,
      propertyModalMode,
      hoveredPropId,
      propSearch,
    },
    actions: {
      // text inputs / simple controlled fields
      setName,
      setDescription,
      setTrackingStatus,
      setNewCategory,
      setNewTag,
      setNewComment,
      setNewVariantName,
      setPropSearch,
      setHoveredPropId,

      // modal / popover visibility
      openVariantModal: () => setIsVariantModalOpen(true),
      closeVariantModal: () => setIsVariantModalOpen(false),
      toggleAddActionPopover: () =>
        setIsAddActionPopoverOpen((open) => !open),
      openAddSourceModal: () => setIsAddSourceModalOpen(true),
      closeAddSourceModal: () => setIsAddSourceModalOpen(false),
      toggleAddSourceModal: () =>
        setIsAddSourceModalOpen((open) => !open),
      toggleAddStakeholderPopover: () =>
        setIsAddStakeholderOpen((open) => !open),
      openTriggerModal: openTriggerModalForNew,
      openTriggerModalForEdit: openTriggerModalForEdit,
      closeTriggerModal: () => {
        setIsTriggerModalOpen(false);
        setEditingTriggerId(null);
        setTriggerImgBase64(null);
        setTriggerSource('Source Independent');
        setTriggerDesc('');
        setTriggerName('');
      },
      openAddEventPropertyModal: (actionId: string) => {
        setIsAddEventPropertyModalOpen(actionId);
        setPropSearch('');
      },
      openAddSystemPropertyModal: (actionId: string) => {
        setIsAddSystemPropertyModalOpen(actionId);
        setPropSearch('');
      },
      closePropertyModal: handleClosePropertyModal,

      // trigger-specific
      setTriggerSource,
      setTriggerDesc,
      setTriggerName,
      clearTriggerImage: () => setTriggerImgBase64(null),

      // domain mutations / logs
      addCategory,
      addTag,
      removeCategory,
      removeTag,
      addStakeholder,
      removeStakeholder,
      changeOwnerTeam,
      removeVariant,
      removeTrigger,
      toggleSource,
      changeVariantName,
      changeVariantDescription,
      handleCreateVariant,
      handleAddAction,
      handleAddComment,
      handleSelectProperty,
      handleImageUpload,
      handleImagePaste,
      handleSave,
      handleArchive,
      saveTrigger,
      logAction,
    },
    derived: {
      filteredAvailableProps,
      generateCodegen,
    },
  };
}

