/**
 * Comments page (sidebar, T-4-02, D-49 capability 13): a project-wide list of every comment with
 * an entity link, author, "via share" badge, a resolved filter, and resolve/delete actions.
 * Enums (entity type) come from `src/domain/enums.ts`, never hardcoded. Simplified UI (D-07).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { COMMENT_ENTITY_TYPES } from '@/src/domain/enums';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';

interface CommentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  author_name: string;
  via_share: boolean;
  body: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

type ResolvedFilter = '' | 'true' | 'false';

export function Comments() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [entityType, setEntityType] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>('false');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (entityType) params.set('entity_type', entityType);
      if (resolvedFilter) params.set('resolved', resolvedFilter);
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comments?${params.toString()}`);
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load comments.');
        setRows([]);
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load comments.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [hasValidProjectContext, activeProjectId, entityType, resolvedFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const setResolved = async (id: string, resolved: boolean) => {
    if (!activeProjectId) return;
    setBusyId(id);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      });
      if (!res.ok) {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to update comment.');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!activeProjectId) return;
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    setBusyId(id);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comments/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to delete comment.');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Comments</h1>
        <p className="text-sm text-gray-500 mt-1">Client and team discussion on events, properties, use cases and requirements (D-49).</p>
      </div>

      <div className="p-8 flex-1 overflow-y-auto space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Entity type</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {COMMENT_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select
              value={resolvedFilter}
              onChange={(e) => setResolvedFilter(e.target.value as ResolvedFilter)}
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
            >
              <option value="false">Open</option>
              <option value="true">Resolved</option>
              <option value="">All</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg border shadow-sm divide-y">
          {rows.map((row) => (
            <div key={row.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{row.entity_type}</span>
                  <span className="font-medium text-gray-700">{row.entity_label}</span>
                  <span>·</span>
                  <span>{row.author_name}</span>
                  {row.via_share && (
                    <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-medium">
                      via share
                    </span>
                  )}
                  <span>·</span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                  {row.resolved_at && (
                    <span className="rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-[10px] font-medium">
                      resolved{row.resolved_by ? ` by ${row.resolved_by}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{row.body}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void setResolved(row.id, !row.resolved_at)}
                  className="h-8 rounded-md border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {row.resolved_at ? 'Reopen' : 'Resolve'}
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void remove(row.id)}
                  title="Delete"
                  className="h-8 w-8 rounded-md border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {showEmptyState(loading, rows.length) && (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">No comments match these filters.</div>
          )}
          {showLoadingPlaceholder(loading, rows.length) && (
            <div className="px-6 py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
