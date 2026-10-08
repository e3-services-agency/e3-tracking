#!/usr/bin/env node
/**
 * T-5-08 (D-72 item 6): restore rehearsal. Restores a backup.json into a fresh :memory: database
 * through the real restore service, runs the comparison, prints counts per table, open findings,
 * size and duration. Exits 1 on warnings (unless --allow-warnings) or an unreadable backup.
 * Usage: npm run restore:rehearsal -- <backup.json> [--allow-warnings]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const allowWarnings = args.includes('--allow-warnings');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: restore-rehearsal.mjs <backup.json> [--allow-warnings]');
  process.exit(2);
}
let raw;
try {
  raw = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`FAIL: cannot read ${file}: ${err.message}`);
  process.exit(1);
}
process.env.E3_DB_PATH = ':memory:';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-rehearsal-'));
process.env.E3_FILES_PATH = scratch;

const { getDb, closeDb } = await import('../src/backend/db/index.ts');
const ClientDAL = await import('../src/backend/dal/client.dal.ts');
const FindingDAL = await import('../src/backend/dal/finding.dal.ts');
const { previewRestore, applyRestore } = await import('../src/backend/services/backupRestore.service.ts');

getDb();
let code = 0;
try {
  const started = performance.now();
  const preview = previewRestore(raw);
  const client = ClientDAL.createClient({ key: 'rehearsal', name: 'Rehearsal' });
  const result = await applyRestore(raw, preview.payload_hash, { name: preview.project.name, key: preview.project.key, client_id: client.id });
  const ms = performance.now() - started;
  const warnings = [...new Set([...preview.warnings, ...result.warnings])];
  const open = FindingDAL.listFindings(result.project.id, { status: 'open' });
  const byKind = {};
  for (const f of open) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  console.log(`Backup: ${file} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
  console.log(`Project: ${result.project.key} (${result.project.name})`);
  console.log(`Restore + comparison: ${ms.toFixed(0)} ms, warnings: ${warnings.length}`);
  console.log('Counts per table:');
  for (const [t, n] of Object.entries(result.counts).sort()) console.log(`  ${t.padEnd(28)} ${n}`);
  console.log(`Open findings: ${open.length}`);
  for (const [k, n] of Object.entries(byKind).sort()) console.log(`  ${k.padEnd(28)} ${n}`);
  for (const w of warnings) console.error(`WARNING: ${w}`);
  if (warnings.length > 0 && !allowWarnings) {
    console.error('FAIL: warnings present (use --allow-warnings to accept).');
    code = 1;
  } else console.log('OK');
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  code = 1;
} finally {
  closeDb();
  fs.rmSync(scratch, { recursive: true, force: true });
}
process.exit(code);
