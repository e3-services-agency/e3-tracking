import React from 'react';
import { Event } from '@/src/types';
import { EventEditorHeader } from '@/src/features/events/editor/EventEditorHeader';
import { EventEditorFooter } from '@/src/features/events/editor/EventEditorFooter';
import { EventDescriptionSection } from '@/src/features/events/editor/EventDescriptionSection';
import { EventTrackingCodeSection } from '@/src/features/events/editor/EventTrackingCodeSection';
import { EventActivityLogSection } from '@/src/features/events/editor/EventActivityLogSection';
import { EventStakeholdersSection } from '@/src/features/events/editor/EventStakeholdersSection';
import { EventSourcesSection } from '@/src/features/events/editor/EventSourcesSection';
import { EventVariantsSection } from '@/src/features/events/editor/EventVariantsSection';
import { EventTriggersSection } from '@/src/features/events/editor/EventTriggersSection';
import { EventCategoriesTagsSection } from '@/src/features/events/editor/EventCategoriesTagsSection';
import { EventActionsSection } from '@/src/features/events/editor/EventActionsSection';
import { CreateVariantModal } from '@/src/features/events/overlays/CreateVariantModal';
import { AddTriggerModal } from '@/src/features/events/overlays/AddTriggerModal';
import { AddPropertyModal } from '@/src/features/events/overlays/AddPropertyModal';
import { useEventEditor } from '@/src/features/events/hooks/useEventEditor';

type EventEditorSheetProps = {
  event: Event | null | undefined;
  variantId?: string;
  isCreating: boolean;
  onClose: () => void;
  onSwitchVariant?: (id: string) => void;
};

export function EventEditorSheet({
  event,
  variantId,
  isCreating,
  onClose,
  onSwitchVariant,
}: EventEditorSheetProps) {
  const { data, form, ui, actions, derived } = useEventEditor({
    event,
    variantId,
    isCreating,
    onClose,
    onSwitchVariant,
  });

  const { teams, sources, properties } = data;
  const {
    name,
    description,
    ownerTeamId,
    stakeholderTeamIds,
    categories,
    tags,
    sources: selectedSources,
    actions: eventActions,
    variants,
    triggers,
    activityLog,
    activeVariant,
  } = form;
  const {
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
    isPropertyModalOpen,
    propertyModalMode,
    hoveredPropId,
    propSearch,
  } = ui;
  const {
    setName,
    setDescription,
    setNewCategory,
    setNewTag,
    setNewComment,
    setNewVariantName,
    setPropSearch,
    setHoveredPropId,
    openVariantModal,
    closeVariantModal,
    toggleAddActionPopover,
    openAddSourceModal,
    closeAddSourceModal,
    toggleAddSourceModal,
    toggleAddStakeholderPopover,
    openTriggerModal,
    closeTriggerModal,
    openAddEventPropertyModal,
    openAddSystemPropertyModal,
    closePropertyModal,
    setTriggerSource,
    setTriggerDesc,
    clearTriggerImage,
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
    handleSave,
    handleArchive,
    saveTrigger,
    logAction,
  } = actions;
  const { filteredAvailableProps, generateCodegen } = derived;

  return (
    <div className="flex flex-col h-full bg-white relative font-sans -mx-6 -my-6">
      <EventEditorHeader
        variantId={variantId}
        name={name}
        activeVariantName={activeVariant?.name}
        onChangeName={setName}
        onChangeVariantName={(value) => {
          changeVariantName(variantId, value);
        }}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10 pb-32">
        <EventStakeholdersSection
          ownerTeamId={ownerTeamId}
          stakeholderTeamIds={stakeholderTeamIds}
          teams={teams}
          isAddStakeholderOpen={isAddStakeholderOpen}
          onToggleAddStakeholder={() =>
            toggleAddStakeholderPopover()
          }
          onAddStakeholder={(teamId) => {
            addStakeholder(teamId);
            toggleAddStakeholderPopover();
          }}
          onRemoveStakeholder={removeStakeholder}
          onChangeOwnerTeam={changeOwnerTeam}
        />

        <EventDescriptionSection
          variantId={variantId}
          description={description}
          activeVariantDescription={activeVariant?.description}
          onChangeDescription={setDescription}
          onChangeVariantDescription={(value) => {
            changeVariantDescription(variantId, value);
          }}
          onBlurDescription={() => logAction('updated the description')}
        />

        {!variantId && (
          <EventVariantsSection
            variants={variants}
            onSelectVariant={(id) => onSwitchVariant?.(id)}
            onRemoveVariant={removeVariant}
            onOpenCreateVariantModal={openVariantModal}
          />
        )}

        <EventTriggersSection
          triggers={triggers}
          onOpenTriggerModal={openTriggerModal}
          onRemoveTrigger={removeTrigger}
        />

        <EventSourcesSection
          variantId={variantId}
          sources={selectedSources}
          allSources={sources}
          isAddSourceModalOpen={isAddSourceModalOpen}
          onToggleAddSourceModal={toggleAddSourceModal}
          onToggleSource={(source) => {
            toggleSource(source);
            if (isAddSourceModalOpen) {
              closeAddSourceModal();
            }
          }}
        />

        <EventActionsSection
          actions={eventActions}
          variantId={variantId}
          event={event}
          activeVariant={activeVariant}
          properties={properties}
          isAddActionPopoverOpen={isAddActionPopoverOpen}
          onChangeActions={() => {
            /* handled via handleAddAction / property handlers */
          }}
          onOpenAddEventPropertyModal={openAddEventPropertyModal}
          onOpenAddSystemPropertyModal={openAddSystemPropertyModal}
          onToggleAddActionPopover={toggleAddActionPopover}
          onCloseAddActionPopover={toggleAddActionPopover}
          onAddAction={handleAddAction}
          onLog={logAction}
        />

        <EventCategoriesTagsSection
          categories={categories}
          tags={tags}
          variantId={variantId}
          newCategory={newCategory}
          newTag={newTag}
          onChangeNewCategory={setNewCategory}
          onChangeNewTag={setNewTag}
          onAddCategory={() => {
            addCategory();
            logAction(`added category ${newCategory}`);
          }}
          onAddTag={() => {
            addTag();
            logAction(`added tag ${newTag}`);
          }}
          onRemoveCategory={(category) => {
            removeCategory(category);
          }}
          onRemoveTag={(tag) => {
            removeTag(tag);
          }}
        />

        <EventTrackingCodeSection codegen={generateCodegen()} />

        <EventActivityLogSection activityLog={activityLog} />
      </div>

      <EventEditorFooter
        newComment={newComment}
        onChangeComment={setNewComment}
        onCommentKeyDown={handleAddComment}
        canArchive={!isCreating && !!event && !variantId}
        onArchive={() => {
          handleArchive();
        }}
        onSave={handleSave}
      />

      <CreateVariantModal
        isOpen={isVariantModalOpen}
        name={name}
        newVariantName={newVariantName}
        onChangeNewVariantName={setNewVariantName}
        onCreateVariant={handleCreateVariant}
        onClose={closeVariantModal}
      />

      <AddTriggerModal
        isOpen={isTriggerModalOpen}
        triggerImgBase64={triggerImgBase64}
        triggerSource={triggerSource}
        triggerDesc={triggerDesc}
        sources={sources}
        onUploadImage={handleImageUpload}
        onClearImage={clearTriggerImage}
        onChangeTriggerSource={setTriggerSource}
        onChangeTriggerDesc={setTriggerDesc}
        onSave={saveTrigger}
        onClose={closeTriggerModal}
      />

      <AddPropertyModal
        isOpen={isPropertyModalOpen}
        mode={propertyModalMode}
        filteredAvailableProps={filteredAvailableProps}
        hoveredPropId={hoveredPropId}
        onHoverProperty={setHoveredPropId}
        onSelectProperty={handleSelectProperty}
        search={propSearch}
        onChangeSearch={setPropSearch}
        allProperties={properties}
        onClose={closePropertyModal}
      />
    </div>
  );
}

