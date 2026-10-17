#!/usr/bin/env bash
# Release of T-5-47..T-5-49 (D-89 finding priority backend and UI; enum selects wear their badge).
# Code-only: no migration (live and target schema are both 0045), no deploy/compose/Dockerfile or
# dependency change since the live image 15abadb. Prepared, NOT run. Needs the user's go-ahead; see
# RELEASE-PRIORITY-2026-10-16.md.
#
# Before running: build and push the release commit from a clean checkout (02-build-push.sh, dry run
# first), then fill in TAG and EXPECTED_DIGEST below.
#   bash .claude/team/reports/ops/release-T-5-49-priority.sh --dry-run
#   bash .claude/team/reports/ops/release-T-5-49-priority.sh
# Rollback of a code-only release: redeploy the previous image (same schema, no data restore):
#   bash deploy/gcp/03-deploy.sh 15abadb --yes
# Data restore only if data was damaged, with the EXACT snapshot path step 1 prints:
#   sudo bash ~/e3-upgrade/e3-maintenance-portal-schema0045.sh rollback /var/backups/e3-tracking/post-portal-0045-TIMESTAMP
set -uo pipefail
cd "$(dirname "$0")/../../../.."
. .claude/team/reports/ops/gcloud-wrapper.sh
TAG=f5de6ed
EXPECTED_DIGEST=sha256:e774ba19b4973a614de2d6af7577c83e80e3a61ce6d27efa5628c41fda9d8bda
PREVIOUS_TAG=15abadb
DRY_RUN=0
[ "${1:-}" = --dry-run ] && DRY_RUN=1
SSH=(gcloud compute ssh e3-tracking --tunnel-through-iap --zone europe-west1-b --project e3-tracking)
DC='sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge'
HOST=https://tracking.e3-services.com

if [ "$DRY_RUN" = 0 ] && { [ "$TAG" = REPLACE_WITH_TAG ] || [ "$EXPECTED_DIGEST" = REPLACE_WITH_SHA256_DIGEST ]; }; then
  echo "Fill in TAG and EXPECTED_DIGEST first (from 02-build-push.sh and the registry)." >&2; exit 2
fi

echo "== 0/4 read-only preflight (enforced: project e3-tracking, live schema 0045, last upload ok)"
PROJECT=$(gcloud config get-value project 2>/dev/null)
HEALTH=$(curl -fsS "$HOST/api/health") || { echo "Live health check failed. Stop." >&2; exit 1; }
echo "project: $PROJECT"; echo "$HEALTH"
[ "$PROJECT" = e3-tracking ] || { echo "Wrong gcloud project. Stop." >&2; exit 1; }
printf '%s' "$HEALTH" | grep -q '"schema_migration":"0045_share_audience.sql"' || { echo "Live schema is not 0045. Stop." >&2; exit 1; }
printf '%s' "$HEALTH" | grep -q '"last_upload_ok":true' || { echo "Last backup upload not ok. Stop and check backups first." >&2; exit 1; }

if [ "$DRY_RUN" = 1 ]; then
  echo "== 1/4 (dry run) would run on the VM: sudo bash ~/e3-upgrade/e3-maintenance-portal-schema0045.sh snapshot"
  echo "== 2/4 (dry run) deploy plan:"
  bash deploy/gcp/03-deploy.sh "$TAG" --dry-run
  echo "== 3/4 (dry run) would compare the running app digest with $EXPECTED_DIGEST"
  echo "== 4/4 (dry run) smoke checks are listed in the readiness report"
  exit 0
fi

echo "== 1/4 verified pre-release snapshot of the 0045 state (writers stop now)"
# Decide on the printed "Verified snapshot:" line, not on the SSH exit code (T-5-38 lesson).
SNAP_OUT=$("${SSH[@]}" --command='sudo bash ~/e3-upgrade/e3-maintenance-portal-schema0045.sh snapshot' -- -T 2>&1)
SNAP_RC=$?
printf '%s\n' "$SNAP_OUT"
SNAP_PATH=$(printf '%s\n' "$SNAP_OUT" | sed -n 's/^Verified snapshot: \(\/var\/backups\/e3-tracking\/post-portal-0045-[0-9TZ]*\)$/\1/p' | tail -1)
if [ -z "$SNAP_PATH" ]; then
  echo "No verified snapshot (ssh exit $SNAP_RC). Stop here: services may be stopped; read the output above." >&2
  exit 1
fi
echo "Snapshot: $SNAP_PATH (ssh exit $SNAP_RC). Record it."

echo "== 2/4 deploy $TAG (no migration)"
bash deploy/gcp/03-deploy.sh "$TAG" --yes || { echo "03-deploy failed. Roll back: bash deploy/gcp/03-deploy.sh $PREVIOUS_TAG --yes" >&2; exit 1; }

echo "== 3/4 running app digest must equal the pushed digest"
RUNNING=$("${SSH[@]}" --command="cd /opt/e3-tracking && sudo docker image inspect --format '{{index .RepoDigests 0}}' \$(sudo docker inspect --format '{{.Image}}' \$($DC ps -q app))" -- -T 2>/dev/null | tr -d '\r' | sed -n 's/.*@\(sha256:[0-9a-f]*\).*/\1/p' | tail -1)
echo "running: $RUNNING"; echo "expected: $EXPECTED_DIGEST"
[ "$RUNNING" = "$EXPECTED_DIGEST" ] || echo "WARNING: digest mismatch. Investigate before the host checks; roll back with: bash deploy/gcp/03-deploy.sh $PREVIOUS_TAG --yes" >&2

echo "== 4/4 smoke"
curl -fsS "$HOST/api/health"; echo
echo "expect schema_migration 0045_share_audience.sql, ok true"
echo "expect 404 (unknown token):"
for path in document-summary.json findings.json events/x/card.json history; do
  curl -s -o /dev/null -w "  /api/shared/not-a-token/$path %{http_code}\n" "$HOST/api/shared/not-a-token/$path"
done
echo "expect 200 text/html (portal deep path):"
curl -s -o /dev/null -w '  %{http_code} %{content_type}\n' "$HOST/tracking-plan/shared/not-a-token/qa"
echo "expect 302 (staff app signed out):"; curl -s -o /dev/null -w '  %{http_code}\n' "$HOST/tracking-plan/"
echo "expect 401 (MCP without token):"; curl -s -o /dev/null -w '  %{http_code}\n' -X POST "$HOST/mcp"
echo "Snapshot: $SNAP_PATH. Previous image: $PREVIOUS_TAG. Now run the host checks in the readiness report."
