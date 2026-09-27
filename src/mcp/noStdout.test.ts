/**
 * T-2-10 acceptance: "a test asserts nothing in `src/mcp` or `src/backend/db` writes to
 * `process.stdout`." Two checks: a static grep for `console.log`/`process.stdout.write` in either
 * tree (the intended guard, since stdio reserves stdout for the JSON-RPC wire protocol, D-19), plus
 * a runtime spy on `process.stdout.write` exercised while running a representative MCP tool call
 * (including a `getDb()`/migration run against a fresh `:memory:` database) end to end.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb } from '../backend/db';
import * as ClientDAL from '../backend/dal/client.dal';
import * as ProjectDAL from '../backend/dal/project.dal';
import { listProjects } from './tools/projects';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('no stdout writes', () => {
  it('src/mcp and src/backend/db never call console.log/console.info/console.warn or process.stdout.write outside comments', () => {
    const trees = [path.resolve(__dirname, '.'), path.resolve(__dirname, '../backend/db')];
    const offenders: string[] = [];
    for (const tree of trees) {
      for (const file of collectSourceFiles(tree)) {
        const lines = readFileSync(file, 'utf-8').split('\n');
        lines.forEach((line, idx) => {
          const codeOnly = line.split('//')[0];
          if (/console\.(log|info|warn)\s*\(/.test(codeOnly) || /process\.stdout\.write\s*\(/.test(codeOnly)) {
            offenders.push(`${file}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('writes nothing to process.stdout while opening a fresh :memory: database and answering list_projects', async () => {
    process.env.E3_DB_PATH = ':memory:';
    closeDb();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
      ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
      await listProjects();
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
      closeDb();
      delete process.env.E3_DB_PATH;
    }
  });
});
