import { FieldLabel } from '@/src/components/ui/FieldHint';
import React, { useEffect, useRef, useState } from 'react';
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { decisionRoles, decisionRoleLabels, type DecisionCard, type DecisionSeed } from '@/src/domain/decisionInbox';
import { Button } from '@/src/components/ui/Button';
import { USE_CASE_STATUSES, VARIANT_OPERATORS } from '@/src/domain/enums';

export function DecisionInbox() {
  const {activeProjectId}=useProjectShell();
  const [cards,setCards]=useState<DecisionCard[]>([]),[error,setError]=useState(''),[mode,setMode]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[filter,setFilter]=useState('current'),[role,setRole]=useState('all');
  const generation=useRef(0);
  useEffect(()=>{
    const g=++generation.current;setCards([]);setError('');setLoading(true);
    fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/decision-inbox`).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error??'Could not load decisions.');return b;})
      .then(b=>{if(g===generation.current){setCards(b.decisions);setMode(b.identity_mode);}})
      .catch(e=>{if(g===generation.current)setError(String(e.message));})
      .finally(()=>{if(g===generation.current)setLoading(false);});
    return ()=>{generation.current++;};
  },[activeProjectId]);
  async function act(card:DecisionCard,action:string,note:string,confirmed:boolean,amendment?:DecisionSeed) {
    const g=generation.current;setBusy(true);setError('');
    try {
      const r=await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/decision-inbox/${card.id}/actions`,{
        method:'POST',body:JSON.stringify({action,note,human_confirmed:confirmed,content_hash:card.content_hash,amendment}),
      });const result=await r.json();if(!r.ok)throw Error(result.error??'Decision failed.');
      if(g!==generation.current)return;
      const response=await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/decision-inbox`);
      const body=await response.json();if(!response.ok)throw Error(body.error??'Could not refresh decisions.');
      if(g===generation.current)setCards(body.decisions);
    }catch(e){if(g===generation.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(g===generation.current)setBusy(false);}
  }
  const latest=cards.filter(c=>!cards.some(d=>d.key===c.key && d.revision>c.revision));
  const filtered=filter==='history'?cards:filter==='pending'?latest.filter(c=>['proposed','deferred'].includes(c.state)):latest;
  const visible=filtered.filter(c=>role==='all'||c.payload.audiences.includes(role as typeof decisionRoles[number]));
  return <>
    <PageHeader><h1 className="text-2xl font-semibold">Decision inbox</h1>
      <p className="mt-2 text-sm text-gray-600">Review the proposal → approve and apply its E3 changes → verify the result.</p>
      <p className="mt-2 text-sm">Proposals with native changes apply them immediately in E3 and save a receipt. Documentation-only proposals retain their stated scope. QA verification remains separate.</p>
      {mode==='local' && <p className="mt-2 text-sm text-gray-600">Local pilot identity: actions record the local operator. They do not establish client sign-off or permission to change Bloomreach.</p>}
    </PageHeader>
    <PageBody className="space-y-4">
      {error && <p role="alert" className="border rounded p-3 text-[var(--color-danger)]">{error}</p>}
      {loading?<p role="status">Loading decisions…</p>:<>
        <div className="flex flex-wrap gap-3 items-center"><FieldLabel hint="Decision view">Show <select aria-label="Show decisions" className="border rounded p-2" value={filter} onChange={e=>setFilter(e.target.value)}><option value="current">Current revisions</option><option value="pending">Needs decision</option><option value="history">All revisions</option></select></FieldLabel><FieldLabel hint="Decision role view">For <select aria-label="Role view" className="border rounded p-2" value={role} onChange={e=>setRole(e.target.value)}><option value="all">All roles</option>{decisionRoles.map(r=><option key={r} value={r}>{decisionRoleLabels[r]}</option>)}</select></FieldLabel><span>{latest.filter(c=>['proposed','deferred'].includes(c.state)).length} awaiting review · {latest.filter(c=>c.state==='documented'&&!c.history.some(h=>h.action==='approve_and_apply')).length} documented · {latest.filter(c=>c.history.some(h=>h.action==='approve_and_apply')).length} applied</span></div>
        {!visible.length && !error && <p>No decisions in this view.</p>}
        {visible.map(c=><DecisionItem key={c.id} card={c} busy={busy} act={act}/>)}
      </>}
    </PageBody>
  </>;
}
export function DecisionItem({card:c,busy,act}:{card:DecisionCard;busy:boolean;act:(c:DecisionCard,a:string,n:string,h:boolean,s?:DecisionSeed)=>Promise<void>}) {
  const [note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[editing,setEditing]=useState(false);
  const seed=():DecisionSeed=>{const {project_id:_,revision:__,baselines:___,native_baselines:____,...s}=c.payload;return s;};
  const [draft,setDraft]=useState(seed);
  useEffect(()=>{setConfirmed(false);setEditing(false);setDraft(seed());},[c.id,c.state]);
  const open=['proposed','deferred'].includes(c.state)&&!c.restored;
  const requested=c.history.some(e=>e.action==='request_execution_plan');
  const hasNative=!!c.payload.native_changes?.length;
  const applied=c.history.find(e=>e.action==='approve_and_apply');
  const targetName=(id:string)=>c.native_targets?.find(t=>t.id===id)?.name??id;
  const results=Array.isArray(applied?.detail.native_results)?applied.detail.native_results as {op:string;action:string;entity_id:string;entity_name:string;before?:string|null;after?:string|null}[]:[];
  return <article id={`decision-${c.key}`} className="border rounded-lg bg-white p-5 space-y-3">
    <span id={`decision-record-${c.id}`}/><div className="flex flex-wrap items-center gap-3 text-sm"><strong>{c.key} · revision {c.revision}</strong>
      <span>Evidence confidence: <strong>{c.payload.confidence.toUpperCase()}</strong></span>
      <span>{c.restored?'Restored history':applied?'E3 changes applied · QA pending':c.state==='documented'?'Documentation applied · QA pending':c.state}</span>
      {c.stale&&!c.restored&&<strong className="text-[var(--color-danger)]">{c.source_review?.requires_review?'Cited evidence changed — review the follow-up':'Reviewed E3 data changed — amend before approval'}</strong>}
    </div>
    <p className="text-sm text-gray-600">Recommended reviewer: {decisionRoleLabels[c.payload.review_role]} · Relevant to {c.payload.audiences.map(r=>decisionRoleLabels[r]).join(', ')}</p>
    {c.source_review?.tracked&&<p className="text-sm">Cited-source check: {c.source_review.source_count} source group · {c.source_review.checked_at}. {c.source_review.requires_review?'Previous approval retained as history; planning from this evidence is blocked.':'Selected cited content matches its recorded baseline.'} {c.source_review.partial_captures>0?'Incomplete captures are retained without replacing complete evidence.':''}</p>}
    {c.source_review?.requires_review&&<p className="text-sm">Review the linked source update before relying on this planning basis.</p>}
    {c.source_review?.followup_ids.map((id,i)=><p key={id} className="text-sm"><a className="underline" href={`#decision-record-${id}`}>Review source update {i+1}</a></p>)}
    <h2 className="text-lg font-semibold">{c.payload.summary}</h2>
    <p className="text-sm text-gray-600">{c.payload.impact}</p>
    {hasNative&&<section className="border rounded p-3 space-y-2" aria-label="Native E3 changes">
      <h3 className="font-semibold">{applied?'Approved E3 changes':'E3 changes applied when you approve'}</h3>
      <ol className="list-decimal pl-5">{c.payload.native_changes!.map((change,i)=><li key={i}>{change.op==='use_case_status'
        ? <>Set {targetName(change.use_case_id)} status: <strong>{change.from??'Unset'}</strong> → <strong>{change.to??'Unset'}</strong>.</>
        : <>Create variant on <strong>{targetName(change.event_id)}</strong>: {change.conditions.map(x=>`${targetName(x.property_id)} ${x.operator==='equals'?'=':'in'} ${x.values.join(' / ')}`).join(' AND ')}{change.description&&<p>{change.description}</p>}</>}</li>)}</ol>
      <p className="text-sm">These changes are saved together with the documentation. If any change fails validation, none is applied.</p>
    </section>}
    {applied&&<section className="border rounded p-3 space-y-2" aria-label="Execution receipt">
      <h3 className="font-semibold">Execution receipt</h3><p>{applied.created_at} · {applied.actor}</p>
      <ul className="list-disc pl-5">{results.map((result,i)=><li key={i}>{result.entity_name}: {result.op==='use_case_status'?`${result.before??'Unset'} → ${result.after??'Unset'}`:result.action==='created'?'Created':'Already present'} <span className="text-xs text-gray-500">({result.entity_id})</span></li>)}</ul>
      <p className="text-sm">Saved in E3. This receipt does not claim successful tracking or campaign delivery.</p>
    </section>}
    <details><summary className="cursor-pointer font-medium">Review evidence, exact changes and next steps</summary>
      <div className="mt-3 space-y-4 text-sm">
        <section><h3 className="font-semibold">Why this recommendation</h3><p className="whitespace-pre-wrap">{c.payload.rationale}</p><p className="mt-2">Alternative: {c.payload.alternatives}</p></section>
        <section><h3 className="font-semibold">Sources</h3><ul className="list-disc pl-5 space-y-2">{c.payload.evidence.map((s,i)=><li key={i}><a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a><p>{s.claim}</p><p className="text-gray-500">Captured {s.captured_at} · SHA-256 {s.source_hash.slice(0,12)}…</p></li>)}</ul><p className="mt-2 text-gray-600">These are captured sources. A newer source requires a new review; this inbox does not poll the live tools.</p></section>
        {c.payload.patches.map(p=>{const d=c.documents.find(x=>x.use_case_id===p.use_case_id);return <section key={p.use_case_id} className="border rounded p-3 space-y-2"><h3 className="font-semibold">{d?`${d.code}: ${d.name}`:p.use_case_id}</h3>
          <details><summary>Current saved notes</summary><pre className="whitespace-pre-wrap break-words mt-2">{d?.current_notes??'Unavailable in restored history.'}</pre></details>
          <h4 className="font-semibold">Exact text to append to use-case notes</h4><p className="whitespace-pre-wrap">{p.append_notes}</p>
          <h4 className="font-semibold">Data requirements to add</h4>{p.add_requirements.length?<ul className="list-disc pl-5">{p.add_requirements.map((r,i)=><li key={i}>{r.level} · {r.note}<details><summary>Native target IDs</summary><pre className="whitespace-pre-wrap">{JSON.stringify(r,null,2)}</pre></details></li>)}</ul>:<p>None. Existing requirement rows remain unchanged.</p>}
        </section>;})}
        <section><h3 className="font-semibold">Remaining implementation and verification</h3><p className="whitespace-pre-wrap">{c.payload.execution_plan}</p><p className="mt-2 font-medium">{hasNative?'The listed E3 changes apply directly on approval. External implementation and QA follow the remaining plan.':requested?'Plan requested and recorded; execution still requires separate approval.':'Requesting this plan records a planning request; it does not run it.'}</p></section>
        <section><h3 className="font-semibold">Decision record</h3><p className="break-all">Revision hash: {c.content_hash}</p><ul>{c.history.map(h=><li key={h.id}>{h.created_at} · {h.action.replaceAll('_',' ')} · {h.actor}{typeof h.detail.note==='string'&&h.detail.note?` — ${h.detail.note}`:''}</li>)}</ul></section>
      </div>
    </details>
    {editing&&<div className="border rounded p-3 space-y-3"><p>Saving creates an unapproved revision. Previous wording and decisions stay in history.</p>
      <FieldLabel hint="Decision recommendation" className="block">One-sentence recommendation<input className="block border rounded p-2 w-full" value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})}/></FieldLabel>
      {draft.patches.map((p,i)=><FieldLabel hint="Decision notes" className="block" key={p.use_case_id}>Proposed use-case notes ({c.documents.find(d=>d.use_case_id===p.use_case_id)?.code})<textarea rows={8} className="block border rounded p-2 w-full" value={p.append_notes} onChange={e=>setDraft({...draft,patches:draft.patches.map((x,j)=>j===i?{...x,append_notes:e.target.value}:x)})}/></FieldLabel>)}
      {draft.native_changes?.map((change,i)=><fieldset key={i} className="border rounded p-3 space-y-2"><legend className="font-semibold">E3 change {i+1}: {change.op==='use_case_status'?targetName(change.use_case_id):targetName(change.event_id)}</legend>
        {change.op==='use_case_status'?<div className="flex flex-wrap gap-3">{(['from','to'] as const).map(field=><FieldLabel hint="Decision status transition" key={field}>{field==='from'?'Current status expected':'New status'}<select aria-label={`${field==='from'?'Expected current':'New'} status for change ${i+1}`} className="block border rounded p-2" value={change[field]??''} onChange={e=>setDraft({...draft,native_changes:draft.native_changes!.map((x,j)=>j===i?{...change,[field]:e.target.value||null}:x)})}><option value="">Unset</option>{USE_CASE_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}</select></FieldLabel>)}</div>
          :<>{change.conditions.map((condition,k)=><div key={k} className="space-y-2"><p>{targetName(condition.property_id)}</p><FieldLabel hint="Decision variant condition">Match<select aria-label={`Operator for change ${i+1} condition ${k+1}`} className="block border rounded p-2" value={condition.operator} onChange={e=>setDraft({...draft,native_changes:draft.native_changes!.map((x,j)=>j===i?{...change,conditions:change.conditions.map((c,n)=>n===k?{...c,operator:e.target.value as typeof c.operator}:c)}:x)})}>{VARIANT_OPERATORS.map(op=><option key={op} value={op}>{op==='equals'?'Equals':'Any of'}</option>)}</select></FieldLabel><FieldLabel hint="Decision variant condition">Allowed values, one per line<textarea aria-label={`Values for change ${i+1} condition ${k+1}`} className="block border rounded p-2 w-full" rows={2} value={condition.values.join('\n')} onChange={e=>setDraft({...draft,native_changes:draft.native_changes!.map((x,j)=>j===i?{...change,conditions:change.conditions.map((c,n)=>n===k?{...c,values:e.target.value.split('\n')}:c)}:x)})}/></FieldLabel></div>)}</>}
        <Button variant="secondary" disabled={busy} onClick={()=>setDraft({...draft,native_changes:draft.native_changes!.length===1?undefined:draft.native_changes!.filter((_,j)=>j!==i)})}>Remove this change</Button>
      </fieldset>)}
      <Button disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'amend',note,confirmed,draft)}>Save new revision</Button> <Button variant="secondary" onClick={()=>setEditing(false)}>Cancel amendment</Button>
    </div>}
    {(open||c.state==='documented')&&!c.restored&&<div className="space-y-2 border-t pt-3">
      <FieldLabel hint="Decision review reason" className="block text-sm">Review note <input className="border rounded p-2 w-full mt-1" value={note} onChange={e=>setNote(e.target.value)} placeholder="Required for amend, defer or reject"/></FieldLabel>
      <FieldLabel hint="Decision confirmation" className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{editing?'I reviewed this amendment. Saving creates a revision that needs a fresh approval.':hasNative&&open?'I reviewed the exact E3 changes and approve applying them with the documentation.':'I reviewed this revision. This action applies to documentation or planning only.'}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {open&&<><Button disabled={busy||!confirmed||c.stale||editing} onClick={()=>act(c,hasNative?'approve_and_apply':'approve_documentation',note,confirmed)}>{hasNative?'Approve and apply':'Approve documentation'}</Button>
          <Button variant="secondary" disabled={busy} onClick={()=>setEditing(true)}>Amend</Button>
          <Button variant="secondary" disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'defer',note,confirmed)}>Defer</Button>
          <Button variant="secondary" disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'reject',note,confirmed)}>Reject</Button></>}
        {c.state==='documented'&&<Button disabled={busy||!confirmed||requested||c.stale} onClick={()=>act(c,'request_execution_plan',note,confirmed)}>{requested?'Execution plan requested':'Request execution plan'}</Button>}
      </div>
    </div>}
    <p className="text-xs text-gray-500">No campaign, external task or company-library change is executed here. No use case is marked certified by this decision.</p>
  </article>;
}
