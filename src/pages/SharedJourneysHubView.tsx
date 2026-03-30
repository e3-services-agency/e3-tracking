/**
 * Public read-only list of individually shared journeys at /share/hub/:token.
 * GET /api/shared/journeys-hub/:token — rows open /share/journey/:id (existing preview).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { GitMerge, Loader2 } from 'lucide-react';
import {
  getSharedJourneysHubListApi,
  type SharedJourneysHubRow,
} from '@/src/features/journeys/hooks/useJourneysApi';
import { buildAppPageUrl } from '@/src/config/env';
import { computeQARunStatusForRun } from '@/src/features/journeys/lib/qaRunUtils';
import type { QARun } from '@/src/types';

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function SharedJourneysHubView({ token }: { token: string }) {
  const [rows, setRows] = useState<SharedJourneysHubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ta = new Date(a.updated_at).getTime();
      const tb = new Date(b.updated_at).getTime();
      return tb - ta;
    });
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSharedJourneysHubListApi(token).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.success) {
        setRows(result.journeys);
      } else {
        setError('error' in result ? result.error : 'Failed to load hub');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openJourney = (id: string) => {
    window.location.href = buildAppPageUrl(
      `share/journey/${encodeURIComponent(id)}?hub=${encodeURIComponent(token)}`,
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="border-b bg-white px-6 py-6">
        <h1 className="text-2xl font-bold text-gray-900">Shared journeys</h1>
        <p className="text-sm text-gray-500 mt-1">
          Read-only list of journeys your team has shared. Select a row to open the preview.
        </p>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-gray-600 py-16">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading journeys…</span>
          </div>
        )}

        {!loading && error && (
          <div
            className="max-w-lg mx-auto rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
            <p className="mt-2 text-red-700">
              This link may be invalid, or sharing may have been turned off. Ask your team for an updated link.
            </p>
          </div>
        )}

        {!loading && !error && sorted.length === 0 && (
          <div className="max-w-lg mx-auto rounded-lg border border-gray-200 bg-white px-6 py-8 text-center text-gray-600">
            <p className="font-medium text-gray-900">No shared journeys yet</p>
            <p className="text-sm mt-2">
              Journeys appear here after they are shared individually. The hub only lists journeys that have sharing
              enabled.
            </p>
          </div>
        )}

        {!loading && !error && sorted.length > 0 && (
          <div className="bg-white border rounded-lg shadow-sm overflow-auto max-w-5xl mx-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    Journey Name
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    Scope
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    Nodes
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    QA Runs
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    QA Status
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b whitespace-nowrap">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((row) => {
                  const tc = row.type_counts ?? { new: 0, enrichment: 0, fix: 0 };
                  const scopeParts = [
                    tc.new ? { n: tc.new, label: 'New', cls: 'text-emerald-600' } : null,
                    tc.enrichment ? { n: tc.enrichment, label: 'Enr', cls: 'text-blue-600' } : null,
                    tc.fix ? { n: tc.fix, label: 'Fix', cls: 'text-amber-600' } : null,
                  ].filter(Boolean) as { n: number; label: string; cls: string }[];
                  const latestRun = row.latestQARun as QARun | null;
                  return (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => openJourney(row.id)}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-[var(--color-info)] shrink-0" />
                        <span className="font-medium text-[var(--color-info)]">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {scopeParts.length ? (
                        <span className="flex items-center gap-2 flex-wrap">
                          {scopeParts.map(({ n, label, cls }) => (
                            <span key={label} className={`font-medium ${cls}`} title={label === 'Enr' ? 'Enrichment' : label}>
                              {n}<span className="text-gray-400 font-normal"> {label}</span>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {row.nodesCount} nodes
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {row.qaRunsCount} runs
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {row.qaRunsCount > 0 && latestRun ? (
                        (() => {
                          const status = computeQARunStatusForRun(latestRun);
                          const cls =
                            status === 'PASSED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : status === 'FAILED'
                                ? 'bg-red-100 text-red-800 border-red-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200';
                          return (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${cls}`}>
                              {status}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {formatUpdated(row.updated_at)}
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
