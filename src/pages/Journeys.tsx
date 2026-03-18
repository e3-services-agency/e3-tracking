import React, { useEffect, useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Plus,
  Trash2,
  Save,
  CheckSquare,
  FileText,
  Share2,
} from 'lucide-react';
import {
  updateJourneyTestingInstructionsApi,
  createJourneyApi,
  downloadJourneyHtmlExportApi,
  getJourneyShareTokenApi,
  useActiveWorkspaceId,
} from '@/src/features/journeys/hooks/useJourneysApi';
import { MoreHorizontal } from 'lucide-react';
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
  const activeWorkspaceId = useActiveWorkspaceId();

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
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const selectedJourney =
    data.journeys.find((journey: Journey) => journey.id === selectedJourneyId) ||
    null;

  useEffect(() => {
    if (selectedJourney) {
      setTestingInstructionsDraft(
        selectedJourney.testing_instructions_markdown ?? '',
      );
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

  const handleCreateNew = async () => {
    const name = 'New Journey';
    const newId = addJourney({
      name,
      nodes: [],
      edges: [],
      qaRuns: [],
    });

    // Persist immediately so canvas saves work without relying on the safety net.
    await createJourneyApi(newId, name, activeWorkspaceId);

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

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">Journey</span>
            <select
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 shadow-sm max-w-[260px]"
              value={selectedJourneyId ?? ''}
              onChange={(e) => {
                setSelectedJourneyId(e.target.value || null);
                setActiveQARunId(null);
              }}
            >
              {data.journeys.map((journey: Journey) => (
                <option key={journey.id} value={journey.id}>
                  {journey.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 items-center">
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
            <div className="relative">
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
                <div className="absolute right-0 mt-2 w-64 bg-white border border-[var(--border-default)] rounded-md shadow-lg z-50 overflow-hidden">
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
                    className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2"
                    onClick={async () => {
                      setIsMoreMenuOpen(false);
                      const result = await getJourneyShareTokenApi(
                        selectedJourney.id,
                        activeWorkspaceId,
                      );
                      if (!result.success) {
                        alert(result.error ?? 'Failed to get share link');
                        return;
                      }
                      const base =
                        (typeof import.meta !== 'undefined' &&
                          import.meta.env?.BASE_URL) ||
                        '/tracking-plan/';
                      const shareUrl = `${window.location.origin}${base.replace(/\/$/, '')}/share/${result.token}`;
                      await navigator.clipboard.writeText(shareUrl);
                      setShareLinkCopied(true);
                      setTimeout(() => setShareLinkCopied(false), 2000);
                    }}
                  >
                    <Share2 className="w-4 h-4" /> {shareLinkCopied ? 'Link copied!' : 'Copy Share Link'}
                  </button>

                  <label className="w-full px-3 py-2 text-sm text-left hover:bg-[var(--surface-default)] flex items-center gap-2 cursor-pointer">
                    <Plus className="w-4 h-4" /> Import JSON
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
                                ...importedJourney,
                                name: `${importedJourney.name || 'Journey'} (Imported)`,
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
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      deleteJourney(selectedJourney.id);
                      onBack();
                    }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleCreateNew}
            variant="default"
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> New Journey
          </Button>
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

