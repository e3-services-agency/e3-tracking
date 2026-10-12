import type { EventCard, EventCardFinding } from '@/src/domain/document/trackingDocument';
import { SeverityBadge, StatusBadge } from '@/src/components/ui/badges';
import { FindingTerm } from '@/src/components/ui/GlossaryTerm';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import { TargetCollaboration } from '@/src/features/comments/TargetCollaboration';
import type { CommentPanelRow, CommentsPanelApi } from '@/src/features/comments/CommentsPanel';
import { CopyLinkButton } from './CopyLinkButton';
import { SharedEntityTable, SharedEntityRow } from './SharedEntityTable';
import { stickyScrollMarginPx } from './viewHelpers';

/** Current public findings only. Report evidence retains its separate finding-<id> anchors. */
export function SharedFindingsTable({ events, unattached, api, comments, onChanged, linkedFindingId, anchorFor, onNavigate }: {
  events: Pick<EventCard, 'id' | 'name' | 'findings'>[];
  unattached: EventCardFinding[];
  api: CommentsPanelApi;
  comments: CommentPanelRow[];
  onChanged: () => void | Promise<void>;
  linkedFindingId?: string;
  anchorFor: (eventId: string) => string | undefined;
  onNavigate: (anchor: string) => void;
}) {
  const rows = [...events.flatMap(event => event.findings.map(finding => ({ finding, event }))),
    ...unattached.map(finding => ({ finding, event: null }))];
  return <SharedEntityTable label="Individual finding discussions" columns={[
    { label: 'Number', width: '10%' }, { label: 'Severity', width: '14%' }, { label: 'Event', width: '20%' },
    { label: 'Message', width: '26%' }, { label: 'Status', width: '10%' }, { label: 'Actions', width: '20%' },
  ]}>
    {rows.map(({ finding, event }) => {
      const label = `Finding #${String(finding.finding_sequence ?? '').padStart(3, '0')}`;
      const anchor = `current-finding-${finding.id}`;
      const eventAnchor = event ? anchorFor(event.id) : undefined;
      return <SharedEntityRow key={finding.id} anchor={anchor} name={`#${String(finding.finding_sequence ?? '').padStart(3, '0')}`}
        scrollMarginTop={stickyScrollMarginPx('event')} cells={[
          <SeverityBadge key="severity" severity={finding.severity} />,
          event ? eventAnchor ? <a key="event" href={`#${eventAnchor}`} className="inline-flex items-start gap-1.5 text-[var(--color-info)] hover:underline"
            onClick={e => { e.preventDefault(); onNavigate(eventAnchor); }}><EntityIcon kind="event" /><span className="min-w-0 [overflow-wrap:anywhere]">{event.name}</span></a> : event.name : 'Not tied to an event',
          <div key="message" className="space-y-1"><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{finding.message ?? '—'}</p>
            <div className="text-xs text-gray-500"><FindingTerm comparison={finding.comparison} /></div></div>,
          // The tracking document explicitly projects status=open; acknowledged/resolved details live in history.
          <StatusBadge key="status" status="open" />,
          <div key="actions" className="flex flex-wrap items-start gap-1">
            <TargetCollaboration api={api} entityType="finding" entityId={finding.id} label={label} rows={comments}
              onChanged={onChanged} forceOpen={linkedFindingId === finding.id} />
            <CopyLinkButton anchor={anchor} label={label} />
          </div>,
        ]} />;
    })}
  </SharedEntityTable>;
}
