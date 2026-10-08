/**
 * T-5-07 (D-72): every deploy/gcp script runs with --dry-run under bash, prints gcloud commands that carry
 * the config values, and never contains a destructive verb. Skipped when bash is not available.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = path.resolve(__dirname, '../../deploy/gcp');
const bash = spawnSync('bash', ['-c', 'echo ok']);
const hasBash = bash.status === 0 && String(bash.stdout).includes('ok');

function parseConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path.join(dir, 'config.env.example'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/\$\{(\w+)\}/g, (_, k: string) => out[k] ?? '');
  }
  return out;
}

function dry(script: string, args: string[] = []): string {
  const r = spawnSync('bash', [path.join(dir, script), ...args, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, CONFIG: path.join(dir, 'config.env.example') },
  });
  expect(r.status, `${script}: ${r.stderr}`).toBe(0);
  return r.stdout;
}

describe('config.env.example', () => {
  const c = parseConfig();
  it('carries the D-72 defaults', () => {
    expect(c.PROJECT_ID).toBe('e3-tracking');
    expect(c.REGION).toBe('europe-west1');
    expect(c.ZONE).toBe('europe-west1-b');
    expect(c.HOSTNAME).toBe('tracking.e3-services.com');
    expect(c.WORKSPACE_DOMAIN).toBe('e3-services.com');
    
    expect(c.DATA_DISK_GB).toBe('20');
    expect(c.MACHINE_TYPE).toBe("e2-micro");
    expect(c.BUCKET).toBe('e3-tracking-backups-e3-tracking');
  });
});

describe.skipIf(!hasBash)('deploy/gcp --dry-run', () => {
  const c = parseConfig();
  const cases: Array<[string, string[], string[]]> = [
    ['00-preflight.sh', [], ['gcloud services enable', 'compute.googleapis.com', 'iap.googleapis.com', c.PROJECT_ID]],
    ['01-infra.sh', [], ['35.235.240.0/20', 'tcp:80,tcp:443', 'e2-micro', 'debian-12', '20GB', 'roles/storage.objectCreator', c.BUCKET, c.ZONE]],
    ['02-build-push.sh', [], ['configure-docker europe-west1-docker.pkg.dev', 'docker build', 'docker push']],
    ['03-deploy.sh', ['v1'], ['--tunnel-through-iap', '--env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge pull', 'E3_AUTH_MODE=proxy', 'OAUTH2_COOKIE_SECRET', c.HOSTNAME, 'e3-tracking:v1']],
    ['04-backup.sh', [], ['BACKUP_BUCKET=' + c.BUCKET]],
    ['05-cutover.sh', ['demo'], ['/api/projects/demo/export/backup.json', 'Clients page > Restore backup']],
    ['05-cutover.sh', ['demo', '--via-tunnel'], ['restore-backup/preview', 'restore-backup/apply', 'exec -T app node -e']],
    ['06-monitoring.sh', [], ['monitoring uptime create', '/api/health', c.HOSTNAME, c.ALERT_EMAIL]],
  ];
  for (const [script, args, needles] of cases) {
    it(`${script} prints the expected commands and nothing destructive`, () => {
      const out = dry(script, args);
      for (const n of needles) expect(out).toContain(n);
      const cmds = out.split('\n').filter((l) => l.startsWith('+ '));
      expect(cmds.length).toBeGreaterThan(0);
      for (const l of cmds) {
        expect(l).not.toMatch(/(?<![-\w])(delete|destroy)(?![-\w])/);
      }
    });
  }

  it('03-deploy.sh uploads to ~/e3-deploy with the repo layout and aborts on REPLACE_ME before up', () => {
    const out = dry('03-deploy.sh', ['v1']);
    expect(out).toContain('~/e3-deploy/deploy/');
    expect(out).toContain('deploy/edge e3-tracking:~/e3-deploy/deploy/');
    expect(out).toContain('sudo install -d -m 755 /opt/e3-tracking/deploy');
    expect(out).toContain('sudo install -m 600');
    const cmd = out.split('\n').find((l) => l.includes('install -d -m 755')) ?? '';
    expect(cmd.indexOf('REPLACE_ME')).toBeGreaterThan(-1);
    expect(cmd.indexOf('exit 3')).toBeLessThan(cmd.indexOf('up -d'));
  });

  it('the compose override passes HOSTNAME to caddy and BACKUP_BUCKET to backup', () => {
    const y = readFileSync(path.join(dir, 'docker-compose.gcp.yml'), 'utf8');
    expect(y).toContain('HOSTNAME: ${HOSTNAME}');
    expect(y).toContain('BACKUP_BUCKET: ${BACKUP_BUCKET:-}');
    expect(y.indexOf('caddy:')).toBeLessThan(y.indexOf('HOSTNAME:'));
  });

  it('03-deploy.sh requires a tag', () => {
    const r = spawnSync('bash', [path.join(dir, '03-deploy.sh'), '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, CONFIG: path.join(dir, 'config.env.example') },
    });
    expect(r.status).toBe(2);
  });
});

describe.skipIf(!hasBash)('07-mcp.sh json_str', () => {
  it('escapes backslashes and quotes', () => {
    const fn = readFileSync(path.join(dir, '07-mcp.sh'), 'utf8').split('\n').find((l) => l.startsWith('json_str()'))!;
    const r = spawnSync('bash', ['-c', `${fn}\njson_str 'a\b"c'`], { encoding: 'utf8' });
    expect(r.stdout).toBe('"a\\b\\"c"');
  });
});
