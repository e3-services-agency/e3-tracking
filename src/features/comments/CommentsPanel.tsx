/**
 * `CommentsPanel` (D-49, T-4-04, capability 13): the one comments UI mounted both internally (event
 * editor, event card page, property editor, use case page, each requirement row) and in the shared
 * view (`src/pages/SharedProject.tsx`, on each event card, use case and requirement row). Lists
 * newest last, shows author/time/`via share` badge (internal only -- a comment posted through a
 * share link, not every comment shown in the shared view: D-49 amendment, fix round W2, comments are
 * one shared thread and an internally-posted comment *is* visible through the share link by design),
 * a resolve toggle (internal only, D-49: no edit, only resolve and delete, and delete stays on the
 * project-wide Comments page), and an add form. Internal mode also shows a small note next to the
 * form ("Visible to anyone with the share link") so a person posting internally knows a client can
 * read it too -- a private note belongs in one of the internal-only fields the public tracking
 * document projection strips (`identity_note`, `owners`, `agent_instructions`, ...), never in a
 * comment.
 *
 * `api` picks the transport: `internal` hits `/api/projects/:id/comments` with `fetchWithAuth`;
 * `shared` hits the public `/api/shared/:token/comments` (T-4-04) with a plain `fetch` and no auth,
 * and hides the form entirely when `access !== 'comment'` (403 `SHARE_READ_ONLY` on the server side
 * is the same rule, this is just not showing a control that would fail). The shared form's author
 * name is remembered per link in `localStorage['e3.share.<token>.name']` (`shareName.ts`, guarded
 * with try/catch: a private window must not break the form). With no name entered, optional-name links use a server-issued animal/color guest. Required-name
 * links require a deliberately chosen name or a verified account. Every editor displays identity.
 *
 * Fix round (W1): a page mounting many panels for the same project (the shared view: one per event
 * card, use case and requirement row; the internal use case page: one per requirement row) used to
 * have every panel fetch its own list independently -- 62 requests on the shared view of the sandbox
 * project, 18 on its use case page. `rows`/`onChanged` make the panel controllable: when the caller
 * passes `rows`, the panel renders that list instead of fetching its own, and calls `onChanged()`
 * (instead of re-fetching itself) after a successful post or resolve toggle so the *page* can
 * refresh its one shared list and redistribute it. Single-entity pages (event editor, property
 * editor, event card) omit both props and the panel fetches and reloads on its own, unchanged.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/src/store';
import { useCommentLink } from './useCommentLink';
import { commentLinkUrl, resolveCommentTarget } from './commentLinks';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type { CommentEntityType, CommentStatus } from '@/src/domain/enums';
import { groupThreads } from '@/src/domain/commentThreads';
import { CommentItem } from './CommentItem';
import type { ReactionSummaryView } from './CommentReactions';
import { useShareName, shareNamePayload, useCommentParticipant, refreshCommentParticipant, claimCommentIdentityRefresh, isVisitorId } from './shareName';
import { CommentIdentity } from './CommentIdentity';
import type { CommentAuthorKind } from '@/src/domain/commentIdentity';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';
import { COMMENT_BODY_MAX, resolveAttachmentSrc } from '@/src/domain/markdownEdit';
import { AttachmentPicker, CommentAttachments, uploadAttachments, type CommentAttachmentItem } from './CommentAttachments';

export interface CommentPanelRow {
  id: string;
  entity_type?: string;
  entity_id?: string;
  author_name: string;
  author_kind?: CommentAuthorKind;
  avatar_url?: string | null;
  via_share: boolean;
  /** Internal mode only; the public route never returns it (D-49 amendment 2, T-4-10). */
  internal_only?: boolean;
  body: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  /** D-70, T-5-02: a reply points at its root; the status lives on the root. */
  parent_id: string | null;
  status: CommentStatus;
  /** D-70 item 3, T-5-03: aggregated reactions (kinds with none are absent). */
  reactions?: ReactionSummaryView[];
  /** D-70 item 4, T-5-04: comment images, in order. */
  attachments?: CommentAttachmentItem[];
}

export type CommentsPanelApi =
  | { mode: 'internal'; projectId: string }
  | { mode: 'shared'; token: string; access: 'read' | 'comment'; requireName?: boolean };

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function listUrl(api: CommentsPanelApi, entityType: CommentEntityType, entityId: string): string {
  const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
  return api.mode === 'internal'
    ? `${API_BASE}/api/projects/${api.projectId}/comments?${params.toString()}`
    : `${API_BASE}/api/shared/${encodeURIComponent(api.token)}/comments?${params.toString()}`;
}

function postUrl(api: CommentsPanelApi): string {
  return api.mode === 'internal'
    ? `${API_BASE}/api/projects/${api.projectId}/comments`
    : `${API_BASE}/api/shared/${encodeURIComponent(api.token)}/comments`;
}

function reactionUrl(api: CommentsPanelApi, id: string): string {
  return api.mode === 'internal'
    ? `${API_BASE}/api/projects/${api.projectId}/comments/${id}/reactions`
    : `${API_BASE}/api/shared/${encodeURIComponent(api.token)}/comments/${id}/reactions`;
}

function fileUrl(api: CommentsPanelApi, path: string): string {
  return api.mode === 'internal'
    ? `${API_BASE}/api/projects/${api.projectId}/files/${path}`
    : `${API_BASE}/api/shared/${encodeURIComponent(api.token)}/files/${path}`;
}

function patchUrl(api: Extract<CommentsPanelApi, { mode: 'internal' }>, id: string): string {
  return `${API_BASE}/api/projects/${api.projectId}/comments/${id}`;
}

function statusUrl(api: CommentsPanelApi, id: string): string {
  return api.mode === 'internal'
    ? `${API_BASE}/api/projects/${api.projectId}/comments/${id}`
    : `${API_BASE}/api/shared/${encodeURIComponent(api.token)}/comments/${id}/status`;
}

async function doFetch(api: CommentsPanelApi, url: string, init?: RequestInit): Promise<Response> {
  return api.mode === 'internal' ? fetchWithAuth(url, init) : fetch(url, init);
}

export function CommentsPanel({
  entityType,
  entityId,
  api,
  title = 'Comments',
  rows: controlledRows,
  onChanged,
}: {
  entityType: CommentEntityType;
  entityId: string;
  api: CommentsPanelApi;
  title?: string;
  /** Fix round W1: when given, the panel renders this list instead of fetching its own -- the
   *  caller (a page mounting many panels) fetches the full comment list once and passes each panel
   *  its own filtered slice. Omit for a panel that should fetch and manage its own list. */
  rows?: CommentPanelRow[];
  /** Fix round W1: called after a successful post or resolve toggle when `rows` is controlled, so
   *  the page can refresh its one shared list. Ignored (the panel just reloads itself) when `rows`
   *  is omitted. */
  onChanged?: () => void;
}) {
  const controlled = controlledRows !== undefined;
  const [ownRows, setOwnRows] = useState<CommentPanelRow[]>([]);
  const [loading, setLoading] = useState(!controlled);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  // D-70 item 5, T-5-03: the shared visitor's name is remembered per link (`e3.share.<token>.name`).
  const [storedName, setAuthorName] = useShareName(api.mode === 'shared' ? api.token : null);
  // A generated visitor id is not a typed name: the form shows empty and posts still ask for one.
  const authorName = isVisitorId(storedName) ? '' : storedName;
  const participant = useCommentParticipant(api.mode, api.mode === 'shared' ? api.token : api.projectId);
  const identity = <CommentIdentity participant={participant} guestName={authorName} onGuestNameChange={api.mode === 'shared' ? setAuthorName : undefined} requireName={api.mode === 'shared' && !!api.requireName} onRetry={() => void refreshCommentParticipant(api.mode, api.mode === 'shared' ? api.token : api.projectId)} />;
  const [internalOnly, setInternalOnly] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const rows = controlled ? (controlledRows as CommentPanelRow[]) : ownRows;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await doFetch(api, listUrl(api, entityType, entityId));
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load comments.');
        return;
      }
      setOwnRows(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load comments.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `api` is a plain value object, re-created identically per render on purpose
  }, [entityType, entityId, api.mode, api.mode === 'internal' ? api.projectId : api.token]);

  useEffect(() => {
    if (controlled || (!participant.ready && participant.loading)) return;
    void load();
  }, [controlled, load, participant]);

  const refresh = useCallback(async () => {
    if (controlled) {
      onChanged?.();
      return;
    }
    await load();
  }, [controlled, onChanged, load]);

  useEffect(() => {
    if (controlled && onChanged && participant.ready && claimCommentIdentityRefresh(api.mode, api.mode === 'shared' ? api.token : api.projectId)) onChanged();
  }, [controlled, onChanged, participant, api.mode, api.mode === 'shared' ? api.token : api.projectId]);

  const post = async (text: string, parentId: string | null, files: File[] = []): Promise<boolean> => {
    if (!text.trim()) return false;
    if (!participant.ready) { setError('Wait for your posting identity or retry loading it.'); return false; }
    if (api.mode === 'shared' && api.requireName && !participant.verified && !authorName.trim()) {
      setError('Enter your name first.');
      return false;
    }
    setPosting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { entity_type: entityType, entity_id: entityId, body: text };
      if (parentId) payload.parent_id = parentId;
      if (api.mode === 'shared') Object.assign(payload, shareNamePayload(api.token));
      else if (!parentId) payload.internal_only = internalOnly;
      const res = await doFetch(api, postUrl(api), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to post comment.');
        return false;
      }
      // T-5-04: images go up after the comment exists, one request each.
      if (files.length > 0 && typeof data?.id === 'string') {
        const failures = await uploadAttachments(`${postUrl(api)}/${data.id}/attachments`, files, (u, init) => doFetch(api, u, init), setUploadProgress);
        if (failures.length > 0) setError(`Comment posted, but some images were not attached. ${failures.join(' ')}`);
      }
      if (!parentId) {
        setPendingImages([]);
        setBody('');
        setInternalOnly(false);
      }
      await refresh();
      return true;
    } catch {
      // L4 fix round: a network failure (server down, offline) must surface, not disappear as an
      // unhandled rejection -- the form's own state (body text) is left intact so nothing is lost.
      setError('Failed to post comment. Check your connection and try again.');
      return false;
    } finally {
      setPosting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await post(body, null, pendingImages);
  };

  const setStatus = async (row: CommentPanelRow, status: CommentStatus) => {
    if (!participant.ready) return;
    setBusyId(row.id);
    setError(null);
    try {
      const payload: Record<string, unknown> = { status };
      if (api.mode === 'shared') Object.assign(payload, shareNamePayload(api.token));
      const res = await doFetch(api, statusUrl(api, row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to update comment.');
        return;
      }
      await refresh();
    } catch {
      setError('Failed to update comment. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const react = async (row: CommentPanelRow, kind: string) => {
    if (!participant.ready) return;
    setBusyId(row.id);
    setError(null);
    try {
      const payload: Record<string, unknown> = { kind };
      if (api.mode === 'shared') Object.assign(payload, shareNamePayload(api.token));
      const res = await doFetch(api, reactionUrl(api, row.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to save reaction.');
        return;
      }
      await refresh();
    } catch {
      setError('Failed to save reaction. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const nameRequired = api.mode === 'shared' && !!api.requireName && !participant.verified && !authorName.trim();
  const permittedRows = rows.filter((row) => (api.mode !== 'shared' || !row.internal_only) && (!row.entity_type || row.entity_type === entityType) && (!row.entity_id || row.entity_id === entityId)).map((row) => ({ ...row, entity_type: row.entity_type ?? entityType, entity_id: row.entity_id ?? entityId }));
  const threads = groupThreads(permittedRows);
  const link = useCommentLink();
  const projectKey = useStore((state) => state.activeProjectKey);
  const resolvedTarget = link.kind === 'target' ? resolveCommentTarget(permittedRows, link.target) : null;
  const getCommentLink = (target: Parameters<typeof commentLinkUrl>[1]) => commentLinkUrl(api.mode === 'shared' ? api : { mode: 'internal', projectKey }, target);
  const canComment = api.mode === 'internal' || api.access === 'comment';

  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-900">
        {title} {rows.length > 0 && <span className="text-gray-400 font-normal">({rows.length})</span>}
      </h3>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      {loading && rows.length > 0 && <p role="status" className="text-xs text-gray-400">Refreshing comments…</p>}
      {loading && rows.length === 0 ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {threads.map((thread) => (
            <CommentItem
              key={thread.id}
              thread={thread}
              getCommentLink={getCommentLink}
              targetCommentId={resolvedTarget?.comment.id}
              mode={api.mode}
              canComment={canComment}
              busy={busyId === thread.id || !participant.ready}
              onSetStatus={(status) => void setStatus(thread, status)}
              onReply={(text, files) => post(text, thread.id, files)}
              fileUrl={(pth) => fileUrl(api, pth)}
              renderAttachments={(c) => <CommentAttachments attachments={c.attachments} fileUrl={(pth) => fileUrl(api, pth)} />}
              onReact={(row, kind) => void react(row, kind)}
              ownName={api.mode === 'shared' ? storedName : ''}
              nameMissing={nameRequired}
              composerIdentity={identity}
              identityReady={participant.ready}
              nameRequired={nameRequired}
            />
          ))}
        </ul>
      )}

      {canComment && (
        <form onSubmit={(e) => void submit(e)} className="space-y-2">
          {api.mode === 'internal' && (
            <div className="space-y-1">
              <FieldLabel className="flex items-center gap-2 text-xs text-gray-700" hintScope="Comments">
                <input type="checkbox" checked={internalOnly} onChange={(e) => setInternalOnly(e.target.checked)} />
                Internal only
              </FieldLabel>
              <p className="text-[11px] text-gray-400">
                {internalOnly ? 'Not visible on the share link.' : 'Visible to anyone with the share link.'}
              </p>
            </div>
          )}
          {identity}
          <MarkdownEditor
            value={body}
            onChange={setBody}
            onSubmit={() => {
              if (!posting && participant.ready && body.trim() && !nameRequired) void post(body, null, pendingImages);
            }}
            placeholder={nameRequired ? 'Enter your name to comment' : 'Add a comment…'}
            disabled={nameRequired}
            maxLength={COMMENT_BODY_MAX}
            rows={3}
            required
            pendingNames={pendingImages.map((f) => f.name)}
            resolveImage={(src) => resolveAttachmentSrc(src, undefined, (p) => fileUrl(api, p))}
          />
          <AttachmentPicker files={pendingImages} onChange={setPendingImages} disabled={posting} progress={uploadProgress} />
          <button
            type="submit"
            disabled={posting || !participant.ready || !body.trim() || nameRequired}
            className="h-8 rounded-md bg-[var(--brand-primary)] px-3 text-xs font-medium text-white disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      )}
    </div>
  );
}
