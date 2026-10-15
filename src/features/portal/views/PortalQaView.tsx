/**
 * Portal QA view (T-5-42): QA reports (`QaReports`) and the current findings
 * (`SharedFindingsTable`), carried over from the single page unchanged. The summary only counts
 * findings per event, so the findings come from `GET /api/shared/:token/findings.json` when this
 * view opens. The old finding anchors (`#findings`, `#findings-<comparison>[-<event>]`,
 * `#current-finding-<id>`) filter and scroll the table as before.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { FindingTerm } from '@/src/components/ui/GlossaryTerm';
import { HintTh } from '@/src/components/ui/FieldHint';
import { FAMILY_INFO } from '@/src/domain/findingsCatalog';
import { computeFindingsSummary, type FindingsSummaryView } from '@/src/domain/document/findingsSummary';
import { findingsSummaryToMarkdown } from '@/src/domain/document/markdown';
import type { EventCard, EventCardFinding } from '@/src/domain/document/trackingDocument';
import { QaReports } from '@/src/features/findings/QaReports';
import { SharedFindingsTable } from '@/src/features/shared/SharedFindingsTable';
import { PORTAL_ROW_LIMIT } from '@/src/features/views/ViewParts';
import { findingEntity } from '@/src/features/shared/findingEntity';
import { SECTION_IDS, eventAnchors } from '@/src/features/shared/viewHelpers';
import type { FindingNavigation } from '@/src/features/shared/sharedFindingsModel';
import { shareApiUrl, usePortal } from '../PortalContext';
import { PortalLink, PortalPage } from '../PortalParts';
import { findingNavigationForAnchor, targetForAnchorHref } from '../portalModel';

interface FindingsList {
  events: Pick<EventCard, 'id' | 'name' | 'findings'>[];
  unattached_findings: EventCardFinding[];
}

function SummaryTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div role="region" aria-label="Details table" tabIndex={0} className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b bg-gray-50">
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
                <td key={j} className="px-3 py-2 align-top text-gray-700 [overflow-wrap:anywhere]">
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

function FindingsSummaryBlock({ summary, nameById }: { summary: FindingsSummaryView; nameById: ReadonlyMap<string, string> }) {
  const ack = summary.acknowledged;
  return (
    <div className="space-y-4 text-sm text-gray-700">
      <p>
        <span className="font-semibold text-gray-900">{summary.total} open</span> — error {summary.bySeverity.error}, warning {summary.bySeverity.warning}, info{' '}
        {summary.bySeverity.info}
        {ack.total > 0 && `. Acknowledged (resolved by hand, still reproducing): error ${ack.error}, warning ${ack.warning}, info ${ack.info}`}
      </p>
      {summary.byFamily.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">By kind of problem</h4>
          <SummaryTable
            head={['Family', 'Kinds', 'Open', 'Next step']}
            rows={summary.byFamily.map((f) => [
              <span key={f.family} title={FAMILY_INFO[f.family].explanation} className="cursor-help border-b border-dotted border-gray-400">
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
          <SummaryTable head={['Comparison', 'Error', 'Warning', 'Info']} rows={summary.byComparison.map((c) => [<FindingTerm key={c.comparison} comparison={c.comparison} />, c.error, c.warning, c.info])} />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Top events by open errors</h4>
          {summary.topEvents.length === 0 ? (
            <p className="text-xs text-gray-500">No event has an open error finding.</p>
          ) : (
            <SummaryTable
              head={['Event', 'Errors', 'All open']}
              rows={summary.topEvents.map((e) => [
                nameById.has(e.id) ? <PortalLink key={e.id} to={{ view: 'events', id: nameById.get(e.id)! }}>{e.name}</PortalLink> : e.name,
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

export function PortalQaView() {
  const { token, summary, api, comments, reloadComments, linkedComment, refIndex, index, navigate, location } = usePortal();
  const [findings, setFindings] = useState<FindingsList | null>(null);
  const [failed, setFailed] = useState(false);
  const [navigation, setNavigation] = useState<FindingNavigation>();
  useEffect(() => {
    let active = true;
    fetch(shareApiUrl(token, 'findings.json'))
      .then(async (res) => {
        if (!res.ok) throw new Error('findings');
        const data = (await res.json()) as FindingsList;
        if (active) setFindings(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const anchorById = useMemo(() => {
    const anchors = eventAnchors(summary.events.map((e) => e.name));
    return new Map(summary.events.map((e, i) => [e.id, anchors[i]]));
  }, [summary]);
  const rows = findings?.events ?? [];
  const unattached = findings?.unattached_findings ?? [];
  const comparisons = useMemo(() => [...new Set([...rows.flatMap((e) => e.findings), ...unattached].map((f) => f.comparison))], [rows, unattached]);

  // Old finding anchors filter and scroll the table, on open and on every hash change.
  useEffect(() => {
    if (!findings) return;
    let anchor = location.hash.replace(/^#/, '');
    try {
      anchor = decodeURIComponent(anchor);
    } catch {
      // keep the raw text
    }
    setNavigation((previous) => findingNavigationForAnchor(anchor, comparisons, index.eventIdByAnchor, (previous?.revision ?? 0) + 1) ?? previous);
  }, [findings, location.hash, comparisons, index]);

  const findingsSummary = useMemo(() => {
    const byId = new Map(rows.map((e) => [e.id, e.findings]));
    return computeFindingsSummary(
      summary.events.map((e) => ({ id: e.id, name: e.name, findings: byId.get(e.id) ?? [], quality: e.quality })),
      unattached
    );
  }, [summary, rows, unattached]);
  const nameById = index.eventNameById;
  const currentFindingIds = useMemo(() => [...rows.flatMap((e) => e.findings), ...unattached].map((f) => f.id), [rows, unattached]);
  const toAnchor = (anchor: string) => {
    const target = targetForAnchorHref(anchor, index);
    if (target) navigate(target);
  };

  return (
    <PortalPage
      view="qa"
      actions={findings && <CopyMarkdownButton getMarkdown={() => findingsSummaryToMarkdown(findingsSummary)} label="Copy findings as Markdown" />}
    >
      <QaReports api={api} rows={comments} onChanged={reloadComments} currentFindingIds={currentFindingIds} />
      <section id={SECTION_IDS.findings} aria-label="Findings" className="space-y-3">
        <h2 className="text-lg font-semibold">Findings</h2>
        {failed && <p role="alert" className="text-sm text-red-700">The findings could not be loaded. Reload the page to try again.</p>}
        {!findings && !failed && <p className="text-sm text-gray-400">Loading…</p>}
        {findings && (
          <>
            <SharedFindingsTable
              events={rows}
              unattached={unattached}
              api={api}
              comments={comments}
              onChanged={reloadComments}
              linkedFindingId={linkedComment?.entityType === 'finding' ? linkedComment.entityId : undefined}
              anchorFor={(eventId) => anchorById.get(eventId)}
              onNavigate={toAnchor}
              navigation={navigation}
              rowLimit={PORTAL_ROW_LIMIT}
              renderContext={(finding) => {
                const entity = findingEntity(finding, refIndex, { catalogs: SECTION_IDS.catalogs, consents: SECTION_IDS.consents });
                const target = entity.href ? targetForAnchorHref(entity.href, index) : null;
                return target ? (
                  <PortalLink to={target}>
                    {entity.type}: {entity.label ?? 'open section'}
                  </PortalLink>
                ) : (
                  [entity.type, entity.label].filter(Boolean).join(': ') || '—'
                );
              }}
            />
            <details className="rounded-lg border border-[var(--border-default)] bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium">Detailed findings summary</summary>
              <div className="mt-4">
                <FindingsSummaryBlock summary={findingsSummary} nameById={nameById} />
              </div>
            </details>
          </>
        )}
      </section>
    </PortalPage>
  );
}
