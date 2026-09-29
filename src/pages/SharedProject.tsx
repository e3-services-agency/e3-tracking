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
 * T-4-04 (D-49): `CommentsPanel` is mounted on each event card (`commentsSlot`), on the use case
 * section and on each requirement row, in `shared` mode (`{token, access: header.access}`); the add
 * form hides itself when `access !== 'comment'`. One `GET /comments` without filters is fetched once
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
import { ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE } from '@/src/config/env';
import { PAGE_MAX_WIDTH_CLASS } from '@/src/components/layout/PageShell';
import { EventCardView, CertificationBadge, type EventCardData } from '@/src/features/events/components/EventCardView';
import { CommentsPanel, type CommentPanelRow } from '@/src/features/comments/CommentsPanel';
import { CommentCountButton } from '@/src/features/comments/CommentCountButton';
import { CopyLinkButton } from '@/src/features/shared/CopyLinkButton';
import { SharedNav } from '@/src/features/shared/SharedNav';
import { useActiveSection } from '@/src/features/shared/useActiveSection';
import type { TrackingDocument } from '@/src/domain/document/trackingDocument';
import {
  sharedFileUrl,
  buildSharedViewModel,
  buildSectionIndex,
  sectionPresence,
  filterNav,
  eventAnchors,
  eventForHash,
  oneLineDescription,
  EVENT_CLASS_GROUPS,
  SECTION_IDS,
  eventGroupId,
  toggleInSet,
  type NavItem,
} from './sharedViewModel';

export { sharedFileUrl, buildSharedViewModel };

/** Height of the sticky page header (Tailwind `h-14`); sticky event titles sit right below it. */
const HEADER_TOP_CLASS = 'top-14';

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

function SectionCard({ id, title, children }: { id: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 bg-white rounded-lg border shadow-sm p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      {children}
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

export function SharedProject({ token }: { token: string }) {
  const [header, setHeader] = useState<ShareHeader | null>(null);
  const [doc, setDoc] = useState<TrackingDocument | null>(null);
  const [comments, setComments] = useState<CommentPanelRow[]>([]);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());
  const [openUseCases, setOpenUseCases] = useState<Set<string>>(new Set());
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
  const spyId = useActiveSection(useMemo(() => leafIds(nav), [nav]));
  const activeId = clickedId ?? spyId;
  useEffect(() => {
    if (!clickedId) return;
    const clear = () => setClickedId(null);
    window.addEventListener('wheel', clear, { passive: true });
    window.addEventListener('touchmove', clear, { passive: true });
    window.addEventListener('keydown', clear);
    return () => {
      window.removeEventListener('wheel', clear);
      window.removeEventListener('touchmove', clear);
      window.removeEventListener('keydown', clear);
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
  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleThread = (key: string) => setOpenThreads((prev) => toggleInSet(prev, key));
  const expandAllEvents = () => setOpenEvents(new Set(doc.events.map((e) => e.id)));
  const collapseAllEvents = () => setOpenEvents(new Set());
  const expandAllUseCases = () => setOpenUseCases(new Set(doc.use_cases.map((u) => u.id)));
  const collapseAllUseCases = () => setOpenUseCases(new Set());
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
            {present.events && (
              <span className="inline-flex items-center gap-1 text-gray-500">
                Events <ExpandToggles label="events" onExpand={expandAllEvents} onCollapse={collapseAllEvents} />
              </span>
            )}
            {present.useCases && (
              <span className="inline-flex items-center gap-1 text-gray-500">
                Use cases <ExpandToggles label="use cases" onExpand={expandAllUseCases} onCollapse={collapseAllUseCases} />
              </span>
            )}
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
            <ExpandToggles label="events" onExpand={expandAllEvents} onCollapse={collapseAllEvents} />
            <a className={linkClass} href={downloadUrl(token, 'tracking-document.json')}>
              Download JSON
            </a>
            <a className={linkClass} href={downloadUrl(token, 'documentation.html')}>
              Download HTML
            </a>
          </div>

          {present.events && (
            <section id={SECTION_IDS.events} className="scroll-mt-20 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Events ({doc.events.length})</h2>
              {EVENT_CLASS_GROUPS.map(({ cls, label }) => {
                const inGroup = doc.events.filter((e) => e.class === cls);
                if (inGroup.length === 0) return null;
                return (
                  <div key={cls} id={eventGroupId(cls)} className="scroll-mt-20 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700">
                      {label} ({inGroup.length})
                    </h3>
                    {inGroup.map((event) => {
                      const expanded = openEvents.has(event.id);
                      const anchor = anchorById.get(event.id) as string;
                      return (
                        <div key={event.id} id={anchor} className="scroll-mt-16 bg-white rounded-lg border shadow-sm">
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
                              <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">
                                {event.class}
                              </span>
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
                                if (!expanded) setOpenEvents((prev) => new Set(prev).add(event.id));
                                toggleThread(`event:${event.id}`);
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

          {present.properties && (
            <SectionCard id={SECTION_IDS.properties} title={`Properties (${doc.properties.length})`}>
              {doc.properties.map((p) => (
                <div key={p.property_id} className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800">
                    {p.name} <span className="text-xs font-normal text-gray-500">({p.data_type})</span>
                  </h4>
                  <SimpleTable
                    head={['Definition', 'Description', 'Allowed values', 'Formats', 'Example']}
                    rows={p.definitions.map((d) => [
                      d.name,
                      d.description ?? '—',
                      d.allowed_values ? d.allowed_values.map((v) => v.value).join(', ') : '—',
                      d.formats.join(', ') || '—',
                      JSON.stringify(d.example_values ?? null),
                    ])}
                  />
                </div>
              ))}
            </SectionCard>
          )}

          {present.useCases && (
            <SectionCard
              id={SECTION_IDS.useCases}
              title={
                <span className="flex items-center justify-between gap-2">
                  <span>Use cases ({doc.use_cases.length})</span>
                  <ExpandToggles label="use cases" onExpand={expandAllUseCases} onCollapse={collapseAllUseCases} />
                </span>
              }
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
                          <CommentsPanel
                            entityType="use_case"
                            entityId={uc.id}
                            api={api}
                            rows={commentsFor('use_case', uc.id)}
                            onChanged={reloadComments}
                          />
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
              <SimpleTable
                head={['Name', 'Mapping role', 'Status']}
                rows={doc.catalogs.map((c) => [c.name, c.mapping_role ?? '—', c.status ?? '—'])}
              />
            </SectionCard>
          )}

          {present.mapping && (
            <SectionCard id={SECTION_IDS.mapping} title={`Standard event mappings (${doc.standard_event_mappings.length})`}>
              <SimpleTable
                head={['Standard event', 'Event', 'Variant', 'Field map']}
                rows={doc.standard_event_mappings.map((m) => [
                  m.standard_event,
                  m.event_name,
                  m.variant_name ?? 'all',
                  Object.entries(m.field_map)
                    .map(([field, propertyName]) => `${field} -> ${propertyName ?? '—'}`)
                    .join(', ') || '—',
                ])}
              />
            </SectionCard>
          )}

          {present.findings && (
            <SectionCard id={SECTION_IDS.findings} title="Findings summary">
              <p className="text-sm text-gray-700">
                Open — error {doc.findings_summary.open.error}, warning {doc.findings_summary.open.warning}, info{' '}
                {doc.findings_summary.open.info}
              </p>
            </SectionCard>
          )}
        </main>
      </div>
    </div>
  );
}
