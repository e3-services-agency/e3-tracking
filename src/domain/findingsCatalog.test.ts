import { describe, expect, it } from 'vitest';
import { COMPARISON_IDS, FINDING_KINDS } from './enums';
import {
  COMPARISON_INFO, FAMILY_INFO, FINDING_FAMILIES, KIND_INFO, comparisonLabel, findingFamily, kindLabel, kindTooltip,
} from './findingsCatalog';

describe('findings catalogue (T-4-21)', () => {
  it('has a complete entry for every comparison id and finding kind', () => {
    for (const id of COMPARISON_IDS) {
      expect(COMPARISON_INFO[id].label.length).toBeGreaterThan(3);
      expect(COMPARISON_INFO[id].explanation.length).toBeGreaterThan(10);
    }
    for (const kind of FINDING_KINDS) {
      const info = KIND_INFO[kind];
      expect(info, kind).toBeDefined();
      expect(info.kind).toBe(kind);
      expect(info.label).not.toBe(kind);
      expect(info.explanation.length).toBeGreaterThan(10);
      expect(info.next.length).toBeGreaterThan(10);
      expect(FINDING_FAMILIES).toContain(info.family);
    }
    expect(Object.keys(KIND_INFO).sort()).toEqual([...FINDING_KINDS].sort());
    expect(Object.keys(COMPARISON_INFO).sort()).toEqual([...COMPARISON_IDS].sort());
    for (const f of FINDING_FAMILIES) expect(FAMILY_INFO[f].next.length).toBeGreaterThan(5);
  });

  it('puts every Data Manager finding in the Data Manager family, others by kind', () => {
    expect(findingFamily('data_manager', 'type_mismatch')).toBe('data_manager');
    expect(findingFamily('definition_vs_observations', 'type_mismatch')).toBe('schema');
    expect(findingFamily('definition_vs_observations', 'rounding_drift')).toBe('arithmetic');
    expect(findingFamily('definition_vs_observations', 'state_list_mismatch')).toBe('consistency');
    expect(findingFamily('definition_vs_observations', 'missing_event')).toBe('coverage');
  });

  it('falls back to the raw id for unknown values', () => {
    expect(kindLabel('brand_new')).toBe('brand_new');
    expect(comparisonLabel('brand_new')).toBe('brand_new');
    expect(kindTooltip('type_mismatch')).toContain('Next:');
  });
});
