import { describe, expect, it } from 'vitest';
import { eventCardToMarkdown, mdCell, useCaseToMarkdown } from './markdown';
import type { EventCard, TrackingDocumentUseCase } from './trackingDocument';

const sev = { error: 0, warning: 0, info: 0 };

function card(over: Partial<EventCard> = {}): EventCard {
  return {
    id: 'e1',
    name: 'cart_update',
    business_name: 'Cart update',
    class: 'custom',
    description: 'Fires on cart changes.',
    purpose: null,
    page: null,
    trigger: null,
    grain: 'one per action',
    identity_note: null,
    owners: { business: 'Ann', technical: null },
    priority: 'high',
    status: 'active',
    certification: { applicable: true, certified: false, reasons: ['open_errors: 2', 'no_observations'] },
    expiration: { effective: null, source: null },
    properties: [
      {
        property_id: 'p1', name: 'action', payload_key: 'action', data_type: 'string', data_formats: [], required: true,
        role: 'discriminator', allowed_values: [{ value: 'add', label: null, standard_event: null }, { value: 'remove', label: null, standard_event: null }],
        item_schema: null, example: 'add', description: 'a|b', pii: false, definition_id: null, definition_name: null,
      },
    ],
    variants: [
      {
        id: 'v1', name: 'cart_update[action=add]', standard_event: null, expected_payload: { action: 'add' }, required_keys: ['action'],
        expiration: null, conditions: [{ property_id: 'p1', property_name: 'action', operator: 'equals', values: ['add'] }],
      },
    ],
    standard_event_mappings: [],
    contexts: [],
    triggers: [{ title: 'Add button', description: null, image_path: null, page_url: 'https://shop.example/p/1' }],
    coverage: { rows: [], columns: [], observed_count: 0, unobserved_count: 0 },
    rules: [],
    derived_metrics: null,
    not_suitable_for: null,
    use_cases: [],
    freshness: { last_observation_at: null, observation_count: 0 },
    quality: { open: { error: 2, warning: 1, info: 0 }, acknowledged: sev, by_comparison: {} },
    findings: [],
    agent_instructions: null,
    codegen: { gtm: '', web_sdk: '', tracking_api: '' },
    sdk_default_properties: [],
    ...over,
  } as EventCard;
}

describe('mdCell', () => {
  it('escapes pipes and flattens newlines', () => {
    expect(mdCell('a|b\nc')).toBe('a\\|b c');
    expect(mdCell(null)).toBe('');
  });
});

describe('eventCardToMarkdown', () => {
  it('renders header, certification, tables, triggers and a JSON payload block', () => {
    const md = eventCardToMarkdown(card());
    expect(md).toContain('# Event: cart_update');
    expect(md).toContain('Not certified. Reasons: open_errors: 2, no_observations.');
    expect(md).toContain('| action | action |  | string |  | yes | discriminator | add, remove | add | a\\|b |');
    expect(md).toContain('| cart_update[action=add] | action = add |');
    expect(md).toContain('https://shop.example/p/1');
    expect(md).toContain('```json\n{\n  "action": "add"\n}\n```');
    expect(md).toContain('Open: 2 errors, 1 warnings, 0 info.');
  });

  it('handles an event with no variants, no properties and a non-applicable certification', () => {
    const md = eventCardToMarkdown(
      card({ properties: [], variants: [], triggers: [], certification: { applicable: false, certified: false, reasons: ['not_applicable'] } })
    );
    expect(md).toContain('No properties attached.');
    expect(md).toContain('No variants');
    expect(md).toContain('No triggers documented.');
    expect(md).toContain('Not applicable');
    expect(md).toContain('```json\n{}\n```');
  });
});

describe('useCaseToMarkdown', () => {
  const uc: TrackingDocumentUseCase = {
    id: 'u1', code: 'UC-1', name: 'Welcome', type: 'lifecycle', status: 'active', narrative: 'Send a welcome.',
    documentation_url: null,
    requirements: [{ id: 'r1', target_label: 'consent: newsletter', level: 'required', status: 'gap' }],
  };
  it('renders narrative and a requirements table with status', () => {
    const md = useCaseToMarkdown(uc);
    expect(md).toContain('# Use case: UC-1 - Welcome');
    expect(md).toContain('Send a welcome.');
    expect(md).toContain('| 1 | consent: newsletter | required | gap |');
  });
  it('says so when there is no narrative or requirement', () => {
    const md = useCaseToMarkdown({ ...uc, narrative: null, requirements: [] });
    expect(md).toContain('No narrative yet.');
    expect(md).toContain('No requirements.');
  });
});
