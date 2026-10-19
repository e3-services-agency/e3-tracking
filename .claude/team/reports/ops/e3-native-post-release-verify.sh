#!/usr/bin/env bash
set -euo pipefail
PIN=${1:?exact candidate registry digest required}
[[ "$PIN" =~ ^europe-west1-docker\.pkg\.dev/e3-tracking/e3-tracking/e3-tracking@sha256:[a-f0-9]{64}$ ]]
cd /opt/e3-tracking
DC=(sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge)
EXPECTED=$(sudo docker image inspect --format '{{.Id}}' "$PIN")
for service in app backup; do
  cid=$("${DC[@]}" ps -q "$service")
  test -n "$cid"
  actual=$(sudo docker inspect --format '{{.Image}}' "$cid")
  test "$actual" = "$EXPECTED"
  printf '%s candidate image verified: %s\n' "$service" "$actual"
done
# Resolve the actual MCP service image without importing app code or opening live SQLite.
PROOF=e3-native-mcp-image-proof-$(date -u +%Y%m%dT%H%M%SZ)-$$
TOKEN=$(cat /proc/sys/kernel/random/uuid)
cleanup() {
  local owner
  owner=$(sudo docker inspect --format '{{index .Config.Labels "com.e3.native-release-proof"}}' "$PROOF" 2>/dev/null) || return 0
  if [ "$owner" = "$TOKEN" ]; then sudo docker rm "$PROOF" >/dev/null; fi
}
trap cleanup EXIT
"${DC[@]}" --profile mcp run --no-deps --name "$PROOF" --label "com.e3.native-release-proof=$TOKEN" -T --entrypoint node mcp -e 'console.log("MCP service image probe: no database opened")'
test "$(sudo docker inspect --format '{{.Image}}' "$PROOF")" = "$EXPECTED"
printf 'mcp candidate image verified: %s\n' "$EXPECTED"
printf '%s\n' \
 '6453a41e56ebd0d56d15f064c14a5cf9fd72a7ea210a084125d76db2d8c796b2  docker-compose.yml' \
 '467087737bb6cb8e25f91a8298e8b25c0397307347ba9401f4fb7f59c357a441  docker-compose.gcp.yml' \
 '5c95523d00c0e2f6cc80282440f049f89a5cf7a2f6c6aedf55ed5a4e808b107a  deploy/edge/Caddyfile' | sudo sha256sum -c -
curl -fsS https://tracking.e3-services.com/api/health | "${DC[@]}" exec -T app node -e '
let text=""; process.stdin.on("data",c=>text+=c); process.stdin.on("end",()=>{
 const h=JSON.parse(text);
 if(h.ok!==true||h.schema_migration!=="0050_historical_file_validation.sql"||h.db_path_writable!==true||h.last_upload_ok!==true) throw Error("Unexpected health result");
 console.log(JSON.stringify(h));
});'
