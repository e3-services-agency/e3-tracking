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
- **Use cases** exist as library templates (E3 has about 90 standard ones, to be loaded later) and client instances. Requirements hang off the instance. The requirements matrix is computed, not authored.
- **Identity** rules define when hard and soft IDs are set and when customer properties and events may be sent.
- **Expiration** is a per-event setting (enabled, count, units) with a project default.

### 3.3 Bloomreach formats (fixtures in `samples/`)
The user has a Bloomreach bridge that lets them copy these as JSON. The app must support paste-in import and copy-out export for each, always through a diff, never a silent overwrite.
- Customer events export: `{ customer_id, project, events: [{type, timestamp, properties}] }`.
- Data mapping: `standard_events`, `customer_properties`, `consents`, `catalogs`, with filters and property renames.
- Expiration settings: per event type with optional filter.

### 3.4 QA: three-way comparison
- Definition vs mapping. Mapping vs live events. Definition vs live events.
- Real findings visible in the sample export: numbers as strings (`total_price: "28"`), booleans as strings (`is_new: "TRUE"`), the same property with different shapes across events (`product_ids` array vs string), rounding drift (28.4 vs 28), unmapped standard events, empty catalog block, consent renames (newsletter to brand_consent), property renames (purchase_item total_price to price).
- Expiration windows must be respected when judging missing events.
- Frontend events can additionally be captured live from the client website through the QA overlay in this repo.

### 3.5 Certified data product card (per-event documentation)
Inspired by the "certifikovaný datový produkt" pattern. Each event page renders:
name and business name (synonyms), owner (business and technical), status (draft / in review / certified), grain and trigger, identity, definition of derived metrics (for example revenue = purchase.total_price where purchase_status = success), allowed properties, variants and their standard-event mapping, contexts and coverage, "not suitable for", use cases that depend on it, expiration, freshness (last observation), quality (open findings), and instructions for an agent (which variant to use when, what to ask when ambiguous).
Certified = zero error findings across the three comparisons.

## 4. Required capabilities (gap analysis measures against this list)
1. Project (client) as top-level container with full JSON backup export.
2. Table editing for events, properties, event-property links, customer properties, identity rules, catalogs, consents, use cases, requirements; enums enforced from one definition.
3. Variants with discriminator rules and UI hints; contexts with coverage grid.
4. Import with diff and export for: data mapping, expiration settings, customer events export.
5. Three-way comparison engine producing typed findings.
6. Certified status derived from findings.
7. Per-event documentation card.
8. Computed requirements matrix.
9. CSV export per entity.
10. QA overlay capture of frontend events feeding observations.
11. Use case library (templates) and client instances; library content loaded later.
12. Change history per entity.
13. Client collaboration: share link with read or comment access at minimum.

## 5. Legacy workbook reference
`samples/legacy-workbook-structure.md` lists the sheets and columns of the Datacop x ODO workbook so the model can be checked for coverage. Not a compatibility target.

## 6. Open items
- Exact discriminators per event are a discovery decision per client; the tool must make the choice explicit and visible.
- Client editing workflow (beyond read/comment) is a later phase.
- The 90 standard use cases will be provided by the user when the library import is scheduled.
