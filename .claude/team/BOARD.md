# Team message board

Append-only. Format and rules in the `board-protocol` skill.

### 2026-09-24 | user -> ALL | DECISION | -
Setup approved. Branch `agent-setup` created from `main`; `main` stays untouched. Scaffold under `.claude/` and root `CLAUDE.md`. Next: read-only repo audit, then architecture plan for user approval, then phased implementation.

### 2026-09-24 15:11 | repo-auditor -> supervisor | INFO | T-0-02
Read-only audit complete. App is Supabase-only (no local persistence, D-09 unmet); domain model covers Event/Property/EventProperty/Catalog/Source but has no discriminator-conditions Variant, IdentityRule, ConsentCategory, UseCase/Requirement, Observation, or Finding. No Bloomreach JSON import/export exists. `qaOverlayInjection.ts` injects manual QA proofs into exported docs HTML, not live event capture. No Google Sheets/Apps Script code dependency found. Recommendation: rebuild the core domain/import-export/comparison layer, refactor and reuse the existing Events/Properties/Catalogs CRUD and export pipeline. Full report: `.claude/team/reports/AUDIT-2026-09-24.md`.

### 2026-09-24 15:27 | supervisor -> ALL | DECISION | T-0-03
D-10 (Journeys deprecated, use cases replace them, no sequence view) and D-11 (agent-driven QA through an MCP server exposed by the app) recorded. CONTEXT.md capabilities 10, 13, 14 updated; domain-model skill gains QaRun and the MCP surface. Architect started on T-0-03.

### 2026-09-24 15:40 | architect -> supervisor | INFO | T-0-03
Plan written: `.claude/team/reports/PLAN-2026-09-24.md`. Decision records D-12 to D-24 appended to DECISIONS.md.
- Local runtime: SQLite via the already-installed better-sqlite3 (WAL, fresh schema, DAL as swap boundary), local single-user auth with Supabase removed, local FileStore, `npm run dev` starts API (3001) and Vite (3000); vitest is the test runner (D-12, D-13, D-14, D-20, D-23).
- Model: Workspace becomes Project; enums live once on Property.allowed_values; EventProperty carries role/required/payload_key; new Variant (conditions over max two discriminators) plus StandardEventMapping for empty-filter mappings; old EventVariant, journeys, QA overlay, legacy store and metrics removed in phase 1 while a project-scope HTML docs export stays alive (D-15, D-16, D-17, D-18, D-24).
- QA: stateless preview/apply imports sharing diff primitives with the comparison engine; finding fingerprints, three extra kinds, severity table and certification rule (D-21, D-22); MCP as a sibling stdio process on the same SQLite file (D-19).
- Phases: 1 local runtime + core model + three imports + definition-vs-observations (10 tasks T-1-01..T-1-10 proposed in the plan); 2 full three-way comparison, certification, cards, MCP; 3 history, backup, CSV, library import; 4 project-wide share and comments; 5 remote (unplanned, needs approval).
- 13 open questions for the user are listed at the end of the plan (priority values, status set, missing_event severity, bundles, MCP project binding, launch config for qa-tester, certification precondition, consent direction, journey data before deletion).

### 2026-09-24 15:49 | supervisor -> user | QUESTION | T-0-04
PLAN-2026-09-24 reviewed and accepted by the supervisor. D-25 records rulings on open questions 1, 2, 4, 5, 7, 8, 9, 10, 12. Questions 3 (standard-event vocabulary), 6 (property bundles), 11 (consent mapping direction), 13 (journey data export) go to the user together with plan approval. Phase 1 tasks T-1-01..T-1-10 are adopted into TASKS.md on approval.

### 2026-09-24 16:03 | supervisor -> ALL | DECISION | T-0-04
Plan approved by the user. Standing authorisations: commit per accepted task and merge into agent-setup; report per phase plus checkpoint T-1-CP after T-1-03. D-26 (extensible standard events and consent keys, bundles kept, no journey export) and D-27 (Client above Project, copy with provenance) recorded. Phase 1 tasks T-1-01..T-1-10 adopted with deltas. Launch config .claude/launch.json entry e3-tracking added. Starting T-1-01.

### 2026-09-24 16:05 | implementer -> ALL | INFO | T-1-01
Starting T-1-01: SQLite persistence, schema v1, dev server, vitest, domain definitions module. Branch task/T-1-01-sqlite-foundation off agent-setup. Verified node_modules/better-sqlite3/build/Release/better_sqlite3.node exists and loads; not blocked.

### 2026-09-24 16:16 | implementer -> supervisor | HANDOFF | T-1-01
Task: T-1-01 SQLite persistence, schema v1, dev server, vitest, domain definitions module
Branch: task/T-1-01-sqlite-foundation
Changed: src/backend/db/index.ts (getDb/closeDb, WAL, foreign_keys, busy_timeout, E3_DB_PATH/:memory:, migration runner), src/backend/db/migrations/0001_core.sql (clients, projects incl. D-27 columns, project_members, sources, catalogs, catalog_fields, properties, events, event_sources, event_properties, variants, standard_event_mappings, identity_rules, consent_categories, use_case_templates, use_cases, requirements, qa_runs, observations, findings with stated unique constraints/indexes), src/backend/db/db.test.ts, src/domain/enums.ts + enums.test.ts, src/domain/bloomreach.ts + bloomreach.test.ts, src/backend/server.ts (createApp + getDb, port 3001/PORT), package.json (dev/dev:api/dev:web/test/test:watch scripts, vitest+concurrently+@types/better-sqlite3 devDeps), vite.config.ts (proxy /api and /tracking-plan/api to :3001), tsup.config.ts (externalise better-sqlite3), vitest.config.ts (new, standalone node config), .gitignore (+data/), .env.example (new).
How to verify: 1) `npm install` 2) `npm test` -> 3 files / 37 tests pass 3) `npm run dev:api` then `curl localhost:3001/api/health` -> {"ok":true}, check `data/e3-tracking.sqlite` appears (WAL mode) 4) `npm run dev` starts API+Vite together 5) `npm run build` succeeds; `api/_backend/app.js` does not contain "better-sqlite3" (externalised).
Tests: npm test -> "Test Files 3 passed (3), Tests 37 passed (37)". npm run lint -> tsc reports 54 pre-existing errors, all in untouched legacy files (Journeys.tsx, Sources.tsx, useJourneyCanvas.ts, useBundleEditor.ts, supabase.ts, Login.tsx, Documentation.tsx, serializeHandoffData.ts); confirmed identical count on agent-setup before this task's changes (git stash diff), and zero errors under src/domain/** or src/backend/db/** or src/backend/server.ts. npm run build -> tsup + vite build both succeed.
Known gaps: Supabase-backed routes are untouched and will 503 without SUPABASE_* env vars, as expected until T-1-02. No CHECK constraints on enum columns in SQL (enum validation is DAL-level work for T-1-04/05/06/07, out of this task's scope); columns are plain TEXT. `mcp` script left as a placeholder (not added, per task note "can wait"). property_type/event_type share one domain type `OriginType` (custom|system) since the plan gives both the identical value set; flagged in code comment.
Decisions needed: none. Confirmed via fixtures that `paper_catalogue` and `loyalty_update` (observed in customer-events-export.json) are deliberately excluded from `KNOWN_SYSTEM_EVENT_TYPES` in bloomreach.ts (documented in a code comment) so the T-1-09 unexpected_event reproduction still fires for them; only D-25's explicit 13-item list is included.
