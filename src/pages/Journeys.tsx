import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  Check,
  Trash2,
  Save,
  CheckSquare,
  FileText,
  Share2,
  Upload,
  Loader2,
  PenTool,
  Lock,
  LockOpen,
  ChevronDown,
} from 'lucide-react';
import {
  updateJourneyTestingInstructionsApi,
  updateJourneyCodegenPreferredStyleApi,
  updateJourneyStepOrderApi,
  downloadJourneyHtmlExportApi,
  useActiveWorkspaceId,
  renameJourneyApi,
  setJourneyShareEnabledApi,
  deleteJourneyApi,
  getJourneyQARunsApi,
} from '@/src/features/journeys/hooks/useJourneysApi';
import { MoreHorizontal } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Journey, QARun } from '@/src/types';
import { JourneyStartQARunModal } from '@/src/features/journeys/overlays/JourneyStartQARunModal';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';
import { useJourneys } from '@/src/features/journeys/hooks/useJourneys';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE, buildAppPageUrl } from '@/src/config/env';
import { computeQARunStatusForRun, formatQARunName, getQARunDisplayName } from '@/src/features/journeys/lib/qaRunUtils';

export function Journeys({
  selectedJourneyId: initialJourneyId,
  onBack,
}: {
  selectedJourneyId: string | null;
  onBack: () => void;
}) {
  const data = useActiveData();
  const { addJourney, updateJourney, deleteJourney } = useStore();
  const journeyCanvasHasUnsavedChanges = useStore(
    (s) => s.journeyCanvasHasUnsavedChanges,
  );
  const activeWorkspaceId = useActiveWorkspaceId();
  const { user } = useAuth();
  useJourneys();

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(
    initialJourneyId || data.journeys[0]?.id || null,
  );
  const [activeQARunId, setActiveQARunId] = useState<string | null>(null);
  const [isBriefPreview, setIsBriefPreview] = useState(false);
  const [isQAModalOpen, setIsQAModalOpen] = useState(false);
  const [newQARunName, setNewQARunName] = useState('');
  const [newQATesterName, setNewQATesterName] = useState('');
  const [newQAEnvironment, setNewQAEnvironment] = useState('');
  const [testingInstructionsDraft, setTestingInstructionsDraft] = useState('');
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [instructionsSaveSuccess, setInstructionsSaveSuccess] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
  const [isTogglingShare, setIsTogglingShare] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const [lockedQARunIds, setLockedQARunIds] = useState<string[]>([]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saveLayoutState, setSaveLayoutState] = useState<{
    save: () => void;
    isSaving: boolean;
    saveSuccess: boolean;
    saveError: string | null;
  } | null>(null);

  const selectedJourney =
    data.journeys.find((journey: Journey) => journey.id === selectedJourneyId) ||
    null;
  const isSelectedJourneyReady = selectedJourneyId
    ? data.journeys.some((journey: Journey) => journey.id === selectedJourneyId)
    : false;

  const activeQARun = selectedJourney?.qaRuns?.find((run) => run.id === activeQARunId) ?? null;
  const qaLocked = !!activeQARunId && (lockedQARunIds.includes(activeQARunId) || !!activeQARun?.endedAt);

  useEffect(() => {
    if (!selectedJourney || !activeQARunId) return;
    if (!user?.email) return;
    if (activeQARun?.testerName && activeQARun.testerName.trim()) return;

    const nextRuns = (selectedJourney.qaRuns || []).map((run) =>
      run.id === activeQARunId ? { ...run, testerName: user.email } : run
    );
    updateJourney(selectedJourney.id, { qaRuns: nextRuns });
  }, [selectedJourney, activeQARunId, activeQARun?.testerName, user?.email, updateJourney]);

  useEffect(() => {
    if (selectedJourney) {
      setTestingInstructionsDraft(
        selectedJourney.testing_instructions_markdown ?? '',
      );
      setNameDraft(selectedJourney.name ?? '');
      setRenameError(null);
      setIsRenaming(false);
    }
  }, [selectedJourney?.id, selectedJourney?.testing_instructions_markdown]);

  useEffect(() => {
    if (!selectedJourneyId && data.journeys.length > 0) {
      setSelectedJourneyId(data.journeys[0].id);
      return;
    }

    if (
      selectedJourneyId &&
      !data.journeys.some(
        (journey: Journey) => journey.id === selectedJourneyId,
      )
    ) {
      setSelectedJourneyId(data.journeys[0]?.id || null);
      setActiveQARunId(null);
      setIsBriefPreview(false);
    }
  }, [selectedJourneyId, data.journeys]);

  // Load persisted QA runs so they appear in the selector after reload.
  useEffect(() => {
    if (!selectedJourneyId) return;
    // Prevent race with workspace resolution: only fetch QA runs once the
    // selected journey is actually present in the currently loaded workspace.
    if (!isSelectedJourneyReady) return;

    let cancelled = false;
    void (async () => {
      const result = await getJourneyQARunsApi(selectedJourneyId, activeWorkspaceId);
      if (cancelled) return;
      if (!result.success) return;
      updateJourney(selectedJourneyId, { qaRuns: result.qaRuns });
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedJourneyId, activeWorkspaceId, isSelectedJourneyReady, updateJourney]);

  // Creating journeys should happen from the Journeys list, not from inside the canvas view.

  const handleStartQARun = () => {
    if (!selectedJourney || !newQARunName.trim()) return;

    const newRun: QARun = {
      id: uuidv4(),
      name: newQARunName.trim(),
      createdAt: new Date().toISOString(),
      testerName: newQATesterName.trim(),
      overallNotes: '',
      testingProfiles: [],
      nodes: JSON.parse(JSON.stringify(selectedJourney.nodes || [])),
      edges: JSON.parse(JSON.stringify(selectedJourney.edges || [])),
      verifications: {},
      endedAt: null,
    };

    const updatedQaRuns = [...(selectedJourney.qaRuns || []), newRun];
    updateJourney(selectedJourney.id, { qaRuns: updatedQaRuns });

    setActiveQARunId(newRun.id);
    setIsQAModalOpen(false);
    setNewQARunName('');
    setNewQATesterName('');
    setNewQAEnvironment('');
  };

  const handleEndQA = (endedAt: string) => {
    if (!activeQARunId) return;
    if (selectedJourney) {
      const nextRuns = (selectedJourney.qaRuns || []).map((run) =>
        run.id === activeQARunId ? { ...run, endedAt } : run
      );
      updateJourney(selectedJourney.id, { qaRuns: nextRuns });
    }
    setLockedQARunIds((prev) =>
      prev.includes(activeQARunId) ? prev : [...prev, activeQARunId],
    );
  };

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = moreMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsMoreMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!isModeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = modeMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isModeMenuOpen]);

  const journeyOptions = useMemo(
    () => data.journeys,
    [data.journeys],
  );
  const sortedQARuns = useMemo(() => {
    const runs = selectedJourney?.qaRuns || [];
    return [...runs].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [selectedJourney?.qaRuns]);

  const commitRename = async () => {
    if (!selectedJourney) return;
    const next = nameDraft.trim();
    if (!next || next === selectedJourney.name) {
      setNameDraft(selectedJourney.name);
      setIsRenaming(false);
      setRenameError(null);
      return;
    }
    // Optimistic UI update for responsiveness.
    updateJourney(selectedJourney.id, { name: next });
    const result = await renameJourneyApi(selectedJourney.id, next, activeWorkspaceId);
    if (!result.success) {
      // Revert and show error.
      updateJourney(selectedJourney.id, { name: selectedJourney.name });
      setNameDraft(selectedJourney.name);
      setRenameError(result.error);
    } else {
      setRenameError(null);
    }
    setIsRenaming(false);
  };

  const handleSaveTestingInstructions = async () => {
    if (!selectedJourney) return;
    setIsSavingInstructions(true);
    setInstructionsSaveSuccess(false);
    const result = await updateJourneyTestingInstructionsApi(
      selectedJourney.id,
      testingInstructionsDraft || null,
      activeWorkspaceId,
    );
    setIsSavingInstructions(false);
    if (result.success) {
      updateJourney(selectedJourney.id, {
        testing_instructions_markdown: testingInstructionsDraft || null,
      });
      setInstructionsSaveSuccess(true);
      setTimeout(() => setInstructionsSaveSuccess(false), 2000);
    }
  };

  const handleChangeCodegenPreferredStyle = async (
    style: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi'
  ) => {
    if (!selectedJourney) return;
    const previousStyle = selectedJourney.codegen_preferred_style ?? null;
    updateJourney(selectedJourney.id, { codegen_preferred_style: style });
    const result = await updateJourneyCodegenPreferredStyleApi(
      selectedJourney.id,
      style,
      activeWorkspaceId
    );
    if (!result.success) {
      updateJourney(selectedJourney.id, { codegen_preferred_style: previousStyle });
    }
  };

  const shareUrlById = selectedJourney
    ? buildAppPageUrl(`share/journey/${selectedJourney.id}`)
    : '';

  const JourneyBriefPreview = ({ journeyId }: { journeyId: string }) => {
    const [html, setHtml] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [refreshNonce, setRefreshNonce] = React.useState(0);
    const [isSavingOrder, setIsSavingOrder] = React.useState(false);
    const [orderError, setOrderError] = React.useState<string | null>(null);
    const dragFromIndexRef = React.useRef<number | null>(null);
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

    const stepNodes = React.useMemo(() => {
      const nodes = (selectedJourney?.nodes ?? []) as any[];
      return nodes.filter((n) => n?.type === 'journeyStepNode' && typeof n?.id === 'string');
    }, [selectedJourney?.nodes]);

    const triggersCountByStepId = React.useMemo(() => {
      const nodes = (selectedJourney?.nodes ?? []) as any[];
      const edges = (selectedJourney?.edges ?? []) as any[];
      const triggersById = new Set(
        nodes.filter((n) => n?.type === 'triggerNode' && typeof n?.id === 'string').map((n) => String(n.id))
      );
      const out = new Map<string, number>();
      for (const e of edges) {
        const source = typeof e?.source === 'string' ? e.source : '';
        const target = typeof e?.target === 'string' ? e.target : '';
        if (!source || !target) continue;
        if (!triggersById.has(target)) continue;
        out.set(source, (out.get(source) ?? 0) + 1);
      }
      return out;
    }, [selectedJourney?.nodes, selectedJourney?.edges]);

    const orderedSteps = React.useMemo(() => {
      const byId = new Map(stepNodes.map((n: any) => [String(n.id), n]));
      const out: Array<{ id: string; label: string; triggersCount: number }> = [];
      const seen = new Set<string>();
      const ids = Array.isArray(selectedJourney?.step_order)
        ? (selectedJourney?.step_order ?? [])
            .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
            .map((s) => s.trim())
        : [];
      for (const id of ids) {
        const node = byId.get(id);
        if (!node || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          label: typeof node?.data?.label === 'string' ? node.data.label : 'Step',
          triggersCount: triggersCountByStepId.get(id) ?? 0,
        });
      }
      for (const node of stepNodes) {
        const id = String((node as any).id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          label: typeof (node as any)?.data?.label === 'string' ? (node as any).data.label : 'Step',
          triggersCount: triggersCountByStepId.get(id) ?? 0,
        });
      }
      return out;
    }, [stepNodes, selectedJourney?.step_order, triggersCountByStepId]);

    const persistOrder = async (nextIds: string[]) => {
      if (!selectedJourney) return;
      setIsSavingOrder(true);
      setOrderError(null);
      updateJourney(selectedJourney.id, { step_order: nextIds });
      const result = await updateJourneyStepOrderApi(selectedJourney.id, nextIds, activeWorkspaceId);
      setIsSavingOrder(false);
      if (!result.success) {
        setOrderError(result.error);
        return;
      }
      updateJourney(selectedJourney.id, { step_order: result.step_order ?? null });
      setRefreshNonce((n) => n + 1);
    };

    const enhanceEditorExportDoc = React.useCallback(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.documentElement) return;
      const root = doc.documentElement;
      if (root.getAttribute('data-e3-editor-enhanced') === '1') return;
      root.setAttribute('data-e3-editor-enhanced', '1');

      // Add minimal editor-only styles (no layout changes; just drag affordance).
      const style = doc.createElement('style');
      style.textContent = `
        .export-toc-link[data-e3-reorderable="1"] { cursor: move; }
      `;
      doc.head?.appendChild(style);

      const tocLinks = Array.from(
        doc.querySelectorAll('a.export-toc-link[href^="#step-"]')
      ) as HTMLAnchorElement[];

      // Replace anchors with buttons to prevent hash navigation. Keep the exact same class + inner HTML.
      for (let i = 0; i < tocLinks.length; i += 1) {
        const a = tocLinks[i];
        const href = a.getAttribute('href') || '';
        const stepId = href.replace('#', '');
        const nodeId = orderedSteps[i]?.id ?? '';

        const b = doc.createElement('button');
        b.type = 'button';
        b.className = a.className;
        b.innerHTML = a.innerHTML;
        b.setAttribute('data-e3-reorderable', '1');
        b.setAttribute('data-step-target', stepId);
        if (nodeId) b.setAttribute('data-step-node-id', nodeId);
        b.setAttribute('data-step-index', String(i));
        b.draggable = true;

        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = doc.getElementById(stepId);
          if (!target) return;
          try {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch {
            target.scrollIntoView();
          }
        });

        b.addEventListener('dragstart', () => {
          dragFromIndexRef.current = i;
        });
        b.addEventListener('dragover', (e) => e.preventDefault());
        b.addEventListener('drop', () => {
          const from = dragFromIndexRef.current;
          dragFromIndexRef.current = null;
          if (from === null || from === i) return;
          const ids = orderedSteps.map((s) => s.id);
          const next = [...ids];
          const [moved] = next.splice(from, 1);
          next.splice(i, 0, moved);
          void persistOrder(next);
        });

        a.parentNode?.replaceChild(b, a);
      }
    }, [orderedSteps, persistOrder]);

    React.useEffect(() => {
      let cancelled = false;
      setHtml(null);
      setError(null);
      fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}/export/html`, {
        method: 'GET',
        headers: { 'x-workspace-id': activeWorkspaceId },
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const msg =
              typeof (body as any)?.error === 'string'
                ? (body as any).error
                : res.statusText || 'Failed to load brief';
            throw new Error(msg);
          }
          return res.text();
        })
        .then((t) => {
          if (cancelled) return;
          setHtml(t);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : 'Failed to load brief');
        });
      return () => {
        cancelled = true;
      };
    }, [journeyId, refreshNonce]);

    if (error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
          <div className="text-center max-w-md px-4">
            <p className="text-red-600 font-medium">Failed to load docs</p>
            <p className="text-sm text-gray-600 mt-1">{error}</p>
          </div>
        </div>
      );
    }
    if (!html) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600">Loading docs…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full w-full min-w-0 overflow-hidden flex flex-col">
        <div className="shrink-0 border-b bg-white px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {isSavingOrder ? 'Saving step order…' : orderError ? 'Step order save failed.' : ' '}
            </div>
          </div>
          {orderError && <div className="text-xs text-red-600 mt-1">{orderError}</div>}
        </div>
        <iframe
          ref={iframeRef}
          title="Docs preview"
          className="block h-full w-full min-w-0 max-w-full border-0 bg-white"
          srcDoc={html}
          onLoad={enhanceEditorExportDoc}
        />
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
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

          {selectedJourney ? (
            <div className="flex flex-col">
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 w-[420px]">
                {isRenaming ? (
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') {
                        setNameDraft(selectedJourney.name);
                        setIsRenaming(false);
                        setRenameError(null);
                      }
                    }}
                    className="h-7 px-0 border-0 bg-transparent shadow-none focus-visible:ring-0 text-[16px] font-semibold"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="w-full text-left text-[16px] font-semibold text-gray-900 truncate"
                    title="Click to rename"
                    onClick={() => setIsRenaming(true)}
                  >
                    {selectedJourney.name}
                  </button>
                )}
              </div>
              {renameError && (
                <div className="text-xs text-red-600 mt-1 max-w-[420px] truncate">
                  {renameError}
                </div>
              )}
            </div>
          ) : (
            <select
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 shadow-sm max-w-[260px]"
              value={selectedJourneyId ?? ''}
              onChange={(e) => {
                setSelectedJourneyId(e.target.value || null);
                setActiveQARunId(null);
              }}
            >
              {journeyOptions.map((journey: Journey) => (
                <option key={journey.id} value={journey.id}>
                  {journey.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex gap-2 items-center justify-end">
          {selectedJourney && (
            <div className="flex items-center gap-2 mr-4 border-r pr-4">
              <span className="text-sm font-medium text-gray-700">
                Mode
              </span>
              <div className="relative" ref={modeMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-w-[320px] justify-between gap-2"
                  onClick={() => setIsModeMenuOpen((v) => !v)}
                >
                  <span className="flex items-center gap-2 truncate">
                    {isBriefPreview ? (
                      <FileText className="w-4 h-4 text-[var(--color-info)]" />
                    ) : activeQARun ? (
                      activeQARun.endedAt ? (
                        <Lock className="w-4 h-4 text-gray-600" />
                      ) : (
                        <LockOpen className="w-4 h-4 text-emerald-600" />
                      )
                    ) : (
                      <PenTool className="w-4 h-4 text-[var(--color-info)]" />
                    )}
                    <span className="truncate">
                      {isBriefPreview
                        ? 'Docs Mode'
                        : activeQARun
                          ? getQARunDisplayName(activeQARun)
                          : 'Design Mode'}
                    </span>
                    {activeQARun && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          computeQARunStatusForRun(activeQARun) === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : computeQARunStatusForRun(activeQARun) === 'FAILED'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}
                      >
                        {computeQARunStatusForRun(activeQARun)}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </Button>
                {isModeMenuOpen && (
                  <div className="absolute top-full mt-2 left-0 w-full bg-white border border-[var(--border-default)] rounded-md shadow-lg z-50 overflow-hidden">
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2"
                      onClick={() => {
                        setIsBriefPreview(false);
                        setActiveQARunId(null);
                        setIsModeMenuOpen(false);
                      }}
                    >
                      <PenTool className="w-4 h-4 text-[var(--color-info)]" />
                      <span className="flex-1">Design Mode</span>
                      {!isBriefPreview && !activeQARunId && <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2"
                      onClick={() => {
                        setIsBriefPreview(true);
                        setActiveQARunId(null);
                        setIsModeMenuOpen(false);
                      }}
                    >
                      <FileText className="w-4 h-4 text-[var(--color-info)]" />
                      <span className="flex-1">Docs Mode</span>
                      {isBriefPreview && <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                    {sortedQARuns.length > 0 && (
                      <div className="border-t border-[var(--border-default)]" />
                    )}
                    {sortedQARuns.map((run) => {
                      const st = computeQARunStatusForRun(run);
                      return (
                        <button
                          key={run.id}
                          type="button"
                          className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2"
                          onClick={() => {
                            setIsBriefPreview(false);
                            setActiveQARunId(run.id);
                            setIsModeMenuOpen(false);
                          }}
                        >
                          {run.endedAt ? (
                            <Lock className="w-4 h-4 text-gray-600" />
                          ) : (
                            <LockOpen className="w-4 h-4 text-emerald-600" />
                          )}
                          <span className="flex-1 truncate">{getQARunDisplayName(run)}</span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                              st === 'PASSED'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : st === 'FAILED'
                                  ? 'bg-red-100 text-red-800 border-red-200'
                                  : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}
                          >
                            {st}
                          </span>
                          {activeQARunId === run.id && !isBriefPreview && <Check className="w-4 h-4 text-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={journeyCanvasHasUnsavedChanges}
                  title={
                    journeyCanvasHasUnsavedChanges
                      ? 'Save layout changes before starting a QA run.'
                      : undefined
                  }
                  onClick={() => {
                    setNewQARunName(formatQARunName(new Date()));
                    setNewQATesterName(user?.email ?? '');
                    setNewQAEnvironment('');
                    setIsQAModalOpen(true);
                  }}
                  className={`gap-2 ${
                    journeyCanvasHasUnsavedChanges ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <CheckSquare className="w-4 h-4" /> Start QA Run
                </Button>
                {journeyCanvasHasUnsavedChanges && (
                  <div className="mt-1 text-xs text-red-600">
                    Save layout first to start QA.
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedJourney && (
            <div className="relative flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => saveLayoutState?.save()}
                disabled={!saveLayoutState || saveLayoutState.isSaving}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {saveLayoutState?.isSaving
                  ? 'Saving...'
                  : saveLayoutState?.saveSuccess
                    ? 'Saved!'
                    : 'Save Layout'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-10 h-9 px-0"
                onClick={() => {
                  const next = !isMoreMenuOpen;
                  setIsMoreMenuOpen(next);
                  // If sharing is already enabled, auto-expand the share link UI.
                  setIsSharePanelOpen(next ? Boolean(selectedJourney?.share_token) : false);
                  setShareLinkCopied(false);
                }}
                aria-label="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>

              {isMoreMenuOpen && (
                <div
                  ref={moreMenuRef}
                  className="absolute right-0 top-full mt-2 w-64 bg-white border border-[var(--border-default)] rounded-md shadow-lg z-50 overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      const dataStr =
                        'data:text/json;charset=utf-8,' +
                        encodeURIComponent(JSON.stringify(selectedJourney, null, 2));
                      const a = document.createElement('a');
                      a.setAttribute('href', dataStr);
                      a.setAttribute(
                        'download',
                        `${selectedJourney.name.replace(/\s+/g, '_')}.json`,
                      );
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }}
                  >
                    <Save className="w-4 h-4" /> Export JSON
                  </button>

                  <button
                    type="button"
                    className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2"
                    onClick={async () => {
                      setIsMoreMenuOpen(false);
                      const result = await downloadJourneyHtmlExportApi(
                        selectedJourney.id,
                        `${selectedJourney.name.replace(/\s+/g, '_')}-implementation-brief.html`,
                        activeWorkspaceId,
                      );
                      if (!result.success) alert(result.error ?? 'Export failed');
                    }}
                  >
                    <FileText className="w-4 h-4" /> Export Implementation Brief
                  </button>

                  <button
                    type="button"
                    className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center justify-between gap-2"
                    onClick={() => {
                      // Default: keep share panel closed unless share is enabled,
                      // so the toggle is the primary action.
                      if (selectedJourney.share_token) {
                        setIsSharePanelOpen((v) => !v);
                      }
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Share2 className="w-4 h-4" /> Share
                      {isTogglingShare && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="shrink-0"
                      aria-label="Toggle public sharing"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (isTogglingShare) return;
                        const next = !Boolean(selectedJourney.share_token);
                        setIsTogglingShare(true);
                        const result = await setJourneyShareEnabledApi(
                          selectedJourney.id,
                          next,
                          activeWorkspaceId,
                        );
                        setIsTogglingShare(false);
                        if (!result.success) {
                          alert(result.error ?? 'Failed to update share settings');
                          return;
                        }
                        updateJourney(selectedJourney.id, {
                          share_token: next ? (result.token ?? 'enabled') : null,
                        });
                        setIsSharePanelOpen(next); // auto-open link when enabled, hide when disabled
                      }}
                    >
                      <div
                        className={`w-10 h-5 rounded-full relative transition-colors ${
                          selectedJourney.share_token ? 'bg-green-500' : 'bg-gray-200'
                        } ${isTogglingShare ? 'opacity-60' : ''}`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full absolute top-0 shadow-sm transition-all ${
                            selectedJourney.share_token
                              ? 'right-0'
                              : 'left-0 border border-gray-200'
                          }`}
                        />
                      </div>
                    </button>
                  </button>

                  {isSharePanelOpen && (
                    <div className="px-3 py-3 bg-[var(--surface-default)] border-t border-[var(--border-default)]">
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          className="flex-1 h-9 px-2 text-xs rounded-md border border-gray-200 bg-white text-gray-700"
                          value={selectedJourney.share_token ? shareUrlById : ''}
                          placeholder="Enable sharing to generate link"
                          readOnly
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!selectedJourney.share_token}
                          onClick={async () => {
                            if (!selectedJourney.share_token) return;
                            await navigator.clipboard.writeText(shareUrlById);
                            setShareLinkCopied(true);
                            setTimeout(() => setShareLinkCopied(false), 2000);
                          }}
                        >
                          {shareLinkCopied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>

                      {!selectedJourney.share_token && (
                        <div className="text-xs text-gray-600 mt-2">
                          Enable public access to generate a shareable link.
                        </div>
                      )}
                      {selectedJourney.share_token && (
                        <div className="text-[11px] text-gray-500 mt-2">
                          Tip: the shared page lets the developer switch between the journey canvas and docs mode.
                        </div>
                      )}
                    </div>
                  )}

                  <label className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" /> Import JSON
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        setIsMoreMenuOpen(false);
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const importedJourney = JSON.parse(
                              event.target?.result as string,
                            ) as Journey;
                            if (importedJourney && importedJourney.nodes && importedJourney.edges) {
                              const createdId = addJourney({
                                name: `${importedJourney.name || 'Journey'} (Imported)`,
                                nodes: importedJourney.nodes || [],
                                edges: importedJourney.edges || [],
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

                  <div className="border-t border-[var(--border-default)]" />

                  <button
                    type="button"
                    className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 text-red-700 flex items-center gap-2"
                    onClick={async () => {
                      setIsMoreMenuOpen(false);
                      const ok = window.confirm(`Delete journey "${selectedJourney.name}"?`);
                      if (!ok) return;
                      const result = await deleteJourneyApi(selectedJourney.id, activeWorkspaceId);
                      if (!result.success) {
                        alert(result.error ?? 'Delete failed');
                        return;
                      }
                      deleteJourney(selectedJourney.id);
                      onBack();
                    }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
              {saveLayoutState?.saveError && (
                <div className="absolute right-0 top-full mt-1 text-xs text-red-600 max-w-[360px] text-right">
                  {saveLayoutState.saveError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedJourney && (
        <div className="px-4 py-2 border-b bg-gray-50/80">
          <details className="group">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer list-none flex items-center gap-2">
              <span className="group-open:inline hidden">▼</span>
              <span className="group-open:hidden inline">▶</span>
              Testing instructions (for AI / human testers)
            </summary>
            <div className="mt-2 flex gap-2 items-start">
              <textarea
                value={testingInstructionsDraft}
                onChange={(e) => setTestingInstructionsDraft(e.target.value)}
                placeholder="Markdown instructions for testers or AI agent..."
                rows={3}
                className="flex-1 min-w-0 rounded-md border border-input bg-white px-3 py-2 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveTestingInstructions}
                disabled={isSavingInstructions}
                className="shrink-0"
              >
                {isSavingInstructions
                  ? 'Saving...'
                  : instructionsSaveSuccess
                    ? 'Saved!'
                    : 'Save'}
              </Button>
            </div>
          </details>
        </div>
      )}

      <div className="flex-1 relative min-w-0 overflow-hidden">
        {selectedJourney ? (
          <ReactFlowProvider>
            {isBriefPreview ? (
              <div className="h-full w-full min-w-0 overflow-hidden">
                <JourneyBriefPreview journeyId={selectedJourney.id} />
              </div>
            ) : (
              <JourneyCanvas
                journey={selectedJourney}
                workspaceId={activeWorkspaceId}
                activeQARunId={activeQARunId}
                qaLocked={qaLocked}
                onEndQA={handleEndQA}
                onCodegenPreferredStyleChange={handleChangeCodegenPreferredStyle}
                hideFloatingSave
                onSaveLayoutState={setSaveLayoutState}
              />
            )}
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
        disableStart={journeyCanvasHasUnsavedChanges}
        startDisabledReason="Save layout changes before starting a QA run."
        onChangeQARunName={setNewQARunName}
        onChangeTesterName={setNewQATesterName}
        onChangeEnvironment={setNewQAEnvironment}
        onStart={handleStartQARun}
        onClose={() => setIsQAModalOpen(false)}
      />
    </div>
  );
}

