#!/usr/bin/env bash
set -euo pipefail
umask 077
MODE=${1:?usage: e3-maintenance.sh snapshot | rollback /var/backups/e3-tracking/post-mcp-0044-TIMESTAMP}
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
      if(db.prepare("SELECT MAX(id) id FROM schema_migrations").get().id!=="0044_mcp_grant_all_projects.sql")
        throw Error("Expected schema 0044");
      const counts={};
      for(const t of ["clients","projects","comments"])
        counts[t]=db.prepare("SELECT COUNT(*) n FROM "+t).get().n;
      console.log("Verified schema 0044 snapshot",JSON.stringify(counts));
    } finally { db.close(); }'
}

revoke_restored_http_authorizations() {
  local data=$1 image=$2
  # A full snapshot can otherwise resurrect a revoked grant or consumed authorization code.
  # Keep application records and audit history; invalidate only operational connector state.
  docker run --rm --user 0:0 --network none --mount "type=bind,source=$data,target=/data" \
    --entrypoint node "$image" -e '
    const Database=require("better-sqlite3");
    const {randomUUID}=require("node:crypto");
    const db=new Database("/data/e3-tracking.sqlite",{fileMustExist:true});
    try {
      if(db.prepare("SELECT MAX(id) id FROM schema_migrations").get().id!=="0044_mcp_grant_all_projects.sql") throw Error("Expected restored schema0044");
      const timestamp=Math.floor(Date.now()/1000);
      db.transaction(()=>{
        db.prepare("UPDATE mcp_oauth_grants SET revoked_at=COALESCE(revoked_at,?)").run(timestamp);
        for(const table of ["mcp_oauth_pending","mcp_oauth_codes","mcp_oauth_tokens","mcp_oauth_qa_runs"]) db.exec("DELETE FROM "+table);
        db.prepare("INSERT INTO mcp_oauth_audit(id,grant_id,owner,action,tool,created_at) VALUES(?,NULL,?,?,NULL,?)").run(randomUUID(),"System","snapshot_restore_revocation",timestamp);
      })();
      if(db.prepare("SELECT COUNT(*) n FROM mcp_oauth_grants WHERE revoked_at IS NULL").get().n) throw Error("Restored grant revocation failed");
      console.log("Restored HTTP authorizations revoked; fresh consent required");
    } finally {db.close();}'
}
if [ "$MODE" = snapshot ]; then
  test -f .env && test -f /data/e3-tracking.sqlite
  app=$("${DC[@]}" ps -q app) || exit $?; test -n "$app"
  old_id=$(docker inspect --format '{{.Image}}' "$app") || exit $?
  old_pin=$(docker image inspect --format '{{index .RepoDigests 0}}' "$old_id") || exit $?
  [[ "$old_pin" =~ ^europe-west1-docker\.pkg\.dev/e3-tracking/e3-tracking/e3-tracking@sha256:[a-f0-9]{64}$ ]]
  SNAP=$BASE/post-mcp-0044-$(date -u +%Y%m%dT%H%M%SZ)
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
  echo 'Services remain stopped. Deploy the reviewed UI image with the current auth configuration preserved.'
elif [ "$MODE" = rollback ]; then
  SNAP=$(readlink -e "${2:?verified pre-upgrade snapshot path required}")
  [[ "$SNAP" == "$BASE"/post-mcp-0044-* ]] && [ -d "$SNAP" ]
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
  revoke_restored_http_authorizations /data "$old_pin"
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
