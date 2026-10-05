# Deploy runbook (containers, D-66)

The app ships as one Docker image: a single Node process serves the API and the built frontend on one port, with SQLite and uploads on one volume. The same image also runs the MCP server and the nightly backup job.

**Status: step 1 only.** Everything below runs on your own machine (D-09, local-first). Deploying this image to a remote host is step 2 and **waits for the user's explicit go**; nothing in this repository deploys anywhere.

## Build and run (local)

```
docker compose build            # multi-stage build, a few minutes cold, seconds when cached
docker compose up -d            # app on http://127.0.0.1:3020/tracking-plan/ + backup job
docker compose ps               # app shows "healthy" after about 10-20 s
```

Host port **3020** maps to the container's 3001 and is bound to 127.0.0.1 only. Ports 3000/3001 stay free for `npm run dev`.

First use: open `http://127.0.0.1:3020/tracking-plan/`. A demo project is one call away: `curl -X POST http://127.0.0.1:3020/api/projects/sandbox -H 'Content-Type: application/json' -d '{}'` (or the Clients page sandbox section).

Stop and start without losing data: `docker compose down` then `docker compose up -d` (the named volume survives). `docker compose down -v` deletes the volume, so it deletes all data.

## What runs

| Mode | How | Process |
|---|---|---|
| `app` (default) | service `app` | `node api/_backend/server.js` (also `npm start`): runs migrations, serves `/api`, `/tracking-plan/api` and `dist/` under `/tracking-plan/` with an SPA fallback |
| `backup` | service `backup` | `node api/_backend/backup-job.js`: writes backups at start-up and nightly |
| `mcp` | `docker compose run -T --rm mcp` (profile `mcp`) | stdio MCP server on the same DB file (D-33) |

`ENTRYPOINT_MODE` (or the first argument) selects the mode in `docker-entrypoint.sh`: `app`, `mcp`, `backup`, `backup-once`.

Static serving is on when `NODE_ENV=production` (set by the image) or `SERVE_STATIC=1`, so `npm run dev` is unchanged. Hashed assets under `/tracking-plan/assets/` are cached for a year; `index.html` is `no-store`. Unknown routes without a file extension return the app (including `/tracking-plan/shared/:token`); a malformed percent-escape returns a plain 400 on every path except `/api/shared/*`, which keeps its identical 404.

## Environment variables

Copy `.env.docker.example` to `.env.docker` (gitignored; optional, compose has defaults).

| Variable | Default in the image | Meaning |
|---|---|---|
| `PORT` | 3001 | Port inside the container |
| `HOST` | 0.0.0.0 | Listen address |
| `NODE_ENV` | production | Enables static serving |
| `SERVE_STATIC` | unset | `1` forces static serving outside production |
| `E3_DIST_PATH` | `/app/dist` | Override the frontend build directory |
| `E3_DB_PATH` | `/data/e3-tracking.sqlite` | SQLite file |
| `E3_FILES_PATH` | `/data/files` | Uploaded files |
| `AUTH_MODE` | local | Local only (D-13) |
| `E3_LOCAL_USER_NAME` | unset | Actor display name |
| `E3_PROJECT_KEY` | unset | MCP default project |
| `E3_SANDBOX_BACKUP_PATH` | `/app/samples/sandbox-project-backup.json` | Bundled sandbox backup |
| `BACKUP_HOUR_UTC` | 2 | Nightly run hour (UTC) |
| `BACKUP_DIR` | `<db dir>/backups` = `/data/backups` | Backup output directory |
| `BACKUP_KEEP` | 14 | Backups kept per project |
| `BACKUP_SKIP_INITIAL` | unset | `1` skips the run at start-up |

## Data volume, backups and restore

The named volume `e3_data` (compose project `e3-tracking`) is mounted at `/data`: `e3-tracking.sqlite` (plus WAL files), `files/`, `backups/`.

The backup job writes `/data/backups/backup-<project-key>-<YYYY-MM-DD>.json` for every project (the full JSON backup of D-45, uploaded files embedded) and keeps the newest 14 per project. A key that needed sanitising gets a short hash suffix so distinct keys never share a file; leftover `.tmp` files from an interrupted run are removed at the start of each run. Run one by hand: `docker compose exec backup node api/_backend/backup-job.js --once`.

Copy a file out: `docker compose cp app:/data/backups/backup-<key>-<date>.json .`

Restore (creates a **new** project, never overwrites): use the restore form on the Clients page, or the API:

```
curl -X POST http://127.0.0.1:3020/api/projects/restore-backup/preview -H 'Content-Type: application/json' --data-binary @backup-<key>-<date>.json
# review the counts, then POST {"backup": <the file's JSON>, "payload_hash": <hash from the preview>} to /api/projects/restore-backup/apply
```

The backup does not contain the other projects or the global use case template library; it protects project definitions. For a whole-volume copy, stop the stack and archive the volume (`docker run --rm -v e3-tracking_e3_data:/data -v "$PWD":/out alpine tar czf /out/e3_data.tgz -C /data .`).

## Health and logs

The `app` service has the healthcheck; `backup` and `mcp` have none (no HTTP port), so `docker compose ps` shows them without a health status. Stopping the stack closes the database cleanly (WAL checkpointed, no `-wal` file left on the volume). Line endings: `.gitattributes` forces LF for `*.sh` and `Dockerfile`, and the Dockerfile strips any CR from the entrypoint, so a Windows checkout builds correctly.

`GET /api/health` returns `{ok, version, schema_migration, db_path_writable}` (503 when the database or its directory is not usable; no secrets). The image and compose `HEALTHCHECK` call it. Logs: `docker compose logs -f app` and `docker compose logs backup`.

## Upgrade

```
git pull
docker compose build
docker compose up -d      # pending migrations run on start, data stays on the volume
```

Take a backup first (`backup-job.js --once`). A failed migration stops the app from starting; roll back by checking out the previous commit, rebuilding and restoring the volume copy.

## Step 2: remote deployment (not started, needs the user's go, D-09)

The same image can run on a VM or container host. Before any remote exposure, per D-66:

- TLS reverse proxy in front (Caddy, nginx or the host's load balancer); the container stays on a private port.
- Identity proxy (Identity-Aware Proxy or Cloudflare Access) in front of every internal route; the app itself still only has local auth (D-13). Only `/tracking-plan/shared/*`, `/api/shared/*` and static assets may stay public.
- Share-link hardening (D-48 phase 5 items), a restore rehearsal into a fresh container, and the decision on the Vercel scaffold (`api/index.ts`, `vercel.json`, untouched, D-23).
- Backups copied off the host (the volume is a single disk).
- Account, billing, DNS and identity-provider registration stay with the user.
