import { describe, expect, it } from 'vitest';
import { useCasePreview } from './useCasePreview';
describe('Shared use-case description preview', () => {
  it('keeps short plain text, normalizes whitespace and derives text from Markdown syntax', () => {
    expect(useCasePreview('A short unchanged description.')).toBe('A short unchanged description.');
    expect(useCasePreview('## Flow\n\n- A `customer_email`\n- **Important** [data](https://example.com)\n\nCustomer  data')).toBe('Flow A customer_email Important data Customer data');
  });
  it('caps long text at 200 Unicode code points including ellipsis, preferring a word boundary', () => {
    const result = useCasePreview('Customer data and practical recommendations. '.repeat(30));
    expect(Array.from(result).length).toBeLessThanOrEqual(200); expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/recommen…$/);
    const emoji = useCasePreview('😀'.repeat(220));
    expect(Array.from(emoji)).toHaveLength(200); expect(emoji.endsWith('…')).toBe(true);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
  });
  it('adds ellipsis only beyond the bound and never parses or injects HTML', () => {
    expect(useCasePreview('x'.repeat(200))).toBe('x'.repeat(200));
    expect(useCasePreview('<script>alert(1)</script>\n\nSafe **text**')).toBe('Safe text');
    expect(useCasePreview('')).toBe('');
  });
});
