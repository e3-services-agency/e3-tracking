/**
 * T-5-06: pattern test of deploy/edge/Caddyfile against caddy:2 with a mock auth server and echo upstream.
 * Skipped without docker. Collision-free (T-5-06b): random host port, random-suffixed container and network
 * names; a port/name conflict that survives one retry skips the suite, any other failure (and any failed
 * assertion once the containers are up) fails it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';

const hasDocker = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;
const d = hasDocker ? describe : describe.skip;
const token = Math.random().toString(36).slice(2, 8);
const net = `e3qa-caddytest-${token}`;
const names = ['caddy', 'auth', 'app'].map((n) => `e3qa-ct-${n}-${token}`);
let port = 0;
let conflict = false;
const dock = (...a: string[]) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const tryDock = (...a: string[]) => spawnSync('docker', a, { stdio: 'ignore' });
// OS-assigned ephemeral ports (49152+) are unusable as docker-published ports on Windows, so probe random
// candidates below that range and keep the first one that binds.
async function freePort(): Promise<number> {
  for (let i = 0; i < 50; i++) {
    const candidate = 20000 + Math.floor(Math.random() * 20000);
    const ok = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once('error', () => resolve(false));
      srv.listen(candidate, '127.0.0.1', () => srv.close(() => resolve(true)));
    });
    if (ok) return candidate;
  }
  throw new Error('no free port found');
}
const isConflict = (e: unknown) =>
  /port is already allocated|address already in use|is already in use|Conflict|ports are not available/i.test(
    String((e as { stderr?: string }).stderr ?? e)
  );

d('Caddyfile identity forwarding', () => {
  let dir: string;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caddytest-'));
    const caddyfile = fs.readFileSync(path.resolve('deploy/edge/Caddyfile'), 'utf8').replaceAll('{$HOSTNAME}', ':80');
    fs.writeFileSync(path.join(dir, 'Caddyfile'), caddyfile);
    // Mock oauth2-proxy: /oauth2/auth answers 202 + identity headers. Echo app: returns request headers as JSON.
    fs.writeFileSync(path.join(dir, 'auth.js'), `require('http').createServer((q,r)=>{r.writeHead(202,{'X-Auth-Request-Email':'real@example.com','X-Auth-Request-User':'real'});r.end()}).listen(4180)`);
    fs.writeFileSync(path.join(dir, 'app.js'), `require('http').createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({url:q.url,h:q.headers}))}).listen(3001)`);
    const start = async () => {
      names.forEach((n) => tryDock('rm', '-f', n));
      tryDock('network', 'rm', net);
      port = await freePort();
      dock('network', 'create', net);
      const node = (name: string, alias: string, file: string) =>
        dock('run', '-d', '--name', name, '--network', net, '--network-alias', alias, '-v', `${dir}:/w:ro`, 'node:22-alpine', 'node', `/w/${file}`);
      node(names[1], 'oauth2-proxy', 'auth.js');
      node(names[2], 'app', 'app.js');
      dock('run', '-d', '--name', names[0], '--network', net, '-p', `127.0.0.1:${port}:80`, '-v', `${dir}/Caddyfile:/etc/caddy/Caddyfile:ro`, 'caddy:2');
    };
    try {
      await start();
    } catch (e) {
      if (!isConflict(e)) throw e;
      try {
        await start();
      } catch (e2) {
        if (!isConflict(e2)) throw e2;
        conflict = true; // conflict persisted after one retry: skip, do not fail
        return;
      }
    }
    for (let i = 0; i < 30; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, 120000);
  afterAll(() => {
    names.forEach((n) => tryDock('rm', '-f', n));
    tryDock('network', 'rm', net);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes the oauth2-proxy identity and overwrites a forged header', async (ctx) => {
    if (conflict) ctx.skip();
    const res = await fetch(`http://127.0.0.1:${port}/tracking-plan/api/clients`, { headers: { 'X-Forwarded-Email': 'forged@evil.com' } });
    const body = await res.json();
    expect(body.h['x-forwarded-email']).toBe('real@example.com');
  });

  it('public paths bypass auth and never carry a forged identity', async (ctx) => {
    if (conflict) ctx.skip();
    for (const p of ['/api/health', '/api/shared/x']) {
      const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-Forwarded-Email': 'forged@evil.com' } });
      const body = await res.json();
      expect(body.h['x-forwarded-email']).toBeUndefined();
    }
  });
}, 150000);
