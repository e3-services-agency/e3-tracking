import React, { useEffect, useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Plus,
  Trash2,
  Save,
  Image as ImageIcon,
  Zap,
  X,
  CheckSquare,
  AlertTriangle,
  CheckCircle2,
  UploadCloud,
  Search,
  ChevronDown,
  StickyNote,
  Pencil,
  FileText,
} from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Journey, QARun } from '@/src/types';
import { JourneyStartQARunModal } from '@/src/features/journeys/overlays/JourneyStartQARunModal';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';

export function Journeys({
  selectedJourneyId: initialJourneyId,
  onBack,
}: {
  selectedJourneyId: string | null;
  onBack: () => void;
}) {
  const data = useActiveData();
  const { addJourney, updateJourney, deleteJourney } = useStore();

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(
    initialJourneyId || data.journeys[0]?.id || null
  );
  const [activeQARunId, setActiveQARunId] = useState<string | null>(null);
  const [isQAModalOpen, setIsQAModalOpen] = useState(false);
  const [newQARunName, setNewQARunName] = useState('');
  const [newQATesterName, setNewQATesterName] = useState('');
  const [newQAEnvironment, setNewQAEnvironment] = useState('');

  const selectedJourney = data.journeys.find((journey: Journey) => journey.id === selectedJourneyId) || null;

  useEffect(() => {
    if (!selectedJourneyId && data.journeys.length > 0) {
      setSelectedJourneyId(data.journeys[0].id);
      return;
    }

    if (selectedJourneyId && !data.journeys.some((journey: Journey) => journey.id === selectedJourneyId)) {
      setSelectedJourneyId(data.journeys[0]?.id || null);
      setActiveQARunId(null);
    }
  }, [selectedJourneyId, data.journeys]);

  const handleCreateNew = () => {
    const newId = addJourney({
      name: 'New Journey',
      nodes: [],
      edges: [],
      qaRuns: [],
    });

    setSelectedJourneyId(newId);
    setActiveQARunId(null);
  };

  const handleStartQARun = () => {
    if (!selectedJourney || !newQARunName.trim()) return;

    const newRun: QARun = {
      id: `qa-${Date.now()}`,
      name: newQARunName.trim(),
      createdAt: new Date().toISOString(),
      testerName: newQATesterName.trim(),
      environment: newQAEnvironment.trim(),
      overallNotes: '',
      testingProfiles: [],
      nodes: JSON.parse(JSON.stringify(selectedJourney.nodes || [])),
      edges: JSON.parse(JSON.stringify(selectedJourney.edges || [])),
      verifications: {},
    };

    const updatedQaRuns = [...(selectedJourney.qaRuns || []), newRun];
    updateJourney(selectedJourney.id, { qaRuns: updatedQaRuns });

    setActiveQARunId(newRun.id);
    setIsQAModalOpen(false);
    setNewQARunName('');
    setNewQATesterName('');
    setNewQAEnvironment('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-4 border-b bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-gray-500 hover:text-gray-900"
          >
            &larr; Back
          </Button>
          <h1 className="text-xl font-bold text-gray-900">Journeys</h1>

          <div className="flex gap-2 flex-wrap">
            {data.journeys.map((journey: Journey) => (
              <button
                key={journey.id}
                onClick={() => {
                  setSelectedJourneyId(journey.id);
                  setActiveQARunId(null);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedJourneyId === journey.id
                    ? 'bg-blue-50 text-[#3E52FF]'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                type="button"
              >
                {journey.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {selectedJourney && (
            <div className="flex items-center gap-2 mr-4 border-r pr-4">
              <span className="text-sm font-medium text-gray-700">QA Runs</span>
              <select
                className="text-sm border rounded p-1.5 bg-gray-50"
                value={activeQARunId || ''}
                onChange={(e) => setActiveQARunId(e.target.value || null)}
              >
                <option value="">-- Design Mode --</option>
                {(selectedJourney.qaRuns || []).map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.name}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewQARunName(
                    `QA Run - ${new Date().toLocaleDateString()}`,
                  );
                  setIsQAModalOpen(true);
                }}
                className="gap-2"
              >
                <CheckSquare className="w-4 h-4" /> Start QA Run
              </Button>
            </div>
          )}

          {selectedJourney && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const dataStr =
                    'data:text/json;charset=utf-8,' +
                    encodeURIComponent(
                      JSON.stringify(selectedJourney, null, 2),
                    );
                  const downloadAnchorNode =
                    document.createElement('a');
                  downloadAnchorNode.setAttribute('href', dataStr);
                  downloadAnchorNode.setAttribute(
                    'download',
                    `${selectedJourney.name.replace(/\s+/g, '_')}.json`,
                  );
                  document.body.appendChild(downloadAnchorNode);
                  downloadAnchorNode.click();
                  downloadAnchorNode.remove();
                }}
                className="gap-2"
              >
                <Save className="w-4 h-4" /> Export
              </Button>

              <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white border rounded-md shadow-sm hover:bg-gray-50 cursor-pointer transition-colors">
                <Plus className="w-4 h-4" /> Import
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const importedJourney = JSON.parse(
                          event.target?.result as string,
                        ) as Journey;
                        if (
                          importedJourney &&
                          importedJourney.nodes &&
                          importedJourney.edges
                        ) {
                          const createdId = addJourney({
                            ...importedJourney,
                            name: `${
                              importedJourney.name || 'Journey'
                            } (Imported)`,
                            qaRuns: importedJourney.qaRuns || [],
                          });
                          setSelectedJourneyId(createdId);
                          setActiveQARunId(null);
                        } else {
                          alert('Invalid journey JSON format.');
                        }
                      } catch {
                        alert('Error parsing JSON file.');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteJourney(selectedJourney.id);
                  onBack();
                }}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            </>
          )}

          <Button
            onClick={handleCreateNew}
            variant="default"
            size="sm"
            className="gap-2 bg-[#3E52FF] hover:bg-blue-600 text-white"
          >
            <Plus className="w-4 h-4" /> New Journey
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        {selectedJourney ? (
          <ReactFlowProvider>
            <JourneyCanvas
              journey={selectedJourney}
              activeQARunId={activeQARunId}
            />
          </ReactFlowProvider>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select or create a journey to view the canvas.
          </div>
        )}
      </div>

      <JourneyStartQARunModal
        isOpen={isQAModalOpen}
        qaRunName={newQARunName}
        testerName={newQATesterName}
        environment={newQAEnvironment}
        onChangeQARunName={setNewQARunName}
        onChangeTesterName={setNewQATesterName}
        onChangeEnvironment={setNewQAEnvironment}
        onStart={handleStartQARun}
        onClose={() => setIsQAModalOpen(false)}
      />
    </div>
  );
}
  const { screenToFlowPosition } = useReactFlow<JourneyFlowNode, JourneyFlowEdge>();

  const [nodes, setNodes, onNodesChange] = useNodesState<JourneyFlowNode>(
    (journey.nodes as JourneyFlowNode[]) || []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<JourneyFlowEdge>(
    (journey.edges as JourneyFlowEdge[]) || []
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<'summary' | 'node'>('summary');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingQA, setIsSavingQA] = useState(false);
  const [saveQASuccess, setSaveQASuccess] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);

  const [tool, setTool] = useState<'select' | 'annotation'>('select');
  const [annotationColor, setAnnotationColor] = useState('#FACC15');
  const [annotationStart, setAnnotationStart] = useState<Point | null>(null);
  const [draftAnnotationId, setDraftAnnotationId] = useState<string | null>(null);
  const [payloadDraft, setPayloadDraft] = useState('');
  const [viewerProof, setViewerProof] = useState<QAProof | null>(null);

  useEffect(() => {
    if (!activeQARunId) {
      const baseNodes = ((journey.nodes as JourneyFlowNode[]) || []).map((node) => ({
        ...node,
        data: {
          ...node.data,
          activeQARunId: null,
          qaVerification: undefined,
        },
      }));

      setNodes(baseNodes);
      setEdges((journey.edges as JourneyFlowEdge[]) || []);
      setSelectedNodeId(null);
      setSelectedPanel('summary');
    }
  }, [activeQARunId, journey.id, journey.nodes, journey.edges, setNodes, setEdges]);

  useEffect(() => {
    if (!viewerProof) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewerProof(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewerProof]);

  useEffect(() => {
    if (!activeQARunId) return;

    const activeQARun = (journey.qaRuns || []).find((run) => run.id === activeQARunId);
    if (!activeQARun) return;

    const runNodes = ((activeQARun.nodes as JourneyFlowNode[]) || (journey.nodes as JourneyFlowNode[]) || []).map(
      (node) => ({
        ...node,
        data: {
          ...node.data,
          activeQARunId,
          qaVerification: activeQARun.verifications?.[node.id],
        },
      })
    );

    const runEdges = (activeQARun.edges as JourneyFlowEdge[]) || (journey.edges as JourneyFlowEdge[]) || [];

    setNodes(runNodes);
    setEdges(runEdges);

    if (!selectedNodeId && runNodes.length > 0) {
      const firstTestableNode = runNodes.find(
        (node) => node.type === 'journeyStepNode' || node.type === 'triggerNode'
      );
      setSelectedNodeId(firstTestableNode?.id || null);
    }
  }, [activeQARunId, journey.qaRuns, journey.nodes, journey.edges, selectedNodeId, setNodes, setEdges]);

  

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      if (activeQARunId || tool === 'annotation') return;

      setEdges((existingEdges) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#9CA3AF', strokeWidth: 2 },
            type: 'smoothstep',
          } as JourneyFlowEdge,
          existingEdges
        )
      );
    },
    [activeQARunId, tool, setEdges]
  );

  useEffect(() => {
    setPayloadDraft('');
  }, [selectedNodeId, activeQARunId]);

  const onConnectStart = useCallback(
    (
      _event: React.MouseEvent | React.TouchEvent,
      params: {
        nodeId: string;
        handleId?: string | null;
        handleType?: 'source' | 'target' | null;
      }
    ) => {
      if (tool === 'annotation') return;

      setPendingConnection({
        nodeId: params.nodeId,
        handleId: params.handleId ?? null,
        handleType: params.handleType ?? null,
      });
    },
    [tool]
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (activeQARunId || tool === 'annotation' || !pendingConnection) return;

      const target = event.target as HTMLElement | null;
      const droppedOnPane = !!target?.closest('.react-flow__pane');

      if (droppedOnPane && pendingConnection.handleType === 'source') {
        const point = 'touches' in event ? event.changedTouches[0] : event;
        setMenuPos({ x: point.clientX, y: point.clientY });
      } else {
        setPendingConnection(null);
      }
    },
    [activeQARunId, tool, pendingConnection]
  );

  const handleAddConnectedNode = (type: JourneyFlowNode['type']) => {
    if (!menuPos || !pendingConnection) return;

    const position = screenToFlowPosition({ x: menuPos.x, y: menuPos.y });
    const newNodeId = `${type}-${Date.now()}`;
    const stepCount = nodes.filter((node) => node.type === 'journeyStepNode').length;

    const newNode: JourneyFlowNode =
      type === 'journeyStepNode'
        ? {
            id: newNodeId,
            type,
            position,
            data: { label: `Step ${stepCount + 1}`, description: '' },
          }
        : {
            id: newNodeId,
            type: 'triggerNode',
            position,
            data: { description: '', connectedEvent: null },
          };

    setNodes((existingNodes) => existingNodes.concat(newNode));

    setEdges((existingEdges) =>
      addEdge(
        {
          id: `e-${pendingConnection.nodeId}-${newNodeId}`,
          source: pendingConnection.nodeId,
          sourceHandle: pendingConnection.handleId || null,
          target: newNodeId,
          targetHandle: 'left',
          animated: true,
          style: { stroke: '#9CA3AF', strokeWidth: 2 },
          type: 'smoothstep',
        },
        existingEdges
      )
    );

    setMenuPos(null);
    setPendingConnection(null);
  };

  const handleSaveLayout = () => {
    setIsSaving(true);

    setTimeout(() => {
      updateJourney(journey.id, { nodes, edges });
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 300);
  };

  const handleSaveQA = () => {
    if (!activeQARunId) return;

    setIsSavingQA(true);

    setTimeout(() => {
      updateJourney(journey.id, { qaRuns: [...(journey.qaRuns || [])] });
      setIsSavingQA(false);
      setSaveQASuccess(true);
      setTimeout(() => setSaveQASuccess(false), 2000);
    }, 300);
  };

  const addStepNode = () => {
    const stepCount = nodes.filter((node) => node.type === 'journeyStepNode').length;

    const newNode: JourneyStepFlowNode = {
      id: `step-${Date.now()}`,
      type: 'journeyStepNode',
      position: { x: 100, y: 100 },
      data: { label: `Step ${stepCount + 1}`, description: '' },
    };

    setNodes((existingNodes) => existingNodes.concat(newNode));
  };

  const addTriggerNode = () => {
    const newNode: TriggerFlowNode = {
      id: `trigger-${Date.now()}`,
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: { description: '', connectedEvent: null },
    };

    setNodes((existingNodes) => existingNodes.concat(newNode));
  };

  const addNoteNode = () => {
    const newNode: NoteFlowNode = {
      id: `note-${Date.now()}`,
      type: 'noteNode',
      position: { x: 200, y: 50 },
      data: { text: '' },
    };

    setNodes((existingNodes) => existingNodes.concat(newNode));
  };

  const beginAnnotationDraw = (clientX: number, clientY: number) => {
    if (activeQARunId) return;

    const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
    const newNodeId = `annotation-${Date.now()}`;

    const newNode: AnnotationFlowNode = {
      id: newNodeId,
      type: 'annotationNode',
      position: flowPos,
      style: { width: 1, height: 1 },
      data: { color: annotationColor },
    };

    setAnnotationStart(flowPos);
    setDraftAnnotationId(newNodeId);
    setNodes((existingNodes) => existingNodes.concat(newNode));
  };

  const updateAnnotationDraw = (clientX: number, clientY: number) => {
    if (!annotationStart || !draftAnnotationId) return;

    const currentPos = screenToFlowPosition({ x: clientX, y: clientY });
    const x = Math.min(annotationStart.x, currentPos.x);
    const y = Math.min(annotationStart.y, currentPos.y);
    const width = Math.max(1, Math.abs(currentPos.x - annotationStart.x));
    const height = Math.max(1, Math.abs(currentPos.y - annotationStart.y));

    setNodes((existingNodes) =>
      existingNodes.map((node) =>
        node.id === draftAnnotationId && isAnnotationNode(node)
          ? {
              ...node,
              position: { x, y },
              style: { ...node.style, width, height },
            }
          : node
      )
    );
  };

  const finishAnnotationDraw = () => {
    if (!draftAnnotationId) return;

    const draftNode = nodes.find((node) => node.id === draftAnnotationId);
    const width = Number(draftNode?.style?.width || 0);
    const height = Number(draftNode?.style?.height || 0);

    if (width < 1 || height < 1) {
      setNodes((existingNodes) => existingNodes.filter((node) => node.id !== draftAnnotationId));
    }

    setAnnotationStart(null);
    setDraftAnnotationId(null);
  };

  const onNodeClick = (_event: React.MouseEvent, node: JourneyFlowNode) => {
    if (tool === 'annotation') return;

    if (activeQARunId && (node.type === 'journeyStepNode' || node.type === 'triggerNode')) {
      setSelectedNodeId(node.id);
      setSelectedPanel('node');
    }
  };

  const activeQARun = (journey.qaRuns || []).find((run) => run.id === activeQARunId) || null;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const currentVerification =
    activeQARun && selectedNode ? activeQARun.verifications?.[selectedNode.id] || null : null;

  const updateQARun = (patch: Partial<QARun>) => {
    if (!activeQARunId) return;

    const updatedRuns = (journey.qaRuns || []).map((run) =>
      run.id === activeQARunId ? { ...run, ...patch } : run
    );

    updateJourney(journey.id, { qaRuns: updatedRuns });
  };

  const updateQAVerification = (nodeId: string, updates: Partial<QAVerification>) => {
    if (!activeQARunId) return;

    const node = nodes.find((candidate) => candidate.id === nodeId);
    const pendingProofs = node?.data.pendingProofs || [];

    const updatedRuns = (journey.qaRuns || []).map((run) => {
      if (run.id !== activeQARunId) return run;

      const existingVerification: QAVerification =
        run.verifications?.[nodeId] || {
          nodeId,
          status: 'Pending',
          proofs: [],
        };

      const nextProofs =
        updates.proofs !== undefined
          ? updates.proofs
          : [...(existingVerification.proofs || []), ...pendingProofs];

      return {
        ...run,
        verifications: {
          ...(run.verifications || {}),
          [nodeId]: {
            ...existingVerification,
            ...updates,
            proofs: nextProofs,
          },
        },
      };
    });

    updateJourney(journey.id, { qaRuns: updatedRuns });

    if (pendingProofs.length > 0 && updates.proofs === undefined) {
      setNodes((existingNodes) =>
        existingNodes.map((candidate) =>
          candidate.id === nodeId
            ? {
                ...candidate,
                data: {
                  ...candidate.data,
                  pendingProofs: [],
                  qaVerification: {
                    ...(candidate.data.qaVerification || {
                      nodeId,
                      status: 'Pending' as QAStatus,
                    }),
                    ...updates,
                  },
                },
              }
            : candidate
        )
      );
    } else {
      setNodes((existingNodes) =>
        existingNodes.map((candidate) =>
          candidate.id === nodeId
            ? {
                ...candidate,
                data: {
                  ...candidate.data,
                  qaVerification: {
                    ...(candidate.data.qaVerification || {
                      nodeId,
                      status: 'Pending' as QAStatus,
                    }),
                    ...updates,
                  },
                },
              }
            : candidate
        )
      );
    }
  };

  const buildTextProof = (content: string, name = 'Payload'): QAProof => ({
    id: `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: 'text',
    content,
    createdAt: new Date().toISOString(),
  });

  const handleAddPayload = () => {
    if (!selectedNode || !isTriggerNode(selectedNode)) return;
    if (!payloadDraft.trim()) return;

    let normalizedContent = payloadDraft;

    try {
      const parsed = JSON.parse(payloadDraft);
      normalizedContent = JSON.stringify(parsed, null, 2);
    } catch {
      // keep raw text
    }

    const newProof = buildTextProof(
      normalizedContent,
      `Payload ${new Date().toLocaleTimeString()}`
    );

    updateQAVerification(selectedNode.id, {
      proofs: [...verificationProofs, newProof],
    });

    setPayloadDraft('');
  };

  const handleTriggerPayloadPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!selectedNode || !isTriggerNode(selectedNode)) return;

    const pastedText = e.clipboardData.getData('text/plain');
    if (!pastedText) return;

    let normalizedText = pastedText;

    try {
      const parsed = JSON.parse(pastedText);
      normalizedText = JSON.stringify(parsed, null, 2);
    } catch {
      // not valid JSON, keep raw text as-is
    }

    setPayloadDraft(normalizedText);
    e.preventDefault();
  };

  const activeVerifications = activeQARun?.verifications || {};
  const runProfiles = activeQARun?.testingProfiles || [];
  const nodeLinkedProfileIds = currentVerification?.testingProfileIds || [];
  const nodeExtraProfiles = currentVerification?.extraTestingProfiles || [];
  const verificationProofs = currentVerification?.proofs || [];
  const pendingNodeProofs = selectedNode?.data.pendingProofs || [];

  const updateNodeLinkedProfiles = (profileId: string, checked: boolean) => {
    if (!selectedNode) return;

    const nextProfileIds = checked
      ? Array.from(new Set([...nodeLinkedProfileIds, profileId]))
      : nodeLinkedProfileIds.filter((id) => id !== profileId);

    updateQAVerification(selectedNode.id, {
      testingProfileIds: nextProfileIds,
    });
  };

  const addExtraNodeProfile = () => {
    if (!selectedNode) return;

    updateQAVerification(selectedNode.id, {
      extraTestingProfiles: [
        ...nodeExtraProfiles,
        { id: `extra-profile-${Date.now()}`, label: '', url: '', note: '' },
      ],
    });
  };

  const updateExtraNodeProfile = (profileId: string, patch: Partial<TestingProfile>) => {
    if (!selectedNode) return;

    updateQAVerification(selectedNode.id, {
      extraTestingProfiles: nodeExtraProfiles.map((profile) =>
        profile.id === profileId ? { ...profile, ...patch } : profile
      ),
    });
  };

  const removeExtraNodeProfile = (profileId: string) => {
    if (!selectedNode) return;

    updateQAVerification(selectedNode.id, {
      extraTestingProfiles: nodeExtraProfiles.filter((profile) => profile.id !== profileId),
    });
  };

  return (
    <div className="flex h-full w-full">
      {!activeQARunId && (
        <div className="w-64 border-r bg-gray-50 flex flex-col p-4 space-y-6">
          <div>
            <h3 className="font-semibold text-sm text-gray-900">Journey Nodes</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">Add nodes to build your tracking journey.</p>
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
            <h3 className="font-semibold text-sm text-gray-900">Annotations</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">Add global notes and draw highlight annotations.</p>

            <div className="flex flex-col gap-2">
              <button
                onClick={addNoteNode}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-yellow-50 border border-yellow-200 rounded shadow-sm hover:border-yellow-400 transition-colors text-left text-yellow-900"
                type="button"
              >
                <StickyNote className="w-4 h-4 text-yellow-600" />
                <span className="font-medium">Add Sticky Note</span>
              </button>

              <button
                onClick={() => setTool((currentTool) => (currentTool === 'annotation' ? 'select' : 'annotation'))}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded shadow-sm transition-colors text-left ${
                  tool === 'annotation'
                    ? 'bg-blue-600 text-white border border-blue-600'
                    : 'bg-blue-50 border border-blue-200 hover:border-blue-400 text-blue-900'
                }`}
                type="button"
              >
                <Pencil className="w-4 h-4" />
                <span className="font-medium">
                  {tool === 'annotation' ? 'Rectangle Annotation Active' : 'Draw Rectangle Annotation'}
                </span>
              </button>

              <div className="flex items-center gap-2 pt-1">
                {['#FACC15', '#60A5FA', '#F87171', '#34D399', '#C084FC'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setAnnotationColor(color)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      annotationColor === color ? 'border-gray-900 scale-110' : 'border-white'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h4 className="text-sm font-semibold text-blue-900 mb-1">Tips</h4>
            <ul className="text-xs text-blue-800 space-y-2 list-disc pl-4">
              <li>Use the <strong>+</strong> button next to node handles to instantly build flows.</li>
              <li>Select a node or edge and press <strong>Backspace</strong> to delete.</li>
              <li>
                Turn on <strong>Rectangle Annotation</strong>, choose a color, and drag anywhere on the canvas.
              </li>
            </ul>
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        {activeQARunId && (
          <div className="absolute top-4 left-4 z-20 bg-white border-2 border-blue-400 rounded-lg shadow-md p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-blue-700 font-bold">
              <CheckSquare className="w-5 h-5" />
              QA Mode Active
            </div>
            <div className="text-xs text-gray-600">Run: {activeQARun?.name}</div>
            <div className="flex items-center gap-3 text-xs mt-1">
              <div className="flex items-center gap-1 text-gray-500">
                <span className="font-semibold">
                  {nodes.filter((node) => node.type === 'journeyStepNode' || node.type === 'triggerNode').length}
                </span>{' '}
                Nodes
              </div>
              <div className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" />
                <span className="font-semibold">
                  {Object.values(activeVerifications).filter((verification) => verification.status === 'Passed').length}
                </span>
              </div>
              <div className="flex items-center gap-1 text-red-600">
                <X className="w-3 h-3" />
                <span className="font-semibold">
                  {Object.values(activeVerifications).filter((verification) => verification.status === 'Failed').length}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setSelectedPanel('summary')}>
                <FileText className="w-4 h-4" /> QA Summary
              </Button>

              <Button
                size="sm"
                className="gap-2 bg-[#3E52FF] hover:bg-blue-600 text-white"
                onClick={handleSaveQA}
                disabled={isSavingQA}
              >
                <Save className="w-4 h-4" />
                {isSavingQA ? 'Saving QA...' : saveQASuccess ? 'QA Saved!' : 'Save QA'}
              </Button>
            </div>
          </div>
        )}

        {!activeQARunId && tool === 'annotation' && (
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
          className="bg-[#F9FAFB]"
          nodesDraggable={!activeQARunId && tool !== 'annotation'}
          nodesConnectable={!activeQARunId && tool !== 'annotation'}
          elementsSelectable={tool !== 'annotation'}
          panOnDrag={tool !== 'annotation'}
          selectionOnDrag={tool !== 'annotation'}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Controls />
          <MiniMap nodeColor="#3E52FF" maskColor="rgba(249, 250, 251, 0.7)" />
          <Background gap={16} size={1} color="#E5E7EB" />
        </ReactFlow>

        {!activeQARunId && (
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
          </div>
        )}

        {menuPos && (
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
              <FileText className="w-5 h-5 text-[#3E52FF]" /> QA Run Details
            </h3>
            <button onClick={() => setSelectedPanel('summary')} className="text-gray-400 hover:text-gray-600" type="button">
              <CheckSquare className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-6">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Run Name</div>
                <Input
                  value={activeQARun?.name || ''}
                  onChange={(e) => updateQARun({ name: e.target.value })}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tester</div>
                <Input
                  value={activeQARun?.testerName || ''}
                  onChange={(e) => updateQARun({ testerName: e.target.value })}
                  placeholder="Who performed the QA?"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Environment</div>
                <Input
                  value={activeQARun?.environment || ''}
                  onChange={(e) => updateQARun({ environment: e.target.value })}
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
                onChange={(e) => updateQARun({ overallNotes: e.target.value })}
                placeholder="Add overall run notes, blockers, conclusions, or final recommendation..."
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Testing Profiles
              </div>
              <TestingProfilesEditor
                profiles={runProfiles}
                onChange={(profiles) => updateQARun({ testingProfiles: profiles })}
              />
            </div>
          </div>
        </div>
      )}

      {activeQARunId &&
        selectedPanel === 'node' &&
        selectedNode &&
        (isJourneyStepNode(selectedNode) || isTriggerNode(selectedNode)) && (
          <div className="w-[420px] border-l bg-white flex flex-col shadow-xl z-20 absolute right-0 top-0 bottom-0">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-[#3E52FF]" /> QA Verification
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
                    {isJourneyStepNode(selectedNode) ? selectedNode.data.label : 'Trigger Node'}
                  </div>
                  {isTriggerNode(selectedNode) && selectedNode.data.connectedEvent && (
                    <div className="text-gray-600">Event: {selectedNode.data.connectedEvent.name}</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Verification Status
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={currentVerification?.status === 'Passed' ? 'default' : 'outline'}
                    className={
                      currentVerification?.status === 'Passed'
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white w-full'
                        : 'w-full'
                    }
                    onClick={() => updateQAVerification(selectedNode.id, { status: 'Passed' })}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Pass
                  </Button>
                  <Button
                    size="sm"
                    variant={currentVerification?.status === 'Failed' ? 'default' : 'outline'}
                    className={
                      currentVerification?.status === 'Failed'
                        ? 'bg-red-500 hover:bg-red-600 text-white w-full'
                        : 'w-full'
                    }
                    onClick={() => updateQAVerification(selectedNode.id, { status: 'Failed' })}
                  >
                    <X className="w-4 h-4 mr-2" /> Fail
                  </Button>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">QA Notes</div>
                <textarea
                  className="w-full h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Add notes about the test execution..."
                  value={currentVerification?.notes || ''}
                  onChange={(e) => updateQAVerification(selectedNode.id, { notes: e.target.value })}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Linked Testing Profiles
                </div>
                <div className="space-y-2">
                  {runProfiles.length === 0 && (
                    <div className="text-xs text-gray-500 bg-gray-50 border rounded p-3">
                      No run-level testing profiles added yet. Add them in QA Run Details.
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
                        onChange={(e) => updateNodeLinkedProfiles(profile.id, e.target.checked)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{profile.label || 'Untitled profile'}</div>
                        <div className="text-xs text-blue-700 break-all">{profile.url}</div>
                        {profile.note && <div className="text-xs text-gray-500 mt-1">{profile.note}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Step-Specific Extra Testing Profiles
                  </div>
                  <Button size="sm" variant="outline" onClick={addExtraNodeProfile}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>

                <div className="space-y-3">
                  {nodeExtraProfiles.map((profile) => (
                    <div key={profile.id} className="border rounded-lg p-3 bg-gray-50 space-y-2">
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
                        onChange={(e) => updateExtraNodeProfile(profile.id, { label: e.target.value })}
                        placeholder="Profile label"
                      />
                      <Input
                        value={profile.url}
                        onChange={(e) => updateExtraNodeProfile(profile.id, { url: e.target.value })}
                        placeholder="Bloomreach profile URL"
                      />
                      <textarea
                        value={profile.note || ''}
                        onChange={(e) => updateExtraNodeProfile(profile.id, { note: e.target.value })}
                        placeholder="Optional note"
                        className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
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

                        const newProofs = await Promise.all(files.map(buildProofFromFile));

                        setNodes((existingNodes) =>
                          existingNodes.map((node) =>
                            node.id === selectedNode.id
                              ? {
                                  ...node,
                                  data: {
                                    ...node.data,
                                    pendingProofs: [...(node.data.pendingProofs || []), ...newProofs],
                                  },
                                }
                              : node
                          )
                        );

                        e.target.value = '';
                      }}
                    />
                    <Button size="sm" variant="outline" type="button">
                      <UploadCloud className="w-4 h-4 mr-2" /> Upload
                    </Button>
                  </label>
                </div>

                {pendingNodeProofs.length > 0 && (
                  <div className="border border-blue-200 bg-blue-50 rounded p-3 space-y-2">
                    <div className="text-xs font-medium text-blue-900">
                      Pending uploads ({pendingNodeProofs.length})
                    </div>

                    {pendingNodeProofs.map((proof) => (
                      <div key={proof.id} className="flex items-center justify-between text-xs bg-white border rounded p-2">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{proof.name}</div>
                          <div className="text-gray-500">{proof.type.toUpperCase()}</div>
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
                                        pendingProofs: (node.data.pendingProofs || []).filter(
                                          (candidate) => candidate.id !== proof.id
                                        ),
                                      },
                                    }
                                  : node
                              )
                            )
                          }
                          type="button"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    <Button
                      className="w-full bg-[#3E52FF] hover:bg-blue-600 text-white"
                      onClick={() => updateQAVerification(selectedNode.id, {})}
                    >
                      Save Pending Proofs
                    </Button>
                  </div>
                )}

                {verificationProofs.length > 0 && (
                  <div className="space-y-2">
                    {verificationProofs.map((proof) => (
                      <div key={proof.id} className="border rounded p-3 bg-gray-50 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 break-all">{proof.name}</div>
                            <div className="text-xs text-gray-500">
                              {proof.type.toUpperCase()} • {new Date(proof.createdAt).toLocaleString()}
                            </div>
                          </div>

                          <button
                            className="text-red-500 hover:text-red-700"
                            onClick={() =>
                              updateQAVerification(selectedNode.id, {
                                proofs: verificationProofs.filter((candidate) => candidate.id !== proof.id),
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

              {isTriggerNode(selectedNode) && (
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
                          if (!file || !selectedNode || !isTriggerNode(selectedNode)) return;

                          const content = await readFileAsContent(file);

                          let normalizedContent = content;

                          try {
                            const parsed = JSON.parse(content);
                            normalizedContent = JSON.stringify(parsed, null, 2);
                          } catch {
                            // not valid JSON, keep raw text as-is
                          }

                          const newProof = buildTextProof(normalizedContent, file.name || 'Payload');

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

                                    <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[#3E52FF] hover:bg-blue-600 text-white"
                      onClick={handleAddPayload}
                      disabled={!payloadDraft.trim()}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Payload
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

                  <div className="text-[11px] text-gray-500">
                    Paste text or JSON here, then click Add Payload.
                    Uploaded or added payloads appear below in Proof Files and can be removed later.
                  </div>
                </div>
              )}              
            </div>
          </div>
        )}
        <JourneyProofViewer proof={viewerProof} onClose={() => setViewerProof(null)} />
    </div>
  );
}