import { describe, expect, it } from 'vitest';
import { consentChannel } from './consentChannel';

describe('consentChannel (T-4-21)', () => {
  it('derives the channel from the standard key first, then the name, else other', () => {
    expect(consentChannel({ name: 'Marketing', standard_key: 'email' })).toBe('email');
    expect(consentChannel({ name: 'Newsletter', standard_key: 'newsletter' })).toBe('email');
    expect(consentChannel({ name: 'SMS offers' })).toBe('sms');
    expect(consentChannel({ name: 'x', standard_key: 'sms' })).toBe('sms');
    expect(consentChannel({ name: 'Personalized browser notification', standard_key: 'personalized_browser_notification' })).toBe('push');
    expect(consentChannel({ name: 'Push messages' })).toBe('push');
    expect(consentChannel({ name: 'WhatsApp updates' })).toBe('whatsapp');
    expect(consentChannel({ name: 'Email notifications' })).toBe('email');
    expect(consentChannel({ name: 'Voicemail' })).toBe('other');
    expect(consentChannel({ name: 'marketingEmail' })).toBe('email');
    expect(consentChannel({ name: 'x', standard_key: 'bulkEmail' })).toBe('email');
    expect(consentChannel({ name: 'E-mail updates' })).toBe('email');
    expect(consentChannel({ name: 'marketing_email', standard_key: 'marketing_email' })).toBe('email');
    expect(consentChannel({ name: 'Mobile app messages' })).toBe('push');
    expect(consentChannel({ name: 'Notifications' })).toBe('push');
    expect(consentChannel({ name: 'Brand consent', standard_key: 'marketing' })).toBe('other');
    expect(consentChannel({ name: 'Classic' })).toBe('other');
  });
});
