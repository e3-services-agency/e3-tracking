/**
 * Requirements matrix: plain table against `GET /api/projects/:projectId/requirements-matrix`
 * (CONTEXT.md 3.2: "The requirements matrix is computed, not authored"; D-07 simplified UI).
 * T-4-12: rows grouped by event / variant, the target shown as written (a gap gets a marker and its
 * note on hover / in the expanded row, never as the label), legend, use case filter, gaps-only toggle.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { Button } from '@/src/components/ui/Button';
import { useStore } from '@/src/store';
import { TargetKindBadge } from '@/src/components/ui/badges';
import { REQUIREMENT_TARGET_KINDS } from '@/src/domain/enums';
import { matrixCellBadge, filterMatrixRows, formatTargetLabel, groupMatrixRows } from '@/src/domain/requirementsMatrix';

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
  /** T-4-12 (additive): see requirements-matrix.service.ts. */
  is_gap: boolean;
  gap_note: string | null;
  group_label: string;
  leaf_label: string;
}

interface Matrix {
  use_cases: MatrixUseCase[];
  rows: MatrixRow[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

const CELL_BADGE_CLASS = {
  required: 'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-xs font-semibold text-[var(--brand-primary-text)]',
  optional: 'inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[var(--brand-primary)] px-1.5 text-xs font-semibold text-gray-700',
  none: 'text-gray-300',
} as const;

function MatrixCellBadge({ level }: { level: string | null }) {
  const b = matrixCellBadge(level);
  return (
    <span className={CELL_BADGE_CLASS[b.kind]} title={b.label} aria-label={b.label} data-cell-badge={b.kind}>
      {b.text}
    </span>
  );
}

export function RequirementsMatrix() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUseCaseIds, setSelectedUseCaseIds] = useState<string[]>([]);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

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

  const visibleUseCases = useMemo(
    () => (matrix ? matrix.use_cases.filter((uc) => selectedUseCaseIds.length === 0 || selectedUseCaseIds.includes(uc.id)) : []),
    [matrix, selectedUseCaseIds]
  );
  const groups = useMemo(
    () => groupMatrixRows(filterMatrixRows(matrix?.rows ?? [], { useCaseIds: selectedUseCaseIds, gapsOnly })),
    [matrix, selectedUseCaseIds, gapsOnly]
  );

  const toggleUseCase = (id: string) =>
    setSelectedUseCaseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleExpanded = (key: string) =>
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const colSpan = visibleUseCases.length + 1;

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-bold text-gray-900">Requirements matrix</h1>
        <p className="text-sm text-gray-500 mt-1">
          Computed from every use case requirement: rows are targets grouped by event or variant, columns are use cases,
          cells show the <GlossaryTerm glossaryKey="requirement_level">requirement level</GlossaryTerm>.
        </p>
      </PageHeader>

      <PageBody className="space-y-4">
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : !matrix || matrix.rows.length === 0 ? (
          <div className="text-sm text-gray-500 space-y-3">
            <p>No requirements defined yet. Add a use case from the template library to populate this matrix.</p>
            <Button onClick={() => setRequestedTab('useCaseTemplates')}>Browse templates</Button>
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                Legend: <MatrixCellBadge level="R" /> required, <MatrixCellBadge level="O" /> optional, <MatrixCellBadge level={null} /> no requirement
              </span>
              <span className="flex flex-wrap items-center gap-1.5" data-testid="matrix-kind-legend">
                Target kinds:
                {REQUIREMENT_TARGET_KINDS.map((k) => (
                  <TargetKindBadge key={k} kind={k} />
                ))}
              </span>
              <span>
                <span className="text-amber-600 font-bold" aria-hidden="true">!</span>{' '}
                <GlossaryTerm glossaryKey="gap">gap</GlossaryTerm>: the target is missing or was removed (hover the marker or expand the row for the note)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-medium text-gray-700">Use cases:</span>
              {matrix.use_cases.map((uc) => (
                <FieldLabel key={uc.id} className="flex items-center gap-1 text-gray-700" hintScope="Matrix">
                  <input type="checkbox" checked={selectedUseCaseIds.includes(uc.id)} onChange={() => toggleUseCase(uc.id)} />
                  {uc.code ?? uc.name}
                </FieldLabel>
              ))}
              <FieldLabel className="flex items-center gap-1 text-gray-700 ml-4" hintScope="Matrix">
                <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
                Gaps only
              </FieldLabel>
              {selectedUseCaseIds.length > 0 && (
                <button type="button" className="text-xs text-gray-500 hover:text-gray-900" onClick={() => setSelectedUseCaseIds([])}>
                  Clear use case filter
                </button>
              )}
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
              <table className="text-left text-sm border-collapse min-w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <HintTh className="px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50" hintScope="Matrix">Target</HintTh>
                    {visibleUseCases.map((uc) => (
                      <HintTh key={uc.id} className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap" hintScope="Matrix">
                        {uc.code ? `${uc.code} — ${uc.name}` : uc.name}
                      </HintTh>
                    ))}
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.key} className="divide-y">
                    <tr className="bg-gray-100">
                      <HintTh colSpan={colSpan} className="px-4 py-2 text-xs font-semibold text-gray-700 text-left" hintScope="Matrix">
                        {(group.kind === 'event' || group.kind === 'variant') && (
                          <TargetKindBadge kind={group.kind} compact className="mr-2 align-middle" />
                        )}
                        {group.label}{(group.kind === 'event' || group.kind === 'variant') && (
                          <span className="font-normal text-gray-500"> ({group.kind})</span>
                        )}
                      </HintTh>
                    </tr>
                    {group.rows.map((row) => {
                      const expanded = expandedKeys.has(row.key);
                      return (
                        <React.Fragment key={row.key}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-900 sticky left-0 bg-inherit whitespace-nowrap">
                              <button
                                type="button"
                                className="flex items-center gap-2 text-left"
                                onClick={() => toggleExpanded(row.key)}
                                aria-expanded={expanded}
                              >
                                <span className="text-gray-400 text-xs">{expanded ? '▾' : '▸'}</span>
                                <TargetKindBadge kind={row.target_kind} compact />
                                <span title={formatTargetLabel(row)}>{row.leaf_label}</span>
                                {row.is_gap && (
                                  <span className="text-amber-600 font-bold" title={row.gap_note ?? 'Gap'}>
                                    !
                                  </span>
                                )}
                              </button>
                            </td>
                            {visibleUseCases.map((uc) => (
                              <td key={uc.id} className="px-4 py-2 text-center text-gray-700">
                                <MatrixCellBadge level={row.cells[uc.id] ?? null} />
                              </td>
                            ))}
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={colSpan} className="px-4 py-2 text-xs text-gray-600 bg-gray-50">
                                <div>Kind: {row.target_kind}</div>
                                {row.is_gap ? <div>Gap: {row.gap_note ?? 'target missing'}</div> : <div>Resolved.</div>}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                ))}
                {groups.length === 0 && (
                  <tbody>
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-6 text-center text-gray-500">
                        No rows match the current filter.
                      </td>
                    </tr>
                  </tbody>
                )}
              </table>
            </div>
          </>
        )}
      </PageBody>
    </div>
  );
}
