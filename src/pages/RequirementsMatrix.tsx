/**
 * Requirements matrix: plain table against `GET /api/projects/:projectId/requirements-matrix`
 * (CONTEXT.md 3.2: "The requirements matrix is computed, not authored"; D-07 simplified UI).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { Button } from '@/src/components/ui/Button';
import { useStore } from '@/src/store';

interface MatrixUseCase {
  id: string;
  code: string | null;
  name: string;
}

interface MatrixRow {
  target_kind: string;
  label: string;
  /** T-3-06 QA fix (2026-09-28): stable, unique per row (server-computed); see requirements-matrix.service.ts. Two gap rows can share the same target_kind and label text, so this must be used as the React key instead. */
  key: string;
  cells: Record<string, string | null>;
}

interface Matrix {
  use_cases: MatrixUseCase[];
  rows: MatrixRow[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function RequirementsMatrix() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    setLoading(true);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/requirements-matrix`);
    const data = await parseJson(res);
    if (res.ok) {
      setMatrix(data);
      setError(null);
    } else {
      setError(typeof data?.error === 'string' ? data.error : 'Failed to load the requirements matrix.');
    }
    setLoading(false);
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Requirements matrix</h1>
        <p className="text-sm text-gray-500 mt-1">
          Computed from every use case's requirements: rows are targets, columns are use cases, cells show the{' '}
          <GlossaryTerm glossaryKey="requirement_level">requirement level</GlossaryTerm>.
        </p>
      </div>

      <div className="p-8 flex-1 overflow-auto">
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : !matrix || matrix.rows.length === 0 ? (
          <div className="text-sm text-gray-500 space-y-3">
            <p>No requirements defined yet. Instantiate a use case from the template library to populate this matrix.</p>
            <Button onClick={() => setRequestedTab('useCaseTemplates')}>Browse templates</Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
            <table className="text-left text-sm border-collapse">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50">Target</th>
                  {matrix.use_cases.map((uc) => (
                    <th key={uc.id} className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">
                      {uc.code ? `${uc.code} — ${uc.name}` : uc.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {matrix.rows.map((row) => (
                  <tr key={row.key} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap">{row.label}</td>
                    {matrix.use_cases.map((uc) => (
                      <td key={uc.id} className="px-4 py-2 text-center text-gray-700">
                        {row.cells[uc.id] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
