import { describe, expect, it } from 'vitest';
import { GLOSSARY, getGlossaryEntry } from './glossary';

describe('glossary (T-4-09)', () => {
  it('has unique keys', () => {
    const keys = GLOSSARY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has a non-empty term and definition', () => {
    for (const entry of GLOSSARY) {
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(0);
    }
  });

  it('covers the required terms', () => {
    const required = [
      'certified',
      'acknowledged',
      'definition',
      'variant',
      'discriminator',
      'context',
      'gap',
      'requirement_level',
      'batch',
      'activation',
      'sandbox',
    ];
    for (const key of required) {
      expect(getGlossaryEntry(key)).toBeTruthy();
    }
  });

  it('getGlossaryEntry returns undefined for an unknown key', () => {
    expect(getGlossaryEntry('nope')).toBeUndefined();
  });
});

describe('generated finding entries (T-4-21)', () => {
  it('resolves comparison and kind keys with label and explanation', () => {
    const kind = getGlossaryEntry('kind:type_mismatch');
    expect(kind?.term).toBe('Type mismatch');
    expect(kind?.definition).toContain('Next:');
    const cmp = getGlossaryEntry('comparison:definition_vs_mapping');
    expect(cmp?.term).toBe('Tracking plan vs Bloomreach mapping');
    expect(cmp?.definition.length).toBeGreaterThan(10);
    expect(getGlossaryEntry('family:schema')).toBeDefined();
  });
});
