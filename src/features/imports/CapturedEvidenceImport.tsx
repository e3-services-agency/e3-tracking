import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
import {AssetLinksImport} from './AssetLinksImport';
import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { Button } from '@/src/components/ui/Button';

async function response(res: Response) { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Request failed'); return data; }
export function CapturedEvidenceImport({ projectId }: { projectId: string }) {
  const [file,setFile] = useState<File|null>(null), [source,setSource] = useState(''), [preview,setPreview] = useState<any>(null);
  const [imports,setImports] = useState<any[]>([]), [selected,setSelected] = useState(''), [checks,setChecks] = useState<any>(null);
  const [error,setError] = useState(''), [busy,setBusy] = useState(false), [done,setDone] = useState(''), [query,setQuery] = useState(''), [page,setPage] = useState(0), [checkCategory,setCheckCategory] = useState('all');
  const base = `${API_BASE}/api/projects/${projectId}/captured-evidence`;
  async function reload() {
    const [saved,qa] = await Promise.all([fetchWithAuth(base).then(response),fetchWithAuth(base+'/checks').then(response)]);
    setImports(saved);setChecks(qa);return saved;
  }
  useEffect(() => {
    let cancelled=false;
    Promise.all([fetchWithAuth(base).then(response),fetchWithAuth(base+'/checks').then(response)]).then(([saved,qa])=>{if(cancelled)return;setImports(saved);setChecks(qa);setSelected(saved[0]?.id ?? '');setSource(saved.find((x:any)=>x.kind==='project_snapshot')?.source_project_id ?? '');}).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;};
  },[base]);
  async function submit(apply: boolean) {
    if (!file) return;setError('');setDone('');setBusy(true);
    try {
      const body = new FormData();body.append('file',file);body.append('source_project_id',source);
      if(apply)body.append('payload_hash',preview.payload_hash);
      const result=await fetchWithAuth(base+(apply?'/apply':'/preview'),{method:'POST',body}).then(response);
      if(apply){setDone(result.duplicate?'Already imported; no duplicate created.':'Evidence imported. Expected definitions and event observations are unchanged.');setPreview(null);await reload();setSelected(result.id);setPage(0);}else setPreview(result);
    } catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const evidence=imports.find(x=>x.id===selected), allRows=evidence ? [...evidence.assets.map((a:any)=>({category:a.type,name:a.name,detail:JSON.stringify(a.status),source:a.source_url,triggers:a.triggers})),...evidence.rows.map((r:any)=>({category:r.scope,name:r.property,detail:JSON.stringify({type:r.declared_type,read:r.read,truncated:r.truncated,read_at:r.read_at,total:r.total,null_buckets:r.null_bucket_count,value_types:r.value_types,values:r.safe_values}),source:null}))] : [];
  const filtered=allRows.filter(r=>(r.category+' '+r.name+' '+r.detail).toLowerCase().includes(query.toLowerCase()));
  const rank:Record<string,number>={filter:0,read:1,representation:2,coverage:3,null:4,empty:5,truncated:6};
  const names:Record<string,string>={filter:'Scenario filters not seen in capture',read:'Failed property reads',representation:'JSON representations to review',coverage:'Source coverage gaps',null:'Ambiguous exporter null buckets',empty:'Always-null reports',truncated:'Truncated distributions (coverage information)'};
  const groups=Object.entries((checks?.checks ?? []).reduce((acc:Record<string,number>,c:any)=>{const k=c.id.split(':')[0];acc[k]=(acc[k]??0)+1;return acc;},{})).sort(([a],[b])=>(rank[a]??9)-(rank[b]??9));
  const issues=(checks?.checks ?? []).filter((c:any)=>(checkCategory==='all'||c.id.startsWith(checkCategory+':'))&&(c.subject+' '+c.message).toLowerCase().includes(query.toLowerCase())).sort((a:any,b:any)=>(rank[a.id.split(':')[0]]??9)-(rank[b.id.split(':')[0]]??9));
  return <section className="bg-white rounded-lg border shadow-sm p-4 space-y-4" data-testid="captured-evidence-import">
    <h2 className="text-base font-semibold text-gray-900">Project snapshot and value scans</h2>
    <p className="text-sm text-gray-600">Import the project snapshot ZIP first, then event-values and customer-property-values JSON. Browse captured configuration and run evidence checks without changing the expected tracking plan.</p>
    <FieldLabel className="block text-sm">Source Bloomreach project UUID
      <input aria-label="Source Bloomreach project UUID" className="block border rounded p-2 w-full" disabled={busy} value={source} onChange={e=>{setSource(e.target.value);setPreview(null);}} placeholder="Confirm the source project before importing" />
    </FieldLabel>
    <input aria-label="Project snapshot or values export" type="file" accept=".zip,.json" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setDone('');}} />
    <Button disabled={busy||!file||!source} onClick={()=>submit(false)}>Preview captured evidence</Button>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {preview&&<div className="border rounded p-3 space-y-2" data-testid="captured-evidence-preview">
      <p><strong>{preview.kind}</strong> · source {preview.source_project_id}</p>
      <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(preview.facts,null,2)}</pre>
      <p className="text-sm">{preview.duplicate_run_id?'Already imported; applying creates no duplicate.':'Proposed change: add one evidence record. No expected definitions, approvals, certification or event observations are changed.'}</p>
      <p className="text-xs break-all">SHA-256: {preview.source_sha256}</p>
      <Button disabled={busy} onClick={()=>submit(true)}>Confirm evidence import</Button>
    </div>}
    {done&&<p role="status" className="text-sm text-green-700">{done}</p>}
    <h3 className="font-semibold">Imported evidence ({imports.length})</h3>
    <select aria-label="Imported captured evidence" className="border rounded p-2 w-full" value={selected} onChange={e=>{setSelected(e.target.value);setPage(0);}}>
      <option value="">Select an import</option>{imports.map(x=><option value={x.id} key={x.id}>{x.kind} · {x.filename} · {x.source_sha256.slice(0,12)}</option>)}
    </select>
    <input aria-label="Search captured evidence" className="border rounded p-2 w-full" placeholder="Search assets, events, properties or checks" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} />
    {evidence&&<><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(Object.fromEntries(Object.entries(evidence.facts).filter(([k])=>k!=='coverage')),null,2)}</pre>{evidence.facts.coverage&&<details><summary>Capture coverage by asset type ({evidence.facts.coverage.length})</summary><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(evidence.facts.coverage,null,2)}</pre></details>}<div className="overflow-x-auto"><table className="text-sm w-full"><thead><tr><HintTh className="text-left p-2">Type / scope</HintTh><HintTh className="text-left p-2">Asset / property</HintTh><HintTh className="text-left p-2">Captured evidence</HintTh></tr></thead><tbody>{filtered.slice(page*50,page*50+50).map((r,i)=><tr key={i} className="border-t"><td className="p-2 align-top">{r.category}</td><td className="p-2 align-top">{r.source?<a className="underline" href={r.source} target="_blank" rel="noreferrer">{r.name}</a>:r.name}</td><td className="p-2 max-w-lg break-words"><pre className="text-xs whitespace-pre-wrap">{r.detail}</pre>{r.triggers?.length>0&&<details><summary>Scenario triggers</summary><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(r.triggers,null,2)}</pre></details>}</td></tr>)}</tbody></table></div><div className="flex gap-3 items-center"><Button variant="outline" disabled={!page} onClick={()=>setPage(page-1)}>Previous evidence page</Button><span>{Math.min(page*50+1,filtered.length)}–{Math.min(page*50+50,filtered.length)} / {filtered.length}</span><Button variant="outline" disabled={(page+1)*50>=filtered.length} onClick={()=>setPage(page+1)}>Next evidence page</Button></div></>}
    <div className="flex gap-3 items-center"><h3 className="font-semibold">Captured-evidence QA — grouped checks</h3><Button variant="outline" disabled={busy} onClick={()=>reload().catch(e=>setError(e.message))}>Re-run evidence checks</Button></div>
    <p className="text-sm text-gray-600">Checks use the latest imported snapshot and scans. They retain source coverage and do not infer joined event payloads from aggregate distributions. Earlier imports remain available for review. Raw personal values are withheld.</p>
    <p className="text-sm">{groups.length} check categories. Counts below are affected source records, not independent business defects.</p>
    <table className="text-sm w-full"><thead><tr><HintTh className="text-left p-2">Check category</HintTh><HintTh className="text-left p-2">Affected records</HintTh></tr></thead><tbody>{groups.map(([kind,count])=><tr key={kind} className="border-t"><td className="p-2">{names[kind]??kind}</td><td className="p-2">{String(count)}</td></tr>)}</tbody></table>
    <FieldLabel hint="Review category" className="block text-sm">Review category <select aria-label="Captured QA check category" className="border rounded p-2" value={checkCategory} onChange={e=>setCheckCategory(e.target.value)}><option value="all">All categories</option>{groups.map(([kind])=><option key={kind} value={kind}>{names[kind]??kind}</option>)}</select></FieldLabel>
    <details><summary>Review checks and proposed actions ({issues.length})</summary><div className="overflow-x-auto"><table className="text-sm w-full"><thead><tr><HintTh className="text-left p-2">Subject</HintTh><HintTh className="text-left p-2">Finding</HintTh><HintTh className="text-left p-2">Proposed action</HintTh></tr></thead><tbody>{issues.slice(0,200).map((c:any)=><tr key={c.import_id+c.id} className="border-t"><td className="p-2 align-top">{c.subject}<div className="text-xs text-gray-500">{c.severity} · {c.source}</div></td><td className="p-2 align-top">{c.message}</td><td className="p-2 align-top">{c.action}</td></tr>)}</tbody></table></div>{issues.length>200&&<p className="text-sm">Showing 200 of {issues.length}. Search by event/property to narrow the results.</p>}</details>
    <AssetLinksImport projectId={projectId}/>
  </section>;
}
