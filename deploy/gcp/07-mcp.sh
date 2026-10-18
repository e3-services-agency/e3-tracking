#!/usr/bin/env bash
# Usage: 07-mcp.sh [--dry-run]. T-5-09 (D-72 item 7): prints the .mcp.json block for the values in config.env and
# smoke-tests the MCP server over the IAP SSH tunnel (initialize + tools/list, expects 32 tools). Read-only on GCP.
# Optional: E3_PROJECT_KEY=<key> in the environment sets the default project key in the block.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
plan_header "07 mcp over IAP"
# PuTTY otherwise substitutes "y" for stdin, dropping the MCP JSON-RPC requests on Windows.
export CLOUDSDK_SSH_PUTTY_FORCE_CONNECT=false
REMOTE=/opt/e3-tracking
KEY="${E3_PROJECT_KEY:-}"
REMOTE_CMD="cd $REMOTE && sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml run --rm -T -e E3_PROJECT_KEY=$KEY mcp"
GC=(gcloud compute ssh "$VM_NAME" --tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID" --quiet --command "$REMOTE_CMD" -- -T)

json_str() { printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"; }
say "# Merge this into your .mcp.json (Windows form; on macOS/Linux drop \"cmd\" and \"/c\" and use \"command\": \"gcloud\"):"
say "{"
say "  \"mcpServers\": {"
say "    \"e3-tracking-gcp\": {"
say "      \"command\": \"cmd\","
printf '      "args": ["/c"'
for a in "${GC[@]}"; do printf ', %s' "$(json_str "$a")"; done
say "],"
say "      \"env\": {\"CLOUDSDK_SSH_PUTTY_FORCE_CONNECT\": \"false\"}"
say "    }"
say "  }"
say "}"

say "# Smoke test (initialize handshake, then tools/list; 90s overall deadline):"
show "${GC[@]}"
if [ "$DRY_RUN" = 1 ]; then exit 0; fi

# Launch through this Bash so an exported Windows SDK wrapper remains available.
# Native Windows Node needs the native path to Git Bash, not /usr/bin/bash.
MCP_BASH="$BASH"
if command -v cygpath >/dev/null 2>&1; then MCP_BASH="$(cygpath -w "$BASH")"; fi
node - "$MCP_BASH" "${GC[@]}" <<'MCP_SMOKE_NODE'
const { spawn, spawnSync } = require('node:child_process');
const [bash, ...command] = process.argv.slice(2);
const child = spawn(bash, ['-c', '"$@"', '07-mcp', ...command], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  detached: process.platform !== 'win32',
});
let pending = '';
let stderr = '';
let stage = 'initialize';
let complete = false;
let finished = false;
const timer = setTimeout(() => fail(`timed out after 90s waiting for ${stage}`), 90_000);

function stopTransport() {
  child.stdin.destroy();
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Stop only this smoke test's Bash/SDK/SSH descendants, never unrelated processes.
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true, timeout: 5000,
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already closed */ }
  }
}
function fail(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  process.exitCode = 1;
  console.error(`FAIL: MCP ${message}. Check SSH/IAP access, Docker and .env on the VM.`);
  if (stderr.trim()) console.error(`Transport stderr (last 8 KiB):\n${stderr.trimEnd()}`);
  stopTransport();
}
function send(message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}
child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
child.on('error', err => fail(`transport could not start: ${err.message}`));
child.stdin.on('error', err => fail(`stdin failed while waiting for ${stage}: ${err.message}`));
child.stdout.on('data', chunk => {
  if (finished) return;
  pending += chunk.toString();
  if (pending.length > 1024 * 1024) return fail('response exceeded 1 MiB');
  let end;
  while ((end = pending.indexOf('\n')) >= 0 && !finished) {
    const line = pending.slice(0, end).trim();
    pending = pending.slice(end + 1);
    if (!line) continue;
    let response;
    try { response = JSON.parse(line); } catch { return fail('received non-JSON stdout'); }
    if (!response || typeof response !== 'object' || Array.isArray(response)) return fail('received non-object JSON-RPC stdout');
    if (response.jsonrpc !== '2.0') return fail('received invalid JSON-RPC stdout');
    // Valid server notifications have no response ID; do not confuse them with responses.
    if (!Object.hasOwn(response, 'id')) continue;
    const expected = stage === 'initialize' ? 1 : 2;
    if (complete || response.id !== expected) return fail('received an unexpected response ID');
    if (response.error || !response.result) return fail(`${stage} returned an error response`);
    if (stage === 'initialize') {
      if (typeof response.result.protocolVersion !== 'string') return fail('initialize response missing protocolVersion');
      stage = 'tools/list';
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    } else {
      if (!Array.isArray(response.result.tools)) return fail('tools/list response missing tools');
      const count = response.result.tools.length;
      if (count !== 32) return fail(`tools/list returned ${count} tools (expected 32)`);
      complete = true;
      stage = 'transport shutdown';
      // EOF only after both actual responses; no startup-dependent sleep.
      child.stdin.end();
    }
  }
});
child.on('close', (code, signal) => {
  if (finished) return;
  if (code !== 0) return fail(`transport exited ${code === null ? `on ${signal}` : `with status ${code}`}`);
  if (!complete || pending.trim()) return fail(`transport closed before a valid ${stage} completion`);
  finished = true;
  clearTimeout(timer);
  console.log('OK: tools/list returned 32 tools over the IAP tunnel.');
});
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: '07-mcp', version: '0' },
} });
MCP_SMOKE_NODE
