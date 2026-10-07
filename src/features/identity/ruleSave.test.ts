import { describe, expect, it } from 'vitest';
import { resolveEventSourceId, resolveSaveTarget } from './ruleSave';

describe('resolveSaveTarget', () => {
  it('POSTs a new rule once, then PATCHes the created one', () => {
    expect(resolveSaveTarget('/r', null)).toEqual({ method: 'POST', url: '/r' });
    expect(resolveSaveTarget('/r', 'abc')).toEqual({ method: 'PATCH', url: '/r/abc' });
  });
});

describe('resolveEventSourceId', () => {
  const sources = [{ id: 'a' }, { id: 'b' }];
  it('keeps a hand-set source that is one of the event sources, else the first', () => {
    expect(resolveEventSourceId(sources, 'b')).toBe('b');
    expect(resolveEventSourceId(sources, 'zzz')).toBe('a');
    expect(resolveEventSourceId(sources, null)).toBe('a');
  });
  it('never clears a set source when the event has none', () => {
    expect(resolveEventSourceId([], 'x')).toBe('x');
    expect(resolveEventSourceId(undefined, null)).toBeNull();
  });
});
