import { describe, expect, it } from 'vitest';
import { sectionPresence, type NavDocInput } from './viewHelpers';

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
