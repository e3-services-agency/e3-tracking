import {QaReports} from '@/src/features/findings/QaReports';
/**
 * Public shared documentation view (D-48, D-50, T-4-03): `src/App.tsx` mounts this for
 * `/tracking-plan/shared/:token`, ahead of `ProtectedRoute` -- no auth header, no `AuthProvider`
 * requirement, plain `fetch`. Loads `GET /api/shared/:token` (header) then
 * `GET /api/shared/:token/tracking-document.json` (already the public projection,
 * `toPublicTrackingDocument`, D-48 amendment: no `agent_instructions`/`owners`/`identity_note`/
 * `bloomreach_project_url`/`internal_*` field) and renders the whole document read-only, reusing
 * `EventCardView` per event (D-50) with `fileUrl` pointing at `/api/shared/:token/files/*`.
 *
 * An unknown or revoked token (`GET /:token` 404 `SHARE_NOT_FOUND`) renders a plain "This link is
 * not valid" page instead of an error banner -- a share link is a client-facing URL, not an
 * authenticated one. `read` and `comment` access render identically here.
 *
 * `buildSharedViewModel`/`sharedFileUrl` are exported as plain functions (no DOM) so the event
 * ordering and file-path resolution are unit-testable without `@testing-library/react`, which this
 * repo does not depend on (D-20 uses plain-Node vitest, no jsdom).
 *
 * T-4-04 (D-49), T-4-16: comments are a `CommentCountButton` (icon + count) on each event title row,
 * use case row and requirement row; clicking it mounts a `CommentsPanel` inline, in `shared` mode
 * (`{token, access: header.access}`); the add form hides itself when `access !== 'comment'`. One `GET /comments` without filters is fetched once
 * (W1 fix round) and filtered client-side per panel (`commentsFor`); `reloadComments` is every
 * panel's `onChanged`.
 *
 * T-4-14 (client view UX): every event and use case is a collapsed row that mounts its body (and
 * its comment panels) only when expanded; `#event-<name>` anchors expand and scroll to an event;
 * each list uses an aligned semantic table with inline details; a sticky left navigation (a dropdown below 1024px) with a filter and a
 * scroll spy; empty sections are not rendered. Content width follows the internal T-4-12 constant after the sidebar. The pure
 * decisions live in `src/features/shared/viewHelpers.ts`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enumLabelOr } from '@/src/domain/enumLabels';
import { HintTh } from '@/src/components/ui/FieldHint';
import { ClassBadge } from '@/src/components/ui/ClassBadge';
import { ExampleCell, StandardMappingBlock } from '@/src/features/events/components/EventCardView';
import { formatExampleValues } from '@/src/domain/examples';
import type { FindingsSummaryView } from '@/src/domain/document/findingsSummary';
import { FindingTerm } from '@/src/components/ui/GlossaryTerm';
import { FAMILY_INFO } from '@/src/domain/findingsCatalog';
import { sourceViaLabel } from '@/src/domain/sources';
import { SourceBadge } from '@/src/components/ui/badges';
import { IdentityCodegenTabs } from '@/src/features/shared/IdentityCodegenTabs';
import { SetByCell } from '@/src/features/identity/SetByCell';
import { catalogMarketLabel } from '@/src/domain/catalogs';
import { API_BASE } from '@/src/config/env';
import { AgencyBrand } from '@/src/components/layout/AgencyBrand';
import { Button } from '@/src/components/ui/Button';
import { DefinitionCountBadge } from '@/src/components/ui/DefinitionCountBadge';
import { PAGE_MAX_WIDTH_CLASS } from '@/src/components/layout/PageShell';
import { EventCardView, CertificationBadge, type EventCardData } from '@/src/features/events/components/EventCardView';
import { TargetCollaboration } from '@/src/features/comments/TargetCollaboration';
import { CommentsPanel, type CommentPanelRow } from '@/src/features/comments/CommentsPanel';
import { useCommentLink } from '@/src/features/comments/useCommentLink';
import { parseCommentLink, resolveCommentTarget } from '@/src/features/comments/commentLinks';
import { CommentCountButton } from '@/src/features/comments/CommentCountButton';
import { CopyLinkButton } from '@/src/features/shared/CopyLinkButton';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { SHARED_SECTION_ICONS, ENTITY_ICONS, type EntityKind } from '@/src/components/layout/navIcons';
import { requirementTargetView } from '@/src/features/shared/requirementTargets';
import { findingEntity } from '@/src/features/shared/findingEntity';
import { VARIANTS_ANCHOR_PREFIX } from '@/src/features/shared/references';
import { eventCardToMarkdown, useCaseToMarkdown, propertiesToMarkdown, findingsSummaryToMarkdown } from '@/src/domain/document/markdown';
import { propertyGroupId, propertyKindGroupId, PROPERTY_CATEGORY_LABELS, formatDisplayName } from '@/src/domain/propertyCategory';
import { SharedActiveEntitySummary } from '@/src/features/shared/SharedActiveEntitySummary';
import { SharedEntityTable, SharedEntityRow } from '@/src/features/shared/SharedEntityTable';
import { SharedGoogleSignIn } from '@/src/features/shared-auth/SharedGoogleSignIn';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { SharedNav } from '@/src/features/shared/SharedNav';
import { useActiveSection } from '@/src/features/shared/useActiveSection';
import type {
  TrackingDocument,
  TrackingDocumentCustomerProperty,
  TrackingDocumentEventProperty,
} from '@/src/domain/document/trackingDocument';
import {
  sharedFileUrl,
  buildSharedViewModel,
  buildSectionIndex,
  sectionPresence,
  sharedPropertyGroups,
  sharedSectionGroups,
  filterNav,
  eventAnchors,
  eventForHash,
  EVENT_CLASS_GROUPS,
  SECTION_IDS,
  eventGroupId,
  toggleInSet,
  setExpanded,
  stickyScrollMarginPx,
  scrollTopBelowSticky,
  spyTopOffsetPx,
  STICKY_PX,
  type NavItem,
} from './sharedViewModel';

import { MarkdownView } from '@/src/components/ui/MarkdownView';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { CategoryBadge } from '@/src/components/ui/CategoryBadge';
import { SharedRefLink } from '@/src/features/shared/RefLink';
import {
  buildReferenceIndex,
  propertyIdForHash,
  resolveReference,
  type Reference,
  type ReferenceIndex,
} from '@/src/features/shared/references';
import { namingNote } from '@/src/domain/naming';

export { sharedFileUrl, buildSharedViewModel };

/** Height of the sticky page header (Tailwind `h-14`); every sticky header sits right below it (T-4-18). */
const HEADER_TOP_CLASS = 'top-14';
const marginTop = (kind: 'section' | 'group' | 'event') => ({ scrollMarginTop: stickyScrollMarginPx(kind) });

/** Quiet time after the last scroll event before a scroll counts as the reader's own. */
const SETTLE_MS = 150;

interface ShareHeader {
  project: { name: string; client_logo_path: string | null };
  client: { name: string | null };
  access: 'read' | 'comment';
  /** D-70 item 5, T-5-03: the link needs an author name for every write. */
  require_name?: boolean;
  generated_at: string | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function downloadUrl(token: string, suffix: string): string {
  return `${API_BASE}/api/shared/${encodeURIComponent(token)}/${suffix}`;
}

function leafIds(items: NavItem[]): string[] {
  return items.flatMap((i) => (i.children && i.children.length > 0 ? leafIds(i.children) : [i.id]));
}

function ExpandToggles({ onExpand, onCollapse, label }: { onExpand: () => void; onCollapse: () => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onExpand} aria-label={`Expand all ${label}`}>
        Expand all
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onCollapse} aria-label={`Collapse all ${label}`}>
        Collapse all
      </Button>
    </span>
  );
}

/** Section title with the sidebar's icon for that section (D-64, `navIcons.ts`). */
function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  const Icon = SHARED_SECTION_ICONS[id];
  return (
    <span className="inline-flex items-center gap-2">
      {Icon && <Icon size={16} className="shrink-0 text-gray-500" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** D-70: "n open" comment threads in a section's header (status open only; nothing when zero). */
function OpenCommentsCount({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800" data-testid="open-comments-count">
      {n} open
    </span>
  );
}

function SectionCard({ id, title, actions, children }: { id: string; title: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} style={marginTop('section')} className="bg-white rounded-lg border shadow-sm">
      <div
        style={{ height: STICKY_PX.sectionHeader }}
        className={`sticky ${HEADER_TOP_CLASS} z-10 flex items-center justify-between gap-2 border-b bg-white px-4`}
      >
        <h2 className="text-base font-semibold text-gray-900">
          <SectionTitle id={id}>{title}</SectionTitle>
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Sticky group header inside a section card (T-4-21): same offset as the section header, above it by z-order. */
function GroupHeader({ label, actions }: { label: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div
      style={{ height: STICKY_PX.groupHeader }}
      className={`sticky ${HEADER_TOP_CLASS} z-[15] flex items-center justify-between gap-2 bg-white`}
    >
      <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
      {actions}
    </div>
  );
}

function SimpleTable({ head, rows, definitions = false }: { head: string[]; rows: React.ReactNode[][]; definitions?: boolean }) {
  return (
    <div role="region" aria-label="Details table" tabIndex={0} className="overflow-x-auto">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            {head.map((h) => (
              <HintTh scope="col" key={h} className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">
                {h}
              </HintTh>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`${definitions && j === 0 ? 'pl-20 pr-3' : 'px-3'} py-2 align-top whitespace-pre-wrap [overflow-wrap:anywhere] text-gray-700`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PropertyItem = TrackingDocumentCustomerProperty | TrackingDocumentEventProperty;

/** One property as an aligned row (full name, type and description); expanded it shows its
 * named definitions (D-58) nested under it and, for an event property, the events that use it. */
export function SharedPropertyRow({
  property,
  anchor,
  expanded,
  onToggle,
  renderRef,
  commentButton,
  comments,
  definitionActions,
}: {
  definitionActions?: (id: string, name: string) => React.ReactNode;
  property: PropertyItem;
  commentButton?: React.ReactNode;
  comments?: React.ReactNode;
  anchor: string;
  expanded: boolean;
  onToggle: () => void;
  renderRef: (ref: Reference, label: React.ReactNode) => React.ReactNode;
}) {
  const usedIn = 'used_in_events' in property ? property.used_in_events : [];
  return (
    <SharedEntityRow anchor={anchor} name={property.name} kind="property" expanded={expanded} onToggle={onToggle}
      scrollMarginTop={stickyScrollMarginPx('event')} nameIndented nameSuffix={<DefinitionCountBadge count={property.definitions.length} />}
      cells={[property.description ?? '—', <CategoryBadge key="category" category={property.category} />, property.data_type,
        <div key="actions" className="flex min-w-[148px] flex-nowrap items-center gap-1">{commentButton}<CopyMarkdownButton iconOnly getMarkdown={() => propertiesToMarkdown([property])} label={`Copy property ${property.name} as Markdown`} /><CopyLinkButton anchor={anchor} label={property.name} /><CopyNameButton name={property.name} /></div>]}>
      {expanded && (
        <div className="space-y-2">
          {comments}
          {property.description && <p className="text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{property.description}</p>}
          {property.data_formats.length > 0 && <p className="text-xs text-gray-500 [overflow-wrap:anywhere]">Formats: {property.data_formats.map(formatDisplayName).join(', ')}</p>}
          {usedIn.length > 0 && (
            <p className="text-xs text-gray-500 [overflow-wrap:anywhere]">
              Used in:{' '}
              {usedIn.map((name, i) => (
                <React.Fragment key={name}>
                  {i > 0 && ', '}
                  {renderRef({ kind: 'event', name }, name)}
                </React.Fragment>
              ))}
            </p>
          )}
          <SimpleTable definitions
            head={['Definition', 'Description', 'Allowed values', 'Formats', 'Example', 'Actions']}
            rows={property.definitions.map((d) => [
              <span key="n" className="inline-flex max-w-full flex-wrap items-center gap-1.5 [overflow-wrap:anywhere]">
                {d.name}
                <CopyNameButton name={d.name} />
              </span>,
              d.description ?? '—',
              d.allowed_values ? d.allowed_values.map((v) => v.value).join(', ') : '—',
              d.formats.map(formatDisplayName).join(', ') || '—',
              <ExampleCell key="ex" value={formatExampleValues(d.example_values)} />,
              d.id && definitionActions ? definitionActions(d.id, d.name) : null,
            ])}
          />
        </div>
      )}
    </SharedEntityRow>
  );
}

function FindingsSummaryBlock({
  summary,
  anchorFor,
}: {
  summary: FindingsSummaryView;
  anchorFor: (eventId: string) => string | undefined;
}) {
  const ack = summary.acknowledged;
  return (
    <div className="space-y-4 text-sm text-gray-700">
      <p>
        <span className="font-semibold text-gray-900">{summary.total} open</span> — error {summary.bySeverity.error}, warning{' '}
        {summary.bySeverity.warning}, info {summary.bySeverity.info}
        {ack.total > 0 && `. Acknowledged (resolved by hand, still reproducing): error ${ack.error}, warning ${ack.warning}, info ${ack.info}`}
      </p>
      {summary.byFamily.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">By kind of problem</h4>
          <SimpleTable
            head={['Family', 'Kinds', 'Open', 'Next step']}
            rows={summary.byFamily.map((f) => [
              <span key={f.family} title={FAMILY_INFO[f.family].explanation} className="border-b border-dotted border-gray-400 cursor-help">
                {FAMILY_INFO[f.family].label}
              </span>,
              <span key="k">
                {f.kinds.map((k, i) => (
                  <React.Fragment key={k.kind}>
                    {i > 0 && ', '}
                    <FindingTerm kind={k.kind} /> ({k.count})
                  </React.Fragment>
                ))}
              </span>,
              f.total,
              FAMILY_INFO[f.family].next,
            ])}
          />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">By comparison</h4>
          <SimpleTable
            head={['Comparison', 'Error', 'Warning', 'Info']}
            rows={summary.byComparison.map((c) => [<FindingTerm key={c.comparison} comparison={c.comparison} />, c.error, c.warning, c.info])}
          />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Top events by open errors</h4>
          {summary.topEvents.length === 0 ? (
            <p className="text-xs text-gray-500">No event has an open error finding.</p>
          ) : (
            <SimpleTable
              head={['Event', 'Errors', 'All open']}
              rows={summary.topEvents.map((e) => [
                anchorFor(e.id) ? (
                  <a key={e.id} href={`#${anchorFor(e.id)}`} className="text-[var(--color-info)] hover:underline">
                    {e.name}
                  </a>
                ) : (
                  e.name
                ),
                e.errors,
                e.total,
              ])}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** A requirement's target label with its event and property parts linked where they resolve (T-4-22). */
function renderRequirementTarget(
  r: Parameters<typeof requirementTargetView>[0],
  index: ReferenceIndex,
  onNavigate: (anchor: string) => void
): React.ReactNode {
  const v = requirementTargetView(r, index);
  const Icon = ENTITY_ICONS[r.target_kind as EntityKind] ?? null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {v.typeLabel && (
        <span data-testid="target-type" className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          {Icon && <Icon size={14} aria-hidden="true" />}
          {v.typeLabel}
        </span>
      )}
      <span>
        {v.parts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 && '.'}
            {p.href && p.anchor ? (
              <SharedRefLink target={{ mode: 'shared', href: p.href, anchor: p.anchor }} onNavigate={onNavigate}>
                {p.text}
              </SharedRefLink>
            ) : (
              p.text
            )}
          </React.Fragment>
        ))}
      </span>
    </span>
  );
}

export function SharedProject({ token }: { token: string }) {
  const mainRef = useRef<HTMLElement>(null);
  const [header, setHeader] = useState<ShareHeader | null>(null);
  const [doc, setDoc] = useState<TrackingDocument | null>(null);
  const [comments, setComments] = useState<CommentPanelRow[]>([]);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());
  const [openUseCases, setOpenUseCases] = useState<Set<string>>(new Set());
  const [openProjectFindings, setOpenProjectFindings] = useState<Set<string>>(new Set());
  const [openProperties, setOpenProperties] = useState<Set<string>>(new Set());
  const [openCatalogs, setOpenCatalogs] = useState<Set<string>>(new Set());
  const [openMappings, setOpenMappings] = useState<Set<string>>(new Set());
  const [navQuery, setNavQuery] = useState('');
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());
  const commentLink = useCommentLink();
  // A nav click wins over the scroll spy until the reader scrolls again (the last sections can never reach the spy band).
  const [clickedId, setClickedId] = useState<string | null>(null);

  const reloadComments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/shared/${encodeURIComponent(token)}/comments`);
      const data = await parseJson(res);
      if (res.ok && Array.isArray(data)) setComments(data);
    } catch {
      // Best-effort refresh only -- the panel that triggered this already reported its own error
      // for the post/update that failed (L4 fix round); a failed re-fetch here just leaves the
      // previous list on screen rather than losing it.
    }
  }, [token]);

  const openCommentCount = useCallback(
    (types: string[]) => comments.filter((c) => !c.parent_id && c.status === 'open' && c.entity_type && types.includes(c.entity_type)).length,
    [comments]
  );
  const commentsFor = useCallback(
    (entityType: string, entityId: string) => comments.filter((c) => c.entity_type === entityType && c.entity_id === entityId),
    [comments]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setInvalid(false);
      try {
        const headerRes = await fetch(`${API_BASE}/api/shared/${encodeURIComponent(token)}`);
        if (!headerRes.ok) {
          if (!cancelled) setInvalid(true);
          return;
        }
        const headerData = (await parseJson(headerRes)) as ShareHeader;
        const docRes = await fetch(`${API_BASE}/api/shared/${encodeURIComponent(token)}/tracking-document.json`);
        if (!docRes.ok) {
          if (!cancelled) setInvalid(true);
          return;
        }
        const docData = (await parseJson(docRes)) as TrackingDocument;
        const commentsRes = await fetch(`${API_BASE}/api/shared/${encodeURIComponent(token)}/comments`);
        const commentsData = commentsRes.ok ? await parseJson(commentsRes) : [];
        if (!cancelled) {
          setHeader(headerData);
          setDoc(docData);
          setComments(Array.isArray(commentsData) ? commentsData : []);
        }
      } catch {
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const anchorById = useMemo(() => {
    const list = doc ? eventAnchors(doc.events.map((e) => e.name)) : [];
    return new Map((doc?.events ?? []).map((e, i) => [e.id, list[i]]));
  }, [doc]);
  const refIndex = useMemo<ReferenceIndex>(
    () => buildReferenceIndex(doc ?? { events: [], properties: [], event_properties: [] }),
    [doc]
  );
  const nav = useMemo(() => (doc ? buildSectionIndex(doc) : []), [doc]);
  const groups = useMemo(() => (doc ? sharedSectionGroups(doc) : null), [doc]);
  const filteredNav = useMemo(() => filterNav(nav, navQuery), [nav, navQuery]);
  const spyId = useActiveSection(useMemo(() => leafIds(nav), [nav]), spyTopOffsetPx());
  const activeId = clickedId ?? spyId;
  useEffect(() => {
    if (!clickedId) return;
    // The click's own (smooth or instant) scroll must not clear it: scroll events are ignored until
    // they have stopped for SETTLE_MS; the first scroll after that (wheel, scrollbar drag, autoscroll)
    // clears the click highlight. No keydown listener: Tab through the nav or typing in the filter
    // must keep it.
    let settled = false;
    let timer = window.setTimeout(() => (settled = true), SETTLE_MS);
    const onScroll = () => {
      if (settled) {
        setClickedId(null);
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (settled = true), SETTLE_MS);
    };
    const clear = () => setClickedId(null);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', clear, { passive: true });
    window.addEventListener('touchmove', clear, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', clear);
      window.removeEventListener('touchmove', clear);
    };
  }, [clickedId]);

  // Validate against both the visible discussion and the public entity inventory. A private or
  // removed target never causes entity expansion or a lookup through the internal API.
  const linkedComment = useMemo(() => {
    if (!doc || commentLink.kind !== 'target') return null;
    const target = commentLink.target;
    const resolved = resolveCommentTarget(comments.filter((comment) => !comment.internal_only), target);
    if (!resolved) return null;
    if (target.entityType==='finding'||target.entityType==='qa_report')return {...resolved,target,useCaseId:null};
    if (target.entityType === 'event') return doc.events.some((event) => event.id === target.entityId) ? { ...resolved, target, useCaseId: null } : null;
    if (target.entityType === 'property') return [...doc.properties, ...(doc.event_properties ?? [])].some((property) => property.property_id === target.entityId) ? { ...resolved, target, useCaseId: null } : null;
    if (target.entityType === 'identity_rule') return doc.identity_rules.some((r) => r.id === target.entityId) ? {...resolved,target,useCaseId:null} : null;
    if (target.entityType === 'catalog') return doc.catalogs.some((r) => r.id === target.entityId) ? {...resolved,target,useCaseId:null} : null;
    if (target.entityType === 'property_definition') return [...doc.properties,...(doc.event_properties ?? [])].some((p) => p.definitions.some((d) => d.id === target.entityId)) ? {...resolved,target,useCaseId:null} : null;
    const owner = doc.use_cases.find((useCase) => target.entityType === 'use_case' ? useCase.id === target.entityId : useCase.requirements.some((requirement) => requirement.id === target.entityId));
    return owner ? { ...resolved, target, useCaseId: owner.id } : null;
  }, [doc, comments, commentLink]);
  useEffect(() => {
    if (!linkedComment) return;
    const { target, useCaseId } = linkedComment;
    const expand = (previous: Set<string>, id: string) => previous.has(id) ? previous : new Set(previous).add(id);
    if (target.entityType === 'event') setOpenEvents((previous) => expand(previous, target.entityId));
    if (target.entityType === 'property') setOpenProperties((previous) => expand(previous, target.entityId));
    if (target.entityType === 'property_definition' && doc) { const p = [...doc.properties,...(doc.event_properties ?? [])].find((p) => p.definitions.some((d) => d.id === target.entityId)); if (p) setOpenProperties((previous) => expand(previous,p.property_id)); }
    if (useCaseId) setOpenUseCases((previous) => expand(previous, useCaseId));
    setOpenThreads((previous) => expand(previous, `${target.entityType}:${target.entityId}`));
  }, [linkedComment, doc]);

  /** Expands the event a hash points at (if any) and scrolls to the hash target once rendered. */
  const goToHash = useCallback(
    (hash: string) => {
      if (!doc || parseCommentLink(hash).kind !== 'none') return;
      const id = hash.startsWith('#') ? hash.slice(1) : hash;
      if (!id) return;
      let decoded = id;
      try {
        decoded = decodeURIComponent(id);
      } catch {
        // keep the raw text
      }
      // T-4-25: variants-event-<slug> opens the event and scrolls to its variants block.
      const variantsOf = decoded.startsWith(VARIANTS_ANCHOR_PREFIX) ? decoded.slice(VARIANTS_ANCHOR_PREFIX.length) : null;
      const event = eventForHash(variantsOf ?? id, doc.events);
      if (decoded.startsWith('findings-') && decoded.endsWith('-project')) setOpenProjectFindings((prev) => new Set(prev).add(decoded));
      if (event) setOpenEvents((prev) => (prev.has(event.id) ? prev : new Set(prev).add(event.id)));
      // T-4-22: a hash on a property row opens that row (its group is always rendered).
      const propertyId = propertyIdForHash(id, refIndex);
      if (propertyId) setOpenProperties((prev) => (prev.has(propertyId) ? prev : new Set(prev).add(propertyId)));
      if (decoded.startsWith('catalog-')) setOpenCatalogs((prev) => new Set(prev).add(decoded));
      if (groups?.mappingLeaves.some((leaf) => leaf.id === decoded)) setOpenMappings((prev) => new Set(prev).add(decoded));
      const ucItem = groups?.useCaseGroups.flatMap((g) => g.items).find((i) => i.id === id);
      if (ucItem) setOpenUseCases((prev) => new Set(prev).add(doc.use_cases[ucItem.index].id));
      if (variantsOf && event) {
        const eventEl = () => document.getElementById(variantsOf);
        const scrollToVariants = () => {
          const ev = eventEl();
          const details = document.getElementById(`${variantsOf}-details`);
          const h = document.getElementById(decoded) ?? Array.from(details?.querySelectorAll('h2') ?? []).find((el) => (el.textContent ?? '').startsWith('Variants'));
          const el = h ?? ev;
          if (!el) return;
          window.scrollTo({ top: scrollTopBelowSticky(el.getBoundingClientRect().top, window.scrollY, 0) });
        };
        requestAnimationFrame(() => requestAnimationFrame(scrollToVariants));
        return;
      }
      requestAnimationFrame(() => {
        let target: string;
        try {
          target = decodeURIComponent(id);
        } catch {
          target = id;
        }
        document.getElementById(target)?.scrollIntoView({ block: 'start' });
      });
    },
    [doc, groups, refIndex]
  );

  // Opening the URL with a hash, and hand-edited hash changes.
  useEffect(() => {
    if (!doc) return;
    goToHash(window.location.hash);
    const onHash = () => goToHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [doc, goToHash]);

  const navigateTo = useCallback(
    (id: string) => {
      window.history.replaceState(null, '', `#${id}`);
      window.dispatchEvent(new Event('e3-comment-location-changed'));
      setClickedId(id);
      goToHash(id);
    },
    [goToHash]
  );

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900">This link is not valid.</h1>
          <p className="text-sm text-gray-500 mt-1">Ask whoever shared it with you for a new link.</p>
        </div>
      </div>
    );
  }

  if (loading || !header || !doc) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  const fileUrl = (path: string) => sharedFileUrl(token, path);
  const present = sectionPresence(doc);
  if (!groups) return null;
  const api = { mode: 'shared' as const, token, access: header.access, requireName: !!header.require_name };
  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => setter((prev) => toggleInSet(prev, id));
  const toggleThread = (key: string) => setOpenThreads((prev) => toggleInSet(prev, key));
  const allEventIds = doc.events.map((e) => e.id);
  const allUseCaseIds = doc.use_cases.map((u) => u.id);
  const setEvents = (ids: string[], expanded: boolean) => setOpenEvents((prev) => setExpanded(prev, ids, expanded));
  const setUseCases = (ids: string[], expanded: boolean) => setOpenUseCases((prev) => setExpanded(prev, ids, expanded));
  // One global pair (toolbar) covers every collapsible row; the section headers keep a local pair.
  const allPropertyIds = [...doc.properties, ...(doc.event_properties ?? [])].map((p) => p.property_id);
  const expandAll = () => {
    setOpenCatalogs(new Set(doc.catalogs.map((c) => c.id ? refIndex.catalogAnchorById.get(c.id) ?? c.name : c.name)));
    setOpenMappings(new Set(groups.mappingLeaves.map((m) => m.id)));
    setOpenProjectFindings(new Set(groups.findingGroups.flatMap((g) => g.leaves.filter((l) => l.id.endsWith('-project')).map((l) => l.id))));
    setEvents(allEventIds, true);
    setUseCases(allUseCaseIds, true);
    setOpenProperties((prev) => setExpanded(prev, allPropertyIds, true));
  };
  const collapseAll = () => {
    setOpenCatalogs(new Set());
    setOpenMappings(new Set());
    setOpenProjectFindings(new Set());
    setEvents(allEventIds, false);
    setUseCases(allUseCaseIds, false);
    setOpenProperties((prev) => setExpanded(prev, allPropertyIds, false));
  };
  const linkClass = 'text-[var(--color-info)] hover:underline';
  /** A reference rendered as a same-page link when it resolves, else as plain text (T-4-22). */
  const renderRef = (ref: Reference, label: React.ReactNode): React.ReactNode => {
    const target = resolveReference(ref, 'shared', refIndex);
    return target && target.mode === 'shared' ? (
      <SharedRefLink target={target} onNavigate={navigateTo}>
        {label}
      </SharedRefLink>
    ) : (
      label
    );
  };
  const namingLine = (
    <p data-testid="naming-note" className="text-xs text-gray-500">
      {namingNote(doc.project.naming_convention ?? 'snake_case')}
    </p>
  );

  return (
    <div className="min-h-screen bg-[var(--surface-default)] font-sans text-gray-900">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-white/10 bg-[var(--e3-space-blue)] px-4 sm:px-6">
        <AgencyBrand />
      </header>

      <div className="w-full px-4 py-6 sm:px-8 lg:flex lg:items-start lg:gap-6">
        <SharedNav
          items={filteredNav}
          allItems={nav}
          activeId={activeId}
          query={navQuery}
          onQuery={setNavQuery}
          onNavigate={navigateTo}
        />

        <main ref={mainRef} className={`flex-1 min-w-0 space-y-6 ${PAGE_MAX_WIDTH_CLASS}`}>
          <SharedActiveEntitySummary container={mainRef} revision={JSON.stringify([[...openEvents], [...openProperties], [...openUseCases], [...openCatalogs], [...openMappings], [...openProjectFindings]])} />
          <div className="space-y-4 border-b border-[var(--border-default)] pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
                {header.project.client_logo_path && <img src={fileUrl(header.project.client_logo_path)} alt="" className="h-10 w-10 shrink-0 object-contain" />}
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold leading-tight [overflow-wrap:anywhere]">{header.project.name}</h1>
                  {header.client.name && <p className="mt-1 text-sm text-gray-500 [overflow-wrap:anywhere]">{header.client.name}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(present.events || present.properties || present.useCases || present.catalogs || present.mapping) && <ExpandToggles label="rows" onExpand={expandAll} onCollapse={collapseAll} />}
                <Button variant="outline" size="sm" asChild><a href="#qa-reports">QA reports</a></Button>
                <Button variant="outline" size="sm" asChild><a href={downloadUrl(token, 'tracking-document.json')}>JSON</a></Button>
                <Button variant="outline" size="sm" asChild><a href={downloadUrl(token, 'documentation.html')}>HTML</a></Button>
              </div>
            </div>
            <SharedGoogleSignIn token={token} />
          </div>
          {commentLink.kind === 'invalid' && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">This comment link is not valid.</p>}
          {commentLink.kind === 'target' && !linkedComment && !loading && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">This comment is unavailable in this view.</p>}
          {present.events && (
            <section id={SECTION_IDS.events} style={marginTop('section')} className="space-y-3">
              <h2
                style={{ height: STICKY_PX.sectionHeader }}
                className={`sticky ${HEADER_TOP_CLASS} z-10 flex items-center bg-gray-50 text-lg font-semibold text-gray-900`}
              >
                <SectionTitle id={SECTION_IDS.events}>
                  Events ({doc.events.length})
                  <OpenCommentsCount n={openCommentCount(['event'])} />
                </SectionTitle>
              </h2>
              {namingLine}
              {(doc.sources ?? []).length > 0 && (
                <p className="text-xs text-gray-500 [overflow-wrap:anywhere]" data-testid="shared-sources">
                  Collected from:{' '}
                  {(doc.sources ?? []).map((s) => `${s.name} (${sourceViaLabel(s.system, s.method)}, ${s.event_count} event${s.event_count === 1 ? '' : 's'})`).join('; ')}
                </p>
              )}
              {EVENT_CLASS_GROUPS.map(({ cls, label }) => {
                const inGroup = doc.events.filter((e) => e.class === cls);
                if (inGroup.length === 0) return null;
                return (
                  <div key={cls} id={eventGroupId(cls)} style={marginTop('group')} className="space-y-3">
                    <div
                      style={{ height: STICKY_PX.groupHeader }}
                      className={`sticky ${HEADER_TOP_CLASS} z-[15] flex items-center justify-between gap-2 bg-gray-50`}
                    >
                      <h3 className="text-sm font-semibold text-gray-700">
                        {label} ({inGroup.length})
                      </h3>
                      <ExpandToggles
                        label={label.toLowerCase()}
                        onExpand={() => setEvents(inGroup.map((e) => e.id), true)}
                        onCollapse={() => setEvents(inGroup.map((e) => e.id), false)}
                      />
                    </div>
                    <SharedEntityTable label={label} columns={[
                      { label: 'Name', width: '24%' }, { label: 'Description', width: '28%' }, { label: 'Sources', width: '19%' },
                      { label: 'Certification', width: '140px' }, { label: 'Actions', width: '180px' },
                    ]}>
                    {inGroup.map((event) => {
                      const expanded = openEvents.has(event.id);
                      const anchor = anchorById.get(event.id) as string;
                      return (
                        <SharedEntityRow key={event.id} anchor={anchor} name={event.name} kind="event"
                          expanded={expanded} onToggle={() => toggle(setOpenEvents, event.id)} scrollMarginTop={stickyScrollMarginPx('event')}
                          badges={<ClassBadge eventClass={event.class} />} cells={[
                            event.description ?? '—',
                            <div key="sources" className="flex flex-wrap gap-1.5">{(event.sources ?? []).length ? event.sources!.map((s) => (
                              <SourceBadge key={s.id} system={s.system} method={s.method} color={s.color} className="max-w-full !whitespace-normal [overflow-wrap:anywhere]" />
                            )) : '—'}</div>,
                            <CertificationBadge key="certification" certification={event.certification} compact />,

                            <div key="actions" className="flex min-w-[148px] flex-nowrap items-center gap-1"><CommentCountButton key="comments"
                              count={commentsFor('event', event.id).length}
                              open={openThreads.has(`event:${event.id}`)}
                              label={`event ${event.name}`}
                              onClick={() => {
                                if (!expanded) {
                                  setOpenEvents((prev) => new Set(prev).add(event.id));
                                  setOpenThreads((prev) => new Set(prev).add(`event:${event.id}`));
                                } else toggleThread(`event:${event.id}`);
                              }}
                            /><CopyMarkdownButton iconOnly getMarkdown={() => eventCardToMarkdown(event)} label={`Copy event ${event.name} as Markdown`} /><CopyLinkButton anchor={anchor} label={event.name} /><CopyNameButton name={event.name} /></div>,
                          ]}>
                          {expanded && (
                            <div>
                              {openThreads.has(`event:${event.id}`) && (
                                <div className="mb-4">
                                  <CommentsPanel
                                    entityType="event"
                                    entityId={event.id}
                                    api={api}
                                    rows={commentsFor('event', event.id)}
                                    onChanged={reloadComments}
                                  />
                                </div>
                              )}
                              <EventCardView
                                card={event as unknown as EventCardData}
                                identifyCodegen={doc.identity_codegen?.identify ?? null}
                                fileUrl={fileUrl}
                                mode="shared"
                                hideHeader
                                renderPropertyLink={(p, label) => renderRef({ kind: 'property', id: p.property_id }, label)}
                              />
                            </div>
                          )}
                        </SharedEntityRow>
                      );
                    })}
                    </SharedEntityTable>
                  </div>
                );
              })}
            </section>
          )}

          {present.properties && (() => {
            const groups = sharedPropertyGroups<PropertyItem>(doc as unknown as { properties: PropertyItem[]; event_properties?: PropertyItem[] });
            const totalProperties = doc.properties.length + (doc.event_properties?.length ?? 0);
            const setProperties = (ids: string[], expanded: boolean) => setOpenProperties((prev) => setExpanded(prev, ids, expanded));
            const renderRows = (items: PropertyItem[]) => (
              <SharedEntityTable label="Properties" columns={[
                { label: 'Name', width: '28%' }, { label: 'Description', width: '32%' }, { label: 'Category', width: '15%' }, { label: 'Type', width: '9%' }, { label: 'Actions', width: '180px' },
              ]}>
              {items.map((p) => (
                <SharedPropertyRow
                  key={p.property_id}
                  property={p}
                  anchor={refIndex.propertyAnchorById.get(p.property_id) ?? p.property_id}
                  renderRef={renderRef}
                  expanded={openProperties.has(p.property_id)}
                  onToggle={() => toggle(setOpenProperties, p.property_id)}
                  definitionActions={(id, name) => <TargetCollaboration api={api} entityType="property_definition" entityId={id} label={`${p.name}: ${name}`} rows={comments} onChanged={reloadComments} forceOpen={linkedComment?.target.entityId === id} />}
                  commentButton={<CommentCountButton count={commentsFor('property', p.property_id).length} open={openThreads.has(`property:${p.property_id}`)} label={p.name} onClick={() => {
                    setOpenProperties((previous) => new Set(previous).add(p.property_id));
                    toggleThread(`property:${p.property_id}`);
                  }} />}
                  comments={openThreads.has(`property:${p.property_id}`) ? <CommentsPanel entityType="property" entityId={p.property_id} api={api} rows={commentsFor('property', p.property_id)} onChanged={reloadComments} /> : undefined}
                />
              ))}
              </SharedEntityTable>
            );
            return (
              <section id={SECTION_IDS.properties} style={marginTop('section')} className="space-y-3">
                <h2
                  style={{ height: STICKY_PX.sectionHeader }}
                  className={`sticky ${HEADER_TOP_CLASS} z-10 flex items-center justify-between gap-2 bg-gray-50 text-lg font-semibold text-gray-900`}
                >
                  <SectionTitle id={SECTION_IDS.properties}>Properties ({totalProperties})</SectionTitle>
                  <CopyMarkdownButton
                    getMarkdown={() => propertiesToMarkdown([...doc.properties, ...(doc.event_properties ?? [])])}
                    label="Copy properties as Markdown"
                  />
                </h2>
                {namingLine}
                {groups.map((group) => (
                  <div key={group.category} id={propertyGroupId(group.category)} style={marginTop('group')} className="space-y-3">
                    <div
                      style={{ height: STICKY_PX.groupHeader }}
                      className={`sticky ${HEADER_TOP_CLASS} z-[15] flex items-center justify-between gap-2 border-y border-[var(--border-default)] bg-gray-100 px-3`}
                    >
                      <h3 className="text-sm font-semibold text-gray-700">
                        {PROPERTY_CATEGORY_LABELS[group.category]} ({group.items.length})
                      </h3>
                      <ExpandToggles
                        label={PROPERTY_CATEGORY_LABELS[group.category].toLowerCase()}
                        onExpand={() => setProperties(group.items.map((p) => p.property_id), true)}
                        onCollapse={() => setProperties(group.items.map((p) => p.property_id), false)}
                      />
                    </div>
                    {group.subgroups.length > 0
                      ? group.subgroups.map((sub) => (
                          <div key={sub.kind} id={propertyKindGroupId(sub.kind)} style={marginTop('event')} className="space-y-2">
                            <h4 className="pl-4 text-xs font-semibold uppercase text-gray-500">
                              {sub.label} ({sub.items.length})
                            </h4>
                            {renderRows(sub.items)}
                          </div>
                        ))
                      : renderRows(group.items)}
                  </div>
                ))}
              </section>
            );
          })()}

          {present.useCases && (
            <SectionCard
              id={SECTION_IDS.useCases}
              title={<>{`Use cases (${doc.use_cases.length})`}<OpenCommentsCount n={openCommentCount(['use_case', 'requirement'])} /></>}
              actions={<ExpandToggles label="use cases" onExpand={() => setUseCases(allUseCaseIds, true)} onCollapse={() => setUseCases(allUseCaseIds, false)} />}
            >
              <div className="space-y-4">
                {groups.useCaseGroups.map((g) => (
                  <div key={g.id} id={g.id} style={marginTop('group')} className="space-y-2">
                    <GroupHeader
                      label={`${g.label} (${g.items.length})`}
                      actions={
                        <ExpandToggles
                          label={g.label.toLowerCase()}
                          onExpand={() => setUseCases(g.items.map((i) => i.uc.id as string), true)}
                          onCollapse={() => setUseCases(g.items.map((i) => i.uc.id as string), false)}
                        />
                      }
                    />
                <SharedEntityTable label={g.label} columns={[
                  { label: 'Name', width: '30%' }, { label: 'Description', width: '36%' }, { label: 'Status', width: '12%' }, { label: 'Actions', width: '22%' },
                ]}>
                {g.items.map(({ index, id: ucAnchor }) => {
                  const uc = doc.use_cases[index];
                  const expanded = openUseCases.has(uc.id);
                  return (
                    <SharedEntityRow key={uc.id} anchor={ucAnchor} name={`${uc.code ? `${uc.code} — ` : ''}${uc.name}`} kind="use_case"
                      expanded={expanded} onToggle={() => toggle(setOpenUseCases, uc.id)} scrollMarginTop={stickyScrollMarginPx('event')}
                      cells={[
                        uc.narrative ? <MarkdownView key="description" source={uc.narrative} /> : '—',
                        enumLabelOr('status', uc.status) || '—',

                        <div key="actions" className="flex flex-wrap items-center gap-2"><CommentCountButton key="comments"
                          count={commentsFor('use_case', uc.id).length}
                          open={openThreads.has(`use_case:${uc.id}`)}
                          label={`use case ${uc.name}`}
                          onClick={() => {
                            if (!expanded) {
                              setOpenUseCases((prev) => new Set(prev).add(uc.id));
                              setOpenThreads((prev) => new Set(prev).add(`use_case:${uc.id}`));
                            } else toggleThread(`use_case:${uc.id}`);
                          }}
                        /><CopyMarkdownButton iconOnly getMarkdown={() => useCaseToMarkdown(uc)} label={`Copy use case ${uc.name} as Markdown`} /><CopyLinkButton anchor={ucAnchor} label={uc.name} /><CopyNameButton name={uc.name} />
                        {uc.documentation_url && (
                          <a href={uc.documentation_url} target="_blank" rel="noreferrer" className={`text-xs ${linkClass}`}>
                            Documentation
                          </a>
                        )}
                        </div>,
                      ]}>
                      {expanded && (
                        <div className="px-3 pb-3">
                          {uc.requirements.length > 0 && (
                            <div className="overflow-x-auto mt-2">
                              <table className="w-full table-fixed text-left text-xs">
                                <thead className="bg-gray-50 border-b">
                                  <tr>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Target</HintTh>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Level</HintTh>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Status</HintTh>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500 text-right" hintScope="Shared">Actions</HintTh>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {uc.requirements.map((r) => (
                                    <React.Fragment key={r.id}>
                                      <tr>
                                        <td className="px-3 py-2 [overflow-wrap:anywhere]">{renderRequirementTarget(r, refIndex, navigateTo)}</td>
                                        <td className="px-3 py-2">{enumLabelOr('level', r.level) || '—'}</td>
                                        <td className="px-3 py-2">{enumLabelOr('status', r.status) || '—'}</td>
                                        <td className="px-3 py-2 text-right">
                                          <CommentCountButton key="comments"
                                            count={commentsFor('requirement', r.id).length}
                                            open={openThreads.has(`requirement:${r.id}`)}
                                            label="this requirement"
                                            onClick={() => toggleThread(`requirement:${r.id}`)}
                                          />
                                        </td>
                                      </tr>
                                      {openThreads.has(`requirement:${r.id}`) && (
                                        <tr>
                                          <td colSpan={4} className="px-3 pb-2">
                                            <CommentsPanel
                                              entityType="requirement"
                                              entityId={r.id}
                                              api={api}
                                              title="Comments on this requirement"
                                              rows={commentsFor('requirement', r.id)}
                                              onChanged={reloadComments}
                                            />
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {openThreads.has(`use_case:${uc.id}`) && (
                            <CommentsPanel
                              entityType="use_case"
                              entityId={uc.id}
                              api={api}
                              rows={commentsFor('use_case', uc.id)}
                              onChanged={reloadComments}
                            />
                          )}
                        </div>
                      )}
                    </SharedEntityRow>
                  );
                })}
                </SharedEntityTable>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {present.identity && (
            <SectionCard id={SECTION_IDS.identity} title={`Identity rules (${doc.identity_rules.length})`}>
              {doc.identifiers && doc.identifiers.length > 0 && (
                <div className="mb-3" data-testid="shared-identifiers">
                  <h3 className="text-sm font-semibold text-gray-900">Identifiers</h3>
                  {(['hard', 'soft'] as const).map((type) => (
                    <div key={type} className="mt-1">
                      <p className="text-xs font-medium text-gray-500">{type === 'hard' ? 'Hard IDs' : 'Soft IDs'}</p>
                      <SimpleTable head={['Name', 'Description', 'Cookie']} rows={doc.identifiers!.filter((i) => i.type === type).map((i) => [
                        <span key="name" className="inline-flex items-start gap-1.5"><SHARED_SECTION_ICONS.identity size={14} className="shrink-0" aria-hidden="true" />{i.name}<CopyNameButton name={i.name} /></span>,
                        i.description ?? '—', i.is_cookie ? 'yes' : '—',
                      ])} />
                    </div>
                  ))}
                </div>
              )}
              {doc.identification_flow && (
                <div className="mb-3" data-testid="shared-identification-flow">
                  <h3 className="text-sm font-semibold text-gray-900">Identification flow</h3>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{doc.identification_flow}</p>
                </div>
              )}
              {doc.identity_codegen && (
                <div className="mb-3 space-y-2" data-testid="shared-identity-codegen">
                  {(['identify', 'update', 'anonymize'] as const).map((k) => (
                    <div key={k}>
                      <h3 className="text-sm font-semibold text-gray-900">{k}</h3>
                      <IdentityCodegenTabs snippets={doc.identity_codegen![k]} />
                    </div>
                  ))}
                </div>
              )}
              <SimpleTable
                head={['Name', 'Identifier', 'Type', 'SDK call', 'Transformations', 'Trigger', 'Set by', 'Carried by', 'Actions']}
                rows={doc.identity_rules.map((r) => [
                  <span key="name" className="inline-flex items-start gap-1.5"><SHARED_SECTION_ICONS.identity size={14} className="shrink-0" aria-hidden="true" />{r.name}<CopyNameButton name={r.name} /></span>,
                  r.identifier_name,
                  r.identity_type,
                  r.sdk_call ?? '—',
                  r.transformations.join(', ') || '—',
                  r.trigger_text ?? '—',
                  <SetByCell key="sb" setBy={r.set_by} binds={r.binds} />,
                  (r.carried_by ?? []).join(', ') || '—',
                  <TargetCollaboration key="collaboration" api={api} entityType="identity_rule" entityId={r.id} label={r.name} rows={comments} onChanged={reloadComments} forceOpen={linkedComment?.target.entityId === r.id} />,
                ])}
              />
            </SectionCard>
          )}

          {present.consents && (
            <SectionCard id={SECTION_IDS.consents} title={`Consent categories (${doc.consent_categories.length})`}>
              <div className="space-y-4">
                {groups.consentGroups.map((g) => (
                  <div key={g.id} id={g.id} style={marginTop('group')} className="space-y-2">
                    <GroupHeader label={`${g.label} (${g.items.length})`} />
                    <SimpleTable
                      head={['Name', 'Standard key', 'Status']}
                      rows={g.items.map(({ category: c, id }) => [
                        <span key={id} id={id} style={marginTop('event')} className="inline-flex flex-wrap items-center gap-1.5">
                          <EntityIcon kind="consent" />{c.name}
                          <CopyNameButton name={c.name} />
                        </span>,
                        c.standard_key ?? '—',
                        enumLabelOr('status', (c as { status?: string | null }).status) || '—',
                      ])}
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {present.catalogs && (
            <SectionCard id={SECTION_IDS.catalogs} title={`Catalogs (${doc.catalogs.length})`}
              actions={<ExpandToggles label="catalogs" onExpand={() => setOpenCatalogs(new Set(doc.catalogs.map((c) => c.id ? refIndex.catalogAnchorById.get(c.id) ?? c.name : c.name)))} onCollapse={() => setOpenCatalogs(new Set())} />}>
              <SharedEntityTable label="Catalogs" columns={[
                { label: 'Name', width: '24%' }, { label: 'Description', width: '35%' }, { label: 'Market', width: '14%' }, { label: 'Status', width: '12%' }, { label: 'Fields', width: '7%' }, { label: 'Actions', width: '8%' },
              ]}>
                {doc.catalogs.map((c) => {
                  const meta = [
                    c.kind ? `${c.kind} catalog` : '',
                    catalogMarketLabel(c.market, c.language) ? `market: ${catalogMarketLabel(c.market, c.language)}` : '',
                    c.version ? `version: ${c.version}${c.live_at ? ' (live)' : ''}` : '',
                    typeof c.searchable_count === 'number' ? `${c.searchable_count} searchable` : '',
                    c.lookup_key ? `lookup key: ${c.lookup_key}` : '',
                    c.mapping_role ? `mapping role: ${c.mapping_role}` : '',
                    enumLabelOr('status', c.status),
                    c.source_system ? `source: ${c.source_system}` : '',
                    c.sync_method ? `sync: ${c.sync_method}` : '',
                    c.update_frequency ? `updates: ${c.update_frequency}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const fields = c.fields ?? [];
                  const mapped = c.mapped_properties ?? [];
                  const anchor = c.id ? refIndex.catalogAnchorById.get(c.id) ?? c.name : c.name;
                  const expanded = openCatalogs.has(anchor);
                  return (
                    <SharedEntityRow key={c.id ?? c.name} anchor={anchor} name={c.name} kind="catalog" expanded={expanded}
                      onToggle={() => toggle(setOpenCatalogs, anchor)} scrollMarginTop={stickyScrollMarginPx('event')}
                      cells={[c.description ?? '—', catalogMarketLabel(c.market, c.language) || '—', enumLabelOr('status', c.status) || '—', fields.length,
                        <div key="actions" className="flex flex-wrap gap-1">{c.id && <TargetCollaboration api={api} entityType="catalog" entityId={c.id} label={c.name} rows={comments} onChanged={reloadComments} forceOpen={linkedComment?.target.entityId === c.id} />}<CopyNameButton name={c.name} /><CopyLinkButton anchor={anchor} label={c.name} /></div>]}>
                      {meta && <p className="text-xs text-gray-500 [overflow-wrap:anywhere]">{meta}</p>}
                      {fields.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">No fields defined.</p>
                      ) : (
                        <div className="mt-2">
                          <SimpleTable
                            head={['Field', 'Type', 'Lookup key', 'Searchable', 'Description']}
                            rows={fields.map((f) => [<span key={f.name} className="inline-flex flex-wrap items-center gap-1.5">{f.name}<CopyNameButton name={f.name} /></span>, f.data_type ?? '—', f.is_lookup_key ? 'yes' : '—', f.is_searchable ? 'yes' : '—', f.description ?? '—'])}
                          />
                        </div>
                      )}
                      {mapped.length > 0 && (
                        <div className="mt-3">
                          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">{c.kind === 'product' || c.kind === 'variant' ? `Looked up by (all ${c.kind} catalogs)` : 'Properties that look up into this catalog'}</h4>
                          <SimpleTable
                            head={['Property', 'Scope', 'Catalog field']}
                            rows={mapped.map((m) => [
                              renderRef({ kind: 'property', name: m.property_name, scope: m.scope }, m.property_name),
                              m.scope,
                              m.field_name ?? '—',
                            ])}
                          />
                        </div>
                      )}
                    </SharedEntityRow>
                  );
                })}
              </SharedEntityTable>
            </SectionCard>
          )}

          {present.mapping && (
            <SectionCard id={SECTION_IDS.mapping} title={`Standard event mappings (${doc.standard_event_mappings.length})`}
              actions={<ExpandToggles label="mappings" onExpand={() => setOpenMappings(new Set(groups.mappingLeaves.map((m) => m.id)))} onCollapse={() => setOpenMappings(new Set())} />}>
              <SharedEntityTable label="Standard event mappings" columns={[
                { label: 'Standard event', width: '25%' }, { label: 'Project event', width: '28%' }, { label: 'Variant', width: '27%' }, { label: 'Fields mapped', width: '12%' }, { label: 'Actions', width: '8%' },
              ]}>
                {groups.mappingLeaves.map(({ index, id }) => {
                  const mapping = doc.standard_event_mappings[index];
                  return <SharedEntityRow key={id} anchor={id} name={mapping.standard_event} kind="event"
                    expanded={openMappings.has(id)} onToggle={() => toggle(setOpenMappings, id)} scrollMarginTop={stickyScrollMarginPx('event')}
                    cells={[renderRef({ kind: 'event', name: mapping.event_name }, mapping.event_name), mapping.variant_name ?? '—',
                      `${Object.values(mapping.field_map).filter(Boolean).length} / ${Object.keys(mapping.field_map).length}`,
                      <div key="actions" className="flex flex-wrap gap-1"><CopyNameButton name={mapping.standard_event} /><CopyLinkButton anchor={id} label={mapping.standard_event} /></div>]}>
                    <StandardMappingBlock mapping={mapping} eventName={mapping.event_name} />
                  </SharedEntityRow>;
                })}
              </SharedEntityTable>
            </SectionCard>
          )}

          <QaReports api={api} rows={comments} onChanged={reloadComments} currentFindingIds={[...doc.events.flatMap(e=>e.findings),...(doc.unattached_findings??[])].map(f=>f.id)}/>
          {present.findings && (
            <SectionCard
              id={SECTION_IDS.findings}
              title="Findings summary"
              actions={<CopyMarkdownButton getMarkdown={() => findingsSummaryToMarkdown(groups.summary)} label="Copy findings as Markdown" />}
            >
              <FindingsSummaryBlock summary={groups.summary} anchorFor={(eventId) => anchorById.get(eventId)} />
              <div className="space-y-2" aria-label="Individual finding discussions">{[...doc.events.flatMap(e=>e.findings),...(doc.unattached_findings??[])].map(f=><div key={f.id} className="border-t py-2"><p className="text-sm leading-relaxed break-words">Finding #{String(f.finding_sequence??'').padStart(3,'0')} / {f.message}</p><TargetCollaboration api={api} entityType="finding" entityId={f.id} label={`Finding #${String(f.finding_sequence??'').padStart(3,'0')}`} rows={comments} onChanged={reloadComments} forceOpen={linkedComment?.target.entityId===f.id}/></div>)}</div>
              <div className="mt-4 space-y-4">
                {groups.findingGroups.map((g) => (
                  <div key={g.id} id={g.id} style={marginTop('group')} className="space-y-2">
                    <GroupHeader
                      label={
                        <>
                          <FindingTerm comparison={g.comparison} /> ({g.total})
                        </>
                      }
                    />
                    <SharedEntityTable label={`${g.comparison} findings`} columns={[{ label: 'Entity', width: '65%' }, { label: 'Open findings', width: '20%' }, { label: 'Actions', width: '15%' }]}>
                      {g.leaves.map((l) => {
                        if (l.id.endsWith('-project')) {
                          const open = openProjectFindings.has(l.id);
                          const rows = (doc.unattached_findings ?? []).filter((f) => f.comparison === g.comparison);
                          return <SharedEntityRow key={l.id} anchor={l.id} name={l.label}
                            expanded={open} onToggle={() => toggle(setOpenProjectFindings, l.id)} scrollMarginTop={stickyScrollMarginPx('event')}
                            cells={[l.count, <CopyLinkButton key="link" anchor={l.id} label={l.label} />]}>
                            <div data-testid="project-findings">
                              <SimpleTable head={['Kind', 'Severity', 'Entity', 'Description']} rows={rows.map((f) => {
                                const ent = findingEntity(f, refIndex, { catalogs: SECTION_IDS.catalogs, consents: SECTION_IDS.consents });
                                return [<FindingTerm key="kind" kind={f.kind} />, f.severity,
                                  ent.href ? <a key="entity" href={ent.href} className={linkClass} onClick={(e) => { e.preventDefault(); navigateTo(ent.href!.slice(1)); }}>{ent.type}: {ent.label ?? 'open section'}</a> : [ent.type, ent.label].filter(Boolean).join(': ') || '—',
                                  f.message ?? '—'];
                              })} />
                            </div>
                          </SharedEntityRow>;
                        }
                        return <tr key={l.id} id={l.id} style={marginTop('event')}>
                          <th scope="row" className="px-3 py-3 text-left font-medium [overflow-wrap:anywhere]">
                            {l.cardAnchor ? <a href={`#${l.cardAnchor}`} className={linkClass} onClick={(e) => { e.preventDefault(); navigateTo(l.cardAnchor!); }}><EntityIcon kind="event" className="mr-1 inline" />{l.label}</a> : l.label}
                          </th>
                          <td className="px-3 py-3 text-gray-600">{l.count}</td>
                          <td className="px-3 py-3"><CopyLinkButton anchor={l.id} label={l.label} /></td>
                        </tr>;
                      })}
                    </SharedEntityTable>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </main>
      </div>
    </div>
  );
}
