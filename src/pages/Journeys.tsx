import React, { useEffect, useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Plus,
  Trash2,
  Save,
  CheckSquare,
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
    initialJourneyId || data.journeys[0]?.id || null,
  );
  const [activeQARunId, setActiveQARunId] = useState<string | null>(null);
  const [isQAModalOpen, setIsQAModalOpen] = useState(false);
  const [newQARunName, setNewQARunName] = useState('');
  const [newQATesterName, setNewQATesterName] = useState('');
  const [newQAEnvironment, setNewQAEnvironment] = useState('');

  const selectedJourney =
    data.journeys.find((journey: Journey) => journey.id === selectedJourneyId) ||
    null;

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

