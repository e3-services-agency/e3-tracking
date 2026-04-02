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
import { useEvents, type ApiError } from '@/src/features/events/hooks/useEvents';
import {
  describeEffectiveTriggerRequirement,
  sortEffectiveDefinitionsForTriggerDisplay,
  type TriggerRequirementDisplay,
} from '@/src/lib/effectiveEventSchema';
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
import { JourneyDescriptionEditor } from '@/src/features/journeys/components/JourneyDescriptionEditor';

export const TriggerNode = ({ id, data }: NodeProps<TriggerFlowNode>) => {
  const { setNodes } = useReactFlow<JourneyFlowNode, JourneyFlowEdge>();
  const activeData = useActiveData();
  const eventsWorkspaceArg =
    data.workspaceId === null
      ? null
      : typeof data.workspaceId === 'string' && data.workspaceId.trim() !== ''
        ? data.workspaceId.trim()
        : undefined;
  const {
    events: apiEvents,
    isLoading: isLoadingEvents,
    refetch: refetchEvents,
    getEffectivePropertyDefinitions,
  } = useEvents(eventsWorkspaceArg);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [triggerPropertyRows, setTriggerPropertyRows] = useState<
    { name: string; display: TriggerRequirementDisplay }[] | null
  >(null);
  const [schemaMessage, setSchemaMessage] = useState<string | null>(null);

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
      purpose: e.purpose ?? null,
      categories: [],
      tags: [],
      sources: [],
      actions: [],
      variants: (e.variants ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description ?? '',
        propertyOverrides: {},
      })),
      stakeholderTeamIds: [],
      customFields: {},
    })) as TrackingEvent[];
  }, [activeData.events, apiEvents]);

  const variantSelectionInvalid = useMemo(() => {
    const ce = data.connectedEvent;
    if (!ce?.eventId || !ce.variantId) return false;
    const ev = mergedEvents.find((e) => e.id === ce.eventId);
    if (!ev?.variants?.length) return true;
    return !ev.variants.some((v) => v.id === ce.variantId);
  }, [data.connectedEvent, mergedEvents]);

  useEffect(() => {
    const ce = data.connectedEvent;
    if (!ce?.eventId || eventsWorkspaceArg === null) {
      setTriggerPropertyRows(null);
      setSchemaMessage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const r = await getEffectivePropertyDefinitions(ce.eventId, {
        variantId: ce.variantId ?? undefined,
      });
      if (cancelled) return;
      if (r.success) {
        setSchemaMessage(null);
        const sorted = sortEffectiveDefinitionsForTriggerDisplay(r.items);
        setTriggerPropertyRows(
          sorted.map((d) => ({
            name: d.property.name,
            display: describeEffectiveTriggerRequirement(d),
          }))
        );
        return;
      }
      setTriggerPropertyRows(null);
      const err = (r as { success: false; error: ApiError }).error;
      setSchemaMessage(
        ce.variantId && (err.code === 'NOT_FOUND' || err.message.toLowerCase().includes('variant'))
          ? 'Selected variant is missing or was removed. Pick the base event or another variant.'
          : err.message
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [data.connectedEvent, eventsWorkspaceArg, getEffectivePropertyDefinitions]);

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
        purpose: event.purpose ?? null,
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

      <div className="p-3 space-y-3 min-w-0">
        <JourneyDescriptionEditor
          anchorId={id}
          value={data.description ?? ''}
          onCommit={(description) => updateNodeData({ description })}
          readOnly={disabled}
          placeholder="Trigger Description..."
          textareaClassName="w-full text-xs text-gray-600 bg-white border rounded p-2 resize-none h-16 nodrag disabled:bg-gray-50"
          readOnlyContainerClassName="w-full text-xs text-gray-700 bg-white border rounded p-2 min-h-[3.5rem] min-w-0 max-w-full overflow-hidden"
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

            {data.connectedEvent.purpose != null &&
              String(data.connectedEvent.purpose).trim() !== '' && (
                <div className="text-[10px] text-gray-600 mt-1 line-clamp-2">
                  <span className="font-semibold text-gray-500">Purpose: </span>
                  {data.connectedEvent.purpose}
                </div>
              )}

            {variantSelectionInvalid && (
              <div className="mt-2 text-[10px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                This variant is no longer available. Reconnect the trigger or pick the base event or another variant.
              </div>
            )}

            {schemaMessage && !variantSelectionInvalid && (
              <div className="mt-2 text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {schemaMessage}
              </div>
            )}

            {triggerPropertyRows && triggerPropertyRows.length > 0 && (
              <div className="mt-2 overflow-x-auto max-h-44 overflow-y-auto rounded border border-blue-100 bg-white/80">
                <table className="w-full min-w-[200px] text-[10px] text-left border-collapse">
                  <thead>
                    <tr className="text-gray-500 border-b border-blue-100 bg-blue-50/50">
                      <th className="px-2 py-1 font-medium">Property</th>
                      <th className="px-2 py-1 font-medium whitespace-nowrap text-center">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {triggerPropertyRows.map((row) => {
                      const { display: d } = row;
                      return (
                        <tr key={row.name} className="border-b border-blue-50 last:border-0">
                          <td className="px-2 py-1 font-mono text-gray-800 break-all align-top">
                            {row.name}
                          </td>
                          <td
                            className={`px-2 py-1 align-top text-center font-mono whitespace-nowrap ${
                              d.requiredForTrigger
                                ? 'text-[11px] font-semibold text-amber-900'
                                : 'text-[11px] font-semibold text-slate-600'
                            }`}
                          >
                            {d.requiredForTrigger ? 'true' : 'false'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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

