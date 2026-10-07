/**
 * Comments page (sidebar, T-4-02, D-49 capability 13): a project-wide list of every comment with
 * an entity link, author, "via share" badge, a resolved filter, and resolve/delete actions.
 * Enums (entity type) come from `src/domain/enums.ts`, never hardcoded. Simplified UI (D-07).
 *
 * Fix round (reviewer FAIL 2026-09-28 18:18, ERROR 1): `entity_label` links to its target using the
 * app's existing cross-page navigation pattern (`Findings.tsx`'s `openEventCard` via
 * `setEventCardEventId` + `setRequestedTab('eventCard')`, and the generic `selectedItemIdToEdit` +
 * `requestedTab` pair `Properties.tsx`/`UseCases.tsx` now also consume, T-4-02 fix round): `event`
 * jumps to the event card, `property` to the Properties page with that row's editor open, `use_case`
 * and `requirement` (via the list response's `use_case_id`, since a requirement has no page of its
 * own) to the Use cases page with that use case open.
 *
 * Pre-QA fix: a comment's `entity_id` can outlive its target (`comment.dal.ts`'s header comment;
 * `entity_id` is deliberately not a foreign key) -- `comments.service.ts` then renders one of the
 * fixed placeholder strings (`(removed event)`, `(removed property)`, `(removed use case)`) instead
 * of a real name. There is nothing left to navigate to in that case, so such a row renders as plain
 * text, never a button, and never touches `selectedItemIdToEdit`/`eventCardEventId` (`isRemovedPlaceholderLabel`
 * below matches those exact strings the service always emits for a missing event/property/use case;
 * a removed *requirement* is handled separately, by whether `use_case_id` could be recovered at all).
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { COMMENT_ENTITY_TYPES, COMMENT_STATUSES, type CommentStatus } from '@/src/domain/enums';
import { enumLabel } from '@/src/domain/enumLabels';
import { groupThreads } from '@/src/domain/commentThreads';
import { StatusBadge } from '@/src/components/ui/badges';
import { CommentAttachments, type CommentAttachmentItem } from '@/src/features/comments/CommentAttachments';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';

const REMOVED_PLACEHOLDER_LABELS = new Set(['(removed event)', '(removed property)', '(removed use case)']);

/** `event`/`property`/`use_case` rows whose target no longer exists render as plain text, never a
 *  link. `requirement` is excluded here: whether it links is decided by `use_case_id` instead (its
 *  target is a use case, which can still be real even when the requirement itself is gone). */
function isRemovedPlaceholderLabel(row: { entity_type: string; entity_label: string }): boolean {
  return row.entity_type !== 'requirement' && REMOVED_PLACEHOLDER_LABELS.has(row.entity_label);
}

interface CommentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  /** Set only for `entity_type: 'requirement'` (its owning use case); null otherwise. */
  use_case_id: string | null;
  author_name: string;
  via_share: boolean;
  internal_only: boolean;
  body: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  parent_id: string | null;
  status: CommentStatus;
  attachments?: CommentAttachmentItem[];
}

const fileUrlFor = (projectId: string | null) => (p: string) => `${API_BASE}/api/projects/${projectId}/files/${p}`;

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

type StatusFilter = '' | 'active' | CommentStatus;
type InternalFilter = '' | 'true' | 'false';

export function Comments() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const fileUrl = fileUrlFor(activeProjectId);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [entityType, setEntityType] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [internalFilter, setInternalFilter] = useState<InternalFilter>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const setSelectedItemIdToEdit = useStore((s) => s.setSelectedItemIdToEdit);

  const openEntity = useCallback(
    (row: CommentRow) => {
      if (isRemovedPlaceholderLabel(row)) return;
      switch (row.entity_type) {
        case 'event':
          setEventCardEventId(row.entity_id);
          setRequestedTab('eventCard');
          return;
        case 'property':
          setSelectedItemIdToEdit(row.entity_id);
          setRequestedTab('properties');
          return;
        case 'use_case':
          setSelectedItemIdToEdit(row.entity_id);
          setRequestedTab('useCases');
          return;
        case 'requirement':
          if (row.use_case_id) {
            setSelectedItemIdToEdit(row.use_case_id);
            setRequestedTab('useCases');
          }
          return;
        default:
          return;
      }
    },
    [setEventCardEventId, setRequestedTab, setSelectedItemIdToEdit]
  );

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
      if (internalFilter) params.set('internal_only', internalFilter);
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
  }, [hasValidProjectContext, activeProjectId, entityType, internalFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: CommentStatus) => {
    if (!activeProjectId) return;
    setBusyId(id);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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

  // D-70: threads (roots with replies); the status filter applies to roots. "Active" = open + on it.
  const threads = groupThreads(rows).filter((t) =>
    statusFilter === '' ? true : statusFilter === 'active' ? t.status === 'open' || t.status === 'on_it' : t.status === statusFilter
  );

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-bold text-gray-900">Comments</h1>
        <p className="text-sm text-gray-500 mt-1">Client and team discussion on events, properties, use cases and requirements.</p>
      </PageHeader>

      <PageBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hintScope="Comments">Entity type</FieldLabel>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {COMMENT_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hintScope="Comments">Status</FieldLabel>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
            >
              <option value="active">Open and on it</option>
              {COMMENT_STATUSES.map((st) => (
                <option key={st} value={st}>{enumLabel('status', st)}</option>
              ))}
              <option value="">All</option>
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hintScope="Comments">Visibility</FieldLabel>
            <select
              value={internalFilter}
              onChange={(e) => setInternalFilter(e.target.value as InternalFilter)}
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
            >
              <option value="">All</option>
              <option value="true">Internal only</option>
              <option value="false">Not internal only</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg border shadow-sm divide-y">
          {threads.map((row) => (
            <div key={row.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{row.entity_type}</span>
                  {!isRemovedPlaceholderLabel(row) && (row.entity_type !== 'requirement' || row.use_case_id) ? (
                    <button
                      type="button"
                      onClick={() => openEntity(row)}
                      className="font-medium text-[var(--brand-primary)] hover:underline"
                    >
                      {row.entity_label}
                    </button>
                  ) : (
                    <span className="font-medium text-gray-700">{row.entity_label}</span>
                  )}
                  <span>·</span>
                  <span>{row.author_name}</span>
                  {row.via_share && (
                    <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-medium">
                      via share
                    </span>
                  )}
                  {row.internal_only && (
                    <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-medium">
                      Internal only
                    </span>
                  )}
                  <span>·</span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{row.body}</p>
                <CommentAttachments attachments={row.attachments} fileUrl={fileUrl} />
                {row.replies.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3">
                    {row.replies.map((reply) => (
                      <li key={reply.id} className="text-sm text-gray-800">
                        <span className="text-xs font-medium text-gray-600">{reply.author_name}: </span>
                        <span className="whitespace-pre-wrap">{reply.body}</span>
                        <CommentAttachments attachments={reply.attachments} fileUrl={fileUrl} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  aria-label="Set status"
                  value={row.status}
                  disabled={busyId === row.id}
                  onChange={(e) => void setStatus(row.id, e.target.value as CommentStatus)}
                  className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
                >
                  {COMMENT_STATUSES.map((st) => (
                    <option key={st} value={st}>{enumLabel('status', st)}</option>
                  ))}
                </select>
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
          {showEmptyState(loading, threads.length) && (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">No comments match these filters.</div>
          )}
          {showLoadingPlaceholder(loading, threads.length) && (
            <div className="px-6 py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
        </div>
      </PageBody>
    </div>
  );
}
