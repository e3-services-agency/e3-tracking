# Domain model

Plain-words companion to the `domain-model` skill and `.claude/team/CONTEXT.md` section 3. Numbers in parentheses are `.claude/team/DECISIONS.md` records.

## Entity model

- **Client** — a Bloomreach account (a mother company). Holds one or more Projects (D-27).
- **Project** — one Bloomreach project or brand. The unit of work: everything below is scoped to a project, and a project exports a full JSON backup.
- **Event** — a Bloomreach event type (`purchase`, `view_item`, ...).
- **Property** — a field, either event-scoped or customer-scoped (`scope: event|customer`). Customer properties are Property rows with `scope: customer`, not a separate table (D-24). A property carries its own enum values in `allowed_values_json`, one list shared by every event that uses it (D-16).
- **EventProperty** — the link between an Event and a Property: required, role (`normal | discriminator | context`), status, source, payload key, priority. Per-event overrides (renamed field, example values) live here, not on Property (D-16).
- **Variant** — an Event plus conditions on one or two discriminator properties, for example `cart_update[action=add]`. This is the only thing that creates a variant; location-like context properties never do (D-03). Conditions are normalized (deduped, sorted, a one-value `in` collapsed to `equals`) so equivalent condition sets share one identity. Bloomreach's own data-mapping filter format is exactly this shape, so export is one to one.
- **Context property** — an enum property (page location: product page, listing, minicart, checkout, ...) that never creates a variant. QA reports a variant x context coverage grid (observed vs unobserved cells) instead of authoring every combination.
- **StandardEventMapping** — maps a Bloomreach standard event key (seed list in `src/domain/bloomreach.ts`, extensible per project, D-26) to an Event or Variant plus a field map.
- **IdentityRule** — when hard/soft customer IDs are set and when customer properties/events may be sent.
- **Catalog** — a Bloomreach catalog definition (columns, mapping role).
- **ConsentCategory** — a client-specific consent category mapped from a standard consent key (seed list, extensible per project, D-26), matching the Bloomreach mapping's `consents: {newsletter: "brand_consent"}` shape.
- **UseCaseTemplate** — a library entry (E3's ~90 standard use cases, loaded later, D-06). Not yet imported.
- **UseCase** — a client instance of a template, or a client-specific one. Carries an ordered list of Requirements, which doubles as the flow sequence, and a generated, editable narrative (no diagram, D-10).
- **Requirement** — one use case's need for a target (customer property, event, variant, or event/variant property pair), `level: required|optional`, in `sort_order`.
- **QaRun** — one batch of observations: either an applied `customer-events-export.json` paste, or a future MCP-submitted agent session.
- **Observation** — one observed event instance (raw type, raw properties, resolved `event_id`/`variant_id`, page context if from an agent session).
- **Finding** — one typed QA result, deduplicated by fingerprint (comparison, kind, event, variant, property, detail) and upserted on every recompute (D-21).

## The three comparisons (D-11, D-21)

1. **Definition vs mapping** — the project's Event/Property/Variant definitions against a pasted `data-mapping.json`. Surfaces as import preview warnings (`unmapped_property`, `unmapped_standard_event`, `rename_mismatch`, `unmapped_catalog`, `expiration_mismatch`), not yet a standalone comparison run. **Not implemented as comparison 1/2 engine code; only the import-preview side exists.**
2. **Mapping vs live events** — the applied `data-mapping.json`/`expiration-settings.json` against what Bloomreach actually received (from a customer events export paste or agent observations). **Not implemented.**
3. **Definition vs observations** — `src/domain/comparison/definitionVsObservations.ts`, orchestrated by `src/backend/services/comparison.service.ts`. **The only comparison implemented in phase 1.** Every observation in every non-archived QA run is re-resolved against the *current* definitions on each recompute (a stale `event_id`/`variant_id` never sticks), and findings are upserted by fingerprint — an unproduced fingerprint is resolved, never manually muted.

## Finding kinds and severities (D-21)

Fifteen kinds total: the twelve from the `qa-roundtrip` skill (`missing_required`, `type_mismatch`, `format_violation`, `enum_violation`, `unknown_variant`, `shape_inconsistent`, `rename_mismatch`, `unmapped_standard_event`, `unmapped_property`, `expiration_mismatch`, `rounding_drift`, `unexpected_property`) plus three added by D-21 (`missing_event`, `unexpected_event`, `unmapped_catalog`).

Severity table (D-21, D-25 Q4/Q5):
- **error**: `missing_required`, `type_mismatch`, `enum_violation`, `unknown_variant` (definition side), `shape_inconsistent`, `missing_event` in agent sessions.
- **warning**: `format_violation`, `rounding_drift`, `rename_mismatch`, `unmapped_property`, `unmapped_standard_event`, `unmapped_catalog`, `expiration_mismatch` (mapping side), `missing_event` in export pastes, `unknown_variant` (mapping side).
- **info**: `unexpected_property`, `unexpected_event`, `expiration_mismatch` (observation side).

Known Bloomreach system event types (`consent`, `survey`, `campaign`, `support_ticket`, `managed_endpoint`, `session_start`, `session_end`, `page_visit`, `web_exit`, `notification_state`, `first_session`, `banner`, `experiment`, and similar, seed list in `src/domain/bloomreach.ts`) are excluded from `unexpected_event` (D-25 Q5).

`rounding_drift` is anchored on the `purchase`/`purchase_item` standard-event mapping: sum of item price times quantity per `purchase_id` versus the purchase total, tolerance 0.01 in the purchase currency (D-21, D-25 Q12). Monetary properties carry data format `money`.

Expiration suppresses `missing_event` when the newest observation in scope is older than the event's effective expiration window (D-21).

## The certified rule (D-05, D-21)

An event is **certified** when:
1. Status is not `ignored`, and
2. Zero open **error** findings exist for the event across all three comparisons, and
3. At least one observation of the event exists in a non-archived QA run (D-25 Q10) — a mapped but never-observed event cannot certify.

Certification is computed on read, never stored; it changes automatically when definitions, mapping, or observations change. `isEventCertified` (in `src/domain/comparison/definitionVsObservations.ts`) is exposed as a pure helper but the certified data product card that surfaces it (name, owner, status, grain, identity, variants, contexts, freshness, quality, agent instructions) is not built yet — phase 2.
