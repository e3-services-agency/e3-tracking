/**
 * Client portal (D-48, D-50, D-88; T-4-03, T-5-42): `src/App.tsx` mounts this for
 * `/tracking-plan/shared/:token[/<view>[/<id>]]`, ahead of `ProtectedRoute` -- no auth header, no
 * `AuthProvider`, plain `fetch`, every request under `/api/shared/:token`.
 *
 * T-5-42 replaced the single page (every section at once, about 35,600 DOM elements on the
 * sandbox, Expand all / Collapse all, a scroll spy) with a shell and one view per section, built
 * from the shared read-only views (`src/features/views/`, T-5-40) and fed by the document summary
 * (`document-summary.json`, T-5-41). An event's own page loads its card (`card.json`) on open; the
 * QA view loads the current findings (`findings.json`) on open. The full `tracking-document.json`
 * and `documentation.html` stay downloads.
 *
 * Links sent before T-5-42 are hashes on the single page (`#event-…`, `#property-…`,
 * `#variants-event-…`, `#catalog-…`, `#consent-…`, `#mapping-…`, `#use-case-…`, section, group and
 * finding anchors) or comment links (`#comment=v1&…`, D-75). They redirect, indefinitely, to their
 * view and item (`portalModel.ts`); a comment link keeps its hash so the target's comments open on
 * that comment. An unknown or revoked token renders "This link is not valid" instead of an error.
 */
import React, { useEffect, useMemo } from 'react';
import { buildSharedViewModel, sharedFileUrl } from './sharedViewModel';
import { PortalProvider, usePortalData, usePortalLocation, type PortalContextValue } from '@/src/features/portal/PortalContext';
import { PortalShell } from '@/src/features/portal/PortalShell';
import { buildPortalIndex, resolveHash, sameTarget, type PortalView } from '@/src/features/portal/portalModel';
import { PortalOverview } from '@/src/features/portal/views/PortalOverview';
import { PortalEventsView } from '@/src/features/portal/views/PortalEventsView';
import { PortalPropertiesView } from '@/src/features/portal/views/PortalPropertiesView';
import { PortalUseCasesView } from '@/src/features/portal/views/PortalUseCasesView';
import { PortalIdentityView } from '@/src/features/portal/views/PortalIdentityView';
import { PortalCatalogsView } from '@/src/features/portal/views/PortalCatalogsView';
import { PortalConsentsView } from '@/src/features/portal/views/PortalConsentsView';
import { PortalStandardEventsView } from '@/src/features/portal/views/PortalStandardEventsView';
import { PortalQaView } from '@/src/features/portal/views/PortalQaView';

export { sharedFileUrl, buildSharedViewModel };

const VIEWS: Record<PortalView, () => React.ReactElement> = {
  overview: PortalOverview,
  events: PortalEventsView,
  properties: PortalPropertiesView,
  'use-cases': PortalUseCasesView,
  identity: PortalIdentityView,
  catalogs: PortalCatalogsView,
  consents: PortalConsentsView,
  'standard-events': PortalStandardEventsView,
  qa: PortalQaView,
};

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-8 pt-6">
      <p role="status" className="max-w-[1400px] rounded border border-amber-200 bg-amber-50 p-3 text-sm">
        {children}
      </p>
    </div>
  );
}

export function SharedProject({ token }: { token: string }) {
  const { data, comments, reloadComments } = usePortalData(token);
  const { location, navigate, hrefFor } = usePortalLocation(token);
  const summary = data.state === 'ready' ? data.summary : null;
  const index = useMemo(() => (summary ? buildPortalIndex(summary) : null), [summary]);
  const resolution = useMemo(() => (index ? resolveHash(location.hash, index, comments) : { kind: 'none' as const }), [index, location.hash, comments]);

  // An old anchor or a comment link that belongs to another view redirects there (replacing the entry).
  useEffect(() => {
    if (resolution.kind !== 'target' && resolution.kind !== 'comment') return;
    if (sameTarget(resolution.target, location.view, location.id)) return;
    navigate(resolution.target, { replace: true });
  }, [resolution, location.view, location.id, navigate]);

  const value = useMemo<Omit<PortalContextValue, 'index' | 'refIndex' | 'api' | 'fileUrl'> | null>(
    () =>
      data.state === 'ready'
        ? {
            token,
            header: data.header,
            summary: data.summary,
            comments,
            reloadComments,
            linkedComment: resolution.kind === 'comment' ? resolution.link : null,
            location,
            navigate,
            hrefFor,
          }
        : null,
    [data, token, comments, reloadComments, resolution, location, navigate, hrefFor]
  );

  if (data.state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900">This link is not valid.</h1>
          <p className="text-sm text-gray-500 mt-1">Ask whoever shared it with you for a new link.</p>
        </div>
      </div>
    );
  }
  if (!value) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  const View = VIEWS[location.view];
  const notices = (
    <>
      {resolution.kind === 'comment-invalid' && <Notice>This comment link is not valid.</Notice>}
      {resolution.kind === 'comment-unavailable' && <Notice>This comment is unavailable in this view.</Notice>}
    </>
  );
  return (
    <PortalProvider value={value}>
      <PortalShell notices={notices}>
        <View />
      </PortalShell>
    </PortalProvider>
  );
}
