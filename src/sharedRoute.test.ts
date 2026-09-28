/**
 * `sharedTokenFromPath` (T-4-03 pre-QA fix, D-48/D-50): the pure route matcher behind
 * `App.tsx`'s `/tracking-plan/shared/:token` mount.
 */
import { describe, expect, it } from 'vitest';
import { sharedTokenFromPath, BASE } from './sharedRoute';

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
  });

  it('T-4-03 pre-QA fix: a malformed percent-escape does not throw; falls back to the raw segment', () => {
    expect(() => sharedTokenFromPath(`${BASE}/shared/%ZZ`)).not.toThrow();
    expect(sharedTokenFromPath(`${BASE}/shared/%ZZ`)).toBe('%ZZ');
    expect(() => sharedTokenFromPath(`${BASE}/shared/%E0%A4%A`)).not.toThrow();
    expect(sharedTokenFromPath(`${BASE}/shared/%`)).toBe('%');
  });
});
