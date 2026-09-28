/**
 * `CommentsPanel` (D-49, T-4-04, capability 13): the one comments UI mounted both internally (event
 * editor, event card page, property editor, use case page, each requirement row) and in the shared
 * view (`src/pages/SharedProject.tsx`, on each event card, use case and requirement row). Lists
 * newest last, shows author/time/`via share` badge (internal only -- every comment shown in the
 * shared view is already "via share" by definition), a resolve toggle (internal only, D-49: no edit,
 * only resolve and delete, and delete stays on the project-wide Comments page), and an add form.
 *
 * `api` picks the transport: `internal` hits `/api/projects/:id/comments` with `fetchWithAuth`;
 * `shared` hits the public `/api/shared/:token/comments` (T-4-04) with a plain `fetch` and no auth,
 * and hides the form entirely when `access !== 'comment'` (403 `SHARE_READ_ONLY` on the server side
 * is the same rule, this is just not showing a control that would fail). The shared form's author
 * name is remembered in `localStorage['e3-share-author']` (guarded with try/catch: a private window
 * or a disabled storage API must not break the form, just not remember the name across reloads).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type { CommentEntityType } from '@/src/domain/enums';

const AUTHOR_STORAGE_KEY = 'e3-share-author';

function readStoredAuthor(): string {
  try {
    return window.localStorage.getItem(AUTHOR_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeAuthor(name: string): void {
  try {
    window.localStorage.setItem(AUTHOR_STORAGE_KEY, name);
  } catch {
    // ignore: private window / storage disabled, the form still works, just doesn't remember.
  }
}

export interface CommentPanelRow {
  id: string;
  author_name: string;
  via_share: boolean;
  body: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export type CommentsPanelApi =
  | { mode: 'internal'; projectId: string }
  | { mode: 'shared'; token: string; access: 'read' | 'comment' };

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

function patchUrl(api: Extract<CommentsPanelApi, { mode: 'internal' }>, id: string): string {
  return `${API_BASE}/api/projects/${api.projectId}/comments/${id}`;
}

async function doFetch(api: CommentsPanelApi, url: string, init?: RequestInit): Promise<Response> {
  return api.mode === 'internal' ? fetchWithAuth(url, init) : fetch(url, init);
}

export function CommentsPanel({
  entityType,
  entityId,
  api,
  title = 'Comments',
}: {
  entityType: CommentEntityType;
  entityId: string;
  api: CommentsPanelApi;
  title?: string;
}) {
  const [rows, setRows] = useState<CommentPanelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [authorName, setAuthorName] = useState(() => (api.mode === 'shared' ? readStoredAuthor() : ''));
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await doFetch(api, listUrl(api, entityType, entityId));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `api` is a plain value object, re-created identically per render on purpose
  }, [entityType, entityId, api.mode, api.mode === 'internal' ? api.projectId : api.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    if (api.mode === 'shared' && !authorName.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { entity_type: entityType, entity_id: entityId, body };
      if (api.mode === 'shared') payload.author_name = authorName;
      const res = await doFetch(api, postUrl(api), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to post comment.');
        return;
      }
      if (api.mode === 'shared') storeAuthor(authorName.trim());
      setBody('');
      await load();
    } finally {
      setPosting(false);
    }
  };

  const toggleResolved = async (row: CommentPanelRow) => {
    if (api.mode !== 'internal') return;
    setBusyId(row.id);
    try {
      const res = await fetchWithAuth(patchUrl(api, row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: !row.resolved_at }),
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

  const canComment = api.mode === 'internal' || api.access === 'comment';

  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-900">
        {title} {rows.length > 0 && <span className="text-gray-400 font-normal">({rows.length})</span>}
      </h3>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                <span className="font-medium text-gray-700">{row.author_name}</span>
                {api.mode === 'internal' && row.via_share && (
                  <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-medium">
                    via share link
                  </span>
                )}
                <span>·</span>
                <span>{new Date(row.created_at).toLocaleString()}</span>
                {row.resolved_at && (
                  <span className="rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-[10px] font-medium">
                    resolved{row.resolved_by ? ` by ${row.resolved_by}` : ''}
                  </span>
                )}
                {api.mode === 'internal' && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void toggleResolved(row)}
                    className="ml-auto text-[var(--brand-primary)] hover:underline disabled:opacity-50"
                  >
                    {row.resolved_at ? 'Reopen' : 'Resolve'}
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{row.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <form onSubmit={(e) => void submit(e)} className="space-y-2">
          {api.mode === 'shared' && (
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
              required
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
            />
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            maxLength={4000}
            rows={2}
            required
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={posting || !body.trim() || (api.mode === 'shared' && !authorName.trim())}
            className="h-8 rounded-md bg-[var(--brand-primary)] px-3 text-xs font-medium text-white disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      )}
    </div>
  );
}
