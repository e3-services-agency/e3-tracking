/** T-5-06: pattern test of deploy/edge/Caddyfile against caddy:2 with a mock auth server and echo upstream. Skipped without docker. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hasDocker = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;
const d = hasDocker ? describe : describe.skip;
const net = 'e3qa-caddytest';
const names = ['e3qa-ct-caddy', 'e3qa-ct-auth', 'e3qa-ct-app', 'e3qa-ct-oauth'];
const port = 3041;
const dock = (...a: string[]) => execFileSync('docker', a, { encoding: 'utf8' });
const tryDock = (...a: string[]) => spawnSync('docker', a, { stdio: 'ignore' });

d('Caddyfile identity forwarding', () => {
  let dir: string;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caddytest-'));
    const caddyfile = fs.readFileSync(path.resolve('deploy/edge/Caddyfile'), 'utf8').replaceAll('{$HOSTNAME}', ':80');
    fs.writeFileSync(path.join(dir, 'Caddyfile'), caddyfile);
    // Mock oauth2-proxy: /oauth2/auth answers 202 + identity headers. Echo app: returns request headers as JSON.
    fs.writeFileSync(path.join(dir, 'auth.js'), `require('http').createServer((q,r)=>{r.writeHead(202,{'X-Auth-Request-Email':'real@example.com','X-Auth-Request-User':'real'});r.end()}).listen(4180)`);
    fs.writeFileSync(path.join(dir, 'app.js'), `require('http').createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({url:q.url,h:q.headers}))}).listen(3001)`);
    names.forEach((n) => tryDock('rm', '-f', n));
    tryDock('network', 'rm', net);
    dock('network', 'create', net);
    const node = (name: string, alias: string, file: string) =>
      dock('run', '-d', '--name', name, '--network', net, '--network-alias', alias, '-v', `${dir}:/w:ro`, 'node:22-alpine', 'node', `/w/${file}`);
    node('e3qa-ct-auth', 'oauth2-proxy', 'auth.js');
    node('e3qa-ct-app', 'app', 'app.js');
    dock('run', '-d', '--name', 'e3qa-ct-caddy', '--network', net, '-p', `127.0.0.1:${port}:80`, '-v', `${dir}/Caddyfile:/etc/caddy/Caddyfile:ro`, 'caddy:2');
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

  it('passes the oauth2-proxy identity and overwrites a forged header', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/tracking-plan/api/clients`, { headers: { 'X-Forwarded-Email': 'forged@evil.com' } });
    const body = await res.json();
    expect(body.h['x-forwarded-email']).toBe('real@example.com');
  });

  it('public paths bypass auth and never carry a forged identity', async () => {
    for (const p of ['/api/health', '/api/shared/x']) {
      const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-Forwarded-Email': 'forged@evil.com' } });
      const body = await res.json();
      expect(body.h['x-forwarded-email']).toBeUndefined();
    }
  });
}, 150000);
