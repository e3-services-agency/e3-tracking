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
import { ClassBadge } from '@/src/components/ui/ClassBadge';
import { ExampleCell, StandardMappingBlock } from '@/src/features/events/components/EventCardView';
import { formatExampleValues } from '@/src/domain/examples';
import { computeFindingsSummary } from '@/src/domain/document/findingsSummary';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE } from '@/src/config/env';
import { PAGE_MAX_WIDTH_CLASS } from '@/src/components/layout/PageShell';
import { EventCardView, CertificationBadge, type EventCardData } from '@/src/features/events/components/EventCardView';
import { CommentsPanel, type CommentPanelRow } from '@/src/features/comments/CommentsPanel';
import { CommentCountButton } from '@/src/features/comments/CommentCountButton';
import { CopyLinkButton } from '@/src/features/shared/CopyLinkButton';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { SHARED_SECTION_ICONS } from '@/src/components/layout/navIcons';
import { propertiesToMarkdown } from '@/src/domain/document/markdown';
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
  spyTopOffsetPx,
  STICKY_PX,
  type NavItem,
} from './sharedViewModel';

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

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium text-gray-500">
                {h}
              </th>
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
function PropertyRow({ property, expanded, onToggle }: { property: PropertyItem; expanded: boolean; onToggle: () => void }) {
  const usedIn = 'used_in_events' in property ? property.used_in_events : [];
  return (
    <div className="bg-white rounded-lg border shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full min-w-0 items-center gap-2 px-4 py-2 text-left">
        {expanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
        <span className="font-semibold text-gray-900 truncate">{property.name}</span>
        <span className="shrink-0 text-xs text-gray-500">({property.data_type})</span>
        {!expanded && property.description && (
          <span className="hidden sm:block min-w-0 truncate text-sm text-gray-500">{oneLineDescription(property.description)}</span>
        )}
      </button>
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2">
          {property.description && <p className="text-sm text-gray-700">{property.description}</p>}
          {property.data_formats.length > 0 && <p className="text-xs text-gray-500">Formats: {property.data_formats.map(formatDisplayName).join(', ')}</p>}
          {usedIn.length > 0 && <p className="text-xs text-gray-500">Used in: {usedIn.join(', ')}</p>}
          <SimpleTable
            head={['Definition', 'Description', 'Allowed values', 'Formats', 'Example']}
            rows={property.definitions.map((d) => [
              d.name,
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
  summary: ReturnType<typeof computeFindingsSummary>;
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
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">By comparison</h4>
          <SimpleTable
            head={['Comparison', 'Error', 'Warning', 'Info']}
            rows={summary.byComparison.map((c) => [c.comparison, c.error, c.warning, c.info])}
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

export function SharedProject({ token }: { token: string }) {
  const [header, setHeader] = useState<ShareHeader | null>(null);
  const [doc, setDoc] = useState<TrackingDocument | null>(null);
  const [comments, setComments] = useState<CommentPanelRow[]>([]);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());
  const [openUseCases, setOpenUseCases] = useState<Set<string>>(new Set());
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
  const nav = useMemo(() => (doc ? buildSectionIndex(doc) : []), [doc]);
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
      const event = eventForHash(id, doc.events);
      if (event) setOpenEvents((prev) => (prev.has(event.id) ? prev : new Set(prev).add(event.id)));
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
    [doc]
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
              <div className="space-y-2">
                {doc.use_cases.map((uc) => {
                  const expanded = openUseCases.has(uc.id);
                  return (
                    <div key={uc.id} className="border rounded-md">
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
                          {uc.narrative && <p className="text-sm text-gray-700">{uc.narrative}</p>}
                          {uc.requirements.length > 0 && (
                            <div className="overflow-x-auto mt-2">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 border-b">
                                  <tr>
                                    <th className="px-3 py-2 font-medium text-gray-500">Target</th>
                                    <th className="px-3 py-2 font-medium text-gray-500">Level</th>
                                    <th className="px-3 py-2 font-medium text-gray-500">Status</th>
                                    <th className="px-3 py-2 font-medium text-gray-500 text-right">Comments</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {uc.requirements.map((r) => (
                                    <React.Fragment key={r.id}>
                                      <tr>
                                        <td className="px-3 py-2">{r.target_label}</td>
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
            </SectionCard>
          )}

          {present.identity && (
            <SectionCard id={SECTION_IDS.identity} title={`Identity rules (${doc.identity_rules.length})`}>
              <SimpleTable
                head={['Name', 'Identifier', 'Type', 'SDK call', 'Transformations', 'Trigger']}
                rows={doc.identity_rules.map((r) => [
                  r.name,
                  r.identifier_name,
                  r.identity_type,
                  r.sdk_call ?? '—',
                  r.transformations.join(', ') || '—',
                  r.trigger_text ?? '—',
                ])}
              />
            </SectionCard>
          )}

          {present.consents && (
            <SectionCard id={SECTION_IDS.consents} title={`Consent categories (${doc.consent_categories.length})`}>
              <SimpleTable
                head={['Name', 'Standard key', 'Status']}
                rows={doc.consent_categories.map((c) => [c.name, c.standard_key ?? '—', c.status ?? '—'])}
              />
            </SectionCard>
          )}

          {present.catalogs && (
            <SectionCard id={SECTION_IDS.catalogs} title={`Catalogs (${doc.catalogs.length})`}>
              <div className="space-y-4">
                {doc.catalogs.map((c) => {
                  const meta = [
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
                    <div key={c.name} className="rounded-lg border p-4">
                      <h3 className="text-sm font-semibold text-gray-900">{c.name}</h3>
                      {meta && <p className="text-xs text-gray-500">{meta}</p>}
                      {c.description && <p className="mt-1 text-sm text-gray-700">{c.description}</p>}
                      {fields.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">No fields defined.</p>
                      ) : (
                        <div className="mt-2">
                          <SimpleTable
                            head={['Field', 'Type', 'Lookup key', 'Searchable', 'Description']}
                            rows={fields.map((f) => [f.name, f.data_type ?? '—', f.is_lookup_key ? 'yes' : '—', f.is_searchable ? 'yes' : '—', f.description ?? '—'])}
                          />
                        </div>
                      )}
                      {mapped.length > 0 && (
                        <div className="mt-3">
                          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Properties that look up into this catalog</h4>
                          <SimpleTable
                            head={['Property', 'Scope', 'Catalog field']}
                            rows={mapped.map((m) => [m.property_name, m.scope, m.field_name ?? '—'])}
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
              {doc.standard_event_mappings.map((m, i) => (
                <StandardMappingBlock key={i} mapping={m} eventName={m.event_name} />
              ))}
            </SectionCard>
          )}

          {present.findings && (
            <SectionCard id={SECTION_IDS.findings} title="Findings summary">
              <FindingsSummaryBlock
                summary={computeFindingsSummary(doc.events, doc.unattached_findings)}
                anchorFor={(eventId) => anchorById.get(eventId)}
              />
            </SectionCard>
          )}
        </main>
      </div>
    </div>
  );
}
