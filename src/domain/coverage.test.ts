import { describe, expect, it } from 'vitest';
import { computeEventCoverage, type CoverageObservation } from './coverage';

const EVENT_ID = 'evt-cart-update';
const VARIANT_ADD = { id: 'var-add', name: 'action=add' };
const VARIANT_REMOVE = { id: 'var-remove', name: 'action=remove' };
const CONTEXT_LOCATION = { property_id: 'prop-location', name: 'location', payload_key: 'location', values: ['web', 'app'] };

function obs(overrides: Partial<CoverageObservation>): CoverageObservation {
  return {
    event_id: EVENT_ID,
    variant_id: null,
    properties: {},
    context_values: null,
    timestamp: 1000,
    ...overrides,
  };
}

describe('computeEventCoverage', () => {
  it('builds two variants x two context values, with observed and unobserved cells', () => {
    const observations: CoverageObservation[] = [
      obs({ variant_id: VARIANT_ADD.id, properties: { location: 'web' }, timestamp: 100 }),
      obs({ variant_id: VARIANT_ADD.id, properties: { location: 'web' }, timestamp: 200 }),
      obs({ variant_id: VARIANT_REMOVE.id, properties: { location: 'app' }, timestamp: 300 }),
      // A different event's observation must never leak into this grid.
      obs({ event_id: 'other-event', variant_id: VARIANT_ADD.id, properties: { location: 'web' } }),
    ];

    const grid = computeEventCoverage(EVENT_ID, [VARIANT_ADD, VARIANT_REMOVE], [CONTEXT_LOCATION], observations);

    expect(grid.rows).toEqual([
      { variant_id: VARIANT_ADD.id, name: VARIANT_ADD.name },
      { variant_id: VARIANT_REMOVE.id, name: VARIANT_REMOVE.name },
    ]);
    expect(grid.columns).toEqual([
      { property_id: 'prop-location', name: 'location', payload_key: 'location', values: ['web', 'app'] },
    ]);

    const observedCell = grid.cells.find((c) => c.row === VARIANT_ADD.id && c.value === 'web');
    expect(observedCell).toEqual({ row: VARIANT_ADD.id, property_id: 'prop-location', value: 'web', count: 2, last_seen: 200 });

    const observedRemoveCell = grid.cells.find((c) => c.row === VARIANT_REMOVE.id && c.value === 'app');
    expect(observedRemoveCell?.count).toBe(1);

    // add[location=app] and remove[location=web] were never observed.
    expect(grid.unobserved).toContainEqual({ row: VARIANT_ADD.id, property_id: 'prop-location', value: 'app' });
    expect(grid.unobserved).toContainEqual({ row: VARIANT_REMOVE.id, property_id: 'prop-location', value: 'web' });
    expect(grid.cells).toHaveLength(2);
    expect(grid.unobserved).toHaveLength(2);
  });

  it('adds a base row only when a variant-less observation exists (variants defined)', () => {
    const withoutBase = computeEventCoverage(EVENT_ID, [VARIANT_ADD], [], [obs({ variant_id: VARIANT_ADD.id })]);
    expect(withoutBase.rows).toEqual([{ variant_id: VARIANT_ADD.id, name: VARIANT_ADD.name }]);

    const withBase = computeEventCoverage(
      EVENT_ID,
      [VARIANT_ADD],
      [],
      [obs({ variant_id: VARIANT_ADD.id }), obs({ variant_id: null })]
    );
    expect(withBase.rows).toEqual([
      { variant_id: VARIANT_ADD.id, name: VARIANT_ADD.name },
      { variant_id: null, name: '(no variant)' },
    ]);
  });

  it('always includes the base row when the event has no variants', () => {
    const grid = computeEventCoverage(EVENT_ID, [], [CONTEXT_LOCATION], []);
    expect(grid.rows).toEqual([{ variant_id: null, name: '(no variant)' }]);
    expect(grid.unobserved).toEqual([
      { row: 'base', property_id: 'prop-location', value: 'web' },
      { row: 'base', property_id: 'prop-location', value: 'app' },
    ]);
  });

  it('reads context_values_json ahead of the raw payload for a column value', () => {
    const grid = computeEventCoverage(
      EVENT_ID,
      [],
      [CONTEXT_LOCATION],
      [obs({ variant_id: null, properties: { location: 'web' }, context_values: { location: 'app' } })]
    );
    const cell = grid.cells.find((c) => c.property_id === 'prop-location');
    expect(cell?.value).toBe('app');
  });
});
