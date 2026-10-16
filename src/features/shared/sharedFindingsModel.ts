import type { EventCard, EventCardFinding } from '@/src/domain/document/trackingDocument';
import { comparisonLabel, kindLabel } from '@/src/domain/findingsCatalog';
export interface SharedFindingRow { finding: EventCardFinding; event: Pick<EventCard, 'id' | 'name'> | null }
export interface FindingFilters { search: string; severity: string; eventId: string; comparison: string; priority: string }
export interface FindingNavigation { revision: number; comparison?: string; eventId?: string; findingId?: string; priority?: string }
export const EMPTY_FINDING_FILTERS: FindingFilters = { search: '', severity: '', eventId: '', comparison: '', priority: '' };
export const PROJECT_FINDINGS = '__project__';
const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };
/** D-89 (T-5-48): the backend's `priority_rank` first (never recomputed here); a finding without one
 * (an older document) sorts after ranked ones, by severity then stable number. */
export function sharedFindingRows(events: Pick<EventCard, 'id' | 'name' | 'findings'>[], unattached: EventCardFinding[]): SharedFindingRow[] {
  return [...events.flatMap(event => event.findings.map(finding => ({ finding, event }))), ...unattached.map(finding => ({ finding, event: null }))]
    .sort((a, b) => (a.finding.priority_rank ?? Number.MAX_SAFE_INTEGER) - (b.finding.priority_rank ?? Number.MAX_SAFE_INTEGER)
      || (SEVERITY_ORDER[a.finding.severity] ?? 3) - (SEVERITY_ORDER[b.finding.severity] ?? 3)
      || (a.finding.finding_sequence ?? Number.MAX_SAFE_INTEGER) - (b.finding.finding_sequence ?? Number.MAX_SAFE_INTEGER)
      || (a.finding.id < b.finding.id ? -1 : a.finding.id > b.finding.id ? 1 : 0));
}
export function filterSharedFindings(rows: SharedFindingRow[], filters: FindingFilters): SharedFindingRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter(({ finding: f, event }) => (!filters.severity || f.severity === filters.severity)
    && (!filters.priority || f.priority === filters.priority)
    && (!filters.comparison || f.comparison === filters.comparison)
    && (!filters.eventId || (event?.id ?? PROJECT_FINDINGS) === filters.eventId)
    && (!query || [f.finding_sequence, `Finding #${String(f.finding_sequence ?? '').padStart(3, '0')}`, f.message, kindLabel(f.kind), comparisonLabel(f.comparison), event?.name, f.property, f.variant, f.rule]
      .filter(value => value != null).join(' ').toLowerCase().includes(query)));
}
