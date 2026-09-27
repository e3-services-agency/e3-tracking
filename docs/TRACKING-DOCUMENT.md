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
  properties: [...],         // customer-scope properties
  identity_rules: [...],
  consent_categories: [...],
  catalogs: [...],
  use_cases: [...],          // ordered requirements resolved to display names, plus narrative
  standard_event_mappings: [...],
  findings_summary: { open: {error, warning, info}, by_comparison: {...} },
  limits: { event_types: {count, limit}, max_properties_per_event: [...] },
}
```

## `EventCard`

One entry per non-deleted event (custom events first, D-29/D-36 class). Every field from the plan's
field list is present:

| Field | Notes |
|---|---|
| `name`, `business_name`, `class`, `description`, `purpose`, `page`, `trigger`, `grain`, `identity_note` | Straight from the `Event` row. |
| `owners` | `{business, technical}`. |
| `priority`, `status` | `PRIORITIES`/`EVENT_STATUSES` (`src/domain/enums.ts`). |
| `certification` | `{applicable, certified, reasons[]}` — see below (D-05). |
| `expiration` | `{effective, source: 'event' \| 'project' \| null}` — the event's own expiration, else the project default, else `null`. |
| `properties[]` | Every linked property: `payload_key`, `data_type`, `data_formats`, `required`, `role`, `allowed_values` (with `label`/`standard_event` hints), `item_schema` (D-30, array properties only), a generated `example`, `description`, `pii`. |
| `variants[]` | `id`, `name`, `conditions` (discriminator property names resolved), `standard_event` it maps to (if any), `expected_payload` (a sample JSON payload with the variant's discriminator values as literals), `required_keys` (the `expected_payload` keys that are required, fix round), `expiration` (this variant's own override, or `null` when it follows the event/project value, fix round). |
| `standard_event_mappings[]` | This event's `StandardEventMapping` rows, `field_map` resolved to property names. |
| `contexts[]` | `context`-role properties, their `payload_key` (the key `context_values_json`/the raw observation payload actually carries — may differ from the display name `property`, fix round) and their allowed values (D-03: contexts never create variants). |
| `coverage` | Grid summary: `rows`/`columns` (columns keyed by `payload_key`, matching `GET /events/:id/coverage` and `context_values_json`, fix round) plus `observed_count`/`unobserved_count`. The full cell-level grid is `GET /events/:id/coverage`, not duplicated here. |
| `rules[]` | Guardrail rules (D-30/D-31): `kind`, `message`, `expression_text` (every `property_id` resolved to its name, e.g. `sum(product_list[].price * product_list[].quantity) eq total_price`), `tolerance`, `enabled`, `variant_id`/`variant_name` (`null` for an unconditional event-wide rule; non-null scopes it to one variant's observations only, fix round). |
| `derived_metrics`, `not_suitable_for`, `agent_instructions` | Straight from the `Event` row. |
| `use_cases[]` | `{code, name, level}` for every use case with a requirement touching this event (directly or via a variant); `level` is `R` if any matching requirement is required, else `O`. |
| `freshness` | `{last_observation_at, observation_count}`, live-resolved against current definitions (not the observation's stored `event_id`/`variant_id`, which only refresh on a comparison recompute). |
| `quality` | `{open: {error, warning, info}, by_comparison}` — open `Finding` counts for this event, across every comparison. |
| `findings[]` | Every currently-open `Finding` for this event, across every comparison and severity, **uncapped** (D-40 Q9, fix round): `id`, `comparison`, `kind`, `severity`, `property_id`/`property` (resolved name), `variant_id`/`variant`, `rule` (the originating rule's name, for a `rule_violation`/`bound_violation` finding; `null` otherwise), `message`, `expected`, `actual`, `qa_run_id`, `first_seen`, `last_seen`. |
| `codegen` | `{gtm, web_sdk, tracking_api}` snippets (same generator as the docs export). |
| `sdk_default_properties` | The fixed `SDK_DEFAULT_PROPERTIES` list (`os`, `browser`, `device`, `location`) — attributes the Bloomreach SDK attaches automatically, never flagged as unexpected. |

### Payload keys (ERROR 2 fix round)

Observations and their `context_values_json` column are keyed by **payload key**, not the
property's display name (they can differ when a property's `payload_key` is set). Every coverage
column — `EventCard.coverage.columns[]`, `EventCard.contexts[].payload_key`, `GET /events/:id/
coverage`'s `columns[]`, and `src/domain/coverage.ts`'s `computeEventCoverage` — is keyed the same
way, so a context property with a custom `payload_key` reports the same observed/unobserved counts
everywhere.

### Certification (D-05)

```ts
certification(event) = {
  applicable: event.class === 'custom',
  certified: applicable && status !== 'ignored' && openErrorFindingCount === 0 && hasObservation,
  reasons: string[],
}
```

`reasons` is empty exactly when `certified` is `true`. Possible values, in this order when more
than one applies: `not_applicable` (sdk/platform event — exclusive, no other reason is added),
`status_ignored`, `` `open_errors: n` `` (n = open, error-severity findings for the event across
every comparison), `no_observations` (no observation in a non-archived QA run currently resolves to
this event). Certification is **never stored**; it is recomputed on every request from live findings
and live-resolved observations.

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
      "status": "planned",
      "certification": { "applicable": true, "certified": false, "reasons": ["no_observations"] },
      "properties": [
        { "name": "total_price", "payload_key": "total_price", "data_type": "number", "data_formats": ["money"], "required": false, "role": "normal", "pii": false }
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
      "quality": { "open": { "error": 0, "warning": 0, "info": 0 }, "by_comparison": {} },
      "findings": [],
      "codegen": { "gtm": "…", "web_sdk": "…", "tracking_api": "…" },
      "sdk_default_properties": ["os", "browser", "device", "location"]
    }
  ],
  "findings_summary": {
    "open": { "error": 0, "warning": 0, "info": 0 },
    "by_comparison": {}
  },
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
