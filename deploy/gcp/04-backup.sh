#!/usr/bin/env bash
# Sets BACKUP_BUCKET in the VM .env and restarts the backup service. The nightly job already exists
# (D-66); the upload step itself is T-5-08. Flags: --dry-run, --yes.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
plan_header "04 backup"
IAP=(--tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID")
DC="sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge"
CMD="cd /opt/e3-tracking && sudo test -f .env && { if sudo grep -q '^BACKUP_BUCKET=' .env; then sudo sed -i 's#^BACKUP_BUCKET=.*#BACKUP_BUCKET=$BUCKET#' .env; else echo 'BACKUP_BUCKET=$BUCKET' | sudo tee -a .env >/dev/null; fi; } && $DC up -d backup"
run gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$CMD"
say "The backup service runs nightly (BACKUP_HOUR_UTC) and writes /data/backups; uploads to gs://$BUCKET arrive with T-5-08."
say "Manual run on the VM:"
say "  gcloud compute ssh $VM_NAME --tunnel-through-iap --zone $ZONE --command \"cd /opt/e3-tracking && $DC exec backup node api/_backend/backup-job.js --once\""
