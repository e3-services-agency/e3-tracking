/**
 * Bloomreach vocabulary seed lists (D-26): the twelve standard events and their field
 * lists, the catalog `main_columns` slots, the standard customer properties, the standard
 * consent keys and the known Bloomreach system event types, all taken verbatim from
 * `.claude/team/samples/data-mapping.json` / `expiration-settings.json` /
 * `customer-events-export.json`.
 *
 * These are seeds, not closed enums (D-26): a project can add standard event keys (with
 * their own field list) and standard consent keys via `projects.standard_event_additions_json`
 * and `projects.consent_key_additions_json`. `standard_event` on StandardEventMapping and
 * `standard_key` on ConsentCategory are free strings validated against seed + project
 * additions, never a hardcoded closed union.
 */

/** One standard event's key and the Bloomreach field names available for mapping (excludes `event`, which is the type/filter block handled by StandardEventMapping). */
export interface StandardEventSeed {
  key: string;
  fields: string[];
}

/** The twelve standard events in `data-mapping.json`, in the fixture's key order. */
export const STANDARD_EVENTS: ReadonlyArray<StandardEventSeed> = [
  {
    key: 'add_to_cart',
    fields: [
      'category_level_1',
      'category_level_2',
      'category_level_3',
      'price',
      'product_id',
      'product_ids',
      'product_list',
      'total_price',
      'total_quantity',
      'variant_id',
    ],
  },
  {
    key: 'add_to_wishlist',
    fields: ['category_level_1', 'category_level_2', 'category_level_3', 'product_id', 'variant_id'],
  },
  { key: 'checkout', fields: [] },
  {
    key: 'purchase',
    fields: [
      'currency',
      'product_ids',
      'product_list',
      'purchase_id',
      'purchase_status',
      'total_price',
      'total_quantity',
      'voucher_code',
    ],
  },
  {
    key: 'purchase_item',
    fields: [
      'category_level_1',
      'category_level_2',
      'category_level_3',
      'price',
      'product_id',
      'purchase_id',
      'size',
      'title',
      'total_price',
      'total_quantity',
      'variant_id',
    ],
  },
  { key: 'remove_from_cart', fields: ['product_id', 'variant_id'] },
  { key: 'remove_from_wishlist', fields: ['product_id', 'variant_id'] },
  {
    key: 'return_item',
    fields: ['price', 'product_id', 'purchase_id', 'total_price', 'total_quantity', 'variant_id'],
  },
  {
    key: 'returned_purchase',
    fields: ['product_ids', 'product_list', 'purchase_id', 'purchase_status', 'total_price'],
  },
  { key: 'search', fields: [] },
  { key: 'view_category', fields: [] },
  {
    key: 'view_item',
    fields: [
      'brand',
      'category_level_1',
      'category_level_2',
      'category_level_3',
      'price',
      'product_id',
      'stock_level',
      'title',
      'variant_id',
    ],
  },
];

/** `catalogs.main_columns` keys from the fixture: the Bloomreach product catalog's standard column slots. */
export const CATALOG_MAIN_COLUMNS: ReadonlyArray<string> = [
  'active',
  'brand',
  'category_level_1',
  'category_level_2',
  'category_level_3',
  'country',
  'date_added',
  'description',
  'discount_percentage',
  'discount_value',
  'gender',
  'image',
  'item_id',
  'original_price',
  'price',
  'stock_level',
  'title',
  'url',
];

/** `customer_properties` keys from the fixture: standard Bloomreach customer property slots. */
export const STANDARD_CUSTOMER_PROPERTIES: ReadonlyArray<string> = [
  'address',
  'birthday',
  'email',
  'email_domain',
  'email_id',
  'first_name',
  'gender',
  'last_name',
  'phone',
  'phone_id',
];

/** `consents` keys from the fixture: standard Bloomreach consent slots. */
export const STANDARD_CONSENT_KEYS: ReadonlyArray<string> = [
  'email',
  'marketing',
  'newsletter',
  'personalized_browser_notification',
  'personalized_mobile_notification',
  'personalized_notification',
  'retargeting',
  'sms',
];

/**
 * Bloomreach SDK-generated event types (D-29, D-36): produced by the tracking SDK itself, not by
 * the Bloomreach platform. `src/domain/enums.ts`'s `EVENT_CLASSES` `sdk` value. Source:
 * `.claude/team/samples/bloomreach-system-events-reference.md`.
 */
export const SDK_EVENT_TYPES: ReadonlyArray<string> = [
  'session_start',
  'session_end',
  'first_session',
  'page_visit',
  'web_exit',
];

/**
 * Bloomreach platform-generated event types (D-29, D-36): produced by Bloomreach itself (email,
 * campaigns, surveys, consent, ...), not by the client's SDK integration. `EVENT_CLASSES`
 * `platform` value. Source: `bloomreach-system-events-reference.md`.
 */
export const PLATFORM_EVENT_TYPES: ReadonlyArray<string> = [
  'campaign',
  'consent',
  'survey',
  'support_ticket',
  'managed_endpoint',
  'notification_state',
  'banner',
  'experiment',
  'merge',
  'ab test',
  'anonymization',
  'retargeting',
  'recommendation',
  'double_opt_in',
  'data_capture',
];

/**
 * Known Bloomreach system event types (D-25 Q5, D-36): observed event types the app never flags
 * as `unexpected_event` because they are generic Bloomreach infrastructure events present in
 * every project, not client-specific custom events. The union of `SDK_EVENT_TYPES` and
 * `PLATFORM_EVENT_TYPES` (the phase 1 suppression keeps working unchanged, D-36). Two further
 * types observed in the fixture, `paper_catalogue` and `loyalty_update` — and the other names the
 * reference marks as shareable with client custom events (`store_visit, inbound_call,
 * outbound_call, return, monitoring`) — are deliberately NOT included: they default to `class:
 * custom` (D-29 open question 7, D-40 Q7) and the qa-roundtrip fixture expects `paper_catalogue`/
 * `loyalty_update` to still raise `unexpected_event` (T-1-09).
 */
export const KNOWN_SYSTEM_EVENT_TYPES: ReadonlyArray<string> = [...SDK_EVENT_TYPES, ...PLATFORM_EVENT_TYPES];

/**
 * Attributes present on every Bloomreach SDK event regardless of the client's own tracking code
 * (D-29, D-36, D-38): os, browser, device, location. Never flagged `unexpected_property` or
 * `unmapped_property` on any event, custom or otherwise, because the SDK adds them automatically.
 */
export const SDK_DEFAULT_PROPERTIES: ReadonlyArray<string> = ['os', 'browser', 'device', 'location'];

/**
 * Bloomreach platform limits the identity reference names (D-38): 255 event types per project,
 * 255 properties per event. Enforced at write time (`event.dal.ts`, `LIMIT_EVENT_TYPES` /
 * `LIMIT_EVENT_PROPERTIES`) and reported by `limits.service.ts` for the tracking document (T-2-08).
 */
export const BLOOMREACH_LIMITS = {
  MAX_EVENT_TYPES_PER_PROJECT: 255,
  MAX_PROPERTIES_PER_EVENT: 255,
} as const;

/**
 * `update()` special customer attributes the identity reference names (D-38): case-sensitive keys
 * the Web SDK treats specially (`phone` expects E.164). Used by identity codegen's `update`
 * snippet to annotate a mapped `Property.bloomreach_customer_property` that matches one.
 */
export const BLOOMREACH_SPECIAL_CUSTOMER_ATTRIBUTES: ReadonlyArray<string> = [
  'first_name',
  'last_name',
  'company_name',
  'photo',
  'email',
  'phone',
  'language',
  'domain',
];

/**
 * `Event.class` for a raw Bloomreach event type name (D-36): `sdk` when in `SDK_EVENT_TYPES`,
 * `platform` when in `PLATFORM_EVENT_TYPES`, `custom` otherwise (including the shareable names
 * the reference lists — D-40 Q7, selectable in the Data Manager import preview).
 */
export function classifyEventType(type: string): 'custom' | 'sdk' | 'platform' {
  if (SDK_EVENT_TYPES.includes(type)) return 'sdk';
  if (PLATFORM_EVENT_TYPES.includes(type)) return 'platform';
  return 'custom';
}

/**
 * Merge a project's additional keys (from `standard_event_additions_json` or
 * `consent_key_additions_json`) with a seed list of keys, de-duplicated, seed first.
 */
export function mergeKeyList(
  seed: ReadonlyArray<string>,
  additions: string[] | null | undefined
): string[] {
  const merged = [...seed];
  for (const key of additions ?? []) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged;
}

/**
 * Merge a project's additional standard events (`projects.standard_event_additions_json`,
 * shape `StandardEventSeed[]`) with the seed list, de-duplicated by key, seed first.
 */
export function mergeStandardEvents(
  additions: StandardEventSeed[] | null | undefined
): StandardEventSeed[] {
  const merged = [...STANDARD_EVENTS];
  for (const addition of additions ?? []) {
    if (!merged.some((seedEvent) => seedEvent.key === addition.key)) {
      merged.push(addition);
    }
  }
  return merged;
}

/** Merge a project's additional consent keys (`projects.consent_key_additions_json`) with the seed list. */
export function mergeConsentKeys(additions: string[] | null | undefined): string[] {
  return mergeKeyList(STANDARD_CONSENT_KEYS, additions);
}

/** True when `key` is a known standard event, seed or project addition. */
export function isKnownStandardEvent(
  key: string,
  additions?: StandardEventSeed[] | null
): boolean {
  return mergeStandardEvents(additions).some((event) => event.key === key);
}

/** True when `key` is a known standard consent key, seed or project addition. */
export function isKnownConsentKey(key: string, additions?: string[] | null): boolean {
  return mergeConsentKeys(additions).includes(key);
}

/** Field list for a standard event key, seed or project addition; `undefined` if unknown. */
export function getStandardEventFields(
  key: string,
  additions?: StandardEventSeed[] | null
): string[] | undefined {
  return mergeStandardEvents(additions).find((event) => event.key === key)?.fields;
}
