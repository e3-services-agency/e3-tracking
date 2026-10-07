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
 * its comment panels) only when expanded; `#event-<name>` anchors expand and scroll to an event; an
 * expanded event's title row sticks under the page header (sticky inside its own wrapper, so the
 * next event takes over); a sticky left navigation (a dropdown below 1024px) with a filter and a
 * scroll spy; empty sections are not rendered. Width follows the T-4-12 constant. The pure
 * decisions live in `src/features/shared/viewHelpers.ts`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HintTh } from '@/src/components/ui/FieldHint';
import { ClassBadge } from '@/src/components/ui/ClassBadge';
import { ExampleCell, StandardMappingBlock } from '@/src/features/events/components/EventCardView';
import { formatExampleValues } from '@/src/domain/examples';
import type { FindingsSummaryView } from '@/src/domain/document/findingsSummary';
import { FindingTerm } from '@/src/components/ui/GlossaryTerm';
import { FAMILY_INFO } from '@/src/domain/findingsCatalog';
import { sourceViaLabel } from '@/src/domain/sources';
import { SourceBadge } from '@/src/components/ui/badges';
import { SetByCell } from '@/src/features/identity/SetByCell';
import { catalogMarketLabel } from '@/src/domain/catalogs';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE } from '@/src/config/env';
import { PAGE_MAX_WIDTH_CLASS } from '@/src/components/layout/PageShell';
import { EventCardView, CertificationBadge, type EventCardData } from '@/src/features/events/components/EventCardView';
import { CommentsPanel, type CommentPanelRow } from '@/src/features/comments/CommentsPanel';
import { CommentCountButton } from '@/src/features/comments/CommentCountButton';
import { CopyLinkButton } from '@/src/features/shared/CopyLinkButton';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { SHARED_SECTION_ICONS, ENTITY_ICONS, type EntityKind } from '@/src/components/layout/navIcons';
import { requirementTargetView } from '@/src/features/shared/requirementTargets';
import { findingEntity } from '@/src/features/shared/findingEntity';
import { VARIANTS_ANCHOR_PREFIX } from '@/src/features/shared/references';
import { propertiesToMarkdown, findingsSummaryToMarkdown } from '@/src/domain/document/markdown';
import { propertyGroupId, propertyKindGroupId, PROPERTY_CATEGORY_LABELS, formatDisplayName } from '@/src/domain/propertyCategory';
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
  oneLineDescription,
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
  const btn = 'rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50';
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={btn} onClick={onExpand} aria-label={`Expand all ${label}`}>
        Expand all
      </button>
      <button type="button" className={btn} onClick={onCollapse} aria-label={`Collapse all ${label}`}>
        Collapse all
      </button>
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

function SectionCard({ id, title, actions, children }: { id: string; title: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} style={marginTop('section')} className="bg-white rounded-lg border shadow-sm">
      <div
        style={{ height: STICKY_PX.sectionHeader }}
        className={`sticky ${HEADER_TOP_CLASS} z-10 flex items-center justify-between gap-2 border-b bg-white px-4`}
      >
        <h2 className="text-sm font-semibold text-gray-900">
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

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            {head.map((h) => (
              <HintTh key={h} className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">
                {h}
              </HintTh>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-700">
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

/** One property as a collapsed row (name, type, one-line description); expanded it shows its
 * named definitions (D-58) nested under it and, for an event property, the events that use it. */
function PropertyRow({
  property,
  anchor,
  expanded,
  onToggle,
  renderRef,
}: {
  property: PropertyItem;
  anchor: string;
  expanded: boolean;
  onToggle: () => void;
  renderRef: (ref: Reference, label: React.ReactNode) => React.ReactNode;
}) {
  const usedIn = 'used_in_events' in property ? property.used_in_events : [];
  return (
    <div id={anchor} style={marginTop('event')} className="bg-white rounded-lg border shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex flex-1 min-w-0 items-center gap-2 text-left">
          {expanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
          <span className="font-semibold text-gray-900 truncate">{property.name}</span>
          <CategoryBadge category={property.category} className="shrink-0" />
          <span className="shrink-0 text-xs text-gray-500">({property.data_type})</span>
          {!expanded && property.description && (
            <span className="hidden sm:block min-w-0 truncate text-sm text-gray-500">{oneLineDescription(property.description)}</span>
          )}
        </button>
        <CopyNameButton name={property.name} />
      </div>
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2">
          {property.description && <p className="text-sm text-gray-700">{property.description}</p>}
          {property.data_formats.length > 0 && <p className="text-xs text-gray-500">Formats: {property.data_formats.map(formatDisplayName).join(', ')}</p>}
          {usedIn.length > 0 && (
            <p className="text-xs text-gray-500">
              Used in:{' '}
              {usedIn.map((name, i) => (
                <React.Fragment key={name}>
                  {i > 0 && ', '}
                  {renderRef({ kind: 'event', name }, name)}
                </React.Fragment>
              ))}
            </p>
          )}
          <SimpleTable
            head={['Definition', 'Description', 'Allowed values', 'Formats', 'Example']}
            rows={property.definitions.map((d) => [
              <span key="n" className="inline-flex items-center gap-1.5">
                {d.name}
                <CopyNameButton name={d.name} />
              </span>,
              d.description ?? '—',
              d.allowed_values ? d.allowed_values.map((v) => v.value).join(', ') : '—',
              d.formats.map(formatDisplayName).join(', ') || '—',
              <ExampleCell key="ex" value={formatExampleValues(d.example_values)} />,
            ])}
          />
        </div>
      )}
    </div>
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
  const [header, setHeader] = useState<ShareHeader | null>(null);
  const [doc, setDoc] = useState<TrackingDocument | null>(null);
  const [comments, setComments] = useState<CommentPanelRow[]>([]);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());
  const [openUseCases, setOpenUseCases] = useState<Set<string>>(new Set());
  const [openProjectFindings, setOpenProjectFindings] = useState<Set<string>>(new Set());
  const [openProperties, setOpenProperties] = useState<Set<string>>(new Set());
  const [navQuery, setNavQuery] = useState('');
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());
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

  /** Expands the event a hash points at (if any) and scrolls to the hash target once rendered. */
  const goToHash = useCallback(
    (hash: string) => {
      if (!doc) return;
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
      const ucItem = groups?.useCaseGroups.flatMap((g) => g.items).find((i) => i.id === id);
      if (ucItem) setOpenUseCases((prev) => new Set(prev).add(doc.use_cases[ucItem.index].id));
      if (variantsOf && event) {
        const eventEl = () => document.getElementById(variantsOf);
        const scrollToVariants = () => {
          const ev = eventEl();
          const h = document.getElementById(decoded) ?? Array.from(ev?.querySelectorAll('h2') ?? []).find((el) => (el.textContent ?? '').startsWith('Variants'));
          const el = h ?? ev;
          if (!el) return;
          const titleRow = ev?.firstElementChild as HTMLElement | null;
          window.scrollTo({ top: scrollTopBelowSticky(el.getBoundingClientRect().top, window.scrollY, titleRow?.offsetHeight ?? 0) });
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
  const api = { mode: 'shared' as const, token, access: header.access };
  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => setter((prev) => toggleInSet(prev, id));
  const toggleThread = (key: string) => setOpenThreads((prev) => toggleInSet(prev, key));
  const allEventIds = doc.events.map((e) => e.id);
  const allUseCaseIds = doc.use_cases.map((u) => u.id);
  const setEvents = (ids: string[], expanded: boolean) => setOpenEvents((prev) => setExpanded(prev, ids, expanded));
  const setUseCases = (ids: string[], expanded: boolean) => setOpenUseCases((prev) => setExpanded(prev, ids, expanded));
  // One global pair (toolbar) covers every collapsible row; the section headers keep a local pair.
  const allPropertyIds = [...doc.properties, ...(doc.event_properties ?? [])].map((p) => p.property_id);
  const expandAll = () => {
    setEvents(allEventIds, true);
    setUseCases(allUseCaseIds, true);
    setOpenProperties((prev) => setExpanded(prev, allPropertyIds, true));
  };
  const collapseAll = () => {
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
    <div className="min-h-screen bg-gray-50">
      <header className={`sticky top-0 z-30 h-14 border-b bg-white`}>
        <div className={`${PAGE_MAX_WIDTH_CLASS} h-full px-8 flex items-center gap-4`}>
          {header.project.client_logo_path && <img src={fileUrl(header.project.client_logo_path)} alt="" className="h-8 w-auto" />}
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate leading-tight">{header.project.name}</h1>
            {header.client.name && <p className="text-xs text-gray-500 truncate leading-tight">{header.client.name}</p>}
          </div>
          <div className="ml-auto hidden md:flex items-center gap-4 text-xs">
            {(present.events || present.useCases) && <ExpandToggles label="rows" onExpand={expandAll} onCollapse={collapseAll} />}
            <a className={linkClass} href={downloadUrl(token, 'tracking-document.json')}>
              JSON
            </a>
            <a className={linkClass} href={downloadUrl(token, 'documentation.html')}>
              HTML
            </a>
          </div>
        </div>
      </header>

      <div className={`${PAGE_MAX_WIDTH_CLASS} px-8 py-6 lg:flex lg:gap-8 lg:items-start`}>
        <SharedNav
          items={filteredNav}
          allItems={nav}
          activeId={activeId}
          query={navQuery}
          onQuery={setNavQuery}
          onNavigate={navigateTo}
        />

        <main className="flex-1 min-w-0 space-y-6">
          <div className="md:hidden flex flex-wrap gap-3 text-xs">
            {(present.events || present.useCases) && <ExpandToggles label="rows" onExpand={expandAll} onCollapse={collapseAll} />}
            <a className={linkClass} href={downloadUrl(token, 'tracking-document.json')}>
              Download JSON
            </a>
            <a className={linkClass} href={downloadUrl(token, 'documentation.html')}>
              Download HTML
            </a>
          </div>

          {present.events && (
            <section id={SECTION_IDS.events} style={marginTop('section')} className="space-y-3">
              <h2
                style={{ height: STICKY_PX.sectionHeader }}
                className={`sticky ${HEADER_TOP_CLASS} z-10 flex items-center bg-gray-50 text-lg font-semibold text-gray-900`}
              >
                <SectionTitle id={SECTION_IDS.events}>Events ({doc.events.length})</SectionTitle>
              </h2>
              {namingLine}
              {(doc.sources ?? []).length > 0 && (
                <p className="text-xs text-gray-500" data-testid="shared-sources">
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
                    {inGroup.map((event) => {
                      const expanded = openEvents.has(event.id);
                      const anchor = anchorById.get(event.id) as string;
                      return (
                        <div key={event.id} id={anchor} style={marginTop('event')} className="bg-white rounded-lg border shadow-sm">
                          <div
                            className={`flex items-center gap-2 px-4 py-3 bg-white rounded-t-lg ${
                              expanded ? `sticky ${HEADER_TOP_CLASS} z-20 border-b` : 'rounded-b-lg'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggle(setOpenEvents, event.id)}
                              aria-expanded={expanded}
                              className="flex flex-1 min-w-0 items-center gap-2 text-left"
                            >
                              {expanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
                              <span className="font-semibold text-gray-900 truncate">{event.name}</span>
                              <ClassBadge eventClass={event.class} className="shrink-0" />
                              {(event.sources ?? []).map((s) => (
                                <SourceBadge key={s.id} system={s.system} method={s.method} color={s.color} className="shrink-0" />
                              ))}
                              <span className="shrink-0">
                                <CertificationBadge certification={event.certification} compact />
                              </span>
                              {!expanded && event.description && (
                                <span className="hidden sm:block min-w-0 truncate text-sm text-gray-500">
                                  {oneLineDescription(event.description)}
                                </span>
                              )}
                            </button>
                            <CommentCountButton
                              count={commentsFor('event', event.id).length}
                              open={openThreads.has(`event:${event.id}`)}
                              label={`event ${event.name}`}
                              onClick={() => {
                                if (!expanded) {
                                  setOpenEvents((prev) => new Set(prev).add(event.id));
                                  setOpenThreads((prev) => new Set(prev).add(`event:${event.id}`));
                                } else toggleThread(`event:${event.id}`);
                              }}
                            />
                            <CopyNameButton name={event.name} />
                            <CopyLinkButton anchor={anchor} label={event.name} />
                          </div>
                          {expanded && (
                            <div className="p-4">
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
                                fileUrl={fileUrl}
                                mode="shared"
                                hideHeader
                                renderPropertyLink={(p, label) => renderRef({ kind: 'property', id: p.property_id }, label)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          )}

          {present.properties && (() => {
            const groups = sharedPropertyGroups<PropertyItem>(doc as unknown as { properties: PropertyItem[]; event_properties?: PropertyItem[] });
            const totalProperties = doc.properties.length + (doc.event_properties?.length ?? 0);
            const setProperties = (ids: string[], expanded: boolean) => setOpenProperties((prev) => setExpanded(prev, ids, expanded));
            const renderRows = (items: PropertyItem[]) =>
              items.map((p) => (
                <PropertyRow
                  key={p.property_id}
                  property={p}
                  anchor={refIndex.propertyAnchorById.get(p.property_id) ?? p.property_id}
                  renderRef={renderRef}
                  expanded={openProperties.has(p.property_id)}
                  onToggle={() => toggle(setOpenProperties, p.property_id)}
                />
              ));
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
                      className={`sticky ${HEADER_TOP_CLASS} z-[15] flex items-center justify-between gap-2 bg-gray-50`}
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
                            <h4 className="text-xs font-semibold uppercase text-gray-500">
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
              title={`Use cases (${doc.use_cases.length})`}
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
                {g.items.map(({ index, id: ucAnchor }) => {
                  const uc = doc.use_cases[index];
                  const expanded = openUseCases.has(uc.id);
                  return (
                    <div key={uc.id} id={ucAnchor} style={marginTop('event')} className="border rounded-md">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggle(setOpenUseCases, uc.id)}
                          aria-expanded={expanded}
                          className="flex flex-1 min-w-0 items-center gap-2 text-left"
                        >
                          {expanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
                          <span className="text-sm font-semibold text-gray-800 truncate">
                            {uc.code ? `${uc.code} — ` : ''}
                            {uc.name}
                          </span>
                        </button>
                        <CopyNameButton name={uc.name} />
                        <CommentCountButton
                          count={commentsFor('use_case', uc.id).length}
                          open={openThreads.has(`use_case:${uc.id}`)}
                          label={`use case ${uc.name}`}
                          onClick={() => {
                            if (!expanded) {
                              setOpenUseCases((prev) => new Set(prev).add(uc.id));
                              setOpenThreads((prev) => new Set(prev).add(`use_case:${uc.id}`));
                            } else toggleThread(`use_case:${uc.id}`);
                          }}
                        />
                        {uc.documentation_url && (
                          <a href={uc.documentation_url} target="_blank" rel="noreferrer" className={`text-xs ${linkClass}`}>
                            Documentation
                          </a>
                        )}
                      </div>
                      {expanded && (
                        <div className="px-3 pb-3">
                          {uc.narrative && <div className="text-sm text-gray-700"><MarkdownView source={uc.narrative} /></div>}
                          {uc.requirements.length > 0 && (
                            <div className="overflow-x-auto mt-2">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 border-b">
                                  <tr>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Target</HintTh>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Level</HintTh>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Status</HintTh>
                                    <HintTh className="px-3 py-2 font-medium text-gray-500 text-right" hintScope="Shared">Comments</HintTh>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {uc.requirements.map((r) => (
                                    <React.Fragment key={r.id}>
                                      <tr>
                                        <td className="px-3 py-2">{renderRequirementTarget(r, refIndex, navigateTo)}</td>
                                        <td className="px-3 py-2">{r.level}</td>
                                        <td className="px-3 py-2">{r.status ?? '—'}</td>
                                        <td className="px-3 py-2 text-right">
                                          <CommentCountButton
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
                    </div>
                  );
                })}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {present.identity && (
            <SectionCard id={SECTION_IDS.identity} title={`Identity rules (${doc.identity_rules.length})`}>
              {doc.identification_flow && (
                <div className="mb-3" data-testid="shared-identification-flow">
                  <h3 className="text-sm font-semibold text-gray-900">Identification flow</h3>
                  <p className="text-sm text-gray-700 mt-1">{doc.identification_flow}</p>
                </div>
              )}
              <SimpleTable
                head={['Name', 'Identifier', 'Type', 'SDK call', 'Transformations', 'Trigger', 'Set by', 'Carried by']}
                rows={doc.identity_rules.map((r) => [
                  r.name,
                  r.identifier_name,
                  r.identity_type,
                  r.sdk_call ?? '—',
                  r.transformations.join(', ') || '—',
                  r.trigger_text ?? '—',
                  <SetByCell key="sb" setBy={r.set_by} binds={r.binds} />,
                  (r.carried_by ?? []).join(', ') || '—',
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
                        <span key={id} id={id} style={marginTop('event')} className="inline-flex items-center gap-1.5">
                          {c.name}
                          <CopyNameButton name={c.name} />
                        </span>,
                        c.standard_key ?? '—',
                        (c as { status?: string | null }).status ?? '—',
                      ])}
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {present.catalogs && (
            <SectionCard id={SECTION_IDS.catalogs} title={`Catalogs (${doc.catalogs.length})`}>
              <div className="space-y-4">
                {doc.catalogs.map((c) => {
                  const meta = [
                    c.kind ? `${c.kind} catalog` : '',
                    catalogMarketLabel(c.market, c.language) ? `market: ${catalogMarketLabel(c.market, c.language)}` : '',
                    c.version ? `version: ${c.version}${c.live_at ? ' (live)' : ''}` : '',
                    typeof c.searchable_count === 'number' ? `${c.searchable_count} searchable` : '',
                    c.lookup_key ? `lookup key: ${c.lookup_key}` : '',
                    c.mapping_role ? `mapping role: ${c.mapping_role}` : '',
                    c.status ?? '',
                    c.source_system ? `source: ${c.source_system}` : '',
                    c.sync_method ? `sync: ${c.sync_method}` : '',
                    c.update_frequency ? `updates: ${c.update_frequency}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const fields = c.fields ?? [];
                  const mapped = c.mapped_properties ?? [];
                  return (
                    <div key={c.id ?? c.name} id={c.id ? refIndex.catalogAnchorById.get(c.id) : undefined} style={marginTop('event')} className="rounded-lg border p-4">
                      <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        {c.name}
                        <CopyNameButton name={c.name} />
                      </h3>
                      {meta && <p className="text-xs text-gray-500">{meta}</p>}
                      {c.description && <p className="mt-1 text-sm text-gray-700">{c.description}</p>}
                      {fields.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">No fields defined.</p>
                      ) : (
                        <div className="mt-2">
                          <SimpleTable
                            head={['Field', 'Type', 'Lookup key', 'Searchable', 'Description']}
                            rows={fields.map((f) => [<span key={f.name} className="inline-flex items-center gap-1.5">{f.name}<CopyNameButton name={f.name} /></span>, f.data_type ?? '—', f.is_lookup_key ? 'yes' : '—', f.is_searchable ? 'yes' : '—', f.description ?? '—'])}
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
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {present.mapping && (
            <SectionCard id={SECTION_IDS.mapping} title={`Standard event mappings (${doc.standard_event_mappings.length})`}>
              {groups.mappingLeaves.map(({ index, id }) => (
                <div key={id} id={id} style={marginTop('event')}>
                  <StandardMappingBlock mapping={doc.standard_event_mappings[index]} eventName={doc.standard_event_mappings[index].event_name} />
                </div>
              ))}
            </SectionCard>
          )}

          {present.findings && (
            <SectionCard
              id={SECTION_IDS.findings}
              title="Findings summary"
              actions={<CopyMarkdownButton getMarkdown={() => findingsSummaryToMarkdown(groups.summary)} label="Copy findings as Markdown" />}
            >
              <FindingsSummaryBlock summary={groups.summary} anchorFor={(eventId) => anchorById.get(eventId)} />
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
                    <ul className="divide-y rounded-md border text-sm">
                      {g.leaves.map((l) => {
                        if (l.id.endsWith('-project')) {
                          const open = openProjectFindings.has(l.id);
                          const rows = (doc.unattached_findings ?? []).filter((f) => f.comparison === g.comparison);
                          return (
                            <li key={l.id} id={l.id} style={marginTop('event')} className="px-3 py-2">
                              <button
                                type="button"
                                aria-expanded={open}
                                onClick={() =>
                                  setOpenProjectFindings((prev) => {
                                    const next = new Set(prev);
                                    if (!next.delete(l.id)) next.add(l.id);
                                    return next;
                                  })
                                }
                                className="flex w-full items-center justify-between gap-2 text-left"
                              >
                                <span className="inline-flex items-center gap-1 text-gray-700">
                                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  {l.label}
                                </span>
                                <span className="text-xs text-gray-500">{l.count} open</span>
                              </button>
                              {open && (
                                <ul data-testid="project-findings" className="mt-2 divide-y rounded-md border text-sm">
                                  {rows.map((f) => {
                                    const ent = findingEntity(f, refIndex, { catalogs: SECTION_IDS.catalogs, consents: SECTION_IDS.consents });
                                    return (
                                      <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                                        <span className="font-medium"><FindingTerm kind={f.kind} /></span>
                                        <span className="text-xs uppercase text-gray-500">{f.severity}</span>
                                        {ent.type && (
                                          <span className="text-xs text-gray-600">
                                            {ent.type}
                                            {ent.label ? ': ' : ''}
                                            {ent.href ? (
                                              <a
                                                href={ent.href}
                                                className={linkClass}
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  navigateTo((ent.href as string).slice(1));
                                                }}
                                              >
                                                {ent.label ?? ' open section'}
                                              </a>
                                            ) : (
                                              ent.label
                                            )}
                                          </span>
                                        )}
                                        {f.message && <span className="basis-full text-gray-700">{f.message}</span>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          );
                        }
                        return (
                        <li key={l.id} id={l.id} style={marginTop('event')} className="flex items-center justify-between gap-2 px-3 py-2">
                          {l.cardAnchor ? (
                            <a
                              href={`#${l.cardAnchor}`}
                              className={linkClass}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(l.cardAnchor as string);
                              }}
                            >
                              {l.label}
                            </a>
                          ) : (
                            <span className="text-gray-700">{l.label}</span>
                          )}
                          <span className="text-xs text-gray-500">{l.count} open</span>
                        </li>
                        );
                      })}
                    </ul>
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
