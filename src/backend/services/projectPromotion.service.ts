import { createHash } from 'node:crypto';
import { getDb } from '../db';
import { newId, nowIso, toJsonColumn } from '../db/util';
import { getProjectOrThrow } from '../dal/project.dal';
import { runWithActor } from '../context/actor';
import { recordChange } from '../dal/change-log.dal';
import { parseBackupFile, PROJECT_SCOPED_TABLES, type BackupRow } from '../../domain/import/backup';
import { tableColumns } from './backup.service';
import { BadRequestError, ConflictError, PayloadChangedError } from '../errors';

export function promotionCanonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(promotionCanonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + promotionCanonical((value as BackupRow)[k])).join(',') + '}';
    return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(promotionCanonical(value)).digest('hex');
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const MAX_BYTES = 10 * 1024 * 1024;
const PROJECT_SETTINGS = ['description', 'bloomreach_api_customer_id_key', 'bloomreach_project_token', 'bloomreach_api_base_url', 'bloomreach_project_url', 'default_expiration_json', 'standard_event_additions_json', 'consent_key_additions_json', 'bloomreach_mapping_meta_json', 'data_manager_meta_json', 'data_manager_customers_json', 'data_manager_events_json', 'money_tolerance_percent', 'money_tolerance_floor', 'industry', 'naming_convention', 'default_source_id'] as const;
export interface ProjectPromotionInput {
    source_project_id: string;
    destination_project_id: string;
    source_sha256: string;
    source_backup: string;
}
interface Receipt {
    id: string; project_id: string; source_project_id: string; source_sha256: string; source_content_hash: string;
    destination_baseline_hash: string; plan_hash: string; id_map_json: string; counts_json: string;
    decision_bindings_json: string; result_hash: string; actor: string; created_at: string;
}
function receipt(project: string): Receipt | undefined {
    return getDb().prepare('SELECT * FROM project_promotions WHERE project_id=?').get(project) as Receipt | undefined;
}
const CHILDREN: Record<string, [string, string]> = {
    event_sources: ['events', 'event_id'], event_properties: ['events', 'event_id'],
    catalog_fields: ['catalogs', 'catalog_id'], requirements: ['use_cases', 'use_case_id'],
    property_bundle_items: ['property_bundles', 'bundle_id'],
};
function liveRows(table: string, project: string): BackupRow[] {
    if (tableColumns(table).includes('project_id')) return getDb().prepare(`SELECT * FROM ${table} WHERE project_id=? ORDER BY rowid`).all(project) as BackupRow[];
    const [parent, key] = CHILDREN[table] ?? [];
    if (!parent) throw new BadRequestError('Unsupported scoped table in promotion policy.');
    return getDb().prepare(`SELECT c.* FROM ${table} c JOIN ${parent} p ON p.id=c.${key} WHERE p.project_id=? ORDER BY c.rowid`).all(project) as BackupRow[];
}
function destinationState(project: string) {
    return {
        project: getDb().prepare('SELECT * FROM projects WHERE id=?').get(project),
        tables: Object.fromEntries(PROJECT_SCOPED_TABLES.map(t => [t, liveRows(t, project)])),
    };
}
function assertEmpty(project: string) {
    for (const table of PROJECT_SCOPED_TABLES) {
        if (table === 'share_members') continue; // Destination access policy is retained, never imported.
        const rows = liveRows(table, project);
        if (table === 'change_log' && rows.every(r => r.entity_type === 'project' && r.entity_id === project && r.action === 'create')) continue;
        if (table === 'qa_sequence_counters' && rows.every(r => r.finding_next === 1 && r.report_next === 1)) continue;
        if (rows.length) throw new ConflictError('Destination is not an empty project shell; promotion never merges or replaces content.');
    }
}
function read(input: ProjectPromotionInput, project: string) {
    if (!input || !UUID.test(input.source_project_id) || input.destination_project_id !== project || input.source_project_id === project || !SHA.test(input.source_sha256) || typeof input.source_backup !== 'string' || Buffer.byteLength(input.source_backup) > MAX_BYTES)
        throw new BadRequestError('Invalid or oversized bound promotion input.');
    if (sha(input.source_backup) !== input.source_sha256) throw new PayloadChangedError('Exact source backup bytes do not match source_sha256.');
    let raw: BackupRow;
    try { raw = JSON.parse(input.source_backup); } catch { throw new BadRequestError('Source backup must be valid JSON.'); }
    const parsed = parseBackupFile(raw);
    if (!parsed.formatValid || !parsed.versionValid || parsed.warnings.length || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestError('A complete valid source backup without parser warnings is required.');
    const envelope = new Set(['format', 'version', 'exported_at', 'app', 'client', 'project', 'use_case_templates', ...PROJECT_SCOPED_TABLES, 'files', 'files_missing', 'warnings']);
    if (Object.keys(raw).some(k => !envelope.has(k))) throw new BadRequestError('Unknown source backup section.');
    for (const name of ['files', 'files_missing', 'warnings', 'use_case_templates', 'share_members', 'historical_file_sources', 'historical_validation_reports']) {
        const values = raw[name];
        if (values !== undefined && (!Array.isArray(values) || values.length)) throw new BadRequestError('Promotion v1 requires no embedded files, templates, share members or export warnings.');
    }
    const destination = getProjectOrThrow(project);
    if (typeof parsed.project.key !== 'string' || parsed.project.key !== destination.key) throw new ConflictError('Source and existing destination project keys must match exactly.');
    if (destination.bloomreach_project_token && destination.bloomreach_project_token !== parsed.project.bloomreach_project_token) throw new ConflictError('Destination Bloomreach project binding differs.');
    const projectColumns = new Set(tableColumns('projects'));
    if (Object.keys(parsed.project).some(k => !projectColumns.has(k))) throw new BadRequestError('Unknown source project column.');
    const counts: Record<string, number> = {};
    const ids: Record<string, string> = { [input.source_project_id]: project };
    const decisionBindings: Record<string, string[]> = {};
    let total = 0;
    for (const table of PROJECT_SCOPED_TABLES) {
        const rows = parsed.tables[table], columns = new Set(tableColumns(table)); counts[table] = rows.length;
        total += rows.length;
        for (const row of rows) {
            if (Object.keys(row).some(k => !columns.has(k))) throw new BadRequestError('Unknown source table column: ' + table);
            if (columns.has('project_id') && row.project_id !== input.source_project_id) throw new BadRequestError('Source row belongs to another project: ' + table);
            if (columns.has('id')) {
                if (typeof row.id !== 'string' || !UUID.test(row.id) || ids[row.id]) throw new BadRequestError('Source row ID is invalid or duplicated.');
                ids[row.id] = row.id;
            }
            if (table === 'decision_revisions') {
                const payload = row.payload_json as BackupRow;
                if (!payload || payload.project_id !== input.source_project_id || hash(payload) !== row.content_hash || !Array.isArray(payload.patches)) throw new BadRequestError('Decision payload or immutable hash is invalid.');
                const ucs = new Set(parsed.tables.use_cases.map(r => r.id));
                const patches = payload.patches as BackupRow[];
                if (patches.some(p => typeof p.use_case_id !== 'string' || !ucs.has(p.use_case_id))) throw new BadRequestError('Decision references an unowned use case.');
                decisionBindings[String(row.id)] = patches.map(p => String(p.use_case_id));
            }
        }
    }
    if (!total || total > 20000) throw new BadRequestError('Promotion row count is outside the supported bound.');
    // Validate complete FK tuples against this source package, never arbitrary existing project rows.
    for (const table of PROJECT_SCOPED_TABLES) {
        const fks = getDb().prepare(`PRAGMA foreign_key_list(${table})`).all() as { id: number; table: string; from: string; to: string }[];
        for (const row of parsed.tables[table]) for (const id of new Set(fks.map(f => f.id))) {
            const group = fks.filter(f => f.id === id);
            if (group.some(f => row[f.from] == null)) continue;
            const target = group[0].table;
            const parents = target === 'projects' ? [{ id: input.source_project_id }] : parsed.tables[target];
            if (!parents || !parents.some(p => group.every(f => p[f.to] === row[f.from]))) throw new BadRequestError('Source has an unowned or missing dependency: ' + table);
        }
    }
    const settings = Object.fromEntries(PROJECT_SETTINGS.filter(k => Object.hasOwn(parsed.project, k)).map(k => [k, parsed.project[k]]));
    if (settings.default_source_id && !parsed.tables.sources.some(s => s.id === settings.default_source_id)) throw new BadRequestError('Source default source is missing.');
    return { parsed, counts, ids, decisionBindings, settings, contentHash: hash({ project: parsed.project, tables: parsed.tables }) };
}
function checkCollisions(tables: Record<string, BackupRow[]>) {
    for (const table of PROJECT_SCOPED_TABLES) {
        if (!tableColumns(table).includes('id')) continue;
        for (const row of tables[table]) if (getDb().prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(row.id)) throw new ConflictError('A source entity ID already exists; IDs cannot be silently reassigned.');
    }
}
function plan(project: string, input: ProjectPromotionInput) {
    const source = read(input, project); assertEmpty(project); checkCollisions(source.parsed.tables);
    const baseline = hash(destinationState(project));
    const planHash = hash({ version: 1, source_project_id: input.source_project_id, destination_project_id: project, source_sha256: input.source_sha256, source_content_hash: source.contentHash, destination_baseline_hash: baseline, id_map: source.ids, counts: source.counts, decision_bindings: source.decisionBindings, settings: source.settings });
    return { ...source, baseline, planHash };
}
function resultState(project: string) { return hash(destinationState(project)); }
function publicReceipt(row: Receipt) {
    return { id: row.id, source_project_id: row.source_project_id, destination_project_id: row.project_id, source_sha256: row.source_sha256, source_content_hash: row.source_content_hash, destination_baseline_hash: row.destination_baseline_hash, plan_hash: row.plan_hash, id_map: JSON.parse(row.id_map_json), counts: JSON.parse(row.counts_json), result_hash: row.result_hash, actor: row.actor, created_at: row.created_at };
}
export function previewProjectPromotion(project: string, input: ProjectPromotionInput) {
    const prior = receipt(project);
    if (prior) {
        read(input, project);
        if (prior.source_sha256 !== input.source_sha256 || prior.source_project_id !== input.source_project_id || prior.result_hash !== resultState(project)) throw new ConflictError('Existing promotion receipt or current project differs; do not replay.');
        return { ...publicReceipt(prior), replay: true };
    }
    const p = plan(project, input);
    return { source_project_id: input.source_project_id, destination_project_id: project, source_sha256: input.source_sha256, source_content_hash: p.contentHash, destination_baseline_hash: p.baseline, plan_hash: p.planHash, id_map: p.ids, counts: p.counts, replay: false, effects: ['Insert source entities into the existing empty destination; preserve original history and decision hashes.', 'Retain destination identity, client, sharing, access grants and security.', 'No execution, observation creation, recomparison or QA certification.'] };
}
export function applyProjectPromotion(project: string, input: ProjectPromotionInput, expectedPlan: string, expectedBaseline: string, actor: string, humanConfirmed: boolean) {
    if (!humanConfirmed || !actor.trim()) throw new BadRequestError('Explicit scoped promotion confirmation and verified actor are required.');
    return getDb().transaction(() => {
        const prior = receipt(project);
        if (prior) {
            const preview = previewProjectPromotion(project, input);
            if (preview.plan_hash !== expectedPlan || preview.destination_baseline_hash !== expectedBaseline) throw new PayloadChangedError('Replay differs from the immutable promotion receipt.');
            return { ...preview, replay: true };
        }
        const p = plan(project, input);
        if (p.planHash !== expectedPlan || p.baseline !== expectedBaseline) throw new PayloadChangedError('Source or destination changed since promotion preview.');
        const db = getDb(); db.pragma('defer_foreign_keys = ON');
        // Keep destination security and identity; apply only explicit non-security specification settings.
        const keys = Object.keys(p.settings);
        if (keys.length) db.prepare(`UPDATE projects SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...keys.map(k => k.endsWith('_json') ? toJsonColumn(p.settings[k]) : p.settings[k]), project);
        for (const table of PROJECT_SCOPED_TABLES) {
            if (table === 'share_members') continue;
            if (table === 'qa_sequence_counters' && p.parsed.tables[table].length) db.prepare('DELETE FROM qa_sequence_counters WHERE project_id=?').run(project);
            for (const original of p.parsed.tables[table]) {
                const row = { ...original };
                if (Object.hasOwn(row, 'project_id')) row.project_id = project;
                const cols = Object.keys(row);
                db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => k.endsWith('_json') ? toJsonColumn(row[k]) : row[k]));
            }
        }
        runWithActor({actor,source:'promotion'}, () => recordChange({ projectId: project, entityType: 'project', entityId: project, entityLabel: getProjectOrThrow(project).name, action: 'update', before: null, after: { promotion_source_sha256: input.source_sha256, counts: JSON.stringify(p.counts) } }));
        const id = newId();
        db.prepare('INSERT INTO project_promotions(id,project_id,source_project_id,source_sha256,source_content_hash,destination_baseline_hash,plan_hash,source_backup_json,id_map_json,counts_json,decision_bindings_json,result_hash,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,project,input.source_project_id,input.source_sha256,p.contentHash,p.baseline,p.planHash,input.source_backup,JSON.stringify(p.ids),JSON.stringify(p.counts),JSON.stringify(p.decisionBindings),resultState(project),actor,nowIso());
        return { ...publicReceipt(receipt(project)!), replay: false };
    }).immediate();
}
/** Only imported decision + UC pairs may compare their preserved source-project baseline. */
export function promotionBaselineProject(project: string, decision: string, useCase: string): string {
    const row = receipt(project);
    if (!row) return project;
    const bindings = JSON.parse(row.decision_bindings_json) as Record<string, string[]>;
    return bindings[decision]?.includes(useCase) ? row.source_project_id : project;
}
