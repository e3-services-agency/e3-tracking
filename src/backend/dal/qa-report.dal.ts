import { getDb } from '../db';
import { getActor } from '../context/actor';
import { newId, nowIso } from '../db/util';
import { NotFoundError } from '../errors';
import type { FindingRow } from './finding.dal';
export function initializeQaCounters(projectId: string): void {
    const db = getDb();
    db.prepare(`INSERT OR IGNORE INTO qa_sequence_counters(project_id) VALUES (?)`).run(projectId);
    db.prepare(`UPDATE qa_sequence_counters SET finding_next=MAX(finding_next,COALESCE((SELECT MAX(finding_sequence)+1 FROM (SELECT finding_sequence FROM findings WHERE project_id=? UNION ALL SELECT finding_sequence FROM qa_report_findings WHERE project_id=?)),1)),report_next=MAX(report_next,COALESCE((SELECT MAX(report_sequence)+1 FROM qa_reports WHERE project_id=?),1)) WHERE project_id=?`).run(projectId, projectId, projectId, projectId);
}
export function allocateQaSequence(projectId: string, kind: 'finding' | 'report'): number {
    const inserted = getDb().prepare('INSERT OR IGNORE INTO qa_sequence_counters(project_id) VALUES (?)').run(projectId);
    if (inserted.changes)
        initializeQaCounters(projectId);
    const column = kind === 'finding' ? 'finding_next' : 'report_next';
    const row = getDb().prepare(`UPDATE qa_sequence_counters SET ${column}=${column}+1 WHERE project_id=? RETURNING ${column}-1 AS number`).get(projectId) as {
        number: number;
    };
    return row.number;
}
export interface QaReport {
    actor?: string | null;
    agent?: string | null;
    id: string;
    report_sequence: number;
    completed_at: string;
    snapshot_version: number;
    scope: Record<string, unknown>;
    summary: Record<string, unknown>;
}
export interface ReportItem {
    id: string;
    finding_id: string;
    finding_sequence: number;
    disposition: 'produced' | 'resolved';
    recorded: Record<string, unknown>;
    current_status: string | null;
    current_acknowledged: boolean;
}
function report(row: Record<string, unknown>): QaReport { return { id: String(row.id), actor: typeof row.actor === 'string' ? row.actor : null, agent: typeof row.agent === 'string' ? row.agent : null, report_sequence: Number(row.report_sequence), completed_at: String(row.completed_at), snapshot_version: Number(row.snapshot_version), scope: JSON.parse(String(row.scope_json)), summary: JSON.parse(String(row.summary_json)) }; }
export function listQaReports(projectId: string): QaReport[] {
    const reports = (getDb().prepare('SELECT * FROM qa_reports WHERE project_id=? ORDER BY report_sequence DESC').all(projectId) as Record<string, unknown>[]).map(report);
    if (reports.some(r => !r.summary.recorded_counts)) {
        const stats = getDb().prepare("SELECT report_id,COUNT(*) AS items,SUM(disposition='produced') AS produced,SUM(disposition='resolved') AS newly_resolved FROM qa_report_findings WHERE project_id=? GROUP BY report_id").all(projectId) as {
            report_id: string;
            items: number;
            produced: number;
            newly_resolved: number;
        }[];
        const counts = new Map(stats.map(({ report_id, ...values }) => [report_id, values]));
        for (const r of reports)
            if (!r.summary.recorded_counts)
                r.summary = { ...r.summary, recorded_counts: counts.get(r.id) ?? { items: 0, produced: 0, newly_resolved: 0 } };
    }
    return reports;
}
export function getQaReport(projectId: string, id: string): QaReport & {
    items: ReportItem[];
} {
    const row = getDb().prepare('SELECT * FROM qa_reports WHERE project_id=? AND id=?').get(projectId, id) as Record<string, unknown> | undefined;
    if (!row)
        throw new NotFoundError('QA report not found.');
    const items = getDb().prepare(`SELECT i.*,f.status AS current_status,f.resolved_by AS current_resolved_by FROM qa_report_findings i LEFT JOIN findings f ON f.id=i.finding_id AND f.project_id=i.project_id WHERE i.project_id=? AND i.report_id=? ORDER BY i.finding_sequence`).all(projectId, id) as Record<string, unknown>[];
    const result = report(row);
    if (!result.summary.recorded_counts)
        result.summary = { ...result.summary, recorded_counts: { items: items.length, produced: items.filter(i => i.disposition === 'produced').length, newly_resolved: items.filter(i => i.disposition === 'resolved').length } };
    return { ...result, items: items.map(i => ({ id: String(i.id), finding_id: String(i.finding_id), finding_sequence: Number(i.finding_sequence), disposition: i.disposition as ReportItem['disposition'], recorded: JSON.parse(String(i.snapshot_json)), current_status: typeof i.current_status === 'string' ? i.current_status : null, current_acknowledged: i.current_resolved_by === 'user' })) };
}
export function findingAppearances(projectId: string, id: string, publicOnly = false) { return getDb().prepare(`SELECT r.id AS report_id,r.report_sequence,r.completed_at,i.disposition FROM qa_report_findings i JOIN qa_reports r ON r.id=i.report_id AND r.project_id=i.project_id WHERE i.project_id=? AND i.finding_id=? ${publicOnly ? 'AND i.public_visible=1' : ''} ORDER BY r.report_sequence DESC`).all(projectId, id); }
/** Diagnostic payloads are copied, never references to mutable observations.
 * D-89 (T-5-47): an item's `priority` (the derived `priority`, `priority_rank`, `priority_reasons`
 * at capture time) is frozen into its recorded JSON, so a later change to an event's priority, method
 * or use cases never changes what the report said. Additive: older reports have no such keys. */
export function captureQaReport(projectId: string, scope: Record<string, unknown>, summary: Record<string, unknown>, items: {
    finding: FindingRow;
    disposition: 'produced' | 'resolved';
    priority?: { priority: string; priority_rank: number; priority_reasons: string[] };
}[]): QaReport {
    const db = getDb(), id = newId(), sequence = allocateQaSequence(projectId, 'report'), completed = nowIso();
    const seen = new Set<string>();
    const uniqueItems = items.filter(item => { if (seen.has(item.finding.fingerprint))
        return false; seen.add(item.finding.fingerprint); return true; });
    const capturedSummary = { ...summary, recorded_counts: { items: uniqueItems.length, produced: uniqueItems.filter(i => i.disposition === 'produced').length, newly_resolved: uniqueItems.filter(i => i.disposition === 'resolved').length } };
    db.prepare('INSERT INTO qa_reports(id,project_id,report_sequence,completed_at,scope_json,summary_json,actor,agent) VALUES (?,?,?,?,?,?,?,?)').run(id, projectId, sequence, completed, JSON.stringify(scope), JSON.stringify(capturedSummary), getActor().actor, getActor().agent ?? null);
    const labels = new Map(['events', 'variants', 'properties'].map(table => [table, new Map((db.prepare(`SELECT id,name FROM ${table} WHERE project_id=?`).all(projectId) as {
            id: string;
            name: string;
        }[]).map(row => [row.id, row.name]))]));
    const label = (table: string, ref: string | null): string | null => ref ? labels.get(table)?.get(ref) ?? null : null;
    const insert = db.prepare('INSERT INTO qa_report_findings(id,project_id,report_id,finding_id,finding_sequence,disposition,public_visible,snapshot_json) VALUES (?,?,?,?,?,?,?,?)');
    for (const { finding: f, disposition, priority } of uniqueItems) {
        const recorded = { comparison: f.comparison, kind: f.kind, severity: f.severity, status: f.status, acknowledged: f.resolved_by === 'user', first_seen_at: f.first_seen_at, last_seen_at: f.last_seen_at, resolved_at: f.resolved_at, message: f.message, expected: f.expected_json, actual: f.actual_json,
            references: { event_id: f.event_id, variant_id: f.variant_id, property_id: f.property_id, observation_id: f.observation_id, qa_run_id: f.qa_run_id }, labels: { event: label('events', f.event_id), variant: label('variants', f.variant_id), property: label('properties', f.property_id) },
            ...(priority ? { priority: priority.priority, priority_rank: priority.priority_rank, priority_reasons: [...priority.priority_reasons] } : {}) };
        insert.run(newId(), projectId, id, f.id, f.finding_sequence, disposition, !f.event_id || !!db.prepare('SELECT id FROM events WHERE id=? AND project_id=? AND deleted_at IS NULL').get(f.event_id, projectId) ? 1 : 0, JSON.stringify(recorded));
    }
    return { id, report_sequence: sequence, completed_at: completed, snapshot_version: 1, scope, summary: capturedSummary };
}
