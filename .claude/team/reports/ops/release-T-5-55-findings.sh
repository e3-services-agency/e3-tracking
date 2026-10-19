#!/usr/bin/env bash
set -euo pipefail
OP_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
source "$OP_ROOT/.claude/team/reports/ops/gcloud-wrapper.sh"
: "${RELEASE_TREE:?clean reviewed worktree required}"
export CONFIG="$OP_ROOT/deploy/gcp/config.env"
cd "$RELEASE_TREE"
ACTION="${1:?action required}"
case "$ACTION" in
 build-plan) bash deploy/gcp/02-build-push.sh --dry-run ;;
 build)
   test -z "$(git status --porcelain)" || { echo 'Release source is dirty'; exit 1; }
   : "${RELEASE_COMMIT:?exact reviewed commit required}"
   test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"
   bash deploy/gcp/02-build-push.sh --yes ;;
 backup-plan) bash deploy/gcp/04-backup.sh --run-now --dry-run ;;
 backup) bash deploy/gcp/04-backup.sh --run-now --yes ;;
 audit)
   gcloud compute ssh e3-tracking --project e3-tracking --zone europe-west1-b --tunnel-through-iap --command "$(cat "$OP_ROOT/.claude/team/reports/ops/e3-odo-host-audit.sh")" -- -T ;;
 snapshot)
   OUT=$(gcloud compute ssh e3-tracking --project e3-tracking --zone europe-west1-b --tunnel-through-iap --command 'sudo bash ~/e3-upgrade/e3-maintenance-odo-schema0050.sh snapshot' -- -T 2>&1) || { printf '%s\n' "$OUT"; exit 1; }
   printf '%s\n' "$OUT"
   printf '%s\n' "$OUT" | grep -Eq '^Verified snapshot: /var/backups/e3-tracking/post-portal-0050-[0-9TZ]+$' ;;
 deploy-plan)
   : "${RELEASE_TAG:?exact reviewed tag required}"
   bash deploy/gcp/03-deploy.sh "$RELEASE_TAG" --dry-run ;;
 deploy)
   : "${RELEASE_TAG:?exact reviewed tag required}" "${EXPECTED_DIGEST:?pushed digest required}"
   test -z "$(git status --porcelain)" || { echo 'Release source is dirty'; exit 1; }
   test "$(git describe --always --dirty)" = "$RELEASE_TAG"
   bash deploy/gcp/03-deploy.sh "$RELEASE_TAG" --yes
   RUNNING=$(gcloud compute ssh e3-tracking --project e3-tracking --zone europe-west1-b --tunnel-through-iap --command 'sudo docker inspect --format "{{index .RepoDigests 0}}" $(sudo docker inspect --format "{{.Image}}" e3-tracking-app-1)' -- -T 2>/dev/null | tr -d '\r' | sed -n 's/.*@\(sha256:[0-9a-f]*\).*/\1/p' | tail -1)
   printf 'Expected digest: %s\nRunning digest: %s\n' "$EXPECTED_DIGEST" "$RUNNING"
   test "$RUNNING" = "$EXPECTED_DIGEST" || { echo 'Running digest mismatch'; exit 1; } ;;
 *) echo 'Unknown action' >&2; exit 2 ;;
esac