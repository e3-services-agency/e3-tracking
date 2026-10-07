/**
 * One dictionary of hover hints (T-4-24, T-4-29): form label or table column header -> what belongs
 * there plus one concrete example, shown in the shared tooltip (`src/components/ui/Tooltip.tsx`)
 * by `FieldLabel`/`HintTh`/`SortableTh` (`src/components/ui/FieldHint.tsx`). Keys are the visible
 * label text; a page-scoped entry (`"Events.Status"`) wins over the generic one (`"Status"`), and
 * a label with a glossary term falls back to the glossary definition. Keep entries under 160
 * characters, and public-safe: the shared view uses the same text. Pure data, no server or
 * database import (domain-model skill). Coverage is enforced by `fieldHintsCoverage.test.ts`.
 */
import { GLOSSARY } from './glossary';

export const FIELD_HINTS: Record<string, string> = {
  // Generic
  'Name': 'The exact identifier used in Bloomreach and in tracking code. Example: purchase, cart_update.',
  'Description': 'What this is and why it exists, in plain words. Example: Fires when a customer completes an order.',
  'Priority': 'How important this is to the migration: critical, high, medium or low. Example: critical for revenue events.',
  'Status': 'Lifecycle state set by hand: planned, implemented or ignored. Example: implemented once live in production.',
  'Owner': 'The person or team responsible. Example: e-commerce manager, CRM team.',
  'Kind': 'The sub-type of this item. Example: product or variant for a catalog.',
  'Type': 'The sub-type of this item. Example: personalisation, retention.',
  'Notes': 'Free-text notes for the team; not exported to Bloomreach. Example: waiting for the client to confirm the field.',
  'Actions': 'Row actions: open, edit or delete this row.',
  'Order': 'Position in the list; drag or use the arrows to change it.',
  'Color': 'A label colour used to tell this item apart in lists. Example: pick one per source system.',
  'Color (optional)': 'A label colour used to tell this item apart in lists. Example: pick one per source system.',
  'Timestamp': 'When this happened. Example: 2026-10-07 14:32.',
  'Message': 'What was found, in plain words. Example: property price is missing in 3 observations.',
  'Key': 'A short, unique, URL-safe identifier. Example: acme-shop.',
  'Key (URL-safe)': 'A short, unique, URL-safe identifier, lower-case with dashes. Example: acme-shop.',
  'Count': 'How many rows are in this group.',
  'Changes': 'How many fields or rows change if you apply this import.',
  'Enabled': 'Whether this is switched on. Example: switch off a rule to pause it without deleting it.',
  'Required': 'Whether this must always be present. Example: a required property on an event.',
  'required': 'Whether this must always be present. Example: an item field every item must have.',
  'Flags': 'Markers on a template. Example: new, popular.',

  // Events
  'Events.Name': 'The Bloomreach event type name. Example: purchase, cart_update.',
  'Events.Class': 'custom = defined by this project; sdk = emitted by the Bloomreach SDK; platform = created by Bloomreach. Example: custom.',
  'Class': 'custom = defined by this project; sdk = emitted by the Bloomreach SDK; platform = created by Bloomreach. Example: custom.',
  'Events.Status': 'Manual state: planned, in review, implemented or ignored. Certified is computed from findings, not set here.',
  'Source': 'Where the event data comes from. Example: Shopify via GTM data layer.',
  'Expiration': 'How long Bloomreach keeps this event type before deleting it; empty inherits the project default. Example: 365 days.',
  'Properties': 'How many properties are linked to this item. Example: 12.',
  'Card': 'Open the event card: the full documentation for this event.',
  'Business name': 'The name business stakeholders use. Example: Order completed.',
  'Purpose': 'The business question or use case this event serves. Example: Measure revenue and trigger post-purchase flows.',
  'Grain': 'What one row of this event represents. Example: one cart change, one order line.',
  'Trigger': 'When in the customer journey the event fires. Example: customer clicks Place order.',
  'Page': 'Where the event fires. Example: product detail page, checkout step 2.',
  'Owner (business)': 'Who answers questions about what the event means. Example: e-commerce manager.',
  'Owner (technical)': 'Who implements and maintains the event. Example: web developer, GTM agency.',
  'Not suitable for': 'Uses this event should not be relied on for. Example: not for revenue reporting, it fires before payment.',
  'Identity note': 'How the customer is identified when this event fires (internal). Example: email is known after login.',
  'Agent instructions': 'Instructions for AI agents reading this event through MCP (internal, never shared). Example: always check currency first.',
  'Implementation method': 'How the event reaches Bloomreach: client_web (dataLayer), server_api (Tracking API) or sdk_auto (emitted by the SDK).',
  'dataLayer event name': 'The event name pushed to the dataLayer if it differs from the Bloomreach name. Example: br_purchase.',
  'Sources (system via method)': 'Which systems send this event and how. Example: Shopify via GTM data layer.',
  'Derived metrics': 'Values computed from several properties. Example: line total = price x quantity.',
  'Project property': 'The property of this project that the standard field maps to. Example: item_price.',
  'Bloomreach field': 'The field name Bloomreach expects. Example: total_price.',
  'Allowed values': 'The fixed list of values this property may take. Example: new, returning.',
  'Use': 'Link this property to the event; unticked properties are not part of it.',
  'Conditions': 'Discriminator values that make this a distinct variant. Example: action equals add.',
  'Standard event': 'The Bloomreach standard event this one maps to. Example: purchase, cart_update.',
  'Variants': 'Distinct meanings of one event told apart by a discriminator property. Example: cart_update add and remove.',
  'Certified': 'Computed: no open error findings and observed in a QA run. Not set by hand.',

  // Properties
  'Properties.Name': 'The property name as sent to Bloomreach. Example: total_price, item_id.',
  'Scope': 'event = belongs to events; customer = a customer property. Example: customer for email.',
  'Category': 'Derived group: system customer, customer, SDK default or event. Can be overridden. Example: SDK default for browser.',
  'Property category': 'Derived group: system customer, customer, SDK default or event. Can be overridden. Example: SDK default for browser.',
  'Data type': 'The Bloomreach data type of the value. Example: string, number, boolean, date, list.',
  'Enum': 'Whether the property has a fixed list of allowed values. Example: yes for payment_method.',
  'Data formats': 'Recommended formats for the value. Example: ISO 8601 for dates, E.164 for phone numbers.',
  'Formats': 'Recommended formats for the value. Example: ISO 8601 for dates, E.164 for phone numbers.',
  'Example value': 'A realistic value, shown in docs and code snippets. Example: 49.90.',
  'Definitions': 'Named meanings of this property; most have just the default one called general. Example: general, loyalty price.',
  'Bundles': 'Named groups of properties added to an event in one step. Example: item fields.',
  'Property type': 'How the value is produced: event, item, state list or context. Example: item for a product row.',
  'Bloomreach customer property': 'The customer property in Bloomreach this maps to. Example: email.',
  'Catalog field': 'The catalog column this property looks up. Example: product_id.',
  'Contains PII': 'Tick if the value identifies a person; it is flagged in docs. Example: email, phone.',
  'Role': 'normal, discriminator (tells variants apart) or context (extra detail, never a variant). Example: discriminator.',
  'Used by events': 'The events that use every property of this bundle.',
  'Computed as': 'How the value is derived from other data. Example: sum of item prices.',
  'Form': 'The shape of the computed value. Example: list of ids, or a total.',
  'Id field': 'The item field that identifies each item. Example: item_id.',
  'Quantity field': 'The item field holding the quantity. Example: quantity.',
  'Sum of item fields': 'The item fields added up to produce the value. Example: price x quantity.',
  'Item schema (array items)': 'The fields every item in a list property must have. Example: item_id, price, quantity.',

  // Catalogs
  'Catalogs.Name': 'The catalog name as in Bloomreach. Example: products_de.',
  'Catalogs.Kind': 'product, variant or other: what the rows describe. Example: product.',
  'Market / language': 'The market and language the catalog covers. Example: DE / de.',
  'Version': 'Catalog version, v1 or v2. Example: v2 for the newer catalog engine.',
  'Mapping role': 'main = the catalog the product feed maps into (one per project). Example: main.',
  'Bloomreach column': 'The column name in the Bloomreach catalog. Example: item_id.',
  'Client field name': 'The matching field in the client system or feed. Example: sku.',
  'Market': 'The market the catalog covers. Example: DE.',
  'Language': 'The language the catalog covers. Example: de.',
  'Searchable': 'Whether the column is searchable in Bloomreach; limited to 40 per catalog. Example: product name.',
  'Lookup key': 'The unique column used to look rows up. Example: item_id.',

  // Sources
  'System via method': 'The sending system and how it sends. Example: Shopify via GTM data layer.',
  'Used In': 'The events that receive data from this source.',
  'Source Name': 'A short name for the data source. Example: Web shop.',
  'System': 'The system the data comes from. Example: Shopify, Salesforce.',
  'Collection method': 'How the data is collected. Example: web SDK, server API, file import.',

  // Use cases
  'Code': 'A short unique code. Example: UC-02.',
  'UseCases.Name': 'The use case name. Example: Abandoned cart reminder.',
  'UseCases.Type': 'The category of use case. Example: personalisation, retention.',
  'Target kind': 'What a requirement points at: event, variant, property, customer property, catalog attribute or consent.',
  'Target': 'The specific item the requirement points at. Example: cart_update.',
  'Level': 'R = required, O = optional. Example: R for the cart event.',
  'Note': 'A free-text note on this requirement. Example: only needed for the email channel.',
  'Narrative': 'A readable description of the use case, generated from its requirements and editable.',
  'Documentation link': 'A public link to documentation, shown on the shared view. Example: a help-centre article.',
  'Internal link': 'A link for the team only; never exported or shared. Example: Jira ticket.',
  'Internal notes': 'Notes for the team only; never exported or shared. Example: client wants this by Q4.',
  'Requirements': 'The data this use case needs. Example: cart_update with item_id.',
  'Property': 'The property this row is about. Example: item_id.',
  'Op': 'What the import does with this row: add, update or remove.',

  // Consents
  'Client category': 'The consent category name the client uses. Example: Marketing emails.',
  'Standard key': 'The Bloomreach standard consent key it maps to. Example: email.',
  'Add a standard consent key': 'Register a Bloomreach consent key that is not in the default list. Example: web_push.',

  // Identity
  'Identifier name': 'The identifier key in Bloomreach. Example: email_id, registered.',
  'Identity type': 'hard = identifies a known customer (email); soft = cookie or device id. Example: hard.',
  'SDK call': 'The SDK call that sets this identifier. Example: identify.',
  'Trigger event': 'The event that fires when this identifier is learned. Example: login.',
  'Set by': 'The event, or standalone call, that sets this identifier, and its source.',
  'Carried by': 'The events that send this identifier in customer_ids.',
  'Trigger text': 'When the identifier is learned, in plain words. Example: after the customer logs in.',
  'Tracker': 'The system that records this identifier. Example: GTM.',
  'Transformations': 'How the raw value is cleaned before sending. Example: lower-case and trim.',
  'Value rule': 'What a valid value looks like. Example: a valid email address.',
  'Example': 'An example value. Example: anna@example.com.',
  'Identifiers': 'The identity identifiers this event sends in customer_ids; derived unless set by hand. Example: email_id.',

  // QA, findings, history
  'QaRuns.Kind': 'export_paste = pasted Bloomreach export; agent_session = agent submitted; manual = typed by hand.',
  'Actor': 'Who or what made the change. Example: Jan Pan, MCP agent.',
  'Environment': 'Where the data was captured. Example: production, staging.',
  'Started': 'When the run started.',
  'Finished': 'When the run finished; empty while open.',
  'Archived': 'Archived runs are hidden from the default list.',
  'Resolved': 'Whether the observation was matched to a defined event.',
  'Severity': 'error = must fix; warning = should review; info = for awareness.',
  'Findings.Kind': 'What kind of mismatch this is. Example: missing required property.',
  'Rule': 'The rule that produced this finding. Example: money tolerance.',
  'Comparison': 'Which comparison found it: definition vs mapping, vs observations, or vs Data Manager.',
  'Event': 'The event this is about. Example: purchase.',
  'Findings.Status': 'open = needs attention; resolved = fixed or acknowledged.',
  'Last seen': 'The last comparison run in which this finding still appeared.',
  'Entity': 'The item that was changed. Example: event purchase.',
  'Entity type': 'The kind of item that was changed. Example: event, property.',
  'Action': 'create, update, delete or restore.',
  'Field': 'The field that changed. Example: description.',
  'Before': 'The value before the change.',
  'After': 'The value after the change.',
  'History.Type': 'The kind of item that was changed. Example: event, property.',
  'What': 'What was changed. Example: event purchase, description.',
  'When': 'When the change was made.',
  'Who': 'Who made the change. Example: Jan Pan, MCP agent.',
  'Batch id': 'Groups changes made by one import or agent session. Example: a Data Manager import.',
  'Always open in full view': 'Open history entries in a full-width view instead of a side panel.',

  // Import
  'Import.Key': 'The identity of the row in the file. Example: the event name.',
  'Resolution': 'How the import matched this row to an existing item.',
  'Variant(s)': 'The variants an observed event resolved to. Example: cart_update add.',

  // StandardEvents
  'StandardEvents.Key': 'The standard event this row maps. Example: purchase.',
  'Mapped event': 'The project event that stands in for the standard event. Example: order_completed.',
  'Fields': 'The standard fields and the project properties they map to. Example: total_price -> order_total.',
  'Fields (comma-separated)': 'Standard field names, comma-separated. Example: total_price, currency.',
  'Field map': 'Which project property supplies each standard field.',
  'Variant (optional)': 'Pick a variant if only one variant of the event is the standard event. Example: add.',

  // Clients, projects, settings
  'Bloomreach account id': 'The Bloomreach account identifier of the client. Example: acme-prod.',
  'Bloomreach account id (optional)': 'The Bloomreach account identifier of the client. Example: acme-prod.',
  'Notes (optional)': 'Free-text notes for the team. Example: contact is the CRM lead.',
  'Client': 'The client (company) this belongs to. Example: Acme.',
  'Client key (URL-safe)': 'Short URL-safe key for the new client. Example: acme.',
  'Client name': 'The client company name. Example: Acme Corp.',
  'Project Name': 'Readable project name. Example: Acme web shop migration.',
  'Project name': 'Readable project name. Example: Acme web shop migration.',
  'New project key (URL-safe)': 'Short URL-safe key of the restored project. Example: acme-shop-copy.',
  'New project name': 'Name of the restored project. Example: Acme shop (restored).',
  'Backup file': 'A full JSON backup downloaded from this app.',
  'or paste backup JSON': 'Paste the backup content here instead of choosing a file.',
  'Internal only': 'Visible to the team only; never shown on the shared view.',
  'Visibility': 'Filter comments by who can see them: everyone or the team only.',
  'Bloomreach API base URL': 'The base URL of the Bloomreach API. Example: https://api.exponea.com.',
  'Bloomreach API customer identifier': 'Identifier used for API calls. Example: the registered customer id name.',
  'Bloomreach project URL': 'Link to the project in Bloomreach (internal). Example: https://eu.app.bloomreach.com/p/acme.',
  'Bloomreach project token': 'The project token used by the SDK. Example: a UUID from Bloomreach settings.',
  'Client primary color': 'Brand colour of the client, used on the shared view. Example: a hex colour like 0A66C2.',
  'Default event expiration': 'Expiration applied to events with none of their own. Example: 365 days.',
  'Default source': 'The source assumed when an event has none. Example: Shopify via GTM data layer.',
  'Industry': 'The client industry; the default filter for the template library. Example: retail.',
  'Money tolerance (rules, D-30)': 'Allowed rounding difference when comparing money values. Example: 1 percent, minimum 0.02.',
  'Naming convention': 'Naming style for custom events and properties: snake_case, kebab_case or camel_case. Example: snake_case.',
  'Share link (D-48)': 'A public read-only link to the documentation; rotate or revoke at any time.',
  'Show internal comments on the shared view': 'Internal comments never appear on the shared view; this setting controls the other comments.',
  'Jump to': 'Go straight to an event or section of this document.',
  'Comments': 'Discussion on this item. Example: a question about what the event means.',
  'Gaps only': 'Show only rows where a use case requires data the project does not define.',

};

function normalize(label: string): string {
  return label.replace(/\s+/g, ' ').replace(/[*:]+$/, '').trim();
}

/** Hover text for a label or column header, or `undefined` when none is known. */
export function hintFor(label: string, scope?: string): string | undefined {
  const clean = normalize(label);
  if (!clean) return undefined;
  if (scope && FIELD_HINTS[`${scope}.${clean}`]) return FIELD_HINTS[`${scope}.${clean}`];
  if (FIELD_HINTS[clean]) return FIELD_HINTS[clean];
  const lower = clean.toLowerCase();
  return GLOSSARY.find((g) => g.term.toLowerCase() === lower || g.key === lower)?.definition;
}
