/**
 * History page (sidebar, T-3-02, D-44 capability 12): a project-wide list of `change_log` rows with
 * filters (entity type, actor, source, batch), grouped by batch (an import apply or a restore),
 * paged via `next_cursor`. Enums (entity type) come from `src/domain/enums.ts`, never hardcoded.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { CHANGE_LOG_ACTIONS, CHANGE_LOG_ENTITY_TYPES } from '@/src/domain/enums';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';

interface ChangeLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  parent_entity_id: string | null;
  action: string;
  actor: string;
  agent?: string | null;
  source: string;
  batch_id: string | null;
  changed_at: string;
  diff_json: { field: string; before: unknown; after: unknown }[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface Batch {
  key: string;
  batch_id: string | null;
  source: string;
  actor: string;
  agent?: string | null;
  changed_at: string;
  rows: ChangeLogRow[];
}

/** Groups consecutive-in-list rows by `batch_id` (an import apply/restore all share one); a row
 * with no `batch_id` (an ordinary UI/MCP edit) is its own one-row "batch" so every row still
 * renders through the same expand/collapse UI. */
function groupByBatch(rows: ChangeLogRow[]): Batch[] {
  const batches: Batch[] = [];
  const byBatchId = new Map<string, Batch>();
  for (const row of rows) {
    if (row.batch_id) {
      const existing = byBatchId.get(row.batch_id);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      const batch: Batch = {
        key: row.batch_id,
        batch_id: row.batch_id,
        source: row.source,
        actor: row.actor,
        agent: row.agent,
        changed_at: row.changed_at,
        rows: [row],
      };
      byBatchId.set(row.batch_id, batch);
      batches.push(batch);
    } else {
      batches.push({
        key: row.id,
        batch_id: null,
        source: row.source,
        actor: row.actor,
        agent: row.agent,
        changed_at: row.changed_at,
        rows: [row],
      });
    }
  }
  return batches;
}

export function History() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [rows, setRows] = useState<ChangeLogRow[]>([]);
  const [entityType, setEntityType] = useState('');
  const [actor, setActor] = useState('');
  const [source, setSource] = useState('');
  const [action, setAction] = useState('');
  const [batchId, setBatchId] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before: string | null) => {
      if (!hasValidProjectContext || !activeProjectId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (entityType) params.set('entity_type', entityType);
        if (actor.trim()) params.set('actor', actor.trim());
        if (source.trim()) params.set('source', source.trim());
        if (action) params.set('action', action);
        if (batchId.trim()) params.set('batch_id', batchId.trim());
        if (before) params.set('before', before);
        const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/history?${params.toString()}`);
        const data = await parseJson(res);
        if (!res.ok) {
          setError(typeof data?.error === 'string' ? data.error : 'Failed to load history.');
          setRows([]);
          setNextCursor(null);
          return;
        }
        const items: ChangeLogRow[] = Array.isArray(data.items) ? data.items : [];
        setRows((prev) => (before ? [...prev, ...items] : items));
        setNextCursor(data.next_cursor ?? null);
      } catch {
        setError('Failed to load history.');
        setRows([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [hasValidProjectContext, activeProjectId, entityType, actor, source, action, batchId]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const batches = useMemo(() => groupByBatch(rows), [rows]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-bold text-gray-900">History</h1>
        <p className="text-sm text-gray-500 mt-1">Every definition change: who, when, from where, and what changed.</p>
      </PageHeader>

      <PageBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Entity type" hintScope="History">Entity type</FieldLabel>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {CHANGE_LOG_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Action" hintScope="History">Action</FieldLabel>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {CHANGE_LOG_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Actor" hintScope="History">Actor</FieldLabel>
            <input value={actor} onChange={(e) => setActor(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm" placeholder="Any actor" />
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Source" hintScope="History">Source</FieldLabel>
            <input value={source} onChange={(e) => setSource(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm" placeholder="ui, mcp, import:…" />
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hintScope="History">
              <GlossaryTerm glossaryKey="batch">Batch</GlossaryTerm> id
            </FieldLabel>
            <input value={batchId} onChange={(e) => setBatchId(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm" placeholder="Any batch" />
          </div>
        </div>

        <div className="bg-white rounded-lg border shadow-sm divide-y">
          {batches.map((batch) => {
            const isOpen = expanded.has(batch.key) || batch.rows.length === 1;
            return (
              <div key={batch.key} className="p-4">
                <button
                  type="button"
                  onClick={() => batch.rows.length > 1 && toggle(batch.key)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{new Date(batch.changed_at).toLocaleString()}</span>{' '}
                    · {batch.agent ? `${batch.agent} on behalf of ${batch.actor}` : batch.actor} · {batch.source}
                    {batch.batch_id && (
                      <span className="ml-2 text-xs text-gray-400 font-mono">batch {batch.batch_id.slice(0, 8)}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {batch.rows.length} {batch.rows.length === 1 ? 'change' : 'changes'}
                  </span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto"><table className="w-full text-left text-xs mt-3">
                    <thead className="text-gray-500">
                      <tr>
                        <HintTh className="py-1 pr-3 font-medium" hint="Type" hintScope="History">Type</HintTh>
                        <HintTh className="py-1 pr-3 font-medium" hint="Entity" hintScope="History">Entity</HintTh>
                        <HintTh className="py-1 pr-3 font-medium" hint="Action" hintScope="History">Action</HintTh>
                        <HintTh className="py-1 pr-3 font-medium" hint="Field" hintScope="History">Field</HintTh>
                        <HintTh className="py-1 pr-3 font-medium" hint="Before" hintScope="History">Before</HintTh>
                        <HintTh className="py-1 pr-3 font-medium" hint="After" hintScope="History">After</HintTh>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {batch.rows.flatMap((row) => {
                        const diffs = row.diff_json.length > 0 ? row.diff_json : [{ field: '—', before: null, after: null }];
                        return diffs.map((diff, i) => (
                          <tr key={`${row.id}:${i}`}>
                            {i === 0 && (
                              <>
                                <td className="py-1 pr-3 font-mono text-gray-500" rowSpan={diffs.length}>{row.entity_type}</td>
                                <td className="py-1 pr-3 text-gray-700" rowSpan={diffs.length}>{row.entity_label ?? row.entity_id}</td>
                                <td className="py-1 pr-3 text-gray-700" rowSpan={diffs.length}>{row.action}</td>
                              </>
                            )}
                            <td className="py-1 pr-3 font-mono text-gray-600">{diff.field}</td>
                            <td className="py-1 pr-3 text-gray-500">{formatValue(diff.before)}</td>
                            <td className="py-1 pr-3 text-gray-900">{formatValue(diff.after)}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table></div>
                )}
              </div>
            );
          })}
          {showEmptyState(loading, batches.length) && (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">
              No history matches these filters. History fills in as you edit events, properties or import files.
            </div>
          )}
          {showLoadingPlaceholder(loading, batches.length) && (
            <div className="px-6 py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
        </div>

        {nextCursor && (
          <div className="flex justify-center">
            <button
              type="button"
              className="text-sm text-[var(--brand-primary)] hover:underline"
              onClick={() => void load(nextCursor)}
            >
              Load more
            </button>
          </div>
        )}
      </PageBody>
    </div>
  );
}
