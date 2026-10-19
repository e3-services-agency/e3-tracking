import React,{useEffect,useState,useCallback} from 'react';
import {API_BASE} from '@/src/config/env';
import {fetchWithAuth} from '@/src/lib/api';
import {CONFIGURATION_LABELS,type UseCaseImplementation} from '@/src/domain/assetLinks';
export function useImplementation(projectId:string|null){
  const [revision,setRevision]=useState(0);const reload=useCallback(()=>setRevision(v=>v+1),[]);
  const [state,setState]=useState<{project:string|null;rows?:Record<string,UseCaseImplementation>;error?:string}>({project:null});
  useEffect(()=>{if(!projectId)return;let live=true;setState({project:projectId});
    fetchWithAuth(`${API_BASE}/api/projects/${projectId}/captured-evidence/implementation`).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error??'Configuration unavailable');if(live)setState({project:projectId,rows:Object.fromEntries(data.use_cases.map((u:UseCaseImplementation)=>[u.use_case_id,u]))});}).catch(e=>{if(live)setState({project:projectId,error:e.message});});
    return()=>{live=false;};
  },[projectId,revision]);return {...(state.project===projectId?state:{project:projectId}),reload};
}
export function ConfigurationCell({row}:{row?:UseCaseImplementation}){
  if(!row)return <>Configuration unavailable</>;
  const next=row.assets.length&&!row.assets.some(a=>a.relation==='implements')?'Confirm this asset’s implementation role.':row.state==='active'?'Validate trigger, payload and message output.':row.state==='draft'?'Finish configuration and review release readiness.':row.state==='unlinked'?'Review retained evidence for a matching asset.':'Review mapping and capture freshness.';
  return <div className="text-sm"><strong>{row.assets.some(a=>a.missing_in_latest)?'Last known: ':''}{row.assets.length&&!row.assets.some(a=>a.relation==='implements')?'Implementation role unresolved':CONFIGURATION_LABELS[row.state]}</strong><p className="text-xs">Next: {next}</p>{row.assets.length>0&&<p className="text-xs">Full UC coverage unverified.</p>}
    {row.assets.map(a=><div key={a.link_id} className="mt-1 text-xs"><span>{a.source_url?<a className="underline" href={a.source_url} target="_blank" rel="noreferrer" onClick={event=>event.stopPropagation()}>{a.name}</a>:a.name} · captured {a.state.replaceAll('_',' ')}</span><br/>{a.captured_at??'No dated capture'}{a.partial?' · partial snapshot':''}{a.missing_in_latest?<p>Last known evidence; missing from latest capture. No deactivation inferred.</p>:null}{a.undated_capture?<p>Undated capture excluded; freshness uncertain.</p>:null}{a.conflict?<p>Conflicting evidence at the same capture time; review required.</p>:null}{a.restored?<p>Historical link; fresh mapping review required.</p>:null}</div>)}
    {(row.asset_pointers??[]).map(a=><p key={a.id} className="mt-1 text-xs">Unverified asset pointer: {a.label??a.asset_id} · {a.asset_type} · {a.environment} · {a.role}. Existence and operation have not been verified.</p>)}
  </div>;
}
export function QaEvidenceCell({row}:{row?:UseCaseImplementation}){return <div className="text-sm">{row?`${row.requirements_with_observations}/${row.total_requirements} requirements with observed data`:'QA evidence unavailable'}<p className="text-xs">Delivery QA unverified by configuration.</p></div>;}
export function UseCaseImplementationDetail({projectId,useCaseId}:{projectId:string;useCaseId:string}){
  const data=useImplementation(projectId),row=data.rows?.[useCaseId];
  return <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">Mapped configuration and QA evidence</h2><button type="button" className="underline text-sm" onClick={data.reload}>Refresh mapped evidence</button><p className="text-sm">Scope and lifecycle remain separate from these dated observations.</p>{data.error?<p role="alert">{data.error}</p>:!data.rows?<p>Loading mapped configuration…</p>:<><ConfigurationCell row={row}/><QaEvidenceCell row={row}/>{row?.assets.map(a=><details key={a.link_id}><summary>{a.relation}: {a.name}</summary><p>{a.asset_type}/{a.asset_id}</p><p>Raw status: {JSON.stringify(a.raw_status)}</p><p>Source SHA-256: {a.source_sha256??'Unavailable'}</p>{a.source_url&&<a className="underline" href={a.source_url} target="_blank" rel="noreferrer">Open captured asset reference</a>}</details>)}</>}</section>;
}

type ActivityCapture={kind:string;source_sha256:string;facts:{observed_at?:string;partial?:boolean};assets:{id:string;type:string;name:string;source_url?:string;status?:{status?:string;archived?:boolean}}[]};
export function ImplementationSummary({rows,projectId}:{rows:Record<string,UseCaseImplementation>;projectId:string}){
  const [activity,setActivity]=useState<ActivityCapture|null>(null),[activityError,setActivityError]=useState(false);
  useEffect(()=>{let live=true;setActivity(null);setActivityError(false);
    fetchWithAuth(`${API_BASE}/api/projects/${projectId}/captured-evidence`).then(async r=>{if(!r.ok)throw Error('Source activity unavailable');const data:ActivityCapture[]=await r.json();const snapshots=data.filter(c=>c.kind==='project_snapshot'&&Number.isFinite(Date.parse(c.facts.observed_at??''))).sort((a,b)=>Date.parse(b.facts.observed_at!)-Date.parse(a.facts.observed_at!));if(live)setActivity(snapshots[0]??null);}).catch(()=>{if(live)setActivityError(true);});
    return()=>{live=false;};
  },[projectId]);
  const campaigns=activity?.assets.filter(a=>a.type==='scenarios'&&a.status?.status==='active'&&!a.status.archived&&/^20\d{6}\s/.test(a.name))??[];
  const values=Object.values(rows),assets=[...new Map(values.flatMap(row=>row.assets).map(a=>[a.asset_type+'/'+a.asset_id,a])).values()];
  const active=assets.filter(a=>a.state==='active').length,draft=assets.filter(a=>a.state==='draft').length,pending=values.filter(row=>row.assets.length&&!row.assets.some(a=>a.relation==='implements')).length;
  return <section className="border rounded p-4 space-y-2" aria-label="Implementation overview"><h2 className="font-semibold">Implementation overview</h2><p>{active} captured active assets · {draft} captured draft assets · {pending} mapping roles to review</p><p className="text-sm">Captured configuration is shown below with its date and source. Agreed lifecycle and QA evidence remain separate; an active asset does not establish successful delivery.</p>
    {activityError?<p role="status">Additional campaign activity could not be loaded.</p>:activity&&<div className="border-t pt-2 text-sm"><strong>{campaigns.length} dated campaigns captured active — separate from lifecycle automations</strong><p>Capture: {activity.facts.observed_at}{activity.facts.partial?' · partial snapshot':''}. Dates identify campaign names; activation does not prove completed sends.</p><ul className="list-disc pl-5">{campaigns.map(a=><li key={a.id}>{a.source_url&&/^https:\/\//.test(a.source_url)?<a className="underline" href={a.source_url} target="_blank" rel="noreferrer">{a.name}</a>:a.name}</li>)}</ul></div>}
  </section>;
}
