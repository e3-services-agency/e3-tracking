#!/usr/bin/env bash
# Sets BACKUP_BUCKET in the VM .env and restarts the backup service. The nightly job (D-66) uploads each
# backup to gs://$BUCKET/<project_key>/<timestamp>.json (T-5-08). Flags: --dry-run, --yes,
# --run-now (run one backup on the VM now and print the upload log line; also run without the env step).
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
plan_header "04 backup"
IAP=(--tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID")
DC="sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge"
CMD="cd /opt/e3-tracking && sudo test -f .env && { if sudo grep -q '^BACKUP_BUCKET=' .env; then sudo sed -i 's#^BACKUP_BUCKET=.*#BACKUP_BUCKET=$BUCKET#' .env; else echo 'BACKUP_BUCKET=$BUCKET' | sudo tee -a .env >/dev/null; fi; } && $DC up -d backup"
RUN_NOW=0
for a in "${ARGS[@]:-}"; do [ "$a" = "--run-now" ] && RUN_NOW=1; done
if [ "$RUN_NOW" = 0 ]; then run gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$CMD"; fi
if [ "$RUN_NOW" = 1 ]; then
  run gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "set -o pipefail; cd /opt/e3-tracking && $DC exec -T backup node api/_backend/backup-job.js --once 2>&1 | grep -E 'e3-backup'; rc=\${PIPESTATUS[0]}; echo \"[e3-backup] run-now exit status \$rc\"; exit \$rc"
  say "Look for 'uploaded gs://$BUCKET/...'. Then verify yourself: gcloud storage ls gs://$BUCKET/ --recursive"
else
  say "The backup service runs nightly (BACKUP_HOUR_UTC) and writes /data/backups, then uploads to gs://$BUCKET/<project_key>/<timestamp>.json."
  say "Next: deploy/gcp/04-backup.sh --run-now, then check: gcloud storage ls gs://$BUCKET/ --recursive"
fi
