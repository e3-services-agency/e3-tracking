import { createPortal } from 'react-dom';
import { Sheet } from '@/src/components/ui/Sheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { API_BASE } from '@/src/config/env';
import { fetchWithAuth } from '@/src/lib/api';
import type { CommentEntityType } from '@/src/domain/enums';
import { CommentsPanel, type CommentPanelRow, type CommentsPanelApi } from './CommentsPanel';
import { CommentCountButton } from './CommentCountButton';
import { HistorySection } from '@/src/features/history/HistorySection';
export function useProjectComments(projectId: string) {
 const [rows,setRows] = useState<CommentPanelRow[]>([]);
 const currentProject = useRef(projectId); currentProject.current = projectId;
 const reload = useCallback(async () => { if (!projectId) { setRows([]); return; } try { const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/comments`); if (res.ok) { const data = await res.json(); if (currentProject.current === projectId) setRows(data); } } catch { /* Keep existing same-project discussions on transient errors. */ } },[projectId]);
 useEffect(() => { setRows([]); void reload(); },[reload]); return {rows,reload};
}
function SharedHistory({token,entityType,entityId}: {token:string;entityType:string;entityId:string}) {
 const [rows,setRows] = useState<{id:string;changed_at:string;actor:string;action:string;diff_json:{field:string;before:unknown;after:unknown}[]}[]>([]);
 const [cursor,setCursor] = useState<string | null>(null); const [error,setError] = useState(''); const [loading,setLoading] = useState(true);
 const load = useCallback(async (before?:string) => { setLoading(true); try { const params = new URLSearchParams({entity_type:entityType,entity_id:entityId}); if (before) params.set('before',before); const res = await fetch(`${API_BASE}/api/shared/${encodeURIComponent(token)}/history?${params}`); if (!res.ok) throw new Error('History is unavailable.'); const data = await res.json(); setRows((old) => before ? [...old,...data.rows] : data.rows); setCursor(data.next_cursor); setError(''); } catch { setError('History is unavailable.'); } finally { setLoading(false); } },[token,entityType,entityId]);
 useEffect(() => { setRows([]); void load(); },[load]);
 return <section aria-label="History" className="space-y-2 text-xs"><h4 className="font-semibold">History</h4>{error && <p role="alert">{error}</p>}{rows.map((r) => <div key={r.id} className="border-t pt-2"><p>{new Date(r.changed_at).toLocaleString()} / {r.actor} / {r.action}</p>{r.diff_json.map((d) => <p key={d.field} className="whitespace-pre-wrap [overflow-wrap:anywhere]"><strong>{d.field}</strong>: {JSON.stringify(d.before)} to {JSON.stringify(d.after)}</p>)}</div>)}{!loading && !rows.length && !error && <p>No public changes.</p>}{cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>Load older changes</button>}</section>;
}
function FindingHistory({api,entityId}: {api:CommentsPanelApi;entityId:string}) {
 const [data,setData]=useState<{current_status:string|null;current_acknowledged:boolean;appearances:{report_id:string;report_sequence:number;completed_at:string;disposition:string}[]}|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;const url=api.mode==='internal'?`${API_BASE}/api/projects/${api.projectId}/findings/${entityId}/history`:`${API_BASE}/api/shared/${encodeURIComponent(api.token)}/findings/${entityId}/history`;
 void (api.mode==='internal'?fetchWithAuth(url):fetch(url)).then(async res=>{if(!res.ok)throw Error();const json=await res.json();if(active)setData(json);}).catch(()=>{if(active)setError('Finding history is unavailable.');});return()=>{active=false;};},[api.mode,api.mode==='internal'?api.projectId:api.token,entityId]);
 return <section aria-label="Finding history"><h4>Finding history</h4>{error&&<p role="alert">{error}</p>}{data&&<><p>Current finding status: {data.current_status??'unavailable'}{data.current_acknowledged?' (acknowledged)':''}</p><p>History begins with recorded QA reports. Earlier transitions were not recorded.</p>{data.appearances.map(r=><p key={r.report_id}>Recorded in Report #{String(r.report_sequence).padStart(3,'0')} / {r.disposition} / {new Date(r.completed_at).toLocaleString()}</p>)}</>}</section>;
}

export function TargetCollaboration({api,entityType,entityId,label,rows,onChanged,forceOpen=false}: {api:CommentsPanelApi;entityType:CommentEntityType;entityId:string;label:string;rows:CommentPanelRow[];onChanged:()=>void | Promise<void>;forceOpen?:boolean}) {
 const [commentsOpen,setCommentsOpen] = useState(forceOpen); const [historyOpen,setHistoryOpen] = useState(false);
 useEffect(() => { if (forceOpen) setCommentsOpen(true); },[forceOpen]);
 const targetRows = rows.filter((r) => r.entity_type === entityType && r.entity_id === entityId);
 return <div onClick={(event) => event.stopPropagation()} className="space-y-2"><div className="flex flex-wrap items-center gap-1"><CommentCountButton count={targetRows.length} open={commentsOpen} label={label} onClick={() => setCommentsOpen((v) => !v)} /><button type="button" aria-label={`History of ${label}`} aria-expanded={historyOpen} title="Version history" onClick={() => setHistoryOpen((v) => !v)} className="rounded p-1 hover:bg-gray-100"><History size={14} /></button></div>{(commentsOpen || historyOpen) && createPortal(<Sheet isOpen onClose={() => { setCommentsOpen(false); setHistoryOpen(false); }} title={`${historyOpen ? 'History' : 'Comments'}: ${label}`} className="w-full sm:w-[640px]">{commentsOpen && <CommentsPanel api={api} entityType={entityType} entityId={entityId} rows={targetRows} onChanged={onChanged} />}{historyOpen && (entityType==='finding' ? <FindingHistory api={api} entityId={entityId} /> : entityType==='qa_report' ? <p>This completed report is immutable. Discussion does not change recorded results.</p> : api.mode === 'internal' ? <HistorySection projectId={api.projectId} entityType={entityType} entityId={entityId} parentEntityId={entityType === 'catalog' ? entityId : undefined} /> : <SharedHistory token={api.token} entityType={entityType} entityId={entityId} />)}</Sheet>,document.body)}</div>;
}
