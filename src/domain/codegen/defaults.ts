import type { ImplementationMethod } from '../enums';

/**
 * Default implementation method for a new event (D-63, T-4-17), the same rule the 0025 migration
 * backfills with: `purchase`, `purchase_item`, `consent` and refund-like events are tracked
 * server-side, `sdk`/`platform` class events are emitted by Bloomreach itself, everything else is
 * implemented on the client.
 */
export function defaultImplementationMethod(name: string, eventClass: string | null | undefined): ImplementationMethod {
  if (name === 'purchase' || name === 'purchase_item' || name === 'consent' || name.includes('refund')) return 'server_api';
  if (eventClass === 'sdk' || eventClass === 'platform') return 'sdk_auto';
  return 'client_web';
}
