import { describe, it, expect } from 'vitest';
import { runDefinitionVsObservations, type DefinitionSnapshot, type EngineObservation } from './definitionVsObservations';

const def: DefinitionSnapshot = {
  project_default_expiration: null,
  variants: [],
  standard_event_mappings: [],
  events: [
    {
      id: 'e1', name: 'page_visit', status: 'implemented', class: 'custom', expiration: null,
      properties: [
        { property_id: 'p1', name: 'latitude', payload_key: null, role: 'normal', required: true, data_type: 'number', data_formats: [], allowed_values: null },
        { property_id: 'p2', name: 'email', payload_key: null, role: 'normal', required: false, data_type: 'string', data_formats: ['email'], allowed_values: null },
        { property_id: 'p3', name: 'channel', payload_key: null, role: 'normal', required: false, data_type: 'string', data_formats: [], allowed_values: ['web', 'app'] },
      ],
    },
  ],
};
const obs = (properties: Record<string, unknown>): EngineObservation => ({
  id: 'o1', event_type: 'page_visit', event_id: 'e1', variant_id: null, timestamp: 1, properties, run_kind: 'export_paste',
});
const kinds = (p: Record<string, unknown>) => runDefinitionVsObservations(def, [obs(p)]).map((f) => f.kind);

describe('comparison 3 masked values (T-5-30)', () => {
  it('a masked numeric, email and enum value raise nothing and count as present', () => {
    expect(kinds({ latitude: '[redacted:geo]', email: '[redacted]@example.com', channel: '[redacted:geo]' })).toEqual([]);
  });
  it('an unmasked wrong type, format and enum still raise', () => {
    const k = kinds({ latitude: 'north', email: 'nope', channel: 'fax' });
    expect(k).toContain('type_mismatch');
    expect(k).toContain('enum_violation');
    expect(kinds({ latitude: 1, email: 'nope' })).toContain('format_violation');
  });
});
