import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('strips accents', () => expect(slugify('Škoda Café Ñandú')).toBe('skoda-cafe-nandu'));
  it('collapses and trims dashes', () => expect(slugify('  --Acme   EU!! ')).toBe('acme-eu'));
  it('returns empty for symbols only', () => expect(slugify('!!! ---')).toBe(''));
  it('non-empty output is always a valid key', () => {
    for (const s of ['Acme EU', 'a_b.c', 'X--Y', 'Ünï cödé 42', '  9 lives ']) {
      const out = slugify(s);
      expect(out).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
