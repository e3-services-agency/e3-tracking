import React from 'react';
import { ReactFlow, MiniMap, Controls, Background } from '@xyflow/react';

// CRITICAL: AVO-inspired builder — do not change layout or interaction model
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { Journey, TestingProfile } from '@/src/types';
import {
  isJourneyStepNode,
  isTriggerNode,
  type JourneyFlowNode,
  type JourneyFlowEdge,
} from '@/src/features/journeys/nodes/types';
import { buildProofFromFile, readFileAsContent } from '@/src/features/journeys/lib/proofs';
import { JourneyStepNode } from '@/src/features/journeys/nodes/JourneyStepNode';
import { TriggerNode } from '@/src/features/journeys/nodes/TriggerNode';
import { NoteNode } from '@/src/features/journeys/nodes/NoteNode';
import { AnnotationNode } from '@/src/features/journeys/nodes/AnnotationNode';
import { JourneyProofViewer } from '@/src/features/journeys/overlays/JourneyProofViewer';
import { EventCodeGen } from '@/src/features/events/components/EventCodeGen';
import { useJourneyCanvas } from '@/src/features/journeys/hooks/useJourneyCanvas';
import { useActiveWorkspaceId } from '@/src/features/journeys/hooks/useJourneysApi';
import {
  computeQARunStatusForRun,
  getQARunDisplayName,
  hasPendingStepsForRun,
} from '@/src/features/journeys/lib/qaRunUtils';
import { JourneyPendingQAWarnModal } from '@/src/features/journeys/overlays/JourneyPendingQAWarnModal';
import {
  AlertTriangle,
  CircleDashed,
  CheckCircle2,
  CheckSquare,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Save,
  StickyNote,
  Trash2,
  UploadCloud,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

const nodeTypes = {
  journeyStepNode: JourneyStepNode,
  triggerNode: TriggerNode,
  noteNode: NoteNode,
  annotationNode: AnnotationNode,
};

function TestingProfilesEditor({
  profiles,
  onChange,
}: {
  profiles: TestingProfile[];
  onChange: (profiles: TestingProfile[]) => void;
}) {
  const addProfile = () => {
    onChange([
      ...profiles,
      {
        id: `profile-${Date.now()}`,
        label: '',
        url: '',
        note: '',
      },
    ]);
  };

  const updateProfile = (id: string, patch: Partial<TestingProfile>) => {
    onChange(
      profiles.map((profile) =>
        profile.id === id ? { ...profile, ...patch } : profile,
      ),
    );
  };

  const removeProfile = (id: string) => {
    onChange(profiles.filter((profile) => profile.id !== id));
  };

  return (
    <div className="space-y-3">
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="border rounded-lg p-3 bg-gray-50 space-y-2"
        >
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-gray-600 uppercase">
              Testing Profile
            </div>
            <button
              onClick={() => removeProfile(profile.id)}
              className="text-gray-400 hover:text-red-500"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Input
            value={profile.label}
            onChange={(e) =>
              updateProfile(profile.id, { label: e.target.value })
            }
            placeholder="Profile label (e.g. QA Test User 1)"
          />
          <Input
            value={profile.url}
            onChange={(e) =>
              updateProfile(profile.id, { url: e.target.value })
            }
            placeholder="Bloomreach profile URL"
          />
          <textarea
            value={profile.note || ''}
            onChange={(e) =>
              updateProfile(profile.id, { note: e.target.value })
            }
            placeholder="Optional note"
            className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={addProfile}
      >
        <Plus className="w-4 h-4" /> Add Testing Profile
      </Button>
    </div>
  );
}

export function JourneyCanvas({
  journey,
  activeQARunId,
  readOnly = false,
  qaLocked = false,
  onEndQA,
  hideFloatingSave = false,
  onSaveLayoutState,
}: {
  journey: Journey;
  activeQARunId: string | null;
  readOnly?: boolean;
  qaLocked?: boolean;
  onEndQA?: (endedAt: string) => void;
  hideFloatingSave?: boolean;
  onSaveLayoutState?: (s: {
    save: () => void;
    isSaving: boolean;
    saveSuccess: boolean;
    saveError: string | null;
  }) => void;
}) {
  const effectiveReadOnly = readOnly || qaLocked;
  const activeWorkspaceId = useActiveWorkspaceId();
  const [readOnlyImagePreview, setReadOnlyImagePreview] = React.useState<string | null>(null);
  const [isPendingQAWarnOpen, setIsPendingQAWarnOpen] = React.useState(false);
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = React.useState(false);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = React.useState(false);
  const [isConfirmSavingQA, setIsConfirmSavingQA] = React.useState(false);
  const [isConfirmEndingQA, setIsConfirmEndingQA] = React.useState(false);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    handleAddConnectedNode,
    handleSaveLayout,
    saveError,
    handleSaveQA,
    addStepNode,
    addTriggerNode,
    addNoteNode,
    beginAnnotationDraw,
    updateAnnotationDraw,
    finishAnnotationDraw,
    onNodeClick,
    updateQARun,
    updateQAVerification,
    handleAddPayload,
    handleTriggerPayloadPaste,
    handleValidatePayload,
    updateNodeLinkedProfiles,
    addExtraNodeProfile,
    updateExtraNodeProfile,
    removeExtraNodeProfile,
    setSelectedPanel,
    setSelectedNodeId,
    setTool,
    setAnnotationColor,
    setMenuPos,
    setPendingConnection,
    setPayloadDraft,
    setViewerProof,
    closeViewerProof,
    setNodes,
    buildTextProof,
    selectedPanel,
    selectedNodeId,
    isSaving,
    saveSuccess,
    isSavingQA,
    saveQASuccess,
    menuPos,
    pendingConnection,
    tool,
    annotationColor,
    annotationStart,
    draftAnnotationId,
    payloadDraft,
    viewerProof,
    payloadValidationResult,
    isValidatingPayload,
    activeQARun,
    selectedNode,
    currentVerification,
    activeVerifications,
    runProfiles,
    nodeLinkedProfileIds,
    nodeExtraProfiles,
    verificationProofs,
    pendingNodeProofs,
    hasUnsavedChanges,
  } = useJourneyCanvas({ journey, activeQARunId, readOnly: effectiveReadOnly });

  // Native navigation guard: warn on refresh/tab-close while layout has unsaved edits.
  React.useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Keyboard shortcut: Ctrl+S / Cmd+S to save layout (only if dirty).
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 's') return;

      // Prevent the browser from triggering its own "Save Page" dialog.
      e.preventDefault();
      e.stopPropagation();

      if (!hasUnsavedChanges) return;

      void handleSaveLayout();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasUnsavedChanges, handleSaveLayout]);

  const imageProofs = verificationProofs.filter((p) => p.type === 'image');
  const payloadProofs = verificationProofs.filter((p) => p.type !== 'image');

  const qaRunDerivedStatus = computeQARunStatusForRun(activeQARun);
  const qaRunHasPendingSteps = hasPendingStepsForRun(activeQARun);
  const nodeStatus = currentVerification?.status ?? 'Pending';
  const statusChipClass =
    nodeStatus === 'Passed'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : nodeStatus === 'Failed'
        ? 'bg-red-100 text-red-800 border-red-200'
        : 'bg-amber-100 text-amber-800 border-amber-200';

  const selectedTriggerPrefetchedSnippets = React.useMemo(() => {
    if (!selectedNode || !isTriggerNode(selectedNode)) return null;
    const direct = (selectedNode.data as any)?.codegenSnippets;
    if (direct) return direct;

    const eventId = selectedNode.data.connectedEvent?.eventId;
    const baseNodes = Array.isArray(journey.nodes) ? (journey.nodes as any[]) : [];
    if (typeof eventId !== 'string') {
      const byNodeIdOnly = baseNodes.find(
        (n) => n?.type === 'triggerNode' && n?.id === selectedNode.id && n?.data?.codegenSnippets
      );
      return byNodeIdOnly?.data?.codegenSnippets ?? null;
    }

    const byNodeId = baseNodes.find(
      (n) => n?.type === 'triggerNode' && n?.id === selectedNode.id && n?.data?.codegenSnippets
    ) as any;
    if (byNodeId?.data?.codegenSnippets) return byNodeId.data.codegenSnippets;

    const byEventId = baseNodes.find(
      (n) =>
        n?.type === 'triggerNode' &&
        n?.data?.connectedEvent?.eventId === eventId &&
        n?.data?.codegenSnippets
    ) as any;
    if (byEventId?.data?.codegenSnippets) return byEventId.data.codegenSnippets;
    return null;
  }, [selectedNode, journey.nodes]);
  const selectedTriggerConnectedEvent = React.useMemo(() => {
    if (!selectedNode || !isTriggerNode(selectedNode)) return null;
    const direct = selectedNode.data.connectedEvent;
    if (direct?.eventId) return direct;

    const baseNodes = Array.isArray(journey.nodes) ? (journey.nodes as any[]) : [];
    const byNodeId = baseNodes.find(
      (n) => n?.type === 'triggerNode' && n?.id === selectedNode.id && n?.data?.connectedEvent?.eventId
    );
    if (byNodeId?.data?.connectedEvent?.eventId) return byNodeId.data.connectedEvent;

    const selectedEventId = (selectedNode.data as any)?.eventId;
    if (typeof selectedEventId === 'string') {
      const byEventId = baseNodes.find(
        (n) =>
          n?.type === 'triggerNode' &&
          n?.data?.connectedEvent?.eventId === selectedEventId
      );
      if (byEventId?.data?.connectedEvent?.eventId) return byEventId.data.connectedEvent;
    }

    return null;
  }, [selectedNode, journey.nodes]);
  const selectedTriggerEventIdForCodegen =
    selectedNode && isTriggerNode(selectedNode)
      ? selectedTriggerConnectedEvent?.eventId ?? null
      : null;

  React.useEffect(() => {
    onSaveLayoutState?.({
      save: handleSaveLayout,
      isSaving,
      saveSuccess,
      saveError,
    });
  }, [onSaveLayoutState, handleSaveLayout, isSaving, saveSuccess, saveError]);

  return (
    <div className="flex h-full w-full relative">
      {!activeQARunId && !effectiveReadOnly && (
        <div className="w-64 border-r bg-gray-50 flex flex-col p-4 space-y-6">
          <div>
            <h3 className="font-semibold text-sm text-gray-900">
              Journey Nodes
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Add nodes to build your tracking journey.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={addStepNode}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded shadow-sm hover:border-gray-400 transition-colors text-left text-gray-700"
                type="button"
              >
                <ImageIcon className="w-4 h-4 text-gray-500" />
                <span className="font-medium">Add Step Node</span>
              </button>
              <button
                onClick={addTriggerNode}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded shadow-sm hover:border-amber-400 transition-colors text-left text-gray-700"
                type="button"
              >
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="font-medium">Add Trigger Node</span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-gray-900">
              Annotations
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Add global notes and draw highlight annotations.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() =>
                  setTool((currentTool) =>
                    currentTool === 'annotation' ? 'select' : 'annotation',
                  )
                }
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded shadow-sm transition-colors text-left ${
                  tool === 'annotation'
                    ? 'bg-[var(--color-info)] text-white border border-[var(--color-info)]'
                    : 'bg-[var(--color-info)]/10 border border-[var(--color-info)]/30 hover:border-[var(--color-info)]/60 text-gray-900'
                }`}
                type="button"
              >
                <Pencil className="w-4 h-4" />
                <span className="font-medium">
                  {tool === 'annotation'
                    ? 'Rectangle Annotation Active'
                    : 'Draw Rectangle Annotation'}
                </span>
              </button>

              <div className="flex items-center gap-2 pt-1">
                {['var(--annotation-1)', 'var(--annotation-2)', 'var(--annotation-3)', 'var(--annotation-4)', 'var(--annotation-5)'].map(
                  (color) => (
                    <button
                      key={color}
                      onClick={() => setAnnotationColor(color)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        annotationColor === color
                          ? 'border-gray-900 scale-110'
                          : 'border-white'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                      type="button"
                    />
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto p-4 bg-[var(--color-info)]/10 rounded-lg border border-[var(--color-info)]/20">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Tips</h4>
            <ul className="text-xs text-gray-700 space-y-2 list-disc pl-4">
              <li>
                Use the <strong>+</strong> button next to node handles to
                instantly build flows.
              </li>
              <li>
                Select a node or edge and press <strong>Backspace</strong> to
                delete.
              </li>
              <li>
                Turn on <strong>Rectangle Annotation</strong>, choose a color,
                and drag anywhere on the canvas.
              </li>
            </ul>
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        {!activeQARunId && !effectiveReadOnly && tool === 'annotation' && (
          <div
            className="absolute inset-0 z-10"
            style={{ cursor: 'crosshair', backgroundColor: 'transparent' }}
            onMouseDown={(e) => beginAnnotationDraw(e.clientX, e.clientY)}
            onMouseMove={(e) => {
              if (annotationStart && draftAnnotationId) {
                updateAnnotationDraw(e.clientX, e.clientY);
              }
            }}
            onMouseUp={finishAnnotationDraw}
            onMouseLeave={() => {
              if (annotationStart && draftAnnotationId) {
                finishAnnotationDraw();
              }
            }}
          />
        )}

        <ReactFlow<JourneyFlowNode, JourneyFlowEdge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => {
            setMenuPos(null);
            setPendingConnection(null);

            if (activeQARunId) {
              setSelectedPanel('summary');
            }
          }}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[var(--surface-default)]"
          nodesDraggable={!effectiveReadOnly && !activeQARunId && tool !== 'annotation'}
          nodesConnectable={!effectiveReadOnly && !activeQARunId && tool !== 'annotation'}
          elementsSelectable={true}
          panOnDrag={tool !== 'annotation' || effectiveReadOnly}
          selectionOnDrag={!effectiveReadOnly && tool !== 'annotation'}
          deleteKeyCode={effectiveReadOnly || activeQARunId ? null : ['Backspace', 'Delete']}
        >
          <Controls />
          <MiniMap
            nodeColor="var(--color-info)"
            maskColor="rgba(249, 250, 251, 0.7)"
          />
          <Background gap={16} size={1} color="var(--border-default)" />
        </ReactFlow>

        {!hideFloatingSave && !activeQARunId && !effectiveReadOnly && (
          <div className="absolute top-4 right-4 z-20">
            <Button
              onClick={handleSaveLayout}
              disabled={isSaving}
              className="gap-2 shadow-md bg-white text-gray-900 hover:bg-gray-50 border transition-all w-[140px]"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Layout'}
            </Button>
            {saveError && (
              <div className="mt-1 text-xs text-red-600 max-w-[240px] text-right">
                {saveError}
              </div>
            )}
          </div>
        )}

        {menuPos && !effectiveReadOnly && (
          <div
            className="fixed z-50 bg-white border rounded-lg shadow-xl p-2 flex flex-col gap-1 w-48"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              onClick={() => handleAddConnectedNode('journeyStepNode')}
              className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-gray-50 rounded text-left"
              type="button"
            >
              <ImageIcon className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-gray-700">Add Step</span>
            </button>
            <button
              onClick={() => handleAddConnectedNode('triggerNode')}
              className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-amber-50 rounded text-left"
              type="button"
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="font-medium text-gray-700">Add Trigger</span>
            </button>
          </div>
        )}
      </div>

      {activeQARunId && selectedPanel === 'summary' && (
        <div className="w-[420px] border-l bg-white flex flex-col shadow-xl z-20 absolute right-0 top-0 bottom-0">
          <div className="p-4 border-b bg-gray-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 shrink-0 min-w-0">
                <FileText className="w-5 h-5 text-[var(--color-info)] shrink-0" /> QA Run Details
              </h3>
              <div className="flex items-center gap-2 shrink-0 min-w-0">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  QA Status
                </span>
                <div
                  className={
                    qaRunDerivedStatus === 'FAILED'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : qaRunDerivedStatus === 'PASSED'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-blue-50 border-blue-200 text-[var(--color-info)]'
                  }
                >
                  <div className="border rounded-md px-2 py-1 text-sm font-semibold whitespace-nowrap">
                    {qaRunDerivedStatus}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedNodeId(null);
                setSelectedPanel('none');
              }}
              className="text-gray-400 hover:text-gray-600 shrink-0"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="shrink-0 px-4 py-3 border-b bg-white">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              QA Summary
            </div>
            <div className="text-sm text-gray-700 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <CircleDashed className="w-4 h-4 text-gray-500" />
                <span className="font-semibold text-gray-800">
                  {
                    nodes.filter(
                      (node) =>
                        node.type === 'journeyStepNode' || node.type === 'triggerNode'
                    ).length
                  }
                </span>
                <span className="text-gray-500">nodes</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-emerald-700">
                  {
                    Object.values(activeVerifications).filter(
                      (verification) => verification.status === 'Passed'
                    ).length
                  }
                </span>
                <span className="text-gray-500">passed</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="font-semibold text-red-700">
                  {
                    Object.values(activeVerifications).filter(
                      (verification) => verification.status === 'Failed'
                    ).length
                  }
                </span>
                <span className="text-gray-500">failed</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0">
          <div className="p-4 flex-1 overflow-y-auto space-y-6">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Run Name
                </div>
                <Input
                    value={getQARunDisplayName(activeQARun)}
                    disabled
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Tester
                </div>
                <Input
                  value={activeQARun?.testerName || ''}
                  placeholder="Logged-in user email"
                  readOnly
                  disabled
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Environment
                </div>
                <Input
                  value={activeQARun?.environment || ''}
                  onChange={(e) =>
                    updateQARun({ environment: e.target.value })
                  }
                  placeholder="e.g. Staging / Production-like"
                  disabled={effectiveReadOnly}
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Overall QA Notes
              </div>
              <textarea
                className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={activeQARun?.overallNotes || ''}
                onChange={(e) =>
                  updateQARun({ overallNotes: e.target.value })
                }
                placeholder="Add overall run notes, blockers, conclusions, or final recommendation..."
                readOnly={effectiveReadOnly}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Testing Profiles
              </div>
              {effectiveReadOnly ? (
                <div className="text-xs text-gray-600 bg-gray-50 border rounded p-3">
                  {runProfiles.length > 0
                    ? `Provided: ${runProfiles
                        .map((p) => p.label || p.url)
                        .join(', ')}`
                    : 'No testing profiles added.'}
                </div>
              ) : (
                <TestingProfilesEditor
                  profiles={runProfiles}
                  onChange={(profiles) => updateQARun({ testingProfiles: profiles })}
                />
              )}
            </div>

          </div>
          {!effectiveReadOnly && (
            <div className="shrink-0 border-t bg-white p-4 z-10">
              {qaRunHasPendingSteps && (
                <div className="mb-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  End QA is disabled because some nodes are still Pending.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => setIsSaveConfirmOpen(true)}
                  disabled={isSavingQA}
                >
                  <Save className="w-4 h-4" />
                  {isSavingQA
                    ? 'Saving QA...'
                    : saveQASuccess
                      ? 'QA Saved!'
                      : 'Save QA'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-2"
                  onClick={() => setIsEndConfirmOpen(true)}
                  disabled={isSavingQA || qaRunHasPendingSteps}
                  title={
                    qaRunHasPendingSteps
                      ? 'Cannot end QA while there are pending steps.'
                      : undefined
                  }
                >
                  <X className="w-4 h-4" /> End QA
                </Button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {(activeQARunId || readOnly) &&
        selectedPanel === 'node' &&
        selectedNode &&
        (isJourneyStepNode(selectedNode) || isTriggerNode(selectedNode)) && (
          <div className="w-[420px] border-l bg-white flex flex-col shadow-xl z-20 absolute right-0 top-0 bottom-0">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
                <h3 className="font-bold text-gray-900 flex items-center gap-2 min-w-0">
                  <CheckSquare className="w-5 h-5 text-[var(--color-info)] shrink-0" />
                  <span className="truncate">
                    {effectiveReadOnly ? 'Node Details' : 'QA Verification'}
                  </span>
                </h3>
                <div className="flex items-center gap-2 shrink-0 min-w-0">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    QA Status
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border whitespace-nowrap ${statusChipClass}`}>
                    {nodeStatus}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedPanel('summary');
                }}
                className="text-gray-400 hover:text-gray-600 shrink-0"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-6 min-h-0">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Node Details
                </div>
                <div className="bg-gray-50 p-3 rounded border text-sm">
                  <div className="font-medium text-gray-900 mb-1">
                    {isJourneyStepNode(selectedNode)
                      ? selectedNode.data.label
                      : 'Trigger Node'}
                  </div>
                  {isTriggerNode(selectedNode) &&
                    selectedNode.data.connectedEvent && (
                      <div className="text-gray-600">
                        Event: {selectedNode.data.connectedEvent.name}
                      </div>
                    )}
                </div>
              </div>

              {effectiveReadOnly && isJourneyStepNode(selectedNode) && (
                <div className="space-y-4">
                  {(selectedNode.data.description ?? '').trim() && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Description
                      </div>
                      <div className="bg-white border rounded-md p-2 text-sm text-gray-800 whitespace-pre-wrap">
                        {selectedNode.data.description}
                      </div>
                    </div>
                  )}

                  {(selectedNode.data.url ?? '').trim() && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        URL
                      </div>
                      <a
                        className="block bg-white border rounded-md p-2 text-sm text-[var(--color-info)] break-all hover:underline"
                        href={selectedNode.data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {selectedNode.data.url}
                      </a>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Action
                      </div>
                      <div className="bg-white border rounded-md p-2 text-sm text-gray-800">
                        {selectedNode.data.actionType ?? 'click'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Implementation
                      </div>
                      <div className="bg-white border rounded-md p-2 text-sm text-gray-800 capitalize">
                        {selectedNode.data.implementationType ?? 'new'}
                      </div>
                    </div>
                  </div>

                  {(selectedNode.data.targetElement ?? '').trim() && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Target element
                      </div>
                      <pre className="bg-white border rounded-md p-2 text-xs text-gray-700 whitespace-pre-wrap break-all">
                        {selectedNode.data.targetElement}
                      </pre>
                    </div>
                  )}

                  {(selectedNode.data.testDataJson ?? '').trim() && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Test data
                      </div>
                      <pre className="bg-white border rounded-md p-2 text-xs text-gray-700 whitespace-pre-wrap break-all">
                        {selectedNode.data.testDataJson}
                      </pre>
                    </div>
                  )}

                  {(selectedNode.data.imageUrl ?? '').trim() && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Screenshot
                      </div>
                      <button
                        type="button"
                        onClick={() => setReadOnlyImagePreview(selectedNode.data.imageUrl)}
                        className="w-full border rounded-md overflow-hidden bg-white hover:border-[var(--color-info)] transition-colors"
                        title="Click to preview"
                      >
                        <img
                          src={selectedNode.data.imageUrl}
                          alt="Step screenshot"
                          className="block w-full h-auto"
                        />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isTriggerNode(selectedNode) &&
                selectedNode.data.connectedEvent?.eventId && (
                  <div className="pt-2 border-t border-gray-200">
                    <EventCodeGen
                      eventId={selectedTriggerEventIdForCodegen}
                      prefetchedSnippets={selectedTriggerPrefetchedSnippets}
                      compact
                      title="Code Snippets"
                      workspaceId={activeWorkspaceId}
                    />
                  </div>
                )}

              {!effectiveReadOnly && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  QA Notes
                </div>
                <textarea
                  className="w-full h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Add notes about the test execution..."
                  value={currentVerification?.notes || ''}
                  onChange={(e) =>
                    updateQAVerification(selectedNode.id, {
                      notes: e.target.value,
                    })
                  }
                />
              </div>
              )}

              {!effectiveReadOnly && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Linked Testing Profiles
                </div>
                <div className="space-y-2">
                  {runProfiles.length === 0 && (
                    <div className="text-xs text-gray-500 bg-gray-50 border rounded p-3">
                      No run-level testing profiles added yet. Add them in QA
                      Run Details.
                    </div>
                  )}

                  {runProfiles.map((profile) => (
                    <label
                      key={profile.id}
                      className="flex items-start gap-3 border rounded p-3 bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={nodeLinkedProfileIds.includes(profile.id)}
                        onChange={(e) =>
                          updateNodeLinkedProfiles(profile.id, e.target.checked)
                        }
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {profile.label || 'Untitled profile'}
                        </div>
                        <div className="text-xs text-blue-700 break-all">
                          {profile.url}
                        </div>
                        {profile.note && (
                          <div className="text-xs text-gray-500 mt-1">
                            {profile.note}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              )}

              {!effectiveReadOnly && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Step-Specific Extra Testing Profiles
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addExtraNodeProfile}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>

                <div className="space-y-3">
                  {nodeExtraProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="border rounded-lg p-3 bg-gray-50 space-y-2"
                    >
                      <div className="flex justify-end">
                        <button
                          onClick={() => removeExtraNodeProfile(profile.id)}
                          className="text-gray-400 hover:text-red-500"
                          type="button"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <Input
                        value={profile.label}
                        onChange={(e) =>
                          updateExtraNodeProfile(profile.id, {
                            label: e.target.value,
                          })
                        }
                        placeholder="Profile label"
                      />
                      <Input
                        value={profile.url}
                        onChange={(e) =>
                          updateExtraNodeProfile(profile.id, {
                            url: e.target.value,
                          })
                        }
                        placeholder="Bloomreach profile URL"
                      />
                      <textarea
                        value={profile.note || ''}
                        onChange={(e) =>
                          updateExtraNodeProfile(profile.id, {
                            note: e.target.value,
                          })
                        }
                        placeholder="Optional note"
                        className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
              )}

              <div className="space-y-3">
                {!effectiveReadOnly && (
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Proof Files
                  </div>

                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length || !selectedNode) return;

                        const newProofs = await Promise.all(
                          files.map(buildProofFromFile),
                        );

                        setNodes((existingNodes) =>
                          existingNodes.map((node) =>
                            node.id === selectedNode.id
                              ? {
                                  ...node,
                                  data: {
                                    ...node.data,
                                    pendingProofs: [
                                      ...(node.data.pendingProofs || []),
                                      ...newProofs,
                                    ],
                                  },
                                }
                              : node,
                          ),
                        );

                        e.target.value = '';
                      }}
                    />
                    <Button size="sm" variant="outline" type="button">
                      <UploadCloud className="w-4 h-4 mr-2" /> Upload
                    </Button>
                  </label>
                </div>
                )}

                {!effectiveReadOnly && pendingNodeProofs.length > 0 && (
                  <div className="border border-blue-200 bg-blue-50 rounded p-3 space-y-2">
                    <div className="text-xs font-medium text-blue-900">
                      Pending uploads ({pendingNodeProofs.length})
                    </div>

                    {pendingNodeProofs.map((proof) => (
                      <div
                        key={proof.id}
                        className="flex items-center justify-between text-xs bg-white border rounded p-2"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {proof.name}
                          </div>
                          <div className="text-gray-500">
                            {proof.type.toUpperCase()}
                          </div>
                        </div>
                        <button
                          className="text-red-500 hover:text-red-700"
                          onClick={() =>
                            setNodes((existingNodes) =>
                              existingNodes.map((node) =>
                                node.id === selectedNode.id
                                  ? {
                                      ...node,
                                      data: {
                                        ...node.data,
                                        pendingProofs: (
                                          node.data.pendingProofs || []
                                        ).filter(
                                          (candidate) =>
                                            candidate.id !== proof.id,
                                        ),
                                      },
                                    }
                                  : node,
                              ),
                            )
                          }
                          type="button"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    <Button
                      className="w-full"
                      onClick={() =>
                        updateQAVerification(selectedNode.id, {})
                      }
                    >
                      Save Pending Proofs
                    </Button>
                  </div>
                )}

                {(imageProofs.length > 0 || payloadProofs.length > 0) && (
                  <div className="space-y-3">
                    {imageProofs.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                          Upload Image (QA Proof)
                        </div>
                        {imageProofs.map((proof) => (
                          <div
                            key={proof.id}
                            className="border rounded p-3 bg-gray-50 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 break-all">
                                  {proof.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  IMAGE •{' '}
                                  {new Date(proof.createdAt).toLocaleString()}
                                </div>
                              </div>

                              {!effectiveReadOnly && (
                                <button
                                  className="text-red-500 hover:text-red-700"
                                  onClick={() =>
                                    updateQAVerification(selectedNode.id, {
                                      proofs: verificationProofs.filter(
                                        (candidate) => candidate.id !== proof.id,
                                      ),
                                    })
                                  }
                                  type="button"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="space-y-2">
                              <button
                                type="button"
                                className="block w-full text-left"
                                onClick={() => setViewerProof(proof)}
                              >
                                <img
                                  src={proof.content}
                                  alt={proof.name}
                                  className="w-full rounded border cursor-zoom-in hover:opacity-95 transition"
                                />
                              </button>

                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() => setViewerProof(proof)}
                                >
                                  View Full Screen
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {payloadProofs.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                          Payload (Trigger Proof)
                        </div>
                        {payloadProofs.map((proof) => (
                          <div
                            key={proof.id}
                            className="border rounded p-3 bg-gray-50 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 break-all">
                                  {proof.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {proof.type.toUpperCase()} •{' '}
                                  {new Date(proof.createdAt).toLocaleString()}
                                </div>
                              </div>

                              {!effectiveReadOnly && (
                                <button
                                  className="text-red-500 hover:text-red-700"
                                  onClick={() =>
                                    updateQAVerification(selectedNode.id, {
                                      proofs: verificationProofs.filter(
                                        (candidate) => candidate.id !== proof.id,
                                      ),
                                    })
                                  }
                                  type="button"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="space-y-2">
                              <pre className="text-xs bg-white border rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">
                                {proof.content}
                              </pre>

                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() => setViewerProof(proof)}
                                >
                                  View Full Screen
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isTriggerNode(selectedNode) && !effectiveReadOnly && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Trigger Proof Payload
                    </div>

                    <label className="inline-flex items-center rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="file"
                        accept=".json,.txt,text/plain,application/json"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (
                            !file ||
                            !selectedNode ||
                            !isTriggerNode(selectedNode)
                          )
                            return;

                          const content = await readFileAsContent(file);

                          let normalizedContent = content;

                          try {
                            const parsed = JSON.parse(content);
                            normalizedContent = JSON.stringify(parsed, null, 2);
                          } catch {
                            // not valid JSON, keep raw text as-is
                          }

                          const newProof = buildTextProof(
                            normalizedContent,
                            file.name || 'Payload',
                          );

                          updateQAVerification(selectedNode.id, {
                            proofs: [...verificationProofs, newProof],
                          });

                          e.target.value = '';
                        }}
                      />
                      <UploadCloud className="w-4 h-4 mr-2" />
                      Upload Payload
                    </label>
                  </div>

                  <textarea
                    className="w-full h-72 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                    placeholder="Paste text or JSON payload here..."
                    value={payloadDraft}
                    onPaste={handleTriggerPayloadPaste}
                    onChange={(e) => setPayloadDraft(e.target.value)}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className=""
                      onClick={handleAddPayload}
                      disabled={!payloadDraft.trim()}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Payload
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleValidatePayload}
                      disabled={isValidatingPayload}
                    >
                      {isValidatingPayload ? (
                        <>
                          <span className="w-4 h-4 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin inline-block mr-2" />
                          Validating...
                        </>
                      ) : (
                        'Validate Payload'
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPayloadDraft('')}
                      disabled={!payloadDraft.trim()}
                    >
                      Clear
                    </Button>
                  </div>

                  {payloadValidationResult && (
                    <div
                      className={`text-xs rounded p-2 ${
                        payloadValidationResult.valid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {payloadValidationResult.valid ? (
                        <span className="font-medium">Payload valid.</span>
                      ) : (
                        <div>
                          <span className="font-medium">Missing or invalid: </span>
                          {payloadValidationResult.missing_keys?.length ? (
                            <ul className="list-disc pl-4 mt-1">
                              {payloadValidationResult.missing_keys.map(
                                (key) => (
                                  <li key={key}>{key}</li>
                                )
                              )}
                            </ul>
                          ) : (
                            <span>Check payload format.</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] text-gray-500">
                    Paste text or JSON here, then click Add Payload. Use Validate
                    Payload to check against event&apos;s always-sent properties.
                  </div>
                </div>
              )}
            </div>
            {!effectiveReadOnly && (
              <div className="shrink-0 border-t bg-white p-4 z-10">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Verification Status
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={
                      currentVerification?.status === 'Passed'
                        ? 'default'
                        : 'outline'
                    }
                    className={
                      currentVerification?.status === 'Passed'
                        ? 'w-full'
                        : 'w-full text-[var(--brand-primary)]'
                    }
                    onClick={() =>
                      updateQAVerification(selectedNode.id, { status: 'Passed' })
                    }
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Pass
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      currentVerification?.status === 'Failed'
                        ? 'destructive'
                        : 'outline'
                    }
                    className={
                      currentVerification?.status === 'Failed'
                        ? 'w-full'
                        : 'w-full text-[var(--brand-destructive)]'
                    }
                    onClick={() =>
                      updateQAVerification(selectedNode.id, { status: 'Failed' })
                    }
                  >
                    <X className="w-4 h-4 mr-2" /> Fail
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

      <JourneyProofViewer proof={viewerProof} onClose={closeViewerProof} />

      <JourneyPendingQAWarnModal
        isOpen={isPendingQAWarnOpen}
        onClose={() => setIsPendingQAWarnOpen(false)}
      />

      {isSaveConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[520px] border border-[var(--border-default)]">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Save QA run</h2>
            <div className="text-sm text-gray-700">
              Save current QA progress for this run?
            </div>
            {qaRunHasPendingSteps && (
              <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                There are steps with pending status. Are you sure you want to proceed?
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsSaveConfirmOpen(false)}
                disabled={isConfirmSavingQA}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setIsConfirmSavingQA(true);
                  await handleSaveQA();
                  setIsConfirmSavingQA(false);
                  setIsSaveConfirmOpen(false);
                }}
                disabled={isConfirmSavingQA}
                className="gap-2"
              >
                {isConfirmSavingQA ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save QA'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isEndConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[560px] border border-[var(--border-default)]">
            <h2 className="text-lg font-bold text-gray-900 mb-3">End QA run</h2>
            <div className="text-sm text-gray-700">
              Ending this QA run is permanent. The QA run will be locked into read-only mode so it can be previewed but not edited.
            </div>
            {qaRunHasPendingSteps && (
              <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                You cannot end this QA run while pending nodes exist.
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEndConfirmOpen(false)}
                disabled={isConfirmEndingQA}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (qaRunHasPendingSteps) return;
                  setIsConfirmEndingQA(true);
                  const endedAt = new Date().toISOString();
                  const saved = await handleSaveQA({ endedAtForActiveRun: endedAt });
                  if (saved) {
                    onEndQA?.(endedAt);
                  }
                  setIsConfirmEndingQA(false);
                  setIsEndConfirmOpen(false);
                }}
                disabled={isConfirmEndingQA || qaRunHasPendingSteps}
                className="gap-2"
              >
                {isConfirmEndingQA ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ending...
                  </>
                ) : (
                  'End QA'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {readOnlyImagePreview && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setReadOnlyImagePreview(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-[92vw] max-h-[92vh] overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-3 right-3 bg-white/90 hover:bg-white border rounded-md px-2 py-1 text-sm"
              onClick={() => setReadOnlyImagePreview(null)}
            >
              Close
            </button>
            <img
              src={readOnlyImagePreview}
              alt="Screenshot preview"
              className="block max-w-[92vw] max-h-[92vh] w-auto h-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}

