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
