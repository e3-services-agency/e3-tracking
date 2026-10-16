import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import type { EventCard, EventCardFinding } from '@/src/domain/document/trackingDocument';
import { FindingPriorityBadge, SeverityBadge } from '@/src/components/ui/badges';
import { FindingTerm, GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { FINDING_PRIORITIES } from '@/src/domain/enums';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { Input } from '@/src/components/ui/Input';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import { FAMILY_INFO, comparisonLabel, findingFamily } from '@/src/domain/findingsCatalog';
import { TargetCollaboration } from '@/src/features/comments/TargetCollaboration';
import type { CommentPanelRow, CommentsPanelApi } from '@/src/features/comments/CommentsPanel';
import { CopyLinkButton } from './CopyLinkButton';
import { SharedEntityTable, SharedEntityRow } from './SharedEntityTable';
import { SharedToolbarControl } from './SharedToolbarControl';
import { SECTION_IDS, stickyScrollMarginPx } from './viewHelpers';
import { PORTAL_ROW_LIMIT, ShowMoreRow, useRowLimit } from '@/src/features/views/ViewParts';
import { EMPTY_FINDING_FILTERS, PROJECT_FINDINGS, filterSharedFindings, sharedFindingRows, type FindingFilters, type FindingNavigation } from './sharedFindingsModel';

/** Current public findings only. Report evidence retains its separate finding-<id> anchors. */
export function SharedFindingsTable({ events, unattached, api, comments, onChanged, linkedFindingId, anchorFor, onNavigate,
  legacyAnchors = [], navigation, expansion, renderContext, rowLimit }: {
  events: Pick<EventCard, 'id' | 'name' | 'findings'>[];
  unattached: EventCardFinding[];
  api: CommentsPanelApi;
  comments: CommentPanelRow[];
  onChanged: () => void | Promise<void>;
  linkedFindingId?: string;
  anchorFor: (eventId: string) => string | undefined;
  onNavigate: (anchor: string) => void;
  legacyAnchors?: string[];
  navigation?: FindingNavigation;
  expansion?: { expanded: boolean; revision: number };
  renderContext?: (finding: EventCardFinding) => ReactNode;
  /** T-5-42: render at most this many rows, then "Show N more" (`PORTAL_ROW_LIMIT` in the portal).
   * Filters and search cover every finding; a finding a link points at is always rendered. */
  rowLimit?: number;
}) {
  const filterId = useId();
  const [filters, setFilters] = useState<FindingFilters>(EMPTY_FINDING_FILTERS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = useMemo(() => sharedFindingRows(events, unattached), [events, unattached]);
  const shown = useMemo(() => filterSharedFindings(rows, filters), [rows, filters]);
  const { limit, more } = useRowLimit(rowLimit);
  // The finding a link landed on: highlighted, expanded, and always rendered. Past the window it is
  // pinned after the rendered rows, so a link deep in a long list never renders everything above it.
  const [landed, setLanded] = useState<string | undefined>();
  const visible = useMemo(() => {
    const head = shown.slice(0, limit);
    const pinned = landed && !head.some(row => row.finding.id === landed) ? shown.find(row => row.finding.id === landed) : undefined;
    return pinned ? [...head, pinned] : head;
  }, [shown, limit, landed]);
  const windowCount = Math.min(shown.length, limit);
  const [pendingScroll, setPendingScroll] = useState<{ anchor: string; revision: number }>();
  useEffect(() => {
    if (!linkedFindingId) return;
    setFilters(EMPTY_FINDING_FILTERS);
    setLanded(linkedFindingId);
  }, [linkedFindingId]);
  useEffect(() => { if (expansion) setExpanded(expansion.expanded ? new Set(rows.map(row => row.finding.id)) : new Set()); }, [expansion, rows]);
  useEffect(() => {
    if (!navigation) return;
    const requested = { ...EMPTY_FINDING_FILTERS, comparison: navigation.comparison ?? '', eventId: navigation.eventId ?? '', priority: navigation.priority ?? '' };
    setFilters(requested);
    const matches = filterSharedFindings(rows, requested);
    const target = navigation.findingId != null ? matches.find(row => row.finding.id === navigation.findingId) : matches[0];
    const qualified = navigation.findingId != null || navigation.comparison != null || navigation.eventId != null || navigation.priority != null;
    const scrollAnchor = qualified ? target ? `current-finding-${target.finding.id}` : 'current-findings-table' : SECTION_IDS.findings;
    if (target && navigation.findingId != null) {
      setLanded(target.finding.id);
      setExpanded(previous => previous.has(target.finding.id) ? previous : new Set(previous).add(target.finding.id));
    }
    // Scroll once the (possibly widened) window has rendered the target row.
    setPendingScroll(previous => ({ anchor: scrollAnchor, revision: (previous?.revision ?? 0) + 1 }));
  }, [navigation, rows]);
  useEffect(() => {
    if (!pendingScroll) return;
    const frame = requestAnimationFrame(() => document.getElementById(pendingScroll.anchor)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [pendingScroll]);
  const changeFilter = (key: keyof FindingFilters, value: string) => setFilters(previous => ({ ...previous, [key]: value }));
  const comparisons = [...new Set(rows.map(row => row.finding.comparison))];
  const selectClass = 'h-10 w-full rounded-md border border-[var(--border-default)] bg-white px-3 text-sm';
  const reset = () => setFilters(EMPTY_FINDING_FILTERS);
  return <div className="space-y-3">
    <p aria-label="Current finding totals" className="text-sm text-gray-700"><strong>{rows.length} open findings</strong> · Error {rows.filter(row => row.finding.severity === 'error').length} · Warning {rows.filter(row => row.finding.severity === 'warning').length} · Info {rows.filter(row => row.finding.severity === 'info').length} · P1 {rows.filter(row => row.finding.priority === 'P1').length}</p>
    <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,2fr)_1fr_1fr_1fr_1fr_auto]">
      <FieldLabel hint="Search findings" hintScope="Shared" htmlFor={`${filterId}-search`} className="space-y-1 text-sm">Search findings<Input id={`${filterId}-search`} type="search" className="h-10" value={filters.search} onChange={event => changeFilter('search', event.target.value)} /></FieldLabel>
      <FieldLabel hint="Priority" hintScope="Shared" htmlFor={`${filterId}-priority`} className="space-y-1 text-sm">Priority<select id={`${filterId}-priority`} className={selectClass} value={filters.priority} onChange={event => changeFilter('priority', event.target.value)}><option value="">All priorities</option>{FINDING_PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}</select></FieldLabel>
      <FieldLabel hint="Severity" htmlFor={`${filterId}-severity`} className="space-y-1 text-sm">Severity<select id={`${filterId}-severity`} className={selectClass} value={filters.severity} onChange={event => changeFilter('severity', event.target.value)}><option value="">All severities</option><option value="error">Error</option><option value="warning">Warning</option><option value="info">Info</option></select></FieldLabel>
      <FieldLabel hint="Event" htmlFor={`${filterId}-event`} className="space-y-1 text-sm">Event<select id={`${filterId}-event`} className={selectClass} value={filters.eventId} onChange={event => changeFilter('eventId', event.target.value)}><option value="">All events</option>{events.filter(event => event.findings.length).map(event => <option key={event.id} value={event.id}>{event.name}</option>)}{unattached.length > 0 && <option value={PROJECT_FINDINGS}>Not tied to an event</option>}</select></FieldLabel>
      <FieldLabel hint="Comparison" htmlFor={`${filterId}-comparison`} className="space-y-1 text-sm">Comparison<select id={`${filterId}-comparison`} className={selectClass} value={filters.comparison} onChange={event => changeFilter('comparison', event.target.value)}><option value="">All comparisons</option>{comparisons.map(comparison => <option key={comparison} value={comparison}>{comparisonLabel(comparison)}</option>)}</select></FieldLabel>
      <SharedToolbarControl type="button" onClick={reset}>Reset filters</SharedToolbarControl>
    </div>
    <p role="status" className="text-sm text-gray-500">Showing {shown.length} of {rows.length} findings</p>
    <div aria-hidden="true" className="h-0 overflow-hidden">{legacyAnchors.map(anchor => <span key={anchor} id={anchor} className="block h-0" />)}</div>
    <div id="current-findings-table" style={{ scrollMarginTop: stickyScrollMarginPx('event') }}>
      <SharedEntityTable label="Individual finding discussions" columns={[
        { label: 'Number', width: '112px' }, { label: 'Priority', width: '92px', content: <GlossaryTerm glossaryKey="finding_priority">Priority</GlossaryTerm> },
        { label: 'Severity', width: '108px' }, { label: 'Event', width: '18%' },
        { label: 'Message' }, { label: 'Actions', width: '132px' },
      ]}>
        {visible.map(({ finding, event }) => {
          const label = `Finding #${String(finding.finding_sequence ?? '').padStart(3, '0')}`;
          const anchor = `current-finding-${finding.id}`;
          const eventAnchor = event ? anchorFor(event.id) : undefined;
          const open = expanded.has(finding.id);
          return <SharedEntityRow key={finding.id} anchor={anchor} name={`#${String(finding.finding_sequence ?? '').padStart(3, '0')}`}
            expanded={open} onToggle={() => setExpanded(previous => { const next = new Set(previous); if (next.has(finding.id)) next.delete(finding.id); else next.add(finding.id); return next; })}
            scrollMarginTop={stickyScrollMarginPx('event')} highlighted={landed === finding.id} cells={[
              <FindingPriorityBadge key="priority" priority={finding.priority} reasons={finding.priority_reasons} />,
              <SeverityBadge key="severity" severity={finding.severity} />,
              event ? eventAnchor ? <a key="event" href={`#${eventAnchor}`} className="inline-flex items-start gap-1.5 text-[var(--color-info)] hover:underline"
                onClick={e => { e.preventDefault(); onNavigate(eventAnchor); }}><EntityIcon kind="event" /><span className="min-w-0 [overflow-wrap:anywhere]">{event.name}</span></a> : event.name : 'Not tied to an event',
              finding.message ?? '—',
              <div key="actions" className="flex flex-wrap items-start gap-1">
                <TargetCollaboration api={api} entityType="finding" entityId={finding.id} label={label} rows={comments}
                  onChanged={onChanged} forceOpen={linkedFindingId === finding.id} />
                <CopyLinkButton anchor={anchor} label={label} />
              </div>,
            ]}>
            <div className="space-y-2 text-sm [overflow-wrap:anywhere]">
              <p><strong>Comparison: </strong><FindingTerm comparison={finding.comparison} /></p>
              <p><strong>Kind: </strong><FindingTerm kind={finding.kind} /></p>
              {renderContext && <p><strong>Entity: </strong>{renderContext(finding)}</p>}
              {finding.property && <p><strong>Property: </strong>{finding.property}</p>}
              {finding.variant && <p><strong>Variant: </strong>{finding.variant}</p>}
              {finding.rule && <p><strong>Rule: </strong>{finding.rule}</p>}
              <p><strong>Next step: </strong>{FAMILY_INFO[findingFamily(finding.comparison, finding.kind)].next}</p>
            </div>
          </SharedEntityRow>;
        })}
        {rowLimit && <ShowMoreRow colSpan={6} shown={windowCount} total={shown.length} step={rowLimit} onMore={more} what="findings" testId="finding-show-more" />}
        {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-sm text-gray-500">No findings match these filters.</td></tr>}
      </SharedEntityTable>
    </div>
  </div>;
}
