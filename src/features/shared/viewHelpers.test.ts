import { describe, expect, it } from 'vitest';
import { sectionPresence, type NavDocInput } from './viewHelpers';
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

describe('section presence (D-64)', () => {
  const eventProps = [{ category: 'event' as const, kind: 'item' as const, name: 'items' }];

  it('shows Properties for event-scope properties alone, none when both lists are empty', () => {
    expect(sectionPresence({ ...base(0), properties: [], event_properties: eventProps }).properties).toBe(true);
    expect(sectionPresence(base(0)).properties).toBe(false);
  });

  it('shows the Catalogs section only when the project has catalogs', () => {
    expect(sectionPresence(base(0)).catalogs).toBe(false);
    expect(sectionPresence({ ...base(0), catalogs: [{}] }).catalogs).toBe(true);
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
