import type { ImplementationMethod, PropertyKind } from '../enums';
import type { PropertyDerivation } from './derivation';

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

/**
 * Default property kind and derivation for a new property, by name (D-63, T-4-17). One rule set
 * shared by every path that creates a property without saying what it is (DAL create, so imports
 * and MCP get it too; backup restore of older backups). Migration `0025_implementation_contract.sql`
 * applies the same rules in SQL; a test runs both over the same names and compares. Event-scope
 * only; context-like names (store_*, language, currency) are never guessed and stay `event`.
 * - `*_ids` array: state list, ids of the singular id field (`product_ids` gives `product_id`).
 * - `*_list` array: state list, id and quantity of the singular id field.
 * - `total_quantity` number: sum of `quantity`; `total_<x>` number: sum of `<x>*quantity`.
 */
export function inferPropertyKind(
  name: string,
  dataType: string,
  scope: string
): { kind: PropertyKind; derivation: PropertyDerivation | null } {
  const plain = { kind: 'event' as const, derivation: null };
  if (scope !== 'event') return plain;
  if (dataType === 'array' && name.endsWith('_ids') && name.length > 4) {
    return { kind: 'state_list', derivation: { source: 'items', id_field: `${name.slice(0, -4)}_id`, form: 'ids' } };
  }
  if (dataType === 'array' && name.endsWith('_list') && name.length > 5) {
    return {
      kind: 'state_list',
      derivation: { source: 'items', id_field: `${name.slice(0, -5)}_id`, form: 'id_quantity', quantity_field: 'quantity' },
    };
  }
  if (dataType === 'number' && name === 'total_quantity') {
    return { kind: 'state_list', derivation: { source: 'items', sum: 'quantity' } };
  }
  if (dataType === 'number' && name.startsWith('total_') && name.length > 6) {
    return { kind: 'state_list', derivation: { source: 'items', sum: `${name.slice(6)}*quantity` } };
  }
  return plain;
}
