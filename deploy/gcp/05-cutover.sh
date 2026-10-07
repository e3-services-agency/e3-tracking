#!/usr/bin/env bash
# Usage: 05-cutover.sh <project-id>... [--dry-run] [--yes]
# Exports each project's backup.json from the local container (port 3020) and restores it on the VM.
# The restore goes through an IAP SSH tunnel to the app port inside the VM, which avoids the OAuth proxy
# (scripted calls cannot pass a browser sign-in). Fallback: the restore form on the Clients page.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ "${#ARGS[@]}" -gt 0 ] || { echo "Usage: $0 <project-id>... [--dry-run] [--yes]" >&2; exit 2; }
plan_header "05 cutover"
LOCAL="${LOCAL_URL:-http://127.0.0.1:3020}"
IAP=(--tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID")
OUT="${OUT_DIR:-$GCP_DIR/cutover-out}"
TUNNEL_PORT=3021
say "Plan: export from $LOCAL, open a tunnel localhost:$TUNNEL_PORT -> VM app, preview then apply the restore."
if [ "$DRY_RUN" = 1 ]; then
  for p in "${ARGS[@]}"; do
    show curl -fsS "$LOCAL/api/projects/$p/export/backup.json" -o "$OUT/backup-$p.json"
  done
  show gcloud compute ssh "$VM_NAME" "${IAP[@]}" -- -N -L "$TUNNEL_PORT:127.0.0.1:3001"
  for p in "${ARGS[@]}"; do
    show curl -fsS -X POST "http://127.0.0.1:$TUNNEL_PORT/api/projects/restore-backup/preview" -H 'Content-Type: application/json' --data-binary "@$OUT/backup-$p.json"
    show curl -fsS -X POST "http://127.0.0.1:$TUNNEL_PORT/api/projects/restore-backup/apply" -H 'Content-Type: application/json' --data-binary "@$OUT/apply-$p.json"
  done
  say "NOTE: the VM app port must be reachable from inside the VM (the edge profile publishes it on 127.0.0.1:3001); otherwise restore through the Clients page."
  exit 0
fi
confirm_once
mkdir -p "$OUT"
for p in "${ARGS[@]}"; do
  curl -fsS "$LOCAL/api/projects/$p/export/backup.json" -o "$OUT/backup-$p.json"
  say "exported $p ($(wc -c < "$OUT/backup-$p.json") bytes)"
done
gcloud compute ssh "$VM_NAME" "${IAP[@]}" -- -N -L "$TUNNEL_PORT:127.0.0.1:3001" &
TUN=$!
trap 'kill $TUN 2>/dev/null || true' EXIT
sleep 8
for p in "${ARGS[@]}"; do
  prev="$(curl -fsS -X POST "http://127.0.0.1:$TUNNEL_PORT/api/projects/restore-backup/preview" -H 'Content-Type: application/json' --data-binary "@$OUT/backup-$p.json")"
  say "preview $p: ${prev:0:600}"
  hash="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).payload_hash)' "$prev")"
  node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({backup:JSON.parse(fs.readFileSync(process.argv[1],"utf8")),payload_hash:process.argv[2]}))' "$OUT/backup-$p.json" "$hash" > "$OUT/apply-$p.json"
  res="$(curl -fsS -X POST "http://127.0.0.1:$TUNNEL_PORT/api/projects/restore-backup/apply" -H 'Content-Type: application/json' --data-binary "@$OUT/apply-$p.json")"
  say "applied $p: ${res:0:600}"
done
