/**
 * CSV export block (D-46, T-3-03, Settings page): one download per entity with the current row
 * count from `GET /export/csv`, plus "Download all" that triggers each download sequentially (no
 * zip dependency, plan "Settings page Export block"). Simplified UI (D-07).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { Button } from '@/src/components/ui/Button';

interface CsvEntityCount {
  entity: string;
  count: number;
}

function downloadHref(projectId: string, entity: string): string {
  return `${API_BASE}/api/projects/${projectId}/export/csv/${entity}`;
}

/** Triggers a same-origin download without navigating away (a hidden, immediately-clicked anchor). */
function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function CsvExportBlock({ projectId }: { projectId: string }) {
  const [entities, setEntities] = useState<CsvEntityCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!projectId) {
      setEntities(null);
      return;
    }
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/export/csv`);
      if (!res.ok) throw new Error(`Failed to load CSV export list (${res.status}).`);
      const body = await res.json();
      setEntities(body.entities ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CSV export list.');
    }
  }, [projectId]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  const downloadAll = useCallback(() => {
    if (!entities) return;
    entities.forEach((e, index) => {
      // Staggered so the browser doesn't drop rapid-fire same-origin downloads.
      window.setTimeout(() => triggerDownload(downloadHref(projectId, e.entity), `${e.entity}.csv`), index * 150);
    });
  }, [entities, projectId]);

  if (!projectId) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">CSV export</h2>
          <p className="text-sm text-gray-500">One file per entity; ids sit next to names so files join.</p>
        </div>
        {entities && entities.length > 0 && (
          <Button type="button" variant="outline" onClick={downloadAll}>
            Download all
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!entities && !error && <p className="text-sm text-gray-500">Loading...</p>}
      {entities && (
        <ul className="divide-y divide-gray-100">
          {entities.map((e) => (
            <li key={e.entity} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-800">
                {e.entity} <span className="text-gray-400">({e.count})</span>
              </span>
              <a href={downloadHref(projectId, e.entity)} download={`${e.entity}.csv`}>
                <Button type="button" variant="outline" size="sm">
                  Download
                </Button>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
