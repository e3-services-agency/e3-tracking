#!/usr/bin/env bash
# T-5-36 release of the HTTPS MCP connector: image c9fa917, schema 0040 -> 0043.
# Run from Git Bash in the repo root:
#   bash .claude/team/reports/ops/release-T-5-36-mcp-0043.sh
# Steps: 1 verified snapshot (stops app/backup/mcp, edge stays up)  2 connector flag  3 deploy  4 smoke.
# Rollback on a failed release (exact snapshot path printed by step 1):
#   gcloud compute ssh ... --command='sudo bash ~/e3-upgrade/e3-maintenance-pre-mcp-schema0040.sh rollback /var/backups/e3-tracking/pre-mcp-0040-TIMESTAMP' -- -T
set -euo pipefail
cd "$(dirname "$0")/../../../.."
. .claude/team/reports/ops/gcloud-wrapper.sh
TAG=c9fa917
EXPECTED_DIGEST=sha256:76b8f379891d426ca7ee7ce8fa46cf74c3c8bb9750dd23cc454204250ebe70b0
SSH=(gcloud compute ssh e3-tracking --tunnel-through-iap --zone europe-west1-b --project e3-tracking)
DC='sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge'

echo "== 1/4 verified pre-upgrade snapshot (writers stop now)"
"${SSH[@]}" --command='sudo bash ~/e3-upgrade/e3-maintenance-pre-mcp-schema0040.sh snapshot' -- -T

echo "== 2/4 enable the connector flag (only this key changes)"
"${SSH[@]}" --command='cd /opt/e3-tracking && sudo sed -i "/^E3_MCP_HTTP_ENABLED=/d" .env && echo E3_MCP_HTTP_ENABLED=1 | sudo tee -a .env >/dev/null && sudo chmod 600 .env && echo flag-set' -- -T

echo "== 3/4 deploy $TAG (pull, migrations 0041-0043 on start, up -d)"
bash deploy/gcp/03-deploy.sh "$TAG" --yes

echo "== 4/4 recreate the edge with the new Caddyfile, then smoke"
"${SSH[@]}" --command="cd /opt/e3-tracking && $DC up -d --force-recreate caddy && sudo docker inspect --format '{{index .RepoDigests 0}}' \$($DC ps -q app)" -- -T
curl -fsS https://tracking.e3-services.com/api/health; echo
echo "expect 200:";  curl -s -o /dev/null -w '%{http_code}\n' https://tracking.e3-services.com/.well-known/oauth-authorization-server
echo "expect 401 + WWW-Authenticate:"; curl -s -o /dev/null -D - -X POST https://tracking.e3-services.com/mcp | grep -i '^HTTP\|^www-authenticate'
echo "expect 404:";  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://tracking.e3-services.com/MCP/oauth/register
echo "expect 302 (staff page still behind sign-in):"; curl -s -o /dev/null -w '%{http_code}\n' https://tracking.e3-services.com/mcp/connections
echo "Expected app digest: $EXPECTED_DIGEST ; expected schema_migration: 0043_mcp_oauth.sql"
