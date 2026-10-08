/** Operator smoke transport: exported Bash wrapper, real stdio and bounded failures, no cloud. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const gitBash = path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe');
const bash = process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash';
const hasBash = spawnSync(bash, ['--version']).status === 0;
const sourceDir = path.resolve(__dirname, '../../deploy/gcp');
const source = readFileSync(path.join(sourceDir, '07-mcp.sh'), 'utf8').replace(/\r\n/g, '\n');
const fixture = mkdtempSync(path.join(os.tmpdir(), 'e3-mcp-smoke-'));
const script = path.join(fixture, '07-mcp.sh');
const config = path.join(fixture, 'config.env');
const server = path.join(fixture, 'fake-sdk.cjs');
writeFileSync(path.join(fixture, 'lib.sh'), readFileSync(path.join(sourceDir, 'lib.sh'), 'utf8').replace(/\r\n/g, '\n'));
writeFileSync(config, readFileSync(path.join(sourceDir, 'config.env.example'), 'utf8').replace(/\r\n/g, '\n'));
writeFileSync(server, `
const readline = require('node:readline');
const mode = process.env.E3_TEST_MODE;
let initialized = false;
let notified = false;
let listed = false;
const reply = message => process.stdout.write(JSON.stringify(message) + '\\n');
if (mode === 'transport-error') {
  console.error('IAP permission denied (fixture)');
  process.exit(23);
}
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', line => {
  const request = JSON.parse(line);
  if (mode === 'hang') { console.error('IAP setup stalled (fixture)'); return; }
  if (request.method === 'initialize') {
    setTimeout(() => {
      if (mode === 'null-response') { console.log('null'); return; }
      if (mode === 'array-response') { console.log('[]'); return; }
      if (mode === 'malformed') { console.log('invalid stdout fixture'); return; }
      if (mode === 'rpc-error') { reply({jsonrpc:'2.0',id:1,error:{code:-1,message:'fixture'}}); return; }
      initialized = true;
      reply({jsonrpc:'2.0',id:1,result:{protocolVersion:'2024-11-05'}});
    }, Number(process.env.E3_TEST_DELAY ?? 0));
  } else if (request.method === 'notifications/initialized') {
    if (!initialized) process.exit(31);
    notified = true;
  } else if (request.method === 'tools/list') {
    if (!initialized || !notified) process.exit(31);
    listed = true;
    reply({jsonrpc:'2.0',id:mode === 'wrong-id' ? 9 : 2,
      result:{tools:Array.from({length:mode === 'wrong-count' ? 28 : 29},(_,i)=>({name:'tool'+i}))}});
  }
});
lines.on('close', () => {
  if (!listed) { console.error('stdin closed before tools/list'); process.exit(32); }
});
`);
afterAll(() => rmSync(fixture, { recursive: true }));

function run(mode = 'normal', delay = 0, timeout = false, dryRun = false) {
  writeFileSync(script, timeout ? source.replace('90_000', '500') : source);
  // Execute an exported gcloud function as the production Windows SDK wrapper does.
  // The fake SDK checks request order and rejects EOF before tools/list completes.
  return new Promise<{ status: number | null; error?: Error; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(bash, ['-c',
    'gcloud() { "$E3_TEST_NODE" "$E3_TEST_SERVER" "$@"; }; export -f gcloud; export CONFIG="$1"; shift; exec bash "$@"',
    'mcp-smoke-test', config, script, ...(dryRun ? ['--dry-run'] : [])], {
    timeout: 30000, windowsHide: true,
    env: { ...process.env, E3_TEST_NODE: process.execPath, E3_TEST_SERVER: server,
      E3_TEST_MODE: mode, E3_TEST_DELAY: String(delay) },
    });
    let stdout = '';
    let stderr = '';
    let error: Error | undefined;
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => { error = err; });
    child.on('close', status => resolve({ status, error, stdout, stderr }));
  });
}

describe.skipIf(!hasBash)('07 MCP response-driven smoke', () => {
  it('uses an exported SDK wrapper and waits for initialize before tools/list', async () => {
    const result = await run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('OK: tools/list returned 29 tools');
  });
  it('keeps stdin open through startup beyond the former 20-second lifetime', async () => {
    const result = await run('normal', 21000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('OK: tools/list returned 29 tools');
  }, 35000);
  it('retains the actual transport exit and actionable stderr', async () => {
    const result = await run('transport-error');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('status 23');
    expect(result.stderr).toContain('IAP permission denied (fixture)');
  });
  it.each([
    ['malformed', 'non-JSON stdout'],
    ['null-response', 'non-object JSON-RPC stdout'],
    ['array-response', 'non-object JSON-RPC stdout'],
    ['wrong-id', 'unexpected response ID'],
    ['wrong-count', '28 tools (expected 29)'],
    ['rpc-error', 'initialize returned an error response'],
  ])('rejects %s without claiming success', async (mode, reason) => {
    const result = await run(mode);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(reason);
    expect(result.stdout).not.toContain('OK:');
  });
  it('bounds stalled setup and retains stderr while stopping its child transport', async () => {
    const result = await run('hang', 0, true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('timed out');
    expect(result.stderr).toContain('IAP setup stalled (fixture)');
  });
  it('prints the plan on dry run without starting the transport', async () => {
    const result = await run('transport-error', 0, false, true);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('gcloud compute ssh');
    expect(result.stdout).not.toContain('OK:');
    expect(result.stderr).not.toContain('IAP permission denied');
  });
});
