#!/usr/bin/env bash
# T-5-36b hotfix release: image 7a9e3d6 (consent same-origin fix). Schema stays 0043, no migration.
# Run from PowerShell inside the repo folder:
#   & "C:\Program Files\Git\bin\bash.exe" .claude/team/reports/ops/release-T-5-36b-consent-hotfix.sh
# Steps: 1 verified snapshot (expects schema 0043; stops app/backup/mcp)  2 deploy  3 smoke.
# Rollback: sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0043.sh rollback /var/backups/e3-tracking/post-mcp-0043-TIMESTAMP
set -euo pipefail
cd "$(dirname "$0")/../../../.."
. .claude/team/reports/ops/gcloud-wrapper.sh
TAG=7a9e3d6
EXPECTED_DIGEST=sha256:77ea95820c08949182edb00c7ba4e0fc4efc06d4dde8ac06b4a5e8aff6fccc88
SSH=(gcloud compute ssh e3-tracking --tunnel-through-iap --zone europe-west1-b --project e3-tracking)
DC='sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge'

echo "== 1/3 verified snapshot of the 0043 state (writers stop now)"
"${SSH[@]}" --command='sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0043.sh snapshot' -- -T

echo "== 2/3 deploy $TAG"
bash deploy/gcp/03-deploy.sh "$TAG" --yes

echo "== 3/3 smoke"
"${SSH[@]}" --command="cd /opt/e3-tracking && sudo docker image inspect --format '{{index .RepoDigests 0}}' \$(sudo docker inspect --format '{{.Image}}' \$($DC ps -q app))" -- -T
curl -fsS https://tracking.e3-services.com/api/health; echo
echo "expect 200:";  curl -s -o /dev/null -w '%{http_code}\n' https://tracking.e3-services.com/.well-known/oauth-authorization-server
echo "expect 401:";  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://tracking.e3-services.com/mcp
echo "Expected app digest: $EXPECTED_DIGEST ; schema_migration stays 0043_mcp_oauth.sql"
echo "Then retry the connector in Claude: remove the E3 Tracking connector and add it again."
