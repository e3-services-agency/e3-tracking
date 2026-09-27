# MCP server (`src/mcp/`)

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
- Tools: thirteen, implemented as plain async handlers in `src/mcp/tools/*.ts` and registered in
  `src/mcp/registerTools.ts` (so a later HTTP transport can mount the same handlers without touching
  their logic): `list_projects`, `list_events`, `get_event_card`, `get_expected_payload`,
  `list_use_cases`, `get_use_case`, `list_findings`, `get_coverage_grid`, `get_tracking_document`,
  `submit_observation`, `submit_observations_batch`, `finish_qa_run`, `run_comparison` — the plan
  table's twelve (`PLAN-PHASE2-2026-09-25.md` lines ~205-225) plus `get_tracking_document`, which the
  plan table did not originally list.

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

## Verifying the process starts and answers `tools/list`

`npm run mcp` starts the server and waits on stdio; there is no visible confirmation on the terminal
beyond the stderr line `[mcp] INFO e3-tracking MCP server ready on stdio`. To confirm end to end
without an MCP client, spawn it as a child process and speak minimal JSON-RPC over its stdin/stdout
(this is exactly what `src/mcp/server.ts`'s own manual verification used, T-2-10): send an
`initialize` request, then a `tools/list` request, and check the response's `result.tools.length` is
`13` and every name in the "Tools" list above appears. Verify with the *exact* `.mcp.json` command on
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
