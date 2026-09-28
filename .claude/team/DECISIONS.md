# Decision records

Format in the `refactor-plan` skill. Never delete; supersede.

## D-01 In-house app is the single system of record
Date: 2026-09-24  Status: accepted
Context: The current workflow splits the tracking document between a Google Sheet, an Apps Script library, and this app. Multiple sources of truth made QA and documentation inconsistent.
Decision: The e3-tracking app holds all data. Google Sheets and Apps Script are retired. Exports are CSV and JSON files.
Consequences: The app must provide table editing, history, and client collaboration itself. Sheet import is at most a one-off migration tool, not a feature.

## D-02 No legacy compatibility
Date: 2026-09-24  Status: accepted
Context: The product will be used for new clients going forward; existing workbooks are not migrated as a requirement.
Decision: No compatibility with the old workbook, connector, or library is maintained. The old workbook serves only as a coverage reference.
Consequences: Agents may remove Sheet-era code freely once the audit confirms what depends on it.

## D-03 Variants are event plus discriminator conditions
Date: 2026-09-24  Status: accepted
Context: Use cases depend on event variants such as cart_update with action=add or purchase with purchase_status=success. Modelling every combination of variant and location explodes.
Decision: A variant is an event plus conditions over one or two discriminator properties, which are enums. Location-like dimensions are context enums that feed a computed coverage grid and never create variants. This matches Bloomreach's data-mapping filter format exactly.
Consequences: Discriminators must be flagged and highlighted in the UI. Export to Bloomreach mapping is one to one. Coverage is reported, not authored.

## D-04 Bloomreach JSON formats are first-class import and export with diff
Date: 2026-09-24  Status: accepted
Context: The user copies customer events exports, data mapping, and expiration settings as JSON via a Bloomreach bridge.
Decision: Each format has paste-in import producing a diff that must be confirmed, and copy-out export. No silent overwrite.
Consequences: The diff engine is shared with the QA comparison engine.

## D-05 Certified status is derived, not set
Date: 2026-09-24  Status: accepted
Context: The certified data product pattern requires an objective certification rule.
Decision: An event is certified when the three comparisons (definition vs mapping, mapping vs observations, definition vs observations) yield zero error findings for it.
Consequences: Status cannot be edited by hand; it changes when definitions, mapping, or observations change.

## D-06 Use cases are templates plus client instances
Date: 2026-09-24  Status: accepted
Context: E3 deploys about 90 standard use cases; the library will be loaded later.
Decision: Model UseCaseTemplate and UseCase (instance) from the start. Requirements hang off instances. Library content is out of scope until the user provides it.
Consequences: Loading the library later is an import, not a refactor.

## D-07 Simplified UI during the agent build phase
Date: 2026-09-24  Status: accepted
Context: Agents work best against plain, predictable, testable UI; polish is wasted while the model is moving.
Decision: Plain tables and forms only until the user lifts this. No design work in tasks unless explicitly requested.
Consequences: qa-tester verifies behaviour, not appearance.

## D-08 Branching and commits
Date: 2026-09-24  Status: accepted
Context: The deployed product on `main` must stay untouched and easy to revert to.
Decision: All work on `agent-setup` and `task/<id>-<slug>` branches. Commits only when the user asks. No merge to `main` without the user.
Consequences: Reverting the whole effort is deleting branches.

## D-09 Local-first development and testing
Date: 2026-09-24  Status: accepted
Context: The current product is deployed remotely. The rebuild must be usable and verifiable before anything touches a remote environment.
Decision: Every phase runs and is QA-tested entirely on the local machine, including persistence. Remote deployment is a separate, later step approved by the user.
Consequences: The audit must report what the app needs from remote services today. The plan must provide a local persistence and run story in phase 1. qa-tester runs against localhost only.

## D-10 Journeys are deprecated; use cases replace them
Date: 2026-09-24  Status: accepted
Context: The audit found the React Flow journey canvas to be the most developed feature, but the user reports it was not used in the MVP. The shared documentation view proved sufficient, and a journey is conceptually a use case. No read-only sequence view is wanted either; the ordered requirement list in the use case document is the sequence.
Decision: Remove the journey canvas, journey-scoped QA runs, and the manual QA overlay injection. The Journey entity does not survive; UseCase with ordered Requirements takes its place. Reuse the documentation rendering pipeline, codegen snippets, and share-link mechanism, extended from journey scope to project scope. The narrative flow description is generated text stored on the use case, editable and regenerable. No data migration from existing journeys (D-02).
Consequences: Removal happens in the same phase that introduces use cases, so the app never loses its documentation output in between. Any "journeys only" limitation in the audit becomes "project wide" in the plan.

## D-11 QA capture is agent-driven through an MCP server exposed by the app
Date: 2026-09-24  Status: accepted
Context: Manual QA was the heaviest part of the MVP. The user wants an AI agent to browse the client website with the exported tracking document and generate the audit against guardrails, inside the existing Claude agent-to-agent setup.
Decision: The app never scrapes websites itself. It exposes an MCP server (local-first over stdio, optionally HTTP later) with read tools (events, variants, discriminators, contexts, required properties, event cards, use cases with requirements, expected payload shapes, open findings), write tools (submit observations singly or as a Bloomreach export batch), and compute tools (run the three-way comparison, get the coverage grid). An agent such as Claude in Chrome navigates the site, reads what is sent to the dataLayer or Bloomreach SDK, submits observations, and requests the comparison. The app produces typed findings; the agent writes the narrative audit.
Consequences: Capability 10 is rewritten as "MCP server exposing definitions, observations, and comparison". Capability 14 is added: a machine-readable JSON export of the tracking document for agent consumption. The comparison engine, Observation, and Finding are shared between the export path and the MCP path. Whether the MCP server lives in the Express backend or as a separate process sharing the local database is the architect's call.

## D-12 SQLite via better-sqlite3 is the local persistence engine; the DAL is the swap boundary
Date: 2026-09-24  Status: accepted
Context: D-09 requires local persistence. `better-sqlite3` is already declared and its prebuilt binary is present for Node 22.19 on the developer machine. The alternative was a JSON-file store. The MCP server (D-11, D-19) must share the data with the web app from a second process.
Decision: SQLite through `better-sqlite3`, file `./data/e3-tracking.sqlite` (gitignored), WAL mode, foreign keys on, busy timeout. Schema is fresh (no Supabase migration reuse) and applied by ordered SQL files in `src/backend/db/migrations/` at startup. DAL modules keep their `(projectId, ...)` function shape and get the connection from `src/backend/db/index.ts`; nothing above the DAL knows SQLite. Tests run the DAL on `:memory:`. Node's built-in `node:sqlite` is the fallback if the native module ever fails to load.
Consequences: Atomic import apply and constraint enforcement (unique names, max two discriminators) come from the database. `tsup` must externalise `better-sqlite3`. The later remote step is a Postgres implementation of the same DAL functions, not a rewrite. A JSON-file store is ruled out (no constraints, no safe multi-process access).

## D-13 Local single-user auth mode; Supabase removed from the codebase
Date: 2026-09-24  Status: accepted
Context: Login, session and the workspace list depend on Supabase Auth in four frontend files and one backend middleware. D-09 forbids remote dependencies for verification.
Decision: `AUTH_MODE=local` (default) makes the backend treat every request as user `local-user` (name from `E3_LOCAL_USER_NAME`) with admin rights on all projects; the frontend `AuthProvider` keeps its `useAuth()` shape with a local provider, `/login` redirects to the app, and the project list comes from the API. `@supabase/supabase-js` and `src/lib/supabase.ts` are removed. The auth middleware keeps a provider switch for a future remote provider.
Consequences: No accounts or roles are testable locally; `project_members` stays in the schema for later. Change history and QA runs record the local user name. Remote auth is designed in phase 5, not now.

## D-14 Uploaded files live on the local filesystem behind a FileStore interface
Date: 2026-09-24  Status: accepted
Context: Event trigger screenshots and the client logo were uploaded to Supabase Storage and referenced by public URLs.
Decision: `FileStore` interface with a local implementation under `./data/files/<projectId>/<kind>/`, served by Express at `/api/projects/:id/files/*` (and by share token in phase 4). Entities store the relative path, not a URL.
Consequences: Exports embed images by reading the local file. Remote storage later is another `FileStore` implementation.

## D-15 Workspace becomes Project; workspace_settings folds into projects
Date: 2026-09-24  Status: accepted
Context: CONTEXT.md names the top-level container Project. The schema is being rewritten anyway (D-12), and the `x-workspace-id` header plus `requireWorkspace` middleware are replaced during the DAL rewrite.
Decision: Table `projects` with settings columns folded in, routes under `/api/projects/:projectId/...`, URL prefix `/p/<key>`, frontend shell files and labels renamed to Project in the same task (T-1-02).
Consequences: One name for one concept across schema, API, UI and MCP. No compatibility shim for the old header.

## D-16 Enums live once on Property.allowed_values; per-event definition overrides and presence are dropped
Date: 2026-09-24  Status: accepted
Context: The current model has per-event `event_property_definitions.enum_values` and no global enum list, plus `presence always_sent|sometimes_sent` alongside a nullable `required` override. Discriminators and contexts (D-03) need one shared value list per property for variant conditions, Bloomreach filters and the coverage grid.
Decision: `Property.allowed_values_json` `[{value, label?, description?, standard_event?}]` is the single enum definition. `event_property_definitions` is removed; per-event fields (`required`, `role`, `payload_key`, `source_id`, `description_override`, `example_values_override_json`, priority, status, order) live on the `EventProperty` link. Presence is dropped; `required=false` means optional in codegen and QA.
Consequences: A property cannot have different enums on different events; if a client needs that, it is two properties. Codegen and docs read `required` instead of presence. Discriminator hints (which standard event a value maps to) are visible wherever the property appears.

## D-17 The old EventVariant (overrides bag) is deleted outright in the task that introduces the new Variant
Date: 2026-09-24  Status: accepted
Context: `EventVariantRow.overrides_json` is a named scenario with property overrides, incompatible with D-03. The audit warned against two "Variant" concepts coexisting.
Decision: T-1-05 deletes `event-variant.dal.ts`, the variant UI sections, `codegenRequiredness.ts`, `mergeVariantEffectiveIntoAttachedProperties.ts`, `eventPropertyOverrideSemantics.ts` and the variant paths of `effectiveEventSchema.ts`, and introduces `Variant` (ordered conditions over discriminator properties, max two, operator `equals|in`, generated name) plus `StandardEventMapping` (standard event to event or variant with field map). No data migration (D-02).
Consequences: Bloomreach mappings with an empty filter (`checkout`, `view_item`) are rows with `variant_id = null`, so no "empty variant" is needed. The name `Variant` has exactly one meaning in the codebase from T-1-05 on.

## D-18 Journeys, QA overlay, legacy store, metrics and CSV-from-store are removed in phase 1 with a minimal project-scope documentation export kept alive
Date: 2026-09-24  Status: accepted
Context: D-10 requires removal in the same phase that introduces use cases and forbids losing documentation output in between. Porting the journey DAL to SQLite only to delete it would be waste. `src/store.tsx` is dead for data but live for UI state (active project, selected item). `metrics` is not a required capability. `Settings.tsx` CSV import/export runs against the empty store.
Decision: T-1-03 deletes journeys (pages, canvas, routes, DAL, QA runs, `qaOverlayInjection.ts`, `@xyflow/react`), metrics, the legacy store's data model (`mainData`, branches, `useActiveData`), the Settings CSV import/export, and the handoff/audit usages, and ships `GET /export/documentation.html` at project scope reusing the property table and codegen helpers from `export.service.ts`. `shared.ts` stays as a stub. Property bundles are kept pending open question 6.
Consequences: Documentation output exists at every point of phase 1. `store.tsx` shrinks to UI state. Per-entity CSV is rebuilt server-side in phase 3.

## D-19 The MCP server is a sibling stdio process sharing the SQLite file
Date: 2026-09-24  Status: accepted
Context: D-11 leaves the hosting of the MCP server to the architect. Options were inside the Express process or a separate process.
Decision: `src/mcp/server.ts`, started by `npm run mcp` over stdio, imports the same DAL and service modules and opens the same SQLite file (WAL). Registered in a repo-root `.mcp.json`. Tool implementations are transport-agnostic so an HTTP transport can be mounted on Express later.
Consequences: Claude Code and Claude in Chrome launch it as a child process with no auth layer locally; it works even when the web app is not running; stdout stays clean for the protocol. Concurrent writes rely on SQLite locking with a busy timeout.

## D-20 vitest is the test runner; parsers and the comparison engine are fixture-tested from phase 1
Date: 2026-09-24  Status: accepted
Context: No test runner exists. The stack is Vite and TypeScript ESM.
Decision: `vitest`, `npm test` = `vitest run`, tests co-located as `*.test.ts`. Mandatory from phase 1: round-trip tests for the three Bloomreach formats (import fixture, export, deep-equal), DiffItem assertions for the mapping and expiration previews, engine tests reproducing the qa-roundtrip findings, DAL tests on `:memory:` SQLite.
Consequences: Every handoff reports the vitest summary line. Pure-function design of `src/domain/*` is required so tests need no server.

## D-21 Finding lifecycle, extra finding kinds, severity table and certification rule
Date: 2026-09-24  Status: accepted
Context: D-05 says certified is derived from zero error findings; the skill lists twelve kinds but the fixture also shows undefined event types, never-observed events and an empty catalog block. Findings must not accumulate duplicates across runs, and hand-editing status would defeat D-05.
Decision: Three kinds are added: `missing_event`, `unexpected_event`, `unmapped_catalog`. Findings carry a `fingerprint` (comparison, kind, event, variant, property, detail); `runComparison` recomputes over all non-archived QA runs, upserts by fingerprint and resolves findings no longer produced. No mute status. Severities: error for `missing_required`, `type_mismatch`, `enum_violation`, `unknown_variant` (definition side), `shape_inconsistent`, `missing_event` in agent sessions; warning for `format_violation`, `rounding_drift`, `rename_mismatch`, `unmapped_property`, `unmapped_standard_event`, `unmapped_catalog`, `expiration_mismatch` (mapping side), `missing_event` in export pastes, `unknown_variant` (mapping side); info for `unexpected_property`, `unexpected_event`, `expiration_mismatch` (observation side). `certified = status != ignored AND zero open error findings for the event AND at least one observation in a non-archived run`. Expiration suppresses `missing_event` when the newest observation in scope is older than the event's effective window. The `rounding_drift` rule is anchored on the standard-event mapping of `purchase` and `purchase_item` (sum of item price times quantity per `purchase_id` versus purchase total, tolerance 0.01) so it is generic across clients.
Consequences: Clearing a finding means fixing definitions, mapping or tracking, or archiving a stale run. Certification is recomputed on read, never stored. The skill's finding list is extended (documented deviation).

## D-22 Bloomreach imports are stateless preview then apply, sharing diff primitives with the comparison engine
Date: 2026-09-24  Status: accepted
Context: D-04 demands a confirmed diff and states the diff engine is shared with QA comparison.
Decision: `POST /import/<format>/preview` returns `DiffItem[]`, warnings and a payload hash; `POST /import/<format>/apply` resends the raw JSON, the hash and the selected item ids, re-runs the preview, rejects on hash mismatch (409) and applies in one transaction. `src/domain/diff/` primitives produce `Difference[]`; the import planner maps them to `DiffItem[]`, the comparison engine maps them to `Finding[]`. The customer-events export "diff" is an import preview (counts, resolution, unknown types, duplicates) followed by an automatic comparison run.
Consequences: Nothing is persisted between preview and apply; no pending-import table. A pasted mapping can be compared without being applied (preview warnings are definition-vs-mapping findings).

## D-23 One command runs the whole app locally: API on 3001 with tsx watch, Vite on 3000 with a proxy
Date: 2026-09-24  Status: accepted
Context: No backend start script exists; the README says to run "a separate Express server" without saying how. qa-tester needs a single, documented start.
Decision: `src/backend/server.ts`; `npm run dev` runs `dev:api` (`tsx watch`) and `dev:web` (Vite) via `concurrently`; Vite proxies `/api` and `/tracking-plan/api` to 3001; base path `/tracking-plan/` stays; `.env.example` lists the local variables; `data/` holds the database and files.
Consequences: `VITE_API_BASE_URL` is unnecessary locally. Vercel-specific files (`api/index.ts`, `vercel.json`) are left untouched until phase 5.

## D-24 Customer properties are Property rows with scope customer
Date: 2026-09-24  Status: accepted
Context: The skill lists CustomerProperty as its own entity ("like Property, plus identifier flags and Bloomreach mapping"). The differences are two columns.
Decision: One `properties` table with `scope event|customer`; customer rows may set `bloomreach_customer_property` (standard key). Identity is modelled by `IdentityRule`, not by flags on the property.
Consequences: One editor, one CSV, one enum module for both kinds; Requirement `target_kind customer_property` points at a Property with scope customer.

## D-28 Bloomreach Data Manager customer and event definitions are first-class import and export
Date: 2026-09-25  Status: accepted
Context: The user's Bloomreach bridge exports and imports the Data Manager definitions of customer properties and events in a fixed JSON shape (fixtures `data-manager-customers.json`, 101 properties in a default group plus named groups, and `data-manager-events.json`, 61 event definitions each with its own property list, plus group and per-entity flags). The bridge expects the same shape back. These files also state the type Bloomreach currently holds per property, which is where migration defects show (purchase total_price string from data, number when user defined).
Decision: Two new formats join D-04: Data Manager customers and Data Manager events, with paste-in preview and apply through the shared diff, and export reproducing the input shape. Mapping: groups to property category; description, example_values, private to description, example values, PII; Bloomreach types (string, number, boolean, date, datetime, list, long text, url) to data type plus data format; event-level and property-level flags the app has no concept of (source, used, deleting, forbidden, real_time_analytics, locked_for_contact_migration, are_all_used, default_private, default_forbidden) are stored per entity in a Bloomreach metadata JSON column and written back untouched so exports round-trip. A fourth comparison, definition vs Data Manager, reports type and presence differences as findings (kinds type_mismatch and unmapped_property with a data_manager comparison id) and participates in certification like the other three.
Consequences: Capability 15 added to CONTEXT.md. Phase 2 starts with these two formats before comparisons 1 and 2, because the comparison engine and the tracking document consume them. Unknown event types in the Data Manager file are proposed as system events when they match the known system list, otherwise as custom events, both selectable in the preview.

## D-29 Custom events are the focus; SDK and platform events are informational
Date: 2026-09-25  Status: accepted
Context: Bloomreach projects contain three classes of events. Custom events are defined and implemented by the client and are what a migration is about, transactional data first (purchase, purchase_item, return, payment, shipping), then behavioural (checkout, cart_update, view_item, sometimes view_category), depth varying by client and industry. SDK-generated events (session_start, session_end, first_session, page_visit) and platform events (campaign, survey, consent, banner, experiment, merge, notification_state and the rest) are produced by Bloomreach; the client cannot change them and rarely cares.
Decision: Event gains a class `custom | sdk | platform` (replacing the binary custom|system type). The comparison engine validates custom events only; sdk and platform events never produce findings, and the phase 1 suppression of unexpected_event for known system types stays as is. Data Manager import proposes sdk and platform events deselected by default. Expiration settings continue to cover sdk events. The system events reference in samples/ is background for agents, not a build item. Templates and priority defaults lean transactional first.
Consequences: Phase 2 seed item 7 is reduced to the class field, the default deselection on import, and keeping the known system type list current; no seed attribute lists or system event validation. campaign.status stays documented but is not modelled.

## D-30 Declarative validation rules on events and variants
Date: 2026-09-25  Status: accepted
Context: Phase 1 validates per property (required, type, format, enum, unexpected, cross-event shape) and has one hard-coded arithmetic rule (purchase vs purchase_item). It does not look inside list properties, has no intra-event arithmetic, no membership checks, no plausibility bounds, and no variant-scoped constraints. User examples: cart_update must carry the full product_list with the added or removed item present in it and totals matching; refund purchases must carry negative amounts or lifetime value is corrupted.
Decision:
- List properties may declare an item schema (field name, type, format, required) validated per item.
- Rules attach to an event or to a variant. Rule types: arithmetic (`sum`, `count`, `min`, `max` over a list field or property, compared with `==`, `<`, `<=`, `>`, `>=` to a property or constant, with tolerance), membership (`property in list[].field`), bound (property `<`, `<=`, `>`, `>=` constant; non-empty; not in the future), and cross-event (join on a property such as purchase_id, aggregate on the child event, compare to the parent property). The existing purchase vs purchase_item rule becomes the first cross-event rule instance.
- Conditional requirements use the variant mechanism only: a required property or a rule belongs to a variant such as purchase[purchase_status=refunded]; discriminators are added where needed (e.g. has_voucher). No separate condition language.
- Money tolerance is per project: percentage (default 1 percent) with an absolute floor (default 0.01 in the purchase currency); applies to every money arithmetic rule.
- Format `e164_phone` added: starts with `+` or `00`, then digits only, 8 to 15 digits total.
- Rules render on the event card as guardrails and are returned by the MCP expected-payload tool.
Consequences: New finding kinds `rule_violation` (error), `item_schema_violation` (error), `bound_violation` (error). Phase 2 seed gains the rules layer ahead of the MCP server. Seed rules shipped for cart_update (item in product_list, total_price and total_quantity sums) and purchase refunds (negative amounts) as templates the user can apply.

## D-40 Supervisor rulings on the phase 2 plan's routine open questions
Date: 2026-09-25  Status: accepted (user may override)
Context: PLAN-PHASE2-2026-09-25 listed nine open questions. Seven have a conventional default; questions 3 (export passthrough semantics) and 8 (narrative language) go to the user.
Decision:
- Q1 Comparison 4 expectations follow the fixture; qa-roundtrip scenario 8 corrected (purchase.total_price is number and user-defined; the string findings are on purchase_item, cart_update, checkout, view_item).
- Q2 App-born entities export with Bloomreach defaults: source user, used false, deleting false, private from the PII flag, real_time_analytics true, forbidden false, locked_for_contact_migration false.
- Q4 Every rule carries a severity (error default, warning allowed); bound rules may report as warning.
- Q5 Rename bloomreach_field to identifier_name (no legacy compatibility, D-02).
- Q6 Add @modelcontextprotocol/sdk and zod as dependencies; tools accept an optional agent_name recorded on the QA run.
- Q7 Data Manager names not in the sdk or platform lists default to class custom.
- Q9 The tracking document carries the findings summary per event plus the list of open findings of every severity, uncapped; agents need the detail.
Consequences: enums.ts gains rule severity; export defaults live in the type mapping module; identity rule column renamed by migration 0013.

## D-41 Data Manager export precedence and cross-event type conflicts
Date: 2026-09-25  Status: accepted
Context: The Data Manager events fixture has the same property name with different types across events (total_price number on purchase, string on cart_update). D-35 byte-equivalence and D-28 "export pushes the definition back" cannot both hold when the shared Property has one type. The T-2-03 review found the planner proposing selected update items for these conflicts, rewriting definitions on every apply.
Decision: Cross-event type conflicts never produce update items; the Property is created once from the first source=user occurrence (else the first occurrence) and every other occurrence is one warning per property, kept in link meta as comparison 4 evidence (D-35). On export, a link emits its stored verbatim Data Manager values (type, private, description, example values) only while the Property still equals what the import wrote (type and PII unchanged since the link meta was stored); once the user edits the Property in the app, the export emits the reverse-mapped definition and PII for every link of that Property. Snapshot passthrough of never-imported events stays as in D-35.
Consequences: Untouched projects round-trip byte-equivalent; edited definitions are pushed back to Bloomreach on export; the planner emits no update item whose changes are empty; properties are created only for events that are selected.

## D-25 Supervisor rulings on the plan's routine open questions
Date: 2026-09-24  Status: accepted (user may override)
Context: PLAN-2026-09-24 listed 13 open questions. Nine have a conventional default consistent with CONTEXT.md and the legacy workbook; the supervisor settled them so implementation is not blocked. Questions 3, 6, 11, 13 go to the user.
Decision:
- Q1 Priority enum is `critical | high | medium | low`, matching the legacy Dropdowns sheet and the Events master list.
- Q2 Event manual status is `planned | in_review | implemented | ignored`, matching legacy TRACKING STATUS with `code review` renamed to `in_review`. `implemented` stays as the developer's claim; `certified` is the derived, verified state shown on top.
- Q4 `missing_event` is error in agent sessions and warning in pasted customer exports.
- Q5 Unknown observed types are `unexpected_event` (info). `src/domain/bloomreach.ts` carries a list of known Bloomreach system event types (campaign, consent, survey, support_ticket, managed_endpoint, session_start, session_end, page_visit, web_exit, notification_state, first_session, banner, experiment, and similar) for which the finding is suppressed. "Create as system event" is a phase 2 UI action.
- Q7 Every MCP tool takes `project_key`, with `E3_PROJECT_KEY` in `.mcp.json` as the default.
- Q8 Local user name defaults to git `user.name`, then "Local user"; `E3_LOCAL_USER_NAME` overrides.
- Q9 The supervisor provides `.claude/launch.json` with entry `e3-tracking` running `npm run dev` on port 3000. T-1-10 records it in `docs/QA-LOCAL.md`; `qa-tester.md` is updated to name it.
- Q10 Certification requires at least one observation of the event in a non-archived run. Mapped but never observed events cannot certify.
- Q12 Rounding-drift tolerance is 0.01 in the purchase currency; monetary properties carry data format `money`.
Consequences: `src/domain/enums.ts` implements these values. The four remaining questions are asked of the user in the plan approval message.

## D-26 User answers to plan questions 3, 6, 11, 13
Date: 2026-09-24  Status: accepted
Context: Four plan questions needed the user's Bloomreach and business knowledge.
Decision:
- Standard events and catalog columns are extensible per project. The twelve keys and the `main_columns` list from `data-mapping.json` are a seed in `src/domain/bloomreach.ts`; a project can add standard event keys with field lists (industry specific, e.g. travel). Import and export accept keys outside the seed and carry them through.
- Property bundles are kept. They are the seed for a later event-template feature (create an event from a bundle, register a bundle from an event). Not built in phases 1 to 3; nothing may remove or block it.
- Consents follow the Bloomreach mapping shape: standard consent keys are a seed list, each project defines its own client categories and maps each standard key to one, as `consents: {newsletter: "brand_consent"}` does. Standard consent keys are extensible per project like standard events.
- Journey data in the deployed Supabase project is not exported or migrated; the code is removed on the new branch.
Consequences: `bloomreach.ts` exposes seed lists, not closed enums; `StandardEventMapping.standard_event` and `ConsentCategory.standard_key` are free strings validated against seed plus project additions. Plan approval (T-0-04) is complete.

## D-27 Client above Project; cross-brand sharing is copy with provenance
Date: 2026-09-24  Status: accepted
Context: A Bloomreach account holds several projects (a mother company with brands A, B, C). The plan had Project as the top level with nothing above it. The schema is written fresh in T-1-01, so adding a level now is cheap and later is expensive.
Decision: New entity `Client` (name, key, `bloomreach_account_id`, notes). `Project` belongs to exactly one Client and gains `bloomreach_project_token`, `bloomreach_api_base_url`, `bloomreach_project_url`. Definitions, mappings, observations, findings and certification stay project-scoped because each brand has its own Bloomreach project. The project switcher groups by client; MCP `list_projects` returns projects grouped by client. Sharing across brands is copy with provenance: in phase 3, definitions can be copied from a sibling project (each copy records `origin_project_id` and `origin_entity_id`) and a drift compare view shows differences between projects. No inheritance or override chains. The name Client was chosen over Account to avoid collision with user accounts (project_members, local user, future remote auth); the Bloomreach link is explicit through `bloomreach_account_id`.
Consequences: T-1-01 adds the `clients` table and the project columns; T-1-02 adds `/api/clients` CRUD and groups the switcher. Frontend URL stays `/p/<projectKey>`. Copy and compare join the phase 3 scope next to the use case library import.

## D-31 Rules are typed JSON expressions evaluated through an operator registry
Date: 2026-09-25  Status: accepted
Context: D-30 introduces arithmetic, membership, bound and cross-event rules. They must be authored in a plain form, validated on write, rendered on the event card, returned by MCP, and extended later with new operators without touching the engine. Options were a string DSL with a parser, free-form JavaScript, or structured JSON parts.
Decision: `Rule.expression_json` holds typed parts (`Operand` refs `property | list_field | constant | product | aggregate`, and per-kind shapes `Arithmetic`, `Membership`, `Bound`, `CrossEvent`). Aggregates, comparators and bound checks live in `src/domain/rules/operators.ts` as registries keyed by the enums in `enums.ts`; `evaluate.ts` walks expressions and never names an operator. Tolerance is a rule field (`none | money | absolute | percent`), with `money` resolved from the project percent and floor. `report_kind` defaults from the kind and may be `rounding_drift` only for a money cross-event rule, which preserves the phase 1 scenario 4 finding. `version` increments on edit and is part of the finding fingerprint. The hard-coded `computeRoundingDrift` is deleted; the `purchase_items_total` template is proposed by the data-mapping import when both mappings resolve, and the engine test instantiates it.
Consequences: Adding an operator touches `enums.ts`, `operators.ts` and one test (acceptance criterion in T-2-06). No string parsing, no eval. Rules are limited to what the grammar expresses; anything else is a new part type, recorded by a decision. Existing local databases are not migrated: dev data is disposable and the template re-proposes the rule.

## D-32 Use case narratives are generated locally from templates, no LLM dependency
Date: 2026-09-25  Status: accepted
Context: D-10 requires a generated, editable narrative per use case. An LLM would give richer prose but adds a remote dependency (against D-09), non-deterministic tests and a cost per regeneration for text that is mostly structural.
Decision: `src/domain/narrative/useCaseNarrative.ts` is a pure, deterministic English template (intro, numbered flow from requirement order, customer data, gaps, guardrails). `narrative_edited_at` records manual edits; regenerating over a newer edit requires `force`. An LLM generator is not built; if wanted later it is a second implementation of the same signature behind `E3_NARRATIVE_MODE`.
Consequences: Narratives are testable by snapshot and identical across machines. Language is English until a project-level language setting is requested (open question 8).

## D-33 MCP server uses the official TypeScript SDK over stdio with zod schemas, tools as plain functions
Date: 2026-09-25  Status: accepted
Context: D-19 fixed the sibling stdio process; the SDK, schema library and handler shape were open. Only `src/backend/server.ts` writes to stdout today, so the DAL is safe to import in a stdio process.
Decision: `@modelcontextprotocol/sdk` (`McpServer`, `StdioServerTransport`) with `zod` input schemas. Handlers in `src/mcp/tools/*.ts` are plain async functions returning JSON-serialisable data; `server.ts` only registers them. All MCP logging goes to stderr through `src/mcp/log.ts`; a test guards that `src/mcp` and `src/backend/db` never write to `process.stdout`. `.mcp.json` at the repo root, `npm run mcp` via tsx, `E3_PROJECT_KEY` default per D-25 Q7, `agent_name` parameter for QaRun actor.
Consequences: Two new dependencies. Handlers are unit-tested against `:memory:` without a transport and can be mounted on Express over HTTP in phase 5. The MCP process is not bundled by tsup in phase 2.

## D-34 Tracking document schema is versioned by an integer, additive within a version
Date: 2026-09-25  Status: accepted
Context: Capability 14 exposes a machine-readable document that agents and prompts will depend on; silent shape changes would break them.
Decision: `{format: 'e3-tracking-document', version: 1}`. The TypeScript type `TrackingDocumentV1` in `src/domain/document/trackingDocument.ts` is the contract; `docs/TRACKING-DOCUMENT.md` documents it with a fixture-generated example; a vitest snapshot guards it. Adding fields never bumps the version; renaming or removing a field bumps it and the previous version stays available for one phase behind `?version=`. `EventCard` is the shared unit for the card page, HTML export, tracking document and MCP `get_event_card`.
Consequences: One builder (`document.service.ts`) feeds every consumer. Breaking changes are visible in the snapshot test and the decision log.

## D-35 Data Manager events merge by name; `source` decides whether a type is a proposal or evidence; deselected events pass through on export
Date: 2026-09-25  Status: accepted
Context: The Data Manager events file lists 61 definitions, six of which already exist from the data-mapping fixture and five from expiration settings. Each property carries `source: user` (defined by a person in Bloomreach) or `source: data` (inferred from incoming data). D-29 deselects sdk and platform events by default, yet the bridge expects the whole file back byte-equivalent.
Decision: Events match existing rows by `name = type` and become `update` items (category, description when empty, new links); class is never changed by import. Property type from a `source: user` row is proposed as a definition update (selected); a type from a `source: data` row is never proposed, it is stored as `dm_type` in the link meta and reported by comparison 4. The same name with different types across events creates the Property once (first `user` occurrence, else first) and warns once. The last applied payloads are stored verbatim on the project (`data_manager_events_json`, `data_manager_customers_json`) as the comparison 4 snapshot. Export emits every Event row plus a passthrough of snapshot events with neither a live nor a soft-deleted Event row, so deselected sdk/platform events round-trip; an event deleted in the app is dropped. Per-event-property flags live in `event_properties.bloomreach_meta_json`; `Event.category` mirrors `Property.category` for groups.
Consequences: Byte equivalence (sorted-key serialisation) holds on the fixture after a default-selection import. `pii` is per Property while Data Manager `private` is per event property; import ORs, export writes the Property value (documented lossy corner). The snapshot makes comparison 4 independent of what the user selected.

## D-36 Event class migration: add `class`, map `system` rows by list, drop `event_type`
Date: 2026-09-25  Status: accepted
Context: D-29 replaces `event_type custom|system` with `class custom|sdk|platform`. Existing local databases hold `system` rows created by the expiration import (`session_start`, `consent`, ...). D-02 forbids compatibility shims.
Decision: Migration 0009 adds `events.class NOT NULL DEFAULT 'custom'`, sets `sdk` for `system` rows whose name is in `SDK_EVENT_TYPES`, `platform` for the rest of the `system` rows, then drops `event_type` (table rebuild if `DROP COLUMN` is unavailable). `ORIGIN_TYPES` stays for `Property.property_type`. `bloomreach.ts` splits the known system list into `SDK_EVENT_TYPES` and `PLATFORM_EVENT_TYPES`; names the reference marks as shareable with client custom events default to `custom`.
Consequences: One field, one meaning; the API and UI speak `class` only. Certification is not applicable to sdk/platform events (`applicable: false`), and the engine validates custom events only.

## D-37 Comparison 4 finding set and the Bloomreach type mapping
Date: 2026-09-25  Status: accepted
Context: D-28 names `type_mismatch` and `unmapped_property` for the definition-vs-Data-Manager comparison and requires types to map both ways. Bloomreach types are `string, number, boolean, date, datetime, list, long text, url`; the app has six data types plus formats.
Decision: `src/domain/bloomreach/dataManagerTypes.ts` maps `long text` to `string + long_text` (new format), `url` to `string + uri`, `date` to `timestamp + iso8601_date`, `datetime` to `timestamp`, `list` to `array`, the rest one to one; `object` exports as `string` with a warning. Comparison `data_manager` reports `type_mismatch` (error) when the mapped types differ, `unmapped_property` (warning) for definition properties Data Manager lacks, `missing_event` (warning) for a defined custom event absent from Data Manager, `unexpected_property` (info) for Data Manager properties the definition lacks; custom events only. The comparison participates in certification.
Consequences: Two existing kinds are reused beyond D-28's two (documented extension). The fixture yields mismatches on `purchase_item.price`/`quantity`, `cart_update.total_price`/`total_quantity`, `checkout.total_price`, `view_item.price`/`stock_level` and none on `purchase.total_price`; the qa-roundtrip skill's scenario 8 text must be corrected.

## D-38 Identity rules align with Bloomreach: `identifier_name`, transformations, SDK call; codegen emits identify/update/anonymize
Date: 2026-09-25  Status: accepted
Context: The identity reference describes hard and soft identifiers, case sensitivity (trim, lowercase), the re-identification rule (pass all hard ids in one call), anonymize on logout, and SDK default properties on every event. Phase 1 stored `bloomreach_field`, a type and free text.
Decision: `bloomreach_field` is renamed `identifier_name`; `transformations_json` (`trim`, `lowercase`) and `sdk_call` (`identify | update | anonymize`, nullable) are added. Codegen builds one `identify` object with every hard identifier (soft ids never passed), wraps values with their transformations, an `update` call from mapped customer properties, and `anonymize` for logout rules. `SDK_DEFAULT_PROPERTIES` are never `unexpected_property` or `unmapped_property`; event and property names must be ASCII (400); the tracking document reports counts against the 255 limits.
Consequences: The re-identification rule is enforced by construction in the snippet, not modelled as data. Any client with custom identifier names enters them as `identifier_name`.

## D-39 Migration numbers are pre-assigned per task so parallel worktrees merge cleanly
Date: 2026-09-25  Status: accepted
Context: Four phase 2 tasks can run in parallel after T-2-01 and each adds a migration. The runner applies every file not recorded in `schema_migrations`, in filename order, so a lower number merged later still applies.
Decision: 0009 T-2-01 (event class), 0010 T-2-02 (Data Manager meta), 0011 T-2-06 (rules, item schema, tolerance), 0012 T-2-11 (narrative edited at), 0013 T-2-12 (identity). A task needing an unplanned migration asks the supervisor for the next number on the board before creating the file. Migrations must not depend on a higher-numbered file.
Consequences: No renumbering at merge time; each migration is self-contained.

## D-42 Manual finding resolution is an acknowledgement that never flips certification
Date: 2026-09-27  Status: accepted
Context: T-2-09 adds a Resolve/Reopen toggle on the Findings page (plan acceptance). The first implementation made a hand-resolved finding a permanent per-fingerprint mute that also removed it from the certification count, contradicting D-05 (certified is derived) and D-21 (no mute status).
Decision: A finding resolved by a person keeps status resolved with resolved_by = user while its fingerprint keeps reproducing, so it stays out of the open list and out of the tracking document findings[]. It still counts against certification: certification reasons list acknowledged_errors: n separately from open_errors: n, and certified stays no while any error finding of the event reproduces, acknowledged or not. When a recompute stops reproducing the fingerprint, resolved_by is cleared and resolved_at set by the recompute, so a later recurrence reopens the finding normally. Explicit reopen clears the marker immediately.
Consequences: The toggle is triage, not certification. The tracking document quality block reports acknowledged counts. D-21 wording no mute status stands: acknowledgement is bounded by reproduction.

## D-43 Phases 3 and 4 are pre-approved; the supervisor proceeds without per-phase checkpoints
Date: 2026-09-27  Status: accepted
Context: The user asked for the build to continue overnight through phases 3 and 4 without stopping after the phase 2 exit. Earlier phases required user approval per phase.
Decision: The phase 2 exit report is written to the board and to the user. The architect produces the phase 3 and 4 task plan, the user reviews that plan (amendment 2026-09-27), phase 3 then runs without further checkpoints to T-3-EXIT; a checkpoint with the user follows before phase 4 starts (amendment 2, 2026-09-27), after which phase 4 runs to T-4-EXIT without further checkpoints. Open questions are resolved by the documented default and recorded as decisions; the user is only asked when a choice would change the data model irreversibly. Phase 5 (remote deployment) still requires explicit approval (D-09).
Consequences: Reports per phase still land on the board and in the user report; nothing waits for a reply. Rate-limit or session interruptions are resumed from the board state.

## D-44 ChangeLog is written at DAL level inside the mutation transaction with the actor from an AsyncLocalStorage context.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: capability 12; PLAN-2026-09-24 asked for a DAL mutation helper; routes, imports and MCP all call the DAL. Decision: `change_log` table (0015) with entity type, id, label, parent id, action create/update/delete/restore, actor, source (`ui | mcp | import:<format> | restore | system`), batch id, field diff; `recordChange` called by every definition-mutating DAL function inside its transaction; actor/source/batch from `src/backend/context/actor.ts`, set by Express middleware, the MCP wrapper and import services. Evidence tables (qa runs, observations, findings), clients and the global template library are not logged. Consequences: no history can be missed by a new route; imports appear as one batch; the plan-2024 `import_apply` action is replaced by `source`; restore writes one row plus the carried log.

## D-45 Backup is one self-contained JSON with embedded files; restore only creates a new project and remaps every id.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: capability 1; the brief asks for ids remapped and files included or referenced. Decision: format `e3-tracking-backup` v1, every table as full rows including soft-deleted ones, files base64-embedded (missing files are warnings), referenced templates embedded; restore is preview/apply (D-22), never merges, remaps every id by a deep walk over keys and values of every JSON column and rewrites finding fingerprints so D-42 acknowledgements survive, re-links templates by code, writes files under the new project, then recomputes findings. Consequences: a backup is portable between machines; restore of a large project is a single request under a 100 MB limit; cross-project copy (D-27) stays a separate feature (D-54).

## D-46 CSV export contract.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: capability 9, scenario 6. Decision: headers declared once in `src/domain/csv.ts` (list in this plan), ids next to names, JSON columns as compact JSON strings, booleans `true`/`false`, UTF-8 with BOM and CRLF through papaparse, soft-deleted rows excluded, one route per entity plus a listing route; no CSV import ever (D-01). Consequences: files join on ids in a spreadsheet; the header lists are the tested contract and any change is a plan-level edit.

## D-47 Use case library format and instantiation rules.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: D-06, capability 11. Decision: `e3-use-case-library` v1 with `default_requirements` in the shape the DAL already resolves; import is preview/apply merged by `code` (D-22 pattern, global scope, not logged); export emits the same shape; instantiate copies the template code as the use case code with a numeric suffix on conflict, keeps the exact-variant-condition resolution and `gap` fallback, copies notes and generates the narrative. A three-template sample lives in `samples/`. Consequences: the user's 90 templates load through the same path; template deletion is refused while instantiated.

## D-48 Share token design.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: capability 13, phase 5 readiness, D-14. Decision: one token per project, 32 random bytes base64url, stored in plaintext so Settings can re-show the link, access `read | comment`, rotate on regenerate, revoke by nulling, no expiry, no login, timing-safe comparison, public routes under `/api/shared/:token/*` (document JSON, HTML, files, comments) with 404 for unknown or revoked tokens; frontend route `/tracking-plan/shared/<token>`. Hashing with one-time display and real rate limiting are phase 5 hosting concerns added at the middleware. Consequences: a leaked link is revoked by rotating; no per-entity or per-user sharing; the shared view is usable on localhost for QA. Phase 5 option (user, 2026-09-27): an optional passphrase per share link, stored hashed, checked once per browser session via cookie, added together with token hashing and rate limiting when the app is hosted; not part of phase 4.

## D-49 Comment model.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: capability 13. Decision: `comments` table (0017) on `event | property | use_case | requirement` with free-text author, body, `via_share`, internal-only resolve and delete, no edit; comments are excluded from the tracking document and MCP and included in backup and CSV; `replaceRequirements` keeps requirement ids for unchanged targets so comments do not orphan. Consequences: the smallest model that lets a client annotate the document; threads, mentions and notifications are out of scope.

## D-50 The shared view is a React page fed by the tracking document from the share route and reuses the event card renderer.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: D-10 asked to reuse the documentation rendering; D-34 made `EventCard` the shared unit. Decision: `EventCardView` is extracted from the internal card page as a presentational component; the shared page renders the tracking document (custom events first) with it, plus use cases, identity, consents, catalogs, mappings and download links; `EventCard` gains `triggers[]` (additive, no version bump) so screenshots render through the shared file route. Consequences: one renderer for the internal card, shared view, HTML and MCP; the HTML export keeps data-URI images.

## D-51 Dead-code sweep list and legacy documents.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: D-02, D-18; the old plan's candidates are already gone. Decision: delete the five unimported files, four empty directories, ten Supabase/journey-era documents under `docs/` and `.cursor/rules/project-context.mdc`; reduce `src/types/schema.ts` to what codegen still imports; keep `store.tsx` (UI state), `ApiAuthConfig.tsx` and the served user manual (content refresh is a docs task). Consequences: `docs/` holds only DOMAIN, QA-LOCAL, TRACKING-DOCUMENT, MCP, EXPORTS, SHARING; the sweep runs alone after every other phase 3 task merges.

## D-52 QA evidence is editable and deletable; variant deletion refuses while mapped.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: T-2-08 QA and T-2-05 review follow-ups. Decision: `PATCH/DELETE /observations/:id` (hash recomputed, duplicate 409), `DELETE /qa-runs/:id` (findings keep their rows with null run and observation refs, 0008), each followed by a recompute; `deleteVariant` returns 409 `MAPPING_IN_USE` unless `force=true`, which clears the mapping's variant first. Consequences: no silent conversion of a filtered mapping into an unfiltered one; evidence corrections are visible through recompute rather than history.

## D-53 Migration numbers for phases 3 and 4
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
(extends D-39). Decision: 0014 T-2-09 (`findings.resolved_by`, already on its branch), 0015 T-3-01 `change_log`, 0016 T-4-01 `projects.share_created_at`, 0017 T-4-02 `comments`; no other task adds a migration without asking the supervisor for the next number.

## D-54 Cross-project copy with provenance and the drift compare view are deferred past phase 4.
Date: 2026-09-27  Status: accepted (proposed by the architect in PLAN-PHASE3-4-2026-09-27.md, accepted by the user)
Context: D-27 placed them in phase 3; the D-43 phase 3 brief lists history, backup, CSV, library import and the sweep, and CONTEXT.md capability 1 names them. Decision: not built in phases 3 or 4; backup and restore-as-new-project covers cloning a whole brand project; the `origin_project_id`/`origin_entity_id` columns are added when the copy feature is scheduled (user to confirm priority at the phase 4 report). Consequences: capability 1 stays "partial" in the exit report; nothing in phases 3 and 4 blocks adding the columns later.

## D-55 Use case library templates target Bloomreach standard events and resolve through the project standard event mappings
Date: 2026-09-27  Status: accepted
Context: Library templates named client events by literal name, so a client that calls purchase transactions got a gap requirement for every template. The user asked for a mapping step like Bloomreach has. Every project already carries standard event mappings (standard event, client event, variant, field map of property renames) from the data mapping import.
Decision: A template requirement carries standard_event (Bloomreach catalog name) and standard property names, with event_name optional for custom events outside the catalog. Instantiation resolves in order: (1) the project standard event mapping for that standard event gives the client event and variant, and its field_map translates property names; (2) exact name match of event_name or standard_event against project events; (3) anything still unresolved is presented in a mapping step before the use case is created, one row per unresolved target with a picker for event, variant or property; each choice is saved as a standard event mapping (with field_map entries) so later templates resolve automatically and the data mapping export carries it. Skipped rows become gap requirements as before.
Consequences: The sample library uses standard events only. Mapping-step choices feed comparison 1 (definition vs mapping) because they are real mappings. T-3-06 grows by the resolution order and the mapping dialog; the instantiate route gains a resolve preview (POST .../from-template/:id/preview returns resolved and unresolved targets) and accepts mappings in the apply body.

## D-56 Use case activation status and Bloomreach asset links
Date: 2026-09-27  Status: accepted
Context: Most use cases are realised in Bloomreach as scenarios, templates, aggregates and segments, usually one initiative per use case, built in the last project phase. The user wants the tool to govern the whole delivery and handover without becoming a project management tool.
Decision: UseCase gains activation (planned | in_build | live | paused, default planned) and assets_json: an ordered list of {type: scenario | email_template | aggregate | segmentation | weblayer | report | catalog | initiative | other, name, url, bloomreach_id?, note?, source: manual | initiative_import}. Assets are optional, empty by default, never a gap or a requirement; they are added as things get built. An Activation page lists use cases with activation status, tracking readiness (resolved vs gap requirements, required events certified), asset links and last change; a use case that is live while a required event is not certified or a requirement is a gap shows a warning on the card and the page. Activation and assets appear on the use case page, in the documentation HTML, the shared view, backup and CSV; excluded from the tracking document and MCP for now. Bloomreach initiative export import (preview/apply, fills assets with source initiative_import, diff on re-import) is built when a sample export exists in samples/, else it becomes a follow-up. Out of scope: dates, owners, effort, any Bloomreach API call.
Consequences: Phase 3 backup and CSV include the two new columns. Task T-4-06 added to the phase 4 plan after the shared view. Change log records activation transitions (phase 3 ChangeLog covers use_case).

## D-57 Use case library tags, prerequisites card, and catalog and consent requirement targets, aligned with the Bloomreach Use Case Center
Date: 2026-09-27  Status: accepted
Context: Bloomreach Use Case Center filters use cases by channel, goal, tier, KPI and industry, and its requirements page lists prerequisites in four groups (events, customer properties, catalog attributes, consents) with a green, gray or mixed mapping status. Our library format is defined in phase 3 and clients recognise that vocabulary.
Decision: Templates carry optional tag lists channels, goals, tiers, kpis, industries plus flags new and popular; suggested vocabularies in enums.ts mirror the Use Case Center (channel: email, sms, browser_push, mobile_push, ad_audiences, whatsapp, web_layers, rcs, no_channel; goal: drive_traffic, grow_database, acquire_customers, increase_retention, reactivate_customers, reengage_subscribers, reduce_returns, analyze_data; tier: essentials, advanced, omnichannel, sustainability, loyal_ai; kpi: conversion_rate, revenue, revenue_per_visitor, average_order_value, cltv, purchase_frequency, return_rate, active_subscribers; industry: ecommerce, travel, retail); unknown values import with a warning, never an error. Requirement target kinds gain catalog_attribute (resolved against the project main catalog fields by name) and consent (resolved against consent categories by name); both appear in the requirements matrix and coverage. The templates page filters by the five facets and shows a prerequisites card per template grouped as events, customer properties, catalog, consents with the resolve status for the current project (all resolved, none, mixed). Projects gain an optional industry field used as the default filter.
Consequences: T-3-06 is split: T-3-06 format, tags, import/export, templates page with filters and prerequisites card, sample library; T-3-10 mapping step (D-55), the two target kinds, matrix and coverage updates, MCP instantiate tools. The sample library grows toward the e-commerce essentials tier once the Use Case Center documentation is stored in samples/.

## D-53 amendment (2026-09-28): migration numbers 0016 T-3-06 (use case template tags), 0017 T-3-10 (project industry, only if needed), 0018 T-4-01 (share_created_at), 0019 T-4-02 (comments), 0020 T-4-06 (use case activation). Supersedes the numbers in D-53 and D-56.

## D-47 amendment (2026-09-28): template deletion counts live (non-deleted) use case references only; in the same transaction, template_id is nulled on soft-deleted use cases before the delete. A restore already produces null template_id, so this state is legitimate. The 409 body carries the reference count. Lands in T-3-10.

## D-52 amendment (2026-09-28): migration 0008 sets findings.qa_run_id ON DELETE CASCADE (observation_id SET NULL). deleteQaRun therefore nulls findings.qa_run_id explicitly inside its transaction before deleting the run; findings survive with null refs and the following recompute resolves or restamps them.

## D-58 Property definitions: one shared property, several named meanings, chosen per event link
Date: 2026-09-28  Status: accepted
Context: A property is a project-wide dictionary entry with one description, one allowed-values list and one example set, but the same attribute name means different things on different events (action on cart_update, consent and purchase). In Bloomreach an event attribute is defined inside its event. The per-link description_override hid the divergence on the event side; the user wants the split visible on the Properties page and rejects scattered overrides.
Decision: Property keeps the shared identity (name, payload key, data type, PII, source). A new table property_definitions (migration 0021) holds one or more named definitions per property: name (default general), description, allowed_values_json, format, example_values_json. EventProperty links gain definition_id (nullable = the default definition). Data type stays at property level: a type difference means a different property, enforced with a validation error. Every consumer reads the definition through the link: comparison allowed-value and format checks per event, event card, tracking document (definition fields on the event property; property list carries definitions), codegen examples, HTML and shared documentation, Data Manager events export (each event attribute from its definition) and data-mapping export; Data Manager import creates or matches definitions when the same attribute differs across events instead of overwriting the property. Migration: each distinct existing description_override becomes a definition, links without overrides point at the default; description_override is dropped after the backfill. Properties page: one row per property expanding into its definitions with the using events; a property with one definition looks as today. MCP get_expected_payload returns definition fields. The term variant stays reserved for event variants (D-03).
Consequences: Task T-4-00 at the start of phase 4, before the shared view. Backup, restore and CSV include property_definitions (additive). Requirements target properties, not definitions, unchanged.

## D-53 amendment 2 (2026-09-28): 0021 T-4-00 property definitions.

## D-51 amendment (2026-09-28): the sweep also removes the Supabase-era `supabase/` directory (26 legacy migration files) and `metadata.json`; the four empty directories are removed from the main tree by the supervisor after merge.

## D-59 The Use Case Center template JSON (pnp_usecase) is the canonical seed for the OOTB use case library
Date: 2026-09-28  Status: accepted
Context: The user exported 98 Use Case Center templates as pnp_usecase JSON (samples/br-pnp). Their template.requirements are machine-readable (mapped_event, event with properties and constraints, consent with a category constraint, customer_property, catalog with fields, main_catalog, email/sms/push/mms integration, text prerequisites), their header carries goal, kpis, channels, industries and usecase_tags, and fulfillments list the asset types each use case produces. Hand-authoring templates from documentation pages (T-4-07) proved error-prone.
Decision: A converter src/domain/import/pnpUseCase.ts turns a pnp_usecase document (or an array of them) into e3-use-case-library templates: code from template_id, name, description, callout and documentation_link kept; tags copied with Bloomreach tokens (the D-57 vocabularies are aligned: tier loomi_ai replaces loyal_ai, kpis gain retention_rate and lead_generation, channels gain weblayers, browser_push, mobile_push, whatsapp, rcs, no_channel, goals gain reduce_returns and analyse_data as the spelling of analyze_data); mapped_event -> standard_event requirement; event -> one requirement per property (event_property, level R unless is_optional; a property_constraint equals on a discriminator becomes the variant condition, so purchase with purchase_status equals success resolves to purchase[purchase_status=success]); consent -> consent requirement keyed by the constraint value; customer_property -> customer_property requirements; catalog -> catalog_attribute requirements per field; main_catalog, integrations and text -> prerequisites notes on the template (new optional field prerequisites[]); fulfillments -> expected_assets[] {type, headline} (new optional field, consumed by T-4-06 activation). Requirement-level is_optional maps to O. The templates page import accepts pnp_usecase JSON next to the library format (detected by template.type == pnp_usecase). The generated seed samples/use-case-library-ucc.json replaces hand-authored templates wherever a pnp export exists (matched by documentation_link); hand-authored templates stay only for pages without an export and are marked source: docs.
Consequences: Task T-4-08 after T-4-07 merges. Library format stays v1 with additive optional fields. System events named in requirements (session_start, session_end, first_session, consent, double_opt_in) are allowed as event targets; they resolve by name against the project's sdk/platform events.

## D-53 amendment 3 (2026-09-28): 0022 T-4-08 use case template source, prerequisites and expected assets.

## D-59 amendment (2026-09-28): use case templates and use cases carry an optional documentation_url (templates: defaults to the pnp documentation_link; use cases: copied from the template on instantiate, editable). Rendered as a link on the template card and detail, the use case page, the documentation HTML, the tracking document (additive field) and the shared view. The pnp callout quote is shown on the template detail.

## D-59 amendment 2 (2026-09-28): public versus internal documentation. Use cases and templates carry documentation_url (public: tracking document, HTML export, shared view) and internal_notes (text) plus internal_url, which never reach any export or the shared view. The renderer never mixes the two. T-4-08 adds the fields (migration 0022); T-4-03 enforces the split in the shared view.

## D-56 amendment (2026-09-28): initiative import intake. Importing an initiative export (initiative, items[], mapping.data, version) on the Use cases page previews the use case (matched by initiative id), the assets (one per item with type, name, id, version) and derived requirements read from what the items consume (aggregate event and property, segmentation events, scenario trigger events, catalog use), each proposed as a checkbox and resolved through the project mappings with the D-55 mapping dialog; when the export carries a template id the pnp template requirements are used and derived ones only add customisations. Apply creates or updates the use case, requirements, assets (source initiative_import) and stores the version; re-import diffs assets and requirements and warns when the stored version is newer; the mapping snapshot is cross-checked against the project standard event mappings with differences listed as warnings. T-4-06 implements it once a sample export exists.

## D-60 Bundled sandbox project
Date: 2026-09-28  Status: accepted
Context: Team members and client onboardings need a populated project to explore; restore-as-new-project (D-45) already remaps a backup into a fresh project.
Decision: The app bundles samples/sandbox-project-backup.json (the fixture project fully loaded: mapping, expiration, retyped properties, both Data Manager files, observations and findings incl. acknowledged ones, use cases instantiated from the library, a trigger screenshot, history). A Create sandbox action on the Clients page restores it under a chosen client (or an auto-created Sandboxes client) with a generated key sandbox-<slug>. Projects gain is_sandbox (settings_json): badge in the switcher and Clients list, excluded from share links by default and from CSV entity listings of real projects, listed separately for bulk deletion. The getting started checklist offers Create a sandbox on a fresh install.
Consequences: Folded into T-4-09 (button, flag, checklist entry); the curated backup is produced by the T-4-EXIT qa-tester (replaces the plain fixture backup) and refreshed by a script scripts/build-sandbox-backup.mjs when the schema changes.

## D-59 amendment 3 (2026-09-28): documentation_url, internal_notes and internal_url on templates are user-owned after the first import; library import sets them on create only and never proposes changes to them on update. Asset type vocabulary = the Use Case Center fulfillment types (18 in the corpus) plus the D-56 names as aliases (campaign_design = scenario); suggested, not enforced. Converter maps event requirements named cart_update to standard_event add_to_cart (remove_from_cart when the constraint says action remove) keeping the exact-name fallback.

## D-57 amendment (2026-09-28): catalog attribute resolution treats item_id and product_id as aliases of the main catalog id field.
