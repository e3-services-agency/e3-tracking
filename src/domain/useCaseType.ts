/**
 * Suggested `use_cases.type` for a library template on add-to-project (T-4-21). The pnp converter
 * stores every Use Case Center template as `marketing`, so the dialog suggests `transactional` for
 * a message-channel flow (email, sms, push, whatsapp) whose name reads like a confirmation or
 * account notice; a template already stored as transactional stays so. Pure.
 */
import type { UseCaseType } from './enums';

const MESSAGE_CHANNELS = ['email', 'sms', 'browser_push', 'mobile_push', 'whatsapp', 'rcs'];
const CONFIRMATION_LIKE =
  /confirm|receipt|invoice|order status|shipping|shipment|delivery|dispatch|password|verification|verify|reset|welcome email|transactional|double opt|opt-in confirm|back in stock confirm|thank you/i;

export function suggestUseCaseType(template: { type?: string | null; name: string; channels?: string[] | null }): UseCaseType {
  if (template.type === 'transactional') return 'transactional';
  const channels = (template.channels ?? []).map((c) => c.toLowerCase());
  const messaging = channels.some((c) => MESSAGE_CHANNELS.includes(c));
  return messaging && CONFIRMATION_LIKE.test(template.name) ? 'transactional' : 'marketing';
}
