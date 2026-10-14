#!/usr/bin/env bash
# T-5-39 release: image 2a0b1e3 (all scopes advertised in the bearer challenge; consent write/templates opt-in).
# Schema stays 0043, no migration.
# Run from PowerShell inside the repo folder:
#   & "C:\Program Files\Git\bin\bash.exe" .claude/team/reports/ops/release-T-5-39-scopes.sh
# Rollback: sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0043.sh rollback /var/backups/e3-tracking/post-mcp-0043-TIMESTAMP
set -euo pipefail
cd "$(dirname "$0")/../../../.."
. .claude/team/reports/ops/gcloud-wrapper.sh
TAG=2a0b1e3
EXPECTED_DIGEST=sha256:846b6ff63e73a9eb4e21c540bdff1812374b10744efd7bae88da073332954708
SSH=(gcloud compute ssh e3-tracking --tunnel-through-iap --zone europe-west1-b --project e3-tracking)
DC='sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge'

echo "== 1/3 verified snapshot of the 0043 state (writers stop now)"
"${SSH[@]}" --command='sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0043.sh snapshot' -- -T

echo "== 2/3 deploy $TAG"
bash deploy/gcp/03-deploy.sh "$TAG" --yes

echo "== 3/3 smoke"
"${SSH[@]}" --command="cd /opt/e3-tracking && sudo docker image inspect --format '{{index .RepoDigests 0}}' \$(sudo docker inspect --format '{{.Image}}' \$($DC ps -q app))" -- -T
curl -fsS https://tracking.e3-services.com/api/health; echo
echo "expect 401 with scope=\"projects:read projects:write templates:read\":"
curl -s -o /dev/null -D - -X POST https://tracking.e3-services.com/mcp | grep -i '^HTTP\|^www-authenticate'
echo "Expected app digest: $EXPECTED_DIGEST ; schema_migration stays 0043_mcp_oauth.sql"
echo "Then in Claude: remove the E3 Tracking connector, add it again, tick 'Allow changes...' on the consent page."
