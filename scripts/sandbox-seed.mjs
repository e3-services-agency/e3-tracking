/**
 * T-4-11 part A (D-60): the hand-written seed behind the bundled sandbox project. Plain data only;
 * `scripts/build-sandbox-backup.mjs` pushes it through the app's own DAL/services and serialises
 * the result with `buildBackup`. Edit this file, re-run the builder, commit the regenerated
 * `.claude/team/samples/sandbox-project-backup.json`.
 *
 * Scope: the Bloomreach required and recommended e-commerce events (session_start, session_end,
 * page_visit, view_item, view_category, search, cart_update, checkout, purchase, purchase_item,
 * consent, campaign, banner) plus two custom client_web events (wishlist_update, newsletter_signup),
 * each with its standard properties (`src/domain/bloomreach.ts`), the system customer properties
 * (D-64), SDK defaults as context, and one deliberately flawed QA run so the comparison yields
 * a finding of each family. Names follow snake_case (D-65).
 *
 * Part B (T-4-11B, D-61, D-62): GB and CZ product and variant catalogs, and two sources with a
 * project default.
 */

export const CLIENT = { key: 'sandbox-fixture', name: 'Sandbox fixture client' };

export const PROJECT = {
  key: 'sandbox-fixture',
  // sandbox.service.ts does not append " (sandbox)" to a name that already ends with it.
  name: 'Acme EU (sandbox)',
  industry: 'ecommerce',
  description:
    'A small, hand-written demo project: the Bloomreach standard e-commerce events, a few custom events, use cases from the library, and a QA run with deliberate mistakes so the Findings page has something to show.',
};

const ex = (...values) => values;
const av = (...values) => values.map((v) => ({ value: v }));

// ---------------------------------------------------------------------------
// Customer properties. The seven system ones keep NO stored formats on purpose: the property
// editor shows their recommended format as a hint (D-64, `recommendedFormatsFor`).
// ---------------------------------------------------------------------------
export const CUSTOMER_PROPERTIES = [
  { name: 'email', data_type: 'string', pii: true, bloomreach_customer_property: 'email', description: 'Primary email address of the customer; also the hard identity.', examples: ex('anna.novak@example.com') },
  { name: 'phone', data_type: 'string', pii: true, bloomreach_customer_property: 'phone', description: 'Mobile phone number, used for SMS and as a second identity.', examples: ex('+421900123456') },
  { name: 'first_name', data_type: 'string', pii: true, bloomreach_customer_property: 'first_name', description: 'Given name.', examples: ex('Anna') },
  { name: 'last_name', data_type: 'string', pii: true, bloomreach_customer_property: 'last_name', description: 'Family name.', examples: ex('Novak') },
  { name: 'country', data_type: 'string', description: 'Country of the delivery address.', examples: ex('SK', 'DE') },
  { name: 'language', data_type: 'string', description: 'Preferred communication language.', examples: ex('sk', 'de') },
  { name: 'timezone', data_type: 'string', description: 'Customer time zone, used for send-time optimisation.', examples: ex('Europe/Bratislava') },
  // Custom customer properties.
  { name: 'loyalty_tier', data_type: 'string', description: 'Loyalty programme tier.', allowed: av('bronze', 'silver', 'gold'), examples: ex('silver') },
  { name: 'newsletter_opt_in', data_type: 'boolean', description: 'Whether the customer has opted in to the newsletter.', examples: ex('true') },
];

// ---------------------------------------------------------------------------
// Event properties. `kind` follows D-63: item (a field of a product item); state lists and SDK
// defaults leave `kind` out so the DAL infers kind and derivation from the name; otherwise event.
// `definitions` = extra named meanings of one property (D-58).
// ---------------------------------------------------------------------------
const ACTION_DEFINITIONS = [
  { name: 'cart_update action', description: 'Whether the shopper adds an item to the cart or removes it. Decides the cart_update variant.', allowed: av('add', 'remove'), examples: ex('add') },
  { name: 'wishlist_update action', description: 'Whether the shopper adds an item to the wishlist or removes it.', allowed: av('add', 'remove'), examples: ex('add') },
  { name: 'consent action', description: 'Whether the customer accepts or rejects the consent category.', allowed: av('accept', 'reject'), examples: ex('accept') },
];

export const EVENT_PROPERTIES = [
  { name: 'action', data_type: 'string', description: 'What happened to the item or consent. The allowed values depend on the event, see the named definitions.', allowed: av('add', 'remove'), examples: ex('add'), definitions: ACTION_DEFINITIONS },
  // Item fields
  { name: 'product_id', data_type: 'string', kind: 'item', description: 'Catalog id of the product (the main catalog item_id).', examples: ex('P-1001', 'P-2002') },
  { name: 'variant_id', data_type: 'string', kind: 'item', description: 'Catalog id of the size or colour variant.', examples: ex('V-1001-42') },
  { name: 'title', data_type: 'string', kind: 'item', description: 'Product name as shown in the shop.', examples: ex('Trail Runner Shoe') },
  { name: 'brand', data_type: 'string', kind: 'item', description: 'Brand of the product.', examples: ex('Acme') },
  { name: 'category_level_1', data_type: 'string', kind: 'item', description: 'Top level product category.', examples: ex('Shoes') },
  { name: 'category_level_2', data_type: 'string', kind: 'item', description: 'Second level product category.', examples: ex('Running') },
  { name: 'category_level_3', data_type: 'string', kind: 'item', description: 'Third level product category.', examples: ex('Trail') },
  { name: 'price', data_type: 'number', formats: ['money'], kind: 'item', description: 'Unit price including VAT.', examples: ex('59.90', '12.50') },
  { name: 'quantity', data_type: 'number', kind: 'item', description: 'Number of units of the item.', examples: ex('1', '2') },
  { name: 'stock_level', data_type: 'number', description: 'Units in stock when the product was viewed.', examples: ex('14') },
  { name: 'availability', data_type: 'string', description: 'Stock status shown to the shopper.', allowed: av('in_stock', 'out_of_stock', 'preorder'), examples: ex('in_stock') },
  // State lists (kind and derivation inferred from the name, D-63)
  { name: 'product_ids', data_type: 'array', description: 'Ids of every product in the cart or order after this event.', examples: ex('["P-1001","P-2002"]') },
  {
    name: 'product_list', data_type: 'array', description: 'Every item in the cart or order after this event, with unit price and quantity.', examples: ex('[{"product_id":"P-1001","price":59.9,"quantity":1}]'),
    item_schema: [
      { field: 'product_id', data_type: 'string', required: true },
      { field: 'variant_id', data_type: 'string' },
      { field: 'price', data_type: 'number', data_formats: ['money'], required: true },
      { field: 'quantity', data_type: 'number', required: true },
    ],
  },
  { name: 'total_price', data_type: 'number', formats: ['money'], description: 'Sum of price times quantity over the item list.', examples: ex('84.90') },
  { name: 'total_quantity', data_type: 'number', description: 'Sum of quantity over the item list.', examples: ex('3') },
  // Order
  { name: 'currency', data_type: 'string', formats: ['currency_code'], description: 'ISO 4217 currency of every price in the event.', examples: ex('EUR') },
  { name: 'purchase_id', data_type: 'string', description: 'Order number; joins purchase and purchase_item.', examples: ex('ORD-5001') },
  { name: 'purchase_status', data_type: 'string', description: 'Order state. Decides the purchase variant.', allowed: av('completed', 'refunded'), examples: ex('completed') },
  { name: 'voucher_code', data_type: 'string', description: 'Voucher redeemed on the order, if any.', examples: ex('SPRING10') },
  // Browsing
  { name: 'search_query', data_type: 'string', description: 'Text the shopper searched for.', examples: ex('trail shoes') },
  { name: 'category_id', data_type: 'string', description: 'Id of the viewed category.', examples: ex('C-12') },
  { name: 'category_name', data_type: 'string', description: 'Name of the viewed category.', examples: ex('Running shoes') },
  { name: 'referrer', data_type: 'string', formats: ['uri'], description: 'Page the shopper came from.', examples: ex('https://www.google.com/') },
  { name: 'path', data_type: 'string', description: 'Path of the visited page.', examples: ex('/shoes/trail-runner') },
  { name: 'duration', data_type: 'number', description: 'Session length in seconds.', examples: ex('312') },
  { name: 'form_id', data_type: 'string', description: 'Which sign-up form was used.', examples: ex('footer') },
  // An event property named like a system customer property, carrying its recommended format.
  { name: 'email', data_type: 'string', formats: ['email'], pii: true, description: 'Email address typed into the sign-up form.', examples: ex('anna.novak@example.com') },
  // Platform events
  { name: 'category', data_type: 'string', description: 'Consent category the action refers to.', examples: ex('newsletter') },
  { name: 'valid_until', data_type: 'timestamp', description: 'When the consent expires.', examples: ex('1822000000') },
  { name: 'campaign_id', data_type: 'string', description: 'Bloomreach campaign id.', examples: ex('cmp-2026-04') },
  { name: 'campaign_name', data_type: 'string', description: 'Bloomreach campaign name.', examples: ex('Spring sale') },
  { name: 'action_type', data_type: 'string', description: 'Channel of the campaign action.', examples: ex('email') },
  { name: 'status', data_type: 'string', description: 'Delivery status of the campaign action.', examples: ex('delivered') },
  { name: 'banner_id', data_type: 'string', description: 'Bloomreach banner id.', examples: ex('bn-7') },
  { name: 'banner_name', data_type: 'string', description: 'Bloomreach banner name.', examples: ex('Free shipping bar') },
  { name: 'banner_type', data_type: 'string', description: 'Banner placement type.', examples: ex('popup') },
  // SDK defaults: context kind is inferred (D-64)
  { name: 'os', data_type: 'string', description: 'Operating system, added by the SDK.', examples: ex('Windows') },
  { name: 'browser', data_type: 'string', description: 'Browser, added by the SDK.', examples: ex('Chrome') },
  { name: 'device', data_type: 'string', description: 'Device type, added by the SDK.', examples: ex('Desktop') },
  { name: 'location', data_type: 'string', formats: ['uri'], description: 'URL of the page, added by the SDK.', examples: ex('https://shop.example.com/') },
];

export const BUNDLES = [
  { name: 'Product item', description: 'The fields that describe one product line; attach to any event that carries a single item.', properties: ['product_id', 'variant_id', 'price', 'quantity', 'title'] },
];

// ---------------------------------------------------------------------------
// Events. `props`: linked properties in order; `p()` adds the per-link options.
// ---------------------------------------------------------------------------
const p = (name, opts = {}) => ({ name, ...opts });
// SDK defaults are context by property kind (D-64); the link role stays normal (role context needs an enum).
const SDK_CONTEXT = ['os', 'browser', 'device', 'location'].map((n) => p(n));

export const EVENTS = [
  {
    name: 'session_start', class: 'sdk', implementation_method: 'sdk_auto', business_name: 'Session start', status: 'implemented', priority: 'high',
    description: 'The SDK starts a session when a visitor arrives. Emitted by Bloomreach, not by the site.',
    purpose: 'Session counts and campaign attribution.', trigger_text: 'First page of a new visit.',
    props: [...SDK_CONTEXT, p('referrer')],
  },
  {
    name: 'session_end', class: 'sdk', implementation_method: 'sdk_auto', business_name: 'Session end', status: 'implemented', priority: 'medium',
    description: 'The SDK closes a session after inactivity. Emitted by Bloomreach, not by the site.',
    purpose: 'Session length analysis.', trigger_text: 'After 30 minutes without activity.',
    props: [...SDK_CONTEXT, p('duration')],
  },
  {
    name: 'page_visit', class: 'sdk', implementation_method: 'sdk_auto', business_name: 'Page visit', status: 'implemented', priority: 'high',
    description: 'Every page view. Emitted by the SDK.', purpose: 'Browse behaviour and retargeting.', trigger_text: 'Each page load.',
    props: [...SDK_CONTEXT, p('path'), p('referrer')],
  },
  {
    name: 'view_item', class: 'custom', implementation_method: 'client_web', dl_event_name: 'view_item', business_name: 'View item', status: 'implemented', priority: 'critical',
    description: 'A shopper opens a product detail page.', purpose: 'Back-in-stock and browse-abandonment use cases.', page: 'Product detail page', trigger_text: 'The product page finished loading.',
    owner_business: 'E-commerce manager', owner_technical: 'Web developer',
    props: [p('product_id', { required: true }), p('variant_id'), p('title', { required: true }), p('brand'), p('category_level_1'), p('category_level_2'), p('category_level_3'), p('price', { required: true }), p('stock_level'), p('availability')],
  },
  {
    name: 'view_category', class: 'custom', implementation_method: 'client_web', dl_event_name: 'view_item_list', business_name: 'View category', status: 'implemented', priority: 'medium',
    description: 'A shopper opens a product listing page.', purpose: 'Category affinity.', page: 'Category page', trigger_text: 'The listing finished loading.',
    props: [p('category_id'), p('category_name')],
  },
  {
    name: 'search', class: 'custom', implementation_method: 'client_web', dl_event_name: 'search', business_name: 'Search', status: 'implemented', priority: 'medium',
    description: 'A shopper runs a site search.', purpose: 'Search intent and zero-result analysis.', page: 'Search results page', trigger_text: 'The search results page loaded.',
    props: [p('search_query')],
  },
  {
    name: 'cart_update', class: 'custom', implementation_method: 'server_api', business_name: 'Cart update', status: 'implemented', priority: 'critical',
    description: 'The cart changed. One event with a discriminator (action = add or remove) instead of two event types; every push carries the whole cart in the state lists.',
    purpose: 'Abandoned cart and cart value segments.', page: 'Any page with an add-to-cart or remove button, and the cart page', trigger_text: 'The shopper clicks add to cart or remove, after the cart is updated.',
    owner_business: 'E-commerce manager', owner_technical: 'Web developer',
    props: [
      p('action', { required: true, role: 'discriminator', definition: 'cart_update action' }),
      // Only the discriminator and the interacted product are required: the standard remove_from_cart
      // mapping covers just product_id and variant_id, so more required fields would raise mapping warnings.
      p('product_id', { required: true }), p('variant_id'), p('title'), p('price'), p('quantity'),
      p('product_ids'), p('product_list'), p('total_price'), p('total_quantity'), p('currency'),
    ],
    variants: [{ action: 'add' }, { action: 'remove' }],
    triggers: [
      { title: 'Add to cart on the product page', description: 'Click on the Add to cart button; the push happens once the mini-cart has updated.', source: 'https://shop.example.com/shoes/trail-runner', image: 'cart' },
    ],
  },
  {
    name: 'checkout', class: 'custom', implementation_method: 'client_web', dl_event_name: 'begin_checkout', business_name: 'Checkout', status: 'planned', priority: 'high',
    description: 'The shopper starts the checkout. Planned and not yet implemented, so the QA run shows it as a missing event.', purpose: 'Checkout funnel and recovery suppression.', page: 'Checkout page, step 1', trigger_text: 'The checkout page loaded with a non-empty cart.',
    props: [p('product_ids'), p('product_list'), p('total_price'), p('total_quantity'), p('currency')],
  },
  {
    name: 'purchase', class: 'custom', implementation_method: 'server_api', business_name: 'Purchase', status: 'implemented', priority: 'critical',
    description: 'An order was placed. Sent from the order system, once per order, with the order total.', purpose: 'Revenue, lifetime value and transactional confirmation emails.', page: 'Order confirmation', trigger_text: 'The payment was confirmed in the order system.',
    owner_business: 'E-commerce manager', owner_technical: 'Back-end developer',
    props: [
      p('purchase_id', { required: true }), p('purchase_status', { required: true, role: 'discriminator' }),
      p('product_ids'), p('product_list'), p('total_price', { required: true }), p('total_quantity'), p('currency', { required: true }), p('voucher_code'),
    ],
    variants: [{ purchase_status: 'completed' }, { purchase_status: 'refunded' }],
    triggers: [
      { title: 'Order confirmation page', description: 'The thank-you screen shown after payment; the server event is sent at the same moment.', source: 'https://shop.example.com/checkout/confirmation', image: 'purchase' },
    ],
  },
  {
    name: 'purchase_item', class: 'custom', implementation_method: 'server_api', business_name: 'Purchase item', status: 'implemented', priority: 'high',
    description: 'One event per order line, sent right after purchase.', purpose: 'Product-level revenue.', trigger_text: 'Same moment as purchase, once per line.',
    owner_technical: 'Back-end developer',
    bundles: ['Product item'],
    props: [p('purchase_id', { required: true })],
  },
  {
    name: 'consent', class: 'platform', implementation_method: 'server_api', business_name: 'Consent', status: 'implemented', priority: 'high',
    description: 'A consent change, accept or reject, per consent category.', purpose: 'Proof of consent and channel eligibility.', trigger_text: 'The customer changes a preference or answers a consent prompt.',
    props: [p('action', { required: true, definition: 'consent action' }), p('category', { required: true }), p('valid_until')],
  },
  {
    name: 'campaign', class: 'platform', implementation_method: 'sdk_auto', business_name: 'Campaign', status: 'implemented', priority: 'low',
    description: 'Bloomreach logs every scenario action (sent, delivered, opened) as a campaign event.', purpose: 'Campaign reporting.', trigger_text: 'Emitted by Bloomreach.',
    props: [p('campaign_id'), p('campaign_name'), p('action_type'), p('status')],
  },
  {
    name: 'banner', class: 'platform', implementation_method: 'sdk_auto', business_name: 'Banner', status: 'implemented', priority: 'low',
    description: 'Bloomreach logs each on-site banner show and click.', purpose: 'Banner reporting.', trigger_text: 'Emitted by Bloomreach.',
    props: [p('banner_id'), p('banner_name'), p('banner_type')],
  },
  {
    name: 'wishlist_update', class: 'custom', implementation_method: 'client_web', dl_event_name: 'add_to_wishlist', business_name: 'Wishlist update', status: 'implemented', priority: 'medium',
    description: 'A shopper adds an item to the wishlist.', purpose: 'Wishlist reminders and price-drop campaigns.', page: 'Product detail page', trigger_text: 'The shopper clicks the heart icon.',
    props: [p('action', { required: true, role: 'discriminator', definition: 'wishlist_update action' }), p('product_id', { required: true }), p('variant_id'), p('price')],
    variants: [{ action: 'add' }],
  },
  {
    name: 'newsletter_signup', class: 'custom', implementation_method: 'client_web', dl_event_name: 'newsletter_signup', business_name: 'Newsletter signup', status: 'implemented', priority: 'medium',
    description: 'A visitor submits the newsletter form. Also the trigger of the email identity.', purpose: 'List growth and the identify call.', page: 'Footer form on every page', trigger_text: 'The form submit succeeded.',
    props: [p('email', { required: true }), p('form_id')],
  },
];

// ---------------------------------------------------------------------------
// Standard event mappings (Bloomreach standard key -> the client's event/variant and field map).
// `fields` map to the property of the same name; `renamed` maps a standard field to another property.
// ---------------------------------------------------------------------------
export const STANDARD_MAPPINGS = [
  { standard: 'view_item', event: 'view_item', fields: ['brand', 'category_level_1', 'category_level_2', 'category_level_3', 'price', 'product_id', 'stock_level', 'title', 'variant_id'] },
  { standard: 'view_category', event: 'view_category', fields: [] },
  { standard: 'search', event: 'search', fields: [] },
  { standard: 'add_to_cart', event: 'cart_update', variant: { action: 'add' }, fields: ['price', 'product_id', 'product_ids', 'product_list', 'total_price', 'total_quantity', 'variant_id'] },
  { standard: 'remove_from_cart', event: 'cart_update', variant: { action: 'remove' }, fields: ['product_id', 'variant_id'] },
  { standard: 'add_to_wishlist', event: 'wishlist_update', variant: { action: 'add' }, fields: ['product_id', 'variant_id'] },
  { standard: 'checkout', event: 'checkout', fields: [] },
  { standard: 'purchase', event: 'purchase', variant: { purchase_status: 'completed' }, fields: ['currency', 'product_ids', 'product_list', 'purchase_id', 'purchase_status', 'total_price', 'total_quantity', 'voucher_code'] },
  // purchase_item: the client's price and quantity play the standard total_price / total_quantity roles.
  { standard: 'purchase_item', event: 'purchase_item', fields: ['product_id', 'purchase_id', 'title', 'variant_id'], renamed: { total_price: 'price', total_quantity: 'quantity' } },
];

// ---------------------------------------------------------------------------
// Rules created from the seed templates (D-30, D-31).
// ---------------------------------------------------------------------------
export const RULE_TEMPLATES = [
  { event: 'cart_update', template: 'cart_update_totals' },
  { event: 'purchase', template: 'purchase_items_total' },
  { event: 'purchase', template: 'purchase_refund_negative' },
];

// ---------------------------------------------------------------------------
// Sources (D-62): where events are collected from. Shopify via the GTM data layer for the
// client-side events; the order system via the Tracking API for purchase, purchase_item and consent.
// The project default source is Shopify. SDK and platform events emitted by Bloomreach itself have none.
// ---------------------------------------------------------------------------
export const SOURCES = [
  { name: 'Shopify storefront', system: 'shopify', method: 'web_sdk_gtm_datalayer' },
  { name: 'Order system', system: 'custom_backend', method: 'tracking_api' },
];
export const DEFAULT_SOURCE = 'Shopify storefront';
export const EVENT_SOURCES = {
  view_item: 'Shopify storefront',
  view_category: 'Shopify storefront',
  search: 'Shopify storefront',
  cart_update: 'Order system',
  checkout: 'Shopify storefront',
  wishlist_update: 'Shopify storefront',
  newsletter_signup: 'Shopify storefront',
  purchase: 'Order system',
  purchase_item: 'Order system',
  consent: 'Order system',
};

// Identifiers each event sends in customer_ids (D-67, T-4-28); events not listed use the derived default.
export const EVENT_IDENTIFIERS = {
  view_item: ['cookie'],
  view_category: ['cookie'],
  search: ['cookie'],
  cart_update: ['cart_id'],
  checkout: ['cookie', 'cart_id'],
  wishlist_update: ['cookie'],
  newsletter_signup: ['cookie', 'email_id'],
  purchase: ['email_id', 'cart_id'],
  purchase_item: ['email_id', 'cart_id'],
  consent: ['email_id'],
};

// ---------------------------------------------------------------------------
// Catalogs per market (D-61): a product and a variant catalog for GB (en-GB, GBP) and CZ (cs-CZ,
// CZK), one schema per kind. The GB pair fills the Bloomreach mapping roles (main, variant).
// The lookup key is the item_id field (Jinja cannot read it), next to a regular product_id / variant_id
// field with the same value (D-61 amendment).
// One deliberate drift: CZ stores stock_level as text, which the catalogs comparison reports.
// The GB product catalog is marked live (v1), its searchable set (title) is then fixed.
// ---------------------------------------------------------------------------
const MARKETS = {
  GB: { language: 'en-GB', currency: 'GBP', base: 'https://shop.example.com/gb' },
  CZ: { language: 'cs-CZ', currency: 'CZK', base: 'https://shop.example.com/cz' },
};

function productFields(market) {
  const { currency, base } = MARKETS[market];
  return [
    { name: 'item_id', data_type: 'string', is_lookup_key: true, is_required: true, bloomreach_column: 'item_id', description: 'The lookup key (Bloomreach item_id); Jinja cannot read it.' },
    { name: 'product_id', data_type: 'string', is_required: true, description: 'Same value as item_id, readable in Jinja. Matches product_id on events.' },
    { name: 'title', data_type: 'string', is_searchable: true, description: 'Product name in the market language.' },
    { name: 'price', data_type: 'number', description: `Current price including VAT, in ${currency}.` },
    { name: 'image', data_type: 'string', description: 'Product image URL, used in email templates.' },
    { name: 'url', data_type: 'string', description: `Product page URL on ${base}.` },
    { name: 'stock_level', data_type: market === 'CZ' ? 'string' : 'number', description: 'Units in stock.' },
  ];
}

function variantFields(market) {
  const { currency, base } = MARKETS[market];
  return [
    { name: 'item_id', data_type: 'string', is_lookup_key: true, is_required: true, bloomreach_column: 'item_id', description: 'The lookup key (Bloomreach item_id); Jinja cannot read it.' },
    { name: 'variant_id', data_type: 'string', is_required: true, description: 'Same value as item_id, readable in Jinja. Matches variant_id on events.' },
    { name: 'product_id', data_type: 'string', description: 'The product this size or colour belongs to.' },
    { name: 'title', data_type: 'string', is_searchable: true, description: 'Variant name in the market language.' },
    { name: 'price', data_type: 'number', description: `Current variant price including VAT, in ${currency}.` },
    { name: 'url', data_type: 'string', description: `Variant page URL on ${base}.` },
    { name: 'stock_level', data_type: 'number', description: 'Units in stock.' },
  ];
}

const catalogBase = (market, kind) => ({
  kind,
  market,
  language: MARKETS[market].language,
  version: 'v1',
  source_system: 'Shopify',
  sync_method: 'Scheduled import',
  update_frequency: 'Hourly',
});

export const CATALOGS = [
  { name: 'products_gb', description: 'The UK product feed, one row per product, prices in GBP.', mapping_role: 'main', live: true, ...catalogBase('GB', 'product'), fields: productFields('GB') },
  { name: 'variants_gb', description: 'The UK variant feed, one row per size or colour, prices in GBP.', mapping_role: 'variant', ...catalogBase('GB', 'variant'), fields: variantFields('GB') },
  { name: 'products_cz', description: 'The Czech product feed, prices in CZK.', ...catalogBase('CZ', 'product'), fields: productFields('CZ') },
  { name: 'variants_cz', description: 'The Czech variant feed, prices in CZK.', ...catalogBase('CZ', 'variant'), fields: variantFields('CZ') },
];

// Event properties that look up into a catalog's lookup key: property name -> 'catalog.field'.
export const PROPERTY_CATALOG_LINKS = {
  product_id: 'products_gb.item_id',
  variant_id: 'variants_gb.item_id',
};

// ---------------------------------------------------------------------------
// Consent categories by channel. The channel is named in the description (the model has no channel
// column); newsletter and sms use Bloomreach's standard keys.
// ---------------------------------------------------------------------------
export const CONSENT_CATEGORIES = [
  { name: 'newsletter', standard_key: 'newsletter', description: 'Channel: email. Newsletters and promotions.' },
  { name: 'sms_offers', standard_key: 'sms', description: 'Channel: SMS. Offers and delivery updates by text message.' },
  { name: 'push_alerts', standard_key: 'personalized_notification', description: 'Channel: push. Mobile and browser notifications.' },
  { name: 'whatsapp_updates', description: 'Channel: WhatsApp. Order updates and offers over WhatsApp.' },
  { name: 'personalization', description: 'Channel: other. Use of browsing data for on-site personalisation and recommendations.' },
];

// ---------------------------------------------------------------------------
// Identifiers registry (D-69, T-4-35): the project's hard and soft ids, set once; identity rules below are acts of identifying with them.
export const IDENTIFIERS = [
  { name: 'cookie', type: 'soft', is_cookie: true, description: 'Anonymous first-party cookie set by the SDK.' },
  { name: 'cart_id', type: 'soft', description: 'Shopify cart token that ties the browser to the open cart.' },
  { name: 'email_id', type: 'hard', description: 'Email address of a registered customer.' },
  { name: 'phone_id', type: 'hard', description: 'Phone number (E.164) of a customer who signed up by SMS.' },
];

// Identity rules. `trigger_event` is an event name.
// ---------------------------------------------------------------------------
export const IDENTITY_RULES = [
  // D-67 amendment 1 (T-4-28): cart_id is set by a standalone identify call on the checkout page (GTM), no event.
  { identifier_name: 'cart_id', identity_type: 'soft', name: 'Cart id', description: 'Ties the browser to the open cart. GTM on the checkout page sends it together with the cookie; the backend cart_update events then carry only cart_id and Bloomreach merges them into the same profile.', trigger_text: 'the checkout page loads', source: 'Shopify storefront', value_rule: 'The Shopify cart token.', example: 'c1-4f8a9b2e', sdk_call: 'identify' },
  { identifier_name: 'cookie', identity_type: 'soft', source: 'Shopify storefront', name: 'Anonymous cookie', description: 'The SDK sets a first-party cookie on the first visit; every anonymous event hangs off it.', trigger_text: 'First page view of a new visitor.', value_rule: 'Generated by the SDK, never set by hand.', example: '7c3f2a1e-5d49-4c4d-8f8e-2b8a1f9e0c11' },
  { identifier_name: 'email_id', identity_type: 'hard', name: 'Email as hard id', description: 'Registered customers are identified by email. Merges the cookie profile into the customer.', trigger_event: 'newsletter_signup', value_rule: 'Trimmed, lower case email address.', example: 'anna.novak@example.com', transformations: ['trim', 'lowercase'], sdk_call: 'identify' },
  { identifier_name: 'phone_id', identity_type: 'hard', name: 'Phone as hard id', description: 'Customers who sign up by SMS are identified by phone number.', trigger_text: 'The SMS consent form is submitted.', value_rule: 'E.164: plus sign and digits only.', example: '+421900123456', transformations: ['trim'], sdk_call: 'identify' },
];

// ---------------------------------------------------------------------------
// Use cases: instantiated from `use-case-library-sample.json`, then given a status.
// ---------------------------------------------------------------------------
export const USE_CASE_CODES = ['UC-01', 'UC-02', 'UC-03'];
// Client-safe replacements for library notes written for QA, keyed by the requirement's event_name.
export const REQUIREMENT_NOTE_OVERRIDES = {
  'UC-03': { wishlist_add: 'wishlist_add is not tracked yet; the wishlist_update event covers adds, map or rename it.' },
};
export const USE_CASE_STATUS = { 'UC-01': 'live', 'UC-02': 'in_progress', 'UC-03': 'proposed' };

// ---------------------------------------------------------------------------
// QA run: mostly right, a few deliberately wrong. `expect` names the finding kind the row is
// there to provoke; the builder asserts each kind shows up.
// ---------------------------------------------------------------------------
export const T0 = 1_790_000_000; // fixed, so the backup is reproducible
const TREE = { product_id: 'P-1001', variant_id: 'V-1001-42', title: 'Trail Runner Shoe', price: 59.9 };
const SOCKS = { product_id: 'P-2002', variant_id: 'V-2002-M', title: 'Merino Socks', price: 12.5 };
const line = (item, quantity) => ({ product_id: item.product_id, variant_id: item.variant_id, price: item.price, quantity });

export const QA_RUN = {
  kind: 'manual', environment: 'staging', actor: 'Sandbox seed', notes: 'Walkthrough on staging with a few deliberate mistakes, so every kind of finding has an example.',
};

export const OBSERVATIONS = [
  { t: 0, event: 'view_item', page: 'https://shop.example.com/shoes/trail-runner', props: { ...TREE, brand: 'Acme', category_level_1: 'Shoes', category_level_2: 'Running', stock_level: 14, availability: 'in_stock' } },
  // price sent as text
  { t: 1, event: 'view_item', page: 'https://shop.example.com/socks/merino', expect: 'type_mismatch', props: { ...SOCKS, brand: 'Acme', category_level_1: 'Socks', stock_level: 3, price: '12.50', availability: 'in_stock' } },
  // value outside the allowed list
  { t: 2, event: 'view_item', page: 'https://shop.example.com/shoes/city-sneaker', expect: 'enum_violation', props: { product_id: 'P-3003', variant_id: 'V-3003-40', title: 'City Sneaker', brand: 'Acme', price: 79, stock_level: 0, availability: 'sold_out' } },
  { t: 10, event: 'cart_update', page: 'https://shop.example.com/shoes/trail-runner', props: { action: 'add', ...TREE, quantity: 1, product_ids: ['P-1001'], product_list: [line(TREE, 1)], total_price: 59.9, total_quantity: 1, currency: 'EUR' } },
  // product_ids has two ids, product_list only one
  { t: 11, event: 'cart_update', page: 'https://shop.example.com/socks/merino', expect: 'state_list_mismatch', props: { action: 'add', ...SOCKS, quantity: 2, product_ids: ['P-1001', 'P-2002'], product_list: [line(TREE, 1)], total_price: 59.9, total_quantity: 1, currency: 'EUR' } },
  { t: 12, event: 'cart_update', page: 'https://shop.example.com/cart', props: { action: 'remove', ...SOCKS, quantity: 0, product_ids: ['P-1001'], product_list: [line(TREE, 1)], total_price: 59.9, total_quantity: 1, currency: 'EUR' } },
  { t: 20, event: 'wishlist_update', page: 'https://shop.example.com/shoes/trail-runner', props: { action: 'add', product_id: 'P-1001', variant_id: 'V-1001-42', price: 59.9 } },
  // an action value the definition does not know
  { t: 21, event: 'wishlist_update', page: 'https://shop.example.com/shoes/city-sneaker', expect: 'unknown_variant', props: { action: 'toggle', product_id: 'P-3003', variant_id: 'V-3003-40', price: 79 } },
  // a clean order, items add up
  { t: 30, event: 'purchase', props: { purchase_id: 'ORD-5001', purchase_status: 'completed', product_ids: ['P-1001', 'P-2002'], product_list: [line(TREE, 1), line(SOCKS, 2)], total_price: 84.9, total_quantity: 3, currency: 'EUR' } },
  { t: 31, event: 'purchase_item', props: { purchase_id: 'ORD-5001', ...TREE, quantity: 1 } },
  { t: 32, event: 'purchase_item', props: { purchase_id: 'ORD-5001', ...SOCKS, quantity: 2 } },
  // order total does not match its items (79.90 against 59.90)
  { t: 40, event: 'purchase', expect: 'rounding_drift', props: { purchase_id: 'ORD-5002', purchase_status: 'completed', product_ids: ['P-1001'], product_list: [line(TREE, 1)], total_price: 79.9, total_quantity: 1, currency: 'EUR' } },
  { t: 41, event: 'purchase_item', props: { purchase_id: 'ORD-5002', ...TREE, quantity: 1 } },
  { t: 3, event: 'view_category', page: 'https://shop.example.com/shoes', props: { category_id: 'C-12', category_name: 'Running shoes' } },
  { t: 4, event: 'search', page: 'https://shop.example.com/search?q=trail+shoes', props: { search_query: 'trail shoes' } },
  // email without an @
  { t: 50, event: 'newsletter_signup', page: 'https://shop.example.com/', expect: 'format_violation', props: { email: 'anna.novak.example.com', form_id: 'footer' } },
];

// ---------------------------------------------------------------------------
// Comments (D-49). `entity`: `event:<name>` or `requirement:<UC code>:<index>`.
// ---------------------------------------------------------------------------
export const COMMENTS = [
  { entity: 'event:cart_update', author: 'Jana (Acme)', via_share: true, body: 'Can we also send the cart value in the remove push? Marketing wants to trigger on a cart dropping below 30 EUR.' },
  { entity: 'event:cart_update', author: 'E3 team', via_share: false, body: 'Yes, total_price already travels with every push, it is recalculated after the change.' },
  { entity: 'event:cart_update', author: 'E3 team', via_share: false, internal_only: true, body: "Internal: plan one more review round with the client's developer before go-live." },
  { entity: 'requirement:UC-01:0', author: 'E3 team', via_share: false, body: 'Abandoned cart needs the add variant only; a remove must not restart the timer.' },
];
