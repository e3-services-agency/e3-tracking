#!/usr/bin/env bash
# Checks gcloud login, project and billing, enables the needed APIs. Flags: --dry-run, --yes.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
plan_header "00 preflight"
say "Plan: verify an active gcloud account, project $PROJECT_ID exists with billing, enable APIs."
if [ "$DRY_RUN" = 1 ]; then
  show gcloud auth list --filter=status:ACTIVE --format='value(account)'
  show gcloud projects describe "$PROJECT_ID" --format='value(projectId)'
  show gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)'
else
  acct="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
  [ -n "$acct" ] || { echo "No active gcloud account. Run: gcloud auth login" >&2; exit 1; }
  say "account: $acct"
  gcloud projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null ||
    { echo "Project $PROJECT_ID not found. Create it in the console first." >&2; exit 1; }
  [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')" = "True" ] ||
    { echo "Billing is not enabled on $PROJECT_ID." >&2; exit 1; }
fi
run gcloud services enable compute.googleapis.com artifactregistry.googleapis.com \
  storage.googleapis.com iap.googleapis.com monitoring.googleapis.com --project "$PROJECT_ID"
say "Preflight done."
