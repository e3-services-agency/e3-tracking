import { describe, expect, it } from 'vitest';
import { EMPTY_FINDING_FILTERS, filterSharedFindings, sharedFindingRows } from './sharedFindingsModel';
import type { EventCardFinding } from '@/src/domain/document/trackingDocument';
const finding = (id: string, finding_sequence: number, severity: EventCardFinding['severity']): EventCardFinding => ({
  id, finding_sequence, severity, comparison: 'definition_vs_mapping', kind: 'missing_required', property_id: null, property: null,
  variant_id: null, variant: null, rule: null, message: 'Message', expected: null, actual: null, qa_run_id: null, first_seen: '', last_seen: '',
});
describe('Public finding ordering and filters', () => {
  it('sorts severity then stable sequence without renumbering or mutating source findings', () => {
    const input = [finding('info', 1, 'info'), finding('warning', 2, 'warning'), finding('later-error', 9, 'error'), finding('earlier-error', 3, 'error')];
    const rows = sharedFindingRows([], input);
    expect(rows.map(row => [row.finding.id, row.finding.finding_sequence])).toEqual([['earlier-error', 3], ['later-error', 9], ['warning', 2], ['info', 1]]);
    expect(input.map(row => row.id)).toEqual(['info', 'warning', 'later-error', 'earlier-error']);
  });
  it('searches the visible stable number and label, while all filters intersect', () => {
    const rows = sharedFindingRows([{ id: 'event', name: 'Checkout', findings: [finding('event-finding', 9, 'error')] }], [finding('project', 10, 'warning')]);
    const label = '#' + '009';
    expect(filterSharedFindings(rows, { ...EMPTY_FINDING_FILTERS, search: label }).map(row => row.finding.id)).toEqual(['event-finding']);
    expect(filterSharedFindings(rows, { search: 'Finding ' + label, severity: 'error', eventId: 'event', comparison: 'definition_vs_mapping' })).toHaveLength(1);
    expect(filterSharedFindings(rows, { ...EMPTY_FINDING_FILTERS, search: label, eventId: '__project__' })).toHaveLength(0);
  });
});
