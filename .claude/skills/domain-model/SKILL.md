---
name: domain-model
description: The shared entity model, variant rules, and Bloomreach format contracts for e3-tracking. Load whenever designing, implementing, reviewing, or testing anything that touches events, properties, variants, use cases, identity, catalogs, consents, or Bloomreach JSON.
---

# Domain model

The authoritative narrative is `.claude/team/CONTEXT.md`. This skill is the compact reference.

## Entities
- **Client**: a Bloomreach account (mother company). name, key, bloomreach_account_id, notes. Owns Projects.
- **Project**: one Bloomreach project (brand). client_id, name, key, bloomreach_project_token, bloomreach_api_base_url, bloomreach_project_url, default expiration, settings. Owns everything below. Sharing between sibling projects is copy with provenance (origin_project_id, origin_entity_id), never inheritance (D-27).
- **StandardEventMapping**: standard_event key (seed list plus project additions), event_id, optional variant_id, field_map (Bloomreach field to project property). Mappings with an empty filter have variant_id null.
- **Event**: name (snake_case), description, owner, page, trigger, identity, purpose, event type (custom/system), sources (live, historical, daily), priority, status, expiration (enabled, count, units), documentation card fields.
- **Property**: name (snake_case), category, description, data type, data format, PII flag, example values, presence, property type (custom/system), allowed values (for enums), notes.
- **EventProperty**: links Event to Property with required flag, priority, status, source, role (`normal` | `discriminator` | `context`).
- **Variant**: Event plus an ordered list of conditions `(property, operator, value)` over discriminator properties only. Has a name such as `cart_update[action=add]` and an optional mapping to a Bloomreach standard event.
- **Context dimension**: a Property with role `context` and allowed values. Never creates variants. Feeds the coverage grid Variant x Context values.
- **CustomerProperty**: like Property, plus identifier flags and Bloomreach mapping.
- **IdentityRule**: field in Bloomreach, identity type (hard/soft), trigger, value rule, source, tracker, priority, status.
- **Catalog** and **CatalogProperty**: name, primary key, properties with searchable, required, mapping.
- **ConsentCategory**: name, Bloomreach mapping.
- **UseCaseTemplate**: library item (id, name, type marketing/transactional, description, default requirements).
- **UseCase**: client instance of a template (or ad hoc), priority, status, owner, notes.
- **Requirement**: UseCase to (CustomerProperty | Variant or Event plus Property) with level R/O and status. The requirements matrix is a computed view over these.
- **Observation**: an event instance from a Bloomreach export or an agent browsing the site via MCP: type, timestamp, properties, source (export/agent), page URL, context values, captured at, run id.
- **QaRun**: groups observations submitted in one agent session or one export paste, with agent or user name, environment, started and finished at.
- **Finding**: result of a comparison: kind, severity, entity refs, expected, actual.

## Variant rules
1. Discriminators are Properties with role `discriminator` and a non-empty allowed-value list (enum).
2. A Variant condition may reference only discriminator properties and values from their list.
3. At most two discriminators per event unless a decision record allows more.
4. Context properties are enums with role `context`. They never appear in variant conditions.
5. The UI highlights discriminators and shows the allowed values inline with the standard event each value maps to.
6. Unknown live values for a discriminator are a Finding of kind `unknown_variant`.

## Bloomreach formats (fixtures in `.claude/team/samples/`)
- **Customer events export** `customer-events-export.json`: `{ customer_id, project, events: [{ type, timestamp, properties }] }`. Values often arrive as strings; type checks must record the actual JSON type.
- **Data mapping** `data-mapping.json`: `standard_events.<std>.event = { type, filter: [{ attribute.property, constraint.operator, constraint.operands[].value }] }` plus per-field `{ property }` renames; also `customer_properties`, `consents`, `catalogs`. A filter is exactly a Variant condition list.
- **Expiration settings** `expiration-settings.json`: `events: [{ type, filter, expiration: { enabled, duration: { count, units } } }]` plus `other` default.

- **Data Manager customers** `data-manager-customers.json` and **Data Manager events** `data-manager-events.json` (D-28): Bloomreach definition exports. Groups map to property category; `private` to PII; types string, number, boolean, date, datetime, list, long text, url map to data type plus format. All other flags are kept in `bloomreach_meta_json` per entity and written back on export unchanged. The events file gives the type Bloomreach holds per property and feeds comparison 4.

## Three-way comparison (plus comparison 4: definition vs Data Manager, D-28)
- Definition vs mapping: mapped variants, renames, missing standard events, empty catalog block.
- Mapping vs observations: mapped properties absent in live events.
- Definition vs observations: missing required properties, type mismatch (string vs number/bool/array), format violations, values outside enums, inconsistent shape of the same property across events, rounding drift on monetary fields.
- Expiration affects expectations: do not flag an event as missing if it is past its expiration window.

## MCP surface (D-11)
Read: `list_events`, `get_event_card`, `list_use_cases`, `get_use_case`, `get_expected_payload(event|variant)`, `list_findings`. Write: `submit_observation`, `submit_observations_batch` (accepts the Bloomreach export shape). Compute: `run_comparison(scope)`, `get_coverage_grid(use_case|event)`. Local-first over stdio; the server shares the local database with the app.

## Certified status
Event status becomes `certified` only when all three comparisons have zero findings of severity error for that event.

## Finding kinds
`missing_required`, `type_mismatch`, `format_violation`, `enum_violation`, `unknown_variant`, `shape_inconsistent`, `rename_mismatch`, `unmapped_standard_event`, `unmapped_property`, `expiration_mismatch`, `rounding_drift`, `unexpected_property`.
