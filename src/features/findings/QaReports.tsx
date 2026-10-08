import {kindLabel} from '@/src/domain/findingsCatalog';
import { useCommentLink } from '@/src/features/comments/useCommentLink';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/src/config/env';
import { fetchWithAuth } from '@/src/lib/api';
import { TargetCollaboration } from '@/src/features/comments/TargetCollaboration';
import type { CommentsPanelApi, CommentPanelRow } from '@/src/features/comments/CommentsPanel';
interface Report {
    id: string;
    report_sequence: number;
    completed_at: string;
    scope: {
        type: string;
        comparison_ids?: string[];
        participating_runs?: {
            id: string;
            environment?: string;
            kind?: string;
            started_at?: string;
        }[];
    };
    summary: {
        produced: number;
        resolved: number;
        recorded_counts: {
            items: number;
            produced: number;
            newly_resolved: number;
        };
    };
    items?: {
        id: string;
        finding_id: string;
        finding_sequence: number;
        disposition: string;
        recorded: {
            comparison: string;
            kind: string;
            severity: string;
            status: string;
            acknowledged: boolean;
            message: string | null;
            expected: unknown;
            actual: unknown;
            labels: {
                event: string | null;
                property: string | null;
            };
        };
        current_status: string | null;
        current_acknowledged: boolean;
    }[];
}
export function QaReports({ api, rows, onChanged, revision = 0, currentFindingIds = [] }: {
    api: CommentsPanelApi;
    rows: CommentPanelRow[];
    onChanged: () => void | Promise<void>;
    revision?: number;
    currentFindingIds?: string[];
}) {
    const commentLink = useCommentLink();
    const [reports, setReports] = useState<Report[]>([]), [selected, setSelected] = useState<Report | null>(null), [error, setError] = useState('');
    const base = api.mode === 'internal' ? `${API_BASE}/api/projects/${api.projectId}` : `${API_BASE}/api/shared/${encodeURIComponent(api.token)}`;
    const request = useCallback((url: string) => api.mode === 'internal' ? fetchWithAuth(url) : fetch(url), [api.mode]);
    useEffect(() => {
        let active = true;
        setReports([]);
        setSelected(null);
        void request(`${base}/qa-reports`).then(async (res) => {
            if (!res.ok)
                throw Error();
            const data = await res.json();
            if (active) {
                setReports(data);
                setError('');
            }
        }).catch(() => {
            if (active)
                setError('QA reports are unavailable.');
        });
        return () => { active = false; };
    }, [base, request, revision]);
    const open = async (id: string) => {
        try {
            const res = await request(`${base}/qa-reports/${id}`);
            if (!res.ok)
                throw Error();
            setSelected(await res.json());
            setError('');
        }
        catch {
            setError('QA report is unavailable.');
        }
    };
    useEffect(() => {
        if (commentLink.kind !== 'target')
            return;
        const target = commentLink.target;
        if (!rows.some(r => r.id === target.threadId && r.entity_id === target.entityId))
            return;
        if (target.entityType === 'qa_report' && reports.some(r => r.id === target.entityId)) {
            void open(target.entityId);
        }
        else if (target.entityType === 'finding' && !currentFindingIds.includes(target.entityId)) {
            void request(`${base}/findings/${target.entityId}/history`).then(async (res) => {
                if (!res.ok)
                    return;
                const data = await res.json();
                if (data.appearances?.[0]?.report_id)
                    void open(data.appearances[0].report_id);
            });
        }
    }, [commentLink, reports, base, request]);
    return <section id="qa-reports" aria-label="QA reports" className="space-y-3 min-w-0"><h2 className="text-lg font-semibold">QA reports</h2><p className="text-sm text-gray-500">Completed comparisons capture immutable results for the whole project. Report discussion and finding discussion are separate. Completing a discussion does not fix a finding or certify an event.</p>{error && <p role="alert">{error}</p>}
 <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Report</th><th>Completed</th><th>Scope</th><th>Recorded results</th><th>Actions</th></tr></thead><tbody>{reports.map(r => <tr key={r.id} className="border-t"><td><button type="button" onClick={() => void open(r.id)}>Report #{String(r.report_sequence).padStart(3, '0')}</button></td><td>{new Date(r.completed_at).toLocaleString()}</td><td>Whole project</td><td>{r.summary.recorded_counts.items} unique items / {r.summary.recorded_counts.produced} produced / {r.summary.recorded_counts.newly_resolved} newly resolved</td><td><TargetCollaboration api={api} entityType="qa_report" entityId={r.id} label={`Report #${String(r.report_sequence).padStart(3, '0')}`} rows={rows} onChanged={onChanged} forceOpen={commentLink.kind === 'target' && commentLink.target.entityId === r.id}/></td></tr>)}</tbody></table></div>{!reports.length && !error && <p>No completed reports yet. History starts with the next real comparison.</p>}
 {selected && <article className="rounded border p-3 space-y-3 [overflow-wrap:anywhere]"><div className="flex justify-between"><h3>Recorded in Report #{String(selected.report_sequence).padStart(3, '0')}</h3><button type="button" onClick={() => setSelected(null)}>Close report</button></div><p>Whole-project comparison / {new Date(selected.completed_at).toLocaleString()}</p><p>Comparisons: {selected.scope.comparison_ids?.join(', ')}</p><p>Participating QA runs: {selected.scope.participating_runs?.length ?? 0}</p>
 <p>{selected.summary.recorded_counts.items} unique recorded items / {selected.summary.recorded_counts.produced} produced / {selected.summary.recorded_counts.newly_resolved} newly resolved</p>
 {selected.items?.map(i => <section id={`finding-${i.finding_id}`} key={i.id} className="border-t pt-3 space-y-2"><h4>Finding #{String(i.finding_sequence).padStart(3, '0')} / {kindLabel(i.recorded.kind)}</h4><p>{i.recorded.labels.event ?? 'Project'}{i.recorded.labels.property ? ` / ${i.recorded.labels.property}` : ''}</p><p>{i.recorded.message}</p><p>Recorded: {i.recorded.status}{i.recorded.acknowledged ? ' (acknowledged)' : ''} / {i.recorded.severity} / {i.disposition}</p><p>Current finding status: {i.current_status ?? 'unavailable'}{i.current_acknowledged ? ' (acknowledged)' : ''}</p><details><summary>Recorded evidence</summary><p>Expected</p><pre className="whitespace-pre-wrap">{JSON.stringify(i.recorded.expected, null, 2)}</pre><p>Actual</p><pre className="whitespace-pre-wrap">{JSON.stringify(i.recorded.actual, null, 2)}</pre></details><TargetCollaboration api={api} entityType="finding" entityId={i.finding_id} label={`Finding #${String(i.finding_sequence).padStart(3, '0')}`} rows={rows} onChanged={onChanged} forceOpen={commentLink.kind === 'target' && commentLink.target.entityId === i.finding_id}/></section>)}{!selected.items?.length && <p>No produced or newly resolved findings in this report.</p>}</article>}</section>;
}
