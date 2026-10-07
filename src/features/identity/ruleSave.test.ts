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

import { resolveSdkCall, effectiveNewIdentifierType } from './ruleSave';

describe('resolveSdkCall (T-4-35 QA)', () => {
  it('defaults a standalone hard rule to identify, keeps explicit choices, none for no mode', () => {
    expect(resolveSdkCall('standalone', '', 'hard')).toBe('identify');
    expect(resolveSdkCall('standalone', '', 'soft')).toBeNull();
    expect(resolveSdkCall('standalone', 'update', 'hard')).toBe('update');
    expect(resolveSdkCall('event', '', 'hard')).toBeNull();
    expect(resolveSdkCall('none', 'identify', 'hard')).toBeNull();
  });
});

describe('effectiveNewIdentifierType', () => {
  it('follows an existing entry case-insensitively, else the chosen type', () => {
    const reg = [{ name: 'cart_id', type: 'soft' }];
    expect(effectiveNewIdentifierType(reg, 'CART_ID', 'hard')).toEqual({ type: 'soft', joinsExisting: true });
    expect(effectiveNewIdentifierType(reg, 'email_id', 'hard')).toEqual({ type: 'hard', joinsExisting: false });
  });
});
