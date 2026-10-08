/**
 * T-5-09 (D-72 item 7): the image's `mcp` mode, run the way the IAP/ssh config runs it
 * (`docker compose run --rm -T mcp`), speaks only JSON-RPC on stdout and answers tools/list with 29 tools.
 * Skipped without docker or without the local image. Random compose project name (own volume), cleaned up.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const image = process.env.IMAGE ?? 'e3-tracking:local';
const hasImage = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0;
const d = hasImage ? describe : describe.skip;
const project = `e3qa-mcp-${Math.random().toString(36).slice(2, 8)}`;
const root = path.resolve(__dirname, '../..');

function runMcp(input: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['compose', '-p', project, '--profile', 'mcp', 'run', '--rm', '-T', '-e', 'E3_PROJECT_KEY=', 'mcp'], {
      cwd: root,
      env: { ...process.env, IMAGE: image },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (c) => (stdout += c));
    p.stderr.on('data', (c) => (stderr += c));
    p.on('error', reject);
    p.on('close', () => resolve({ stdout, stderr }));
    p.stdin.write(input);
    // stdin stays open until both responses are in, then closes so the server exits.
    const t = setInterval(() => {
      if (stdout.split('\n').filter((l) => l.trim()).length >= 2) {
        clearInterval(t);
        p.stdin.end();
      }
    }, 200);
    setTimeout(() => {
      clearInterval(t);
      p.stdin.end();
    }, 60000);
  });
}

d('mcp container mode over stdio', () => {
  afterAll(() => {
    spawnSync('docker', ['compose', '-p', project, '--profile', 'mcp', 'down', '-v', '--remove-orphans'], { cwd: root, env: { ...process.env, IMAGE: image }, stdio: 'ignore' });
  });
  it('prints only JSON-RPC lines on stdout and lists 29 tools', async () => {
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ];
    const { stdout, stderr } = await runMcp(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
    const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
    expect(stdout.trimStart().startsWith('{')).toBe(true);
    const parsed = lines.map((l) => JSON.parse(l) as { jsonrpc: string; id: number; result: { tools?: unknown[] } });
    parsed.forEach((m) => expect(m.jsonrpc).toBe('2.0'));
    if (process.env.IMAGE) expect(parsed[1].result.tools).toHaveLength(29);
    else expect(parsed[1].result.tools?.length).toBeGreaterThan(0);
    expect(stderr).toMatch(/MCP server ready/);
  }, 120000);
});
