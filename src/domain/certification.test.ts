import { describe, expect, it } from 'vitest';
import { computeCertification } from './certification';

describe('computeCertification', () => {
  it('is not applicable for an sdk/platform event, regardless of every other input', () => {
    const result = computeCertification({
      applicable: false,
      status: 'implemented',
      openErrorFindingCount: 0,
      hasObservation: true,
    });
    expect(result).toEqual({ applicable: false, certified: false, reasons: ['not_applicable'] });
  });

  it('certifies a custom event with no blockers', () => {
    const result = computeCertification({
      applicable: true,
      status: 'implemented',
      openErrorFindingCount: 0,
      hasObservation: true,
    });
    expect(result).toEqual({ applicable: true, certified: true, reasons: [] });
  });

  it('blocks on status_ignored', () => {
    const result = computeCertification({
      applicable: true,
      status: 'ignored',
      openErrorFindingCount: 0,
      hasObservation: true,
    });
    expect(result.certified).toBe(false);
    expect(result.reasons).toEqual(['status_ignored']);
  });

  it('blocks on open error findings, with the count in the reason text', () => {
    const result = computeCertification({
      applicable: true,
      status: 'implemented',
      openErrorFindingCount: 3,
      hasObservation: true,
    });
    expect(result.certified).toBe(false);
    expect(result.reasons).toEqual(['open_errors: 3']);
  });

  it('blocks on no_observations', () => {
    const result = computeCertification({
      applicable: true,
      status: 'implemented',
      openErrorFindingCount: 0,
      hasObservation: false,
    });
    expect(result.certified).toBe(false);
    expect(result.reasons).toEqual(['no_observations']);
  });

  it('lists every blocking reason at once, in a fixed order', () => {
    const result = computeCertification({
      applicable: true,
      status: 'ignored',
      openErrorFindingCount: 2,
      hasObservation: false,
    });
    expect(result.certified).toBe(false);
    expect(result.reasons).toEqual(['status_ignored', 'open_errors: 2', 'no_observations']);
  });
});
