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

## D-48 amendment (2026-09-28): the shared routes serve a public projection of the tracking document and HTML: agent_instructions, owners, identity_note, bloomreach_project_url and any internal_* field are removed; not_suitable_for stays. Every error under /api/shared is the same 404 SHARE_NOT_FOUND body (malformed escapes included) and the global error handler never returns stack traces outside development. Shared responses carry Cache-Control: no-store.

## D-53 amendment 4 (2026-09-28): 0023 T-4-09 project settings_json (is_sandbox, D-60).

## D-49 amendment (2026-09-29): comments are one shared thread
Comments attached to an event, property, use case or requirement form one thread shown in both the internal and the shared view. Internal replies are visible to anyone with the share link; private notes belong in the internal fields the public projection strips (use case internal_notes/internal_url, agent_instructions, owners, identity_note). The internal panel states the visibility next to the form. Resolved state and via_share origin stay internal. Open for the user's confirmation at the phase 4 review.

## D-49 amendment 2 (2026-09-29): internal-only comments and a per-link comment visibility setting
Date: 2026-09-29  Status: accepted (user)
Decision: A comment posted internally may be flagged internal_only (checkbox "Internal only", default off). Internal-only comments never leave the internal view: the public shared routes filter them server-side, they carry a badge internally, and backup/CSV keep the flag. The share settings gain "Show internal comments on the shared view": all (default, D-49 amendment 1 behaviour) or via_share_only (the shared view lists only comments posted through the link). Both are enforced in routes/shared.ts, never only in the UI. Migration 0024: comments.internal_only INTEGER NOT NULL DEFAULT 0, projects.share_comments TEXT NOT NULL DEFAULT 'all'. Task T-4-10, does not wait for phase 5.

## D-53 amendment 5 (2026-09-29): 0024 T-4-10 internal-only comments and share_comments; 0020 stays reserved for T-4-06.

## D-56 amendment 2 (2026-09-29): the T-4-06 gate is the folder .claude/team/samples/br-initiatives/ (the user provides about 20 initiative exports from the E3 P&P backup); the task designs against five diverse ones and uses all as regression fixtures.

## D-63 Client-side implementation contract: namespaced dataLayer object, shared transformation, property kinds
Date: 2026-09-29  Status: accepted (user)
Context: Clients push flat Bloomreach attributes onto the dataLayer root (colliding with GA4 keys, even overwriting `ecommerce`), maintain three parallel id lists by hand (product_ids, product_list, variant_list) that drift, and rework nothing in their existing analytics events. The GA4 ecommerce object must stay untouched (separation of concerns). purchase, purchase_item and consent are tracked server-side. SDK and platform events are emitted by the SDK itself.
Decision (recommended practice, published in the codegen; clients may deviate; validation always runs on the Bloomreach event payload, never on the dataLayer):
1. One namespaced object `bloomreach` on the existing site event (the site's event name is unchanged; the plan records per event/variant which dataLayer event carries it), preceded by a reset push `{ bloomreach: null }`. No event prefix, no version field.
2. Shape: `event` (Bloomreach event name), `properties` (event-level attributes and collection state after the action: action, placement, currency, totals, context properties), `item` (the one item interacted with, all its attributes), `items` (the whole collection after the action, one entry per line with ids and quantity). Identity is a separate optional push (`bloomreach.customer_ids`); consent is never in the dataLayer.
3. The transformation to the Bloomreach payload is a fixed, versioned artefact owned by E3, shipped as a GTM custom template and as a JS helper (`brPayload`): payload = properties + item flattened + state lists computed from items by Bloomreach naming (product_ids/variant_ids/sku_ids from the id fields; product_list/variant_list/sku_list as {id, quantity}); totals supplied or summed. No per-client logic in GTM.
4. Property kinds in the plan: event, item, state list (with its derivation rule and source attribute), context (properties or SDK default properties). Cards, documents, shared view and codegen show the kind, the dataLayer path and the rule. The comparison engine validates observed Bloomreach events against the rules (list lengths agree, interacted id present after add / absent after remove, ids match catalog lookup keys).
5. Implementation method per event: client_web (dataLayer + GTM template, Web SDK new `bloomreach` global and legacy `exponea.track` tabs), server_api (Tracking API; default for purchase, purchase_item, refunds, consent), sdk_auto (SDK and platform events: no tracking snippet; show the emitting SDK call and a default-properties snippet for always-tracked attributes such as user_agent). Migration 0025 stores the method and the dataLayer event name on events and the kind/rule on properties. D-62 (source system) remains open; the method lands now.
6. Property bundles regain their purpose: an "Add bundle" picker in the event editor links every property of a bundle at once; a bundle can define the item shape once and is shown in the tracking document.
Reference fixture: the client's add_to_wishlist push provided by the user on 2026-09-29 (samples/datalayer-wishlist-legacy.js) and its D-63 form.

## D-53 amendment 6 (2026-09-29): 0025 T-4-17 implementation method, dataLayer event name, property kind and derivation rule.

## D-53 amendment 7 (2026-09-29): 0026 T-4-19 example values cleanup.

## D-64 Property categories, system customer properties with recommended formats, catalogs section, shared icons
Date: 2026-09-30  Status: accepted (user)
Context: The shared view lists properties flat while events are grouped; Bloomreach treats a few customer attributes specially (email, phone, name, country, language, timezone) and the SDK adds default properties to every event; catalog fields have no place on the client view; the shared page lacks the sidebar's icons.
Decision:
1. Every property gets a derived category (pure `classifyProperty` in the domain layer) with an optional override column `properties.category` (migration 0027, D-53 amendment 8): `system_customer` (customer scope and name in the reserved list), `customer`, `sdk_default` (event scope and name in the SDK default list; implies kind `context`), `event` (everything else, sub-grouped by the D-63 kind). Definitions inherit their property's category and are nested under it.
2. Reserved system customer properties and recommended formats, stored as data_formats hints and validated by comparison 3 on observed values: email = valid email; phone = E.164; first_name/last_name = Title Case (recommendation, no finding); country = ISO 3166-1 alpha-2; language = ISO 639-1, region allowed as BCP 47; timezone = IANA name.
3. The category is a field on the tracking document and CSV, a grouped section on the shared view (System customer / Customer / SDK default / Event with kind subheaders; same collapsible groups and sticky headers as events), a filter on the internal Properties page, grouping in the HTML export and the Markdown copy.
4. The shared page gets a Catalogs section: one card per catalog with fields (type, lookup key, searchable) and the event properties that look up into it; grows market/language/version columns with D-61.
5. The shared page reuses the sidebar icon set on section headers and in its navigation.

## D-53 amendment 8 (2026-09-30): 0027 T-4-20 property category override.

## D-64 amendment (2026-09-30): the override column is `properties.category_override` (properties.category already carries the Data Manager group name since 0001). D-53 amendment 8 refers to that column.

## D-65 Naming convention per project
Date: 2026-09-30  Status: accepted (user)
Decision: `projects.naming_convention` (migration 0028, D-53 amendment 9) with values snake_case (default), kebab_case, camel_case, chosen in Settings. It applies to custom events, their properties and customer properties. Excluded: sdk and platform class events, SDK default properties, the reserved system customer properties (D-64) and standard event keys (which stay snake_case as Bloomreach requires). Enforcement: an inline warning in the event and property editors when a name does not conform (saving is allowed), and a comparison-1 finding of kind `naming_violation` (Schema family, warning severity) so imported names surface as findings instead of blocking imports. The rule and the exclusions are shown on the shared page's Properties/Events group headers as a one-line note.

## D-53 amendment 9 (2026-09-30): 0028 T-4-22 projects.naming_convention.

## D-61 Catalogs per market and language, catalog checks, property-to-catalog alignment
Date: 2026-10-05  Status: accepted (user)
Context: Bloomreach's mapping knows one main and one variant catalog (legacy); real projects run a product and a variant catalog per market and language with the same schema and market-specific prices, currencies and URLs. Catalog fields carry a lookup key and searchable flags (limit 40 on v1, fixed in advance; adjustable on v2). The lookup key is not reachable from Jinja; only catalog properties are.
Decision:
1. Catalog gains `kind` (product | variant | other), `market`, `language`, `version` (v1 | v2). The two Bloomreach mapping roles stay single per project (main product, variant), normally the default market; the data-mapping export is unchanged.
2. Catalogs of the same kind must share one schema (field names, types, searchable flags); drift across markets is a finding.
3. Catalog checks (comparison run): searchable count against the limit (warning at 40, error above); a v1 catalog whose searchable set changes after it is marked live is flagged; the lookup key must be present and unique; the lookup key field must also exist as a catalog property (schema field) because Jinja can only read properties -- missing lookup property is an error with the recommendation to add it.
4. Alignment: a property linked to a catalog field must share its data type (error); an event property named like a catalog id (product_id, variant_id, item_id aliases) is expected to link to the lookup key of the matching kind (warning otherwise); event cards, tracking document and codegen show the link.
5. Use case catalog-attribute requirements resolve per kind: satisfied when every market's catalog of that kind has the field, partial gap otherwise.
6. Observed-value matching against catalog items is deferred until a catalog item export fixture exists.
7. Sandbox: GB and CZ product and variant catalogs (GBP/CZK prices, market URLs), GB as main and variant in the mapping.

## D-62 Source system and collection method
Date: 2026-10-05  Status: accepted (user)
Decision: Source gains `system` (shopify | magento | salesforce_commerce_cloud | custom_backend | mobile_app | crm | erp | other) and `method` (web_sdk_gtm_datalayer | web_sdk_direct | tracking_api | bloomreach_integration | file_import). An event's source link carries both ("Shopify via GTM data layer"); the source's method is the default for the event's D-63 implementation method and picks the default codegen tab. Sources page, shared view and tracking document show system and method. Sandbox: Shopify via GTM data layer for client events, custom backend via Tracking API for purchase and consent. A project may set a default source applied to new events.

## D-53 amendment 10 (2026-10-05): 0029 T-4-11B catalogs kind/market/language/version, sources system/method, projects.default_source_id.

## D-61 amendment (2026-10-05): the lookup-key-as-property rule, precise reading
The field flagged `is_lookup_key` represents Bloomreach's item_id column, which Jinja cannot read. Therefore every product/variant catalog must also carry a regular (non-key) field holding the same id, named like the kind's id (`product_id` for product, `variant_id` for variant) or like the key field's `client_field_name`. The check fires for every catalog with a lookup key, regardless of `bloomreach_column`. When the key field itself carries the wanted name, the next step reads "treat this field as item_id (rename it) and add a regular `product_id` field with the same value", never an unsatisfiable "add a second field with the same name". Codegen prints the lookup line as a comment in the client snippets ("product_id looks up products_gb by product_id; all markets").

## D-66 Containerization: one image, one volume, local Docker as staging
Date: 2026-10-05  Status: accepted (user)
Context: The app is one Node process (Express API + static frontend) with SQLite and uploads on disk and an MCP server over stdio. Stateless hosts (Cloud Run, Vercel) would force a data-layer rewrite; a container with a persistent volume keeps the code unchanged and runs on any host (GCP VM, Hetzner, Fly.io). Operating effort is carried by the agents; only account, billing, DNS and identity-provider registration stay with the user.
Decision: A multi-stage Dockerfile builds the backend bundle and the Vite frontend and runs one Node process serving the API and the static files (SPA fallback under /tracking-plan/, shared routes public) on one port; the MCP server ships in the same image as a second entrypoint. docker-compose.yml: one service, one named volume for data/ (SQLite + uploads), environment from .env.example, a nightly backup.json job into the volume, health check. Running the container locally is step 1 and stays within D-09 (local-first). Step 2, deploying the same image to a host with TLS and an identity proxy (Identity-Aware Proxy or Cloudflare Access) in front of the internal routes, needs the user's explicit go per D-09, after share-link hardening (D-48 phase 5 items), a restore rehearsal into a fresh container, and the Vercel scaffold decision. docs/DEPLOY.md is the runbook.

## D-67 Identification flow: which identifiers each event carries
Date: 2026-10-06  Status: accepted (user, 2026-10-07); originally proposed by the supervisor from the user's review round 7 ("the identity call should answer based on which ID and when the customer is identified; with cookie and cart_id I can be identified by backend events that carry cart_id"), implemented ahead of the user's confirmation, reversible
Context: Identity rules describe each identifier (name, hard/soft, SDK call, trigger event, source) but nothing says which events carry which identifiers in `customer_ids`, so the question "when and by which id is this customer identified" has no answer in the app, the shared view or the Tracking API snippet.
Decision: `events.identifiers_json` (migration 0030, D-53 amendment 11): the list of identity-rule identifier names the event sends in `customer_ids`. Default when empty (derived, never stored): `client_web`/`sdk_auto` events carry every identifier whose rule has `sdk_call` `identify` or is the cookie; `server_api` events carry the identifiers whose rule's `source_id` matches the event's source, else none. The event editor shows the derived set with a checkbox override. The Identity rules page gains "Set by" (trigger event + source) and "Carried by" (events, derived or explicit) per rule and an "Identification flow" paragraph generated deterministically (D-32 style): for each identifier, when it is first set and which events identify the customer by it; the same paragraph appears in the event card identity block, the tracking document, the HTML export and the shared view. Tracking API codegen (`src/domain/codegen`) fills `customer_ids` from the event's identifiers instead of the project-wide hard ids. Comparison 3 gains an informational finding `identifier_missing` when an observed event lacks an identifier its definition carries (warning, Identity family).

## D-68 Source colour
Date: 2026-10-06  Status: accepted (user, 2026-10-07); originally proposed by the supervisor from the user's review round 7, implemented ahead of confirmation, reversible
Context: Events and properties from several sources (Shopify, GTM data layer, backend, mobile app) look identical in every table; the user wants a recognisable colour per source, assigned automatically with the option to change it.
Decision: `sources.color` (migration 0030 with D-67): one of a fixed palette of eight named tokens (`--source-1` .. `--source-8` in `src/index.css`, no raw hex outside it), auto-assigned on create by `system` (a stable map system -> token, falling back to the first unused token), editable from a dropdown on the Sources page. A `SourceBadge` in `badges.tsx` (coloured dot plus `sourceViaLabel`) appears on the Sources page, the Events table (new Source column, sortable), the event card header, the Identity rules "Set by" cell and the shared view event header. Shared view keeps the colour; the public projection does not need to strip it.

### D-67 amendment 1 (2026-10-06, user): standalone identify calls
An identifier can be set by a standalone `identify` call with no event (e.g. GTM on the checkout page sends `identify({cookie, cart_id})`); backend events may then carry only `cart_id` and Bloomreach merges them into the same profile through that soft id. So a rule's "Set by" is either its trigger event or a standalone call described by `sdk_call` + `trigger_text` (+ source) when `trigger_event_id` is null; the standalone call carries the rule's identifier plus the cookie (web source) or the source's other identifiers (server). The identification flow paragraph names the merge explicitly: "<id> is set by a standalone identify call on <trigger_text> via <source> together with <ids>; <events> are sent with <id> only and are merged into the profile through it." Identity codegen (D-38) already produces the identify snippet; it now lists the identifiers the call binds.

### D-67 amendment 2 (2026-10-07, supervisor, from the T-4-32 review): explicit "carries nothing"
`events.identifiers_json` has three states: `null` = derived default; a non-empty list = explicit; `[]` = explicitly carries no identifier (allowed, shown as "none, set by hand"). The T-4-28 fallback stays only for a non-empty explicit list whose names no longer match any rule (renamed or deleted rules): that list is treated as derived until edited. The rule editor's Carried-by checklist can therefore untick the last identifier of an event, and the event editor offers "Carries no identifier" beside "Reset to derived".

### D-53 amendment 12 (2026-10-07, T-4-33): migration 0031
`0031_catalog_field_order.sql` adds `catalog_fields.sort_order` (INTEGER NOT NULL DEFAULT 0, backfilled as a rank by name within each catalog). Fields list by `sort_order, name`; new fields append; `PUT /catalogs/:id/fields/order` saves an order; restore ranks by name when a catalog's fields all carry 0 (pre-0031 backups). Order is presentation only and not written to `change_log`.

## D-69 Identifiers registry vs identity rules
Date: 2026-10-07  Status: accepted (user, 2026-10-07); originally proposed by the supervisor from the user's review ("hard and soft ids are set up once and do not change; identity rules should use these ids to visualise the identification act"), implemented ahead of confirmation, reversible
Context: Bloomreach project settings hold the fixed list of identifiers (hard ids, soft ids, cookie). The app stored `identity_type` on every identity rule, so the project-level fact lived on per-act rows and could drift between rules.
Decision: Two layers. (1) **Identifiers**, project level, migration 0032: table `identifiers` (project_id, name unique per project, type hard|soft, description, is_cookie, sort_order), edited on the Settings page in two lists that mirror the Bloomreach screen; backfilled from the distinct `identity_rules.identifier_name`/`identity_type` pairs (cookie flagged). (2) **Identity rules** are identification acts: each rule references one identifier (`identifier_id` FK; `identifier_name` kept in sync for the API, `identity_type` becomes derived from the identifier) and describes how that identifier is set (event or standalone call, D-67), what the call binds, and which events carry it. Several rules may reference one identifier (e.g. cart_id set on checkout via GTM and also by the backend). The identification flow paragraph is built per identifier, aggregating its acts. Compatibility: POST/PATCH identity-rules with `identifier_name` + `identity_type` auto-creates or matches the registry entry, so importers and the MCP keep working. Tracking API codegen `customer_ids` and the derived event identifiers read the registry for hard/soft and cookie.

### D-69 amendment 1 (2026-10-07, supervisor, from the T-4-35 review): identifier type changes only through the registry
The identifier's type is project configuration and changes only through `/identifiers` (Settings). On `/identity-rules`, `identity_type` is honoured only when `identifier_name` creates a new identifier; a name or id that resolves to an existing identifier with a different type returns 409 `IDENTIFIER_TYPE_MISMATCH` naming the registry type and pointing to Settings; `identity_type` alone on a rule PATCH is ignored. Event editor and codegen list identifiers from the registry (distinct names, registry-only ones selectable, hard id key from the registry), not one entry per rule.

## D-70 Client collaboration on comments: threads, status, reactions, images
Date: 2026-10-07  Status: accepted (user agreed to the proposal with the image limit raised to 10)
Context: Comments exist on events, properties, use cases and requirements in both views, with share-link posting, but they are flat and have only a resolved flag; QA collaboration with clients needs replies, a status and screenshots.
Decision: (1) Threads: `comments.parent_id`; replies inherit the parent's entity; panels show the root with replies collapsed after two. (2) Status on the root comment: open | on_it | done | wont_do (replaces the resolved flag; resolved maps to done); a comment-access share link may set on_it and done; wont_do and reopening are internal; status badge, Comments-page filter, counts on shared-view section headers. (3) Reactions, exactly three: seen, like, on_it (the last also sets the status); one per author per comment, table `comment_reactions`; counts with names on hover; no free emoji. (4) Images on comments: up to 10 per comment, PNG/JPEG/WebP only, 5 MB each, re-encoded on upload (no metadata or script survives), stored through the FileStore, served to clients through the share files route, rate-limited per share token like posts plus a 200 MB per-token daily cap; thumbnails with the trigger-image lightbox. (5) Share author memory: optional per-link display name remembered in the browser; internal setting to require a name. (6) Notifications (daily digest email) deferred to phase 5 with the mail provider decision. Security unchanged: allowed share body keys only, internal_only never leaves, identical 404 on share routes, public projection applies to attachments. Tasks: T-5-02 threads and status, T-5-03 reactions and author memory, T-5-04 comment images; runnable before the cloud if the user says so.

## D-71 Comments are Markdown
Date: 2026-10-07  Status: accepted (user request)
Context: Comment bodies are plain text. Clients and consultants expect basic formatting, and the app already renders Markdown (react-markdown + remark-gfm, raw HTML disabled) for docs and copy.
Decision: Comment bodies are Markdown (CommonMark + GFM subset: bold, italic, strikethrough, inline code, code blocks, links, bullet and numbered lists, quotes, task lists). Stored as the Markdown text, rendered with the existing `MarkdownView` in both views and the Comments page; raw HTML never rendered; links open in a new tab with `rel="noopener noreferrer nofollow"` and external links show the domain. The composer (root and reply, internal and shared) is one `MarkdownEditor`: a toolbar with icons (bold, italic, strikethrough, code, link, bullet list, numbered list, quote, task item, image-from-attachment), keyboard shortcuts (Ctrl/Cmd+B, I, K for link, Shift+Ctrl+X strikethrough, Ctrl+E code, Ctrl+Enter to post), Write/Preview tabs, auto-continue of list bullets on Enter, Tab indents in lists. Attachments can be referenced inline as `![alt](attachment:<id>)`, resolved to the served URL at render time (and to the share files URL in the shared view). Body length limit 10,000 characters. Exports (HTML documentation) do not include comments; the Markdown copy of a card does not include comments.

## D-72 Phase 5 step 2: deployment on a GCP Compute Engine VM (draft for approval)
Date: 2026-10-07  Status: accepted (user "proceed", 2026-10-07); defaults until the user changes `deploy/gcp/config.env`: project e3-tracking, region europe-west1, zone europe-west1-b, hostname tracking.e3-services.com; originally proposed (user said "go phase 5", provider GCP Compute VM, dedicated project with its own billing, deployment through the gcloud CLI on the user's machine)
Context: D-66 produced one image with one data volume and a nightly backup job, tested locally on Docker. D-09 gates every remote step on the user's explicit go, now given.
Decision (each item needs the user's yes):
1. Project and region: a dedicated GCP project (user-created, billing attached), region europe-west1 (Belgium) or europe-west3 (Frankfurt) for EU residency. The supervisor's agents never create the project or touch billing; everything else runs as `gcloud` commands in a reviewed script `deploy/gcp/*.sh` executed by the user (or by an agent after the user confirms each script).
2. Compute: one `e2-small` VM (2 vCPU shared, 2 GB) on Container-Optimized OS or Debian 12 with Docker, a 20 GB persistent disk for the data volume mounted at /data, static external IP, firewall allowing only 80/443 from anywhere and 22 from nowhere (SSH through IAP TCP forwarding only). Estimated 15 to 25 EUR per month incl. disk and IP.
3. TLS and ingress: Caddy as a sidecar container in the same compose file, automatic Let's Encrypt certificates for one hostname the user owns (e.g. tracking.e3-services.com, DNS A record to the static IP), reverse proxy to the app container. No Cloud Load Balancer (cost and complexity not justified for one VM).
4. Identity in front of the internal app: Google sign-in enforced by Caddy's forward-auth to a small OIDC proxy (oauth2-proxy container) restricted to the e3-services.com Google Workspace domain plus an allow-list of client emails if ever needed; the public share routes (`/tracking-plan/shared/*`, `/api/shared/*`) and `/api/health` bypass the proxy. The app keeps `AUTH_MODE=local` but trusts the proxy's `X-Forwarded-Email` header to set the actor name (new `AUTH_MODE=proxy`, header accepted only from the proxy's network). Alternative considered: Identity-Aware Proxy on an HTTPS load balancer (cleaner, adds a load balancer at roughly 18 EUR per month and the share-route bypass needs a second backend); rejected for cost.
5. Images: built on the VM from the repo tag (`git pull` + `docker compose build`) or pushed to Artifact Registry from the user's machine (`gcloud builds submit` or local build + push). Default: Artifact Registry in the same project, the VM pulls a tagged image; rollbacks are a tag change.
6. Backups: the existing nightly backup.json job writes to /data/backups; a second step uploads each backup to a Cloud Storage bucket in the project (versioned, 90-day lifecycle) with `gcloud storage cp` from the VM's service account (least-privilege: objectCreator on that bucket only). Restore rehearsal: before go-live, restore a production backup into a fresh container locally and compare counts (the existing verify script pattern).
7. MCP access: the MCP server stays stdio and ships in the image; for Claude Code on the user's machine the path is `gcloud compute ssh --tunnel-through-iap <vm> -- docker compose exec -T app node api/_backend/mcp.js` configured as the MCP command in `.mcp.json` (no new network port, authenticated by the user's gcloud login). An HTTP MCP transport is deferred.
8. Secrets and config: `.env` on the VM (not in git) holds the OIDC client id/secret and the bucket name; the OAuth client is created by the user in the GCP console (consent screen internal to the Workspace); `E3_LOCAL_USER_NAME` replaced by the proxy header.
9. Monitoring: Cloud Logging agent off (cost); Docker json logs with rotation; `/api/health` polled by an Uptime check (free tier) with an email alert to the user.
10. Digest email (D-70 item 6): deferred until a mail provider is chosen; proposal when needed: Google Workspace SMTP relay or Resend.
11. Cut-over: the Airshoppen and sandbox data move by backup.json export from the local container and restore on the VM (or by copying the SQLite file and files folder from the local volume); the local container stays as staging.
Tasks after approval: T-5-06 `AUTH_MODE=proxy` + header trust + Caddy/oauth2-proxy compose profile (local test with a fake header); T-5-07 deploy scripts under `deploy/gcp/` (project setup, VM, disk, firewall, IAP SSH, Artifact Registry, bucket, service account) with a dry-run mode and docs/DEPLOY.md section; T-5-08 backup upload step + restore rehearsal; T-5-09 MCP over IAP SSH + `.mcp.json` example; T-5-01 MCP write tools; T-5-10 go-live checklist and the first deployment, executed by the user with the scripts.

### D-72 amendment 1 (2026-10-07, user): cheapest EU VM, hostname confirmed
Machine type default `e2-micro` (shared core, 1 GB) in europe-west1 (lowest-priced EU tier), with a 2 GB swap file created by the startup script; upgrade path `e2-small` by changing `MACHINE_TYPE` in `deploy/gcp/config.env` and recreating the instance (data disk untouched). Hostname `tracking.e3-services.com` confirmed. Approximate cost 6 to 7 EUR per month plus disk (about 2 EUR) and the static IP.

## D-73 Shared portal cooperation and scoped redesign
Date: 2026-10-08 Status: accepted (user "Full approval", then "Proceed as proposed")
Codex coordinates this work; one writer of team records; separate implementation/review/QA agents. Accepted tasks are committed and integrated into agent-setup after review and QA; main untouched. Existing deployment changes remain separate. Targeted shared tables/readability amend D-07 and D-50; no journey functionality. Approved plan/acceptance: reports/PLAN-SHARED-PORTAL-2026-10-08.md.

## D-74 Comment participant identity and composer attribution
Date: 2026-10-08 Status: accepted
Amends D-70: every root/reply editor shows posting identity. Guests have per-share stable animal/color identity and editable name; required-name requires explicitly supplied name or verified Google identity. Ownership uses stable identity distinct from display name. Verified name/photo comes from server verification, never browser-supplied attribution. Preserve existing comments/reactions and backup restore. Reserve migration 0037 for T-5-13; no reuse of existing numbers.

## D-75 Comment deep links and Markdown copy
Date: 2026-10-08 Status: accepted
Amends D-71: copy-link and copy-Markdown actions on roots/replies and whole-thread Markdown copy. Links expand entity/thread/replies and focus/highlight the target. Export only comments/attachments visible to the current viewer; entity/document exports still do not include comments by default.

## D-76 Google identity for shared commenters
Date: 2026-10-08 Status: accepted
Google Identity Services, server-verified token/session, minimal profile scopes; explicit sign-in and eligible Google auto sign-in, no Chrome profile inspection. Shared Google identity never increases share permissions. Existing Internal staff OAuth remains restricted. Personal Gmail requires separate External configuration/project; existing D-72 restriction on agent project/billing creation remains until explicitly changed. Local verifier fixtures plus actual host sign-in smoke are distinct evidence. Reserve migration 0038 for T-5-15 if necessary.

### D-76 amendment 1 (2026-10-08, user): separate public-auth project/client creation authorized
User explicitly chose "Create the separate public-auth project/client". Codex may create the separate External-audience basic-profile OAuth project/client for shared commenters; this is a scoped exception to D-72 project-creation restriction. Billing and Internal staff OAuth remain unchanged. GIS requires public client ID and authorized JavaScript origins only; no new client secret is needed by this integration.

### D-76 amendment 2 (2026-10-08, user): user configured public-auth billing
User reports billing account configured for the External OAuth project. This is a user-performed change, not agent billing authorization; agents leave billing configuration untouched. Initial no-billing verification remains historical evidence.

### D-74 implementation note (2026-10-08): loading and identity namespaces
An unresolved server identity is displayed as loading/unavailable, with mutations blocked until resolved; fabricated fallback animals cannot claim attribution or reaction ownership. Guest initialization occurs only through the identity endpoint, avoiding concurrent comment-read cookie races. Staff identities derive from canonical trusted email; Google identities derive from verified subject. These are distinct namespaces and do not automatically link accounts; switching providers can therefore represent a different reaction participant. Public responses expose display identity but no participant IDs or email.

### D-74 deployment note (2026-10-08): database-aware rollback
Independent fixture confirms the old18b7883 public projection exposes newly added participant metadata if only the image is rolled back after0037. This release must retain a verified complete pre-migration data/config snapshot with every writer stopped. A rollback first preserves upgraded data for newer-comment recovery, then restores the consistent pre-migration SQLite/WAL/uploads and config before starting the pinned old image. Never overlay an old SQLite file onto newer WAL/SHM. This is a routine safety requirement within the approved deployment scope; operational auth credentials were not exposed in the fixture.

## D-77 Unified property hierarchy and portal presentation
Date: 2026-10-08 Status: accepted (user approved the three-part proposal with Proceed)
Show definition counts beside property names, including1definition; count toggles inline definitions while the editing shortcut remains. Category/property/definition indentation becomes clear and consistent in internal/shared views. Shared UI reuses internal presentation/branding and available width, preserving full wrapping text, current shared-document navigation, comments, exports and deep links. Public permissions/projection remain unchanged. No backend/schema/auth/dependency expansion. Existing D-73 coordination and accepted task-commit/integration authorization apply. Tasks T-5-18..20; acceptance in reports/PLAN-UI-CONSISTENCY-2026-10-08.md.

D-77 implementation accepted and released2026-10-08: scoped4b18de7/2f3283a, final2115tests/215files/build/lint/review/browserPASS, live240efde-dirty/schema0038 at manifestc13f97dee02182d0d23a2ed42dc18fdee0a9ba6ec70c660d93c1cc0f05cde39e. Current0038 recovery helper/snapshot retained; no schema/auth/projection/edge/dependency expansion. Scope complete; new features/follow-ups require their own approved scope.

## D-78 Collaboration coverage, unified actions and saved QA reports
Date: 2026-10-08 Status: accepted (user "so far the all is approved")
Approve certification hints, whole-summary-row expansion in the shared portal, a bounded sticky summary/collapse control, unified Actions including comment counts, exact-target comments on identity rules/catalogs/property definitions, direct change history with client-visible shared projection, and numbered immutable QA reports with separate report/finding discussions and persistent recurring-issue references. Existing internal row-click editing and shared permission boundaries remain. Delivery T-5-21..24 is sequential per reports/PLAN-COLLABORATION-2026-10-08.md. D-73 coordination and accepted-task integration authorization apply. Existing historical QA snapshots cannot be fabricated from current summaries. The latest request asks to evaluate removing redundant on_it reaction and add "How it works" help; the removal recommendation is recorded separately pending the conceptual discussion, and does not yet amend D-70 or reopening permissions.

## D-79 Single thread progress control and comment workflow help
Date: 2026-10-08 Status: accepted (user "all approved proceed")
Amend D-70: remove the on_it reaction from active controls and new reaction submissions, retain Seen and Like, label comment statuses Open / In progress / Done with internal Won't do. Existing on_it reaction evidence remains exportable/restorable; do not reinterpret it as assignment. Keep stored status keys and role-specific reopening permissions. A thread may go directly Open to Done; internal users can reopen, shared users cannot set Open or reopen a closed thread. Add an expandable How it works beside Add a comment in the reused internal/shared component; wording explains threads, identities, permissions/visibility, reactions, Markdown/images, links/copy and that Done does not fix a finding or certify an event. Apply comment-specific wording instead of changing unrelated status labels. D-78 full sequence approved to proceed without further stage approvals; separate review/local QA precede integration and release.

## D-80 Exact-target collaboration and immutable QA evidence architecture
Date: 2026-10-08 Status: accepted implementation contract under D-78
Reserve0039 comments-target extension and0040 findings persistence/sequence/immutable-report tables. Actual public identity-rule UUIDs and definition parent context support stable threads/links. Shared history uses target visibility plus typed public-field allowlists and generic Staff/System actor, not raw change logs. Shared removed/foreign targets disappear with uniform404, internal discussions remain retained. Finding identity keeps existing exact fingerprint semantics; run deletion must not delete issues/discussions. Comparison orchestration/report numbering/capture is one transaction, recorded scope is honestly whole project, and copied evidence/labels are immutable. Restore remaps typed historical references without rewriting raw diagnostic values, resumes counters, and suppresses report capture during validation recompute. Detailed architect/reviewer contract and gates: reports/COLLABORATION-ARCHITECTURE-2026-10-08.md. No new user product question; preserving staff auth/main/staging/private fields and reviewed migration rollback remains mandatory.

## D-81 Compact shared copy controls and finding typography
Date: 2026-10-08 Status: accepted (user asks to resolve screenshots)
Shared entity Actions use compact icon-only Markdown copy buttons while retaining exact accessible names, hint text and copy feedback. Match individual finding text to surrounding small body/table typography, preserving finding numbers/discussions/full wrapping content. Keep section-level copy controls and unrelated internal layouts unless needed for consistency. No functional, schema, permission, authentication or dependency expansion. T-5-25 follows existing D-73 separate review/QA/integration/release rules.

## D-82 Available verified Google profile photos
Date: 2026-10-08 Status: accepted (user asks Google photo loaded if available)
Use the available verified Google profile picture consistently in identity and comment avatars, with initials only when missing or failed. Investigate staff-session reuse separately from explicit Google sign-in; do not fabricate a photo or trust client-supplied identity/avatar claims. Preserve existing namespaces, share permissions and credentials. Any additional authentication scopes or permission expansion require a concrete reviewed proposal. T-5-26 tracks diagnosis/fix under existing coordination rules.

### D-82 implementation correction — verified Userinfo fallback
Date:2026-10-08 Status:accepted within user-approved available Google profile photo scope. Actual fresh staff ID token verifies but omits picture. Independently reviewed minimal fallback uses existing basic profile/email permissions and fixed Google oauth2/v2/userinfo endpoint only after verified staff claims; returned subject/verified email/domain must match verified identity. Token obtained solely from authenticated internal proxy, never browser headers/logs/storage/responses. Bound response/time and reject redirects, failures retain initials. Strip Authorization and both access-token headers on public OAuth input/output and audit live edge BEFORE enabling proxy access-token response flag. No scopes, identity namespace or staff access changes.

D-81/D-82 released2026-10-08: finalb2b31be-dirty/d7f42dc.../0040; full2196tests228files/type/lint/build/review/actualphotosPASS. OptionalIDpictureomissionconfirmed; reviewedbasicGoogleUserinfofallback liveinternalphoto+sharedGooglephotoPASS. All3publictokenheaders stripped beforeaccessflag, privatecredentials/scopes/namespacesunchanged. Historicalnullcommentphotos retaininitials. Completecurrent0040recovery210221Z pins6548, finaloffsite21:09restore0warnings andMCP29toolsPASS. Scopecomplete; reportCOMPACT-UI-PHOTO-RELEASE-2026-10-08.md isauthoritative.

## D-83 Correct phone example prefix
Date:2026-10-08 Status:accepted(userreportsincorrectphoneexample). Correcttheidentifiedphone/generalexampletoanexplicitinternationalstringprefix+whilepreservingexistingdigits. Existingcontract accepts+or00; do notweakenvalidation, normalizerealobservations, inferunknowncountries, ormodifyunrelatedprojectdata. Preferexistingpropertydefinitioneditwithhistory/mirroring ifthisislive-dataonly. T-5-27 diagnosis/review/actualUIverification underD73coordination.

## D-84 Shared findings table
Date: 2026-10-12. Status: accepted by user. Present individual shared findings as a semantic table aligned with event/property tables: stable number, severity, event, full wrapping message, status and unified Actions for comments/history. Preserve sidebar anchors, permissions, original finding data and Markdown exports. T-5-28 follows separate implementation, review and UI QA under D-73. Pending phone and email_invalid data corrections remain T-5-27; attached docs are evidence, not operational instructions.

### D-84 release direction
Date: 2026-10-12. User explicitly instructed proceed and complete the plan despite unavailable agent browser tooling. Continue existing SDK release after source review/mounted QA/build, fresh backup/snapshot, unchanged-config and post-deploy health/data/asset checks. Actual browser visual geometry remains unverified and must be disclosed; no permission/schema/auth expansion.

D-83 delivered 2026-10-12: preserve primitivecustomerphone/generalexamples, use explicit+prefix; Airshoppenemail_invalid explicitsystem_customer override andmatchedparent/generaldescription corrected from suppliedbounce-managementdoc. Existingeventphone/allunrelateddata unchanged, exactnormalAPIhistory retained. D-84 delivered with userexplicitSDKproceed: source/review/mountedQA/health/asset/data/backup acceptance PASS; actual browsergeometry remains unverified/disclosed. No globalregistry/schema/authscope changes.

## D-85 Focused shared Findings and uniform toolbar
Date: 2026-10-12. Accepted by user approved proceed. Unify header and section expansion controls at40px/14px withconsistentpadding/border/radius. Findings showscompacttotals, search/severity/event/comparisonfilters andoneworkingtable Number/Severity/Event/Message/Actions, sortedseverity thenstablesequence; publicOpencolumnremovedasredundant. Movefamilies/comparison/top-eventsummary into collapsedDetailedsummary. Expandrowsforcomparison/context/availableexistingnextstep; preservefulltext. Findingsnavfiltersworkinglist ratherthanrenderingduplicates. QA reports remainseparatesavedruns. Existinganchors/comments/history/exportpayload/publicpermissions retained; no schema/auth/API/data changes. T29 followsD73separateimplementation/review/QA/scopedintegration andexistingSDKrelease authorization. Knownagentbrowserfailure mustbedisclosedifpersists, no inventedvisualproof.

### D-85 approved Use case description addition
User requests bounded Use case description preview in shared table. Show readableplain-textMarkdownpreview upto200Unicodecharacters, ellipsiswhenlong; suppressMarkdownheadings/listlayout in collapsedrow. Fulloriginaldescription remainsavailableinexpandedUCbody andunchangedstorage/Markdown/JSON/HTMLexports. PartofT29, no newdata/APIchange.

## D-86 Compact shared text controls
Date:2026-10-12. User directs reducing button sizes after reviewing live screenshot. Amend D85 shared text toolbar from40px to32px height with12px horizontal/zero vertical padding and14px text, consistent across top Expand/Collapse/QA/JSON/HTML and section/group expansion controls. Row icon Actions and filter input sizing stay unchanged. T-5-30 is a narrow UI correction under the existing separate review/QA and scoped release authorization.

D85/D86 delivered 2026-10-12: Findings workflow, 200-character UC preview and compact32px shared text toolbar accepted separately and deployed as9bc5e72-dirty/20fc8b7f.../0040. Original exports/data/links/actions preserved. Focused independent review/QA, fresh deployable build, live health/config/integrity/assets, both offsite restores0warnings, exact wholeJSON equality except exported_at and MCP29 tools PASS. Final recovery snapshot202046Z pins6683 priorimage. Actual browser geometry remains unverified/disclosed under existing explicit SDKproceed authorization; report FINDINGS-WORKFLOW-RELEASE-2026-10-12.md is current evidence.

## D-87 Authenticated HTTPS MCP connector for Claude
Date: 2026-10-13. Accepted: user explicitly instructs proceeding with the HTTPS MCP endpoint connector for Claude. Implement and deploy Streamable HTTP at the existing tracking host with standards-compatible OAuth sign-in, reusing verified Workspace staff authentication and explicit project/read/write grants. Preserve existing stdio/IAP MCP, staff and shared-comment OAuth, all data/export/privacy contracts and current deployment settings. Public MCP access uses dedicated audience-bound expiring/revocable tokens, not Google credentials or shared-link privileges. Reuse existing tools with request-specific permission checks and authenticated audit actor. Architecture/security review precedes implementation; separate source review and QA precede scoped accepted commits/integration and SDK deployment under persistent D-73. Existing fresh backup/full-snapshot recovery gates apply to any new schema. No new project, billing, DNS or Google scope is assumed necessary. Root remains sole team-record writer; main/staging/preexisting machine.mcp and unrelated QA intake remain untouched.

D87 architecture accepted: hosted-only bounded DCR, exact Claude hosted callback, S256 and opaque audience-bound expiring/rotating tokens, read-first with explicit write/templates step-up, durable per-grant/project isolation and revocation. Schema0041 operational credential metadata excluded from portable backups. MinimalSDK1.32.x public-audience patch plus explicit verifier/expectedResource enforcement required. Approved implementation contract reports/PLAN-HTTPS-MCP-2026-10-13.md; no additional Google scopes/projects assumed. Architecture and independent auth review PASS; actual Claude OAuth consent remains a separate end-to-end gate.

D87 task IDs reconciled to T-5-34..36, avoiding existing Claude-supervisor QA/DM/gate IDs31..33. Scope unchanged; architecture independentlyaccepted, implementation proceeds on task/T-5-35-https-mcp.


D87 migration correction: use0042 for HTTPS operational authorization, honoring the earlier Claude-supervisor0041 reservation for population QA. This is an independent additive migration valid directly after current0040; no unrelated QA/DM source is required. Permissions/recovery contract unchanged, with actual latest schema0042 used for release audits.


D-87 amendment 1 (2026-10-14, user request after the live connector test): a consent may grant "All projects, including future ones". Explicit per-project selection remains the default and the recommended choice; the all-projects option is a deliberate checkbox on the consent page, stored as `mcp_oauth_grants.all_projects` (migration 0044) and resolved at call time against live, non-deleted projects, so a project created later is reachable through that grant without re-consent. The connections page and management API label such grants clearly. Revocation semantics unchanged. Task T-5-38.

D-87 amendment 2 (2026-10-14): the initial `WWW-Authenticate` challenge on `/mcp` advertises every supported scope (`projects:read projects:write templates:read`) so a hosted client requests them up front; the consent page is the one place write or template access is granted, both unticked by default. Rationale: a read-only grant hides write tools, so the insufficient_scope step-up documented earlier cannot be triggered by Claude.ai. Task T-5-39.

## D-88 Client portal v2: shared read-only components, one view per section, lazy event cards, share audience
Date: 2026-10-15  Status: accepted (user, 2026-10-15, option B with the recommended answers; see the acceptance note below and reports/PLAN-CLIENT-PORTAL-V2-2026-10-15.md)
Context: the single-page shared view (D-50, T-5-12) renders every section at once: 35,600 DOM elements collapsed, about 1.2 s per interaction in the dev build, a 1.2 MB document of which event cards are 941 KB; and the portal keeps its own table components apart from the internal app. Three options were weighed: A) clients log into the internal app with roles (every one of about 30 routers would need role and field checks); B) the portal reuses the internal app's presentational components but keeps its data on the public share API; C) keep polishing the separate portal. The user chose B and stated that clients only read and comment.
Decision: read-only views in src/features/views/ take only public TrackingDocument shapes through pure adapters; internal pages move their tables onto the same components and keep their own REST loading and editors. The portal becomes a shell with one path per section (/shared/:token/<view>[/<id>]) and an overview landing view; existing hash links redirect. Event cards load on demand through GET /api/shared/:token/document-summary.json and /events/:eventId/card.json, both derived from toPublicTrackingDocument output. Share roles stay read | comment (no editor role ever via a share); a per-project audience (anyone_with_link default | listed_people) plus share_members(email, viewer|commenter) gates the link behind verified Google sign-in, enforced in middleware/share.ts, with the role capped by the link role and emails never returned publicly. Migration 0045.
Consequences: the internal API stays staff-only; internal table improvements reach clients automatically; the single-page Expand all, scroll spy and SharedProject.tsx section code are retired; SharedPresentation's request-count assertions and SharedEntityTable layout tests are rewritten for the new shell; tasks T-5-40..T-5-46.

D-88 accepted (2026-10-15, user) with the recommended answers: (1) in listed_people mode an unlisted or signed-out visitor sees only a neutral sign-in screen, never the project or client name; (2) event detail is its own page (/shared/:token/events/<name>), not a side panel; (3) new shares default to anyone_with_link; (4) old single-page hash links redirect indefinitely. Tasks T-5-40..T-5-46 may start; T-5-40 and T-5-41 first, in parallel.

D-88 amendment 1 (2026-10-15, user, T-5-42): the portal QA view reads a third public route, GET /api/shared/:token/findings.json (each event's findings, events with none omitted, plus unattached_findings), derived from the same toPublicTrackingDocument output as document-summary.json, behind requireShare, no-store, identical 404 SHARE_NOT_FOUND; the full tracking-document.json stays a download only. The portal Properties view shows 100 rows, then "Show 100 more" (PROPERTY_ROW_LIMIT).

## D-89 Finding priority, derived on the backend, transactional backend events first
Date: 2026-10-15  Status: accepted (user, 2026-10-15: "proceed as usual; transactional back-end based data are most important"; open question 1 in reports/PLAN-FINDING-PRIORITY-2026-10-15.md does not block)
Context: findings are ordered by severity then finding number everywhere (finding.dal.ts, sharedFindingsModel.ts, MCP list_findings); event priority, implementation method and use-case requirement levels never influence the order, so clients and E3 re-rank by hand.
Decision: a pure rule in src/domain/findingPriority.ts gives every finding P1-P4, a sortable rank and plain reasons from severity x business tier of its event: transactional (effective implementation_method server_api, the backend Tracking API data) > required (level R in a non-dropped use case on the event, its variant or the finding's property on it) > important (event priority critical/high) > normal. Matrix: error = P1 for transactional/required, P2 otherwise; warning = P2 transactional, P3 required/important, P4 normal; info = P3 transactional, P4 otherwise. The backend derives it at read time from batched inputs (never stored, so it never goes stale; no migration) and carries it additively on EventCardFinding, the tracking document and its public projection, findings.json, the summary (open_p1_count), the internal findings route (default sort by priority, ?priority filter), MCP list_findings/get_event_card, and frozen into QA report items at capture. Certification is unchanged (open unacknowledged errors only).
Consequences: one ordering for E3, clients and agents; reports keep the priority they had when captured; UI follows in T-5-48 after the backend task T-5-47.

### D-87 amendment 3 (2026-10-18): Codex native client compatibility
The human directly requested connecting authoritative E3 Tracking MCP to Codex and coordinating the fix with its project session. Extend the existing public-client registration only as needed for Codex native loopback redirects, retaining exact host/path and registered redirect binding, S256, exact resource, staff identity/CSRF, explicit project/write/template consent, token rotation and revocation. Existing Claude hosted flow and deliberately approved all-projects option remain. No new hosted callback classes, Google scopes, schema or client-data intake is implied. T-5-52 requires separate architecture, source review and QA before scoped release. Native source-file validation is an inspection/proposal at this stage.

