---
name: domain-model
description: The shared entity model, variant rules, and Bloomreach format contracts for e3-tracking. Load whenever designing, implementing, reviewing, or testing anything that touches events, properties, variants, use cases, identity, catalogs, consents, or Bloomreach JSON.
---

# Domain model

The authoritative narrative is `.claude/team/CONTEXT.md`. This skill is the compact reference.

## Entities
- **Project**: one client engagement. Owns everything below.
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
- **Observation**: an event instance from a Bloomreach export or the QA overlay: type, timestamp, properties, source (export/frontend), captured at.
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

## Three-way comparison
- Definition vs mapping: mapped variants, renames, missing standard events, empty catalog block.
- Mapping vs observations: mapped properties absent in live events.
- Definition vs observations: missing required properties, type mismatch (string vs number/bool/array), format violations, values outside enums, inconsistent shape of the same property across events, rounding drift on monetary fields.
- Expiration affects expectations: do not flag an event as missing if it is past its expiration window.

## Certified status
Event status becomes `certified` only when all three comparisons have zero findings of severity error for that event.

## Finding kinds
`missing_required`, `type_mismatch`, `format_violation`, `enum_violation`, `unknown_variant`, `shape_inconsistent`, `rename_mismatch`, `unmapped_standard_event`, `unmapped_property`, `expiration_mismatch`, `rounding_drift`, `unexpected_property`.
