/** Internal list adapters; the canonical public summary owns finding families and severity totals. */
import { computeFindingsSummary, type SummaryEvent } from '@/src/domain/document/findingsSummary';
import { comparisonLabel, kindLabel } from '@/src/domain/findingsCatalog';

export interface InternalFinding {
  id: string; finding_sequence: number; comparison: string; kind: string; severity: string;
  event_id: string | null; message: string | null; status: string; resolved_by?: string | null;
  priority?: string; expected_json?: unknown;
}

export function searchFindings<T extends InternalFinding>(rows: readonly T[], search: string, names: ReadonlyMap<string, string>): T[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return [...rows];
  return rows.filter(f => [f.message, f.kind, kindLabel(f.kind), f.comparison, comparisonLabel(f.comparison),
    f.event_id ? names.get(f.event_id) : '', f.priority, `Finding #${String(f.finding_sequence).padStart(3, '0')}`,
    typeof f.expected_json === 'object' && f.expected_json ? (f.expected_json as Record<string, unknown>).rule_name : '',
  ].some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(query)));
}

export function summarizeInternalFindings(rows: readonly InternalFinding[], events: readonly { id: string; name: string }[]) {
  const groups = new Map<string, SummaryEvent>(events.map(e => [e.id, { ...e, findings: [], quality: { acknowledged: { error: 0, warning: 0, info: 0 } } }]));
  const unattached: InternalFinding[] = [];
  const projectAcknowledged = { error: 0, warning: 0, info: 0 };
  let resolved = 0;
  for (const finding of rows) {
    const event = finding.event_id ? groups.get(finding.event_id) : undefined;
    if (finding.status === 'open') {
      if (event) event.findings.push(finding); else unattached.push(finding);
    } else if (finding.status === 'resolved' && finding.resolved_by === 'user') {
      const counts = event?.quality.acknowledged ?? projectAcknowledged;
      const severity = finding.severity === 'error' || finding.severity === 'warning' ? finding.severity : 'info';
      counts[severity]++;
    } else if (finding.status === 'resolved') resolved++;
  }
  // Canonical summary accepts acknowledgements per event. An empty project bucket preserves
  // acknowledgements without an event without inventing an event or including it in top events.
  const summary = computeFindingsSummary([...groups.values(), { id: '', name: '', findings: [], quality: { acknowledged: projectAcknowledged } }], unattached);
  return { summary, resolved };
}
