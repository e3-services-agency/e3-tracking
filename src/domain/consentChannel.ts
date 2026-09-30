/**
 * Consent categories carry no channel field, so the shared view groups them by a channel derived
 * from the standard key, then the name (T-4-21): whatsapp, sms, push, email by keyword, else
 * "other". Pure.
 */
export const CONSENT_CHANNELS = ['email', 'sms', 'push', 'whatsapp', 'other'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_CHANNEL_LABELS: Record<ConsentChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
  whatsapp: 'WhatsApp',
  other: 'Other',
};

// The first hit wins for text naming two channels; the standard key is tried before the name.
// Email is tested before push so "Email notifications" is Email; a bare "notification" only
// counts as push when nothing else matched (last tiebreaker).
const KEYWORDS: [ConsentChannel, RegExp][] = [
  ['whatsapp', /whats[\s_-]?app/],
  ['sms', /(^|[^a-z])(sms|mms)([^a-z]|$)|text[\s_-]?message/],
  ['email', /e[\s_-]?mail|newsletter/],
  ['push', /push|browser|mobile[\s_-]?app/],
];
const BARE_NOTIFICATION = /notification/;

export function consentChannel(category: { name: string; standard_key?: string | null }): ConsentChannel {
  for (const text of [category.standard_key ?? '', category.name]) {
    const t = text.toLowerCase();
    if (!t) continue;
    for (const [channel, re] of KEYWORDS) if (re.test(t)) return channel;
  }
  for (const text of [category.standard_key ?? '', category.name]) if (BARE_NOTIFICATION.test(text.toLowerCase())) return 'push';
  return 'other';
}
