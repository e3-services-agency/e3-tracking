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
import {
  CheckCircle2,
  CheckSquare,
  FileText,
  Image as ImageIcon,
  Pencil,
  Plus,
  Save,
  StickyNote,
  Trash2,
  UploadCloud,
  X,
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
}: {
  journey: Journey;
  activeQARunId: string | null;
  readOnly?: boolean;
}) {
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
  } = useJourneyCanvas({ journey, activeQARunId, readOnly });

  return (
    <div className="flex h-full w-full">
      {!activeQARunId && !readOnly && (
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
        {activeQARunId && (
          <div className="absolute top-4 left-4 z-20 bg-white border-2 border-[var(--color-info)]/60 rounded-lg shadow-md p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-gray-900 font-bold">
              <CheckSquare className="w-5 h-5" />
              QA Mode Active
            </div>
            <div className="text-xs text-gray-600">
              Run: {activeQARun?.name}
            </div>
            <div className="flex items-center gap-3 text-xs mt-1">
              <div className="flex items-center gap-1 text-gray-500">
                <span className="font-semibold">
                  {
                    nodes.filter(
                      (node) =>
                        node.type === 'journeyStepNode' ||
                        node.type === 'triggerNode',
                    ).length
                  }
                </span>{' '}
                Nodes
              </div>
              <div className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" />
                <span className="font-semibold">
                  {
                    Object.values(activeVerifications).filter(
                      (verification) => verification.status === 'Passed',
                    ).length
                  }
                </span>
              </div>
              <div className="flex items-center gap-1 text-red-600">
                <X className="w-3 h-3" />
                <span className="font-semibold">
                  {
                    Object.values(activeVerifications).filter(
                      (verification) => verification.status === 'Failed',
                    ).length
                  }
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setSelectedPanel('summary')}
              >
                <FileText className="w-4 h-4" /> QA Summary
              </Button>

              <Button
                size="sm"
                className="gap-2"
                onClick={handleSaveQA}
                disabled={isSavingQA}
              >
                <Save className="w-4 h-4" />
                {isSavingQA
                  ? 'Saving QA...'
                  : saveQASuccess
                  ? 'QA Saved!'
                  : 'Save QA'}
              </Button>
            </div>
          </div>
        )}

        {!activeQARunId && !readOnly && tool === 'annotation' && (
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
          nodesDraggable={!readOnly && !activeQARunId && tool !== 'annotation'}
          nodesConnectable={!readOnly && !activeQARunId && tool !== 'annotation'}
          elementsSelectable={true}
          panOnDrag={tool !== 'annotation' || readOnly}
          selectionOnDrag={!readOnly && tool !== 'annotation'}
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        >
          <Controls />
          <MiniMap
            nodeColor="var(--color-info)"
            maskColor="rgba(249, 250, 251, 0.7)"
          />
          <Background gap={16} size={1} color="var(--border-default)" />
        </ReactFlow>

        {!activeQARunId && !readOnly && (
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

        {menuPos && !readOnly && (
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
          <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[var(--color-info)]" /> QA Run Details
            </h3>
            <button
              onClick={() => setSelectedPanel('summary')}
              className="text-gray-400 hover:text-gray-600"
              type="button"
            >
              <CheckSquare className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-6">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Run Name
                </div>
                <Input
                  value={activeQARun?.name || ''}
                  onChange={(e) => updateQARun({ name: e.target.value })}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Tester
                </div>
                <Input
                  value={activeQARun?.testerName || ''}
                  onChange={(e) =>
                    updateQARun({ testerName: e.target.value })
                  }
                  placeholder="Who performed the QA?"
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
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Testing Profiles
              </div>
              <TestingProfilesEditor
                profiles={runProfiles}
                onChange={(profiles) =>
                  updateQARun({ testingProfiles: profiles })
                }
              />
            </div>
          </div>
        </div>
      )}

      {(activeQARunId || readOnly) &&
        selectedPanel === 'node' &&
        selectedNode &&
        (isJourneyStepNode(selectedNode) || isTriggerNode(selectedNode)) && (
          <div className="w-[420px] border-l bg-white flex flex-col shadow-xl z-20 absolute right-0 top-0 bottom-0">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-[var(--color-info)]" />
                {readOnly ? 'Node Details' : 'QA Verification'}
              </h3>
              <button
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedPanel('summary');
                }}
                className="text-gray-400 hover:text-gray-600"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-6">
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

              {isTriggerNode(selectedNode) &&
                selectedNode.data.connectedEvent?.eventId && (
                  <div className="pt-2 border-t border-gray-200">
                    <EventCodeGen
                      eventId={selectedNode.data.connectedEvent.eventId}
                      compact
                      title="Code Snippets"
                    />
                  </div>
                )}

              {!readOnly && (
              <div>
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
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white w-full'
                        : 'w-full'
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
                        ? 'default'
                        : 'outline'
                    }
                    className={
                      currentVerification?.status === 'Failed'
                        ? 'bg-red-500 hover:bg-red-600 text-white w-full'
                        : 'w-full'
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

              {!readOnly && (
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

              {!readOnly && (
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

              {!readOnly && (
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
                {!readOnly && (
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

                {!readOnly && pendingNodeProofs.length > 0 && (
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

                {verificationProofs.length > 0 && (
                  <div className="space-y-2">
                    {verificationProofs.map((proof) => (
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
                              {new Date(
                                proof.createdAt,
                              ).toLocaleString()}
                            </div>
                          </div>

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
                        </div>

                        {proof.type === 'image' ? (
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
                        ) : (
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
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isTriggerNode(selectedNode) && !readOnly && (
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
          </div>
        )}

      <JourneyProofViewer proof={viewerProof} onClose={closeViewerProof} />
    </div>
  );
}

