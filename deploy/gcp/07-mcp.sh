#!/usr/bin/env bash
# Usage: 07-mcp.sh [--dry-run]. T-5-09 (D-72 item 7): prints the .mcp.json block for the values in config.env and
# smoke-tests the MCP server over the IAP SSH tunnel (initialize + tools/list, expects 29 tools). Read-only on GCP.
# Optional: E3_PROJECT_KEY=<key> in the environment sets the default project key in the block.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
plan_header "07 mcp over IAP"
REMOTE=/opt/e3-tracking
KEY="${E3_PROJECT_KEY:-}"
REMOTE_CMD="cd $REMOTE && sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml run --rm -T -e E3_PROJECT_KEY=$KEY mcp"
GC=(gcloud compute ssh "$VM_NAME" --tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID" --quiet --command "$REMOTE_CMD" -- -T)

json_str() { local s="${1//\/\\}"; printf '"%s"' "${s//\"/\\\"}"; }
say "# Merge this into your .mcp.json (Windows form; on macOS/Linux drop \"cmd\" and \"/c\" and use \"command\": \"gcloud\"):"
say "{"
say "  \"mcpServers\": {"
say "    \"e3-tracking-gcp\": {"
say "      \"command\": \"cmd\","
printf '      "args": ["/c"'
for a in "${GC[@]}"; do printf ', %s' "$(json_str "$a")"; done
say "]"
say "    }"
say "  }"
say "}"

REQ='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"07-mcp","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
say "# Smoke test (stdin: initialize, initialized, tools/list; stdout must be JSON-RPC lines only):"
show "${GC[@]}"
if [ "$DRY_RUN" = 1 ]; then exit 0; fi

# Keep stdin open until both responses are in (a closed stdin makes the server exit before answering).
OUT="$( { printf '%s\n' "$REQ"; sleep 20; } | timeout 90 "${GC[@]}" 2>/dev/null | head -n 2 || true)"
LAST="$(printf '%s\n' "$OUT" | tail -n 1)"
if ! COUNT="$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);process.stdout.write(String(r.result.tools.length))})' 2>/dev/null)"; then
  say "FAIL: no valid tools/list response. Run the command above by hand and read stderr (ssh, IAP permission, docker, .env)."
  exit 1
fi
if [ "$COUNT" = 29 ]; then say "OK: tools/list returned 29 tools over the IAP tunnel."; else say "WARN: tools/list returned $COUNT tools (expected 29); the deployed image may be older."; exit 1; fi
