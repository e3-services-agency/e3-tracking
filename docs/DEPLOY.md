# Deploy runbook (containers, D-66)

The app ships as one Docker image: a single Node process serves the API and the built frontend on one port, with SQLite and uploads on one volume. The same image also runs the MCP server and the nightly backup job.

**Status: production is live on GCP** at https://tracking.e3-services.com. Local staging remains separate. The user authorized reviewed upgrades (D-73); complete local verification before deployment. The production baseline is image `18b7883`, schema `0036`; the shared-portal release adds `0037` and `0038`. Confirm the actual image/schema at each maintenance window.

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
| `AUTH_MODE` | local | `local` (D-13) or `proxy` (T-5-06, below); compose reads `E3_AUTH_MODE` |
| `TRUSTED_PROXY_CIDR` | 172.16.0.0/12 (compose: 172.28.0.8/29) | Peers whose `X-Forwarded-Email` is trusted; required explicitly in production with `proxy` |
| `GOOGLE_COMMENT_CLIENT_ID` | unset | Public External Google client ID for shared commenters; no client secret |
| `E3_PUBLIC_ORIGIN` | unset | Exact browser origin for commenter session/CSRF checks |
| `COMMENT_STAFF_SESSION` | 0 | `1` enables trusted staff-session reuse for shared comments |
| `WORKSPACE_DOMAIN` | unset | Workspace domain accepted for staff identity reuse and existing staff OAuth |
| `E3_LOCAL_USER_NAME` | unset | Actor display name |
| `E3_PROJECT_KEY` | unset | MCP default project |
| `E3_SANDBOX_BACKUP_PATH` | `/app/samples/sandbox-project-backup.json` | Bundled sandbox backup |
| `BACKUP_HOUR_UTC` | 2 | Nightly run hour (UTC) |
| `BACKUP_DIR` | `<db dir>/backups` = `/data/backups` | Backup output directory |
| `BACKUP_KEEP` | 14 | Backups kept per project |
| `BACKUP_SKIP_INITIAL` | unset | `1` skips the run at start-up |
| `BACKUP_BUCKET` | unset | Cloud Storage bucket; when set, each backup is also uploaded (see Off-site backup) |

## Data volume, backups and restore

The named volume `e3_data` (compose project `e3-tracking`) is mounted at `/data`: `e3-tracking.sqlite` (plus WAL files), `files/`, `backups/`.

The backup job writes `/data/backups/backup-<project-key>-<YYYY-MM-DD>.json` for every project (the full JSON backup of D-45, uploaded files embedded) and keeps the newest 14 per project. A key that needed sanitising gets a short hash suffix so distinct keys never share a file; leftover `.tmp` files from an interrupted run are removed at the start of each run. Run one by hand: `docker compose exec backup node api/_backend/backup-job.js --once`.

Copy a file out: `docker compose cp app:/data/backups/backup-<key>-<date>.json .`

### Off-site backup (GCP, T-5-08)

When `BACKUP_BUCKET` is set (`deploy/gcp/04-backup.sh` writes it to the VM `.env`), the nightly job (02:00 UTC by default) uploads every project's backup right after writing it, to `gs://<bucket>/<project_key>/<timestamp>.json` (timestamp like `2026-10-05T02-00-00-000Z`). The container has no gcloud: it calls the Cloud Storage JSON API with the VM service account token from the metadata server, with retries and backoff (4 attempts), and logs `[e3-backup] uploaded gs://...` or `upload FAILED`. Off GCP (local Docker) the metadata server is unreachable, so it logs once that the upload is skipped. Local copies and the 14-file retention are unchanged. The bucket is versioned and has a 90-day delete lifecycle (`deploy/gcp/bucket-lifecycle.json`).

`/data/backups/last-backup.json` records the last run; `GET /api/health` exposes it as `last_backup_at` and `last_upload_ok` (`null` when no upload is configured or skipped, `false` after a failed upload).

```bash
deploy/gcp/04-backup.sh --run-now                  # one backup on the VM, prints the upload log line
gcloud storage ls gs://<bucket>/ --recursive       # list (run by you)
gcloud storage cp gs://<bucket>/<key>/<timestamp>.json .   # download
```

Restore rehearsal: before go-live and then quarterly, download a recent backup and run `npm run restore:rehearsal -- <file>`. It restores into a throwaway in-memory database through the real restore service, runs the comparison, prints counts per table, open findings, size and duration, and exits non-zero on warnings (`--allow-warnings` to accept them). A real restore into the app still goes through the Clients page (always creates a new project).

Restore (creates a **new** project, never overwrites): use the restore form on the Clients page, or the API:

```
curl -X POST http://127.0.0.1:3020/api/projects/restore-backup/preview -H 'Content-Type: application/json' --data-binary @backup-<key>-<date>.json
# review the counts, then POST {"backup": <the file's JSON>, "payload_hash": <hash from the preview>} to /api/projects/restore-backup/apply
```

The backup does not contain the other projects or the global use case template library; it protects project definitions. For local staging only, stop every app/backup/MCP writer before archiving its named volume. Production uses the host bind mount `/data`, not `e3-tracking_e3_data`; follow the consistent maintenance snapshot below. A project JSON backup cannot replace the complete database/config snapshot: it omits other projects, the global template library and operational commenter sessions.

## Health and logs

The `app` service has the healthcheck; `backup` and `mcp` have none (no HTTP port), so `docker compose ps` shows them without a health status. Stopping the stack closes the database cleanly (WAL checkpointed, no `-wal` file left on the volume). Line endings: `.gitattributes` forces LF for `*.sh` and `Dockerfile`, and the Dockerfile strips any CR from the entrypoint, so a Windows checkout builds correctly.

`GET /api/health` returns `{ok, version, schema_migration, db_path_writable}` (503 when the database or its directory is not usable; no secrets). The image and compose `HEALTHCHECK` call it. Logs: `docker compose logs -f app` and `docker compose logs backup`.

## Upgrade

```
git pull
docker compose build
docker compose up -d      # pending migrations run on start, data stays on the volume
```

Take and verify a complete data/config snapshot before running an image with new migrations. Project backups provide an additional recovery path. Across migrations `0037`/`0038`, rollback must restore the complete matching pre-upgrade data and configuration before starting the old image; see the GCP maintenance procedure below.

## Edge profile / proxy auth (D-72 item 4, T-5-06)

`AUTH_MODE=proxy` makes the app take the signed-in user from the `X-Forwarded-Email` header (display name from `X-Forwarded-User` or `X-Forwarded-Preferred-Username` is accepted but the actor is the lower-cased email, so `change_log` and comments attribute to the person; `E3_LOCAL_USER_NAME` is ignored). The header is honoured only when the direct TCP peer is inside `TRUSTED_PROXY_CIDR` (comma-separated CIDRs; default `172.16.0.0/12`; `X-Forwarded-For` is never used for trust). Anything else is ignored, and internal `/api/*` routes answer 401 `UNAUTHENTICATED`. `/api/shared/*`, `/api/health` and the static files stay reachable without it. In production the app refuses to start with `AUTH_MODE=proxy` unless `TRUSTED_PROXY_CIDR` is set explicitly. `AUTH_MODE=local` is unchanged.

The compose network `default` has the fixed subnet `172.28.0.0/24`; Caddy sits at `.10`, the fake proxy at `.11`, and the app trusts `172.28.0.8/29` (.8-.15), which excludes the gateway `.1` that host-published port 3020 arrives from, so a header sent straight to 3020 is ignored.

**Real edge (Caddy + oauth2-proxy, Google).** Fill the "Edge profile" block of `.env.docker` (HOSTNAME, WORKSPACE_DOMAIN, OAUTH2_CLIENT_ID/SECRET, OAUTH2_COOKIE_SECRET), set `E3_AUTH_MODE=proxy`, then:

```
docker compose --env-file .env.docker --profile edge up -d
```

Caddy (`deploy/edge/Caddyfile`) gets a certificate for `HOSTNAME` automatically (ports 80/443 must be reachable), sends everything except `/tracking-plan/shared/*`, `/api/shared/*`, `/api/health` and `/tracking-plan/assets/*` through oauth2-proxy `forward_auth`, strips client-supplied `X-Forwarded-Email/User/Preferred-Username` and sets them from oauth2-proxy's response. Only `WORKSPACE_DOMAIN` accounts can sign in. Creating the OAuth client (redirect URI `https://<HOSTNAME>/oauth2/callback`) is covered in the GCP chapter of this document. Note: a shell variable `HOSTNAME` (bash sets one) overrides the `.env.docker` value in compose interpolation; export it explicitly or use a different shell.

**Local test without Google.** `edge-fake` runs a Caddy that injects a fixed identity (no authentication, loopback only):

```
E3_AUTH_MODE=proxy FAKE_EMAIL=you@example.com docker compose -p e3qa --profile edge-fake up -d
# http://127.0.0.1:3030/tracking-plan/ ; direct http://127.0.0.1:3020/api/clients ... check the trust CIDR note above
docker compose -p e3qa --profile edge-fake down -v
```

Notes: the fixed subnet `172.28.0.0/24` applies to the whole compose network, so an existing stack's network is recreated on the next `up` and the subnet must not collide with another local network. The SPA shell (static files) is gated only at the edge; the API is gated at the app (401 without a trusted identity).

The default profile (no `--profile`) is unchanged: `AUTH_MODE=local` on 127.0.0.1:3020.

## Remote deployment boundary

Production upgrades are authorized after separate review and local QA. Keep internal routes behind Workspace OAuth, shared routes gated by share tokens, TLS at the edge, off-site backups, and a verified rollback snapshot. Do not rebuild or restart the developer's local staging container as a side effect of a GCP upgrade.

## GCP deployment

Scripts in `deploy/gcp/` (D-72, T-5-07) create one Compute Engine VM with Docker, Caddy and the identity proxy (the compose `edge` profile). Run them from Git Bash on Windows or from Linux. Every script supports `--dry-run` (prints each gcloud command, executes nothing), is safe to re-run (it probes before creating), and asks `y/N` once before its first mutating command unless `--yes` is given.

### Existing deployment and script responsibilities

The existing project, billing, VM, DNS, staff OAuth, backups and monitoring are configured. Read-only check them before an upgrade; rerun infrastructure creation only if an actual prerequisite is missing. Every script used must run with `--dry-run` first. `--yes` is appropriate for already-authorized mutations after reviewing that output. Scripts build/push/deploy the image; the maintenance procedure below supplies the mandatory quiesced snapshot and schema-aware recovery.

### Prerequisites

1. Install the gcloud CLI and Docker. `gcloud auth login`, then `gcloud config set project e3-tracking`.
2. Create the project (default id `e3-tracking`) in the console and link a billing account.
3. `cp deploy/gcp/config.env.example deploy/gcp/config.env` and adjust (project, region `europe-west1`, zone, hostname `tracking.e3-services.com`, `WORKSPACE_DOMAIN`, machine type, disk size, `ALERT_EMAIL`). `config.env` is gitignored.

### OAuth client (console, once)

APIs and Services > OAuth consent screen: user type **Internal** (limits sign-in to the Workspace). Credentials > Create credentials > OAuth client ID > Web application, authorized redirect URI `https://<HOSTNAME>/oauth2/callback`. Keep the client id and secret; they go into `/opt/e3-tracking/.env` on the VM (`OAUTH2_CLIENT_ID`, `OAUTH2_CLIENT_SECRET`).

### Initial deployment reference (existing VM already configured)

```
deploy/gcp/00-preflight.sh --dry-run   # then without --dry-run: login, billing, enable APIs
deploy/gcp/01-infra.sh                 # IP, firewall, service account, bucket, disk, VM; prints the DNS A record
# create the DNS A record <HOSTNAME> -> the printed IP
deploy/gcp/02-build-push.sh            # build and push to Artifact Registry; prints the tag
deploy/gcp/03-deploy.sh <tag>          # first run writes /opt/e3-tracking/.env with placeholders
# on the VM (gcloud compute ssh <vm> --tunnel-through-iap): edit .env, set the OAuth id and secret, then rerun 03-deploy.sh <tag>
deploy/gcp/04-backup.sh                # BACKUP_BUCKET in the VM .env (nightly upload to the bucket)
deploy/gcp/05-cutover.sh <project-id>...   # move local projects (exports from 127.0.0.1:3020)
deploy/gcp/06-monitoring.sh            # uptime check on /api/health, email alert
```

The VM runs compose with `-f docker-compose.yml -f docker-compose.gcp.yml` (`deploy/gcp/docker-compose.gcp.yml` binds `/data` of app, backup and mcp to the mounted data disk; `startup.sh` chowns it to uid 1000). `.env` variable names (`IMAGE`, `HOSTNAME`, `WORKSPACE_DOMAIN`, `TRUSTED_PROXY_CIDR`, `OAUTH2_CLIENT_ID`, `OAUTH2_CLIENT_SECRET`, `OAUTH2_COOKIE_SECRET`, `E3_AUTH_MODE`, `BACKUP_BUCKET`) must match what the edge profile's compose and Caddyfile read; compose uses `image: ${IMAGE:-e3-tracking:local}` for app, backup and mcp.

### Cut-over

`05-cutover.sh` exports each project's `backup.json` from the local container and restores it on the VM through an IAP SSH tunnel to the app port 127.0.0.1:3020 on the VM (the OAuth proxy blocks scripted calls). If the port is not reachable that way, download the backup from the local app and use the restore form on the Clients page of the deployed app. Restore always creates a new project.

### MCP over the IAP tunnel

Claude Code reaches the MCP server through `gcloud compute ssh --tunnel-through-iap` running `docker compose run --rm -T mcp` on the VM, no extra port. `deploy/gcp/07-mcp.sh` prints the `.mcp.json` block and smoke-tests it; see `docs/MCP.md` "Remote (GCP) access".

### Upgrade and rollback across schemas 0037/0038

The old `18b7883` backend must not run against a `0037`/`0038` database: its old public projection can expose newly added participant metadata. Image-only rollback is unsafe. Snapshot the complete pre-upgrade SQLite database, WAL/SHM if present, uploads, other data and `/opt/e3-tracking` configuration with **all** app/backup/MCP writers stopped. A clean stop normally checkpoints WAL; retain any WAL/SHM that remain as part of the same snapshot. Never overlay an old database onto newer WAL files.

Build/push the reviewed image before downtime. Confirm free space for the snapshot, its extracted verification copy, and the failed-upgrade staging/archive. Keep the previous image locally and record its immutable registry digest. Suspend MCP clients and any host jobs for the entire maintenance window. Caddy/oauth2-proxy can remain running: they do not mount the application data disk. Expect maintenance responses while the app is stopped. The following commands require root on the VM and `bash`, GNU `tar`, `gzip`, `sha256sum`, `find`, `fuser` and Docker. Check these tools before stopping services. If `fuser` is missing, install `psmisc` as an explicitly reviewed prerequisite or use an equivalent verified host-writer check; do not skip that gate.

Save the following **LF, UTF-8** block to a temporary local `e3-maintenance.sh`, syntax-check it, upload it through SDK scp, and run it through SDK SSH as described below. It is an operator maintenance command, not automatic rollback built into `03-deploy.sh`.

<!-- e3-maintenance-script -->
```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
MODE=${1:?usage: e3-maintenance.sh snapshot | rollback /var/backups/e3-tracking/pre-0037-TIMESTAMP}
BASE=/var/backups/e3-tracking
DC=(docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge)
[ "$(id -u)" = 0 ]
[ "$(readlink -f /data)" = /data ] && mountpoint -q /data
[ "$(readlink -f /opt/e3-tracking)" = /opt/e3-tracking ]
command -v fuser >/dev/null
cd /opt/e3-tracking
install -d -m 700 "$BASE"
[ "$(readlink -f "$BASE")" = "$BASE" ]

quiesce() {
  local cid mounts listing running service file rc
  local -a ids=() selected=()
  # Check each Docker result before using it: empty output never hides a failed enumeration.
  for service in app backup mcp; do
    listing=$(docker ps -q --filter label=com.docker.compose.project=e3-tracking --filter "label=com.docker.compose.service=$service") || return $?
    if [ -n "$listing" ]; then
      mapfile -t selected <<< "$listing"
      ids+=("${selected[@]}")
    fi
  done
  if ((${#ids[@]})); then docker stop --time 60 "${ids[@]}" >/dev/null || return $?; fi
  for service in app backup mcp; do
    listing=$(docker ps -q --filter label=com.docker.compose.project=e3-tracking --filter "label=com.docker.compose.service=$service") || return $?
    [ -z "$listing" ] || { echo 'A compose data writer is still running' >&2; return 1; }
  done
  running=$(docker ps -q) || return $?
  # Includes unlabelled containers and one-off MCP containers from other compose invocations.
  for cid in $running; do
    mounts=$(docker inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' "$cid") || return $?
    if printf '%s\n' "$mounts" | grep -Eq '^/data(/|$)'; then
      echo 'A container still mounts the live data directory' >&2; return 1
    fi
  done
  for file in /data/e3-tracking.sqlite /data/e3-tracking.sqlite-wal /data/e3-tracking.sqlite-shm; do
    if [ -e "$file" ]; then
      if fuser -s "$file"; then
        echo 'A host process still uses the live database' >&2; return 1
      else
        rc=$?
        [ "$rc" = 1 ] || return "$rc"
      fi
    fi
  done
}

pack() {
  local out=$1 data=$2 config=$3
  tar --numeric-owner --acls --xattrs -czpf "$out/data.tgz" -C "$data" .
  tar --numeric-owner --acls --xattrs -czpf "$out/config.tgz" -C "$config" .
  chmod 600 "$out/data.tgz" "$out/config.tgz"
  (cd "$out" && sha256sum data.tgz config.tgz > SHA256SUMS)
  chmod 600 "$out/SHA256SUMS"
  verify_archives "$out"
}

verify_archives() {
  local out=$1 archive
  (cd "$out" && sha256sum -c SHA256SUMS >/dev/null)
  for archive in "$out/data.tgz" "$out/config.tgz"; do
    gzip -t "$archive"
    # Refuse absolute paths and traversal before extraction; print no filenames/content.
    tar -tzf "$archive" | awk '
      $0 != "." && $0 !~ /^\.\// { bad=1 }
      $0 ~ /(^|\/)\.\.(\/|$)/ { bad=1 }
      END { exit bad ? 1 : 0 }'
  done
}

verify_database() {
  local data=$1 image=$2
  docker run --rm --user 0:0 --network none --mount "type=bind,source=$data,target=/data" \
    --entrypoint node "$image" -e '
    const Database=require("better-sqlite3");
    const db=new Database("/data/e3-tracking.sqlite", {fileMustExist:true});
    try {
      if(db.pragma("integrity_check",{simple:true})!=="ok") throw Error("Integrity check failed");
      if(db.pragma("foreign_key_check").length) throw Error("Foreign key check failed");
      if(db.prepare("SELECT MAX(id) id FROM schema_migrations").get().id!=="0036_enum_examples_cleanup.sql")
        throw Error("Expected pre-upgrade schema 0036");
      const counts={};
      for(const t of ["clients","projects","comments"])
        counts[t]=db.prepare("SELECT COUNT(*) n FROM "+t).get().n;
      console.log("Verified schema 0036 snapshot",JSON.stringify(counts));
    } finally { db.close(); }'
}

if [ "$MODE" = snapshot ]; then
  test -f .env && test -f /data/e3-tracking.sqlite
  app=$("${DC[@]}" ps -q app) || exit $?; test -n "$app"
  old_id=$(docker inspect --format '{{.Image}}' "$app") || exit $?
  old_pin=$(docker image inspect --format '{{index .RepoDigests 0}}' "$old_id") || exit $?
  [[ "$old_pin" =~ ^europe-west1-docker\.pkg\.dev/e3-tracking/e3-tracking/e3-tracking@sha256:[a-f0-9]{64}$ ]]
  SNAP=$BASE/pre-0037-$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -m 700 "$SNAP"
  printf '%s\n' "$old_id" > "$SNAP/image-id"
  printf '%s\n' "$old_pin" > "$SNAP/image-reference"
  chmod 600 "$SNAP/image-id" "$SNAP/image-reference"
  quiesce
  pack "$SNAP" /data /opt/e3-tracking
  (cd "$SNAP" && sha256sum image-id image-reference >> SHA256SUMS)
  verify_archives "$SNAP"
  check=$(mktemp -d "$SNAP/check.XXXXXX")
  tar --numeric-owner --acls --xattrs -xzpf "$SNAP/data.tgz" -C "$check"
  verify_database "$check" "$old_pin"
  printf 'Verified snapshot: %s\n' "$SNAP"
  echo 'Services remain stopped. Deploy only after adding public auth configuration.'
elif [ "$MODE" = rollback ]; then
  SNAP=$(readlink -e "${2:?verified pre-upgrade snapshot path required}")
  [[ "$SNAP" == "$BASE"/pre-0037-* ]] && [ -d "$SNAP" ]
  verify_archives "$SNAP"
  old_pin=$(cat "$SNAP/image-reference")
  [[ "$old_pin" =~ ^europe-west1-docker\.pkg\.dev/e3-tracking/e3-tracking/e3-tracking@sha256:[a-f0-9]{64}$ ]]
  quiesce
  FAILED=$BASE/failed-upgrade-$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -m 700 "$FAILED"
  mkdir -m 700 "$FAILED/data-live" "$FAILED/config-live"
  # Obtain BOTH checked NUL listings before any move. A find error aborts with live entries intact.
  find /data -mindepth 1 -maxdepth 1 -print0 > "$FAILED/data.entries" || exit $?
  find /opt/e3-tracking -mindepth 1 -maxdepth 1 -print0 > "$FAILED/config.entries" || exit $?
  chmod 600 "$FAILED/data.entries" "$FAILED/config.entries"
  # Preserve EVERY active entry, including dotfiles and newer WAL/SHM; do not overlay or delete them.
  while IFS= read -r -d '' item; do mv -- "$item" "$FAILED/data-live/" || exit $?; done < "$FAILED/data.entries"
  while IFS= read -r -d '' item; do mv -- "$item" "$FAILED/config-live/" || exit $?; done < "$FAILED/config.entries"
  # Use a marker rather than a filename: newline-only names must not masquerade as empty output.
  remaining=$(find /data -mindepth 1 -maxdepth 1 -printf x -quit) || exit $?
  [ -z "$remaining" ] || { echo 'Live data directory is not empty' >&2; exit 1; }
  remaining=$(find /opt/e3-tracking -mindepth 1 -maxdepth 1 -printf x -quit) || exit $?
  [ -z "$remaining" ] || { echo 'Live config directory is not empty' >&2; exit 1; }
  pack "$FAILED" "$FAILED/data-live" "$FAILED/config-live"
  tar --numeric-owner --acls --xattrs -xzpf "$SNAP/data.tgz" -C /data
  tar --numeric-owner --acls --xattrs -xzpf "$SNAP/config.tgz" -C /opt/e3-tracking
  verify_database /data "$old_pin"
  # Root verification may create WAL/SHM; restore intended app ownership before checking as node.
  for file in /data/e3-tracking.sqlite /data/e3-tracking.sqlite-wal /data/e3-tracking.sqlite-shm; do
    if [ -e "$file" ]; then chown 1000:1000 "$file"; fi
  done
  docker run --rm --user 1000:1000 --network none --mount type=bind,source=/data,target=/data \
    --entrypoint node "$old_pin" -e '
    const fs=require("node:fs");
    const rw=fs.constants.R_OK|fs.constants.W_OK;
    fs.accessSync("/data",rw|fs.constants.X_OK);
    for(const f of ["/data/e3-tracking.sqlite","/data/e3-tracking.sqlite-wal","/data/e3-tracking.sqlite-shm"])
      if(fs.existsSync(f)) fs.accessSync(f,rw);
    for(const d of ["/data/files","/data/backups"])
      if(fs.existsSync(d)) fs.accessSync(d,rw|fs.constants.X_OK);
    console.log("Restored data writable by uid1000");'
  chmod 600 /opt/e3-tracking/.env
  # Environment override pins app/backup/MCP to the recorded OLD digest; edge images stay cached.
  IMAGE="$old_pin" "${DC[@]}" up -d --force-recreate --pull never
  printf 'Rollback started; failed-upgrade data/config retained at %s\n' "$FAILED"
else
  echo 'Unsupported mode' >&2; exit 2
fi
```

The isolated verification container runs as root to access private extraction directories and opens the extracted copy directly with SQLite, without app startup/migrations. Private snapshot modes stay unchanged. After rollback verification, any surviving database/WAL/SHM receives uid/gid1000 ownership and a separate uid1000 process must prove live data access before app startup. Its copy can be writable; source archives remain unchanged. Retain both the archives and extracted copy privately until acceptance. If snapshot fails, do not upgrade: diagnose it and restart the old stack only while the original live data/config remain untouched. If rollback fails after moving entries, keep services stopped and preserve both staging directories for recovery. Never silently discard newer comments; after rollback they are absent from the active database but recoverable from failed-upgrade staging.

### Windows SDK and maintenance invocation

On this machine use the verified short-path interpreter to avoid non-ASCII `ProxyCommand` failures:

```powershell
$sdkPython = 'C:/Users/JNPAN~1/AppData/Local/Programs/Python/PYTHON~1/python.exe'
$sdkMain = 'C:/Users/JNPAN~1/AppData/Local/Google/CLOUDS~1/GOOGLE~1/lib/gcloud.py'
$env:CLOUDSDK_PYTHON = $sdkPython
$env:CLOUDSDK_SSH_PUTTY_FORCE_CONNECT = 'false'
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = '1'
function Invoke-E3Sdk {
    & $sdkPython -S $sdkMain @args
    if ($LASTEXITCODE -ne 0) { throw "Google SDK failed: $LASTEXITCODE" }
}
# Save the maintenance script as UTF-8 without BOM and LF; syntax-check using Git Bash first.
Invoke-E3Sdk compute ssh e3-tracking --project=e3-tracking --zone=europe-west1-b `
    --tunnel-through-iap --quiet --command='mkdir -p ~/e3-upgrade && chmod 700 ~/e3-upgrade' -- -T
Invoke-E3Sdk compute scp 'C:/path/to/e3-maintenance.sh' 'e3-tracking:e3-upgrade/e3-maintenance.sh' `
    --project=e3-tracking --zone=europe-west1-b --tunnel-through-iap --quiet
Invoke-E3Sdk compute ssh e3-tracking --project=e3-tracking --zone=europe-west1-b `
    --tunnel-through-iap --quiet --command='sudo bash ~/e3-upgrade/e3-maintenance.sh snapshot' -- -T
# Only on a failed release, substitute the EXACT previously verified snapshot path:
Invoke-E3Sdk compute ssh e3-tracking --project=e3-tracking --zone=europe-west1-b `
    --tunnel-through-iap --quiet `
    --command='sudo bash ~/e3-upgrade/e3-maintenance.sh rollback /var/backups/e3-tracking/pre-0037-TIMESTAMP' -- -T
```

For the existing Bash deploy scripts, start Git Bash in the repository and use this SDK wrapper. It translates existing local file paths for SDK scp, then disables MSYS argument rewriting only for that SDK call. Docker retains its normal local-path conversion. Confirm the wrapper with `gcloud config get-value project` before mutations.

```bash
export CLOUDSDK_PYTHON='C:/Users/JNPAN~1/AppData/Local/Programs/Python/PYTHON~1/python.exe'
export CLOUDSDK_SSH_PUTTY_FORCE_CONNECT=false
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
gcloud() {
  local arg
  local -a sdk_args=()
  for arg in "$@"; do
    if [[ "$arg" == /* && -e "$arg" ]]; then
      sdk_args+=("$(cygpath -w "$arg")")
    else
      sdk_args+=("$arg")
    fi
  done
  MSYS2_ARG_CONV_EXCL='*' "$CLOUDSDK_PYTHON" -S \
    C:/Users/JNPAN~1/AppData/Local/Google/CLOUDS~1/GOOGLE~1/lib/gcloud.py "${sdk_args[@]}"
}
export -f gcloud
gcloud config get-value project
bash deploy/gcp/02-build-push.sh --dry-run
bash deploy/gcp/02-build-push.sh --yes
bash deploy/gcp/03-deploy.sh REVIEWED_TAG --dry-run
# Snapshot and public env update must finish before the actual03 invocation.
bash deploy/gcp/03-deploy.sh REVIEWED_TAG --yes
```

`02-build-push.sh` derives its tag from `git describe --always --dirty`; record the exact full commit, approved source diff and registry digest even when an unchanged machine `.mcp.json` adds the dirty suffix. `03-deploy.sh` pulls only app/backup images (MCP uses the same cached application image), preserving cached Caddy/oauth2-proxy images. Caddy/oauth2-proxy stay running during the data snapshot. If the reviewed edge configuration changed, explicitly recreate them after config installation with `docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge up -d --force-recreate --pull never caddy oauth2-proxy`; retain recorded edge image digests, and do not run a broad pull.

### Shared commenter configuration and release verification

After a verified snapshot, add these public values on the VM, while writers stay stopped. This changes only these four keys; the existing Internal staff OAuth client ID/secret and cookie secret remain intact.

```bash
cd /opt/e3-tracking
for setting in   'GOOGLE_COMMENT_CLIENT_ID=1001419691959-vjn2nb335rn91u33gs1so12kj8mhau45.apps.googleusercontent.com'   'E3_PUBLIC_ORIGIN=https://tracking.e3-services.com'   'COMMENT_STAFF_SESSION=1'   'WORKSPACE_DOMAIN=e3-services.com'; do
  key=${setting%%=*}
  sed -i "/^${key}=/d" .env
  printf '%s\n' "$setting" >> .env
done
chmod 600 .env
```

Run as root through the SDK command/script channel. Never print `.env`, `docker compose config`, container environment, OAuth JSON or credential-bearing archives. Google commenter auth uses the External public client ID only; see [shared Google setup](SHARED-GOOGLE-AUTH.md).

A successful `03-deploy.sh` means the HTTP health check passed; it does not prove the full release. Independently require the expected registry digest for app/backup, `schema_migration=0038_comment_auth_sessions.sql`, writable data, guest and Google/staff identity behavior, read-only/name-required/revoked shares, private-comment exclusion, copied reply links and counts. Run `04-backup.sh --run-now` and `07-mcp.sh`, each with `--dry-run` first, and verify backup upload/restore rehearsal and read-only MCP behavior. Keep the pre-upgrade snapshot and previous images until these checks pass. Do not exercise notification delivery by stopping production as a routine upgrade check.

### Costs (estimate)

e2-micro about 6 to 7 EUR (upgrade to e2-small, about 13 EUR, if memory is tight), 20 GB pd-balanced about 2 EUR, 20 GB boot disk about 2 EUR, static IP in use free, Artifact Registry and bucket cents, uptime checks within the free tier: roughly 15 to 25 EUR per month. Teardown is manual in the console and not scripted.

### GCP deployment: addenda (T-5-07 review fixes)

- **Machine size (D-72 amendment 1):** the default is `e2-micro` (1 GB) with a 2 GB swapfile created by `startup.sh`. To upgrade, stop the VM, `gcloud compute instances set-machine-type <vm> --machine-type e2-small --zone <zone>`, start it, and set `MACHINE_TYPE` in `config.env`. The data disk is kept.
- **Permissions:** your Google account needs `roles/iap.tunnelResourceAccessor` and `roles/compute.osAdminLogin` (OS Login with passwordless sudo, needed for `sudo docker`; or docker group membership) to use `--tunnel-through-iap`. The first `gcloud compute ssh` generates an SSH key and asks for an optional passphrase, and may take a minute to propagate.
- **File layout on the VM:** `03-deploy.sh` uploads to `~/e3-deploy/`, then installs with sudo into `/opt/e3-tracking/` (`docker-compose.yml`, `docker-compose.gcp.yml`, `deploy/edge/Caddyfile`, `.env` mode 600). The override passes `HOSTNAME` to caddy and `BACKUP_BUCKET` to the backup service.
- **First deploy only:** `03-deploy.sh` writes a `.env` with `REPLACE_ME` OAuth values and stops (exit 1) before `up -d`. Fill staff OAuth values privately and rerun. On the existing VM it preserves `.env` values and updates IMAGE. Health failure now exits nonzero; use the schema-aware rollback procedure for a failed migrated upgrade.
- **Cut-over order:** the app must be deployed and healthy first. The default `05-cutover.sh <project-id>...` downloads each backup and prints the browser steps: open `https://<HOSTNAME>/tracking-plan/`, create the client, Clients page, Restore backup, choose the file, confirm the preview. `--via-tunnel` automates this: it creates or reuses the client (`CLIENT_NAME`, default "Imported") and posts preview and apply from inside the VM's app container over IAP ssh. The peer is 127.0.0.1, which is why the default `TRUSTED_PROXY_CIDR` written to `.env` is `172.28.0.8/29,127.0.0.1/32`; only processes inside the app container can connect from loopback, so nothing external gains trust.
- **Monitoring:** `06-monitoring.sh` uses `gcloud alpha monitoring policies`, which may be unavailable; if it fails, create the alert policy in the console from the uptime check. The script continues.

## Shared Google commenters
See [SHARED-GOOGLE-AUTH.md](SHARED-GOOGLE-AUTH.md) for the separate External client and app environment. Existing Internal staff OAuth remains unchanged.
