import { describe, expect, it } from 'vitest';
import { anyNameDiffersFromKey, effectivePayloadKey } from './payloadKey';
import { summarizeCertification } from './certification';

describe('payloadKey', () => {
  it('falls back to the name', () => {
    expect(effectivePayloadKey('email', null)).toBe('email');
    expect(effectivePayloadKey('email', ' e ')).toBe('e');
  });
  it('detects when the Name column is needed', () => {
    expect(anyNameDiffersFromKey([{ name: 'a', payload_key: 'a' }, { name: 'b', payload_key: null }])).toBe(false);
    expect(anyNameDiffersFromKey([{ name: 'a', payload_key: 'x' }])).toBe(true);
  });
});

describe('summarizeCertification', () => {
  it('describes each state', () => {
    expect(summarizeCertification({ applicable: false, certified: false, reasons: ['not_applicable'] }).status).toBe('not applicable');
    const ok = summarizeCertification({ applicable: true, certified: true, reasons: [] });
    expect(ok.status).toBe('certified');
    expect(ok.reasons).toEqual([]);
    const no = summarizeCertification({ applicable: true, certified: false, reasons: ['open_errors: 2', 'no_observations'] });
    expect(no.status).toBe('not certified');
    expect(no.reasons[0]).toContain('2 open error');
    expect(no.change).toContain('observation');
  });
});
