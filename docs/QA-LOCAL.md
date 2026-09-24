# Local QA runtime

How to start the app and run QA against it on localhost, per D-09 (local-first: every phase is tested end to end on the developer machine before any remote deployment).

## Starting the app

Two equivalent ways:

- Launch config: `.claude/launch.json` entry `e3-tracking` (`npm run dev` on port 3000), used by the qa-tester agent (D-25 Q9).
- Manually: `npm run dev` from the repository root. This starts the Express API (`tsx watch src/backend/server.ts`, port 3001) and the Vite dev server (port 3000) together.

Open the app at `http://127.0.0.1:3000/tracking-plan/`.

### Port 3000 already in use

Ports 3000 and 3001 are shared with other local agents/processes on some machines. If port 3000 is taken, stop the process using it before starting `npm run dev` — there is no automatic fallback port configured in `vite.config.ts`. Do not change the port without checking with whoever owns the other process; the Vite dev proxy for `/api` and `/tracking-plan/api` is hardcoded to `http://localhost:3001`.

## Resetting the database

The SQLite database is a single gitignored file, default `./data/e3-tracking.sqlite` (path configurable via `E3_DB_PATH`). To reset local state, stop the server and delete that file (and its `-wal`/`-shm` companions if present). The next server start recreates it and reapplies every migration in `src/backend/db/migrations/`.

Uploaded files (event trigger screenshots, project logos) live under `./data/files/` (configurable via `E3_FILES_PATH`); delete that directory to clear them.

## Environment variables relevant to QA

- `E3_LOCAL_USER_NAME` — display name recorded as the actor on QA runs and history entries in local auth mode. Falls back to `git config user.name`, then `"Local user"` (D-25 Q8).
- `E3_DB_PATH` — SQLite file path. Use a scratch path (or `:memory:` for tests) to avoid touching the shared local database while exploring.
- `E3_PROJECT_KEY` — default project key for the MCP server when a tool call omits `project_key` (phase 2, D-25 Q7); not yet relevant to phase 1 QA.

See `.env.example` for the full list and one-line descriptions of every local variable.

## Fixtures

Sample Bloomreach exports and other QA fixtures live in `.claude/team/samples/`.

## Where to save QA exports

Save QA run output (exported findings, screenshots, notes) under `.claude/team/reports/qa/<TASK-ID>/`, one subfolder per task.
