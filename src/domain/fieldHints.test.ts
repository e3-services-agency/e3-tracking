import { describe, expect, it } from 'vitest';
import { FIELD_HINTS, hintFor } from './fieldHints';

describe('hintFor', () => {
  it('prefers the page-scoped entry over the generic one', () => {
    expect(hintFor('Status', 'Events')).toContain('in review');
    expect(hintFor('Status', 'Properties')).toBe(FIELD_HINTS.Status);
  });
  it('ignores trailing colons and asterisks and extra whitespace', () => {
    expect(hintFor('  Name *', 'Events')).toBe(FIELD_HINTS['Events.Name']);
  });
  it('falls back to the glossary and returns undefined for unknown labels', () => {
    expect(hintFor('Variant')).toContain('discriminator');
    expect(hintFor('Totally unknown label')).toBeUndefined();
    expect(hintFor('')).toBeUndefined();
  });
  it('has a one-sentence hint for every scoped key base', () => {
    for (const [key, value] of Object.entries(FIELD_HINTS)) {
      expect(value.length, key).toBeGreaterThan(5);
    }
  });
});
