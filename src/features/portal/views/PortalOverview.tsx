/**
 * Portal overview, the landing view (T-5-43, D-88 plan section 5): the project, when it last
 * changed, the downloads, progress (custom events by status, certified out of applicable, open
 * findings by severity), what is waiting on the client (open comment threads and the five latest
 * public changes) and one card per section. Data: the summary, the public comments, and the
 * project-wide form of `GET /api/shared/:token/history`; nothing else.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { SHARED_SECTION_ICONS } from '@/src/components/layout/navIcons';
import { Button } from '@/src/components/ui/Button';
import { SeverityBadge, StatusBadge } from '@/src/components/ui/badges';
import { openThreadCount, shareApiUrl, usePortal } from '../PortalContext';
import { PORTAL_VIEW_ICON_KEYS, PortalLink, PortalPage, VIEW_COMMENT_TYPES } from '../PortalParts';
import { PORTAL_VIEW_LABELS } from '../portalModel';
import { portalSections } from '../portalSections';
import {
  certificationCounts,
  customEventStatusCounts,
  recentChanges,
  waitingThreads,
  type PublicChange,
  type RecentChange,
  type WaitingThread,
} from '../overviewModel';

/** Open threads listed before "n more". */
export const OVERVIEW_THREAD_LIMIT = 10;
const CHANGE_LIMIT = 5;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
const H2 = 'text-sm font-semibold text-gray-900';
const ACTION_WORDS: Record<string, string> = { create: 'Added', update: 'Changed', delete: 'Removed', restore: 'Restored' };

/** The latest public changes; `null` while loading, `[]` when none or unavailable. */
function useRecentChanges(token: string): PublicChange[] | null {
  const [rows, setRows] = useState<PublicChange[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`${shareApiUrl(token, 'history')}?limit=${CHANGE_LIMIT}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { rows?: PublicChange[] }).rows ?? [] : []))
      .catch(() => [])
      .then((r) => active && setRows(Array.isArray(r) ? r : []));
    return () => {
      active = false;
    };
  }, [token]);
  return rows;
}

function Target({ target, children }: { target: WaitingThread['target'] | RecentChange['target']; children: React.ReactNode }) {
  return target ? <PortalLink to={target}>{children}</PortalLink> : <span className="text-gray-900">{children}</span>;
}

function Progress() {
  const { summary } = usePortal();
  const statuses = customEventStatusCounts(summary);
  const { certified, applicable } = certificationCounts(summary);
  const open = summary.findings_summary.open;
  const pct = applicable ? Math.round((certified / applicable) * 100) : 0;
  return (
    <section aria-labelledby="overview-progress" className="min-w-0 space-y-2 rounded-lg border bg-white p-4 text-sm text-gray-700">
      <h2 id="overview-progress" className={H2}>Progress</h2>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PortalLink to={{ view: 'events', id: null }}>Custom events</PortalLink>
        {statuses.map(({ status, count }) => (
          <span key={status} className="inline-flex items-center gap-1" data-testid={`overview-status-${status}`}>
            <StatusBadge status={status} /> <span className="tabular-nums">{count}</span>
          </span>
        ))}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="overview-certified">
        <span>
          Certified <span className="font-semibold tabular-nums text-gray-900">{certified}</span> of <span className="tabular-nums">{applicable}</span> applicable
        </span>
        {applicable > 0 && (
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${pct}% certified`}>
            <span className="block h-full bg-green-500" style={{ width: `${pct}%` }} />
          </span>
        )}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PortalLink to={{ view: 'qa', id: null }}>Open findings</PortalLink>
        {(['error', 'warning', 'info'] as const).map((severity) => (
          <span key={severity} className="inline-flex items-center gap-1" data-testid={`overview-severity-${severity}`}>
            <SeverityBadge severity={severity} /> <span className="tabular-nums">{open[severity]}</span>
          </span>
        ))}
      </p>
    </section>
  );
}

function WaitingOnYou({ changes }: { changes: PublicChange[] | null }) {
  const { summary, index, comments } = usePortal();
  const threads = useMemo(() => waitingThreads(comments, summary, index), [comments, summary, index]);
  const recent = useMemo(() => (changes ? recentChanges(changes, summary, index) : null), [changes, summary, index]);
  return (
    <section aria-labelledby="overview-waiting" className="min-w-0 space-y-3 rounded-lg border bg-white p-4 text-sm text-gray-700">
      <h2 id="overview-waiting" className={H2}>Waiting on you</h2>
      {threads.length === 0 ? (
        <p className="text-gray-500">No open comment threads.</p>
      ) : (
        <ul className="divide-y" aria-label="Open comment threads">
          {threads.slice(0, OVERVIEW_THREAD_LIMIT).map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5" data-testid="overview-thread">
              <span className="text-xs text-gray-500">{t.kind}</span>
              <Target target={t.target}>{t.name ?? t.kind}</Target>
              <span className="min-w-0 flex-1 truncate text-gray-600" title={t.body}>
                {t.author}: {t.body}
              </span>
              <span className="whitespace-nowrap text-xs text-gray-500">
                {t.replies > 0 && `${t.replies} repl${t.replies === 1 ? 'y' : 'ies'} · `}
                {day(t.lastAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {threads.length > OVERVIEW_THREAD_LIMIT && (
        <p className="text-xs text-gray-500">
          Showing {OVERVIEW_THREAD_LIMIT} of {threads.length} open threads; the rest are on their items, marked "open" in the sidebar.
        </p>
      )}
      <h3 className="pt-1 text-xs font-semibold uppercase text-gray-500">Recent changes</h3>
      {recent === null ? (
        <p className="text-gray-500">Loading…</p>
      ) : recent.length === 0 ? (
        <p className="text-gray-500">No public changes yet.</p>
      ) : (
        <ul className="divide-y" aria-label="Recent changes">
          {recent.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5" data-testid="overview-change">
              <span className="text-xs text-gray-500">{c.kind}</span>
              <Target target={c.target}>{c.name}</Target>
              <span className="min-w-0 flex-1 truncate text-gray-600">
                {ACTION_WORDS[c.action] ?? c.action}
                {c.action === 'update' && c.fields && `: ${c.fields}`}
              </span>
              <span className="whitespace-nowrap text-xs text-gray-500">{day(c.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionCards() {
  const { summary, comments } = usePortal();
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sections">
      {portalSections(summary).map(({ view, count }) => {
        const Icon = SHARED_SECTION_ICONS[PORTAL_VIEW_ICON_KEYS[view]];
        const open = openThreadCount(comments, VIEW_COMMENT_TYPES[view]);
        return (
          <li key={view}>
            <PortalLink
              to={{ view, id: null }}
              className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 hover:border-[var(--color-info)] hover:bg-gray-50"
              data-testid={`overview-card-${view}`}
            >
              {Icon && <Icon size={18} className="shrink-0 text-gray-500" aria-hidden="true" />}
              <span className="min-w-0 flex-1 font-medium text-gray-900">{PORTAL_VIEW_LABELS[view]}</span>
              {open > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{open} open</span>}
              {count !== null && <span className="text-sm tabular-nums text-gray-500">{count}</span>}
            </PortalLink>
          </li>
        );
      })}
    </ul>
  );
}

export function PortalOverview() {
  const { header, summary, token } = usePortal();
  const changes = useRecentChanges(token);
  const lastChange = changes?.[0]?.changed_at ?? null;
  return (
    <PortalPage
      view="overview"
      title={header.project.name}
      actions={(['tracking-document.json', 'documentation.html'] as const).map((file) => (
        <Button key={file} asChild variant="outline" size="sm">
          <a href={shareApiUrl(token, file)} className="gap-1.5">
            <Download size={14} aria-hidden="true" />
            {file.endsWith('.json') ? 'JSON' : 'HTML'}
          </a>
        </Button>
      ))}
      notes={
        <p className="text-sm text-gray-500" data-testid="overview-updated">
          {header.client.name && <>{header.client.name} · </>}Generated {when(summary.generated_at)}
          {lastChange && <> · last change {when(lastChange)}</>}
        </p>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Progress />
        <WaitingOnYou changes={changes} />
      </div>
      <SectionCards />
    </PortalPage>
  );
}
