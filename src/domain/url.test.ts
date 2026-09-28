import { describe, expect, it } from 'vitest';
import { isHttpUrl } from './url';

describe('isHttpUrl', () => {
  it('accepts http:// and https://, case-insensitively', () => {
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('HTTPS://example.com')).toBe(true);
  });

  it('rejects javascript: and other non-http(s) schemes', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('//example.com')).toBe(false);
    expect(isHttpUrl('example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isHttpUrl('')).toBe(false);
  });
});
