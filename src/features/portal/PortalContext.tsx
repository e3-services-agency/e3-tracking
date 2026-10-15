/**
 * Client portal state shared by the shell and every view (T-5-42, D-88): the share header, the
 * document summary (T-5-41) with its routing index, the public comment list, and navigation
 * between views with `history.pushState` (no router library, plan section 4).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/src/config/env';
import type { TrackingDocumentSummary } from '@/src/domain/document/trackingDocument';
import type { CommentPanelRow, CommentsPanelApi } from '@/src/features/comments/CommentsPanel';
import type { CommentLinkTarget } from '@/src/features/comments/commentLinks';
import { buildReferenceIndex, type ReferenceIndex } from '@/src/features/shared/references';
import { sharedFileUrl } from '@/src/pages/sharedViewModel';
import { sharedPath, sharedRouteFromPath } from '@/src/sharedRoute';
import { buildPortalIndex, portalViewOf, type PortalIndex, type PortalTarget, type PortalView } from './portalModel';

export interface ShareHeader {
  project: { name: string; client_logo_path: string | null };
  client: { name: string | null };
  access: 'read' | 'comment';
  /** D-70 item 5, T-5-03: the link needs an author name for every write. */
  require_name?: boolean;
  generated_at: string | null;
}

export function shareApiUrl(token: string, suffix = ''): string {
  return `${API_BASE}/api/shared/${encodeURIComponent(token)}${suffix ? `/${suffix}` : ''}`;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export type PortalData =
  | { state: 'loading' }
  | { state: 'invalid' }
  /** D-88 listed_people: the link needs a listed Google account; the header names nothing else. */
  | { state: 'sign-in'; signedIn: boolean }
  | { state: 'ready'; header: ShareHeader; summary: TrackingDocumentSummary };

/** The header, then the summary and the comments together. The full `tracking-document.json` is
 * never fetched for the views; it stays a download. */
export function usePortalData(token: string) {
  const [data, setData] = useState<PortalData>({ state: 'loading' });
  const [comments, setComments] = useState<CommentPanelRow[]>([]);
  const reloadComments = useCallback(async () => {
    try {
      const res = await fetch(shareApiUrl(token, 'comments'));
      const rows = await parseJson(res);
      if (res.ok && Array.isArray(rows)) setComments(rows);
    } catch {
      // Best-effort refresh: the panel that triggered it reports its own error and the previous list stays.
    }
  }, [token]);
  // A Google sign-in or sign-out can change what this visitor may open: load again.
  const [identityVersion, setIdentityVersion] = useState(0);
  useEffect(() => {
    const onIdentity = (event: Event) => {
      if ((event as CustomEvent<{ token?: string }>).detail?.token === token) setIdentityVersion((v) => v + 1);
    };
    window.addEventListener('e3-share-identity-changed', onIdentity);
    return () => window.removeEventListener('e3-share-identity-changed', onIdentity);
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    setData((current) => (current.state === 'ready' ? current : { state: 'loading' }));
    (async () => {
      try {
        const headerRes = await fetch(shareApiUrl(token));
        if (!headerRes.ok) {
          if (!cancelled) setData({ state: 'invalid' });
          return;
        }
        const header = (await parseJson(headerRes)) as ShareHeader | { sign_in_required: true; signed_in?: boolean };
        if ('sign_in_required' in header && header.sign_in_required) {
          if (!cancelled) setData({ state: 'sign-in', signedIn: !!header.signed_in });
          return;
        }
        const [summaryRes, commentsRes] = await Promise.all([fetch(shareApiUrl(token, 'document-summary.json')), fetch(shareApiUrl(token, 'comments'))]);
        if (!summaryRes.ok) {
          if (!cancelled) setData({ state: 'invalid' });
          return;
        }
        const summary = (await parseJson(summaryRes)) as TrackingDocumentSummary;
        const rows = commentsRes.ok ? await parseJson(commentsRes) : [];
        if (cancelled) return;
        setComments(Array.isArray(rows) ? rows : []);
        setData({ state: 'ready', header: header as ShareHeader, summary });
      } catch {
        if (!cancelled) setData({ state: 'invalid' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, identityVersion]);
  return { data, comments, reloadComments };
}

/** The current portal location: view and item from the path, plus the hash. */
export interface PortalLocation {
  view: PortalView;
  id: string | null;
  hash: string;
}

function readLocation(): PortalLocation {
  const route = sharedRouteFromPath(window.location.pathname);
  return { view: portalViewOf(route?.view), id: route?.view ? route.id : null, hash: window.location.hash };
}

/** Path-based navigation inside the portal. `navigate` pushes (or replaces) a history entry and
 * tells the comment link hook (`useCommentLink`) that the hash may have changed. */
export function usePortalLocation(token: string) {
  const [location, setLocation] = useState<PortalLocation>(readLocation);
  useEffect(() => {
    const update = () => setLocation(readLocation());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    window.addEventListener('e3-comment-location-changed', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
      window.removeEventListener('e3-comment-location-changed', update);
    };
  }, []);
  const hrefFor = useCallback((target: PortalTarget) => sharedPath(token, target.view, target.id) + (target.hash ?? ''), [token]);
  const navigate = useCallback(
    (target: PortalTarget, options: { replace?: boolean } = {}) => {
      const href = hrefFor(target);
      if (options.replace) window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
      window.dispatchEvent(new Event('e3-comment-location-changed'));
      if (!target.hash) window.scrollTo?.({ top: 0 });
    },
    [hrefFor]
  );
  return { location, navigate, hrefFor };
}

export interface PortalContextValue {
  token: string;
  header: ShareHeader;
  summary: TrackingDocumentSummary;
  index: PortalIndex;
  refIndex: ReferenceIndex;
  api: CommentsPanelApi;
  comments: CommentPanelRow[];
  reloadComments: () => Promise<void>;
  /** The comment a `#comment=v1&…` link points at, when it is visible here. */
  linkedComment: CommentLinkTarget | null;
  location: PortalLocation;
  navigate: (target: PortalTarget, options?: { replace?: boolean }) => void;
  hrefFor: (target: PortalTarget) => string;
  fileUrl: (path: string) => string;
}

const Ctx = createContext<PortalContextValue | null>(null);

export function PortalProvider({
  value,
  children,
}: {
  value: Omit<PortalContextValue, 'index' | 'refIndex' | 'api' | 'fileUrl'>;
  children: React.ReactNode;
}) {
  const { summary, token, header } = value;
  const index = useMemo(() => buildPortalIndex(summary), [summary]);
  const refIndex = useMemo(() => buildReferenceIndex(summary), [summary]);
  const api = useMemo<CommentsPanelApi>(
    () => ({ mode: 'shared', token, access: header.access, requireName: !!header.require_name }),
    [token, header.access, header.require_name]
  );
  const fileUrl = useCallback((path: string) => sharedFileUrl(token, path), [token]);
  const full = useMemo(() => ({ ...value, index, refIndex, api, fileUrl }), [value, index, refIndex, api, fileUrl]);
  return <Ctx.Provider value={full}>{children}</Ctx.Provider>;
}

export function usePortal(): PortalContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('usePortal outside PortalProvider');
  return value;
}

/** Comments on one target, every status, internal-only rows never (the public route already drops them). */
export function commentsOn(rows: readonly CommentPanelRow[], entityType: string, entityId: string): CommentPanelRow[] {
  return rows.filter((c) => c.entity_type === entityType && c.entity_id === entityId && !c.internal_only);
}

/** Open root threads on any of `types`: the sidebar's and the view header's "n open". */
export function openThreadCount(rows: readonly CommentPanelRow[], types: readonly string[]): number {
  return rows.filter((c) => !c.parent_id && c.status === 'open' && !!c.entity_type && types.includes(c.entity_type) && !c.internal_only).length;
}
