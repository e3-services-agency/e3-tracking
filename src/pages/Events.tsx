import React, { useState, useEffect } from 'react';
import { useStore } from '@/src/store';
import { EventsList } from '@/src/features/events/EventsList';
import { EventEditorSheet as ApiEventEditorSheet } from '@/src/features/events/EventEditorSheet';
import { useEvents } from '@/src/features/events/hooks/useEvents';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { Button } from '@/src/components/ui/Button';
import { Plus } from 'lucide-react';

export function Events() {
  const { selectedItemIdToEdit, setSelectedItemIdToEdit } = useStore();
  const [apiEventSheetEventId, setApiEventSheetEventId] = useState<string | null>(null);
  const [isApiEventSheetOpen, setIsApiEventSheetOpen] = useState(false);
  const eventsApi = useEvents();
  const { hasValidWorkspaceContext } = useWorkspaceShell();

  /**
   * Deep-link / audit: open API editor only when the id exists in the hydrated workspace list.
   * While the list is loading, keep selectedItemIdToEdit so we do not drop a valid id before events arrive.
   * If the id is absent after load (stale Plan id, wrong workspace), clear without opening — no Plan fallback.
   */
  useEffect(() => {
    if (!selectedItemIdToEdit) return;
    if (eventsApi.isLoading) return;

    const match = eventsApi.events.find((e) => e.id === selectedItemIdToEdit);
    if (match) {
      setApiEventSheetEventId(match.id);
      setIsApiEventSheetOpen(true);
    }
    setSelectedItemIdToEdit(null);
  }, [selectedItemIdToEdit, eventsApi.events, eventsApi.isLoading, setSelectedItemIdToEdit]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--surface-default)] relative">
      <div className="px-6 py-4 border-b bg-white flex flex-col gap-4 relative z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Events{' '}
              <span className="text-gray-400 font-normal text-lg">({eventsApi.events.length})</span>
            </h1>
            <Button
              onClick={() => {
                setApiEventSheetEventId(null);
                setIsApiEventSheetOpen(true);
              }}
              size="sm"
              className="gap-2"
              disabled={!hasValidWorkspaceContext}
              title={
                !hasValidWorkspaceContext
                  ? 'Select a valid workspace in the header before creating an event.'
                  : undefined
              }
            >
              <Plus className="w-4 h-4" /> New event
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative z-10">
        <div className="flex-1 overflow-hidden flex flex-col p-6 bg-[var(--surface-default)]">
          <EventsList
            onOpenCreate={() => {
              setApiEventSheetEventId(null);
              setIsApiEventSheetOpen(true);
            }}
            allowCreate={hasValidWorkspaceContext}
            onOpenEvent={(id) => {
              setApiEventSheetEventId(id);
              setIsApiEventSheetOpen(true);
            }}
            events={eventsApi.events}
            isLoading={eventsApi.isLoading}
            error={eventsApi.error}
            refetch={eventsApi.refetch}
            mutationError={eventsApi.mutationError}
            clearMutationError={eventsApi.clearMutationError}
          />
        </div>
      </div>

      <ApiEventEditorSheet
        isOpen={isApiEventSheetOpen}
        onClose={() => setIsApiEventSheetOpen(false)}
        eventId={apiEventSheetEventId}
        createEvent={eventsApi.createEvent}
        updateEvent={eventsApi.updateEvent}
        attachProperty={eventsApi.attachProperty}
        detachProperty={eventsApi.detachProperty}
        updatePresence={eventsApi.updatePresence}
        getEventWithProperties={eventsApi.getEventWithProperties}
        getEffectivePropertyDefinitions={eventsApi.getEffectivePropertyDefinitions}
        putEventPropertyDefinitions={eventsApi.putEventPropertyDefinitions}
        deleteEventPropertyDefinition={eventsApi.deleteEventPropertyDefinition}
        createEventVariant={eventsApi.createEventVariant}
        updateEventVariant={eventsApi.updateEventVariant}
        deleteEventVariant={eventsApi.deleteEventVariant}
        mutationError={eventsApi.mutationError}
        clearMutationError={eventsApi.clearMutationError}
        onEventCreated={(id) => {
          setApiEventSheetEventId(id);
          eventsApi.refetch();
        }}
      />
    </div>
  );
}
