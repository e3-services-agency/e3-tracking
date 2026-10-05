#!/usr/bin/env node
/**
 * T-4-11 part A: restores the bundled sandbox backup into a fresh :memory: database through the
 * real `createSandboxProject`, and prints size, restore time, warnings and entity counts.
 * Exits non-zero on any warning or when the restore takes 1 s or longer.
 * Run with `npx tsx scripts/verify-sandbox-backup.mjs` (add `--findings` to list every finding).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = path.join(ROOT, '.claude/team/samples/sandbox-project-backup.json');
process.env.E3_DB_PATH = ':memory:';
process.env.E3_FILES_PATH = path.join(ROOT, 'data', 'sandbox-verify-scratch-files');

const { getDb, closeDb } = await import('../src/backend/db/index.ts');
const { createSandboxProject } = await import('../src/backend/services/sandbox.service.ts');
const FindingDAL = await import('../src/backend/dal/finding.dal.ts');

getDb(); // migrations are not part of the timed restore
const started = performance.now();
const { project, warnings } = await createSandboxProject({});
const ms = performance.now() - started;

const db = getDb();
const count = (sql) => db.prepare(sql).get(project.id).n;
const counts = {
  events: count('SELECT COUNT(*) n FROM events WHERE project_id = ? AND deleted_at IS NULL'),
  properties: count('SELECT COUNT(*) n FROM properties WHERE project_id = ? AND deleted_at IS NULL'),
  property_definitions: count('SELECT COUNT(*) n FROM property_definitions WHERE project_id = ? AND deleted_at IS NULL'),
  variants: count('SELECT COUNT(*) n FROM variants WHERE project_id = ?'),
  use_cases: count('SELECT COUNT(*) n FROM use_cases WHERE project_id = ? AND deleted_at IS NULL'),
  requirements: count('SELECT COUNT(*) n FROM requirements WHERE use_case_id IN (SELECT id FROM use_cases WHERE project_id = ?)'),
  consent_categories: count('SELECT COUNT(*) n FROM consent_categories WHERE project_id = ?'),
  identity_rules: count('SELECT COUNT(*) n FROM identity_rules WHERE project_id = ?'),
  standard_event_mappings: count('SELECT COUNT(*) n FROM standard_event_mappings WHERE project_id = ?'),
  rules: count('SELECT COUNT(*) n FROM rules WHERE project_id = ?'),
  catalogs: count('SELECT COUNT(*) n FROM catalogs WHERE project_id = ? AND deleted_at IS NULL'),
  bundles: count('SELECT COUNT(*) n FROM property_bundles WHERE project_id = ? AND deleted_at IS NULL'),
  qa_runs: count('SELECT COUNT(*) n FROM qa_runs WHERE project_id = ?'),
  observations: count('SELECT COUNT(*) n FROM observations WHERE project_id = ?'),
  comments: count('SELECT COUNT(*) n FROM comments WHERE project_id = ?'),
  comments_internal_only: count('SELECT COUNT(*) n FROM comments WHERE project_id = ? AND internal_only = 1'),
  comments_via_share: count('SELECT COUNT(*) n FROM comments WHERE project_id = ? AND via_share = 1'),
  change_log_rows: count('SELECT COUNT(*) n FROM change_log WHERE project_id = ?'),
  findings_open: FindingDAL.listFindings(project.id, { status: 'open' }).length,
  findings_acknowledged: FindingDAL.listAcknowledgedFindings(project.id).length,
  files: fs.existsSync(process.env.E3_FILES_PATH) ? fs.readdirSync(process.env.E3_FILES_PATH, { recursive: true }).filter((f) => /\.\w+$/.test(String(f))).length : 0,
};
const byKind = {};
for (const f of FindingDAL.listFindings(project.id, { status: 'open' })) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;

console.log(`Backup size: ${(fs.statSync(BACKUP).size / 1024).toFixed(1)} KB`);
console.log(`Restore time: ${ms.toFixed(0)} ms, warnings: ${warnings.length}`);
console.log('Counts:', JSON.stringify(counts, null, 2));
console.log('Open findings by kind:');
for (const [kind, n] of Object.entries(byKind).sort()) console.log(`  ${kind.padEnd(24)} ${n}`);
if (process.argv.includes('--findings')) {
  for (const f of FindingDAL.listFindings(project.id, {})) console.log(`  [${f.status}] ${f.comparison} ${f.kind} ${f.severity}: ${f.message}`);
}
closeDb();
fs.rmSync(process.env.E3_FILES_PATH, { recursive: true, force: true });
if (warnings.length > 0 || ms >= 1000) {
  console.error('FAIL:', warnings.join(' | '));
  process.exitCode = 1;
}
