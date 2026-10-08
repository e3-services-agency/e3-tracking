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
import { COMMENT_STATUS_LABELS } from '@/src/domain/enumLabels';
import { groupThreads } from '@/src/domain/commentThreads';
import { CommentStatusBadge } from '@/src/features/comments/CommentStatusBadge';
import { CommentCopyActions } from '@/src/features/comments/CommentCopyActions';
import { useCommentLink } from '@/src/features/comments/useCommentLink';
import { COMMENT_TARGET_CLASS, commentDomId, commentLinkUrl, focusComment, resolveCommentTarget } from '@/src/features/comments/commentLinks';
import { CommentBody, threadAttachments } from '@/src/features/comments/CommentBody';
import { CommentAttachments, type CommentAttachmentItem } from '@/src/features/comments/CommentAttachments';
import { CommentReactions, type ReactionSummaryView } from '@/src/features/comments/CommentReactions';
import type { CommentReactionKind } from '@/src/domain/enums';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';

const REMOVED_PLACEHOLDER_LABELS = new Set(['(removed event)', '(removed property)', '(removed use case)', '(removed identity rule)', '(removed catalog)', '(removed property definition)', '(removed finding)', '(removed qa report)']);

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
  property_id?: string | null;
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
  reactions?: ReactionSummaryView[];
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
  const commentLink = useCommentLink();
  const projectKey = useStore((state) => state.activeProjectKey);
  const getCommentLink = (target: Parameters<typeof commentLinkUrl>[1]) => commentLinkUrl({ mode: 'internal', projectKey }, target);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [entityType, setEntityType] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(commentLink.kind === 'target' ? '' : 'active');
  const [internalFilter, setInternalFilter] = useState<InternalFilter>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (commentLink.kind !== 'target') return;
    // A copied link must work even when its root is closed or current filters exclude its entity.
    setStatusFilter('');
    setEntityType('');
    setInternalFilter('');
  }, [commentLink]);

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
        case 'identity_rule':
          setSelectedItemIdToEdit(row.entity_id); setRequestedTab('identityRules'); return;
        case 'catalog':
          setSelectedItemIdToEdit(row.entity_id); setRequestedTab('catalogs'); return;
        case 'finding':
        case 'qa_report':
          setRequestedTab('findings'); return;
        case 'property_definition':
          if (row.property_id) { setSelectedItemIdToEdit(row.property_id); setRequestedTab('properties'); } return;
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

  const canOpen = (row: CommentRow) =>
    !isRemovedPlaceholderLabel(row) && (row.entity_type !== 'requirement' || !!row.use_case_id);

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

  // Toggles the signed-in user's own reaction (the server knows the name; `mine` highlights it).
  const react = async (id: string, kind: CommentReactionKind) => {
    if (!activeProjectId) return;
    setBusyId(id);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comments/${id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to save reaction.');
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

  const linkedComment = commentLink.kind === 'target' ? resolveCommentTarget(rows, commentLink.target) : null;
  useEffect(() => {
    if (!loading && linkedComment) focusComment(document.getElementById(commentDomId(linkedComment.comment.id)));
  }, [linkedComment?.comment.id, loading, statusFilter, entityType, internalFilter]);

  // D-70: threads (roots with replies); the status filter applies to roots. "Active" = open + in progress.
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
        {commentLink.kind === 'invalid' && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">This comment link is not valid.</p>}
        {commentLink.kind === 'target' && !linkedComment && !loading && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">This comment is unavailable in this view.</p>}
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
              <option value="active">Open and in progress</option>
              {COMMENT_STATUSES.map((st) => (
                <option key={st} value={st}>{COMMENT_STATUS_LABELS[st]}</option>
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
            <div key={row.id} id={commentDomId(row.id)} tabIndex={-1} aria-label={`Comment by ${row.author_name}`} data-testid="comment-thread" className={`p-4 flex items-start justify-between gap-4 ${linkedComment?.comment.id === row.id ? COMMENT_TARGET_CLASS : ''}`}>
              <div
                className={`min-w-0 flex-1 ${canOpen(row) ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  // The whole comment routes to its entity; real controls inside keep their own behaviour.
                  if ((e.target as HTMLElement).closest('button, select, a, input')) return;
                  if (canOpen(row)) openEntity(row);
                }}
              >
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
                  <CommentStatusBadge status={row.status} />
                  <CommentCopyActions mode="internal" row={row} thread={row} getLink={getCommentLink} fileUrl={fileUrl} />
                </div>
                <CommentBody className="mt-1" body={row.body} attachments={threadAttachments(row, row.replies)} fileUrl={fileUrl} />
                <CommentAttachments attachments={row.attachments} fileUrl={fileUrl} />
                <CommentReactions reactions={row.reactions} isRoot ownName="" nameRequired={false} busy={busyId === row.id} onReact={(k) => void react(row.id, k)} />
                {row.replies.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3">
                    {row.replies.map((reply) => (
                      <li key={reply.id} id={commentDomId(reply.id)} tabIndex={-1} aria-label={`Reply by ${reply.author_name}`} data-testid="comment-reply" className={`text-sm text-gray-800 ${linkedComment?.comment.id === reply.id ? COMMENT_TARGET_CLASS : ''}`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500"><span className="font-medium text-gray-600">{reply.author_name}</span><span>{new Date(reply.created_at).toLocaleString()}</span><CommentCopyActions mode="internal" row={reply} thread={row} getLink={getCommentLink} fileUrl={fileUrl} /></div>
                        <CommentBody body={reply.body} attachments={threadAttachments(row, row.replies)} fileUrl={fileUrl} />
                        <CommentAttachments attachments={reply.attachments} fileUrl={fileUrl} />
                        <CommentReactions reactions={reply.reactions} isRoot={false} ownName="" nameRequired={false} busy={busyId === reply.id} onReact={(k) => void react(reply.id, k)} />
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
                    <option key={st} value={st}>{COMMENT_STATUS_LABELS[st]}</option>
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
