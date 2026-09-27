# Local QA runtime

How to start the app and run QA against it on localhost, per D-09 (local-first: every phase is tested end to end on the developer machine before any remote deployment).

## Starting the app

Two equivalent ways:

- Launch config: `.claude/launch.json` entry `e3-tracking` (`npm run dev` on port 3000), used by the qa-tester agent (D-25 Q9).
- Manually: `npm run dev` from the repository root. This starts the Express API (`tsx watch src/backend/server.ts`, port 3001) and the Vite dev server (port 3000) together.

Open the app at `http://127.0.0.1:3000/tracking-plan/`.

### Port 3000 already in use

Ports 3000 and 3001 are shared with other local agents/processes on some machines. If port 3000 is taken, stop the process using it before starting `npm run dev` — there is no automatic fallback port configured in `vite.config.ts`. Do not change the port without checking with whoever owns the other process; the Vite dev proxy for `/api` and `/tracking-plan/api` is hardcoded to `http://localhost:3001`.

### PORT 3000 RULE (qa-tester workaround, phase 2)

Port 3000 (Vite) is reserved for whoever is actively developing/using the app through `.claude/launch.json`'s `e3-tracking` entry (D-25 Q9); a qa-tester agent must never occupy or kill it. From T-2-01 onward, qa-tester starts the API and Vite as two separate processes instead of `npm run dev`: the API on 3001 as usual (`tsx watch src/backend/server.ts`, or `E3_DB_PATH=<scratch path> npx tsx src/backend/server.ts`), and Vite on a different port with `npx vite --port 3010 --host 0.0.0.0`, then opens `http://127.0.0.1:3010/tracking-plan/`. This is a manual local workaround, not a project default — `vite.config.ts` still hardcodes the `/api` proxy target to `http://localhost:3001`, so only the Vite port itself needs to move; no other config changes. The `3010`/`0.0.0.0` combination produces a harmless Vite HMR "WebSocket connection failed" console message (no matching HMR client port), which is not an application defect. Both processes must be stopped and their ports confirmed free (`netstat`) at the end of a QA session, per the `qa-tester` agent definition.

### MCP server QA

To test the MCP server instead of (or in addition to) the web UI, see `docs/MCP.md` for `.mcp.json`, the tool list, and the smoke test — the MCP server needs no Express process; it opens `E3_DB_PATH` directly, so it can be exercised entirely with the web app stopped.

## Resetting the database

The SQLite database is a single gitignored file, default `./data/e3-tracking.sqlite` (path configurable via `E3_DB_PATH`). To reset local state, stop the server and delete that file (and its `-wal`/`-shm` companions if present). The next server start recreates it and reapplies every migration in `src/backend/db/migrations/`.

Uploaded files (event trigger screenshots, project logos) live under `./data/files/` (configurable via `E3_FILES_PATH`); delete that directory to clear them.

## Environment variables relevant to QA

- `E3_LOCAL_USER_NAME` — display name recorded as the actor on QA runs and history entries in local auth mode. Falls back to `git config user.name`, then `"Local user"` (D-25 Q8).
- `E3_DB_PATH` — SQLite file path. Use a scratch path (or `:memory:` for tests) to avoid touching the shared local database while exploring.
- `E3_PROJECT_KEY` — default project key for the MCP server when a tool call omits `project_key` (D-25 Q7); see `docs/MCP.md`. Leave empty to require `project_key` on every MCP tool call.

See `.env.example` for the full list and one-line descriptions of every local variable.

## Fixtures

Sample Bloomreach exports and other QA fixtures live in `.claude/team/samples/`.

## Where to save QA exports

Save QA run output (exported findings, screenshots, notes) under `.claude/team/reports/qa/<TASK-ID>/`, one subfolder per task.

## Phase 1 round-trip recipe

This is the manual sequence used by the phase 1 fixture tests (`dataMappingImport.service.test.ts`, `customerEventsExportImport.service.test.ts`, `comparison.service.test.ts`) — repeat it by hand through the UI (Import page) to verify comparison 3 end to end on a fresh project.

1. Create a client and a project.
2. Import page, data mapping format: paste `.claude/team/samples/data-mapping.json`, preview the diff, select all items, apply. This creates the six events (`purchase`, `purchase_item`, `checkout`, `cart_update`, `view_item`, `view_category`) plus their properties, variants and standard-event mappings.
3. Import page, expiration settings format: paste `.claude/team/samples/expiration-settings.json`, preview, apply.
4. Properties page, apply the test definition edits so the fixture's type findings can fire:
   - `total_price` and `price` — data type `number`, data format `money`.
   - `quantity`, `total_quantity`, `stock_level` — data type `number`.
   - `is_new` — data type `boolean` (create it on `purchase_item` if it does not already exist).
5. Import page, customer events export format: paste `.claude/team/samples/customer-events-export.json`, preview (expect 19 items, 0 duplicates), select all, apply. This creates one QA run and 19 observations, and runs comparison 3 automatically.
6. Comparison page (or QA runs / Findings page): trigger `POST /comparison/run` if the findings list looks stale, then open the Findings page.

Expected findings, definition vs observations (comparison 3, D-21):
- `type_mismatch` — `total_price`, `price`, `is_new` arrive as JSON strings (`"28"`, `"TRUE"`) against `number`/`boolean` definitions.
- `rounding_drift` — `purchase_item.price` (28.4) times quantity vs `purchase.total_price` (28), tolerance 0.01.
- No `missing_event`/`unexpected_event` for the six mapped types (`cart_update`, `checkout`, `purchase`, `purchase_item`, `view_category`, `view_item`).
- The other 12 raw event types stay unresolved by design: known Bloomreach system types (`consent`, `survey`, `campaign`, `support_ticket`, `managed_endpoint`) are suppressed (D-25 Q5), and genuinely unmapped types (`paper_catalogue`, `loyalty_update`) surface as `unexpected_event` (info).

Where the artefacts go: the QA run and its observations/findings live in the project's SQLite tables, readable from the QA runs and Findings pages; there is no file export of a QA report yet (phase 2, capability 14). Save any notes or screenshots from a manual run under `.claude/team/reports/qa/<TASK-ID>/` as above.

## Certification and manual resolve (`qa-roundtrip` scenario 7)

After the steps above and a comparison run, `cart_update` shows certified `yes`. To exercise the certified/not-certified flip and the D-42 manual-resolve acknowledgement path, use the `qa-roundtrip` skill's scenario 7 exactly as written: attach a **new** property (e.g. `coupon_code`) to `cart_update` and mark it required — the fixture's `cart_update` observation does not carry it, so this reliably produces a `missing_required` error (unlike retyping an existing mapped property such as `total_price`, which the fixture observation already carries in a form that satisfies the type, and so will not flip certification). Do not use the type-mismatch properties from the round-trip recipe above (`total_price`, `price`, `quantity`, `total_quantity`, `stock_level`, `is_new`) for this exercise — those already produce their `type_mismatch` findings by design (see "Expected findings" above) and are not a clean certified→not-certified probe.

Phase 2's Data Manager round trip is `qa-roundtrip` scenario 8; the expected comparison-4 findings are in `docs/DOMAIN.md`'s "Definition vs Data Manager" section.
