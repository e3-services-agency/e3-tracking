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
4. If port 3000 is already in use on your machine (another local app, another agent's dev server), stop the other process or change `dev:web`'s `--port` and the proxy target accordingly; there is no automatic fallback port.
5. The SQLite database and uploaded files live under `data/` (`data/e3-tracking.sqlite` by default, gitignored). Delete the file to reset local state; it is recreated with migrations applied on the next server start.
6. Environment variables (see `.env.example`): `PORT` (API port, default 3001), `E3_DB_PATH` (SQLite file path, `:memory:` for ephemeral), `E3_FILES_PATH` (uploaded file root), `AUTH_MODE` (`local` only, default), `E3_LOCAL_USER_NAME` (local actor display name), `E3_PROJECT_KEY` (MCP default project, phase 2).
7. The `.claude/launch.json` entry `e3-tracking` runs `npm run dev` on port 3000 for the qa-tester agent (D-25 Q9).

## Test and lint
- `npm test` (`vitest run`) — unit and DAL tests, including `:memory:` SQLite DAL tests and fixture-based engine tests (D-20).
- `npx tsc --noEmit` — type-check the whole repo. Passes only after `npm run build:backend` (tsup) has produced `api/_backend/app.js`, since `api/index.ts` imports the built bundle; run `npm run build` first if `tsc` reports that import missing.
- `npm run build` — full production build: `build:backend` (tsup, see below) then `vite build`.
- `npm run lint` runs `tsc --noEmit` then `lint:colors` (`scripts/lint-colors.mjs`), a check that rejects raw hex colors in `src/components/**`. `lint:colors` currently fails on a pre-existing file, `src/components/ui/CodeBlock.tsx` (hex colors in a syntax-highlighter theme, not introduced by this task); `npm test`, `npx tsc --noEmit` and `npm run build` are unaffected and are the commands to rely on until that file is fixed.

## Build and deploy
`npm run build:backend` (tsup) bundles `src/backend/app.ts` into a single ESM file at `api/_backend/app.js` plus its migration `.sql` files, for the Vercel serverless function at `api/index.ts` to import. `vite build` produces the frontend bundle in `dist/`. The Vercel-specific files (`api/index.ts`, `vercel.json`) are left untouched until phase 5 (D-23); there is no remote deployment in phase 1 (D-09) — every phase runs and is QA-tested on localhost only.

## Repository structure
- `src/domain/` — pure, engine-agnostic domain logic: enums, standard Bloomreach event/property/catalog lists (`bloomreach.ts`), `variants.ts` (variant condition evaluation, D-03). No server or database imports.
  - `src/domain/diff/` — `primitives.ts` (`diffValue`, `diffRecordSets`) and `hash.ts`, shared by import planners and the comparison engine (D-22).
  - `src/domain/import/` — pure parsers for the three Bloomreach formats: `dataMapping.ts`, `expirationSettings.ts`, `customerEventsExport.ts`. Strict-but-forgiving: malformed pieces become warnings, never thrown exceptions.
  - `src/domain/comparison/` — `definitionVsObservations.ts`, comparison 3's pure engine (D-21); the only comparison implemented so far.
- `src/backend/db/` — `index.ts` (singleton `better-sqlite3` connection, migration runner) and `migrations/*.sql` (ordered schema files).
- `src/backend/dal/` — data access layer, one module per entity group, `(projectId, ...)` function shape; the only layer above `db/index.ts` that knows SQLite exists.
- `src/backend/routes/` — Express routers, one per resource, mounted in `src/backend/app.ts`:
  - Top level: `clients`, `projects`, `use-case-templates` (global, not project-scoped).
  - Project-scoped (`/api/projects/:projectId/...`): `sources`, `properties`, `events`, `catalogs`, `bundles`, `files`, `export`, `identity-rules`, `consent-categories`, `standard-event-mappings`, `variants` (`project-variants.ts`), `use-cases`, `requirements-matrix`, `import` (`imports.ts`), `qa-runs`, `observations`, `comparison`, `findings`.
  - `shared.ts` — public share-link mechanism, stub until phase 4 (D-18).
  - `removed.ts` — unused since T-1-09, kept only as a reference for the 501-stub pattern.
- `src/backend/services/` — cross-entity logic built on the DAL:
  - `dataMappingImport.service.ts`, `expirationSettingsImport.service.ts`, `customerEventsExportImport.service.ts` — the three import planners, stateless preview-then-apply with a payload hash (D-22).
  - `bloomreachExport.service.ts` — reconstructs `data-mapping.json`/`expiration-settings.json` from current entities.
  - `comparison.service.ts` — comparison 3 orchestration: re-resolves observations against current definitions, calls the domain engine, upserts `Finding` rows by fingerprint (D-21).
  - `eventResolution.ts` — shared event/variant resolution for a raw observed event, used by both the customer-events import and comparison recompute.
  - `requirements-matrix.service.ts` — computes the requirements matrix (rows = requirement targets, columns = use cases, cell = level).
  - `export.service.ts` and `docs/sections.ts` — project documentation HTML export (D-10, D-18).
  - `codegen.service.ts` — per-event implementation snippets (GTM, Bloomreach Web SDK, Bloomreach Tracking API).
- `src/backend/files/` — `FileStore` interface and the local filesystem implementation (D-14).
- `src/backend/middleware/` — `auth.ts` (local auth mode, D-13) and `project.ts` (project-scope validation).
- `src/features/` — frontend feature modules (`clients`, `projects`, `properties`, `events`).
- `src/pages/` — top-level routed pages.
- `src/components/` — shared UI components.
- `.claude/team/` — board, tasks, decisions, plan, samples, QA reports; see "Start here" above.
- `data/` — local SQLite database and uploaded files (gitignored).

### Migrations (`src/backend/db/migrations/`)
- `0001_core.sql` — schema v1: the full target data model (clients, projects, events, properties, variants, use cases, requirements, QA runs, observations, findings, and the rest).
- `0002_bundles.sql` — property bundles table, missing from 0001 (D-26).
- `0003_unique_soft_delete.sql` — makes the `projects.key`/`events`/`properties`/`property_bundles` unique constraints partial on `deleted_at IS NULL`, so delete-then-recreate with the same name works.
- `0004_catalog_mapping_role_soft_delete.sql` — same partial-index fix for the catalog `mapping_role='main'` uniqueness.
- `0005_identity_rules_on_delete.sql` — sets `ON DELETE` behaviour for `identity_rules.source_id`/`trigger_event_id` so deleting a referenced source or event no longer raises a raw FK error.
- `0006_variants_conditions_key.sql` — normalizes variant conditions (dedupe/sort, collapse a one-value `in` to `equals`) so equivalent condition sets share one canonical identity.
- `0007_use_case_code_soft_delete.sql` — same partial-index fix for `use_cases.UNIQUE(project_id, code)`.
- `0008_findings_on_delete.sql` — sets `ON DELETE` behaviour for `findings.observation_id` (`SET NULL`) and `findings.qa_run_id` so recompute/delete don't hit FK errors.

### Pages (`src/pages/`, matching the sidebar, `src/components/layout/Sidebar.tsx`)
Events, Properties, Catalogs, Identity rules, Consent categories, Standard events, Use cases, Requirements matrix, Sources, Import, QA runs, Findings — plus Clients, Settings, Documentation, and Login.

### Phase status
Phase 1 is complete on `agent-setup`. Phase 2 is next: comparisons 1 and 2 (definition vs mapping, mapping vs observations), the certified data product card, event card UI, the machine-readable tracking-document JSON export, the MCP server (D-11, D-19), the QA narrative write-up, and QA run export.

## Domain quick reference
See the `domain-model` skill. Core entities: Project, Event, Property, EventProperty (role normal/discriminator/context), Variant, CustomerProperty, IdentityRule, Catalog, ConsentCategory, UseCaseTemplate, UseCase, Requirement, Observation, Finding. See also `docs/DOMAIN.md` for the entity model in plain words.
