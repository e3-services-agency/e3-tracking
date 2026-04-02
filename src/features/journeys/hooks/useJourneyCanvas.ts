import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  saveJourneyCanvasApi,
  saveJourneyQARunsApi,
  validatePayloadApi,
  type ValidatePayloadResult,
} from '@/src/features/journeys/hooks/useJourneysApi';
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
import { uploadJourneyStepImage } from '@/src/features/journeys/lib/journeyImageStorage';
import { SUPABASE_URL } from '@/src/config/env';

type UseJourneyCanvasArgs = {
  journey: Journey;
  /** Authenticated shell: real workspace UUID. Public shared canvas: `null` (no workspace-scoped API calls). */
  workspaceId: string | null;
  activeQARunId: string | null;
  readOnly?: boolean;
};

export function useJourneyCanvas({
  journey,
  workspaceId,
  activeQARunId,
  readOnly = false,
}: UseJourneyCanvasArgs) {
  const { updateJourney, setJourneyCanvasHasUnsavedChanges } = useStore();
  const { screenToFlowPosition } =
    useReactFlow<JourneyFlowNode, JourneyFlowEdge>();

  const baselineNormalizedLayoutRef = useRef<string | null>(null);

  const stableStringify = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value === 'undefined') return '"__undefined__"';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((v) => stableStringify(v)).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  };

  const normalizeNodeForDirty = (n: any): unknown => ({
    id: n?.id,
    type: n?.type,
    position: n?.position ? { x: n.position.x, y: n.position.y } : n?.position,
    data: n?.data,
    style: n?.style,
  });

  const normalizeEdgeForDirty = (e: any): unknown => ({
    id: e?.id,
    source: e?.source,
    target: e?.target,
    sourceHandle: e?.sourceHandle,
    targetHandle: e?.targetHandle,
    type: e?.type,
    animated: e?.animated,
    style: e?.style,
    data: e?.data,
  });

  const normalizeLayoutForDirty = (ns: JourneyFlowNode[], es: JourneyFlowEdge[]): string => {
    const normalizedNodes = [...(ns ?? [])]
      .map((n) => normalizeNodeForDirty(n))
      .sort((a: any, b: any) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
    const normalizedEdges = [...(es ?? [])]
      .map((e) => normalizeEdgeForDirty(e))
      .sort((a: any, b: any) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
    return stableStringify({ nodes: normalizedNodes, edges: normalizedEdges });
  };

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<JourneyFlowNode>(
    (journey.nodes as JourneyFlowNode[]) || [],
  );
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<JourneyFlowEdge>(
    (journey.edges as JourneyFlowEdge[]) || [],
  );

  // Tracks whether the in-memory ReactFlow canvas diverges from the last saved
  // `journey.nodes` / `journey.edges` in the global store.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    setJourneyCanvasHasUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges, setJourneyCanvasHasUnsavedChanges]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<'summary' | 'node' | 'none'>(
    'summary',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingQA, setIsSavingQA] = useState(false);
  const [saveQASuccess, setSaveQASuccess] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnection | null>(null);

  const [tool, setTool] = useState<'select' | 'annotation'>('select');
  const [annotationColor, setAnnotationColor] = useState('var(--annotation-1)');
  const [annotationStart, setAnnotationStart] = useState<Point | null>(null);
  const [draftAnnotationId, setDraftAnnotationId] = useState<string | null>(
    null,
  );
  const [payloadDraft, setPayloadDraft] = useState('');
  const [viewerProof, setViewerProof] = useState<QAProof | null>(null);
  const [payloadValidationResult, setPayloadValidationResult] =
    useState<ValidatePayloadResult | null>(null);
  const [isValidatingPayload, setIsValidatingPayload] = useState(false);

  useEffect(() => {
    if (!activeQARunId) {
      const baseNodes = ((journey.nodes as JourneyFlowNode[]) || []).map(
        (node) => ({
          ...node,
          data: {
            ...node.data,
            journeyId: journey.id,
            workspaceId,
            activeQARunId: null,
            qaVerification: undefined,
            readOnly: readOnly || undefined,
          },
        }),
      );

      setNodes(baseNodes);
      // Clone edges so ReactFlow edits can't mutate the base journey object
      // (prevents stale/zombie state across reloads).
      const baseEdges = ((journey.edges as JourneyFlowEdge[]) || []).map((e) => ({ ...e }));
      baselineNormalizedLayoutRef.current = normalizeLayoutForDirty(baseNodes, baseEdges);
      setEdges(baseEdges);
      setHasUnsavedChanges(false);
      setJourneyCanvasHasUnsavedChanges(false);
      setSelectedNodeId(null);
      setSelectedPanel('summary');
    }
  }, [activeQARunId, journey.id, journey.nodes, journey.edges, readOnly, workspaceId, setNodes, setEdges]);

  const markDirty = useCallback(() => {
    if (activeQARunId) return;
    if (readOnly) return;
    if (!baselineNormalizedLayoutRef.current) return; // avoid marking dirty during hydration
    setJourneyCanvasHasUnsavedChanges(true);
    setHasUnsavedChanges(true);
  }, [activeQARunId, readOnly, setJourneyCanvasHasUnsavedChanges]);

  // Recompute dirty state from a normalized comparison so ReactFlow runtime-only fields
  // (measured/selected/etc) can't cause false positives after hydration.
  useEffect(() => {
    if (activeQARunId) return;
    if (readOnly) return;
    if (!baselineNormalizedLayoutRef.current) return;

    const currentNormalized = normalizeLayoutForDirty(nodes, edges);
    const dirty = currentNormalized !== baselineNormalizedLayoutRef.current;

    setJourneyCanvasHasUnsavedChanges(dirty);
    setHasUnsavedChanges(dirty);
  }, [nodes, edges, activeQARunId, readOnly, setJourneyCanvasHasUnsavedChanges]);

  const onNodesChange = useCallback(
    // ReactFlow will call this on drag/resize/connection-related edits.
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      markDirty();
      onNodesChangeBase(changes);
    },
    [markDirty, onNodesChangeBase],
  );

  const onEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeBase>[0]) => {
      markDirty();
      onEdgesChangeBase(changes);
    },
    [markDirty, onEdgesChangeBase],
  );

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
        []).map((node) => {
        // QA snapshots can miss runtime-enriched trigger fields (connectedEvent/codegenSnippets).
        // Rehydrate from current journey nodes so side-panel codegen works in active QA mode.
        let mergedData = { ...node.data } as any;
        if (node.type === 'triggerNode') {
          const baseTriggerNodes = (journey.nodes as any[]).filter(
            (n) => n?.type === 'triggerNode'
          );
          const snapshotEventId = (node.data as any)?.connectedEvent?.eventId;
          const byNodeId = baseTriggerNodes.find((n) => n?.id === node.id);
          const byEventId =
            typeof snapshotEventId === 'string'
              ? baseTriggerNodes.find(
                  (n) => n?.data?.connectedEvent?.eventId === snapshotEventId
                )
              : null;
          const sourceTrigger = byNodeId ?? byEventId ?? null;

          // Forceful rehydration:
          // The QA snapshot may contain corrupted runtime identifiers for old runs.
          // Always overwrite trigger "event/codegen" fields from the canonical base journey.
          const canonical = sourceTrigger?.data as any | undefined;
          mergedData = {
            ...mergedData,
            connectedEvent: canonical?.connectedEvent ?? null,
            codegenSnippets: canonical?.codegenSnippets,
            eventId: canonical?.eventId,
            eventName: canonical?.eventName,
            notes_markdown: canonical?.notes_markdown ?? mergedData.notes_markdown,
          };
        }

        return {
        ...node,
        data: {
          ...mergedData,
          activeQARunId,
          qaVerification: activeQARun.verifications?.[node.id],
          workspaceId,
          // In QA mode we rebuild node.data from the snapshot, so we must
          // re-apply readOnly; otherwise node components may think they are
          // editable and show upload-proof controls on shared links.
          readOnly: readOnly || undefined,
        },
      };
      });

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
    workspaceId,
    readOnly,
    setNodes,
    setEdges,
  ]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      if (activeQARunId || tool === 'annotation') return;

      markDirty();
      setEdges((existingEdges) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: 'var(--border-default)', strokeWidth: 2 },
            type: 'smoothstep',
          } as JourneyFlowEdge,
          existingEdges,
        ),
      );
    },
    [activeQARunId, tool, setEdges, markDirty],
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
    markDirty();

    const fromNode = nodes.find((n) => n.id === pendingConnection.nodeId) ?? null;
    const fromPos = fromNode?.position ?? null;
    const position = fromPos
      ? { x: fromPos.x + 350, y: fromPos.y }
      : screenToFlowPosition({ x: menuPos.x, y: menuPos.y });
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
            data: { label: `Step ${stepCount + 1}`, description: '', implementationType: 'new' },
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
          style: { stroke: 'var(--border-default)', strokeWidth: 2 },
          type: 'smoothstep',
        },
        existingEdges,
      ),
    );

    setMenuPos(null);
    setPendingConnection(null);
  };

  const handleSaveLayout = async () => {
    const wid = typeof workspaceId === 'string' ? workspaceId.trim() : '';
    if (!wid) {
      setSaveError('No workspace selected — cannot save layout.');
      console.error('handleSaveLayout: missing workspaceId');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    // Migrate any embedded base64 screenshots to Supabase Storage URLs before saving.
    const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const ext = blob.type?.includes('/') ? blob.type.split('/').pop() : 'png';
      return new File([blob], `${filename}.${ext || 'png'}`, { type: blob.type || 'image/png' });
    };

    const base64UrlToUtf8 = (b64url: string): string | null => {
      try {
        const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
        const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64);
        // binary -> utf8
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } catch {
        return null;
      }
    };

    const normalizeLegacyProxyUrl = (imageUrl: string): string | null => {
      // Old format (private proxy): /api/journeys/:id/images/:encodedPath
      const prefix = `/api/journeys/${journey.id}/images/`;
      if (!imageUrl.startsWith(prefix)) return null;
      const encoded = imageUrl.slice(prefix.length);
      const objectPath = base64UrlToUtf8(encoded);
      if (!objectPath || !SUPABASE_URL) return null;
      return `${SUPABASE_URL}/storage/v1/object/public/assets/${objectPath}`;
    };

    let migratedCount = 0;
    const nodesWithUploadedImages = await Promise.all(
      nodes.map(async (n) => {
        if (n?.type !== 'journeyStepNode') return n;
        const imageUrl = (n.data as { imageUrl?: unknown })?.imageUrl;
        if (typeof imageUrl !== 'string' || !imageUrl.trim()) return n;
        const trimmed = imageUrl.trim();

        // Convert legacy proxy URLs to public Storage URLs (so exports/shared view work).
        const normalized = normalizeLegacyProxyUrl(trimmed);
        if (normalized) {
          migratedCount += 1;
          return { ...n, data: { ...n.data, imageUrl: normalized } };
        }

        if (!trimmed.startsWith('data:image/')) return n;
        try {
          const file = await dataUrlToFile(trimmed, `step-${n.id}-${Date.now()}`);
          const result = await uploadJourneyStepImage({
            journeyId: journey.id,
            nodeId: n.id,
            file,
            workspaceId: wid,
          });
          if (!result.success) return n;
          migratedCount += 1;
          return { ...n, data: { ...n.data, imageUrl: result.url } };
        } catch {
          return n;
        }
      })
    );

    const result = await saveJourneyCanvasApi(
      journey.id,
      journey.name,
      nodesWithUploadedImages,
      edges,
      wid
    );
    setIsSaving(false);
    if (result.success) {
      setHasUnsavedChanges(false);
      setJourneyCanvasHasUnsavedChanges(false);
      baselineNormalizedLayoutRef.current = normalizeLayoutForDirty(nodesWithUploadedImages, edges);
      const type_counts = (() => {
        const counts = { new: 0, enrichment: 0, fix: 0 };
        for (const n of nodesWithUploadedImages) {
          if (n?.type !== 'journeyStepNode') continue;
          const t = (n.data as { implementationType?: string })?.implementationType;
          if (t === 'new' || t === 'enrichment' || t === 'fix') counts[t] += 1;
        }
        return counts;
      })();
      updateJourney(journey.id, { nodes: nodesWithUploadedImages, edges, type_counts });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      // Migration of old base64 images is expected; avoid surfacing as an "error" banner.
    } else {
      setSaveError(result.error || 'Save failed');
      console.error('Save layout failed:', result.error);
    }
    // On failure, leave isSaving false; caller can show error if needed
  };

  const handleSaveQA = async (
    opts?: {
      endedAtForActiveRun?: string | null;
    }
  ): Promise<boolean> => {
    if (!activeQARunId) return false;

    const wid = typeof workspaceId === 'string' ? workspaceId.trim() : '';
    if (!wid) {
      console.error('handleSaveQA: missing workspaceId');
      return false;
    }

    setIsSavingQA(true);
    try {
      // Persist full run data (meta + snapshot) so the QA selector can reload
      // existing runs and so "End QA" can be locked across reloads.
      const payloadRuns = (journey.qaRuns ?? []).map((run) => {
        const endedAt =
          opts && 'endedAtForActiveRun' in opts
            ? run.id === activeQARunId
              ? opts.endedAtForActiveRun
              : run.endedAt ?? null
            : run.endedAt ?? null;

        return {
          ...run,
          id: run.id,
          endedAt,
          verifications: run.verifications,
        };
      });

      const result = await saveJourneyQARunsApi(
        journey.id,
        payloadRuns,
        wid,
      );
      if (result.success) {
        setSaveQASuccess(true);
        setTimeout(() => setSaveQASuccess(false), 2000);
        return true;
      }
      console.error('Save QA failed:', result.error);
      return false;
    } finally {
      setIsSavingQA(false);
    }
  };

  const addStepNode = () => {
    markDirty();
    const stepCount = nodes.filter(
      (node) => node.type === 'journeyStepNode',
    ).length;

    const newNode: JourneyStepFlowNode = {
      id: `step-${Date.now()}`,
      type: 'journeyStepNode',
      position: { x: 100, y: 100 },
      data: {
        label: `Step ${stepCount + 1}`,
        description: '',
        implementationType: 'new',
        actionType: 'click',
      },
    };

    setNodes((existingNodes) => existingNodes.concat(newNode));
  };

  const addTriggerNode = () => {
    markDirty();
    const newNode: TriggerFlowNode = {
      id: `trigger-${Date.now()}`,
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: { description: '', connectedEvent: null },
    };

    setNodes((existingNodes) => existingNodes.concat(newNode));
  };

  const addNoteNode = () => {
    markDirty();
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
    markDirty();

    const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
    const newNodeId = `annotation-${Date.now()}`;

    const newNode: AnnotationFlowNode = {
      id: newNodeId,
      type: 'annotationNode',
      position: flowPos,
      style: { width: 1, height: 1, zIndex: 9999 },
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
              style: { ...node.style, width, height, zIndex: 9999 },
            }
          : node,
      ),
    );
  };

  const finishAnnotationDraw = () => {
    if (!draftAnnotationId) return;
    // Node might be removed; still counts as a canvas edit.
    markDirty();

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

    if (node.type !== 'journeyStepNode' && node.type !== 'triggerNode') return;

    if (activeQARunId || readOnly) {
      setSelectedNodeId(node.id);
      setSelectedPanel('node');
      return;
    }

    // Design mode (no active QA run): open the inspector for trigger nodes only —
    // codegen preference + snippets live here; step nodes keep canvas-only selection.
    if (node.type === 'triggerNode') {
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

    const migrateAndUpdate = async (): Promise<void> => {
      const qaWid = typeof workspaceId === 'string' ? workspaceId.trim() : '';
      const node = nodes.find((candidate) => candidate.id === nodeId);
      const pendingProofs = node?.data.pendingProofs || [];

      const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        const ext = blob.type?.includes('/') ? blob.type.split('/').pop() : 'png';
        return new File([blob], `${filename}.${ext || 'png'}`, { type: blob.type || 'image/png' });
      };

      const migratedPendingProofs: QAProof[] = await Promise.all(
        pendingProofs.map(async (p) => {
          if (p.type !== 'image') return p;
          if (typeof p.content !== 'string' || !p.content.startsWith('data:image/')) return p;
          if (!qaWid) return p;
          try {
            const file = await dataUrlToFile(p.content, `qa-proof-${nodeId}-${Date.now()}`);
            const result = await uploadJourneyStepImage({
              journeyId: journey.id,
              nodeId,
              file,
              workspaceId: qaWid,
            });
            if (!result.success) return p;
            return { ...p, content: result.url };
          } catch {
            return p;
          }
        })
      );

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
            : [...(existingVerification.proofs || []), ...migratedPendingProofs];

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

    void migrateAndUpdate();
  };

  const buildTextProof = (
    content: string,
    name = 'Payload',
    validation?: { status: 'pass' | 'fail' | 'unknown'; issues: string[] }
  ): QAProof => ({
    id: `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: 'text',
    content,
    createdAt: new Date().toISOString(),
    ...(validation ? { validation_status: validation.status, validation_issues: validation.issues } : {}),
  });

  const lastValidatedRef = useRef<{
    payloadText: string;
    codegenPreferredStyle: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null;
    result: ValidatePayloadResult;
  } | null>(null);

  const handleAddPayload = async () => {
    if (!selectedNode || !isTriggerNode(selectedNode)) return;
    if (!payloadDraft.trim()) return;

    let normalizedContent = payloadDraft;

    try {
      const parsed = JSON.parse(payloadDraft);
      normalizedContent = JSON.stringify(parsed, null, 2);
    } catch {
      // keep raw text
    }

    // Persist validation evidence alongside this saved payload.
    // Reuse the most recent validation result only if it matches the exact payload text being saved.
    const currentCodegenPreferredStyle = journey.codegen_preferred_style ?? null;
    const currentValidated =
      lastValidatedRef.current &&
      lastValidatedRef.current.payloadText === normalizedContent &&
      lastValidatedRef.current.codegenPreferredStyle === currentCodegenPreferredStyle
        ? lastValidatedRef.current.result
        : null;

    let validationStatus: 'pass' | 'fail' | 'unknown' = 'unknown';
    let validationIssues: string[] = [];

    if (currentValidated) {
      validationStatus = currentValidated.valid ? 'pass' : 'fail';
      validationIssues = currentValidated.valid
        ? []
        : (currentValidated.issues ??
            currentValidated.missing_keys ??
            ['Payload validation failed.']);
    } else {
      const eventId = selectedNode.data.connectedEvent?.eventId;
      const valWid = typeof workspaceId === 'string' ? workspaceId.trim() : '';
      if (!eventId) {
        validationStatus = 'unknown';
        validationIssues = ['Connect an event to this trigger to validate payload.'];
      } else if (!valWid) {
        validationStatus = 'unknown';
        validationIssues = ['Workspace context is required to validate payload against event definitions.'];
      } else {
        const variantId = selectedNode.data.connectedEvent?.variantId;
        const result = await validatePayloadApi(
          journey.id,
          eventId,
          normalizedContent,
          valWid,
          currentCodegenPreferredStyle,
          variantId,
        );
        if (result.success) {
          validationStatus = result.result.valid ? 'pass' : 'fail';
          validationIssues = result.result.valid
            ? []
            : (result.result.issues ??
                result.result.missing_keys ??
                ['Payload validation failed.']);
          lastValidatedRef.current = {
            payloadText: normalizedContent,
            codegenPreferredStyle: currentCodegenPreferredStyle,
            result: result.result,
          };
          setPayloadValidationResult(result.result);
        } else {
          validationStatus = 'unknown';
          validationIssues = ['Validation could not be completed.', ('error' in result ? result.error : 'Validation failed')];
          setPayloadValidationResult({ valid: false, missing_keys: validationIssues });
        }
      }
    }

    const newProof = buildTextProof(
      normalizedContent,
      `Payload ${new Date().toLocaleTimeString()}`,
      { status: validationStatus, issues: validationIssues },
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

  const handleValidatePayload = async () => {
    if (!selectedNode || !isTriggerNode(selectedNode)) return;
    const eventId = selectedNode.data.connectedEvent?.eventId;
    if (!eventId) {
      setPayloadValidationResult({
        valid: false,
        missing_keys: ['Connect an event to this trigger to validate payload.'],
      });
      return;
    }
    const jsonToValidate =
      payloadDraft.trim() || (verificationProofs[0]?.content ?? '{}');
    const valWid = typeof workspaceId === 'string' ? workspaceId.trim() : '';
    if (!valWid) {
      setPayloadValidationResult({
        valid: false,
        missing_keys: ['Workspace context is required to validate payload against event definitions.'],
      });
      return;
    }
    setIsValidatingPayload(true);
    setPayloadValidationResult(null);
    const variantId = selectedNode.data.connectedEvent?.variantId;
    const result = await validatePayloadApi(
      journey.id,
      eventId,
      jsonToValidate,
      valWid,
      journey.codegen_preferred_style ?? null,
      variantId,
    );
    setIsValidatingPayload(false);
    if (result.success) {
      setPayloadValidationResult(result.result);
      lastValidatedRef.current = {
        payloadText: jsonToValidate,
        codegenPreferredStyle: journey.codegen_preferred_style ?? null,
        result: result.result,
      };
    } else {
      const msg = 'error' in result ? result.error : 'Validation failed';
      setPayloadValidationResult({ valid: false, missing_keys: [msg] });
    }
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
    payloadValidationResult,
    isValidatingPayload,
    activeQARun,
    hasUnsavedChanges,
    selectedNode,
    currentVerification,
    activeVerifications,
    runProfiles,
    nodeLinkedProfileIds,
    nodeExtraProfiles,
    verificationProofs,
    pendingNodeProofs,
    readOnly,
  };
}

