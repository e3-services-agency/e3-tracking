import { getQaReport, listQaReports, findingAppearances } from '../dal/qa-report.dal';
import { getFindingById } from '../dal/finding.dal';
import { getDb } from '../db';
import { NotFoundError } from '../errors';
/** Explicit, read-only public report projection; never spread database rows. */
function publicEvidence(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(publicEvidence);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('internal_')).map(([key, item]) => [key, publicEvidence(item)]));
    return value;
}
function pick(value: unknown, keys: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(keys.filter(key => key in obj).map(key => [key, obj[key]]));
}
function scalarFields(value: unknown, keys: string[]): Record<string, unknown> { return Object.fromEntries(Object.entries(pick(value, keys)).map(([key, v]) => [key, v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) ? v : null])); }
interface VisibleItem {
    disposition: string;
    recorded: Record<string, unknown>;
}
/** Counts describe the recorded visible items, never hidden findings or mutable current totals. */
function visibleSummary(items: VisibleItem[]) {
    const open = { error: 0, warning: 0, info: 0 };
    const by_comparison: Record<string, {
        produced: number;
        resolved: number;
        open: typeof open;
    }> = {};
    const allowed = ['definition_vs_observations', 'data_manager', 'definition_vs_mapping', 'catalogs', 'mapping_vs_observations'];
    for (const item of items) {
        const comparison = item.recorded.comparison;
        const severity = item.recorded.severity;
        const counts = typeof comparison === 'string' && allowed.includes(comparison) ? (by_comparison[comparison] ??= { produced: 0, resolved: 0, open: { error: 0, warning: 0, info: 0 } }) : null;
        if (counts) {
            if (item.disposition === 'produced')
                counts.produced++;
            if (item.disposition === 'resolved')
                counts.resolved++;
        }
        if (item.recorded.status === 'open' && (severity === 'error' || severity === 'warning' || severity === 'info')) {
            open[severity]++;
            if (counts)
                counts.open[severity]++;
        }
    }
    const produced = items.filter(i => i.disposition === 'produced').length, resolved = items.filter(i => i.disposition === 'resolved').length;
    return { produced, resolved, open, by_comparison, recorded_counts: { items: items.length, produced, newly_resolved: resolved } };
}
export function publicReport(projectId: string, id: string) {
    const r = getQaReport(projectId, id);
    if (r.scope.type === 'historical_file_validation') throw new NotFoundError('Report not found.');
    const visible = new Set((getDb().prepare('SELECT id FROM qa_report_findings WHERE project_id=? AND report_id=? AND public_visible=1').all(projectId, id) as {
        id: string;
    }[]).map(i => i.id));
    const items = r.items.filter(i => visible.has(i.id)).map(i => { const recorded = scalarFields(i.recorded, ['comparison', 'kind', 'severity', 'status', 'acknowledged', 'first_seen_at', 'last_seen_at', 'resolved_at', 'message', 'priority', 'priority_rank']); if (Array.isArray(i.recorded.priority_reasons)) recorded.priority_reasons = i.recorded.priority_reasons.filter((v): v is string => typeof v === 'string'); recorded.expected = publicEvidence(i.recorded.expected); recorded.actual = publicEvidence(i.recorded.actual); recorded.references = scalarFields(i.recorded.references, ['event_id', 'variant_id', 'property_id', 'observation_id', 'qa_run_id']); recorded.labels = scalarFields(i.recorded.labels, ['event', 'variant', 'property']); return { id: i.id, finding_id: i.finding_id, finding_sequence: i.finding_sequence, disposition: i.disposition, recorded, current_status: i.current_status, current_acknowledged: i.current_acknowledged }; });
    return { id: r.id, report_sequence: r.report_sequence, completed_at: r.completed_at, snapshot_version: r.snapshot_version, scope: { type: 'whole_project', comparison_ids: Array.isArray(r.scope.comparison_ids) ? r.scope.comparison_ids.filter(v => typeof v === 'string' && ['definition_vs_observations', 'data_manager', 'definition_vs_mapping', 'catalogs', 'mapping_vs_observations'].includes(v)) : [], participating_runs: Array.isArray(r.scope.participating_runs) ? r.scope.participating_runs.map(run => scalarFields(run, ['id', 'environment', 'kind', 'started_at'])) : [] }, summary: visibleSummary(items), items };
}
export function publicReportList(projectId: string) {
    const grouped = new Map<string, VisibleItem[]>();
    const rows = getDb().prepare('SELECT report_id,disposition,snapshot_json FROM qa_report_findings WHERE project_id=? AND public_visible=1').all(projectId) as {
        report_id: string;
        disposition: string;
        snapshot_json: string;
    }[];
    for (const row of rows) {
        const recorded = JSON.parse(row.snapshot_json) as Record<string, unknown>;
        const list = grouped.get(row.report_id) ?? [];
        list.push({ disposition: row.disposition, recorded });
        grouped.set(row.report_id, list);
    }
    return listQaReports(projectId).filter(r => r.scope.type !== 'historical_file_validation').map(r => ({ id: r.id, report_sequence: r.report_sequence, completed_at: r.completed_at, snapshot_version: r.snapshot_version, scope: { type: 'whole_project' }, summary: visibleSummary(grouped.get(r.id) ?? []) }));
}
export function publicFindingHistory(projectId: string, id: string, publicOnly = true) {
    const appearances = findingAppearances(projectId, id, publicOnly);
    const current = getFindingById(projectId, id);
    if (!current && !appearances.length)
        throw new NotFoundError('Finding not found.');
    return { current_status: current?.status ?? null, current_acknowledged: current?.resolved_by === 'user', appearances };
}
