/**
 * Findings summary (T-4-19, item 4). Pure, computed from the public tracking document only: the
 * per-event `findings[]`/`quality.acknowledged` plus `unattached_findings[]` (their sum equals
 * `findings_summary.open`, see `TrackingDocument.unattached_findings`).
 */
export interface SummaryFinding {
  severity: string;
  comparison: string;
}

export interface SummaryEvent {
  id: string;
  name: string;
  findings: SummaryFinding[];
  quality: { acknowledged: { error: number; warning: number; info: number } };
}

export interface FindingsSummaryView {
  total: number;
  bySeverity: { error: number; warning: number; info: number };
  byComparison: { comparison: string; error: number; warning: number; info: number; total: number }[];
  /** Up to `limit` events with at least one open error finding, most errors first (ties by name). */
  topEvents: { id: string; name: string; errors: number; total: number }[];
  acknowledged: { error: number; warning: number; info: number; total: number };
}

export function computeFindingsSummary(
  events: SummaryEvent[],
  unattached: SummaryFinding[] = [],
  limit = 5
): FindingsSummaryView {
  const bySeverity = { error: 0, warning: 0, info: 0 };
  const cmp = new Map<string, { error: number; warning: number; info: number }>();
  const count = (f: SummaryFinding) => {
    const sev = f.severity === 'error' || f.severity === 'warning' || f.severity === 'info' ? f.severity : 'info';
    bySeverity[sev] += 1;
    const row = cmp.get(f.comparison) ?? { error: 0, warning: 0, info: 0 };
    row[sev] += 1;
    cmp.set(f.comparison, row);
  };
  for (const e of events) e.findings.forEach(count);
  unattached.forEach(count);

  const topEvents = events
    .map((e) => ({ id: e.id, name: e.name, errors: e.findings.filter((f) => f.severity === 'error').length, total: e.findings.length }))
    .filter((e) => e.errors > 0)
    .sort((a, b) => b.errors - a.errors || a.name.localeCompare(b.name))
    .slice(0, limit);

  const acknowledged = { error: 0, warning: 0, info: 0, total: 0 };
  for (const e of events) {
    acknowledged.error += e.quality.acknowledged.error;
    acknowledged.warning += e.quality.acknowledged.warning;
    acknowledged.info += e.quality.acknowledged.info;
  }
  acknowledged.total = acknowledged.error + acknowledged.warning + acknowledged.info;

  return {
    total: bySeverity.error + bySeverity.warning + bySeverity.info,
    bySeverity,
    byComparison: [...cmp.entries()]
      .map(([comparison, c]) => ({ comparison, ...c, total: c.error + c.warning + c.info }))
      .sort((a, b) => a.comparison.localeCompare(b.comparison)),
    topEvents,
    acknowledged,
  };
}
