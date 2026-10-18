/** Native import of configuration snapshots and aggregate scans, never fabricated event observations. */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { getDb } from '../db';
import * as Runs from '../dal/qa-run.dal';
import { getProjectOrThrow } from '../dal/project.dal';
import { BadRequestError, PayloadChangedError, ValidationError } from '../errors';
import { parseDataManagerEvents } from '../../domain/import/dataManagerEvents';
import { parseDataManagerCustomers } from '../../domain/import/dataManagerCustomers';

type Obj = Record<string, any>;
export interface EvidenceCheck { id: string; severity: 'warning' | 'info'; subject: string; message: string; action: string; source: string }
export interface EvidenceSummary { format: 'e3-captured-evidence-v1'; kind: 'project_snapshot' | 'event_values' | 'customer_values'; source_sha256: string; source_project_id: string; filename: string; facts: Obj; assets: Obj[]; rows: Obj[]; checks: EvidenceCheck[] }
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TECH = /^[A-Za-z0-9_. -]{1,180}$/;
const SAFE = new Set(['purchase.purchase_status','purchase.payment_status','purchase.payment_method','payment.payment_status','payment.payment_method','shipping.purchase_shipping_status','cart_update.action']);
const MAX_FILE = 40 * 1024 * 1024, MAX_ENTRY = 25 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024;
const obj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const sha = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');
function fail(message: string): never { throw new BadRequestError(message, 'file'); }
function canonical(v: any): string { if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if (obj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`; return JSON.stringify(v); }
function json(raw: Buffer | string): any { try { return JSON.parse(raw.toString().replace(/^\uFEFF/, '')); } catch { return fail('Invalid JSON.'); } }
function text(v: unknown, max = 300): string { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : ''; }
function number(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null; }
function sourceUrl(v: unknown): string | null { try { const u = new URL(String(v)); if (u.protocol !== 'https:' || !/\.bloomreach\.(com|co)$/.test(u.hostname)) return null; return u.origin + u.pathname; } catch { return null; } }
function check(id: string, subject: string, message: string, action: string, source: string, severity: 'warning' | 'info' = 'warning'): EvidenceCheck { return { id, subject, message, action, source, severity }; }

/** Inspect central-directory names before JSZip can collapse duplicate entries. ZIP64/encryption are unsupported. */
function archiveNames(buffer: Buffer): string[] {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { eocd = i; break; }
  if (eocd < 0) fail('Invalid ZIP directory.');
  const count = buffer.readUInt16LE(eocd + 10), offset = buffer.readUInt32LE(eocd + 16);
  if (count > 2000 || count === 65535 || buffer.readUInt16LE(eocd + 4) || buffer.readUInt16LE(eocd + 6)) fail('Unsupported ZIP layout or too many members.');
  let pos = offset; const names: string[] = []; let total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || buffer.readUInt32LE(pos) !== 0x02014b50) fail('Invalid ZIP member.');
    const flags = buffer.readUInt16LE(pos + 8), method = buffer.readUInt16LE(pos + 10), size = buffer.readUInt32LE(pos + 24);
    const length = buffer.readUInt16LE(pos + 28), extra = buffer.readUInt16LE(pos + 30), comment = buffer.readUInt16LE(pos + 32);
    const mode = buffer.readUInt32LE(pos + 38) >>> 16;
    if (pos + 46 + length + extra + comment > eocd || (flags & 1) || ![0,8].includes(method) || (mode & 0xf000) === 0xa000) fail('Unsupported ZIP member.');
    const name = buffer.subarray(pos + 46, pos + 46 + length).toString('utf8');
    if (!name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(p => p === '..' || p === '.') || names.includes(name) || name.includes('\0')) fail('Unsafe or duplicate ZIP member.');
    names.push(name); total += size;
    if (size > MAX_ENTRY || total > MAX_TOTAL) fail('ZIP exceeds extraction limits.');
    pos += 46 + length + extra + comment;
  }
  if (pos !== eocd) fail('Unexpected ZIP directory structure.');
  return names;
}
async function readEntry(entry: JSZip.JSZipObject, budget: { bytes: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = []; const stream = entry.nodeStream() as import('node:stream').Readable;
    stream.on('data', (chunk: Buffer) => { size += chunk.length; budget.bytes += chunk.length; if (size > MAX_ENTRY || budget.bytes > MAX_TOTAL) { stream.destroy(); reject(new BadRequestError('Inflated ZIP exceeds limits.', 'file')); } else chunks.push(chunk); });
    stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
function conditions(event: any): Obj[] {
  if (!obj(event) || !Array.isArray(event.filter)) return [];
  return event.filter.slice(0, 50).flatMap((f: any) => {
    const property = f?.attribute?.property, operator = f?.constraint?.operator;
    if (typeof property !== 'string' || !TECH.test(property)) return [];
    const values = SAFE.has(`${event.type}.${property}`) ? (f?.constraint?.operands ?? []).map((o: any) => o.value).filter((v: any) => typeof v === 'string' && /^[A-Za-z0-9_ .()-]{1,100}$/.test(v)).slice(0,100) : [];
    return [{ property, operator: text(operator,50), values, values_withheld: !SAFE.has(`${event.type}.${property}`) }];
  });
}
async function snapshot(buffer: Buffer, sourceProject: string, filename: string): Promise<EvidenceSummary> {
  const names = archiveNames(buffer), manifests = names.filter(n => n.endsWith('/snapshot.json') || n === 'snapshot.json');
  if (manifests.length !== 1) fail('Expected exactly one project snapshot.json. This importer is distinct from the QA sampler ZIP.');
  const zip = await JSZip.loadAsync(buffer), budget = { bytes: 0 };
  const m = json(await readEntry(zip.file(manifests[0])!, budget));
  if (!obj(m) || m.contract_version !== '3.5.0' || m.normalization_version !== 3 || !Array.isArray(m.assets) || m.assets.length > 1500) fail('Supported project snapshot contract: 3.5.0, normalization 3.');
  if (m.project_id !== sourceProject) throw new ValidationError('Snapshot project UUID differs from the confirmed target binding.', 'source_project_id');
  const prefix = manifests[0].slice(0, -'snapshot.json'.length); const assets: Obj[] = [], rows: Obj[] = [], checks: EvidenceCheck[] = []; const keys = new Set<string>(), consumed = new Set([manifests[0]]);
  for (const a of m.assets) {
    if (!obj(a) || !/^[A-Za-z0-9_-]+$/.test(a.asset_type) || !/^[A-Za-z0-9_-]+$/.test(a.asset_id) || a.project_id !== sourceProject || !HASH.test(a.payload_hash)) fail('Invalid asset identity, project or hash.');
    const key = `${a.asset_type}/${a.asset_id}`; if (keys.has(key)) fail('Duplicate manifest asset.'); keys.add(key);
    const path = a.asset_type === 'settings' ? `${prefix}settings/${a.asset_id}.json` : `${prefix}assets/${key}.json`, entry = zip.file(path); if (!entry) fail(`Missing asset ${key}.`); consumed.add(path);
    const wrapper = json(await readEntry(entry, budget));
    if (wrapper.asset_id !== a.asset_id || wrapper.asset_type !== a.asset_type || !obj(wrapper.document) || sha(canonical(wrapper.document)) !== a.payload_hash) fail(`Asset identity or payload hash mismatch: ${key}.`);
    const d = wrapper.document;
    if (typeof d.company_id === 'string' && d.company_id !== sourceProject) fail(`Asset belongs to a different project: ${key}.`);
    const triggers = a.asset_type === 'scenarios' && Array.isArray(d.nodes) ? d.nodes.filter((n: any) => n.type === 'on-event-trigger' && obj(n.event) && typeof n.event.type === 'string').map((n: any) => ({ event: text(n.event.type,180), conditions: conditions(n.event), delay_seconds: number(n.delay_seconds) })) : [];
    assets.push({ id: a.asset_id, type: a.asset_type, name: text(a.name), source_url: sourceUrl(a.source_url), payload_hash: a.payload_hash, config_hash: HASH.test(a.config_hash) ? a.config_hash : null, status: obj(a.status) ? Object.fromEntries(Object.entries(a.status).filter(([k,v]) => ['state','status','active','archived'].includes(k) && (typeof v === 'boolean' || typeof v === 'string'))) : {}, triggers });
    if (a.asset_type === 'settings' && a.asset_id === 'dm-events') {
      const model = parseDataManagerEvents(d.settings);
      for (const e of model.events) for (const p of e.properties) rows.push({ scope: e.type, scope_kind: 'event', property: p.property, declared_type: p.type, state: 'captured_schema' });
    }
    if (a.asset_type === 'settings' && a.asset_id === 'dm-customer-properties') {
      const model = parseDataManagerCustomers(d.settings);
      for (const p of model.properties) rows.push({ scope: 'customer', scope_kind: 'customer', property: p.property, declared_type: p.type, state: 'captured_schema' });
    }
  }
  if (names.some(n => !n.endsWith('/') && n !== 'README.md' && !consumed.has(n))) fail('Archive contains unlisted content.');
  const coverage = Array.isArray(m.coverage) ? m.coverage.map((c: any) => ({ asset_type: text(c.asset_type,100), status: text(c.status,40), listed: number(c.listed), collected: number(c.collected), failed: number(c.failed) })) : [];
  for (const c of coverage.filter((c: Obj) => c.status !== 'ok')) checks.push(check(`coverage:${c.asset_type}`, c.asset_type, `Capture status: ${c.status}. Absence is not proof that this feature is unused.`, 'Resolve collection/module access or retain the coverage gap.', '/snapshot.json/coverage'));
  return { format: 'e3-captured-evidence-v1', kind: 'project_snapshot', source_sha256: sha(buffer), source_project_id: sourceProject, filename, facts: { contract_version: m.contract_version, normalization_version: m.normalization_version, observed_at: text(m.observed_at), project_name: text(m.project_name), partial: m.partial === true, assets: assets.length, coverage, schema_rows: rows.length, hashes_verified: assets.length }, assets, rows, checks };
}
function values(buffer: Buffer, sourceProject: string, filename: string): EvidenceSummary {
  const input = json(buffer); const groups = obj(input) && Array.isArray(input.properties) ? [input] : input; if (!Array.isArray(groups) || !groups.length || groups.length > 1000) fail('Expected a non-empty values-export array.');
  const kinds = new Set(groups.map(g => g?.scope_kind)); if (kinds.size !== 1 || !['event','customer','customer_property'].includes(groups[0]?.scope_kind)) fail('Mixed or unsupported value-scan scope.');
  const kind = groups[0].scope_kind === 'event' ? 'event_values' : 'customer_values'; const seen = new Set<string>(), rows: Obj[] = [], checks: EvidenceCheck[] = [];
  for (const [gi,g] of groups.entries()) {
    if (!obj(g) || typeof g.scope !== 'string' || !TECH.test(g.scope) || !Array.isArray(g.properties)) fail('Invalid value-scan group.');
    if (g.project_id !== undefined && g.project_id !== sourceProject) fail('Values-export project differs from binding.');
    for (const [pi,p] of g.properties.entries()) {
      if (obj(p) && p.read === false && p.values == null) p.values = []; // Failed reads have no buckets; retain failure explicitly.
      if (rows.length >= 10000 || !obj(p) || typeof p.property !== 'string' || !TECH.test(p.property) || typeof p.read !== 'boolean' || !Array.isArray(p.values) || p.values.length > 10000) fail('Invalid property scan.');
      const key = `${g.scope_kind}:${g.scope}.${p.property}`; if (seen.has(key)) fail('Duplicate property scan.'); seen.add(key);
      const source = `/${gi}/properties/${pi}`, subject = `${g.scope}.${p.property}`, types: Record<string,number> = {}; let nulls = 0; let empty = 0;
      const safeValues: Obj[] = [];
      for (const v of p.values) {
        if (!obj(v) || !['value','null','empty'].includes(v.kind) || !obj(v.counts) || Object.values(v.counts).some(x => number(x) === null)) fail('Invalid value bucket or counts.');
        if (v.kind === 'null') { nulls++; continue; }
        if (v.kind === 'empty') { empty++; continue; }
        if (typeof v.value === 'string' && /^\[redacted[:\]]/i.test(v.value)) continue;
        const t = Array.isArray(v.value) ? 'array' : v.value === null ? 'null' : typeof v.value;
        types[t] = (types[t] ?? 0) + 1;
        if (SAFE.has(subject) && typeof v.value === 'string' && /^[A-Za-z0-9_ .()-]{1,100}$/.test(v.value)) safeValues.push({ value: v.value, counts: { total: number(v.counts['# Total']), last_7_days: number(v.counts['# Last 7 days']), last_24_hours: number(v.counts['# Last 24 hours']) } });
      }
      const row = { scope: g.scope, scope_kind: g.scope_kind, property: p.property, declared_type: text(p.declared_type,50), read: p.read, read_at: text(g.read_at), total: number(p.total), distinct_values_reported: number(p.distinct_values), truncated: p.truncated === true, always_null: p.always_null === true, null_bucket_count: nulls, empty_bucket_count: empty, value_types: types, safe_values: safeValues, source_pointer: source };
      rows.push(row);
      const expected = ({string:'string',number:'number',boolean:'boolean',list:'array'} as Record<string,string>)[row.declared_type.toLowerCase()];
      if (row.read && expected && Object.keys(types).some(t => t !== expected && t !== 'null')) checks.push(check(`representation:${key}`, subject, `Reported ${row.declared_type} field contains value buckets with JSON representations: ${Object.keys(types).join(', ')}.`, 'Confirm source/exporter representation and reconcile with the expected definition; aggregate buckets do not identify individual failing events.', source));
      if (!row.read) checks.push(check(`read:${key}`, subject, 'Property export failed; no absence conclusion is possible.', 'Retry a bounded/simplified source analysis; retain this failure meanwhile.', source));
      if (nulls > 1) checks.push(check(`null:${key}`, subject, 'Multiple null-labelled buckets make missingness ambiguous.', 'Do not calculate a null rate. Clarify exporter overflow/other bucket semantics.', source));
      else if (row.always_null && row.read) checks.push(check(`empty:${key}`, subject, 'Exporter reports always-null in this capture.', 'Check intended use and capture coverage before changing requirements.', source, 'info'));
      if (row.truncated) checks.push(check(`truncated:${key}`, subject, 'Distribution is truncated; listed values are not an exhaustive domain.', 'Keep expected allowed values independent of this observed top-N list.', source, 'info'));
    }
  }
  return { format: 'e3-captured-evidence-v1', kind, source_sha256: sha(buffer), source_project_id: sourceProject, filename, facts: { groups: groups.length, property_rows: rows.length, read: rows.filter(r => r.read).length, failed: rows.filter(r => !r.read).length, truncated: rows.filter(r => r.truncated).length, ambiguous_null: rows.filter(r => r.null_bucket_count > 1).length, identity: 'operator-bound to an imported snapshot; standalone value exports normally omit project UUID', counts: kind === 'event_values' ? 'event occurrences, separately aggregated per property' : 'customer-profile counts, separately aggregated per property', raw_personal_values_retained: false }, assets: [], rows, checks };
}
function stored(projectId: string): { run: Runs.QaRunRow; evidence: EvidenceSummary }[] {
  return Runs.listQaRuns(projectId).flatMap(run => { const m = run.manifest_json; return obj(m) && m.format === 'e3-captured-evidence-v1' ? [{ run, evidence: m as EvidenceSummary }] : []; });
}
export function listCapturedEvidence(projectId: string) { getProjectOrThrow(projectId); return stored(projectId).map(({run,evidence}) => ({ id: run.id, imported_at: run.started_at, ...evidence })); }
export async function previewCapturedEvidence(projectId: string, buffer: Buffer, filename: string, sourceProject: string) {
  const project = getProjectOrThrow(projectId);
  if (!UUID.test(sourceProject)) throw new ValidationError('Confirm the source Bloomreach project UUID.', 'source_project_id');
  if (buffer.length > MAX_FILE) fail('Source file exceeds 40 MB.');
  const existing = stored(projectId); const bindings = new Set(existing.map(e => e.evidence.source_project_id));
  if (bindings.size > 1) throw new ValidationError('Stored evidence has conflicting source bindings; resolve before importing.', 'source_project_id');
  const binding = existing[0]?.evidence.source_project_id; const hasSnapshot = existing.some(e => e.evidence.kind === 'project_snapshot');
  if ((binding && binding !== sourceProject) || (project.bloomreach_project_token && project.bloomreach_project_token !== sourceProject)) throw new ValidationError('Project binding mismatch. Use the correct destination project.', 'source_project_id');
  const evidence = buffer[0] === 0x50 && buffer[1] === 0x4b ? await snapshot(buffer, sourceProject, text(filename)) : values(buffer, sourceProject, text(filename));
  if (evidence.kind !== 'project_snapshot' && !hasSnapshot) throw new ValidationError('Import the matching project snapshot ZIP first to bind these value scans.', 'source_project_id');
  const duplicate = existing.find(e => e.evidence.source_sha256 === evidence.source_sha256);
  return { ...evidence, duplicate_run_id: duplicate?.run.id ?? null, payload_hash: sha(canonical({ projectId, sourceProject, source_sha256: evidence.source_sha256 })), writes: duplicate ? [] : ['one archived evidence record; no observations, expected definitions or approvals'], evidence };
}
export async function applyCapturedEvidence(projectId: string, buffer: Buffer, filename: string, sourceProject: string, expectedHash: string, actor: string | null) {
  const preview = await previewCapturedEvidence(projectId, buffer, filename, sourceProject);
  if (preview.payload_hash !== expectedHash) throw new PayloadChangedError('Source bytes or project binding changed; preview again.');
  return getDb().transaction(() => {
    const duplicate = stored(projectId).find(e => e.evidence.source_sha256 === preview.source_sha256);
    if (duplicate) return { id: duplicate.run.id, duplicate: true, facts: preview.facts };
    const run = Runs.createQaRun(projectId, { kind: 'manual', source: 'extension', actor, notes: `Captured evidence: ${preview.kind} - ${preview.filename}. Configuration/aggregate review, not event-level execution QA.`, manifest_json: preview.evidence, source_meta_json: { evidence_kind: preview.kind, source_sha256: preview.source_sha256, source_project_id: sourceProject } });
    Runs.updateQaRun(projectId, run.id, { archived: true, finished_at: new Date().toISOString() });
    return { id: run.id, duplicate: false, facts: preview.facts };
  }).immediate();
}
export function capturedEvidenceChecks(projectId: string) {
  const imports = stored(projectId); const latest = (kind: EvidenceSummary['kind']) => imports.find(x => x.evidence.kind === kind);
  const snapshot = latest('project_snapshot'), eventValues = latest('event_values'), customerValues = latest('customer_values');
  const selected = [snapshot,eventValues,customerValues].filter((x): x is NonNullable<typeof x> => !!x);
  const checks = selected.flatMap(x => x.evidence.checks.map(c => ({ ...c, import_id: x.run.id })));
  if (snapshot && eventValues) {
    const domain = new Map(eventValues.evidence.rows.map(r => [`${r.scope}.${r.property}`,r]));
    for (const a of snapshot.evidence.assets.filter(a => a.type === 'scenarios')) for (const t of a.triggers ?? []) for (const c of t.conditions ?? []) {
      const row = domain.get(`${t.event}.${c.property}`);
      if (!row || !row.read || row.truncated || !SAFE.has(`${t.event}.${c.property}`) || !['equals','in'].includes(c.operator)) continue;
      const seen = new Set(row.safe_values.map((v: Obj) => v.value));
      const absent = c.values.filter((v: string) => !seen.has(v));
      if (absent.length) checks.push({ ...check(`filter:${a.id}:${t.event}:${c.property}:${absent.join(',')}`, a.name, `Captured scenario filter ${t.event}.${c.property} uses ${absent.join(', ')}; not present in this complete reported value list.`, 'Review filter semantics and capture time/window; do not call this proof the scenario never ran.', `asset:${a.type}/${a.id}`), import_id: snapshot.run.id });
    }
  }
  return { checked_at: new Date().toISOString(), scope: 'latest captured configuration and aggregate evidence only', imports: selected.map(x => ({ id: x.run.id, kind: x.evidence.kind, source_sha256: x.evidence.source_sha256 })), checks, observation_count_added: 0, certification_changed: false };
}
