import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  Connection,
  Edge,
} from '@xyflow/react';

import { useStore } from '@/src/store';
import type {
  Journey,
  QAProof,
  QARun,
  QAStatus,
  QAVerification,
  TestingProfile,
} from '@/src/types';
import {
  JourneyStepFlowNode,
  TriggerFlowNode,
  NoteFlowNode,
  AnnotationFlowNode,
  JourneyFlowNode,
  JourneyFlowEdge,
  PendingConnection,
  Point,
  isAnnotationNode,
  isJourneyStepNode,
  isTriggerNode,
} from '@/src/features/journeys/nodes/types';
import { readFileAsContent, buildProofFromFile } from '@/src/features/journeys/lib/proofs';

type UseJourneyCanvasArgs = {
  journey: Journey;
  activeQARunId: string | null;
};

export function useJourneyCanvas({
  journey,
  activeQARunId,
}: UseJourneyCanvasArgs) {
  const { updateJourney } = useStore();
  const { screenToFlowPosition } =
    useReactFlow<JourneyFlowNode, JourneyFlowEdge>();

  const [nodes, setNodes, onNodesChange] = useNodesState<JourneyFlowNode>(
    (journey.nodes as JourneyFlowNode[]) || [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<JourneyFlowEdge>(
    (journey.edges as JourneyFlowEdge[]) || [],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<'summary' | 'node'>(
    'summary',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingQA, setIsSavingQA] = useState(false);
  const [saveQASuccess, setSaveQASuccess] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnection | null>(null);

  const [tool, setTool] = useState<'select' | 'annotation'>('select');
  const [annotationColor, setAnnotationColor] = useState('#FACC15');
  const [annotationStart, setAnnotationStart] = useState<Point | null>(null);
  const [draftAnnotationId, setDraftAnnotationId] = useState<string | null>(
    null,
  );
  const [payloadDraft, setPayloadDraft] = useState('');
  const [viewerProof, setViewerProof] = useState<QAProof | null>(null);

  useEffect(() => {
    if (!activeQARunId) {
      const baseNodes = ((journey.nodes as JourneyFlowNode[]) || []).map(
        (node) => ({
          ...node,
          data: {
            ...node.data,
            activeQARunId: null,
            qaVerification: undefined,
          },
        }),
      );

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

    const activeQARun = (journey.qaRuns || []).find(
      (run) => run.id === activeQARunId,
    );
    if (!activeQARun) return;

    const runNodes =
      ((activeQARun.nodes as JourneyFlowNode[]) ||
        (journey.nodes as JourneyFlowNode[]) ||
        []).map((node) => ({
        ...node,
        data: {
          ...node.data,
          activeQARunId,
          qaVerification: activeQARun.verifications?.[node.id],
        },
      }));

    const runEdges =
      (activeQARun.edges as JourneyFlowEdge[]) ||
      (journey.edges as JourneyFlowEdge[]) ||
      [];

    setNodes(runNodes);
    setEdges(runEdges);

    if (!selectedNodeId && runNodes.length > 0) {
      const firstTestableNode = runNodes.find(
        (node) =>
          node.type === 'journeyStepNode' || node.type === 'triggerNode',
      );
      setSelectedNodeId(firstTestableNode?.id || null);
    }
  }, [
    activeQARunId,
    journey.qaRuns,
    journey.nodes,
    journey.edges,
    selectedNodeId,
    setNodes,
    setEdges,
  ]);

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
          existingEdges,
        ),
      );
    },
    [activeQARunId, tool, setEdges],
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
      },
    ) => {
      if (tool === 'annotation') return;

      setPendingConnection({
        nodeId: params.nodeId,
        handleId: params.handleId ?? null,
        handleType: params.handleType ?? null,
      });
    },
    [tool],
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
    [activeQARunId, tool, pendingConnection],
  );

  const handleAddConnectedNode = (type: JourneyFlowNode['type']) => {
    if (!menuPos || !pendingConnection) return;

    const position = screenToFlowPosition({ x: menuPos.x, y: menuPos.y });
    const newNodeId = `${type}-${Date.now()}`;
    const stepCount = nodes.filter(
      (node) => node.type === 'journeyStepNode',
    ).length;

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
        existingEdges,
      ),
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
    const stepCount = nodes.filter(
      (node) => node.type === 'journeyStepNode',
    ).length;

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
          : node,
      ),
    );
  };

  const finishAnnotationDraw = () => {
    if (!draftAnnotationId) return;

    const draftNode = nodes.find((node) => node.id === draftAnnotationId);
    const width = Number(draftNode?.style?.width || 0);
    const height = Number(draftNode?.style?.height || 0);

    if (width < 1 || height < 1) {
      setNodes((existingNodes) =>
        existingNodes.filter((node) => node.id !== draftAnnotationId),
      );
    }

    setAnnotationStart(null);
    setDraftAnnotationId(null);
  };

  const onNodeClick = (_event: React.MouseEvent, node: JourneyFlowNode) => {
    if (tool === 'annotation') return;

    if (
      activeQARunId &&
      (node.type === 'journeyStepNode' || node.type === 'triggerNode')
    ) {
      setSelectedNodeId(node.id);
      setSelectedPanel('node');
    }
  };

  const activeQARun =
    (journey.qaRuns || []).find((run) => run.id === activeQARunId) || null;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const currentVerification =
    activeQARun && selectedNode
      ? activeQARun.verifications?.[selectedNode.id] || null
      : null;

  const updateQARun = (patch: Partial<QARun>) => {
    if (!activeQARunId) return;

    const updatedRuns = (journey.qaRuns || []).map((run) =>
      run.id === activeQARunId ? { ...run, ...patch } : run,
    );

    updateJourney(journey.id, { qaRuns: updatedRuns });
  };

  const updateQAVerification = (
    nodeId: string,
    updates: Partial<QAVerification>,
  ) => {
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
            : candidate,
        ),
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
            : candidate,
        ),
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
      `Payload ${new Date().toLocaleTimeString()}`,
    );

    updateQAVerification(selectedNode.id, {
      proofs: [...verificationProofs, newProof],
    });

    setPayloadDraft('');
  };

  const handleTriggerPayloadPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
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

  const updateExtraNodeProfile = (
    profileId: string,
    patch: Partial<TestingProfile>,
  ) => {
    if (!selectedNode) return;

    updateQAVerification(selectedNode.id, {
      extraTestingProfiles: nodeExtraProfiles.map((profile) =>
        profile.id === profileId ? { ...profile, ...patch } : profile,
      ),
    });
  };

  const removeExtraNodeProfile = (profileId: string) => {
    if (!selectedNode) return;

    updateQAVerification(selectedNode.id, {
      extraTestingProfiles: nodeExtraProfiles.filter(
        (profile) => profile.id !== profileId,
      ),
    });
  };

  const closeViewerProof = () => {
    setViewerProof(null);
  };

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    handleAddConnectedNode,
    handleSaveLayout,
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
    // exposed state
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
    activeQARun,
    selectedNode,
    currentVerification,
    activeVerifications,
    runProfiles,
    nodeLinkedProfileIds,
    nodeExtraProfiles,
    verificationProofs,
    pendingNodeProofs,
  };
}

