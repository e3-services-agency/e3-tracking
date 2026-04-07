import React from 'react';
import { Event } from '@/src/types';
import { EventEditorHeader } from '@/src/features/events/editor/EventEditorHeader';
import { EventEditorFooter } from '@/src/features/events/editor/EventEditorFooter';
import { EventDescriptionSection } from '@/src/features/events/editor/EventDescriptionSection';
import { EventTrackingCodeSection } from '@/src/features/events/editor/EventTrackingCodeSection';
import { EventCodeGen } from '@/src/features/events/components/EventCodeGen';
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
import { useActiveWorkspaceId } from '@/src/features/journeys/hooks/useJourneysApi';

type EventEditorSheetProps = {
  event: Event | null | undefined;
  variantId?: string;
  isCreating: boolean;
  onClose: () => void;
  onSwitchVariant?: (id: string) => void;
  deleteEvent: (
    eventId: string
  ) => Promise<
    | { success: true }
    | { success: false; error: { message: string } }
  >;
};

export function EventEditorSheet({
  event,
  variantId,
  isCreating,
  onClose,
  onSwitchVariant,
  deleteEvent,
}: EventEditorSheetProps) {
  const activeWorkspaceId = useActiveWorkspaceId();
  const { data, form, ui, actions, derived } = useEventEditor({
    event,
    variantId,
    isCreating,
    onClose,
    onSwitchVariant,
    deleteEventApi: deleteEvent,
  });

  const { teams, sources, properties, bundles } = data;
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
    trackingStatus,
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
    triggerName,
    isPropertyModalOpen,
    propertyModalMode,
  } = ui;
  const {
    setName,
    setDescription,
    setTrackingStatus,
    setNewCategory,
    setNewTag,
    setNewComment,
    setNewVariantName,
    openVariantModal,
    closeVariantModal,
    toggleAddActionPopover,
    openAddSourceModal,
    closeAddSourceModal,
    toggleAddStakeholderPopover,
    openTriggerModal,
    openTriggerModalForEdit,
    closeTriggerModal,
    openAddEventPropertyModal,
    openAddSystemPropertyModal,
    closePropertyModal,
    setTriggerSource,
    setTriggerDesc,
    setTriggerName,
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
    addSelectedSources,
    changeVariantName,
    changeVariantDescription,
    handleCreateVariant,
    handleAddAction,
    handleAddComment,
    handleModalAddSelected,
    handleImageUpload,
    handleImagePaste,
    handleSave,
    handleArchive,
    saveTrigger,
    logAction,
  } = actions;
  const { modalAvailableProperties, modalAttachedIds, generateCodegen } = derived;

  return (
    <div className="flex flex-col h-full bg-white relative font-sans -mx-6 -my-6">
      <EventEditorHeader
        variantId={variantId}
        name={name}
        activeVariantName={activeVariant?.name}
        trackingStatus={trackingStatus}
        onChangeName={setName}
        onChangeVariantName={(value) => {
          changeVariantName(variantId, value);
        }}
        onChangeTrackingStatus={setTrackingStatus}
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
          onEditTrigger={openTriggerModalForEdit}
          onRemoveTrigger={removeTrigger}
        />

        <EventSourcesSection
          variantId={variantId}
          sources={selectedSources}
          allSources={sources}
          isAddSourceModalOpen={isAddSourceModalOpen}
          onOpenAddSourceModal={openAddSourceModal}
          onCloseAddSourceModal={closeAddSourceModal}
          onAddSelectedSources={addSelectedSources}
          onToggleSource={toggleSource}
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

        <EventCodeGen eventId={event?.id} title="Code Snippets" workspaceId={activeWorkspaceId} />

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
        triggerName={triggerName}
        sources={sources}
        onUploadImage={handleImageUpload}
        onImagePaste={handleImagePaste}
        onClearImage={clearTriggerImage}
        onChangeTriggerSource={setTriggerSource}
        onChangeTriggerDesc={setTriggerDesc}
        onChangeTriggerName={setTriggerName}
        onSave={saveTrigger}
        onClose={closeTriggerModal}
      />

      <AddPropertyModal
        isOpen={isPropertyModalOpen}
        mode={propertyModalMode}
        onClose={closePropertyModal}
        availableProperties={modalAvailableProperties}
        attachedIds={modalAttachedIds}
        bundles={bundles}
        hideAddRequiredToggle
        onAddSelected={handleModalAddSelected}
      />
    </div>
  );
}

