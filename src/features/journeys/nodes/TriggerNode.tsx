import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useReactFlow, NodeProps } from '@xyflow/react';
import {
  Zap,
  Plus,
  ChevronDown,
  Search,
  X,
  UploadCloud,
  CheckCircle2,
} from 'lucide-react';

import { Button } from '@/src/components/ui/Button';
import { useActiveData } from '@/src/store';
import type { Event as TrackingEvent, EventVariant } from '@/src/types';
import { useEvents } from '@/src/features/events/hooks/useEvents';
import {
  TriggerFlowNode,
  JourneyFlowNode,
  JourneyFlowEdge,
  TriggerNodeData,
  isTriggerNode,
} from '@/src/features/journeys/nodes/types';
import { buildProofFromFile } from '@/src/features/journeys/lib/proofs';
import { StrictHandles, QAStatusBadge } from '@/src/features/journeys/nodes/NodeHandles';
import { JourneyQuickAddMenu } from '@/src/features/journeys/overlays/JourneyQuickAddMenu';

export const TriggerNode = ({ id, data }: NodeProps<TriggerFlowNode>) => {
  const { setNodes } = useReactFlow<JourneyFlowNode, JourneyFlowEdge>();
  const activeData = useActiveData();
  const eventsWorkspaceArg =
    data.workspaceId === null
      ? null
      : typeof data.workspaceId === 'string' && data.workspaceId.trim() !== ''
        ? data.workspaceId.trim()
        : undefined;
  const { events: apiEvents, isLoading: isLoadingEvents, refetch: refetchEvents } =
    useEvents(eventsWorkspaceArg);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isQAMode = !!data.activeQARunId;
  const isReadOnly = !!(data as TriggerNodeData & { readOnly?: boolean }).readOnly;
  const qaStatus = data.qaVerification?.status || 'Pending';
  const pendingProofs = data.pendingProofs || [];
  const disabled = isQAMode || isReadOnly;

  const mergedEvents: TrackingEvent[] = useMemo(() => {
    // Prefer richer in-memory events when available (includes variants), otherwise fall back to API list.
    const storeEvents = (activeData.events ?? []) as TrackingEvent[];
    if (Array.isArray(storeEvents) && storeEvents.length > 0) return storeEvents;
    return (apiEvents ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description ?? '',
      categories: [],
      tags: [],
      sources: [],
      actions: [],
      variants: [],
      stakeholderTeamIds: [],
      customFields: {},
    })) as TrackingEvent[];
  }, [activeData.events, apiEvents]);

  const filteredEvents = useMemo(
    () =>
      mergedEvents.filter((event) =>
        event.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [mergedEvents, searchQuery],
  );

  useEffect(() => {
    if (!isDropdownOpen) return;
    if ((activeData.events ?? []).length > 0) return;
    void refetchEvents();
  }, [isDropdownOpen, activeData.events, refetchEvents]);

  const updateNodeData = (patch: Partial<TriggerNodeData>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id && isTriggerNode(n)
          ? { ...n, data: { ...n.data, ...patch } }
          : n,
      ),
    );
  };

  const handleEventSelect = (event: TrackingEvent, variant?: EventVariant) => {
    updateNodeData({
      connectedEvent: {
        eventId: event.id,
        variantId: variant?.id,
        name: event.name,
        variantName: variant?.name,
        description: event.description,
      },
    });

    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!isQAMode) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.includes('image')) {
          const file = items[i].getAsFile();
          if (!file) continue;

          const proof = await buildProofFromFile(file);
          updateNodeData({ pendingProofs: [...pendingProofs, proof] });

          e.preventDefault();
          break;
        }
      }
    },
    [isQAMode, pendingProofs],
  );

  return (
    <div
      className={`bg-white border-2 ${
        isQAMode && qaStatus === 'Failed'
          ? 'border-red-400'
          : isQAMode && qaStatus === 'Passed'
            ? 'border-emerald-400'
            : 'border-amber-400'
      } rounded-lg shadow-sm min-w-[280px] max-w-[320px] overflow-visible group relative focus:outline-none`}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {isQAMode && <QAStatusBadge status={qaStatus} />}
      <StrictHandles color="bg-amber-400" isQAMode={isQAMode} />
      {!isQAMode && !isReadOnly && <JourneyQuickAddMenu nodeId={id} position="right" />}

      <div className="bg-amber-50 px-3 py-2 border-b border-amber-200 flex items-center gap-2 rounded-t-lg">
        <Zap className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-bold text-amber-900">Trigger</span>
      </div>

      <div className="p-3 space-y-3">
        <textarea
          placeholder="Trigger Description..."
          value={data.description}
          onChange={(e) =>
            !disabled && updateNodeData({ description: e.target.value })
          }
          disabled={disabled}
          className="w-full text-xs text-gray-600 bg-white border rounded p-2 resize-none h-16 disabled:bg-gray-50 nodrag"
        />

        {!data.connectedEvent ? (
          <div className="relative">
            {!isReadOnly && (
            <>
            <Button
              variant="outline"
              className="w-full justify-between text-sm border-dashed border-2"
              onClick={() => !disabled && setIsDropdownOpen(!isDropdownOpen)}
              disabled={disabled}
            >
              <span className="flex items-center gap-2 text-gray-500">
                <Plus className="w-4 h-4" /> Connect Event
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </Button>

            {isDropdownOpen && !isQAMode && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-60 flex flex-col">
                <div className="p-2 border-b sticky top-0 bg-white">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search events..."
                      className="w-full pl-8 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-amber-400 nodrag"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="overflow-y-auto p-1">
                  {isLoadingEvents && filteredEvents.length === 0 && (
                    <div className="p-2 text-xs text-center text-gray-500">
                      Loading events…
                    </div>
                  )}
                  {filteredEvents.map((event: TrackingEvent) => (
                    <div key={event.id}>
                      <button
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-amber-50 rounded flex items-center gap-2"
                        onClick={() => handleEventSelect(event)}
                        type="button"
                      >
                        <Zap className="w-3 h-3 text-[var(--color-info)]" />
                        <span className="font-medium truncate">
                          {event.name}
                        </span>
                      </button>

                      {event.variants?.map((variant: EventVariant) => (
                        <button
                          key={variant.id}
                          className="w-full text-left pl-6 pr-2 py-1 text-xs hover:bg-purple-50 rounded flex items-center gap-2 text-gray-600"
                          onClick={() => handleEventSelect(event, variant)}
                          type="button"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          <span className="truncate">{variant.name}</span>
                        </button>
                      ))}
                    </div>
                  ))}

                  {filteredEvents.length === 0 && (
                    <div className="p-2 text-xs text-center text-gray-500">
                      No events found.
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 relative group">
            {!isQAMode && !isReadOnly && (
              <button
                className="absolute top-1 right-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => updateNodeData({ connectedEvent: null })}
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3 h-3 text-[var(--color-info)]" />
              <span className="text-sm font-bold text-blue-900 break-all">
                {data.connectedEvent.name}
              </span>
            </div>

            {data.connectedEvent.variantName && (
              <div className="inline-block text-[10px] font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded border border-purple-200 mb-1">
                {data.connectedEvent.variantName}
              </div>
            )}

            {data.connectedEvent.description && (
              <div className="text-xs text-gray-600 line-clamp-2">
                {data.connectedEvent.description}
              </div>
            )}
          </div>
        )}
      </div>

      {isQAMode && !isReadOnly && (
        <div className="p-2 border-t bg-blue-50/50">
          <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-blue-300 rounded bg-white text-blue-600 text-xs cursor-pointer hover:bg-blue-50 transition-colors">
            <UploadCloud className="w-4 h-4 mb-1" />
            <span className="font-semibold">Upload Proofs</span>
            <span className="text-gray-500 text-[10px] mt-1 text-center">
              Screenshots and supporting files for this trigger
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;

                const newProofs = await Promise.all(
                  files.map(buildProofFromFile),
                );
                updateNodeData({
                  pendingProofs: [...pendingProofs, ...newProofs],
                });
                e.target.value = '';
              }}
            />
          </label>

          {pendingProofs.length > 0 && (
            <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {pendingProofs.length} proof(s) ready to save
            </div>
          )}
        </div>
      )}
    </div>
  );
};

