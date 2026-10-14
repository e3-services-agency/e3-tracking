#!/usr/bin/env bash
# T-5-38 release: image c5864b1 ("All projects, including future ones" consent option). Migration 0043 -> 0044.
# Run from PowerShell inside the repo folder:
#   & "C:\Program Files\Git\bin\bash.exe" .claude/team/reports/ops/release-T-5-38-all-projects.sh
# Rollback (failed release only): sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0043.sh rollback /var/backups/e3-tracking/post-mcp-0043-TIMESTAMP
set -euo pipefail
cd "$(dirname "$0")/../../../.."
. .claude/team/reports/ops/gcloud-wrapper.sh
TAG=c5864b1
EXPECTED_DIGEST=sha256:597bc0f2bee0a31434ad98cafb55e2c12319a1a9c686b8d71d7d7bc431f200c4
SSH=(gcloud compute ssh e3-tracking --tunnel-through-iap --zone europe-west1-b --project e3-tracking)
DC='sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge'

echo "== 1/3 verified pre-upgrade snapshot of the 0043 state (writers stop now)"
"${SSH[@]}" --command='sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0043.sh snapshot' -- -T

echo "== 2/3 deploy $TAG (migration 0044 runs on start)"
bash deploy/gcp/03-deploy.sh "$TAG" --yes

echo "== 3/3 smoke"
"${SSH[@]}" --command="cd /opt/e3-tracking && sudo docker image inspect --format '{{index .RepoDigests 0}}' \$(sudo docker inspect --format '{{.Image}}' \$($DC ps -q app))" -- -T
curl -fsS https://tracking.e3-services.com/api/health; echo
echo "expect 401:"; curl -s -o /dev/null -w '%{http_code}\n' -X POST https://tracking.e3-services.com/mcp
echo "Expected app digest: $EXPECTED_DIGEST ; expected schema_migration: 0044_mcp_grant_all_projects.sql"
echo "Existing connections keep working; the new checkbox appears on the next consent page."
