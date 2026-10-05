import { describe, expect, it } from 'vitest';
import { groupFieldMap, mappingHeading } from './standardMappings';
import { computeFindingsSummary } from './findingsSummary';
import { secondaryPropertyLines } from './propertyColumns';

describe('groupFieldMap', () => {
  it('lists mapped first, unmapped after, with the count', () => {
    const g = groupFieldMap({ a: null, b: 'prop_b', c: 'prop_c', d: null });
    expect(g.mapped).toEqual([
      { field: 'b', property: 'prop_b' },
      { field: 'c', property: 'prop_c' },
    ]);
    expect(g.unmapped).toEqual(['a', 'd']);
    expect(g.summary).toBe('2 of 4 fields mapped');
  });
  it('handles empty and singular', () => {
    expect(groupFieldMap({}).summary).toBe('0 of 0 fields mapped');
    expect(groupFieldMap({ x: 'y' }).summary).toBe('1 of 1 field mapped');
  });
  it('heading', () => {
    expect(mappingHeading('purchase', 'purchase', 'success')).toBe('purchase → purchase (success)');
    expect(mappingHeading('view_item', 'view', null)).toBe('view_item → view');
  });
});

const f = (severity: string, comparison: string) => ({ severity, comparison });
const q = (error = 0) => ({ acknowledged: { error, warning: 0, info: 0 } });

describe('computeFindingsSummary', () => {
  const events = [
    { id: '1', name: 'b', findings: [f('error', 'x'), f('error', 'x'), f('warning', 'y')], quality: q(1) },
    { id: '2', name: 'a', findings: [f('error', 'y'), f('error', 'y')], quality: q() },
    { id: '3', name: 'c', findings: [f('info', 'y')], quality: q(2) },
  ];
  it('counts by severity and comparison, incl. unattached', () => {
    const s = computeFindingsSummary(events, [f('error', 'z')]);
    expect(s.bySeverity).toEqual({ error: 5, warning: 1, info: 1 });
    expect(s.total).toBe(7);
    expect(s.byComparison.map((c) => [c.comparison, c.total])).toEqual([
      ['x', 2],
      ['y', 4],
      ['z', 1],
    ]);
  });
  it('top events by errors, ties by name, only events with errors, limited', () => {
    const s = computeFindingsSummary(events, [], 1);
    expect(s.topEvents.map((e) => e.name)).toEqual(['a']);
    expect(computeFindingsSummary(events).topEvents.map((e) => e.name)).toEqual(['a', 'b']);
  });
  it('sums acknowledged', () => {
    expect(computeFindingsSummary(events).acknowledged.total).toBe(3);
  });
});

describe('secondaryPropertyLines', () => {
  it('only what is present', () => {
    expect(
      secondaryPropertyLines({ name: 'n', payload_key: 'n', data_type: 'string', data_formats: [], role: 'normal', allowed_values: null, pii: false })
    ).toEqual([]);
    expect(
      secondaryPropertyLines({
        name: 'n',
        payload_key: 'k',
        data_type: 'string',
        data_formats: ['url'],
        role: 'context',
        allowed_values: [{ value: 'a' }],
        pii: true,
        bundle: 'B',
        datalayer_path: 'p',
      })
    ).toEqual(['Name: n', 'Role: context', 'Formats: url', 'Allowed values: a', 'PII', 'Bundle: B', 'dataLayer: p']);
  });
});

describe('computeFindingsSummary by kind family (T-4-21)', () => {
  const f = (severity: string, comparison: string, kind: string) => ({ severity, comparison, kind });
  const events = [
    { id: 'a', name: 'a', findings: [f('error', 'definition_vs_observations', 'type_mismatch'), f('error', 'definition_vs_observations', 'type_mismatch'), f('warning', 'definition_vs_observations', 'rounding_drift')], quality: { acknowledged: { error: 0, warning: 0, info: 0 } } },
    { id: 'b', name: 'b', findings: [f('warning', 'data_manager', 'type_mismatch')], quality: { acknowledged: { error: 0, warning: 0, info: 0 } } },
  ];
  it('groups by family (Data Manager by comparison), kinds counted, most first', () => {
    const s = computeFindingsSummary(events, [f('info', 'definition_vs_observations', 'state_list_mismatch')]);
    expect(s.byFamily.map((x) => [x.family, x.total])).toEqual([['schema', 2], ['arithmetic', 1], ['consistency', 1], ['data_manager', 1]]);
    expect(s.byFamily[0].kinds).toEqual([{ kind: 'type_mismatch', count: 2 }]);
  });
  it('lists affected events per comparison with the unattached count', () => {
    const s = computeFindingsSummary(events, [f('info', 'definition_vs_observations', 'unexpected_event')]);
    const g = s.byComparisonEvents.find((x) => x.comparison === 'definition_vs_observations')!;
    expect(g.events).toEqual([{ id: 'a', name: 'a', count: 3 }]);
    expect(g.unattached).toBe(1);
    expect(g.total).toBe(4);
  });
});
