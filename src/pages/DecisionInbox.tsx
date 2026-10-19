import { FieldLabel } from '@/src/components/ui/FieldHint';
import React, { useEffect, useRef, useState } from 'react';
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { decisionRoles, decisionRoleLabels, type DecisionCard, type DecisionSeed } from '@/src/domain/decisionInbox';
import { Button } from '@/src/components/ui/Button';
import { USE_CASE_STATUSES, VARIANT_OPERATORS } from '@/src/domain/enums';

type InboxView = 'actions' | 'choices' | 'completed' | 'history';
const needsDecision = (c:DecisionCard) => ['proposed','deferred'].includes(c.state) && !c.restored;
const hasNativeChanges = (c:DecisionCard) => !!c.payload.native_changes?.length;
const isBlocked = (c:DecisionCard) => c.stale || c.source_review?.requires_review;
const fragment = () => typeof window === 'undefined' ? '' : window.location.hash;
function linkedCard(cards:DecisionCard[], hash:string) {
  return cards.find(c=>hash===`#decision-record-${c.id}`)
    ?? [...cards].sort((a,b)=>b.revision-a.revision).find(c=>hash===`#decision-${c.key}`);
}
export function DecisionInbox() {
  const {activeProjectId}=useProjectShell();
  const [cards,setCards]=useState<DecisionCard[]>([]),[error,setError]=useState(''),[mode,setMode]=useState('');
  const [success,setSuccess]=useState<{id:string;key:string}|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[unresolved,setUnresolved]=useState(false);
  const [filter,setFilter]=useState<InboxView>('actions'),[role,setRole]=useState('all'),[search,setSearch]=useState(''),[hash,setHash]=useState(fragment);
  const generation=useRef(0),request=useRef(0),actionInFlight=useRef(false);
  async function load(g:number) {
    const req=++request.current;setLoading(true);
    try {
      const r=await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/decision-inbox`);
      const body=await r.json();if(!r.ok)throw Error(body.error??'Could not load decisions.');
      if(g!==generation.current||req!==request.current)return false;
      setCards(body.decisions);setMode(body.identity_mode);setError('');setUnresolved(false);return true;
    } catch(e) {
      if(g===generation.current&&req===request.current)setError(e instanceof Error?e.message:String(e));
      return false;
    } finally {if(g===generation.current&&req===request.current)setLoading(false);}
  }
  useEffect(()=>{
    const g=++generation.current;setCards([]);setMode('');setError('');setSuccess(null);setUnresolved(false);setBusy(false);actionInFlight.current=false;
    setFilter('actions');setRole('all');setSearch('');void load(g);
    return ()=>{generation.current++;request.current++;};
  },[activeProjectId]);
  useEffect(()=>{const change=()=>setHash(fragment());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  const linked=linkedCard(cards,hash);
  useEffect(()=>{if(linked)document.getElementById(`decision-record-${linked.id}`)?.scrollIntoView?.({block:'start'});},[linked?.id]);
  async function act(card:DecisionCard,action:string,note:string,confirmed:boolean,amendment?:DecisionSeed) {
    if(actionInFlight.current||unresolved)return;
    actionInFlight.current=true;const g=generation.current;setBusy(true);setError('');setSuccess(null);
    let accepted=false,knownRejection=false;
    try {
      const r=await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/decision-inbox/${card.id}/actions`,{
        method:'POST',body:JSON.stringify({action,note,human_confirmed:confirmed,content_hash:card.content_hash,amendment}),
      });
      // A response status establishes a rejection even if its error body cannot be read.
      knownRejection=!r.ok&&r.status>=400&&r.status<500;
      const result=await r.json();if(!r.ok)throw Error(result.error??'Decision failed.');
      accepted=true;if(g!==generation.current)return;
      const refreshed=await load(g);
      if(refreshed&&g===generation.current)setSuccess({id:typeof result.id==='string'?result.id:card.id,key:card.key});
      if(!refreshed&&g===generation.current){setUnresolved(true);setError('Action saved, but the updated result could not be loaded. Retry loading to verify the receipt before taking another action.');}
    }catch(e){if(g===generation.current){
      if(!knownRejection){setUnresolved(true);setError(accepted?'Action saved, but the updated result could not be loaded. Retry loading to verify the receipt.':'The connection interrupted this action. Its outcome is unknown: it may have been saved. Retry loading and check the decision record before acting again.');}
      else setError(e instanceof Error?e.message:String(e));
    }}finally{if(g===generation.current){setBusy(false);actionInFlight.current=false;}}
  }
  const latest=cards.filter(c=>!cards.some(d=>d.key===c.key&&d.revision>c.revision));
  const actions=latest.filter(c=>needsDecision(c)&&hasNativeChanges(c));
  const choices=latest.filter(c=>needsDecision(c)&&!hasNativeChanges(c));
  const completed=latest.filter(c=>!needsDecision(c));
  const filtered=filter==='actions'?actions:filter==='choices'?choices:filter==='completed'?completed:cards;
  const query=search.trim().toLowerCase();
  const visible=filtered.filter(c=>(role==='all'||c.payload.audiences.includes(role as typeof decisionRoles[number]))&&(!query||JSON.stringify([c.key,c.payload.summary,c.payload.impact,c.native_targets,c.documents.map(d=>[d.code,d.name])]).toLowerCase().includes(query)));
  const reveal=linked&&!visible.some(c=>c.id===linked.id)?linked:null;
  return <>
    <PageHeader><h1 className="text-2xl font-semibold">Decision inbox</h1>
      <p className="mt-2 text-sm">Review exact E3 changes, approve and apply, then verify the saved result.</p>
      <p className="mt-2 text-sm text-gray-600">Business choices need a decision or an executable proposal. Completed decisions and documentation are kept in history.</p>
      {mode==='local'&&<p className="mt-2 text-sm text-gray-600">Local environment: this project data is separate from the hosted VM. Actions record the local operator.</p>}
    </PageHeader>
    <PageBody className="space-y-4">
      {success&&<p role="status" className="border rounded p-3">Decision {success.key} saved. <a className="underline" href={`#decision-record-${success.id}`}>View saved result and decision record</a>.</p>}
      {error&&<div role="alert" className="border rounded p-3 space-y-2"><p>{error}</p>{cards.length>0&&<p>The last loaded decisions remain visible. Their current server state has not been verified.</p>}<Button variant="secondary" disabled={loading||busy} onClick={()=>load(generation.current)}>Retry loading</Button></div>}
      {loading&&<p role="status">{cards.length?'Refreshing decisions…':'Loading decisions…'}</p>}
      {((!loading&&!error)||cards.length>0)&&<>
        <nav aria-label="Decision queues" className="flex flex-wrap gap-2">{([
          ['actions',`E3 changes (${actions.length})`],['choices',`Business choices (${choices.length})`],['completed',`Completed / closed (${completed.length})`],['history',`All revisions (${cards.length})`],
        ] as [InboxView,string][]).map(([value,label])=><Button key={value} variant={filter===value?'default':'secondary'} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</Button>)}</nav>
        <div className="flex flex-wrap gap-3 items-center">
          <FieldLabel hint="Decision search">Search<input aria-label="Search decisions" className="block border rounded p-2" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Decision, event or use case"/></FieldLabel>
          <FieldLabel hint="Decision role view">For<select aria-label="Role view" className="block border rounded p-2" value={role} onChange={e=>setRole(e.target.value)}><option value="all">All roles</option>{decisionRoles.map(r=><option key={r} value={r}>{decisionRoleLabels[r]}</option>)}</select></FieldLabel>
          <Button variant="secondary" disabled={loading||busy} onClick={()=>load(generation.current)}>Refresh</Button>
        </div>
        {filter==='actions'&&<p className="text-sm">{actions.filter(c=>!isBlocked(c)&&c.state==='proposed').length} ready to approve · {actions.filter(isBlocked).length} need updated evidence or data · {actions.filter(c=>!isBlocked(c)&&c.state==='deferred').length} awaiting input</p>}
        {filter==='choices'&&<p className="text-sm">These proposals record business choices, notes or requirements. They contain no automatic status, variant or required-field changes. Review their exact scope before approving.</p>}
        {filter==='completed'&&<p className="text-sm">Saved results and closed decisions. Open a record to inspect evidence, receipts and any remaining planning action.</p>}
        {filter==='actions'&&!actions.length&&<p>No executable E3 proposals are awaiting approval. Review Business choices for unresolved decisions; approval there records only the stated documentation changes.</p>}
        {!visible.length&&!(filter==='actions'&&!actions.length)&&<p>No decisions match this view and its filters.</p>}
        {reveal&&<section aria-label="Linked decision" className="space-y-2"><p>This linked revision is outside the selected queue or filters.</p><DecisionItem key={reveal.id} card={reveal} busy={busy||loading||unresolved} act={act} expanded/></section>}
        {visible.map(c=><DecisionItem key={c.id} card={c} busy={busy||loading||unresolved} act={act} expanded={linked?.id===c.id}/>)}
      </>}
    </PageBody>
  </>;
}
export function DecisionItem({card:c,busy,act,expanded=false}:{card:DecisionCard;busy:boolean;expanded?:boolean;act:(c:DecisionCard,a:string,n:string,h:boolean,s?:DecisionSeed)=>Promise<void>}) {
  const [detailsOpen,setDetailsOpen]=useState(expanded);
  useEffect(()=>{if(expanded)setDetailsOpen(true);},[expanded]);
  const [note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[editing,setEditing]=useState(false);
  const seed=():DecisionSeed=>{const {project_id:_,revision:__,baselines:___,native_baselines:____,...s}=c.payload;return s;};
  const [draft,setDraft]=useState(seed);
  useEffect(()=>{setConfirmed(false);setEditing(false);setDraft(seed());},[c.id,c.state]);
  const open=['proposed','deferred'].includes(c.state)&&!c.restored;
  const requested=c.history.some(e=>e.action==='request_execution_plan');
  const hasNative=!!c.payload.native_changes?.length;
  const applied=c.history.find(e=>e.action==='approve_and_apply');
  const targetName=(id:string)=>c.native_targets?.find(t=>t.id===id)?.name??id;
  const results=Array.isArray(applied?.detail.native_results)?applied.detail.native_results as {op:string;action:string;entity_id:string;entity_name:string;before?:string|boolean|null;after?:string|boolean|null}[]:[];
  return <article id={`decision-record-${c.id}`} className="border rounded-lg bg-white p-5 space-y-3">
    <span id={`decision-${c.key}`}/><div className="flex flex-wrap items-center gap-3 text-sm"><strong>{c.key} · revision {c.revision}</strong>
      <span>Evidence confidence: <strong>{c.payload.confidence.toUpperCase()}</strong></span>
      <span>{c.restored?'Restored history':applied?'E3 changes applied · QA pending':c.state==='documented'?'Documentation recorded':open?isBlocked(c)?'Update required before approval':c.state==='deferred'?'Awaiting input':hasNative?'Ready to approve':'Business choice required':c.state}</span>
      {c.stale&&!c.restored&&<strong className="text-[var(--color-danger)]">{c.source_review?.requires_review?'Cited evidence changed — review the follow-up':'Reviewed E3 data changed — amend before approval'}</strong>}
    </div>
    <h2 className="text-lg font-semibold">{c.payload.summary}</h2>
    <p className="text-sm text-gray-600">{hasNative?`${c.payload.native_changes!.length} E3 change${c.payload.native_changes!.length===1?'':'s'} · ${c.payload.native_changes!.filter(x=>x.op==='use_case_status').length} status updates · ${c.payload.native_changes!.filter(x=>x.op==='create_variant').length} variants · ${c.payload.native_changes!.filter(x=>x.op==='event_property_required').length} required-field updates`:'Documentation / business choice · no automatic status, variant or required-field changes'}</p>
    <p className="text-sm">Reviewer: {decisionRoleLabels[c.payload.review_role]} · <a className="underline" href={`#decision-record-${c.id}`}>Link to this revision</a></p>
    <details open={detailsOpen} onToggle={e=>setDetailsOpen(e.currentTarget.open)}><summary className="cursor-pointer font-medium">{open?'Review exact changes and decide':'View saved result and history'}</summary><div className="mt-3 space-y-3">
    <p className="text-sm text-gray-600">{c.payload.impact}</p>
    <p className="text-sm text-gray-600">Recommended reviewer: {decisionRoleLabels[c.payload.review_role]} · Relevant to {c.payload.audiences.map(r=>decisionRoleLabels[r]).join(', ')}</p>
    {c.source_review?.tracked&&<p className="text-sm">Cited-source check: {c.source_review.source_count} source group · {c.source_review.checked_at}. {c.source_review.requires_review?'Previous approval retained as history; planning from this evidence is blocked.':'Selected cited content matches its recorded baseline.'} {c.source_review.partial_captures>0?'Incomplete captures are retained without replacing complete evidence.':''}</p>}
    {c.source_review?.requires_review&&<p className="text-sm">Review the linked source update before relying on this planning basis.</p>}
    {c.source_review?.followup_ids.map((id,i)=><p key={id} className="text-sm"><a className="underline" href={`#decision-record-${id}`}>Review source update {i+1}</a></p>)}

    {hasNative&&<section className="border rounded p-3 space-y-2" aria-label="Native E3 changes">
      <h3 className="font-semibold">{applied?'Approved E3 changes':open?'E3 changes applied when you approve':'Proposed E3 changes (historical)'}</h3>
      <ol className="list-decimal pl-5">{c.payload.native_changes!.map((change,i)=><li key={i}>{change.op==='use_case_status'
        ? <>Set {targetName(change.use_case_id)} status: <strong>{change.from??'Unset'}</strong> → <strong>{change.to??'Unset'}</strong>.</>
        : change.op==='event_property_required'?<>Set <strong>{targetName(change.event_id)}.{targetName(change.property_id)}</strong>: <strong>{change.from?'Required':'Optional'}</strong> → <strong>{change.to?'Required':'Optional'}</strong>.</>
        : <>Create variant on <strong>{targetName(change.event_id)}</strong>: {change.conditions.map(x=>`${targetName(x.property_id)} ${x.operator==='equals'?'=':'in'} ${x.values.join(' / ')}`).join(' AND ')}{change.description&&<p>{change.description}</p>}</>}</li>)}</ol>
      <p className="text-sm">These changes are saved together with the documentation. If any change fails validation, none is applied.</p>
    </section>}
    {applied&&<section className="border rounded p-3 space-y-2" aria-label="Execution receipt">
      <h3 className="font-semibold">Execution receipt</h3><p>{applied.created_at} · {applied.actor}</p>
      <ul className="list-disc pl-5">{results.map((result,i)=><li key={i}>{result.entity_name}: {result.op==='use_case_status'?`${result.before??'Unset'} → ${result.after??'Unset'}`:result.op==='event_property_required'?`${result.before?'Required':'Optional'} → ${result.after?'Required':'Optional'}`:result.action==='created'?'Created':'Already present'} <span className="text-xs text-gray-500">({result.entity_id})</span></li>)}</ul>
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
          :change.op==='event_property_required'?<div className="flex flex-wrap gap-3"><p>{targetName(change.event_id)}.{targetName(change.property_id)}</p>{(['from','to'] as const).map(field=><FieldLabel hint="Decision required-field transition" key={field}>{field==='from'?'Current requirement expected':'New requirement'}<select aria-label={`${field==='from'?'Expected current':'New'} requirement for change ${i+1}`} className="block border rounded p-2" value={String(change[field])} onChange={e=>setDraft({...draft,native_changes:draft.native_changes!.map((x,j)=>j===i?{...change,[field]:e.target.value==='true'}:x)})}><option value="false">Optional</option><option value="true">Required</option></select></FieldLabel>)}</div>
          :<>{change.conditions.map((condition,k)=><div key={k} className="space-y-2"><p>{targetName(condition.property_id)}</p><FieldLabel hint="Decision variant condition">Match<select aria-label={`Operator for change ${i+1} condition ${k+1}`} className="block border rounded p-2" value={condition.operator} onChange={e=>setDraft({...draft,native_changes:draft.native_changes!.map((x,j)=>j===i?{...change,conditions:change.conditions.map((c,n)=>n===k?{...c,operator:e.target.value as typeof c.operator}:c)}:x)})}>{VARIANT_OPERATORS.map(op=><option key={op} value={op}>{op==='equals'?'Equals':'Any of'}</option>)}</select></FieldLabel><FieldLabel hint="Decision variant condition">Allowed values, one per line<textarea aria-label={`Values for change ${i+1} condition ${k+1}`} className="block border rounded p-2 w-full" rows={2} value={condition.values.join('\n')} onChange={e=>setDraft({...draft,native_changes:draft.native_changes!.map((x,j)=>j===i?{...change,conditions:change.conditions.map((c,n)=>n===k?{...c,values:e.target.value.split('\n')}:c)}:x)})}/></FieldLabel></div>)}</>}
        <Button variant="secondary" disabled={busy} onClick={()=>setDraft({...draft,native_changes:draft.native_changes!.length===1?undefined:draft.native_changes!.filter((_,j)=>j!==i)})}>Remove this change</Button>
      </fieldset>)}
      <Button disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'amend',note,confirmed,draft)}>Save new revision</Button> <Button variant="secondary" onClick={()=>setEditing(false)}>Cancel amendment</Button>
    </div>}
    {(open||(c.state==='documented'&&!requested&&!applied))&&!c.restored&&<div className="space-y-2 border-t pt-3">
      <FieldLabel hint="Decision review reason" className="block text-sm">Review note <input className="border rounded p-2 w-full mt-1" value={note} onChange={e=>setNote(e.target.value)} placeholder="Required for amend, defer or reject"/></FieldLabel>
      <FieldLabel hint="Decision confirmation" className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{editing?'I reviewed this amendment. Saving creates a revision that needs a fresh approval.':hasNative&&open?'I reviewed the exact E3 changes and approve applying them with the documentation.':'I reviewed this revision. This action applies to documentation or planning only.'}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {open&&<><Button disabled={busy||!confirmed||!!isBlocked(c)||editing} onClick={()=>act(c,hasNative?'approve_and_apply':'approve_documentation',note,confirmed)}>{hasNative?'Approve and apply':'Approve documentation'}</Button>
          <Button variant="secondary" disabled={busy} onClick={()=>setEditing(true)}>Amend</Button>
          <Button variant="secondary" disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'defer',note,confirmed)}>Defer</Button>
          <Button variant="secondary" disabled={busy||!confirmed||!note.trim()} onClick={()=>act(c,'reject',note,confirmed)}>Reject</Button></>}
        {c.state==='documented'&&!requested&&!applied&&<Button disabled={busy||!confirmed||!!isBlocked(c)} onClick={()=>act(c,'request_execution_plan',note,confirmed)}>{requested?'Execution plan requested':'Request execution plan'}</Button>}
      </div>
    </div>}
    <p className="text-xs text-gray-500">External implementation and tracking QA remain separate from these E3 changes.</p>
    </div></details>
  </article>;
}
