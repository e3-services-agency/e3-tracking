/**
 * `sharedTokenFromPath` (T-4-03 pre-QA fix, D-48/D-50): the pure route matcher behind
 * `App.tsx`'s `/tracking-plan/shared/:token` mount.
 */
import { describe, expect, it } from 'vitest';
import { sharedTokenFromPath, sharedRouteFromPath, sharedPath, BASE } from './sharedRoute';

describe('sharedTokenFromPath', () => {
  it('extracts a well-formed token', () => {
    expect(sharedTokenFromPath(`${BASE}/shared/abc123`)).toBe('abc123');
  });

  it('decodes a percent-encoded token', () => {
    expect(sharedTokenFromPath(`${BASE}/shared/a%20b`)).toBe('a b');
  });

  it('returns undefined for every other path', () => {
    expect(sharedTokenFromPath(`${BASE}/events`)).toBeUndefined();
    expect(sharedTokenFromPath(`${BASE}/`)).toBeUndefined();
    expect(sharedTokenFromPath(`${BASE}/shared/`)).toBeUndefined();
    expect(sharedTokenFromPath(`${BASE}/shared/abc/events/x/extra`)).toBeUndefined();
  });

  it('T-5-42: accepts the portal view and item segments', () => {
    expect(sharedTokenFromPath(`${BASE}/shared/abc123/events`)).toBe('abc123');
    expect(sharedRouteFromPath(`${BASE}/shared/abc123`)).toEqual({ token: 'abc123', view: null, id: null });
    expect(sharedRouteFromPath(`${BASE}/shared/abc123/`)).toEqual({ token: 'abc123', view: null, id: null });
    expect(sharedRouteFromPath(`${BASE}/shared/abc123/qa`)).toEqual({ token: 'abc123', view: 'qa', id: null });
    expect(sharedRouteFromPath(`${BASE}/shared/abc123/events/cart_update/`)).toEqual({ token: 'abc123', view: 'events', id: 'cart_update' });
    expect(sharedRouteFromPath(`${BASE}/shared/abc123/use-cases/UC%2001`)).toEqual({ token: 'abc123', view: 'use-cases', id: 'UC 01' });
    expect(sharedRouteFromPath(`${BASE}/shared/abc123/events/%ZZ`)).toEqual({ token: 'abc123', view: 'events', id: '%ZZ' });
  });

  it('T-5-42: sharedPath is the inverse of sharedRouteFromPath', () => {
    for (const [view, id] of [[null, null], ['events', null], ['events', 'page.view'], ['use-cases', 'UC 01/2'], ['properties', 'a%b']] as const) {
      const route = sharedRouteFromPath(sharedPath('tok en', view, id));
      expect(route).toEqual({ token: 'tok en', view, id });
    }
  });

  it('T-4-03 pre-QA fix: a malformed percent-escape does not throw; falls back to the raw segment', () => {
    expect(() => sharedTokenFromPath(`${BASE}/shared/%ZZ`)).not.toThrow();
    expect(sharedTokenFromPath(`${BASE}/shared/%ZZ`)).toBe('%ZZ');
    expect(() => sharedTokenFromPath(`${BASE}/shared/%E0%A4%A`)).not.toThrow();
    expect(sharedTokenFromPath(`${BASE}/shared/%`)).toBe('%');
  });
});
