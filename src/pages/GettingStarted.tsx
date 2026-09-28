/**
 * Getting started checklist (T-4-09, sidebar "Getting started"): reads
 * `GET /api/projects/:id/getting-started` (`gettingStarted.service.ts`) and renders each step with
 * its sentence and a "Go" link that switches to the step's page. Reopenable from the sidebar at any
 * time, even once every step is done.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

interface Step {
  key: string;
  label: string;
  sentence: string;
  done: boolean;
  tab: string;
}

interface GettingStartedResponse {
  steps: Step[];
  complete: boolean;
}

export function GettingStarted({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [data, setData] = useState<GettingStartedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/getting-started`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json);
        setError(null);
      } else {
        setError(typeof json?.error === 'string' ? json.error : 'Failed to load the checklist.');
      }
    } finally {
      setLoading(false);
    }
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasValidProjectContext) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-8 text-center">
        Select or create a project to see its getting started checklist.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-8 border-b bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Getting started</h1>
        <p className="text-sm text-gray-500 mt-1">
          A short checklist to get this project fully documented and shareable.
        </p>
      </div>
      <div className="p-8 flex-1 overflow-y-auto space-y-3 max-w-2xl">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}
        {!loading && data?.complete && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            All steps are done. Come back here any time from the sidebar.
          </div>
        )}
        {!loading &&
          data?.steps.map((step) => (
            <div key={step.key} className="bg-white rounded-lg border shadow-sm p-4 flex items-start gap-3">
              {step.done ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${step.done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {step.label}
                </p>
                <p className="text-sm text-gray-500">{step.sentence}</p>
              </div>
              {!step.done && (
                <Button variant="outline" size="sm" onClick={() => setActiveTab(step.tab)}>
                  Go
                </Button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
