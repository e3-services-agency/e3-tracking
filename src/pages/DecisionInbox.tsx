import { FieldLabel } from '@/src/components/ui/FieldHint';
import React, { useEffect, useRef, useState } from 'react';
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { decisionRoles, decisionRoleLabels, type DecisionCard, type DecisionSeed } from '@/src/domain/decisionInbox';
import { Button } from '@/src/components/ui/Button';

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
      <p className="mt-2 text-sm text-gray-600">Evidence → human decision → documentation → separate execution plan → QA verification.</p>
      <p className="mt-2 text-sm">Approve documentation applies only the exact notes and data requirements shown below. Execution and QA remain separate.</p>
      {mode==='local' && <p className="mt-2 text-sm text-gray-600">Local pilot identity: actions record the local operator. They do not establish client sign-off or permission to change Bloomreach.</p>}
    </PageHeader>
    <PageBody className="space-y-4">
      {error && <p role="alert" className="border rounded p-3 text-[var(--color-danger)]">{error}</p>}
      {loading?<p role="status">Loading decisions…</p>:<>
        <div className="flex flex-wrap gap-3 items-center"><FieldLabel hint="Decision view">Show <select aria-label="Show decisions" className="border rounded p-2" value={filter} onChange={e=>setFilter(e.target.value)}><option value="current">Current revisions</option><option value="pending">Needs decision</option><option value="history">All revisions</option></select></FieldLabel><FieldLabel hint="Decision role view">For <select aria-label="Role view" className="border rounded p-2" value={role} onChange={e=>setRole(e.target.value)}><option value="all">All roles</option>{decisionRoles.map(r=><option key={r} value={r}>{decisionRoleLabels[r]}</option>)}</select></FieldLabel><span>{latest.filter(c=>['proposed','deferred'].includes(c.state)).length} awaiting review · {latest.filter(c=>c.state==='documented').length} documented</span></div>
        {!visible.length && !error && <p>No decisions in this view.</p>}
        {visible.map(c=><DecisionItem key={c.id} card={c} busy={busy} act={act}/>)}
      </>}
    </PageBody>
  </>;
}
function DecisionItem({card:c,busy,act}:{card:DecisionCard;busy:boolean;act:(c:DecisionCard,a:string,n:string,h:boolean,s?:DecisionSeed)=>Promise<void>}) {
  const [note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[editing,setEditing]=useState(false);
  const seed=():DecisionSeed=>{const {project_id:_,revision:__,baselines:___,...s}=c.payload;return s;};
  const [draft,setDraft]=useState(seed);
  useEffect(()=>{setConfirmed(false);setEditing(false);setDraft(seed());},[c.id,c.state]);
  const open=['proposed','deferred'].includes(c.state)&&!c.restored;
  const requested=c.history.some(e=>e.action==='request_execution_plan');
  return <article id={`decision-${c.key}`} className="border rounded-lg bg-white p-5 space-y-3">
    <span id={`decision-record-${c.id}`}/><div className="flex flex-wrap items-center gap-3 text-sm"><strong>{c.key} · revision {c.revision}</strong>
      <span>Evidence confidence: <strong>{c.payload.confidence.toUpperCase()}</strong></span>
      <span>{c.restored?'Restored history':c.state==='documented'?'Documentation applied · QA pending':c.state}</span>
      {c.stale&&!c.restored&&<strong className="text-[var(--color-danger)]">{c.source_review?.requires_review?'Cited evidence changed — review the follow-up':'Documentation baseline changed — amend before approval'}</strong>}
    </div>
    <p className="text-sm text-gray-600">Recommended reviewer: {decisionRoleLabels[c.payload.review_role]} · Relevant to {c.payload.audiences.map(r=>decisionRoleLabels[r]).join(', ')}</p>
    {c.source_review?.tracked&&<p className="text-sm">Cited-source check: {c.source_review.source_count} source group · {c.source_review.checked_at}. {c.source_review.requires_review?'Previous approval retained as history; planning from this evidence is blocked.':'Selected cited content matches its recorded baseline.'} {c.source_review.partial_captures>0?'Incomplete captures are retained without replacing complete evidence.':''}</p>}
    {c.source_review?.requires_review&&<p className="text-sm">Review the linked source update before relying on this planning basis.</p>}
    {c.source_review?.followup_ids.map((id,i)=><p key={id} className="text-sm"><a className="underline" href={`#decision-record-${id}`}>Review source update {i+1}</a></p>)}
    <h2 className="text-lg font-semibold">{c.payload.summary}</h2>
    <p className="text-sm text-gray-600">{c.payload.impact}</p>
    <details><summary className="cursor-pointer font-medium">Review evidence, exact changes and next steps</summary>
      <div className="mt-3 space-y-4 text-sm">
        <section><h3 className="font-semibold">Why this recommendation</h3><p className="whitespace-pre-wrap">{c.payload.rationale}</p><p className="mt-2">Alternative: {c.payload.alternatives}</p></section>
        <section><h3 className="font-semibold">Sources</h3><ul className="list-disc pl-5 space-y-2">{c.payload.evidence.map((s,i)=><li key={i}><a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a><p>{s.claim}</p><p className="text-gray-500">Captured {s.captured_at} · SHA-256 {s.source_hash.slice(0,12)}…</p></li>)}</ul><p className="mt-2 text-gray-600">These are captured sources. A newer source requires a new review; this inbox does not poll the live tools.</p></section>
        {c.payload.patches.map(p=>{const d=c.documents.find(x=>x.use_case_id===p.use_case_id);return <section key={p.use_case_id} className="border rounded p-3 space-y-2"><h3 className="font-semibold">{d?`${d.code}: ${d.name}`:p.use_case_id}</h3>
          <details><summary>Current saved notes</summary><pre className="whitespace-pre-wrap break-words mt-2">{d?.current_notes??'Unavailable in restored history.'}</pre></details>
          <h4 className="font-semibold">Exact text to append to use-case notes</h4><p className="whitespace-pre-wrap">{p.append_notes}</p>
          <h4 className="font-semibold">Data requirements to add</h4>{p.add_requirements.length?<ul className="list-disc pl-5">{p.add_requirements.map((r,i)=><li key={i}>{r.level} · {r.note}<details><summary>Native target IDs</summary><pre className="whitespace-pre-wrap">{JSON.stringify(r,null,2)}</pre></details></li>)}</ul>:<p>None. Existing requirement rows remain unchanged.</p>}
        </section>;})}
        <section><h3 className="font-semibold">Proposed execution and verification plan</h3><p className="whitespace-pre-wrap">{c.payload.execution_plan}</p><p className="mt-2 font-medium">{requested?'Plan requested and recorded; execution still requires separate approval.':'Requesting this plan records a planning request; it does not run it.'}</p></section>
        <section><h3 className="font-semibold">Decision record</h3><p className="break-all">Revision hash: {c.content_hash}</p><ul>{c.history.map(h=><li key={h.id}>{h.created_at} · {h.action.replaceAll('_',' ')} · {h.actor}{typeof h.detail.note==='string'&&h.detail.note?` — ${h.detail.note}`:''}</li>)}</ul></section>
      </div>
    </details>
    {editing&&<div className="border rounded p-3 space-y-3"><p>Saving creates an unapproved revision. Previous wording and decisions stay in history.</p>
      <FieldLabel hint="Decision recommendation" className="block">One-sentence recommendation<input className="block border rounded p-2 w-full" value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})}/></FieldLabel>
      {draft.patches.map((p,i)=><FieldLabel hint="Decision notes" className="block" key={p.use_case_id}>Proposed use-case notes ({c.documents.find(d=>d.use_case_id===p.use_case_id)?.code})<textarea rows={8} className="block border rounded p-2 w-full" value={p.append_notes} onChange={e=>setDraft({...draft,patches:draft.patches.map((x,j)=>j===i?{...x,append_notes:e.target.value}:x)})}/></FieldLabel>)}
      <Button disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'amend',note,confirmed,draft)}>Save new revision</Button> <Button variant="secondary" onClick={()=>setEditing(false)}>Cancel amendment</Button>
    </div>}
    {(open||c.state==='documented')&&!c.restored&&<div className="space-y-2 border-t pt-3">
      <FieldLabel hint="Decision review reason" className="block text-sm">Review note <input className="border rounded p-2 w-full mt-1" value={note} onChange={e=>setNote(e.target.value)} placeholder="Required for amend, defer or reject"/></FieldLabel>
      <FieldLabel hint="Decision confirmation" className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed this revision. My action applies to documentation or planning only.</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {open&&<><Button disabled={busy||!confirmed||c.stale||editing} onClick={()=>act(c,'approve_documentation',note,confirmed)}>Approve documentation</Button>
          <Button variant="secondary" disabled={busy} onClick={()=>setEditing(true)}>Amend</Button>
          <Button variant="secondary" disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'defer',note,confirmed)}>Defer</Button>
          <Button variant="secondary" disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'reject',note,confirmed)}>Reject</Button></>}
        {c.state==='documented'&&<Button disabled={busy||!confirmed||requested||c.stale} onClick={()=>act(c,'request_execution_plan',note,confirmed)}>{requested?'Execution plan requested':'Request execution plan'}</Button>}
      </div>
    </div>}
    <p className="text-xs text-gray-500">No campaign, external task or company-library change is executed here. No use case is marked certified by this decision.</p>
  </article>;
}
