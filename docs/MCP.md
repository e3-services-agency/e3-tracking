# MCP server (`src/mcp/`)

[Use-case maintenance tools and compatibility](MCP-USE-CASE-MAINTENANCE.md) · [UI/MCP parity audit](MCP-UI-PARITY-WP-UC-2026-10-19.md).

Production release: [compact reads and shared agent conventions, 2026-10-19](RELEASE-MCP-COMPACT-2026-10-19.md).

An agent-facing sibling process (D-11, D-19, D-33): the same SQLite file and services as the Express
API, exposed over the [Model Context Protocol](https://modelcontextprotocol.io) instead of HTTP, so a
coding agent (Claude Code, or any other MCP client) can read a project's tracking plan and record a
QA round without going through the web UI.

- Entry point: `src/mcp/server.ts` (`npm run mcp` = `tsx src/mcp/server.ts`).
- Transport: stdio (`@modelcontextprotocol/sdk`'s `StdioServerTransport`) — one process per session,
  started by the MCP client, not a long-running server you start by hand for normal use.
- Logging: `src/mcp/log.ts`, stderr only. Stdio reserves stdout for the JSON-RPC wire protocol —
  nothing in `src/mcp/` or `src/backend/db/` may ever write to `process.stdout` (enforced by a test,
  `src/mcp/noStdout.test.ts`).
- Database: the same `getDb()` singleton and migrations as the Express API (`src/backend/db/index.ts`),
  opened via `E3_DB_PATH` — point it at the same file as the running app (`./data/e3-tracking.sqlite`)
  to see the same projects, or at a scratch/`:memory:` path to experiment without touching your data.
- Tools: see the generated inventory below, implemented as plain async handlers in `src/mcp/tools/*.ts` and registered in
  `src/mcp/registerTools.ts` (so a later HTTP transport can mount the same handlers without touching
  their logic): `list_projects`, `list_events`, `get_event_card`, `get_expected_payload`,
  `list_use_cases`, `get_use_case`, `list_findings`, `summarize_findings`, `get_finding`, `get_coverage_grid`, `get_tracking_document`,
  `submit_observation`, `submit_observations_batch`, `finish_qa_run`, `run_comparison`,
  `update_observation`, `delete_observation`, `delete_qa_run`, `list_use_case_templates`,
  `instantiate_use_case_template`, `get_history`, `preview_historical_validation`, `apply_historical_validation`, `get_historical_validation` — the plan table's twelve
  (`PLAN-PHASE2-2026-09-25.md` lines ~205-225) plus `get_tracking_document` (not in the plan table),
  three QA evidence tools added in T-3-07 (D-52: each mirrors the matching REST route and is followed
  by `run_comparison`), `list_use_case_templates`/`instantiate_use_case_template` (T-3-10, D-55: the
  global use case template library and its add-to-project and preview flow), and `get_history` (T-3-02, D-44:
  read-only access to a project's `change_log`).
  `instantiate_use_case_template` takes `project_key?`, `template_code`,
  `code?`, `mappings?` (`{index, event_id, variant_id?, property_id?}[]`, the mapping-step dialog's
  answers for unresolved standard-event targets, saved as standard event mappings before the
  requirements are created) and `dry_run?` (when true, returns the resolve preview -- `resolved`,
  `unresolved` with candidates, plus the templates page's `groups` -- without creating anything).
- Actor attribution: the authenticated Workspace grant supplies the human actor; the supplied agent_name is retained separately as an agent label. Local stdio uses an explicitly unverified local actor. Change records, QA runs and write receipts retain both. See [shared agent conventions](AGENT-CONVENTIONS.md).
- Finding priority (D-89, T-5-47): `list_findings` rows carry `priority` (`P1`-`P4`),
  `priority_rank` and, with `include: "detail"` or field selection, `priority_reasons`, derived at read time by `src/domain/findingPriority.ts`
  (severity x the event's tier: transactional `server_api` event, then required by a live use case
  at level R, then event priority critical/high; see `docs/TRACKING-DOCUMENT.md`), and come back in
  priority order (lowest `priority_rank` first, the same as the internal `GET /findings` default). The
  optional `priority` input (`"P1,P2"`) keeps only those priorities; an unknown value is a
  `PRIORITY_INVALID` tool error. `get_event_card` and `get_tracking_document` carry the same three
  fields on every finding, and `findings_summary.open_p1_count`.

## Compact reads and migration (2026-10-19)

**Documented default change:** `list_findings`, `list_events`, `list_use_cases` and `get_history`
now return a page envelope instead of a bare array. Existing argument names still work, but callers
must read `result.items` and follow `next_offset` until it is `null`. Default `limit` is **10** for findings/history and **100** for events/use cases,
maximum **1000**, and default `offset` is **0**. This replaces the old unbounded lists and the
history tool's old 100-row default. REST/UI response shapes and business logic are unchanged.
All MCP tool text uses compact JSON serialization.

```json
{"items":[],"total":0,"offset":0,"limit":10,"returned":0,"next_offset":null,"truncated":false,"result_marker":"collection-hash"}
```

`total` counts the entire filtered result before paging; `truncated` means there are more rows
after this page. A terminal or out-of-range page has `next_offset: null` and `truncated: false`.
To retrieve every row, repeat identical filters/field selection with the returned `next_offset`.
For a result of at most 1000 rows, `limit: 1000, include: "detail"` retrieves its full public rows
in one response. Each page and marker come from the same database snapshot. Compare
`result_marker` across pages and restart if it changes. Database revisions cover definitions,
derived-priority inputs, closures/reopenings and completed comparisons, including unchanged output.

Every list accepts `fields: ["id", ...]` for exact field selection or `include: "detail"` / `include: "body"` for all
public fields. `fields` overrides `include`. Unknown/private fields are errors, including on empty
pages. `project_id` is omitted from every row, including detail rows. Detail and explicit large
pages can exceed the typical 10k-character target; no field value is silently shortened.

| Tool | Default row fields | Additional detail/selectable fields |
| --- | --- | --- |
| `list_findings` | `id`, `finding_sequence`, `fingerprint`, `priority`, `priority_rank`, `status`, `severity`, `comparison`, `kind`, `event_id`, `event_name`, `property_id`, `property_name`, `first_seen_at`, `last_seen_at`, `resolved_at` | `variant_id`, `observation_id`, `qa_run_id`, `resolved_by`, `message`, `expected_json`, `actual_json`, `priority_reasons` |
| `list_events` | `id`, `name`, `class`, `status`, `priority`, `created_at`, `updated_at` | `certification`, `variants`, `discriminators`, `contexts`, `required_properties` |
| `list_use_cases` | `id`, `code`, `name`, `type`, `status`, `priority`, `created_at`, `updated_at`, `requirement_count` | `description`, `narrative`, `documentation_url` |
| `get_history` | `id`, `entity_type`, `entity_id`, `entity_label`, `parent_entity_id`, `action`, `actor`, `agent`, `source`, `batch_id`, `changed_at` | `diff_json` |

**Findings summary and filters.** Start operator investigations with
`summarize_findings({project_key: "one-day-only-production"})`. It returns `total`, `by_status`,
`by_priority`, `by_severity`, `by_comparison`, `by_kind`, `by_event` (an array of
`{event_id,event_name,count}`, with null IDs/names for unattached or missing definitions),
`newest_first_seen_at` and `newest_last_seen_at`. Empty results have empty
count maps and null newest dates. Both findings tools default to `status: "open"`; explicitly
use `status: "all"` for open and resolved findings together. Summary counts and dates cover the
entire filtered result, never just one page.

The summary and list accept identical filters: `event` (name/ID), `property` (name/ID; an
ambiguous name requires an ID), `severity`, `priority` (comma-separated, e.g. `"P1,P2"`),
`comparison`, `kind`, `status`, `qa_run_id`, and inclusive `first_seen_from`, `first_seen_to`,
`last_seen_from`, `last_seen_to`. Ranges require ISO timestamps with an explicit timezone.
`list_events` retains the default custom-class filter; pass `class: "all"` for every class.

**Conditional object reads.** `get_event_card`, `get_use_case`, `get_finding` (takes `finding_id`)
and `get_historical_validation` add a SHA-256 `hash` to their normal full public response.
Send that value as `if_hash` on subsequent reads:

```json
{"unchanged":true,"id":"object-id","hash":"previous-64-character-sha256","state":"open"}
```

A match returns only these metadata fields; a mismatch returns the new full response and hash.
Hashes cover canonical public response content, including derived priority/coverage and related
definitions or requirements. Internal use-case notes/URLs remain excluded. Historical hashes are
specific to the requested `limit`/`offset` page and cover live source availability and linked event
labels; the immutable `identity_hash` is a separate provenance field and is not a cache validator.
Historical reads retain their existing default/max limit of 100 checks and existing response keys,
and add `total`, `next_offset`, `truncated` and `hash`.

**Deferred:** a durable `since` change cursor across findings/history/reports is a later phase.
First-/last-seen date filters do not claim to detect closures or reopenings. That cursor needs a
mutation stream covering edits and every lifecycle transition; it cannot safely use observation
timestamps alone. This change adds no business statuses, approval/certification or comparison rules.

Acceptance verification: `src/mcp/tools/compactReads.test.ts` checks summary totals, response sizes,
all detail pages and matching/changed conditional finding reads against an in-memory database.
`node --import tsx scripts/verify-mcp-finding-rows.ts <captured-findings.json>` checks the summary
projection and pagination against an existing MCP response without opening a database. That command
prints only counts/size/check results. A read-only capture of the live ODO default
`list_findings` on 2026-10-19 had **486 open rows** and **524,502 response characters**; the new
summary projection was **1,692 characters**, its readable default page **6,026 characters**, and concatenated
detail pages preserved every public field (excluding repeated `project_id`). This was local
verification against captured live rows, not a deployment of the new tools.

## Definition write tools (T-5-01)

The definition tools are: `create_event`, `update_event`, `create_property`,
`update_property`, `link_event_property`, `unlink_event_property`, `create_identity_rule`,
`set_event_identifiers`, `create_catalog_field` and `batch_apply`. They call the same DAL functions
as the REST routes (so the same validation, error codes and `change_log` rows). Common arguments
are `project_key` (or the `E3_PROJECT_KEY` default), `agent_name` (a label separate from the verified
human actor), `dry_run` (**default true**), and optional `idempotency_key`.

**The dry-run pattern (D-04).** With `dry_run: true` (or omitted) the tool runs the real write inside
a SQLite transaction that is always rolled back: you get full validation and the resulting row,
without domain or `change_log` writes. An optional key retains an operational preview receipt.
Review the diff, then repeat with `dry_run: false`, using a new key if the preview had one.
Result shape (same for every definition tool):

```json
{
  "dry_run": true,
  "action": "create | update | unchanged | delete",
  "entity_type": "event", "entity_id": null, "label": "page_view",
  "before": null,
  "after": { "id": "...", "name": "page_view", "...": "..." },
  "differences": [{ "kind": "change", "field": "description", "before": "a", "after": "b", "...": "..." }],
  "warnings": [],
  "change_log_id": null,
  "change_log_ids": []
}
```

`differences` is filled for `update` (one entry per changed field, via `diffValue`; timestamps are
ignored). On apply, `change_log_id` is the history row of the entity and `change_log_ids` every row
the call wrote (e.g. a link that also created a definition). `unlink_event_property` reports
`action: "delete"`. Failures return `isError` with `CODE: message` using the REST error code
(`CONFLICT` and `VALIDATION_ERROR`, `IDENTIFIER_TYPE_MISMATCH` naming the registry
type, ...), plus `EVENT_NOT_FOUND`, `PROPERTY_NOT_FOUND`, `AMBIGUOUS_PROPERTY` (pass `scope`),
`CATALOG_NOT_FOUND`, `LINK_NOT_FOUND`.

| Tool | Arguments (besides the three common ones) |
| --- | --- |
| `create_event` | `name` + any REST event field (`class`, `implementation_method`, `dl_event_name`, `identifiers_json`, `description`, `status`, ...) |
| `update_event` | `event` (name or id), `new_name?`, any REST event field |
| `create_property` | `scope` (event/customer), `name`, `data_type` + REST property fields; `allowed_values`, `data_formats`, `example_values` alias the `*_json` fields |
| `update_property` | `property` (name or id), `scope?` (when the name exists in both scopes), `new_name?`, `data_type?`, same fields incl. `kind`, `category_override` |
| `link_event_property` | `event`, `property`, `property_scope?` (default `event`; a customer property needs `property_scope: "customer"`), `role` (normal/discriminator/context), `required`, `definition?` (name; created when missing, D-58), `definition_description?`, `priority`, `status`, `payload_key`, `sort_order`. Updates the link when it exists |
| `unlink_event_property` | `event`, `property`, `property_scope?` (default `event`, as for link) |
| `create_identity_rule` | `name`, `identifier_name` (or `identifier_id`), `identity_type?` (honoured only for a new identifier, D-69 amendment 1), `trigger_event?` (name or id), `sdk_call`, `transformations_json`, ... |
| `set_event_identifiers` | `event`, `identifiers`: names from the identifier registry, `[]` = carries nothing, `null` = derived (D-67) |
| `create_catalog_field` | `catalog` (name or id), `name`, `data_type`, `is_searchable`/`searchable`, `is_required`/`required`, `is_lookup_key`/`lookup_key`, ... |
| `batch_apply` | `operations`: `[{op: "<tool name>", ...that tool's arguments}]` |

**History and strictness.** MCP writes appear on the History page with source `mcp` (single tools) and `import:mcp` (`batch_apply`). Unknown argument keys (typos) are a validation error listing the keys, for single tools and for each batch operation; DAL error `details` are appended to the error text when present.

**`batch_apply`.** Runs the operations in order with one `dry_run` flag. Applied operations run in one
import batch (`runWithImportBatch`), so all their `change_log` rows share a `batch_id` and show up
grouped on the History page (source `import:mcp`, verified human actor and separate agent label). It stops at the first error:
the result is `{dry_run, batch_id, total, applied, failed, not_run, results[]}` where each
`results[i]` is `{index, op, ok, result | error: {code, message}}`. Applying is not atomic (earlier
operations stay written, like the import apply paths); a dry run executes the whole list in one
rolled-back transaction, so later operations see earlier ones (a `link_event_property` after the
`create_event`/`create_property` it needs previews correctly).

**Example: fill a project from a sheet.** Read the sheet rows, build one operation list, preview it,
then apply the same list:

```json
{
  "project_key": "acme-eu",
  "agent_name": "sheet-import-agent",
  "dry_run": true,
  "operations": [
    { "op": "create_event", "name": "purchase", "implementation_method": "server_api" },
    { "op": "create_property", "scope": "event", "name": "total_price", "data_type": "number" },
    { "op": "link_event_property", "event": "purchase", "property": "total_price", "required": true },
    { "op": "create_identity_rule", "name": "Login", "identifier_name": "registered", "identity_type": "hard", "trigger_event": "purchase" },
    { "op": "set_event_identifiers", "event": "purchase", "identifiers": ["registered"] }
  ]
}
```

Check `failed` is `0` and the `differences`, then send it again with `"dry_run": false`. If an
operation fails, fix it and re-send only the remaining operations (`results` shows what applied).

## How Claude Code picks up `.mcp.json`

The repo root `.mcp.json` registers the server. Native Windows (no shell) cannot `spawn('npx', ...)`
directly — `npx` there is `npx.cmd`, not an executable Node can exec without a shell wrapper, so
`.mcp.json` uses the `cmd /c` form:

```json
{
  "mcpServers": {
    "e3-tracking": {
      "command": "cmd",
      "args": ["/c", "npx", "tsx", "src/mcp/server.ts"],
      "env": {
        "E3_DB_PATH": "./data/e3-tracking.sqlite",
        "E3_PROJECT_KEY": ""
      }
    }
  }
}
```

On macOS/Linux (or inside WSL/Git Bash, which already provide a shell), the plain POSIX form works
too and is what you'd use if you ever need to invoke the server directly from a shell script instead
of through `.mcp.json`:

```json
{
  "command": "npx",
  "args": ["tsx", "src/mcp/server.ts"]
}
```

`args`/`env` are otherwise identical between the two forms. Both were verified by spawning the exact
command as a Node child process and completing `initialize` + `tools/list` over its stdio.

Claude Code reads `.mcp.json` from the current working directory (and its ancestors) automatically
when it starts a session in this repository — no separate install step (Claude Code does prompt once
to approve a new project-scoped `.mcp.json` server the first time it sees one). Set `E3_PROJECT_KEY`
to a project's `key` (see `list_projects`) if you want every tool call to default to that project
without passing `project_key` each time; leave it empty to require `project_key` on every call. A tool
call with no `project_key` and no `E3_PROJECT_KEY` fails with `PROJECT_NOT_FOUND`.

Every tool call is visible as a normal tool-use turn in the Claude Code conversation; the server's own
log lines (`src/mcp/log.ts`) show up as the MCP server's stderr output, not as chat content.

## Running it while the web app is stopped, then seeing the run in the app

The MCP server needs no Express process — it opens `E3_DB_PATH` directly. To try the smoke test below
against a project you already created in the app:

1. Stop the web app (`Ctrl+C` on `npm run dev`, or just don't start it) so nothing else is writing to
   the SQLite file concurrently while you experiment (WAL mode tolerates concurrent readers/writers
   fine in practice — this is a convenience, not a requirement).
2. Ask Claude Code to call `list_projects`, then the rest of the smoke test below, using the
   `e3-tracking` MCP server.
3. Start `npm run dev` again and open the QA runs page (`/tracking-plan/`) for that project — the
   `agent_session` (or `export_paste`, for `submit_observations_batch`) run created by the smoke test
   is there, with its observations, exactly like a run created through the Import page or a future
   manual-entry UI.

## Smoke test

Run against a project that already has the six `data-mapping.json` events applied (see
`docs/QA-LOCAL.md`'s "Phase 1 round-trip recipe" to set one up), or any project — the steps below work
on an empty project too, just with fewer/no findings at the end.

1. **`list_projects`** — expect your client and project to appear, grouped by client:
   `[{"client": "...", "projects": [{"key": "...", "name": "..."}]}]`. Note the project's `key` for
   the next calls' `project_key` (or set `E3_PROJECT_KEY` in `.mcp.json` once and omit it everywhere).
2. **`submit_observations_batch`** with `.claude/team/samples/customer-events-export.json` as the
   `export` argument — expect `{"qa_run_id": "...", "inserted": 19, "duplicates": 0}` on a project that
   has never seen this fixture before. Calling it again with the same file and no `qa_run_id` expects
   `{"qa_run_id": "<the first call's run id>", "inserted": 0, "duplicates": 19}` (every row is now a
   duplicate of the first run; `qa_run_id` is `null`, never `""`, only in the unlikely case the owning
   run cannot be determined). Passing an existing run's id as `qa_run_id` inserts into that run instead
   of creating a new `export_paste` one — call `finish_qa_run` with the same id afterwards to see
   `finished_at` set and the run show as finished on the QA runs page (`finish_qa_run` only sets
   `finished_at`/`notes`; it does not itself recompute findings — call `run_comparison` too if you
   want fresh ones).
3. **`run_comparison`** — expect a `ComparisonSummary`: `{"open": {"error": n, "warning": n, "info": n},
   "produced": n, "resolved": n, "by_comparison": {...}}` (`scope` is accepted but ignored, same as
   `POST /comparison/run` — every comparison always recomputes over the whole project). On the fixture
   project (data mapping + expiration settings + the type-fixing edits from `docs/QA-LOCAL.md` applied
   first, then this fixture), `open.error` includes the scenario 4 findings below.
4. **`list_findings`** — expect (among others, default `status: 'open'`) the scenario 4 findings:
   `type_mismatch` on `total_price`/`price`/`is_new`, and `rounding_drift` on `purchase_item.price` x
   `quantity` vs `purchase.total_price` (see `docs/QA-LOCAL.md` for the full list on the fixture
   project).
5. **`get_expected_payload`** for `{"event": "cart_update", "variant": "cart_update[action=add]"}` —
   expect `discriminators.action` to include `add`/`remove` (whatever the property's allowed values
   are) and `item_schemas` to carry the array property's field list when one is attached. `rules` is
   empty on the fixture project as shipped: the one seeded rule (`purchase_items_total`, D-30/D-31) is
   on `purchase`, not `cart_update` — call `get_expected_payload` for `{"event": "purchase"}` instead to
   see it, or attach a rule to `cart_update` by hand first (`src/mcp/tools/tools.test.ts` exercises the
   `rules`/`item_schemas` shape with a test-created event and rule).
6. **`update_observation`/`delete_observation`/`delete_qa_run`** (D-52, T-3-07) — from `list_findings`,
   pick an observation with a `type_mismatch` finding (e.g. `total_price` observed as the string `"28"`
   on `cart_update`); call `update_observation` with `{"observation_id": "...", "properties":
   {..., "total_price": 28}}`, expect the returned `comparison` summary's `resolved` count to include
   that finding. `update_observation` with `properties` matching another observation already in the
   same run instead returns `{"isError": true, "content": [{"type": "text", "text": "DUPLICATE_
   OBSERVATION: ..."}]}`. `delete_observation` removes one row and recomputes; `delete_qa_run` removes
   a whole run (cascading its observations) and recomputes — expect the findings that run's
   observations used to produce to resolve.

## Verifying the process starts and answers `tools/list`

`npm run mcp` starts the server and waits on stdio; there is no visible confirmation on the terminal
beyond the stderr line `[mcp] INFO e3-tracking MCP server ready on stdio`. To confirm end to end
without an MCP client, spawn it as a child process and speak minimal JSON-RPC over its stdin/stdout
(this is exactly what `src/mcp/server.ts`'s own manual verification used, T-2-10): send an
`initialize` request, then a `tools/list` request, and check the response's `result.tools.length` is
the generated inventory count and every generated tool name appears. Verify with the *exact* `.mcp.json` command on
your platform — on native Windows that means spawning `command: "cmd", args: ["/c", "npx", "tsx",
"src/mcp/server.ts"]`, not a bare `npx` (`spawn('npx', ...)` without a shell fails with `ENOENT` there,
since `npx` resolves to `npx.cmd`, not a directly-executable file). `src/mcp/tools/tools.test.ts` and
`src/mcp/noStdout.test.ts` cover the handlers and the stdout guard at the unit level; the child-process
check is a one-off manual script, not part of `npm test` (spawning a subprocess is slow and
platform-sensitive to run on every CI pass).

## Adding a tool

1. Write a plain `async (input) => JSON-serialisable` handler in `src/mcp/tools/<file>.ts`, reusing a
   DAL or service function — never duplicate query/business logic already used by an Express route.
2. Register it in `src/mcp/registerTools.ts` with a zod input shape and a one-line description.
3. Add a handler test next to the others in `src/mcp/tools/tools.test.ts` (or a new `*.test.ts` file),
   calling the handler directly against `:memory:`.

## Remote (GCP) access (T-5-09, D-72 item 7)

On the GCP VM the MCP server is not exposed on any port. Claude Code starts it on demand over an IAP SSH
tunnel: `gcloud compute ssh --tunnel-through-iap` runs `docker compose run --rm -T mcp` on the VM, and the
SSH session's stdin/stdout carry the stdio JSON-RPC stream. The container reads and writes the same SQLite
file as the app (`/data` on the VM data disk, via `docker-compose.gcp.yml`). Access is governed by IAP/OS
Login IAM, nothing else.

Copy the `e3-tracking-gcp` block of `.mcp.json.gcp.example` into your `.mcp.json` (or run
`deploy/gcp/07-mcp.sh`, which prints the block with the values from your `config.env` and smoke-tests it;
`--dry-run` prints the commands only). A POSIX variant (`"command": "gcloud"`, no `cmd /c`) is in the example too.

Stdout must carry JSON-RPC only, so:
- `--quiet` stops gcloud from prompting or printing progress/key-generation notices on stdout.
- `compose run -T` disables the pseudo-TTY (a TTY would merge stderr into stdout, add CRs and echo input).
  `--command` runs without a TTY by default; `-- -T` after it passes `-T` to ssh so it never allocates one
  (and `gcloud compute ssh --command ... -- -t` is the opposite flag, do not add it).
- The entrypoint and all MCP logs write to stderr only (`src/mcp/log.ts`); compose's "Creating/Running"
  lines also go to stderr. `src/deploy/mcpContainer.test.ts` runs the real image through
  `docker compose run --rm -T mcp` (base compose file, not the VM command or the ssh hop) and asserts every stdout line is JSON-RPC and `tools/list` matches the generated inventory.
- `E3_PROJECT_KEY` is set with `-e E3_PROJECT_KEY=<key>` inside the remote command (the environment of
  your laptop does not reach the container through ssh).

Expect a few seconds of startup per session (SSH handshake through IAP plus a container start, longer on
the e2-micro); Claude Code keeps the process for the whole session, so the cost is paid once. Every tool call
afterwards is a normal local-to-VM round trip. If a session hangs, run the printed command by hand and read
stderr (IAP permission `roles/iap.tunnelResourceAccessor`, OS Login, passwordless `sudo` for the user (`roles/compute.osAdminLogin`, or docker group membership), `.env` on the VM).


## HTTPS connectors for Claude and Codex (D-87)

The optional remote endpoint is `https://tracking.e3-services.com/mcp`. In Claude, add a custom connector with that URL and choose **Register automatically**. The app supplies OAuth discovery and registers public clients with either the exact Claude callback `https://claude.ai/api/mcp/auth_callback` or the Codex native loopback callback described below; there is no client secret to copy. Workspace sign-in protects the approval page. Google tokens are never accepted as MCP bearer credentials.

The connector requests all supported scopes up front (`projects:read projects:write templates:read` in the first 401 challenge), but the consent page grants only what you tick. Select the projects and approve or deny explicitly. Project write (changes, observation submission, comparison, mutation dry-runs) and global template access are opt-in checkboxes, unticked by default; the read-only sentence appears only when neither was requested. A grant without write cannot see write tools in `tools/list`. Changing a project's selection requires new consent; new projects are not added automatically unless the all-projects option was ticked. Unselected projects are terminal denials, not invitations to expand permissions. `tools/list` is filtered by the grant's scopes (10 tools for a read-only grant), and every call is checked before dispatch and at execution. Transport arrays are rejected; every nested `batch_apply` operation is preauthorized before its first write.

Settings links to **My MCP connections** at `/mcp/connections`. This staff-owned page shows granted projects, scopes and expiry, and permits CSRF-protected revocation of your own connections. Staff API equivalents are `GET /api/mcp/connections` and `POST /api/mcp/connections` with the returned CSRF value, management cookie and exact application Origin. Revocation immediately invalidates the family's access and refresh tokens. Ordinary restart preserves connections and their revocations.

Authorization requests expire after 10 minutes, codes after 5 minutes, access tokens after at most 15 minutes, and refresh families after 30 days absolute. Codes are consumed once; refresh tokens rotate once. Reusing a consumed refresh token revokes the whole grant, including all access tokens. Only hashes of opaque cookies, CSRF values, codes and tokens are stored. Operational audit contains event/tool metadata, not arguments, payloads or credentials. Registrations, pending requests, grants, tokens and audit have storage bounds. Portable project backups exclude every `mcp_oauth_*` table. Each remote connection's automatic QA run is isolated durably by grant, project and agent; stdio retains its process-local behavior. Remote audit actors always come from the verified Workspace grant, even when `agent_name` is omitted or forged.

Enable only with `E3_MCP_HTTP_ENABLED=1`, an exact HTTPS `E3_PUBLIC_ORIGIN`, `WORKSPACE_DOMAIN`, production `AUTH_MODE=proxy` and a correctly scoped `TRUSTED_PROXY_CIDR`. The default is disabled. Use the reviewed narrow Caddy routes: only the MCP resource, OAuth metadata and registration/token/revocation endpoints bypass browser forward-auth. Consent and connection management remain Workspace protected. Public machine routes strip browser cookies and caller/Google identity headers; only `/mcp` preserves its dedicated Authorization header. Unsupported methods, unexpected Host/Origin and malformed/bounded request bodies fail closed.

### Codex HTTPS setup (T-5-52)

Add the hosted server once, then complete Workspace sign-in and the E3 consent page:

```sh
codex mcp add e3-tracking --url https://tracking.e3-services.com/mcp
codex mcp login e3-tracking
```

If `e3-tracking` is already configured with that URL, run only the login command. No Google token, client secret, SSH tunnel or local database configuration is needed. Select the allowed projects on E3's consent page. Write and global template access remain separate unchecked opt-ins. The native callback returns to the computer running Codex; finish the flow on that computer.

Codex registers `http://127.0.0.1[:port]/callback` or `/callback/<callbackID>` with dynamic client registration and PKCE S256. Only the literal IPv4 loopback host and a bounded URL-safe callback ID are accepted. The authorization listener may use a different port (RFC 8252); the registered callback path must still match exactly. Authorization codes bind to the exact URI, including port, approved for that request. Other hosts, callback paths, userinfo, queries, fragments and normalized alternate host spellings are rejected. The consent page displays the actual destination; the fixed client label identifies the callback class, not a verified application publisher.

A failure mentioning `Only public Claude hosted clients are supported` indicates an older server release, not a missing local secret. After the compatible release is deployed, retry `codex mcp login e3-tracking`. For an existing unwanted grant, revoke it under **My MCP connections** and sign in again. Discovery does not advertise issuer-response support or client metadata documents; Codex uses its server-specific callback and dynamic registration. This does not enable ChatGPT hosted connectors or arbitrary OAuth clients. See [official Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Full-database recovery

A normal restart preserves durable grants. A **full snapshot restore** of a database containing migration `0043_mcp_oauth.sql` must, before reopening the public connector, revoke every operational grant/token family and remove all pending consent and authorization-code state. Otherwise an older snapshot could resurrect a revoked grant or consumed code. Use the independently reviewed operational recovery procedure, not an image-only rollback or old SQLite/new WAL overlay. Existing rollback to the pre-connector 0040 full data/config snapshot removes all connector state. Project backup restore never imports HTTP connector credentials.

### HTTPS connector: Origin, rate-limit and read-only details (T-5-35)

- `https://claude.ai` is an accepted `Origin` only on `/mcp/oauth/token`, `/mcp/oauth/register` and `/mcp/oauth/revoke`, the endpoints Claude's hosted connector calls itself. The staff pages (`authorize`, `consent`, `connections`) accept only the canonical origin or no `Origin`, and consent and revocation POSTs require the canonical origin exactly.
- Gated paths (`/mcp*`, `/api/mcp/connections*`, `/.well-known/oauth-*`) are matched case-insensitively for the gate and case-sensitively for routing, so `/MCP/...` answers 404 and never reaches a handler.
- Rate limits key on the last `X-Forwarded-For` entry only when the socket peer is in `TRUSTED_PROXY_CIDR`, else on the socket address; `/mcp` also keys on the bearer hash.
- `tools/list` shows only tools the grant's scopes allow (a read-only grant does not see write tools); calls are still preauthorized.
- Reusing an authorization code revokes the grant and every token issued from it. `GET` on the connections page and API create no stored state; the revoke CSRF token is an HMAC of the owner under a per-process secret.

### All projects option (T-5-38, D-87 amendment 1)

- The consent page has an unticked checkbox "All projects, including ones created later" above the project list; explicit selection is recommended. When ticked, the grant stores `mcp_oauth_grants.all_projects = 1` and no `mcp_oauth_projects` rows, and any project checkboxes posted with it are discarded. At every call the grant resolves to all live (non-deleted) projects at that moment, so `list_projects`, project_key checks and reference checks see projects created after approval. Scopes are unchanged; write stays a separate opt-in.
- `/mcp/connections` and `GET /api/mcp/connections` show such grants as "All projects (including future ones)" (`projects: "all"`, additive `all_projects: true`). Project backups and CSV never contain `mcp_oauth_*` tables.
- Claude.ai keeps its authorization per server URL across removing and re-adding the connector. To change scopes or projects, revoke the connection on `/mcp/connections` first, then add the connector again.

Local testing of the HTTPS connector: `E3_PUBLIC_ORIGIN` must be an HTTPS origin, so a local run uses the production origin value with a matching `Host` header on each request (as QA did); there is no plain-HTTP mode.

Staff form posts (consent, connection revoke) are accepted as same-origin when `Origin` equals the canonical origin, or when `Origin` is absent or the literal `null` (Chrome's behavior on some same-origin form posts) and `Sec-Fetch-Site` is `same-origin` on the canonical `Host`. Anything else, including `null` without `Sec-Fetch-Site`, is rejected; the staff pages are served with `Referrer-Policy: same-origin`.



## Agent collaboration and references

The [shared response contract](AGENT-CONVENTIONS.md) defines page markers, conditional state, field aliases, attribution and safe errors for both Tracking and Cortex. The [Cortex connection diagnostic](MCP-CORTEX-CONNECTION.md) explains the local three-tool allowlist.

get_server_info reports registered and visible inventory counts, effective scopes/projects, write visibility, default/max limits and separate token/grant expiry timestamps. It is available to template-only grants without project resolution. It never returns credentials.

Every write tool, including QA, historical apply, add_reference and batch_apply, accepts optional idempotency_key and agent_name. Supplied actor input is ignored. Identical canonical arguments replay the original receipt; changed arguments need a new key. Durable operation receipts recover interrupted non-atomic batches without repeating committed operations. In-progress retries wait for the existing request or its 60-second lease. Operational receipts stay out of portable backups; no background job or since cursor is introduced.

add_reference accepts target_kind (finding/use_case), target_id, dry_run (default true), and a reference containing system=cortex, client, project, record_type, record_id, revision, content_hash and optional note. It stores a deduplicated unverified pointer. Detail reads return references; statuses, priority and certification remain unchanged. Attaching any real review is a separate authorized data action.

Inventory artifacts are generated with node --import tsx scripts/generate-mcp-inventory.ts. CI/local checks use the same command with --check; deployment smoke checks compare names as well as counts. ODO has 33 use cases; the 100-row default returns them in one page. Using captured public IDs/names/counts with standard fixed-width ISO timestamps, its estimated compact response is 8.6–8.8k characters, depending on priority labels.

<!-- BEGIN GENERATED MCP INVENTORY -->
Registered tools: **39**. Visible counts depend on the authenticated grant.

| Tool | Required scopes |
| --- | --- |
| `get_server_info` | Any authenticated grant |
| `add_reference` | projects:read, projects:write |
| `list_projects` | projects:read |
| `preview_historical_validation` | projects:read |
| `apply_historical_validation` | projects:read, projects:write |
| `get_historical_validation` | projects:read |
| `list_events` | projects:read |
| `get_event_card` | projects:read |
| `get_expected_payload` | projects:read |
| `list_use_cases` | projects:read |
| `get_use_case` | projects:read |
| `list_findings` | projects:read |
| `summarize_findings` | projects:read |
| `get_finding` | projects:read |
| `get_coverage_grid` | projects:read |
| `get_tracking_document` | projects:read |
| `submit_observation` | projects:read, projects:write |
| `submit_observations_batch` | projects:read, projects:write |
| `finish_qa_run` | projects:read, projects:write |
| `run_comparison` | projects:read, projects:write |
| `update_observation` | projects:read, projects:write |
| `delete_observation` | projects:read, projects:write |
| `delete_qa_run` | projects:read, projects:write |
| `list_use_case_templates` | templates:read |
| `instantiate_use_case_template` | projects:read, projects:write, templates:read |
| `get_history` | projects:read |
| `create_event` | projects:read, projects:write |
| `update_event` | projects:read, projects:write |
| `create_property` | projects:read, projects:write |
| `update_property` | projects:read, projects:write |
| `link_event_property` | projects:read, projects:write |
| `unlink_event_property` | projects:read, projects:write |
| `create_identity_rule` | projects:read, projects:write |
| `set_event_identifiers` | projects:read, projects:write |
| `create_catalog_field` | projects:read, projects:write |
| `update_use_case` | projects:read, projects:write |
| `link_use_case_asset` | projects:read, projects:write |
| `unlink_use_case_asset` | projects:read, projects:write |
| `batch_apply` | projects:read, projects:write |
<!-- END GENERATED MCP INVENTORY -->
