import { describe, expect, it } from 'vitest';
import { suggestUseCaseType } from './useCaseType';

describe('suggestUseCaseType (T-4-21)', () => {
  it('suggests transactional for a message-channel confirmation-like flow, else marketing', () => {
    expect(suggestUseCaseType({ name: 'Order confirmation email', channels: ['email'] })).toBe('transactional');
    expect(suggestUseCaseType({ name: 'Password reset', channels: ['sms'] })).toBe('transactional');
    expect(suggestUseCaseType({ name: 'Cart abandonment', channels: ['email'] })).toBe('marketing');
    expect(suggestUseCaseType({ name: 'Order confirmation', channels: ['weblayers'] })).toBe('marketing');
    expect(suggestUseCaseType({ name: 'x', channels: [], type: 'marketing' })).toBe('marketing');
    expect(suggestUseCaseType({ name: 'x', type: 'transactional' })).toBe('transactional');
  });
});
