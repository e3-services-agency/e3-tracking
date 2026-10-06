/**
 * One dictionary of hover hints (T-4-24, item 1): form label or table column header -> one
 * sentence, shown as a native `title` tooltip by `src/components/ui/FieldHint.tsx`. Keys are the
 * visible label text; a page-scoped entry (`"Events.Status"`) wins over the generic one
 * (`"Status"`), and a label with a glossary term falls back to the glossary definition. Pure data,
 * no server or database import (domain-model skill).
 */
import { GLOSSARY } from './glossary';

export const FIELD_HINTS: Record<string, string> = {
  // Generic
  Name: 'The identifier used in Bloomreach and in tracking code; keep it exact.',
  Description: 'Plain-words explanation of what this is and why it exists.',
  Priority: 'How important this is to the migration: critical, high, medium or low.',
  Status: 'Lifecycle state set by hand: planned, implemented or ignored.',
  Owner: 'The person or team responsible for this item.',
  Kind: 'The sub-type of this item.',
  Type: 'The sub-type of this item.',
  Notes: 'Free-text notes for the team; not exported to Bloomreach.',
  Actions: 'Row actions.',
  Order: 'Position in the list; drag or use the arrows to change it.',
  Color: 'A label colour used to tell this item apart in lists.',
  'Color (optional)': 'A label colour used to tell this item apart in lists.',
  Timestamp: 'When this happened.',
  Message: 'What was found, in plain words.',

  // Events
  'Events.Name': 'The Bloomreach event type name, for example purchase or cart_update.',
  'Events.Class': 'custom = defined by this project; sdk = emitted by the Bloomreach SDK; platform = created by Bloomreach itself.',
  Class: 'custom = defined by this project; sdk = emitted by the Bloomreach SDK; platform = created by Bloomreach itself.',
  'Events.Status': 'Manual state: planned, in review, implemented or ignored. Certified is computed from findings, not set here.',
  Expiration: 'How long Bloomreach keeps this event type before deleting it; empty inherits the project default.',
  Properties: 'How many properties are linked to this item.',
  Card: 'Open the event card: the full documentation for this event.',
  'Business name': 'The name business stakeholders use for this event.',
  Purpose: 'What business question or use case this event serves.',
  Grain: 'What one row of this event represents, for example one order or one cart change.',
  Trigger: 'When and where in the customer journey this event fires.',
  Page: 'The page or screen where the trigger happens.',
  'Owner (business)': 'The business person who can answer questions about what this event means.',
  'Owner (technical)': 'The developer or vendor who implements this event.',
  'Not suitable for': 'Uses this event should not be relied on for; shown on the card and the shared view.',
  'Identity note': 'How the customer is identified when this event fires (internal).',
  'Agent instructions': 'Instructions for AI agents reading this event through MCP (internal, never shared).',
  'Implementation method': 'How the event reaches Bloomreach: client_web (dataLayer), server_api (Tracking API) or sdk_auto (emitted by the SDK).',
  'dataLayer event name': 'The event name pushed to the dataLayer when it differs from the Bloomreach event name.',
  'Sources (system via method)': 'Which systems send this event, and through which collection method.',

  // Properties
  'Properties.Name': 'The property name as sent to Bloomreach (snake_case).',
  Scope: 'event = belongs to events; customer = a customer property.',
  Category: 'Derived group: system customer, customer, SDK default or event property (can be overridden).',
  'Property category': 'Derived group: system customer, customer, SDK default or event property (can be overridden).',
  'Data type': 'The Bloomreach data type of the value: string, number, boolean, date, list and so on.',
  Enum: 'Whether the property has a fixed list of allowed values.',
  'Data formats': 'The recommended formats for the value, for example ISO 8601 or E.164.',
  Formats: 'The recommended formats for the value, for example ISO 8601 or E.164.',
  'Example value': 'A realistic example value, shown in docs and code snippets.',
  Definitions: 'Named meanings of this property; most properties have just the default one called general.',
  Bundles: 'Named groups of properties that can be added to an event in one step.',
  'Property type': 'Kind of property: event, item, state list or context (how the value is produced in tracking code).',
  'Bloomreach customer property': 'The customer property in Bloomreach this property maps to.',
  'Catalog field': 'The catalog column this property looks up.',

  // Catalogs
  'Catalogs.Name': 'The catalog name as it appears in Bloomreach.',
  'Catalogs.Kind': 'product, variant or other: what the catalog rows describe.',
  'Market / language': 'The market and language the catalog covers.',
  Version: 'A version label for this catalog snapshot.',
  'Mapping role': 'main = the catalog the product feed maps into (only one per project).',
  'Bloomreach column': 'The column name in the Bloomreach catalog.',
  'Client field name': 'The matching field name in the client system or feed.',
  Market: 'The market this catalog covers.',
  Language: 'The language this catalog covers.',

  // Sources
  'System via method': 'The sending system and how it sends: web SDK, server API, import and so on.',
  'Used In': 'Which events receive data from this source.',
  'Source Name': 'A short name for the data source.',
  System: 'The system the data comes from.',
  'Collection method': 'How the data is collected: web SDK, mobile SDK, server API, import and so on.',

  // Use cases
  Code: 'A short unique code for the use case, for example UC-02.',
  'UseCases.Name': 'The use case name.',
  'UseCases.Type': 'The category of use case, for example personalisation or retention.',
  'Target kind': 'What a requirement points at: event, variant, property, customer property, catalog attribute or consent.',
  Target: 'The specific item the requirement points at.',
  Level: 'R = required, O = optional.',
  Note: 'A free-text note on this requirement.',
  Narrative: 'A readable description of the use case; generated from its requirements and editable.',
  'Documentation link': 'A public link to documentation for this use case; shown on the shared view.',
  'Internal link': 'A link for the team only; never exported or shared.',
  'Internal notes': 'Notes for the team only; never exported or shared.',

  // Consents
  'Client category': 'The consent category name used by the client.',
  'Standard key': 'The Bloomreach standard consent key it maps to.',
  'Add a standard consent key': 'Register a Bloomreach consent key that is not in the default list.',

  // Identity
  'Identifier name': 'The identifier key in Bloomreach, for example email_id or registered.',
  'Identity type': 'hard = identifies a known customer (such as email); soft = a cookie or device id.',
  'SDK call': 'The SDK call that sets this identifier, for example identify.',
  'Trigger event': 'The event that fires when this identifier is learned.',
  'Trigger text': 'Plain-words description of when the identifier is learned.',
  Tracker: 'The system that records this identifier.',
  Transformations: 'How the raw value is cleaned before sending, for example lower-case and trim.',
  'Value rule': 'What a valid value looks like.',
  Example: 'An example value.',
  Source: 'The source that provides this data.',

  // QA runs
  'QaRuns.Kind': 'export_paste = pasted Bloomreach export; agent_session = an agent submitted observations; manual = typed by hand.',
  Actor: 'Who or what made the change.',
  Environment: 'Where the data was captured: production, staging or a local test.',
  Started: 'When the run started.',
  Finished: 'When the run was finished; empty while it is still open.',
  Archived: 'Archived runs are hidden from the default list.',
  Resolved: 'Whether the observation was matched to a defined event.',

  // Findings
  Severity: 'error = must be fixed; warning = should be reviewed; info = for awareness.',
  'Findings.Kind': 'What kind of mismatch this is; hover the value for the explanation.',
  Rule: 'The rule that produced this finding.',
  Comparison: 'Which comparison found it: definition vs mapping, mapping vs observations, definition vs observations or definition vs Data Manager.',
  Event: 'The event the finding is about.',
  'Findings.Status': 'open = needs attention; resolved = fixed or acknowledged.',
  'Last seen': 'The last comparison run in which this finding still reproduced.',

  // History
  Entity: 'The item that was changed.',
  'Entity type': 'The kind of item that was changed.',
  Action: 'create, update, delete or restore.',
  Field: 'The field that changed.',
  Before: 'The value before the change.',
  After: 'The value after the change.',
  'History.Type': 'The kind of item that was changed.',
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
