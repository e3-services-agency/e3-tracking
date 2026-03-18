import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Trash2,
  Save,
  CheckSquare,
  FileText,
  Share2,
  Upload,
} from 'lucide-react';
import {
  updateJourneyTestingInstructionsApi,
  downloadJourneyHtmlExportApi,
  getJourneyShareTokenApi,
  useActiveWorkspaceId,
  renameJourneyApi,
  setJourneyShareEnabledApi,
  deleteJourneyApi,
} from '@/src/features/journeys/hooks/useJourneysApi';
import { MoreHorizontal } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Journey, QARun } from '@/src/types';
import { JourneyStartQARunModal } from '@/src/features/journeys/overlays/JourneyStartQARunModal';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';
import { useJourneys } from '@/src/features/journeys/hooks/useJourneys';

export function Journeys({
  selectedJourneyId: initialJourneyId,
  onBack,
}: {
  selectedJourneyId: string | null;
  onBack: () => void;
}) {
  const data = useActiveData();
  const { addJourney, updateJourney, deleteJourney } = useStore();
  const activeWorkspaceId = useActiveWorkspaceId();
  useJourneys();

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(
    initialJourneyId || data.journeys[0]?.id || null,
  );
  const [activeQARunId, setActiveQARunId] = useState<string | null>(null);
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
    }
  }, [selectedJourneyId, data.journeys]);

  // Creating journeys should happen from the Journeys list, not from inside the canvas view.

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

  const journeyOptions = useMemo(
    () => data.journeys,
    [data.journeys],
  );

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

  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
    '/tracking-plan/';

  const shareUrlById = selectedJourney
    ? `${window.location.origin}${String(base).replace(/\/$/, '')}/share/journey/${selectedJourney.id}`
    : '';

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
                QA Runs
              </span>
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
                onClick={() => setIsMoreMenuOpen((v) => !v)}
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
                      setIsSharePanelOpen((v) => !v);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Share2 className="w-4 h-4" /> Share
                    </span>
                    <span
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <div
                        className={`w-10 h-5 rounded-full relative transition-colors ${
                          selectedJourney.share_token ? 'bg-green-500' : 'bg-gray-200'
                        } ${isTogglingShare ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selectedJourney.share_token)}
                          disabled={isTogglingShare}
                          onChange={async (e) => {
                            const next = e.target.checked;
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
                            if (next) setIsSharePanelOpen(true);
                            else setIsSharePanelOpen(false);
                          }}
                          className="hidden"
                        />
                        <div
                          className={`w-5 h-5 bg-white rounded-full absolute top-0 shadow-sm transition-all ${
                            selectedJourney.share_token
                              ? 'right-0'
                              : 'left-0 border border-gray-200'
                          }`}
                        />
                      </div>
                    </span>
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

                      <div className="mt-2 flex items-center gap-2">
                        <input
                          className="flex-1 h-9 px-2 text-xs rounded-md border border-gray-200 bg-white text-gray-700"
                          value={selectedJourney.share_token ? `${shareUrlById}/brief` : ''}
                          placeholder="Enable sharing to generate brief URL"
                          readOnly
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!selectedJourney.share_token}
                          onClick={async () => {
                            if (!selectedJourney.share_token) return;
                            await navigator.clipboard.writeText(`${shareUrlById}/brief`);
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

      <div className="flex-1 relative">
        {selectedJourney ? (
          <ReactFlowProvider>
            <JourneyCanvas
              journey={selectedJourney}
              activeQARunId={activeQARunId}
              hideFloatingSave
              onSaveLayoutState={setSaveLayoutState}
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

