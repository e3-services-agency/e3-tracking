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

## Backup and restore recipe (`qa-roundtrip` scenario 10)

On the fixture project (after the phase 1 round-trip recipe above), upload one trigger screenshot on `purchase` (event editor, Triggers section), then:

1. Settings page, "Download backup" — saves `<key>-backup-<date>.json`.
2. Clients page, "Restore backup" — paste the file or use the file input; the preview shows per-table counts matching the source project's tables and any warnings (e.g. a missing file).
3. Pick a client, enter a new project key (e.g. `fixture-copy`) and name, Apply.
4. On the new project: Events, Properties, Variants, Use cases, QA runs, Findings counts equal the source project's; the `purchase` event card shows the restored screenshot (served from the new project's own file path); the source project is unchanged (still has its own screenshot, counts, findings).
5. `GET .../export/tracking-document.json` on both projects, masking ids/timestamps/`generated_at`, is deep-equal.

Restore always creates a new project — there is no "restore into an existing project" option — and never writes `share_token`/`share_access` on the new project.

## Use case library recipe (`qa-roundtrip` scenario 11)

On the fixture project (data mapping applied, so `add_to_cart`/`purchase`/`purchase_item`/`view_item` standard event mappings exist):

1. Use case templates page (sidebar): paste `.claude/team/samples/use-case-library-sample.json` into the import box; preview shows three `create` items (`UC-01`, `UC-02`, `UC-03`); Apply.
2. Instantiate `UC-01` into the fixture project: its requirements resolve to `cart_update[action=add]` (via the fixture's `add_to_cart` standard event mapping), `product_id`, `total_price`, `checkout` (optional), and customer property `email`; a narrative is generated.
3. Instantiate `UC-02`: resolves fully against the fixture's `purchase`/`purchase_item` mappings, including the `catalog_attribute` requirement (`image`, resolved against the project's main catalog fields by name — `gap` if the fixture's main catalog has no `image` field) and the `consent` requirement (`newsletter`, resolved against consent categories by name).
4. Instantiate `UC-03`: the `wishlist_add` event requirement has `status: gap` with its note (no matching event in the fixture, and it is not a Bloomreach standard event).
5. Re-paste the same file: preview shows every item `unchanged`.
6. Mapping-step extension: rename the fixture's `purchase` event to `transactions` — a rename alone does **not** unresolve the mapping, since a `StandardEventMapping` resolves by event id, not by name. On the Standard events page, delete the `purchase` standard event mapping (the one that now points at the renamed `transactions` event) so `purchase` genuinely has no mapping. Then instantiate `UC-02` again under a new code — the preview now returns `purchase`'s targets as unresolved with candidates; pick `transactions` (and its variant/properties) in the dialog; apply. The requirement resolves, a new `StandardEventMapping` for `purchase` -> `transactions` appears on the Standard events page, and the exported `data-mapping.json` carries it.

## History checks (`qa-roundtrip` scenario 9)

1. Open `cart_update`'s event editor, edit its description, save. The editor's History section shows one row: action `update`, your user name (`E3_LOCAL_USER_NAME`/git `user.name`/"Local user"), field `description`, before/after text.
2. On an empty project, apply `data-mapping.json`. The sidebar History page shows one batch (grouped by `batch_id`) with `source: import:data-mapping` containing every created event, property, variant and standard event mapping.
3. Detach a property from an event (or delete an event-property link). The removal shows up as a `delete` row under that event's own History section (`parent_entity_id` groups event-property/variant/rule rows under their event).
4. The History page's filters (entity type, actor, source, batch) narrow the list; a batch row expands to its member rows. Filtering by `batch_id` needs the full UUID (the page currently displays only the first 8 characters of a batch id in the list — copy it from a member row's own detail, or filter without it and scan by timestamp; a full-id display is a phase 4 UI follow-up, `.claude/team/TASKS.md`).

## Certification and manual resolve (`qa-roundtrip` scenario 7)

After the steps above and a comparison run, `cart_update` shows certified `yes` **only on a fresh project that has not yet had the round-trip recipe's step 4 type edits applied to `cart_update` itself** — do the certification probe on `checkout` instead, or on a fresh project, not on `cart_update` after step 4. `cart_update`'s own `total_price`/`total_quantity` are among the round-trip recipe's retyped properties (step 4), so after that recipe `cart_update` already carries open `type_mismatch` errors (`open_errors: 2`) and starts at certified `no`, not `yes` — this is expected (see "Expected findings" above), not a certification bug, and it means `cart_update` is not a clean starting point for the yes → no → yes probe below. To exercise the certified/not-certified flip and the D-42 manual-resolve acknowledgement path, use the `qa-roundtrip` skill's scenario 7 exactly as written on an event that starts certified: attach a **new** property (e.g. `coupon_code`) and mark it required — an observation that does not carry it reliably produces a `missing_required` error (unlike retyping an existing mapped property such as `total_price`, which the fixture observation already carries in a form that satisfies the type, and so will not flip certification). Do not use the type-mismatch properties from the round-trip recipe above (`total_price`, `price`, `quantity`, `total_quantity`, `stock_level`, `is_new`) for this exercise — those already produce their `type_mismatch` findings by design and are not a clean certified→not-certified probe.

Phase 2's Data Manager round trip is `qa-roundtrip` scenario 8; the expected comparison-4 findings are in `docs/DOMAIN.md`'s "Definition vs Data Manager" section. The two Data Manager paste boxes on the Import page are plain textareas with no file upload yet (a phase 3 UI gap, `.claude/team/TASKS.md` follow-up list): `data-manager-events.json` alone is roughly 360 KB of single-line JSON, which is impractical to paste by hand through a browser textarea. For QA, apply large Data Manager fixtures directly against the API instead of the UI: `POST /api/projects/:id/import/data-manager-events/preview` (and the `-customers` equivalent) takes the raw fixture JSON as the whole request body and returns the diff plus `payload_hash`; `POST .../data-manager-events/apply` takes `{payload: <the same raw fixture JSON>, payload_hash, selected_item_ids}` (the same D-22 preview/apply/hash shape the UI itself calls) — `curl -X POST -H "Content-Type: application/json" --data-binary @data-manager-events.json .../preview` for the first call, then build the apply body from its response, or script both with `fetch`/`curl`. The result is identical to using the UI, since both call the same service. Reserve the UI textareas for smaller fixtures (`data-mapping.json`, `expiration-settings.json`, `customer-events-export.json`) where pasting is practical.

## Shared view recipe (`qa-roundtrip` scenarios 12-13)

On the fixture project (after the phase 1 round-trip recipe above):

1. Set a marker value on an internal-only field so a leak is easy to spot later — e.g.
   `agent_instructions` on `purchase`, `identity_note` on any event, `owner_business`/
   `owner_technical`, or `use_case.internal_notes`/`internal_url` on an instantiated use case.
2. Settings page, "Share" block: Generate a link with access `read`. Copy the URL
   (`http://127.0.0.1:<vite-port>/tracking-plan/shared/<token>`).
3. Open that URL in a **private/incognito window** (no cookies, no session — `AUTH_MODE=local` has
   none to carry anyway, but a private window rules out any doubt). Expect: no login prompt; a
   project header with the client name; custom events first, sdk/platform collapsed; the
   `purchase` trigger screenshot (if one was uploaded) loading through
   `/api/shared/<token>/files/...`; use cases with their narrative and `documentation_url`; both
   "Download JSON" and "Download HTML" working; **no edit controls anywhere** and, with `read`
   access, **no comment form**. Grep both downloads and the live DOM for the marker from step 1 —
   it must not appear anywhere.
4. Settings, change access to `comment`. Reload the shared page: a comment form now appears on
   event cards, use cases, and requirement rows. Post one with an author name (e.g. "Client QA").
   It should appear immediately in the shared view; internally, the same comment shows on the
   Comments page and on the event/use case editor's comments panel with a `via share` badge.
   Because comments are one shared thread (D-49 amendment), an internal reply posted from inside
   the app on the same anchor is visible back through the share link too — post one and confirm.
   Then post an internal comment with "Internal only" checked: it must be absent from the shared
   page and from `GET /api/shared/<token>/comments`. Finally set Settings, "Show internal comments
   on the shared view", to "Only comments posted through the link": a plain internal reply
   disappears from the shared page while the client's comment stays.
5. Settings, "Revoke". Reload the same URL: "This link is not valid." (404 `SHARE_NOT_FOUND`).
6. `E3_DB_PATH`: if running a scratch database for this recipe (recommended, so it does not disturb
   whatever project you were already exploring), set it before starting the API
   (`E3_DB_PATH=data/qa-shared.sqlite npx tsx src/backend/server.ts`), per the "PORT 3000 RULE"
   two-process setup above.

See `docs/SHARING.md` for the full route list, the exact fields the public projection strips, and
the comment rate limit.

## Sandbox creation recipe (`qa-roundtrip` scenario 14)

1. Clients page: "Create a sandbox" (no client selection needed on a fresh install — an "Sandboxes"
   client is auto-created). This restores the bundled `.claude/team/samples/sandbox-project-backup.json`
   (built by `scripts/build-sandbox-backup.mjs`) as a brand-new project: key `sandbox-acme-eu` (a
   second sandbox created the same way gets `sandbox-acme-eu-2`, never a doubled
   `sandbox-sandbox-...` key), badged "SANDBOX" in the header switcher and the Clients list.
2. Selecting it: 62 events, 648 properties, 3 use cases (`UC-01`..`UC-03`), 75 open findings plus
   exactly 1 resolved with `resolved_by: 'user'` (an acknowledged finding, D-42, so the
   acknowledge/certification path has evidence to inspect immediately).
3. Getting started on the sandbox: 9 steps, 7 done (only "Review property types" is intentionally
   left with an open `type_mismatch`, and "Create a share link" is open since a sandbox refuses
   sharing without confirmation — see below).
4. Sharing a sandbox: Settings shows a plain sentence ("This is a sandbox project. Sharing is
   disabled by default...") and asks for confirmation before sending `force: true` on the same
   `POST /share` call (D-60) — confirm to proceed, same as a normal project's Generate button
   afterwards.
5. Bulk delete: Clients page, sandbox section, select one or more and delete. Deleting the
   *active* sandbox moves the project shell to a surviving project (or clears it if none remain) —
   it must not strand the app on a 404 loop.

## Getting-started checklist (`qa-roundtrip` scenario 14)

`GET /api/projects/:id/getting-started` computes all nine steps live from the data — there is no
stored "progress" row, so any path (UI, MCP, a script) that produces the underlying data flips the
step immediately on next load:

1. Create a client and a project — vacuously done the moment a project exists.
2. Import the data mapping.
3. Import expiration settings.
4. Review property types — done when there is no open `type_mismatch` finding (also vacuously true
   on a brand-new project with zero properties).
5. Import Data Manager files (both `data-manager-customers.json` and `-events.json`).
6. Capture observations.
7. Run a comparison — coarse: any finding row at all (open or resolved) counts, there is no
   separate "last run at" timestamp.
8. Instantiate a use case.
9. Create a share link.

Each step's "Go" link switches directly to the relevant sidebar tab. The checklist itself is on its
own sidebar page ("Getting started"), always reachable (not just on a fresh project), so a client
milestone can be revisited after everything is done.

## Open findings baseline on the fixture project (`qa-roundtrip` scenario 4)

Two different chains produce two different, both-correct baselines on the merged `agent-setup` tree — pick the one that matches what you have actually applied to the project:

- **Phase 1 chain only** — `data-mapping.json`, `expiration-settings.json`, the round-trip recipe's step 4 type edits, `customer-events-export.json`, no Data Manager files: **35 open findings (11 error / 4 warning / 20 info)**. The certification section above ("Certification and manual resolve") and the scenario 8 note above assume **this** chain (Data Manager import happens separately, as scenario 8 itself, and is not part of their setup).
- **Full chain, both Data Manager files also applied** (`data-manager-customers.json` and `data-manager-events.json`, scenario 8, comparison 4 joining comparisons 1–3): **77 or 78 open findings (40 error / 37 or 38 warning; one missing_event warning varies with the Data Manager apply order)**.

The `qa-roundtrip` skill's scenario 4 text must state both chains with their counts (35/11/4/20 without Data Manager, 77/40/37 with it), not a single number.
