/**
 * Findings summary (T-4-19, item 4). Pure, computed from the public tracking document only: the
 * per-event `findings[]`/`quality.acknowledged` plus `unattached_findings[]` (their sum equals
 * `findings_summary.open`, see `TrackingDocument.unattached_findings`).
 */
import { FAMILY_INFO, FINDING_FAMILIES, findingFamily, type FindingFamily } from '../findingsCatalog';

export interface SummaryFinding {
  severity: string;
  comparison: string;
  /** T-4-21: optional so older callers still work; a missing kind counts under 'unknown'. */
  kind?: string;
}

export interface SummaryEvent {
  id: string;
  name: string;
  findings: SummaryFinding[];
  quality: { acknowledged: { error: number; warning: number; info: number } };
}

export interface FamilySummary {
  family: FindingFamily;
  total: number;
  kinds: { kind: string; count: number }[];
}

/** One comparison with the events it affects (the shared view's Findings nav group, T-4-21);
 * `unattached` counts findings that belong to no event. */
export interface ComparisonFindingsGroup {
  comparison: string;
  total: number;
  events: { id: string; name: string; count: number }[];
  unattached: number;
}

export interface FindingsSummaryView {
  /** T-4-21: open findings by kind family (empty families omitted), most findings first. */
  byFamily: FamilySummary[];
  byComparisonEvents: ComparisonFindingsGroup[];
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
  const fam = new Map<FindingFamily, Map<string, number>>();
  const count = (f: SummaryFinding) => {
    const family = findingFamily(f.comparison, f.kind ?? '');
    const kinds = fam.get(family) ?? new Map<string, number>();
    kinds.set(f.kind ?? 'unknown', (kinds.get(f.kind ?? 'unknown') ?? 0) + 1);
    fam.set(family, kinds);
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

  const byFamily: FamilySummary[] = FINDING_FAMILIES.filter((f) => fam.has(f)).map((family) => {
    const kinds = [...(fam.get(family) as Map<string, number>).entries()]
      .map(([kind, n]) => ({ kind, count: n }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
    return { family, total: kinds.reduce((n, x) => n + x.count, 0), kinds };
  });
  byFamily.sort((a, b) => b.total - a.total || FAMILY_INFO[a.family].label.localeCompare(FAMILY_INFO[b.family].label));

  const groups = new Map<string, ComparisonFindingsGroup>();
  const group = (comparison: string) => {
    const g = groups.get(comparison) ?? { comparison, total: 0, events: [], unattached: 0 };
    groups.set(comparison, g);
    return g;
  };
  for (const e of events) {
    for (const f of e.findings) {
      const g = group(f.comparison);
      g.total += 1;
      const row = g.events.find((x) => x.id === e.id);
      if (row) row.count += 1;
      else g.events.push({ id: e.id, name: e.name, count: 1 });
    }
  }
  for (const f of unattached) {
    const g = group(f.comparison);
    g.total += 1;
    g.unattached += 1;
  }
  const byComparisonEvents = [...groups.values()].sort((a, b) => a.comparison.localeCompare(b.comparison));

  const acknowledged = { error: 0, warning: 0, info: 0, total: 0 };
  for (const e of events) {
    acknowledged.error += e.quality.acknowledged.error;
    acknowledged.warning += e.quality.acknowledged.warning;
    acknowledged.info += e.quality.acknowledged.info;
  }
  acknowledged.total = acknowledged.error + acknowledged.warning + acknowledged.info;

  return {
    byFamily,
    byComparisonEvents,
    total: bySeverity.error + bySeverity.warning + bySeverity.info,
    bySeverity,
    byComparison: [...cmp.entries()]
      .map(([comparison, c]) => ({ comparison, ...c, total: c.error + c.warning + c.info }))
      .sort((a, b) => a.comparison.localeCompare(b.comparison)),
    topEvents,
    acknowledged,
  };
}
