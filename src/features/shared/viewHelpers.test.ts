import { describe, expect, it } from 'vitest';
import { buildSectionIndex, renderedSectionIds, sectionPresence, sharedPropertyGroups, type NavDocInput } from './viewHelpers';
import { SHARED_SECTION_ICONS, NAV_ICONS } from '../../components/layout/navIcons';
import { SECTION_IDS } from './viewHelpers';

const base = (ack: number, open = 0): NavDocInput => ({
  events: [{ name: 'e', class: 'custom', quality: { acknowledged: { error: ack, warning: 0, info: 0 } } }],
  properties: [],
  use_cases: [],
  identity_rules: [],
  consent_categories: [],
  catalogs: [],
  standard_event_mappings: [],
  findings_summary: { open: { error: open, warning: 0, info: 0 } },
});

describe('sectionPresence findings (T-4-19 I3)', () => {
  it('shows the findings section for open or acknowledged findings only', () => {
    expect(sectionPresence(base(0, 0)).findings).toBe(false);
    expect(sectionPresence(base(0, 1)).findings).toBe(true);
    expect(sectionPresence(base(2, 0)).findings).toBe(true);
  });
});

describe('properties groups in the shared nav (D-64)', () => {
  const props = [
    { category: 'system_customer' as const, name: 'email' },
    { category: 'customer' as const, name: 'tier' },
  ];
  const eventProps = [
    { category: 'sdk_default' as const, kind: 'context' as const, name: 'browser' },
    { category: 'event' as const, kind: 'item' as const, name: 'items' },
    { category: 'event' as const, kind: 'event' as const, name: 'product_id' },
  ];
  const doc = (): NavDocInput => ({ ...base(0), properties: props, event_properties: eventProps });

  it('groups customer and event properties by category, Event split by kind', () => {
    const groups = sharedPropertyGroups({ properties: props, event_properties: eventProps });
    expect(groups.map((g) => g.category)).toEqual(['system_customer', 'customer', 'sdk_default', 'event']);
    expect(groups[3].subgroups.map((s) => s.kind)).toEqual(['event', 'item']);
  });

  it('lists the groups (and kind subgroups) under Properties in the nav and the rendered ids', () => {
    const nav = buildSectionIndex(doc());
    const properties = nav.find((n) => n.id === 'properties')!;
    expect(properties.label).toBe('Properties (5)');
    expect(properties.children!.map((c) => c.id)).toEqual([
      'properties-system_customer',
      'properties-customer',
      'properties-sdk_default',
      'properties-event',
    ]);
    expect(properties.children![3].children!.map((c) => c.id)).toEqual(['properties-event-event', 'properties-event-item']);
    const ids = renderedSectionIds(doc());
    expect(ids).toContain('properties-event-item');
    expect(ids.indexOf('properties')).toBeLessThan(ids.indexOf('properties-system_customer'));
  });

  it('shows Properties for event-scope properties alone, none when both lists are empty', () => {
    expect(sectionPresence({ ...base(0), properties: [], event_properties: eventProps }).properties).toBe(true);
    expect(sectionPresence(base(0)).properties).toBe(false);
  });

  it('shows the Catalogs section only when the project has catalogs', () => {
    expect(sectionPresence(base(0)).catalogs).toBe(false);
    expect(buildSectionIndex({ ...base(0), catalogs: [{}] }).map((n) => n.id)).toContain('catalogs');
    expect(buildSectionIndex(base(0)).map((n) => n.id)).not.toContain('catalogs');
  });
});

describe('shared icons (D-64)', () => {
  it('every shared section has an icon and it is the sidebar icon for the matching tab', () => {
    for (const id of Object.values(SECTION_IDS)) expect(SHARED_SECTION_ICONS[id]).toBeDefined();
    expect(SHARED_SECTION_ICONS.events).toBe(NAV_ICONS.events);
    expect(SHARED_SECTION_ICONS.properties).toBe(NAV_ICONS.properties);
    expect(SHARED_SECTION_ICONS.catalogs).toBe(NAV_ICONS.catalogs);
    expect(SHARED_SECTION_ICONS['use-cases']).toBe(NAV_ICONS.useCases);
    expect(SHARED_SECTION_ICONS.identity).toBe(NAV_ICONS.identityRules);
    expect(SHARED_SECTION_ICONS.consents).toBe(NAV_ICONS.consentCategories);
    expect(SHARED_SECTION_ICONS.mapping).toBe(NAV_ICONS.standardEvents);
    expect(SHARED_SECTION_ICONS.findings).toBe(NAV_ICONS.findings);
  });
});
