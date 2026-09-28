# e3-tracking

In-house web app for Bloomreach Engagement migration intake, use-case data mapping, per-event documentation, automated QA, and export. Owner: E3 Services (Ján Pan). Replaces the Google Sheet plus Apps Script workflow entirely, with no legacy compatibility.

## Start here
- Product context and rules: `.claude/team/CONTEXT.md` (authoritative)
- Decisions: `.claude/team/DECISIONS.md`
- Backlog: `.claude/team/TASKS.md`
- Message board: `.claude/team/BOARD.md` (append-only; see the `board-protocol` skill)
- Fixtures for QA: `.claude/team/samples/`
- Agents: `.claude/agents/` (supervisor, repo-auditor, architect, implementer, reviewer, qa-tester, docs-writer)
- Skills: `.claude/skills/` (board-protocol, repo-audit, domain-model, refactor-plan, implement-task, review-checklist, qa-roundtrip)

## Working rules
- Branch `agent-setup` is the integration branch. Tasks on `task/<TASK-ID>-<slug>`. Never work on or merge to `main` without the user.
- Commit only when the user asks.
- Simplified UI during the agent build phase (D-07). No design work unless a task says so.
- Every Bloomreach JSON import shows a diff and needs confirmation (D-04).
- Variants = event plus discriminator conditions; contexts never create variants (D-03).
- Local-first: the app runs and is tested fully on localhost before any remote deployment (D-09).

## Stack and tooling
Frontend: React 19, TypeScript, Vite 6, Tailwind CSS 4, Zustand. Backend: Express 4, better-sqlite3 (D-12). Test runner: vitest (D-20). Backend bundler for deploy: tsup. Package manager: npm. Node version used in development: 22.19 (`node -v`).

## Run locally
1. `npm install`.
2. `npm run dev` — runs the Express API (`dev:api`, `tsx watch src/backend/server.ts`, port 3001) and the Vite dev server (`dev:web`, port 3000) together via `concurrently`.
3. Open `http://127.0.0.1:3000/tracking-plan/` (the app is served under the `/tracking-plan/` base path, D-23; Vite proxies `/api` and `/tracking-plan/api` to port 3001, so no `VITE_API_BASE_URL` is needed locally).
4. If port 3000 is already in use on your machine (another local app, another agent's dev server), stop the other process or change `dev:web`'s `--port` and the proxy target accordingly; there is no automatic fallback port. Vite's dev server ignores writes under `.claude/`, `data/`, and `docs/` (`vite.config.ts`'s `server.watch.ignored`) so another agent's board/report writes or local SQLite/file changes never trigger an unwanted HMR reload.
5. The SQLite database and uploaded files live under `data/` (`data/e3-tracking.sqlite` by default, gitignored). Delete the file to reset local state; it is recreated with migrations applied on the next server start.
6. Environment variables (see `.env.example`): `PORT` (API port, default 3001), `E3_DB_PATH` (SQLite file path, `:memory:` for ephemeral), `E3_FILES_PATH` (uploaded file root), `AUTH_MODE` (`local` only, default), `E3_LOCAL_USER_NAME` (local actor display name), `E3_PROJECT_KEY` (MCP default project, phase 2).
7. The `.claude/launch.json` entry `e3-tracking` runs `npm run dev` on port 3000 for the qa-tester agent (D-25 Q9).

## Test and lint
- `npm test` (`vitest run`) — unit and DAL tests, including `:memory:` SQLite DAL tests and fixture-based engine tests (D-20).
- `npx tsc --noEmit` — type-check the whole repo. Passes only after `npm run build:backend` (tsup) has produced `api/_backend/app.js`, since `api/index.ts` imports the built bundle; run `npm run build` first if `tsc` reports that import missing.
- `npm run build` — full production build: `build:backend` (tsup, see below) then `vite build`.
- `npm run lint` runs `tsc --noEmit` then `lint:colors` (`scripts/lint-colors.mjs`), a check that rejects raw hex colors in `src/components/**`, `src/pages/**`, `src/features/**` (hex is only allowed in `src/index.css`). `lint:colors` passes as of T-3-08: `src/components/ui/CodeBlock.tsx`'s syntax-highlighter theme colors moved to `--syntax-*` CSS variables in `src/index.css`.

## Build and deploy
`npm run build:backend` (tsup) bundles `src/backend/app.ts` into a single ESM file at `api/_backend/app.js` plus its migration `.sql` files, for the Vercel serverless function at `api/index.ts` to import. `vite build` produces the frontend bundle in `dist/`. The Vercel-specific files (`api/index.ts`, `vercel.json`) are left untouched until phase 5 (D-23); there is no remote deployment in phase 1 (D-09) — every phase runs and is QA-tested on localhost only.

## Repository structure
- `src/domain/` — pure, engine-agnostic domain logic: enums, standard Bloomreach event/property/catalog lists (`bloomreach.ts`), `variants.ts` (variant condition evaluation, D-03). No server or database imports.
  - `src/domain/diff/` — `primitives.ts` (`diffValue`, `diffRecordSets`) and `hash.ts`, shared by import planners and the comparison engine (D-22).
  - `src/domain/import/` — pure parsers: the Bloomreach formats `dataMapping.ts`, `expirationSettings.ts`, `customerEventsExport.ts`, `dataManagerCustomers.ts`, `dataManagerEvents.ts`, plus the app's own formats `backup.ts` (full JSON backup, D-45) and `useCaseLibrary.ts` (`e3-use-case-library`, D-47/D-57: tags, flags, `catalog_attribute`/`consent` target kinds accepted). Strict-but-forgiving: malformed pieces become warnings, never thrown exceptions.
  - `src/domain/csv.ts` — `CSV_ENTITIES`: the one declared header list per entity backing CSV export (D-46).
  - `src/domain/comparison/` — the four comparison engines, all orchestrated together by `comparison.service.ts` (D-21, D-28): `definitionVsMapping.ts` (comparison 1), `mappingVsObservations.ts` (comparison 2), `definitionVsObservations.ts` (comparison 3, also runs the rules/item-schema evaluators), `definitionVsDataManager.ts` (comparison 4). `snapshot.ts` and `valueChecks.ts` are shared helpers.
  - `src/domain/bloomreach/dataManagerTypes.ts` — Bloomreach Data Manager type ↔ app `data_type`/`data_formats` mapping, both directions (D-37), used by the Data Manager import planners, exporters, and comparison 4.
  - `src/domain/rules/` — the declarative rules grammar and evaluator (D-30, D-31): `types.ts` (typed expression/operand shapes), `operators.ts` (aggregate/comparator/bound-check registries, the extension point for a new operator), `evaluate.ts` (pure evaluator), `itemSchema.ts` (per-item list validation), `runRules.ts` (wires both into comparison 3's finding shape), `templates.ts` (seed rule templates), `validate.ts` (write-time validation).
  - `src/domain/document/trackingDocument.ts` — `TrackingDocument`/`EventCard` types (D-34), the canonical shape shared by the event card page, the HTML docs export, the tracking document JSON, and the MCP `get_event_card` tool.
  - `src/domain/certification.ts` — pure `computeCertification` (D-05, D-42): applicable/certified/reasons from open and acknowledged error finding counts, event class and status, and observation presence.
  - `src/domain/narrative/useCaseNarrative.ts` — deterministic English use-case narrative template (D-32, no LLM dependency).
- `src/backend/db/` — `index.ts` (singleton `better-sqlite3` connection, migration runner) and `migrations/*.sql` (ordered schema files).
- `src/backend/dal/` — data access layer, one module per entity group, `(projectId, ...)` function shape; the only layer above `db/index.ts` that knows SQLite exists. `change-log.dal.ts` (D-44, T-3-01) is the one write-side DAL module every other mutation-writing module calls into: `recordChange` (diff via `diffValue`, actor/source/batch from `src/backend/context/actor.ts#getActor`, called inside the same transaction as the mutation) and `listChanges`/`getChangeOrThrow`/`buildCursor` for the History API. `property-definition.dal.ts` (D-58, T-4-00) is `property.dal.ts`'s sibling for a property's named definitions (`property_definitions`): list/create/update/delete (409 while linked or last remaining)/reorder, the two-way `general`-definition mirror with the property's own columns, and the batched `listAllDefinitionsById`/`listDefinitionsByPropertyIds` reads `document.service.ts`/`comparison.service.ts` use so a card/comparison build never issues one definition query per link.
- `src/backend/routes/` — Express routers, one per resource, mounted in `src/backend/app.ts`:
  - Top level: `clients`, `projects`, `use-case-templates` (global, not project-scoped).
  - Project-scoped (`/api/projects/:projectId/...`): `sources`, `properties` (gains `/:id/definitions` CRUD and `/:id/definitions/order`, D-58, T-4-00), `events`, `catalogs`, `bundles`, `files`, `export`, `history` (D-44, T-3-01/T-3-02), `identity-rules`, `consent-categories`, `standard-event-mappings`, `variants` (`project-variants.ts`), `use-cases`, `requirements-matrix`, `import` (`imports.ts`), `qa-runs`, `observations`, `comparison`, `findings`, `rules`, `rule-templates`.
  - `restore-backup.ts` — mounted unscoped at `/api/projects/restore-backup` (no `:projectId`, its own 100 MB `express.json` limit): `POST /preview`, `POST /apply` (D-45, T-3-05).
  - `export.ts` gains, alongside the phase 1/2 Bloomreach/tracking-document routes: `GET /csv` (entity list with row counts), `GET /csv/:entity` (404 `UNKNOWN_CSV_ENTITY` otherwise), `GET /backup.json` (D-46/D-45, T-3-03/T-3-04).
  - `use-case-templates.ts` (top level, global) gains `GET /export.json`, `POST /import/preview`, `POST /import/apply`, `DELETE /:id` (409 `TEMPLATE_IN_USE`) alongside the existing `GET /`/`GET /:id` (D-47, T-3-06).
  - `observations.ts` gains `PATCH /:id` (recomputes `raw_hash`, 409 `DUPLICATE_OBSERVATION`) and `DELETE /:id`, each followed by `runComparison`; `qa-runs.ts` gains `DELETE /:id` (cascades observations, then `runComparison`); `project-variants.ts`'s sibling delete route under `events.ts` (`DELETE /:id/variants/:variantId`) gains `?force=true` clearing the mapping's `variant_id` first, else 409 `MAPPING_IN_USE` (D-52, T-3-07).
  - `shared.ts` — public share-link mechanism, stub until phase 4 (D-18).
  - `removed.ts` — deleted by the T-3-08 dead-code sweep (unused since T-1-09); the `app.ts` comment noting its removal is the only remaining trace.
- `src/backend/services/` — cross-entity logic built on the DAL:
  - `dataMappingImport.service.ts`, `expirationSettingsImport.service.ts`, `customerEventsExportImport.service.ts`, `dataManagerCustomersImport.service.ts`, `dataManagerEventsImport.service.ts` — the five import planners, stateless preview-then-apply with a payload hash (D-22, D-28).
  - `bloomreachImportHelpers.ts` — shared helpers (diffing, snapshot building) for the import planners above.
  - `bloomreachExport.service.ts` — reconstructs `data-mapping.json`/`expiration-settings.json`/`data-manager-customers.json`/`data-manager-events.json` from current entities, byte-equivalent on an untouched project (D-28, D-35, D-41).
  - `comparison.service.ts` — orchestrates all four comparisons: re-resolves observations against current definitions, calls each domain engine, upserts `Finding` rows by fingerprint per comparison (D-21, D-28).
  - `eventResolution.ts` — shared event/variant resolution for a raw observed event, used by both the customer-events import and comparison recompute.
  - `requirements-matrix.service.ts` — computes the requirements matrix (rows = requirement targets, columns = use cases, cell = level).
  - `useCaseNarrative.service.ts` — generate/save the use case narrative, the `force`/409 `NARRATIVE_EDITED` guard (D-32).
  - `useCaseCoverage.service.ts` — per-requirement coverage summary for the use case page (`GET /use-cases/:id/coverage`).
  - `limits.service.ts` — Bloomreach platform limits (255 event types, 255 properties per event) consumed by the tracking document.
  - `document.service.ts` — builds `EventCard`/`TrackingDocument` (D-34), the shared model behind the event card page, the HTML docs export, `GET /export/tracking-document.json`, and the MCP `get_event_card`/`get_tracking_document` tools.
  - `export.service.ts` and `docs/sections.ts` — project documentation HTML export (D-10, D-18).
  - `qaRunExport.service.ts` — `GET /export/qa-runs/:runId/customer-events-export.json`, round-trips a QA run's observations back to the export format.
  - `codegen.service.ts` — per-event implementation snippets (GTM, Bloomreach Web SDK, Bloomreach Tracking API) plus identity codegen (`identify`/`update`/`anonymize`, D-38).
  - `csvExport.service.ts` — maps DAL rows to `src/domain/csv.ts`'s declared header order per entity (`papaparse.unparse`, BOM, CRLF, D-46).
  - `backup.service.ts` — `buildBackup(projectId)`: the full JSON backup, every table's *live* columns read through `PRAGMA table_info` (so a new column is included with no change to this file), files embedded as base64, `files_missing[]`/malformed-JSON warnings (D-45).
  - `backupRestore.service.ts` — `previewRestore`/`applyRestore`: creates a brand-new project, deep id remap over every row and parsed JSON column (D-22 hash pattern, 409 `PAYLOAD_CHANGED`), `use_case_templates` re-linked by code, files rewritten through `FileStore.put`, one `change_log` row `action: restore`, then `runComparison` (D-45, T-3-05).
  - `useCaseLibraryImport.service.ts` — preview/apply for the `e3-use-case-library` format against the global `use_case_templates` table, merged by `code` (D-22 pattern, never logged to `change_log`, D-47).
- `src/backend/files/` — `FileStore` interface and the local filesystem implementation (D-14).
- `src/backend/middleware/` — `auth.ts` (local auth mode, D-13), `project.ts` (project-scope validation), `actor.ts` (sets the request's `ActorContext` from `req.userName`, mounted right after `optionalAuth`, D-44).
- `src/backend/context/` — `actor.ts`: `AsyncLocalStorage<ActorContext>` (`actor`, `source`, `batch_id?`), `runWithActor`/`getActor`/`runWithImportBatch`; defaults to `{actor: 'system', source: 'system'}` outside any request/MCP/import wrapper (D-44, T-3-01/T-3-02).
- `src/mcp/` — the agent-facing MCP server (D-11, D-19, D-33), a sibling stdio process to the Express API sharing the same SQLite file; see "MCP server" below and `docs/MCP.md`.
- `src/features/` — frontend feature modules (`clients`, `projects`, `properties`, `events`).
- `src/pages/` — top-level routed pages.
- `src/components/` — shared UI components.
- `.claude/team/` — board, tasks, decisions, plan, samples, QA reports; see "Start here" above.
- `data/` — local SQLite database and uploaded files (gitignored).

## MCP server

`src/mcp/server.ts` (entry point, `npm run mcp` = `tsx src/mcp/server.ts`) exposes nineteen tools (`src/mcp/tools/*.ts`, registered in `src/mcp/registerTools.ts`) over stdio (`@modelcontextprotocol/sdk`'s `StdioServerTransport`, D-33) against the same `getDb()`/migrations as the Express API: `list_projects`, `list_events`, `get_event_card`, `get_expected_payload`, `list_use_cases`, `get_use_case`, `list_findings`, `get_coverage_grid`, `get_tracking_document`, `submit_observation`, `submit_observations_batch`, `finish_qa_run`, `run_comparison`, `update_observation`, `delete_observation`, `delete_qa_run` (D-52, T-3-07), `list_use_case_templates`, `instantiate_use_case_template` (D-55, T-3-10), `get_history` (D-44, T-3-02). Every tool call runs inside `runWithActor({actor: <agent_name if the tool accepts one, else 'MCP agent'>, source: 'mcp'})` so a future write tool's `change_log` rows are attributed to the calling agent automatically. Logging goes to stderr only (`src/mcp/log.ts`); a test (`src/mcp/noStdout.test.ts`) guards that nothing in `src/mcp` or `src/backend/db` ever writes to `process.stdout`, since stdio reserves stdout for the JSON-RPC wire protocol. See `docs/MCP.md` for the full tool list with expected shapes and the smoke test.

The repo root `.mcp.json` registers the server for Claude Code. Native Windows has no shell, so `spawn('npx', ...)` fails (`npx` resolves to `npx.cmd`); `.mcp.json` therefore uses the `cmd /c` form:

```json
{
  "mcpServers": {
    "e3-tracking": {
      "command": "cmd",
      "args": ["/c", "npx", "tsx", "src/mcp/server.ts"],
      "env": { "E3_DB_PATH": "./data/e3-tracking.sqlite", "E3_PROJECT_KEY": "" }
    }
  }
}
```

On macOS/Linux/WSL/Git Bash (already a shell) the plain POSIX form (`"command": "npx", "args": ["tsx", "src/mcp/server.ts"]`) works too. See `docs/MCP.md` for the full smoke test and the tool list with expected shapes.

### Migrations (`src/backend/db/migrations/`)
- `0001_core.sql` — schema v1: the full target data model (clients, projects, events, properties, variants, use cases, requirements, QA runs, observations, findings, and the rest).
- `0002_bundles.sql` — property bundles table, missing from 0001 (D-26).
- `0003_unique_soft_delete.sql` — makes the `projects.key`/`events`/`properties`/`property_bundles` unique constraints partial on `deleted_at IS NULL`, so delete-then-recreate with the same name works.
- `0004_catalog_mapping_role_soft_delete.sql` — same partial-index fix for the catalog `mapping_role='main'` uniqueness.
- `0005_identity_rules_on_delete.sql` — sets `ON DELETE` behaviour for `identity_rules.source_id`/`trigger_event_id` so deleting a referenced source or event no longer raises a raw FK error.
- `0006_variants_conditions_key.sql` — normalizes variant conditions (dedupe/sort, collapse a one-value `in` to `equals`) so equivalent condition sets share one canonical identity.
- `0007_use_case_code_soft_delete.sql` — same partial-index fix for `use_cases.UNIQUE(project_id, code)`.
- `0008_findings_on_delete.sql` — sets `ON DELETE` behaviour for `findings.observation_id` (`SET NULL`) and `findings.qa_run_id` so recompute/delete don't hit FK errors.
- `0009_event_class.sql` — replaces `events.event_type custom|system` with `events.class custom|sdk|platform` (D-29, D-36), table-rebuild pattern; backfills `sdk`/`platform` from the known system-type lists.
- `0010_data_manager_meta.sql` — adds `bloomreach_meta_json` on `properties`/`events`/`event_properties`, `events.category`, and `projects.data_manager_meta_json`/`data_manager_customers_json`/`data_manager_events_json` for the Data Manager import/export/comparison-4 snapshot (D-28, D-35).
- `0011_rules.sql` — adds the `rules` table, `properties.item_schema_json`, and `projects.money_tolerance_percent`/`money_tolerance_floor` for the rules layer (D-30, D-31).
- `0012_use_case_narrative.sql` — adds `use_cases.narrative_edited_at`, tracking a manual narrative edit versus the last `narrative_generated_at` regenerate (D-32).
- `0013_identity_alignment.sql` — renames `identity_rules.bloomreach_field` to `identifier_name`, adds `transformations_json` and `sdk_call` (D-38, D-40 Q5).
- `0014_findings_manual_resolve.sql` — adds `findings.resolved_by`, distinguishing a manual Findings-page resolve (`'user'`) from an automatic recompute resolve (`NULL`), so a manually-resolved finding whose fingerprint still reproduces stays resolved instead of reopening (D-42).
- `0015_change_log.sql` — adds the `change_log` table (entity type/id/label, parent id, action create/update/delete/restore, actor, source, batch id, field diff) and its three indexes, the record of every definition-mutating write (D-44, capability 12).
- `0016_use_case_template_tags.sql` — adds `use_case_templates.tags_json`/`flags_json` (channels/goals/tiers/kpis/industries facets plus `new`/`popular` flags, D-57).
- `0017_project_industry_and_requirement_targets.sql` — adds `projects.industry` (default facet filter) and `requirements.catalog_field_id`/`consent_category_id` (the `catalog_attribute`/`consent` requirement target kinds, D-57).
- `0021_property_definitions.sql` — adds `property_definitions` (name, description, `allowed_values_json`, `formats_json`, `example_values_json` per named meaning) and `event_properties.definition_id` (nullable, `ON DELETE SET NULL`); backfills one `general` definition per property from its own fields plus one per distinct `description_override`/`example_values_override_json` combination still in use (named after the first-linked event, `"<event> (event)"` on a collision with `general`), repoints links, then drops the two per-link override columns; also rebuilds `change_log`'s `entity_type` CHECK to add `property_definition` (D-58, T-4-00). Numbered 0021 (not 0018-0020) per the D-53 amendment 2; the migration runner applies files in name order regardless of gaps.

### Pages (`src/pages/`, matching the sidebar, `src/components/layout/Sidebar.tsx`)
Events, Properties, Catalogs, Identity rules, Consent categories, Standard events, Use cases, Use case templates (T-3-06: the global library — facet filters, import/export, instantiate), Requirements matrix, Sources, Import, QA runs, Findings, History (T-3-02: project-wide `change_log` list, filters, batch grouping) — plus Clients, Settings, Documentation, Event card, and Login.

### Phase status
Phase 1 and phase 2 are complete. Phase 3 is code complete on `agent-setup` (1178 tests, `tsc` clean, `npm run lint` green): change history with actor attribution (`change_log`, D-44), full JSON backup export and restore-as-new-project (D-45), CSV export per entity (D-46), the use case library with tags/facets/prerequisites and the standard-event mapping resolution step (D-47, D-55, D-57), QA evidence maintenance (observation edit/delete, run delete, variant-delete guard, D-52), and the dead-code sweep (D-51, `docs/` reduced to DOMAIN, QA-LOCAL, TRACKING-DOCUMENT, MCP, EXPORTS). T-3-EXIT (qa-roundtrip 1 to 11 plus the MCP smoke test on the merged tree, then a report to the user) is the remaining phase 3 step. The phase 4 plan (client collaboration: share links, comments, use case activation, property definitions) is reviewed and task rows are in `.claude/team/TASKS.md`; `.claude/team/reports/PLAN-PHASE3-4-2026-09-27.md` is the source plan; D-58 (property definitions) added task T-4-00 ahead of the rest of phase 4, before the shared view.

## Domain quick reference
See the `domain-model` skill. Core entities: Project, Event, Property, EventProperty (role normal/discriminator/context), Variant, CustomerProperty, IdentityRule, Catalog, ConsentCategory, UseCaseTemplate, UseCase, Requirement, Observation, Finding. See also `docs/DOMAIN.md` for the entity model in plain words.
