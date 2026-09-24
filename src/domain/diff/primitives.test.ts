import { describe, expect, it } from 'vitest';
import { diffRecordSets, diffValue, diffWarning } from './primitives';
import { payloadHash } from './hash';

describe('diffValue', () => {
  it('returns null when values are equal', () => {
    expect(diffValue('event', 'purchase', 'status', 'planned', 'planned')).toBeNull();
  });

  it('returns null when nested objects are deeply equal regardless of key order', () => {
    expect(
      diffValue('event', 'purchase', 'expiration_json', { count: 3, units: 'months' }, { units: 'months', count: 3 })
    ).toBeNull();
  });

  it('returns a change Difference when values differ', () => {
    const diff = diffValue('event', 'purchase', 'status', 'planned', 'implemented');
    expect(diff).toEqual({
      kind: 'change',
      entity_type: 'event',
      key: 'purchase',
      field: 'status',
      before: 'planned',
      after: 'implemented',
      message: 'event "purchase".status changes from "planned" to "implemented".',
    });
  });
});

describe('diffWarning', () => {
  it('builds a warning-kind Difference', () => {
    expect(diffWarning('catalog', 'main', 'empty catalog block')).toEqual({
      kind: 'warning',
      entity_type: 'catalog',
      key: 'main',
      message: 'empty catalog block',
    });
  });
});

interface FixtureRecord {
  name: string;
  status: string;
}

describe('diffRecordSets', () => {
  const fieldsFn = (r: FixtureRecord) => ({ status: r.status });
  const keyFn = (r: FixtureRecord) => r.name;

  it('produces an add Difference for a key only in after', () => {
    const diffs = diffRecordSets<FixtureRecord>('event', [], [{ name: 'purchase', status: 'planned' }], keyFn, fieldsFn);
    expect(diffs).toEqual([
      {
        kind: 'add',
        entity_type: 'event',
        key: 'purchase',
        after: { status: 'planned' },
        message: 'event "purchase" will be created.',
      },
    ]);
  });

  it('produces a remove Difference for a key only in before', () => {
    const diffs = diffRecordSets<FixtureRecord>('event', [{ name: 'purchase', status: 'planned' }], [], keyFn, fieldsFn);
    expect(diffs).toEqual([
      {
        kind: 'remove',
        entity_type: 'event',
        key: 'purchase',
        before: { status: 'planned' },
        message: 'event "purchase" will be removed.',
      },
    ]);
  });

  it('produces one change Difference per differing field for a key in both', () => {
    const diffs = diffRecordSets<FixtureRecord>(
      'event',
      [{ name: 'purchase', status: 'planned' }],
      [{ name: 'purchase', status: 'implemented' }],
      keyFn,
      fieldsFn
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ kind: 'change', key: 'purchase', field: 'status', before: 'planned', after: 'implemented' });
  });

  it('produces nothing for a key whose fields are all equal', () => {
    const diffs = diffRecordSets<FixtureRecord>(
      'event',
      [{ name: 'purchase', status: 'planned' }],
      [{ name: 'purchase', status: 'planned' }],
      keyFn,
      fieldsFn
    );
    expect(diffs).toEqual([]);
  });
});

describe('payloadHash', () => {
  it('is stable regardless of key order', () => {
    expect(payloadHash({ a: 1, b: 2 })).toBe(payloadHash({ b: 2, a: 1 }));
  });

  it('differs when content differs', () => {
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
  });
});
