# e3-tracking: product context

Written 2026-09-24 from the alignment conversation with Ján Pan (E3 Services). Authoritative for all agents. Update through the supervisor only.

## 1. What the product is
A single in-house web application that runs the whole intake-to-QA process for migrating a client from legacy tools to Bloomreach Engagement. It replaces the current Google Sheet workbook plus the Apps Script "Tracking Engine" library. Scope: intake, use-case to data mapping, per-event documentation, automated QA, and export.

The repo `e3-tracking` is that application. It is deployed and functional today but not in the target shape.

## 2. Non-negotiable decisions
- The app is the only system of record. Google Sheets and Apps Script go away.
- No legacy compatibility. The product is for new clients from now on. The old workbook is a reference for what the model must cover, nothing more.
- Simplified UI during the agent build phase. No visual polish until the model and the import/export paths are right.
- Exports are plain files: CSV per entity, JSON for Bloomreach formats and full project backup.
- Work happens on branch `agent-setup` and task branches. `main` stays untouched until the user merges.
- Development and testing are fully local. The app must run and be testable end to end on the developer machine, with local persistence, before any deployment to remote servers. No task may depend on a remote service to be verified.

## 3. Domain

### 3.1 Process the tool supports
1. List customer properties, events, event properties, event variants, identity rules, catalogs, consents.
2. Define use cases (marketing and transactional) and which data each needs, required or optional.
3. Resolve gaps with the client (missing sources, naming, formats).
4. Implement tracking; the document is the spec for developers.
5. QA rounds: compare what Bloomreach actually receives against the definition until each event is certified.
6. Hand over per-event documentation as the single source of truth.

### 3.2 Entities
See the `domain-model` skill for the compact list. Key points:
- **Event** and **Property** are separate; **EventProperty** links them with required, status, source, and role.
- **Variant** = Event plus conditions on discriminator properties. Example: `cart_update[action=add]`. Bloomreach's own data mapping uses exactly this form (`event.type` plus `filter`), so variants export one to one.
- **Discriminator** properties are enums, highlighted in the UI with allowed values and the standard event each value maps to. Typically one or two per event.
- **Context** properties (location such as product page, listing, minicart, checkout) are enums that never create variants. QA computes a coverage grid of variant x context and reports observed versus unobserved cells. This avoids combinatorial explosion while keeping the high-level overview.
- **Use cases** exist as library templates (E3 has about 90 standard ones, to be loaded later) and client instances. Requirements hang off the instance and are ordered, so the requirement list is also the flow sequence. The requirements matrix is computed, not authored. A use case carries a generated, editable narrative description; no diagram (D-10).
- **Identity** rules define when hard and soft IDs are set and when customer properties and events may be sent.
- **Standard events, catalog columns, and standard consent keys** are seed lists from the Bloomreach mapping sample, extensible per project for industry-specific needs (D-26). Consent categories are client specific and mapped from standard keys exactly as the mapping file does.
- **Property bundles** (existing feature) stay and will seed an event-template feature later (D-26).
- **Expiration** is a per-event setting (enabled, count, units) with a project default.

### 3.3 Bloomreach formats (fixtures in `samples/`)
The user has a Bloomreach bridge that lets them copy these as JSON. The app must support paste-in import and copy-out export for each, always through a diff, never a silent overwrite.
- Customer events export: `{ customer_id, project, events: [{type, timestamp, properties}] }`.
- Data mapping: `standard_events`, `customer_properties`, `consents`, `catalogs`, with filters and property renames.
- Expiration settings: per event type with optional filter.
- Data Manager customers: `{ are_all_used, default_private, default_group: { properties[] }, groups: [{ name, properties[] }] }`; property `{ property, type, description, example_values, private, source user|data, used, deleting, locked_for_contact_migration }`.
- Data Manager events: `{ default_forbidden, default_private, default_group: { events[] }, groups: [{ name, events[] }] }`; event `{ type, description, source, used, forbidden, deleting, real_time_analytics, properties: { are_all_used, default_group: { properties[] }, groups[] } }` with the same property shape minus the lock flag.

### 3.4 QA: three-way comparison
- Definition vs mapping. Mapping vs live events. Definition vs live events.
- Real findings visible in the sample export: numbers as strings (`total_price: "28"`), booleans as strings (`is_new: "TRUE"`), the same property with different shapes across events (`product_ids` array vs string), rounding drift (28.4 vs 28), unmapped standard events, empty catalog block, consent renames (newsletter to brand_consent), property renames (purchase_item total_price to price).
- Expiration windows must be respected when judging missing events.
- Frontend observations come from an AI agent that browses the client website using the exported tracking document, reads what the site sends to the dataLayer or Bloomreach SDK, and submits observations through the app's MCP server (D-11). Bloomreach exports pasted by the user land in the same observation table, so both sources feed one comparison.
- A QA round: agent reads definitions via MCP, navigates use case flows, submits observations with page URL and context values, requests the comparison, and writes the narrative audit from the typed findings the app returns.

### 3.5 Certified data product card (per-event documentation)
Inspired by the "certifikovaný datový produkt" pattern. Each event page renders:
name and business name (synonyms), owner (business and technical), status (draft / in review / certified), grain and trigger, identity, definition of derived metrics (for example revenue = purchase.total_price where purchase_status = success), allowed properties, variants and their standard-event mapping, contexts and coverage, "not suitable for", use cases that depend on it, expiration, freshness (last observation), quality (open findings), and instructions for an agent (which variant to use when, what to ask when ambiguous).
Certified = zero error findings across the three comparisons.

## 4. Required capabilities (gap analysis measures against this list)
1. Client (Bloomreach account, e.g. a mother company) containing Projects (one per Bloomreach project or brand). Project is the unit of work with full JSON backup export. Copy of definitions between sibling projects with provenance and a drift compare view (D-27, phase 3).
2. Table editing for events, properties, event-property links, customer properties, identity rules, catalogs, consents, use cases, requirements; enums enforced from one definition.
3. Variants with discriminator rules and UI hints; contexts with coverage grid.
4. Import with diff and export for: data mapping, expiration settings, customer events export.
5. Three-way comparison engine producing typed findings.
6. Certified status derived from findings.
7. Per-event documentation card.
8. Computed requirements matrix.
9. CSV export per entity.
10. MCP server exposing definitions, observations, and the comparison engine to AI agents (D-11). Read tools for events, variants, discriminators, contexts, required properties, event cards, use cases with requirements, expected payload shapes, open findings. Write tools for observations, single or batch. Compute tools for the three-way comparison and coverage grid. Local-first over stdio.
11. Use case library (templates) and client instances; library content loaded later.
12. Change history per entity.
13. Client collaboration: share link with read or comment access at minimum, project wide.
14. Machine-readable JSON export of the whole tracking document for agent consumption, alongside the human documentation (D-11).
15. Bloomreach Data Manager customer and event definitions: import with diff and byte-equivalent export in the bridge shape, plus a definition-vs-Data-Manager comparison that participates in certification (D-28). Fixtures `samples/data-manager-customers.json` and `samples/data-manager-events.json`.

Out of scope by decision: the journey canvas, journey-scoped QA runs, the manual QA overlay injection, any sequence or flow diagram view (D-10). The app never scrapes client websites itself (D-11).

## 5. Legacy workbook reference
`samples/legacy-workbook-structure.md` lists the sheets and columns of the Datacop x ODO workbook so the model can be checked for coverage. Not a compatibility target.

## 6. Open items
- Exact discriminators per event are a discovery decision per client; the tool must make the choice explicit and visible.
- Client editing workflow (beyond read/comment) is a later phase.
- The 90 standard use cases will be provided by the user when the library import is scheduled.
