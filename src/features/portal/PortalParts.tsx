/**
 * Building blocks of the client portal views (T-5-42): the page frame (the internal app's
 * `PageHeader`/`PageBody`), links between views, cross-references, and the read-only row actions
 * (comments and history through `TargetCollaboration`, copy link).
 */
import React, { useEffect, useLayoutEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { SHARED_SECTION_ICONS } from '@/src/components/layout/navIcons';
import { CommentCountButton } from '@/src/features/comments/CommentCountButton';
import { CommentsPanel } from '@/src/features/comments/CommentsPanel';
import { TargetCollaboration } from '@/src/features/comments/TargetCollaboration';
import { ViewStateScope } from '@/src/hooks/useViewState';
import { CopyLinkButton } from '@/src/features/shared/CopyLinkButton';
import { resolveReference, type Reference } from '@/src/features/shared/references';
import type { CommentEntityType } from '@/src/domain/enums';
import { commentsOn, openThreadCount, usePortal } from './PortalContext';
import { PORTAL_VIEW_LABELS, targetForAnchorHref, type PortalTarget, type PortalView } from './portalModel';

const LINK_CLASS = 'text-[var(--color-info)] hover:underline';

/** Sidebar icon per view (`navIcons.ts`, the internal sidebar's icons). */
export const PORTAL_VIEW_ICON_KEYS: Record<Exclude<PortalView, 'overview'>, string> = {
  events: 'events',
  properties: 'properties',
  'use-cases': 'use-cases',
  identity: 'identity',
  catalogs: 'catalogs',
  consents: 'consents',
  'standard-events': 'mapping',
  qa: 'findings',
};

/** Comment entity types per view, for the "n open" counts. */
export const VIEW_COMMENT_TYPES: Record<PortalView, readonly string[]> = {
  overview: [],
  events: ['event'],
  properties: ['property', 'property_definition'],
  'use-cases': ['use_case', 'requirement'],
  identity: ['identity_rule'],
  catalogs: ['catalog'],
  consents: [],
  'standard-events': [],
  qa: ['finding', 'qa_report'],
};

/** A link to another portal location: a real href (new tab, copy) that navigates in place on a plain click. */
export function PortalLink({ to: target, children, className = LINK_CLASS, ...rest }: { to: PortalTarget; children: React.ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { hrefFor, navigate } = usePortal();
  return (
    <a
      {...rest}
      href={hrefFor(target)}
      className={className}
      onClick={(event) => {
        rest.onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(target);
      }}
    >
      {children}
    </a>
  );
}

/** Renders a cross-reference as a portal link when it resolves, else as its plain label. */
export function usePortalRef() {
  const { refIndex, index } = usePortal();
  return (ref: Reference, label: React.ReactNode): React.ReactNode => {
    const resolved = resolveReference(ref, 'shared', refIndex);
    const target = resolved?.mode === 'shared' ? targetForAnchorHref(resolved.anchor, index) : null;
    return target ? <PortalLink to={target}>{label}</PortalLink> : label;
  };
}

/** Comments and history of one target, opening in a side sheet; open on a matching comment link. */
export function Collaboration({ entityType, entityId, label }: { entityType: CommentEntityType; entityId: string; label: string }) {
  const { api, comments, reloadComments, linkedComment } = usePortal();
  return (
    <TargetCollaboration
      api={api}
      entityType={entityType}
      entityId={entityId}
      label={label}
      rows={comments}
      onChanged={reloadComments}
      forceOpen={linkedComment?.entityType === entityType && linkedComment.entityId === entityId}
    />
  );
}

/** The id of a detail page's inline comments section (the header's count button jumps to it). */
export const PAGE_COMMENTS_ID = 'page-comments';

/**
 * A detail page's own target (T-5-44): comments on the page itself (`PageComments`), so the header
 * keeps a comment count that jumps there and the history button.
 */
export function PageCollaboration({ entityType, entityId, label }: { entityType: CommentEntityType; entityId: string; label: string }) {
  const { api, comments, reloadComments } = usePortal();
  const count = commentsOn(comments, entityType, entityId).length;
  return (
    <span className="inline-flex items-center gap-1">
      <CommentCountButton
        count={count}
        open={false}
        label={label}
        onClick={() => {
          const section = document.getElementById(PAGE_COMMENTS_ID);
          section?.scrollIntoView?.({ block: 'start' });
          section?.focus({ preventScroll: true });
        }}
      />
      <TargetCollaboration api={api} entityType={entityType} entityId={entityId} label={label} rows={comments} onChanged={reloadComments} showComments={false} />
    </span>
  );
}

/** The comments panel of a detail page's target, on the page (T-5-44). A comment link to this
 * target focuses its comment here (`CommentsPanel` reads the kept hash). */
export function PageComments({ entityType, entityId, className = '' }: { entityType: CommentEntityType; entityId: string; className?: string }) {
  const { api, comments, reloadComments } = usePortal();
  const rows = commentsOn(comments, entityType, entityId);
  return (
    <section id={PAGE_COMMENTS_ID} tabIndex={-1} aria-label="Comments" className={`scroll-mt-20 rounded-lg border bg-white p-4 shadow-sm outline-none ${className}`.trim()}>
      <CommentsPanel api={api} entityType={entityType} entityId={entityId} rows={rows} onChanged={reloadComments} />
    </section>
  );
}

/**
 * A list view's state scope (T-5-44): its table's search, filters, sort and expanded rows, and the
 * window scroll, are kept while the portal is open, so "back" from an item's page (the link or the
 * browser button) finds the list as it was left.
 */
export function PortalListScope({ scope, children }: { scope: string; children: React.ReactNode }) {
  const { viewState } = usePortal();
  const scrollKey = `${scope}:scrollY`;
  useLayoutEffect(() => {
    const y = viewState.get(scrollKey);
    if (typeof y === 'number' && y > 0 && !window.location.hash) window.scrollTo?.({ top: y });
  }, [viewState, scrollKey]);
  useEffect(() => {
    const save = () => viewState.set(scrollKey, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    // `navigate` announces the new location before it scrolls to the top, so the list's position is
    // still current here (scroll events alone can be throttled away).
    window.addEventListener('e3-comment-location-changed', save);
    return () => {
      window.removeEventListener('scroll', save);
      window.removeEventListener('e3-comment-location-changed', save);
    };
  }, [viewState, scrollKey]);
  return (
    <ViewStateScope store={viewState} scope={scope}>
      {children}
    </ViewStateScope>
  );
}

/** Copy link to a portal location. */
export function CopyPortalLink({ target, label }: { target: PortalTarget; label: string }) {
  const { hrefFor } = usePortal();
  return <CopyLinkButton url={hrefFor(target)} label={label} />;
}

/** The number a row's comment count shows: every comment on the target, as its comments button does. */
export function useCommentCount() {
  const { comments } = usePortal();
  return (entityType: string, entityId: string) => commentsOn(comments, entityType, entityId).length;
}

function OpenCount({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800" data-testid="open-comments-count">
      {n} open
    </span>
  );
}

/**
 * One portal page: the internal app's page header (icon, title, count, open threads, actions,
 * notes) and body. `back` adds a link to the view's list above the title on a detail page.
 */
export function PortalPage({
  view,
  title,
  count,
  actions,
  notes,
  back,
  children,
}: {
  view: PortalView;
  title?: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  notes?: React.ReactNode;
  back?: boolean;
  children: React.ReactNode;
}) {
  const { comments } = usePortal();
  const Icon = view === 'overview' ? null : SHARED_SECTION_ICONS[PORTAL_VIEW_ICON_KEYS[view]];
  return (
    <>
      <PageHeader className="space-y-2">
        {back && (
          <PortalLink to={{ view, id: null }} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft size={14} aria-hidden="true" />
            {PORTAL_VIEW_LABELS[view]}
          </PortalLink>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-2xl font-bold leading-tight text-gray-900 [overflow-wrap:anywhere]">
            {Icon && !back && <Icon size={20} className="shrink-0 text-gray-500" aria-hidden="true" />}
            {title ?? PORTAL_VIEW_LABELS[view]}
            {count !== undefined && <span className="text-base font-normal text-gray-500">({count})</span>}
            {!back && <OpenCount n={openThreadCount(comments, VIEW_COMMENT_TYPES[view])} />}
          </h1>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {notes}
      </PageHeader>
      <PageBody className="space-y-4">{children}</PageBody>
    </>
  );
}

/** A detail path whose item is not in this share (renamed, removed, or a typo). */
export function NotInShare({ view }: { view: PortalView }) {
  return (
    <PortalPage view={view} back title="Not found">
      <p className="text-sm text-gray-600">This item is not part of this tracking plan, or it has been renamed or removed.</p>
    </PortalPage>
  );
}

export { LINK_CLASS, commentsOn };
