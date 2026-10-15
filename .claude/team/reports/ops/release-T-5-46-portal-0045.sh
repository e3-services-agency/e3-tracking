#!/usr/bin/env bash
# T-5-46 release: client portal v2 (D-88, T-5-40..T-5-46). Migration 0044 -> 0045 (share audience).
# Prepared, NOT run. Needs the user's explicit go-ahead; see
# .claude/team/reports/RELEASE-PORTAL-V2-2026-10-15.md for the gates and the host-only checks.
#
# Before running: build and push the reviewed commit (02-build-push.sh, dry run first), then fill in
# TAG and EXPECTED_DIGEST below from its output and the registry.
# Run from PowerShell inside the repo folder:
#   & "C:\Program Files\Git\bin\bash.exe" .claude/team/reports/ops/release-T-5-46-portal-0045.sh --dry-run
#   & "C:\Program Files\Git\bin\bash.exe" .claude/team/reports/ops/release-T-5-46-portal-0045.sh
# Rollback (failed release only), with the EXACT snapshot path step 1 printed:
#   sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0044.sh rollback /var/backups/e3-tracking/post-mcp-0044-TIMESTAMP
set -uo pipefail
cd "$(dirname "$0")/../../../.."
. .claude/team/reports/ops/gcloud-wrapper.sh
TAG=REPLACE_WITH_TAG
EXPECTED_DIGEST=REPLACE_WITH_SHA256_DIGEST
DRY_RUN=0
[ "${1:-}" = --dry-run ] && DRY_RUN=1
SSH=(gcloud compute ssh e3-tracking --tunnel-through-iap --zone europe-west1-b --project e3-tracking)
DC='sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge'
HOST=https://tracking.e3-services.com

if [ "$DRY_RUN" = 0 ] && { [ "$TAG" = REPLACE_WITH_TAG ] || [ "$EXPECTED_DIGEST" = REPLACE_WITH_SHA256_DIGEST ]; }; then
  echo "Fill in TAG and EXPECTED_DIGEST first (from 02-build-push.sh and the registry)." >&2; exit 2
fi

echo "== 0/4 read-only preflight: live schema must be 0044, project must be e3-tracking"
gcloud config get-value project
curl -fsS "$HOST/api/health"; echo
echo "expect schema_migration 0044_mcp_grant_all_projects.sql above"

if [ "$DRY_RUN" = 1 ]; then
  echo "== 1/4 (dry run) would run on the VM: sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0044.sh snapshot"
  echo "== 2/4 (dry run) would upload e3-maintenance-portal-schema0045.sh to ~/e3-upgrade/"
  echo "== 3/4 dry run of the deploy:"
  bash deploy/gcp/03-deploy.sh "$TAG" --dry-run
  echo "== 4/4 (dry run) smoke checks are printed in the readiness report"
  exit 0
fi

echo "== 1/4 verified pre-upgrade snapshot of the 0044 state (writers stop now)"
# T-5-38 lesson: the snapshot SSH can exit non-zero after a good snapshot ("Services remain
# stopped"). Decide on the printed "Verified snapshot:" line, not on the exit code.
SNAP_OUT=$("${SSH[@]}" --command='sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0044.sh snapshot' -- -T 2>&1)
SNAP_RC=$?
printf '%s\n' "$SNAP_OUT"
SNAP_PATH=$(printf '%s\n' "$SNAP_OUT" | sed -n 's/^Verified snapshot: \(\/var\/backups\/e3-tracking\/post-mcp-0044-[0-9TZ]*\)$/\1/p' | tail -1)
if [ -z "$SNAP_PATH" ]; then
  echo "No verified snapshot (ssh exit $SNAP_RC). Stop here: services may be stopped; read the output above." >&2
  exit 1
fi
echo "Snapshot: $SNAP_PATH (ssh exit $SNAP_RC). Record it; it is the rollback point."

echo "== 2/4 upload the schema 0045 maintenance script for later releases"
gcloud compute scp .claude/team/reports/ops/e3-maintenance-portal-schema0045.sh \
  e3-tracking:e3-upgrade/e3-maintenance-portal-schema0045.sh \
  --tunnel-through-iap --zone europe-west1-b --project e3-tracking --quiet \
  || echo "WARNING: upload failed; upload it by hand after the release (not needed for this deploy)." >&2

echo "== 3/4 deploy $TAG (migration 0045 runs on start)"
bash deploy/gcp/03-deploy.sh "$TAG" --yes || { echo "03-deploy failed. Decide on rollback with $SNAP_PATH." >&2; exit 1; }

echo "== 4/4 smoke"
"${SSH[@]}" --command="cd /opt/e3-tracking && sudo docker image inspect --format '{{index .RepoDigests 0}}' \$(sudo docker inspect --format '{{.Image}}' \$($DC ps -q app))" -- -T
curl -fsS "$HOST/api/health"; echo
echo "Expected app digest: $EXPECTED_DIGEST ; expected schema_migration: 0045_share_audience.sql"
echo "expect 404 (unknown token, lazy routes):"
for path in document-summary.json findings.json events/x/card.json history; do
  curl -s -o /dev/null -w "  /api/shared/not-a-token/$path %{http_code}\n" "$HOST/api/shared/not-a-token/$path"
done
echo "expect 200 text/html (portal deep path is public):"
curl -s -o /dev/null -w '  %{http_code} %{content_type}\n' "$HOST/tracking-plan/shared/not-a-token/events/cart_update"
echo "expect 401 (MCP unchanged):"; curl -s -o /dev/null -w '  %{http_code}\n' -X POST "$HOST/mcp"
echo "Rollback point: $SNAP_PATH. Now run the host-only checks in the readiness report."
