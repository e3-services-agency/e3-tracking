import { describe, expect, it } from 'vitest';
import {
  CATALOG_KINDS, ENTITY_STATUSES, EVENT_CLASSES, EVENT_STATUSES, FINDING_SEVERITIES, FINDING_STATUSES,
  IMPLEMENTATION_METHODS, PRIORITIES, PROPERTY_KINDS, REQUIREMENT_LEVELS, REQUIREMENT_STATUSES,
  REQUIREMENT_TARGET_KINDS, RULE_SEVERITIES, USE_CASE_STATUSES,
} from '@/src/domain/enums';
import { ENUM_LABELS, enumLabel, type EnumKind } from '@/src/domain/enumLabels';
import {
  CATALOG_KIND_ICONS, CLASS_ICONS, ENTITY_ICONS, IMPLEMENTATION_ICONS, LEVEL_ICONS, PRIORITY_ICONS,
  PROPERTY_KIND_ICONS, SEVERITY_ICONS, STATUS_ICONS, TARGET_KIND_ICONS,
} from '@/src/components/layout/navIcons';

const USED: { kind: EnumKind; values: readonly string[]; icons: Record<string, unknown> }[] = [
  { kind: 'priority', values: PRIORITIES, icons: PRIORITY_ICONS },
  { kind: 'status', values: [...EVENT_STATUSES, ...ENTITY_STATUSES, ...USE_CASE_STATUSES, ...REQUIREMENT_STATUSES, ...FINDING_STATUSES], icons: STATUS_ICONS },
  { kind: 'class', values: EVENT_CLASSES, icons: CLASS_ICONS },
  { kind: 'property_kind', values: PROPERTY_KINDS, icons: PROPERTY_KIND_ICONS },
  { kind: 'catalog_kind', values: CATALOG_KINDS, icons: CATALOG_KIND_ICONS },
  { kind: 'implementation', values: IMPLEMENTATION_METHODS, icons: IMPLEMENTATION_ICONS },
  { kind: 'level', values: REQUIREMENT_LEVELS, icons: LEVEL_ICONS },
  { kind: 'severity', values: [...FINDING_SEVERITIES, ...RULE_SEVERITIES], icons: SEVERITY_ICONS },
  { kind: 'target_kind', values: REQUIREMENT_TARGET_KINDS, icons: TARGET_KIND_ICONS },
];

describe('EnumSelect vocabulary', () => {
  for (const { kind, values, icons } of USED) {
    it(`${kind}: every value has a human label and an icon`, () => {
      for (const v of values) {
        expect(ENUM_LABELS[kind][v], `${kind}.${v} label`).toBeTruthy();
        expect(enumLabel(kind, v)).not.toContain('_');
        expect(icons[v], `${kind}.${v} icon`).toBeTruthy();
      }
    });
  }
  it('EntityIcon covers every requirement target kind', () => {
    for (const k of REQUIREMENT_TARGET_KINDS) expect(ENTITY_ICONS[k], k).toBeTruthy();
  });
  it('EntityIcon covers the entity kinds', () => {
    for (const k of ['event', 'variant', 'property', 'catalog', 'consent', 'source', 'use_case', 'bundle'] as const) {
      expect(ENTITY_ICONS[k], k).toBeTruthy();
    }
  });
});
