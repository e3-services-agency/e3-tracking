import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { z } from 'zod';
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { getActor } from '../context/actor';
import { durableStep, recoveredStep } from '../../mcp/idempotency';
import { getProjectOrThrow } from '../dal/project.dal';
import { captureQaReport, getQaReport } from '../dal/qa-report.dal';
import { getFileStore } from '../files/FileStore';
import { NotFoundError, PayloadChangedError, ValidationError } from '../errors';
import { httpMcpContext } from '../../mcp/httpContext';
import { HISTORICAL_FILE_POLICY, parseHistoricalCsv, runHistoricalValidation, historicalEngineImplementation, type HistoricalInput, type HistoricalManifest, type HistoricalResult } from '../../domain/historicalFiles';

const id = z.string().uuid();
const header = z.string().min(1).max(128);
export const historicalManifestSchema = z.object({
  version: z.literal(1), parse_policy: z.literal('csv-lexical-v1'),
  files: z.array(z.object({ source_id: id, event_id: id,
    mappings: z.array(z.object({ column: header, property_id: id, definition_id: id.nullable() }).strict()).max(200),
    source_only_columns: z.array(header).max(200), trailing_empty_columns: z.array(header).max(200),
  }).strict()).min(1).max(4),
  joins: z.array(z.object({ kind: z.literal('one_to_many'), left_source_id: id, right_source_id: id, left_column: header, right_column: header }).strict()).max(4),
}).strict();
type Row = Record<string, unknown>;
interface SourceRow { id: string; project_id: string; filename: string; source_ref: string; source_captured_at: string | null; sha256: string; byte_size: number; file_path: string; uploaded_at: string; uploaded_by: string }
interface ReportRow { id: string; project_id: string; report_id: string; identity_hash: string; preview_hash: string; definition_hash: string; engine_hash: string; source_ids_json: string; manifest_json: string; snapshot_json: string; result_json: string; created_at: string; actor: string; oauth_grant_id: string | null; restored_from_id: string | null }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function canonicalHistorical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalHistorical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonicalHistorical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function csv(buffer: Buffer) {
  if (!buffer.length || buffer.length > HISTORICAL_FILE_POLICY.maxBytes) throw new ValidationError('CSV must contain between 1 byte and 32 MiB.');
  try { return parseHistoricalCsv(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
  catch (e) { throw new ValidationError(e instanceof Error && e.message.startsWith('CSV') ? e.message : 'CSV must be valid UTF-8.'); }
}
function reference(raw: string): string {
  if (!raw || raw.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) throw new ValidationError('A bounded noncredentialed source file reference is required.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url: URL; try { url = new URL(raw); } catch { throw new ValidationError('Source URL is invalid.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ValidationError('Source URLs must be HTTPS without credentials, query or fragment; use an opaque file ID otherwise.');
  }
  return raw;
}
const sourcePublic = (s: SourceRow) => ({ id: s.id, filename: s.filename, source_ref: s.source_ref, source_captured_at: s.source_captured_at, sha256: s.sha256, byte_size: s.byte_size, uploaded_at: s.uploaded_at });
function source(projectId: string, sourceId: string): SourceRow {
  const row = getDb().prepare('SELECT * FROM historical_file_sources WHERE project_id=? AND id=?').get(projectId, sourceId) as SourceRow | undefined;
  if (!row) throw new NotFoundError('Historical source not found.'); return row;
}
export async function uploadHistoricalSource(projectId: string, bytes: Buffer, filename: string, metadata: { source_ref: string; source_captured_at?: string | null }) {
  getProjectOrThrow(projectId);
  const parsed = csv(bytes), digest = hash(bytes), ref = reference(metadata.source_ref);
  const captured = metadata.source_captured_at ?? null;
  if (captured !== null && (!/^\d{4}-\d\d-\d\dT/.test(captured) || !Number.isFinite(Date.parse(captured)))) throw new ValidationError('Source capture time must be an explicit ISO timestamp, separate from original event time.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,199}\.csv$/i.test(filename)) throw new ValidationError('A bounded plain CSV filename is required.');
  const previous = getDb().prepare('SELECT * FROM historical_file_sources WHERE project_id=? AND sha256=? AND source_ref=?').get(projectId, digest, ref) as SourceRow | undefined;
  if (previous) {
    if (previous.filename !== filename || previous.source_captured_at !== captured) throw new PayloadChangedError('Source metadata changed for the same byte/reference identity.');
    const actual = await getFileStore().openForProject(projectId, previous.file_path);
    if (hash(actual.buffer) !== digest) throw new PayloadChangedError('Stored source bytes are unavailable or changed.');
    return { ...sourcePublic(previous), rows: parsed.rows.length, headers: parsed.headers, duplicate: true };
  }
  const sourceId = newId(), stored = await getFileStore().put(projectId, 'historical-sources/' + sourceId, 'source.csv', bytes, 'text/csv');
  try {
    getDb().prepare('INSERT INTO historical_file_sources(id,project_id,filename,source_ref,source_captured_at,sha256,byte_size,file_path,uploaded_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?)').run(sourceId, projectId, filename, ref, captured, digest, bytes.length, stored.path, nowIso(), getActor().actor);
  } catch (e) { await getFileStore().removeFile(projectId, stored.path); throw e; }
  return { ...sourcePublic(source(projectId, sourceId)), rows: parsed.rows.length, headers: parsed.headers, duplicate: false };
}
export function listHistoricalSources(projectId: string) {
  getProjectOrThrow(projectId); return (getDb().prepare('SELECT * FROM historical_file_sources WHERE project_id=? ORDER BY uploaded_at,id').all(projectId) as SourceRow[]).map(sourcePublic);
}
function semanticSnapshot(projectId: string) {
  getProjectOrThrow(projectId);
  const db = getDb();
  // Descriptions/examples are not validation operands; updated_at still invalidates changed revisions.
  const events = db.prepare('SELECT id,name,status,updated_at FROM events WHERE project_id=? AND deleted_at IS NULL ORDER BY id').all(projectId) as Row[];
  const properties = db.prepare('SELECT id,name,scope,data_type,data_formats_json,allowed_values_json,item_schema_json,value_schema_json,updated_at FROM properties WHERE project_id=? AND deleted_at IS NULL ORDER BY id').all(projectId) as Row[];
  const definitions = db.prepare('SELECT id,property_id,name,formats_json,allowed_values_json,updated_at FROM property_definitions WHERE project_id=? AND deleted_at IS NULL ORDER BY id').all(projectId) as Row[];
  const links = db.prepare('SELECT ep.* FROM event_properties ep JOIN events e ON e.id=ep.event_id WHERE e.project_id=? AND e.deleted_at IS NULL ORDER BY ep.event_id,ep.property_id').all(projectId) as Row[];
  const rules = db.prepare('SELECT * FROM rules WHERE project_id=? ORDER BY id').all(projectId) as Row[];
  return { project_id: projectId, events, properties, definitions, links, rules };
}
function asArray(value: unknown): unknown[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed : [];
}
function allowed(value: unknown) { return asArray(value).map(v => v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v); }
function manifestValue(raw: unknown): HistoricalManifest {
  const result = historicalManifestSchema.safeParse(raw); if (!result.success) throw new ValidationError('Historical validation manifest is invalid.');
  const manifest = result.data;
  if (new Set(manifest.files.map(f => f.source_id)).size !== manifest.files.length) throw new ValidationError('Each source may appear only once.');
  return manifest as HistoricalManifest;
}
async function prepare(projectId: string, raw: unknown) {
  const manifest = manifestValue(raw), loaded: { row: SourceRow; parsed: ReturnType<typeof csv> }[] = [];
  let totalBytes = 0;
  for (const file of manifest.files) {
    const row = source(projectId, file.source_id); totalBytes += row.byte_size;
    if (totalBytes > 64 * 1024 * 1024) throw new ValidationError('Combined source byte limit is 64 MiB.');
    let bytes: Buffer;
    try { bytes = (await getFileStore().openForProject(projectId, row.file_path)).buffer; }
    catch { throw new PayloadChangedError('A source artifact is unavailable; upload and preview again.'); }
    if (bytes.length !== row.byte_size || hash(bytes) !== row.sha256) throw new PayloadChangedError('Source bytes changed; preview cannot be applied.');
    loaded.push({ row, parsed: csv(bytes) });
  }
  const snapshot = semanticSnapshot(projectId), definitionHash = hash(canonicalHistorical(snapshot));
  const engineHash = hash(historicalEngineImplementation());
  const inputs: HistoricalInput[] = manifest.files.map((selection, index) => {
    if (!snapshot.events.some(e => e.id === selection.event_id)) throw new ValidationError('Mapped event is not a live event of this project.');
    const expectations = selection.mappings.map(mapping => {
      const link = snapshot.links.find(l => l.event_id === selection.event_id && l.property_id === mapping.property_id);
      const property = snapshot.properties.find(p => p.id === mapping.property_id);
      const definition = mapping.definition_id ? snapshot.definitions.find(d => d.id === mapping.definition_id && d.property_id === mapping.property_id) : undefined;
      if (!link || !property || (link.definition_id ?? null) !== mapping.definition_id || mapping.definition_id && !definition) throw new ValidationError('Mapping must select the exact current event/property/definition link in this project.');
      const formats = definition ? asArray(definition.formats_json) : [];
      return { column: mapping.column, property_id: mapping.property_id, definition_id: mapping.definition_id, required: link.required === 1,
        data_type: String(property.data_type), allowed_values: allowed(definition ? definition.allowed_values_json : property.allowed_values_json),
        formats: (formats.length ? formats : asArray(property.data_formats_json)).map(String) };
    });
    return { source_id: selection.source_id, selection, csv: loaded[index].parsed, expectations };
  });
  let result: HistoricalResult;
  try { result = runHistoricalValidation(inputs, snapshot.rules.length, manifest.joins); }
  catch (e) { throw new ValidationError(e instanceof Error ? e.message : 'Historical validation policy is invalid.'); }
  const sources = loaded.map(x => sourcePublic(x.row));
  const identity = { project_id: projectId, manifest, sources, definition_hash: definitionHash, engine_hash: engineHash };
  const previewHash = hash(canonicalHistorical(identity));
  return { manifest, snapshot, result, sources, definitionHash, engineHash, previewHash };
}
function previewPublic(prepared: Awaited<ReturnType<typeof prepare>>) {
  return { kind: 'historical_file_validation', payload_hash: prepared.previewHash, definition_hash: prepared.definitionHash, engine_hash: prepared.engineHash,
    sources: prepared.sources, manifest: prepared.manifest, files: prepared.result.files, totals: prepared.result.totals, limitations: prepared.result.limitations,
    writes: ['One immutable numbered historical-file QA report; no observations, runtime finding updates, certification or approval changes.'],
    confirmation_required: true };
}
export async function previewHistoricalValidation(projectId: string, raw: unknown) { return previewPublic(await prepare(projectId, raw)); }
export async function applyHistoricalValidation(projectId: string, raw: unknown, expectedHash: string) {
  const recovered = recoveredStep<ReportRow>('historical_report');
  if (recovered) return getHistoricalValidation(projectId, recovered.report_id);
  const prepared = await prepare(projectId, raw);
  if (prepared.previewHash !== expectedHash) throw new PayloadChangedError('Bytes, mapping, project, definitions/rules or engine changed since preview.');
  const row = durableStep('historical_report', () => getDb().transaction(() => {
    if (hash(canonicalHistorical(semanticSnapshot(projectId))) !== prepared.definitionHash) throw new PayloadChangedError('Definitions changed since preview.');
    const existing = getDb().prepare('SELECT * FROM historical_validation_reports WHERE project_id=? AND identity_hash=?').get(projectId, prepared.previewHash) as ReportRow | undefined;
    if (existing) return existing;
    const now = nowIso(), report = captureQaReport(projectId, { type: 'historical_file_validation', original_event_time: 'unavailable' },
      { historical_file_validation: true, checked: prepared.result.totals.checked, failed: prepared.result.totals.failed, skipped: prepared.result.totals.skipped, limitations: prepared.result.limitations }, []);
    const reportId = newId();
    getDb().prepare('INSERT INTO historical_validation_reports(id,project_id,report_id,identity_hash,preview_hash,definition_hash,engine_hash,source_ids_json,manifest_json,snapshot_json,result_json,created_at,actor,oauth_grant_id,restored_from_id,agent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(reportId, projectId, report.id,
      prepared.previewHash, prepared.previewHash, prepared.definitionHash, prepared.engineHash, JSON.stringify(prepared.sources.map(s => s.id)),
      canonicalHistorical(prepared.manifest), canonicalHistorical({ definitions: prepared.snapshot, sources: prepared.sources, policy: HISTORICAL_FILE_POLICY,
        engine_hash: prepared.engineHash, node_version: process.versions.node, build_revision: process.env.E3_BUILD_REVISION || 'unavailable', original_event_time: null }),
      canonicalHistorical(prepared.result), now, getActor().actor, httpMcpContext()?.grantId ?? null, null, getActor().agent ?? null);
    return getDb().prepare('SELECT * FROM historical_validation_reports WHERE id=?').get(reportId) as ReportRow;
  }).immediate());
  return getHistoricalValidation(projectId, row.report_id);
}
export function listHistoricalValidations(projectId: string) {
  getProjectOrThrow(projectId);
  return (getDb().prepare('SELECT h.id,h.report_id,h.created_at,h.definition_hash,h.engine_hash,q.report_sequence,q.summary_json FROM historical_validation_reports h JOIN qa_reports q ON q.id=h.report_id AND q.project_id=h.project_id WHERE h.project_id=? ORDER BY q.report_sequence DESC').all(projectId) as Row[]).map(r => ({ id: r.id, report_id: r.report_id, report_sequence: r.report_sequence, created_at: r.created_at, definition_hash: r.definition_hash, engine_hash: r.engine_hash, summary: JSON.parse(String(r.summary_json)) }));
}
export async function getHistoricalValidation(projectId: string, reportId: string, offset = 0, limit = 100) {
  const row = getDb().prepare('SELECT * FROM historical_validation_reports WHERE project_id=? AND (id=? OR report_id=?)').get(projectId, reportId, reportId) as ReportRow | undefined;
  if (!row) throw new NotFoundError('Historical validation report not found.');
  const result = JSON.parse(row.result_json) as HistoricalResult, snapshot = JSON.parse(row.snapshot_json);
  const availability = [];
  const currentSourceIds = JSON.parse(row.source_ids_json) as string[];
  for (let index = 0; index < currentSourceIds.length; index++) {
    const sourceId = currentSourceIds[index], originalId = snapshot.sources[index]?.id ?? sourceId;
    try { const s = source(projectId, sourceId), bytes = await getFileStore().openForProject(projectId, s.file_path); availability.push({ source_id: originalId, current_source_id: sourceId, available: bytes.buffer.length === s.byte_size && hash(bytes.buffer) === s.sha256, sha256: s.sha256 }); }
    catch { availability.push({ source_id: originalId, current_source_id: sourceId, available: false }); }
  }
  offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0; limit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(100, limit)) : 100;
  const native = getQaReport(projectId, row.report_id);
  const manifest = JSON.parse(row.manifest_json) as HistoricalManifest;
  return { id: row.id, report_id: row.report_id, report_sequence: native.report_sequence, kind: result.kind, created_at: row.created_at, actor: row.actor, agent: (row as ReportRow & { agent: string | null }).agent,
    identity_hash: row.identity_hash, definition_hash: row.definition_hash, engine_hash: row.engine_hash, restored_from_id: row.restored_from_id,
    sources: snapshot.sources, source_availability: availability, original_event_time: null, policy: result.policy, totals: result.totals,
    unmapped_columns: manifest.files.reduce((n, f) => n + f.source_only_columns.length, 0),
    files: result.files.map(f => { const mapped = manifest.files.find(m => m.source_id === f.source_id); const live = !row.restored_from_id && mapped && getDb().prepare('SELECT id FROM events WHERE project_id=? AND id=? AND deleted_at IS NULL').get(projectId, mapped.event_id); return { ...f, event_id: live ? mapped?.event_id : undefined, original_event_id: mapped?.event_id, event_name: snapshot.definitions.events.find((e: Row) => e.id === mapped?.event_id)?.name, unmapped_columns: mapped?.source_only_columns ?? [] }; }),
    limitations: result.limitations, checks: result.checks.slice(offset, offset + limit), checks_total: result.checks.length, offset, limit,
    tracking_url: '/tracking-plan/p/' + encodeURIComponent(getProjectOrThrow(projectId).key) + '/findings#qa-report-' + row.report_id,
    report_url: '/api/projects/' + projectId + '/historical-files/reports/' + row.report_id + '/view',
    detail_url: '/api/projects/' + projectId + '/historical-files/reports/' + row.report_id + '/view' };
}
