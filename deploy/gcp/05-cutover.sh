#!/usr/bin/env bash
# Usage: 05-cutover.sh <project-id>... [--via-tunnel] [--dry-run] [--yes]
# Default (browser path): downloads each project's backup.json from the local container (port 3020) and
# prints the exact steps to restore it through the deployed app's Clients page.
# --via-tunnel: also restores automatically. The calls run INSIDE the VM's app container over IAP ssh
# (peer 127.0.0.1, which TRUSTED_PROXY_CIDR trusts), so the OAuth proxy is not involved.
# Env: CLIENT_NAME (client to create or reuse on the VM, default "Imported"), LOCAL_URL, OUT_DIR.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
VIA_TUNNEL=0
PROJECTS=()
for a in "${ARGS[@]+"${ARGS[@]}"}"; do
  case "$a" in
    --via-tunnel) VIA_TUNNEL=1 ;;
    *) PROJECTS+=("$a") ;;
  esac
done
[ "${#PROJECTS[@]}" -gt 0 ] || { echo "Usage: $0 <project-id>... [--via-tunnel] [--dry-run] [--yes]" >&2; exit 2; }
plan_header "05 cutover"
LOCAL="${LOCAL_URL:-http://127.0.0.1:3020}"
IAP=(--tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID")
OUT="${OUT_DIR:-$GCP_DIR/cutover-out}"
CLIENT_NAME="${CLIENT_NAME:-Imported}"
DC="cd /opt/e3-tracking && sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge"
# Remote helper: node one-liner inside the app container. Args: METHOD PATH; body on stdin.
NODE_POST='let b="";process.stdin.setEncoding("utf8");process.stdin.on("data",d=>b+=d).on("end",async()=>{const r=await fetch("http://127.0.0.1:3001"+process.argv[2],{method:process.argv[1],headers:{"content-type":"application/json","x-forwarded-email":"cutover@'"$WORKSPACE_DOMAIN"'"},body:process.argv[1]==="GET"?undefined:b});const t=await r.text();if(!r.ok){process.stderr.write("HTTP "+r.status+" "+t);process.exit(1)}process.stdout.write(t)})'
vm_call() { # METHOD PATH (stdin = body)
  gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$DC exec -T app node -e '$NODE_POST' $1 $2"
}

say "Plan: export from $LOCAL into $OUT; $([ "$VIA_TUNNEL" = 1 ] && echo 'then restore over IAP ssh inside the VM app container.' || echo 'then print the browser restore steps.')"
if [ "$DRY_RUN" = 1 ]; then
  for p in "${PROJECTS[@]}"; do
    show curl -fsS "$LOCAL/api/projects/$p/export/backup.json" -o "$OUT/backup-$p.json"
  done
  if [ "$VIA_TUNNEL" = 1 ]; then
    say "# --via-tunnel: calls run inside the VM app container (peer 127.0.0.1)"
    show gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$DC exec -T app node -e <post-helper> GET /api/clients"
    say "# only when client '$CLIENT_NAME' is missing: POST /api/clients with {name}"
    for p in "${PROJECTS[@]}"; do
      show gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$DC exec -T app node -e <post-helper> POST /api/projects/restore-backup/preview"
      show gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$DC exec -T app node -e <post-helper> POST /api/projects/restore-backup/apply"
    done
  fi
  say "Browser steps: open https://$HOSTNAME/tracking-plan/, create the client, Clients page > Restore backup > choose each file, confirm the preview."
  exit 0
fi
confirm_once
mkdir -p "$OUT"
for p in "${PROJECTS[@]}"; do
  curl -fsS "$LOCAL/api/projects/$p/export/backup.json" -o "$OUT/backup-$p.json"
  say "exported $p ($(wc -c < "$OUT/backup-$p.json") bytes) -> $OUT/backup-$p.json"
done
if [ "$VIA_TUNNEL" != 1 ]; then
  say
  say "Restore in the browser (restore always creates a NEW project, never overwrites):"
  say "  1. Open https://$HOSTNAME/tracking-plan/ and sign in with your Workspace account."
  say "  2. Create the client if it does not exist yet (Clients page)."
  say "  3. Clients page > Restore backup > choose a file from $OUT."
  say "  4. Review the preview counts and confirm."
  say "Automatic alternative: rerun with --via-tunnel."
  exit 0
fi
# Wait for the ssh path instead of sleeping: retry the first call until the container answers.
clients=""
for _ in 1 2 3 4 5 6; do
  clients="$(printf '' | vm_call GET /api/clients 2>/dev/null)" && [ -n "$clients" ] && break
  sleep 5
done
[ -n "$clients" ] || { echo "The app on the VM did not answer over ssh." >&2; exit 1; }
cid="$(node -e 'const l=JSON.parse(process.argv[1]);const a=Array.isArray(l)?l:(l.clients||[]);const c=a.find(x=>x.name===process.argv[2]);process.stdout.write(c?c.id:"")' "$clients" "$CLIENT_NAME")"
if [ -z "$cid" ]; then
  ckey="$(printf '%s' "$CLIENT_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//')"
  created="$(printf '{"name":"%s","key":"%s"}' "$CLIENT_NAME" "$ckey" | vm_call POST /api/clients)" || { echo "Creating client failed: $created" >&2; exit 1; }
  cid="$(node -e 'try{const c=JSON.parse(process.argv[1]);process.stdout.write(c.id||"")}catch{}' "$created")"
  [ -n "$cid" ] || { echo "Client creation returned no id: $created" >&2; exit 1; }
  say "created client $CLIENT_NAME ($cid)"
fi
for p in "${PROJECTS[@]}"; do
  prev="$(vm_call POST /api/projects/restore-backup/preview < "$OUT/backup-$p.json")"
  say "preview $p: ${prev:0:600}"
  node -e '
    const fs=require("fs");
    const prev=JSON.parse(process.argv[1]);const backup=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
    const pr=backup.project||(backup.tables&&backup.tables.projects&&backup.tables.projects[0])||{};
    const body={backup,payload_hash:prev.payload_hash,project:{name:pr.name||process.argv[4],key:pr.key||process.argv[4],client_id:process.argv[3]}};
    fs.writeFileSync(process.argv[5],JSON.stringify(body));' "$prev" "$OUT/backup-$p.json" "$cid" "$p" "$OUT/apply-$p.json"
  res="$(vm_call POST /api/projects/restore-backup/apply < "$OUT/apply-$p.json")"
  say "applied $p: ${res:0:600}"
done
