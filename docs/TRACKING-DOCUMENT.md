# Tracking document (`GET /api/projects/:projectId/export/tracking-document.json`)

Machine-readable, per-project export of the tracking plan: event definitions with their
certification, guardrail rules and open findings, customer properties, identity rules, consent
categories, catalogs, use cases with their ordered requirements and narrative, standard event
mappings, a project-wide findings summary, and Bloomreach platform limits. It carries **no raw
observations** — an automated agent gets full observation rows from the MCP `list_findings`/
`get_event_card` tools (T-2-10) if it needs them, but every currently-open `Finding` for an event is
already inline on that event's card (D-40 Q9, fix round): no second round-trip is needed to see
*why* an event is not certified.

Built by `src/backend/services/document.service.ts#buildTrackingDocument`, typed by
`src/domain/document/trackingDocument.ts` (the `TrackingDocument`/`EventCard` interfaces — the
canonical shape reference; this file is a guide, not a replacement for reading the types). The same
`buildEventCard` function backs the in-app event card page (T-2-09), the HTML documentation export's
certification/rules/coverage sections, and the MCP `get_event_card` tool (T-2-10), so all four
consumers always agree.

## Fetching it

```
GET /api/projects/:projectId/export/tracking-document.json
GET /api/projects/:projectId/export/tracking-document.json?version=1
```

The UI downloads it from the Events page ("Tracking document JSON" button, next to "Documentation").

## Versioning (D-34)

`version` is a plain integer, currently `1`. The rule:

- **Additive changes** (a new optional field on `EventCard`, `TrackingDocument`, or any nested
  shape) do **not** bump `version`. A consumer that only reads fields it knows about is unaffected.
- **Breaking changes** (a field rename or removal, a type change on an existing field, a change in
  the meaning of an existing value) bump `version` by 1. The previous version is kept servable via
  `?version=<n>` for one phase behind current, then dropped.
- Requesting an unsupported version (anything other than a currently-servable version) returns
  `400 BAD_REQUEST` with `field: "version"`.

There is only one version today (`1`); `?version=1` and the unqualified request are equivalent.

## Top-level shape

```ts
{
  format: 'e3-tracking-document',
  version: 1,
  generated_at: string,      // ISO timestamp, current time on every fetch (not cached)
  project: { key, name, client, bloomreach_project_url, money_tolerance: { percent, floor } },
  events: EventCard[],       // custom events first, then sdk/platform events
  properties: [...],         // customer-scope properties, each with category and definitions[] (D-58, D-64)
  event_properties: [...],   // event-scope properties with category and kind (D-64)
  identity_rules: [...],
  consent_categories: [...],
  catalogs: [...],
  use_cases: [...],          // ordered requirements resolved to display names, plus narrative
  standard_event_mappings: [...],
  findings_summary: { open: {error, warning, info}, by_comparison: {...} },
  unattached_findings: EventCardFinding[],  // open findings with no owning event card, fix round 2
  limits: { event_types: {count, limit}, max_properties_per_event: [...] },
}
```

## `EventCard`

One entry per non-deleted event (custom events first, D-29/D-36 class). Every field from the plan's
field list is present:

| Field | Notes |
|---|---|
| `implementation_method`, `dl_event_name` | D-63 (T-4-17), additive: how the event reaches Bloomreach (`client_web` | `server_api` | `sdk_auto`; absent on an older document means `client_web`) and the site's dataLayer event that carries it (`null` when not recorded). Kept in the public projection. |
| `name`, `business_name`, `class`, `description`, `purpose`, `page`, `trigger`, `grain`, `identity_note` | Straight from the `Event` row. |
| `owners` | `{business, technical}`. |
| `priority`, `status` | `PRIORITIES`/`EVENT_STATUSES` (`src/domain/enums.ts`). |
| `certification` | `{applicable, certified, reasons[]}` — see below (D-05). |
| `expiration` | `{effective, source: 'event' \| 'project' \| null}` — the event's own expiration, else the project default, else `null`. |
| `properties[]` | Every linked property: `payload_key`, `data_type`, `data_formats`, `required`, `role`, `allowed_values` (with `label`/`standard_event` hints), `item_schema` (D-30, array properties only), a generated `example`, `description`, `pii`, `kind`/`derivation`/`datalayer_path`/`bundle` (D-63, T-4-17, additive: `kind` is `event` | `item` | `state_list` | `context`; `derivation` is the state list's rule, `{source: 'items', id_field, form: 'ids' | 'id_quantity', quantity_field?}` or `{source: 'items', sum: 'price*quantity'}`, else `null`; `datalayer_path` is `bloomreach.properties.x`, `bloomreach.item.x` or `computed from items`, and is `null` for every event whose `implementation_method` is not `client_web` (`server_api` and `sdk_auto` events have no dataLayer; views show "n/a"); `bundle` is the comma-joined name(s) of the property bundle(s) it belongs to, else `null`), `definition_id`/`definition_name` (D-58, T-4-00). `allowed_values`/`data_formats`/`description`/`example` are read from this link's own named definition (`property_definitions`), not the shared property, so the same property attached to two events can validate and document differently (e.g. `action` allows `add`/`remove` on `cart_update` but `accept`/`reject` on `consent`); a property with a single (`general`) definition behaves exactly as before this table existed. |
| `variants[]` | `id`, `name`, `conditions` (discriminator property names resolved), `standard_event` it maps to (if any), `expected_payload` (a sample JSON payload with the variant's discriminator values as literals), `required_keys` (the `expected_payload` keys that are required, fix round), `expiration` (this variant's own override, or `null` when it follows the event/project value, fix round). |
| `standard_event_mappings[]` | This event's `StandardEventMapping` rows, `field_map` resolved to property names. |
| `contexts[]` | `context`-role properties, their `payload_key` (the key `context_values_json`/the raw observation payload actually carries — may differ from the display name `property`, fix round) and their allowed values (D-03: contexts never create variants). |
| `triggers[]` | D-50/T-4-03, additive: screenshots/descriptions from `Event.triggers_json`, ordered as stored — `{title, description, image_path, page_url}` (`page_url` is `triggers_json`'s `source` field, the page the screenshot was captured on). `image_path` resolves through a consumer-supplied file route (`/api/projects/:id/files/*` internally, `/api/shared/:token/files/*` in the shared view); kept in the public projection. |
| `coverage` | Grid summary: `rows`/`columns` (columns keyed by `payload_key`, matching `GET /events/:id/coverage` and `context_values_json`, fix round) plus `observed_count`/`unobserved_count`. The full cell-level grid is `GET /events/:id/coverage`, not duplicated here. |
| `rules[]` | Guardrail rules (D-30/D-31): `kind`, `message`, `expression_text` (every `property_id` resolved to its name, e.g. `sum(product_list[].price * product_list[].quantity) eq total_price`), `tolerance`, `enabled`, `variant_id`/`variant_name` (`null` for an unconditional event-wide rule; non-null scopes it to one variant's observations only, fix round). |
| `derived_metrics`, `not_suitable_for`, `agent_instructions` | Straight from the `Event` row. |
| `use_cases[]` | `{code, name, level}` for every use case with a requirement touching this event (directly or via a variant); `level` is `R` if any matching requirement is required, else `O`. |
| `freshness` | `{last_observation_at, observation_count}`, live-resolved against current definitions (not the observation's stored `event_id`/`variant_id`, which only refresh on a comparison recompute). |
| `quality` | `{open: {error, warning, info}, acknowledged: {error, warning, info}, by_comparison}` — open `Finding` counts for this event, across every comparison; `acknowledged` (D-42, T-2-09 fix round) is the same breakdown for findings a person resolved by hand whose fingerprint still reproduced as of the last recompute (excluded from `open`/`findings[]`, but still counted by `certification`). |
| `findings[]` | Every currently-open `Finding` for this event, across every comparison and severity, **uncapped** (D-40 Q9, fix round): `id`, `comparison`, `kind`, `severity`, `property_id`/`property` (resolved name), `variant_id`/`variant`, `rule` (the originating rule's name, for a `rule_violation`/`bound_violation` finding; `null` otherwise), `message`, `expected`, `actual`, `qa_run_id`, `first_seen`, `last_seen`. |
| `codegen` | Snippets per implementation method (same generator as the docs export, D-63, T-4-17). Original keys stay: `gtm` (the dataLayer push plus the GTM template, `datalayer` + `gtm_template`), `web_sdk` (now the new Web SDK, `bloomreach.track(event, payload)`), `tracking_api`. Additive keys: `datalayer` (the reset push `{ bloomreach: null }` and the namespaced push, `bloomreach.event` / `properties` / `item` / `items`, with a header comment stating this is E3's recommended practice and validation always runs on the Bloomreach payload), `gtm_template` (the fixed `brPayload` transformation, the event's state-list rules and the GTM custom template setup), `web_sdk_legacy` (`exponea.track`), `sdk_emits` and `sdk_default_properties` (`sdk_auto` events only), `note` (one line on why tabs are absent for `server_api`/`sdk_auto`). Keys that do not apply to the event's `implementation_method` are empty strings: `client_web` has the dataLayer, GTM, both Web SDK snippets and the Tracking API; `server_api` only `tracking_api` plus `note`; `sdk_auto` only `sdk_emits`, `sdk_default_properties` and `note`. |
| `sdk_default_properties` | The fixed `SDK_DEFAULT_PROPERTIES` list (`os`, `browser`, `device`, `location`) — attributes the Bloomreach SDK attaches automatically, never flagged as unexpected. |

### Property definitions (D-58, T-4-00)

`properties[]` (top-level, customer-scope) carries a `definitions[]` array: every named meaning
that property holds (`{id, name, description, allowed_values, formats: string[], example_values}`
-- `formats` is the definition's whole format list, not a single value, so a property with several
formats ticked at once, e.g. `email` and `uri`, checks every one of them per event), sourced
from `property_definitions`. A property with one definition (the common case, named `general`) has
a one-element array; a property whose event links diverge (different events, different named
definitions) lists every one of them here, independent of which event card is looking at it.
Event-scope properties are listed in the additive top-level `event_properties[]` (D-64, below); their definitions
also show up per event, inline on `EventCard.properties[]` (`definition_id`/`definition_name`, plus the
allowed values/formats/example/description already resolved from that link's own definition).

### Property categories, `event_properties[]` and catalogs (D-64, T-4-20)

Additive (no version bump). Every entry of `properties[]` gains `category` (`system_customer` | `customer` | `sdk_default` | `event`, the derived value or the `properties.category_override` when set). A new top-level `event_properties[]` lists the event-scope properties (`property_id`, `category`, `kind`, `name`, `data_type`, `data_formats`, `description`, `used_in_events[]` (event names, sorted), `definitions[]`); `properties[]` stays customer-scope only, so existing consumers keep working. `catalogs[]` entries gain `id`, `description`, `source_system`, `sync_method`, `update_frequency`, `catalog_type`, `purpose`, `fields[]` (`name`, `description`, `data_type`, `is_lookup_key`, `is_searchable`, `is_required`) and `mapped_properties[]` (`property_name`, `scope`, `field_name`, `mapping_type`). A catalog's `owner`, `client_name` and `priority` are never included, so the public projection needs no extra stripping for them.

### Top-level `use_cases[]` fields

```ts
{
  id: string,                              // D-49, T-4-04: additive -- lets a comment anchor to this row
  code: string | null,
  name: string,
  type: string | null,
  status: string | null,
  narrative: string | null,
  requirements: [{
    id: string,                            // D-49, T-4-04: additive, same reason
    target_label: string,
    level: string,
    status: string | null,
  }],
  documentation_url: string | null,        // D-59 amendment 1: additive, public
  // internal_notes/internal_url are deliberately never included here (D-59 amendment 2)
}
```

Both `id` fields are additive (no `version` bump, D-34's versioning rule) — a consumer reading only
the fields it knows about is unaffected.

### The shared (public) view of this document

`GET /api/shared/:token/tracking-document.json` (D-48, T-4-03) serves the same builder run through
`toPublicTrackingDocument`: `agent_instructions`, `owners`, `identity_note`,
`project.bloomreach_project_url`, and every `internal_*` field (`use_cases[].internal_notes`/
`internal_url`, deep-swept) are stripped; `not_suitable_for` stays. Everything else in this
document — including `triggers[]`, property `definitions[]`, and the two additive `id` fields above
— is identical between the internal and public responses. See `docs/SHARING.md` for the full field
list and the shared routes. Comments are never part of this document on either side (D-49) — they
have their own routes.

### Payload keys (ERROR 2 fix round)

Observations and their `context_values_json` column are keyed by **payload key**, not the
property's display name (they can differ when a property's `payload_key` is set). Every coverage
column — `EventCard.coverage.columns[]`, `EventCard.contexts[].payload_key`, `GET /events/:id/
coverage`'s `columns[]`, and `src/domain/coverage.ts`'s `computeEventCoverage` — is keyed the same
way, so a context property with a custom `payload_key` reports the same observed/unobserved counts
everywhere.

### `unattached_findings` (fix round 2)

A finding's `event_id` is `null` for a comparison result that has no single owning event — a
cross-event finding (e.g. `shape_inconsistent`, computed across every event that observes a given
property) or a project/consent-level finding (e.g. a `mapping_vs_observations` consent category
rename with no event at all). Those findings still count toward `findings_summary`, so without
somewhere to put them they were silently invisible in the document body while `EventCard.findings[]`
made every other open finding visible (the 2026-09-27 QA FAIL that prompted this fix round). `event_
id` can also point at an event no longer in `events[]` (e.g. deleted since the finding was raised);
those are treated the same way.

`unattached_findings` is a top-level array, same row shape and same sort (`sortEventCardFindings`)
as `EventCard.findings`, built once from the same `EventCardBuildContext` the event cards use (no
second findings query, `document.service.ts#buildUnattachedFindings`).

**Invariant**: `sum(events[].findings.length) + unattached_findings.length === findings_summary.
open` (the sum of every severity in `open`), and no finding `id` appears twice (neither across two
event cards, nor between an event card and `unattached_findings`) — every currently-open finding is
counted, and shown, in exactly one place. Guarded by a test in `document.service.test.ts` (`describe
'TrackingDocument.unattached_findings (fix round 2)'`).

The HTML documentation export (`export.service.ts`) renders the same list as an "Open findings
without an event" table after the per-event sections, using `docs/sections.ts#renderFindingsTable`
with a custom heading (omitted entirely when the array is empty, like the per-event table).

### `sortEventCardFindings` ordering (WARNING 1 fix round)

Two findings can share severity, comparison, kind, property, variant and message and still differ
only in `expected`/`actual` — e.g. a `cross_event` rule ("items total") violated by two different
parent rows. The comparator's tie-break, in order: severity, comparison, kind, property, variant,
message, then `JSON.stringify(expected)`, then `JSON.stringify(actual)`, then `id`. This makes the
order fully deterministic (not just stable) for any input, including two rows identical except for
`expected`/`actual`.

### Certification (D-05, D-42)

```ts
certification(event) = {
  applicable: event.class === 'custom',
  certified: applicable && status !== 'ignored' && openErrorFindingCount === 0
             && acknowledgedErrorFindingCount === 0 && hasObservation,
  reasons: string[],
}
```

`reasons` is empty exactly when `certified` is `true`. Possible values, in this order when more
than one applies: `not_applicable` (sdk/platform event — exclusive, no other reason is added),
`status_ignored`, `` `open_errors: n` `` (n = open, error-severity findings for the event across
every comparison), `` `acknowledged_errors: n` `` (D-42, T-2-09 fix round — n = error-severity
findings a person resolved by hand via the Findings page's Resolve toggle / `PATCH .../findings/:id`
whose fingerprint still reproduced as of the last comparison recompute), `no_observations` (no
observation in a non-archived QA run currently resolves to this event). Certification is **never
stored**; it is recomputed on every request from live findings and live-resolved observations.

**Manual resolve is an acknowledgement, not a fix (D-42).** Resolving a finding by hand takes it out
of the open list and out of `EventCard.findings[]` (so it stops being *actionable* clutter), but it
still blocks certification via `acknowledged_errors: n` for as long as the underlying problem
reproduces — a person cannot flip an event to certified by dismissing a finding without fixing
anything. `EventCard.quality.acknowledged` reports the severity counts behind that reason. Once a
comparison recompute stops reproducing the acknowledged finding's fingerprint (the definition or
observations were actually fixed), the acknowledgement marker clears automatically and the finding
is fully resolved with nothing left blocking certification; an explicit reopen
(`PATCH .../findings/:id {status: 'open'}`) clears the marker immediately instead of waiting for the
next recompute. A later recurrence of the same fingerprint (acknowledged and then cleared, or
reopened) reopens the finding as an ordinary open finding, exactly as if it had never been resolved.

## Example (trimmed, from the fixture project)

```json
{
  "format": "e3-tracking-document",
  "version": 1,
  "generated_at": "2026-09-25T12:00:00.000Z",
  "project": {
    "key": "acme-eu",
    "name": "Acme EU",
    "client": "Acme",
    "bloomreach_project_url": null,
    "money_tolerance": { "percent": 1, "floor": 0.01 }
  },
  "events": [
    {
      "id": "…",
      "name": "cart_update",
      "class": "custom",
      "implementation_method": "client_web",
      "dl_event_name": "cart_update",
      "status": "planned",
      "certification": { "applicable": true, "certified": false, "reasons": ["no_observations"] },
      "properties": [
        { "name": "total_price", "payload_key": "total_price", "data_type": "number", "data_formats": ["money"], "required": false, "role": "normal", "pii": false, "kind": "state_list", "derivation": { "source": "items", "sum": "price*quantity" }, "datalayer_path": "computed from items", "bundle": null }
      ],
      "variants": [
        {
          "id": "…",
          "name": "cart_update[action=add]",
          "conditions": [{ "property_name": "action", "operator": "equals", "values": ["add"] }],
          "standard_event": "cart_update",
          "expected_payload": { "action": "add", "total_price": 123 },
          "required_keys": ["action"],
          "expiration": null
        }
      ],
      "coverage": { "rows": [], "columns": [], "observed_count": 0, "unobserved_count": 0 },
      "rules": [],
      "quality": { "open": { "error": 0, "warning": 0, "info": 0 }, "acknowledged": { "error": 0, "warning": 0, "info": 0 }, "by_comparison": {} },
      "findings": [],
      "codegen": { "gtm": "…", "datalayer": "…", "gtm_template": "…", "web_sdk": "…", "web_sdk_legacy": "…", "tracking_api": "…", "sdk_emits": "", "sdk_default_properties": "", "note": "" },
      "sdk_default_properties": ["os", "browser", "device", "location"]
    }
  ],
  "findings_summary": {
    "open": { "error": 0, "warning": 0, "info": 0 },
    "by_comparison": {}
  },
  "unattached_findings": [],
  "limits": {
    "event_types": { "count": 1, "limit": 255 },
    "max_properties_per_event": [{ "event_id": "…", "event_name": "cart_update", "count": 1, "limit": 255 }]
  }
}
```

A full generated example against the phase 1/2 fixtures (data mapping, expiration settings, both
Data Manager files and the customer events export applied) is guarded by a vitest snapshot test:
`src/backend/services/document.service.snapshot.test.ts` (`__snapshots__/document.service.snapshot.test.ts.snap`).

## Related endpoints

- `GET /api/projects/:projectId/events/:id/card` — one `EventCard`.
- `GET /api/projects/:projectId/events/:id/certification` — just the `certification` block.
- `GET /api/projects/:projectId/events/:id/coverage` — the full coverage grid (row/column/cell
  detail; the tracking document only carries the summary counts).
- `GET /api/projects/:projectId/use-cases/:id/coverage` — per-requirement coverage summary (T-2-11).
