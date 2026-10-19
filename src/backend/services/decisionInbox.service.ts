import { createHash } from 'node:crypto';
import { decisionSeedSchema, type DecisionSeed, type DecisionPayload, type DecisionCard, type DecisionState, type DecisionReconciliation } from '../../domain/decisionInbox';
import { getDb } from '../db';
import { newId, nowIso } from '../db/util';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import { getUseCaseOrThrow, updateUseCase } from '../dal/use-case.dal';
import { listRequirements, insertResolvedRequirement } from '../dal/requirement.dal';
import { getProjectOrThrow } from '../dal/project.dal';
import {promotionBaselineProject} from './projectPromotion.service';
import {decisionSourceStatus,applyDecisionSources,inheritDecisionSourceBindings} from './decisionSources.service';
import { applyNativeDecisionChanges, nativeDecisionBaselines, nativeDecisionTargets } from './decisionNativeChanges.service';
import { runWithActor } from '../context/actor';
import {decisionDependencies,reconcileDecisionPayload,requirementTargetKey,requirementMeaning,decisionNoteBlock,hasDecisionNote,assertDecisionRequirementTarget} from './decisionReconciliation.service';
export {previewDecisionSources} from './decisionSources.service';

type Row = {id:string; project_id:string; decision_key:string; revision:number; content_hash:string; payload_json:string; state:DecisionState; restored:number};
function canon(v:unknown):string {
  if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
  if(v && typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon((v as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(v);
}
const hash=(v:unknown)=>createHash('sha256').update(canon(v)).digest('hex');
function parseSeed(raw:unknown):DecisionSeed {
  const result=decisionSeedSchema.safeParse(raw);
  if(!result.success) throw new BadRequestError('Invalid decision proposal: '+result.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '));
  const ids=result.data.patches.map(p=>p.use_case_id);
  if(new Set(ids).size!==ids.length) throw new BadRequestError('A use case may occur only once per revision.');
  if(new Set(result.data.questions?.map(q=>q.id)).size!==(result.data.questions?.length??0))throw new BadRequestError('Business question IDs must be unique in a revision.');
  return result.data;
}
function baseline(project:string,id:string,decisionId?:string):string {
  const useCase=getUseCaseOrThrow(project,id);
  const baselineProject=decisionId ? promotionBaselineProject(project,decisionId,id) : project;
  return hash({use_case:{...useCase,project_id:baselineProject}, requirements:listRequirements(project,id)});
}
function latest(project:string,key:string):Row|undefined {
  return getDb().prepare('SELECT * FROM decision_revisions WHERE project_id=? AND decision_key=? ORDER BY revision DESC LIMIT 1').get(project,key) as Row|undefined;
}
function row(project:string,id:string):Row {
  const r=getDb().prepare('SELECT * FROM decision_revisions WHERE project_id=? AND id=?').get(project,id) as Row|undefined;
  if(!r) throw new NotFoundError('Decision',id);
  return r;
}
function event(r:Row,action:string,actor:string,detail:Record<string,unknown>) {
  getDb().prepare('INSERT INTO decision_events(id,project_id,decision_id,action,actor,detail_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(newId(),r.project_id,r.id,action,actor,JSON.stringify(detail),nowIso());
}
function validateTargets(project:string,seed:DecisionSeed,allowSatisfied=false) {
  // Exercise native validation in a rolled-back savepoint; neither requirements nor history persist.
  const rollback=Symbol('validation-only');
  try { getDb().transaction(()=>{
    for(const p of seed.patches) {
      const existing=listRequirements(project,p.use_case_id);
      const targetKey=(r:{target_kind:string;event_id?:string|null;property_id?:string|null})=>JSON.stringify([r.target_kind,r.event_id??null,r.property_id??null]);
      const targets=new Set(existing.map(targetKey));
      const proposed=new Set<string>();
      p.add_requirements.forEach((r,i)=>{
        assertDecisionRequirementTarget(project,r);
        const key=targetKey(r);
        if(proposed.has(key))throw new BadRequestError('This requirement target already exists in this proposal.');
        proposed.add(key);
        if(allowSatisfied&&existing.some(x=>x.status!=='gap'&&targetKey(x)===key&&hash(requirementMeaning(x))===hash(requirementMeaning(r))))return;
        if(targets.has(key)) throw new BadRequestError('This requirement target already exists in the use case or this proposal.');
        targets.add(key);
        insertResolvedRequirement(project,p.use_case_id,existing.length+i,{...r,status:'open'});
      });
    }
    applyNativeDecisionChanges(project,seed.native_changes??[],allowSatisfied);
    throw rollback;
  })(); } catch(e) { if(e!==rollback) throw e; }
}
function prepare(project:string,raw:unknown,amending=false):DecisionPayload {
  getProjectOrThrow(project);
  const seed=parseSeed(raw),old=latest(project,seed.key);
  if(old && !amending) {
    const previous=JSON.parse(old.payload_json) as DecisionPayload;
    const {project_id:_,revision:__,baselines:___,native_baselines:____,payload_version:_____,dependency_snapshot:______,...oldSeed}=previous;
    if(hash(oldSeed)===hash(seed)) return previous;
    throw new ConflictError('This key already exists. Amend its current revision instead of overwriting it.');
  }
  validateTargets(project,seed);
  const baselines=Object.fromEntries(seed.patches.map(p=>[p.use_case_id,baseline(project,p.use_case_id)]));
  return {...seed,project_id:project,revision:old ? old.revision+1 : 1,baselines,payload_version:2,dependency_snapshot:decisionDependencies(project,seed),
    ...(seed.native_changes?{native_baselines:nativeDecisionBaselines(project,seed.native_changes)}:{})};
}
export function previewDecision(project:string,raw:unknown) {
  const payload=prepare(project,raw);
  return {payload,content_hash:hash(payload)};
}
export function importDecision(project:string,raw:unknown,expected:string):DecisionCard {
  return getDb().transaction(()=>{
    const p=previewDecision(project,raw);
    if(p.content_hash!==expected) throw new ConflictError('Proposal or document baseline changed. Preview again.');
    const old=latest(project,p.payload.key);
    if(old) return card(old);
    const id=newId();
    getDb().prepare('INSERT INTO decision_revisions(id,project_id,decision_key,revision,content_hash,payload_json,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id,project,p.payload.key,p.payload.revision,p.content_hash,JSON.stringify(p.payload),nowIso());
    const r=row(project,id);
    event(r,'proposed','AI proposal import',{content_hash:p.content_hash,approval:false});
    return card(r);
  }).immediate();
}
function isStale(r:Row,p:DecisionPayload):boolean {
  if(r.restored) return true;
  if(decisionSourceStatus(r.project_id,r.id).requires_review) return true;
  if(p.payload_version===2&&p.dependency_snapshot) {
    if(r.state==='documented') {
      const approval=getDb().prepare("SELECT detail_json FROM decision_events WHERE project_id=? AND decision_id=? AND action IN ('approve_documentation','approve_and_apply') ORDER BY rowid DESC LIMIT 1").get(r.project_id,r.id) as {detail_json:string}|undefined;
      const after=approval?JSON.parse(approval.detail_json).resulting_dependencies:null;
      if(!after)return true;
      return reconcileDecisionPayload(r.project_id,{...p,dependency_snapshot:after}).status==='conflict';
    }
    return reconcileDecisionPayload(r.project_id,p).status==='conflict';
  }
  if(r.state==='documented') {
    const approval=getDb().prepare("SELECT detail_json FROM decision_events WHERE project_id=? AND decision_id=? AND action IN ('approve_documentation','approve_and_apply') ORDER BY rowid DESC LIMIT 1").get(r.project_id,r.id) as {detail_json:string}|undefined;
    const applied=approval ? JSON.parse(approval.detail_json).resulting_baselines as Record<string,string> : null;
    if(!applied) return true;
    try {
      const detail=JSON.parse(approval!.detail_json);
      return p.patches.some(x=>baseline(r.project_id,x.use_case_id,r.id)!==applied[x.use_case_id]) ||
        !!p.native_changes&&hash(nativeDecisionBaselines(r.project_id,p.native_changes))!==hash(detail.resulting_native_baselines??null);
    }catch{return true;}
  }
  try { return p.patches.some(x=>baseline(r.project_id,x.use_case_id,r.id)!==p.baselines[x.use_case_id]) ||
    !!p.native_changes&&hash(nativeDecisionBaselines(r.project_id,p.native_changes))!==hash(p.native_baselines??null); } catch { return true; }
}
function reconciliation(r:Row,p:DecisionPayload):DecisionReconciliation {
  const base:DecisionReconciliation={status:'legacy_review',can_approve:false,can_reconcile:false,remaining_operations:0,satisfied_operations:0,conflicts:[],summary:''};
  if(r.restored)return {...base,status:'restored',summary:'Restored history is read-only and carries no current approval authority.'};
  if(latest(r.project_id,r.decision_key)?.id!==r.id||r.state==='superseded')return {...base,status:'superseded',summary:'A newer revision replaces this historical proposal.'};
  if(!['proposed','deferred'].includes(r.state))return {...base,status:'closed',summary:'Historical decision. Its approval and result remain unchanged.'};
  if(decisionSourceStatus(r.project_id,r.id).requires_review)return {...base,status:'source_review',summary:'Cited evidence changed. Review its sourced follow-up before preparing a new proposal.'};
  if(p.payload_version===2&&p.dependency_snapshot)return reconcileDecisionPayload(r.project_id,p);
  if(isStale(r,p))return {...base,can_reconcile:true,summary:'This legacy revision contains only broad hashes; exact historical field differences are unavailable. Preview a fresh unapproved revision.'};
  return {...base,status:'ready',can_approve:true,can_reconcile:true,summary:'Legacy baseline still matches. A fresh revision can record exact dependencies.'};
}
function card(r:Row):DecisionCard {
  const payload=JSON.parse(r.payload_json) as DecisionPayload;
  const history=getDb().prepare('SELECT * FROM decision_events WHERE project_id=? AND decision_id=? ORDER BY created_at,rowid').all(r.project_id,r.id) as {id:string;action:string;actor:string;created_at:string;detail_json:string}[];
  return {id:r.id,key:r.decision_key,revision:r.revision,content_hash:r.content_hash,state:r.state,restored:!!r.restored,
    stale:isStale(r,payload),reconciliation:reconciliation(r,payload),source_review:decisionSourceStatus(r.project_id,r.id),payload,
    history:history.map(({detail_json,...h})=>({...h,detail:JSON.parse(detail_json)})),
    documents:r.restored?[]:payload.patches.flatMap(p=>{try {const uc=getUseCaseOrThrow(r.project_id,p.use_case_id);return [{use_case_id:uc.id,code:uc.code,name:uc.name,current_notes:uc.notes,current_requirements:listRequirements(r.project_id,uc.id)}];} catch{return [];}}),
    native_targets:r.restored?[]:(()=>{try{return nativeDecisionTargets(r.project_id,payload.native_changes??[]);}catch{return [];}})(),
  };
}
export function reviewDecisionSources(project:string,id:string,raw:unknown,expected:string,actor:string) {
  return applyDecisionSources(project,id,raw,expected,actor,seed=>importDecision(project,seed,previewDecision(project,seed).content_hash).id);
}
export function listDecisions(project:string):DecisionCard[] {
  getProjectOrThrow(project);
  return (getDb().prepare('SELECT * FROM decision_revisions WHERE project_id=? ORDER BY decision_key,revision DESC').all(project) as Row[]).map(card);
}
function seedOf(p:DecisionPayload):DecisionSeed {
  const {project_id:_,revision:__,baselines:___,native_baselines:____,payload_version:_____,dependency_snapshot:______,...seed}=p;
  return seed;
}
/** Explicitly preview a new review basis. This neither approves nor changes native data. */
export function previewDecisionReconciliation(project:string,id:string,expected:string,proposal?:unknown) {
  const r=row(project,id),p=JSON.parse(r.payload_json) as DecisionPayload;
  if(hash(p)!==r.content_hash||expected!==r.content_hash)throw new ConflictError('Revision mismatch. Refresh the current proposal.');
  const rec=reconciliation(r,p);
  if(!rec.can_reconcile)throw new ConflictError(rec.summary);
  const seed=proposal===undefined?seedOf(p):parseSeed(proposal);
  if(seed.key!==r.decision_key)throw new BadRequestError('A reconciliation must keep the decision key.');
  const refs=(v:DecisionSeed)=>v.evidence.map(e=>[e.url,e.source_hash]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(decisionSourceStatus(project,id).tracked&&hash(refs(seed))!==hash(refs(p)))throw new BadRequestError('Tracked citation references require a sourced follow-up; reconcile with the same evidence.');
  validateTargets(project,seed,true);
  const payload:DecisionPayload={...seed,project_id:project,revision:r.revision+1,payload_version:2,
    baselines:Object.fromEntries(seed.patches.map(x=>[x.use_case_id,baseline(project,x.use_case_id)])),
    dependency_snapshot:decisionDependencies(project,seed),
    ...(seed.native_changes?{native_baselines:nativeDecisionBaselines(project,seed.native_changes)}:{})};
  const {baselines:_,native_baselines:__,...relevant}=payload;
  return {content_hash:hash({previous_id:id,previous_hash:expected,payload:relevant}),previous_content_hash:expected,payload,reconciliation:rec,intent_changed:hash(seed)!==hash(seedOf(p))};
}
export function applyDecisionReconciliation(project:string,id:string,expected:string,previewHash:string,actor:string,note='',proposal?:unknown):DecisionCard {
  if(!actor.trim())throw new BadRequestError('Staff identity required.');
  return getDb().transaction(()=>{
    const r=row(project,id);
    if(r.restored)throw new ConflictError('Restored history is read-only.');
    const original=JSON.parse(r.payload_json) as DecisionPayload;
    if(expected!==r.content_hash||hash(original)!==expected)throw new ConflictError('Revision mismatch. Refresh the current proposal.');
    const inputHash=hash(proposal===undefined?seedOf(original):parseSeed(proposal));
    // Idempotent retry binds to the original reconciliation token; never a new approval.
    const prior=getDb().prepare("SELECT detail_json FROM decision_events WHERE project_id=? AND decision_id=? AND action='reconciled' ORDER BY rowid DESC LIMIT 1").get(project,id) as {detail_json:string}|undefined;
    if(prior) {
      const detail=JSON.parse(prior.detail_json);
      if(detail.preview_hash!==previewHash||detail.previous_content_hash!==expected||detail.proposal_input_hash!==inputHash)throw new ConflictError('Reconciliation replay differs from the saved preview.');
      return card(row(project,detail.next_id));
    }
    const preview=previewDecisionReconciliation(project,id,expected,proposal);
    if(preview.content_hash!==previewHash)throw new ConflictError('Relevant project fields changed after reconciliation preview. Preview again.');
    const nextId=newId(),nextHash=hash(preview.payload);
    getDb().prepare("UPDATE decision_revisions SET state='superseded' WHERE id=?").run(id);
    getDb().prepare('INSERT INTO decision_revisions(id,project_id,decision_key,revision,content_hash,payload_json,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(nextId,project,r.decision_key,preview.payload.revision,nextHash,JSON.stringify(preview.payload),nowIso());
    event(r,'reconciled',actor,{note,next_id:nextId,preview_hash:previewHash,previous_content_hash:expected,proposal_input_hash:inputHash,intent_changed:preview.intent_changed,approval:false,execution_authorized:false});
    const next=row(project,nextId);
    event(next,'reconciliation_prepared',actor,{note,previous_id:id,previous_content_hash:expected,preview_hash:previewHash,proposal_input_hash:inputHash,intent_changed:preview.intent_changed,approval:false,execution_authorized:false});
    inheritDecisionSourceBindings(project,id,nextId,actor);
    return card(next);
  }).immediate();
}
export function actOnDecision(project:string,id:string,expected:string,action:string,actor:string,note:string,confirmed:boolean,amendment?:unknown):DecisionCard {
  if(!confirmed || !actor.trim()) throw new BadRequestError('Explicit human confirmation is required.');
  if(!['approve_documentation','approve_and_apply','request_execution_plan','amend','defer','reject'].includes(action)) throw new BadRequestError('Unknown decision action.');
  if(!note.trim() && ['amend','defer','reject'].includes(action)) throw new BadRequestError('Add a reason for this decision.');
  return getDb().transaction(()=>{
    const r=row(project,id),p=JSON.parse(r.payload_json) as DecisionPayload;
    if(r.restored) throw new ConflictError('Restored history is read-only. Create a fresh proposal for this project.');
    if(hash(p)!==r.content_hash || expected!==r.content_hash) throw new ConflictError('Revision mismatch. Refresh and review the current proposal.');
    if(latest(project,r.decision_key)?.id!==r.id) throw new ConflictError('This revision has been superseded.');
    const hasNative=!!p.native_changes?.length;
    if(action==='approve_documentation'&&hasNative)throw new BadRequestError('This proposal includes native changes. Review and use Approve and apply.');
    if(action==='approve_and_apply'&&!hasNative)throw new BadRequestError('This revision contains documentation only. Native changes require a new reviewed proposal.');
    if(action==='approve_and_apply'&&r.state==='documented') {
      if(!card(r).history.some(e=>e.action===action))throw new ConflictError('A documentation approval cannot authorize native changes retroactively.');
      return card(r);
    }
    if(action==='request_execution_plan') {
      if(r.state!=='documented') throw new ConflictError('Approve the documentation before requesting an execution plan.');
      if(isStale(r,p)) throw new ConflictError('Approved documentation or cited evidence changed. Review a follow-up proposal before planning execution.');
      if(!card(r).history.some(e=>e.action===action)) event(r,action,actor,{note,content_hash:expected,execution_authorized:false,verification:'not performed'});
      return card(r);
    }
    if(action==='approve_documentation' && r.state==='documented') return card(r);
    if(!['proposed','deferred'].includes(r.state)) throw new ConflictError('This decision is closed. Create a follow-up proposal.');
    if(action==='amend') {
      const seed=parseSeed(amendment);
      if(seed.key!==r.decision_key) throw new BadRequestError('An amendment must keep the decision key.');
      const refs=(v:DecisionSeed)=>v.evidence.map(e=>[e.url,e.source_hash]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if(decisionSourceStatus(project,id).tracked&&hash(refs(seed))!==hash(refs(p))) throw new BadRequestError('Tracked citation references require a sourced follow-up; amend wording with the same evidence.');
      const next=prepare(project,seed,true),nextHash=hash(next),nextId=newId();
      getDb().prepare("UPDATE decision_revisions SET state='superseded' WHERE id=?").run(id);
      getDb().prepare('INSERT INTO decision_revisions(id,project_id,decision_key,revision,content_hash,payload_json,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(nextId,project,seed.key,next.revision,nextHash,JSON.stringify(next),nowIso());
      event(r,'superseded',actor,{note,next_id:nextId,content_hash:expected});
      const n=row(project,nextId); event(n,'amended',actor,{note,previous_id:id,approval:false}); inheritDecisionSourceBindings(project,id,nextId,actor); return card(n);
    }
    if(action==='approve_documentation'||action==='approve_and_apply') {
      if(isStale(r,p)) throw new ConflictError('Affected documentation or cited evidence changed. Amend and review a new revision.');
      const rec=reconciliation(r,p);
      if(!rec.can_approve)throw new ConflictError(rec.status==='satisfied'?'All proposed effects are already present. No approval or execution is needed.':rec.summary);
      const nativeResults=action==='approve_and_apply'
        ? runWithActor({actor,source:'decision:'+r.id,batch_id:r.id},()=>applyNativeDecisionChanges(project,p.native_changes!,p.payload_version===2)) : [];
      for(const patch of p.patches) {
        const uc=getUseCaseOrThrow(project,patch.use_case_id),existing=listRequirements(project,patch.use_case_id);
        if(!hasDecisionNote(uc.notes,p,patch.append_notes))updateUseCase(project,uc.id,{notes:[uc.notes,decisionNoteBlock(p,patch.append_notes)].filter(Boolean).join('\n\n')});
        patch.add_requirements.forEach((input,i)=>{
          if(existing.some(x=>requirementTargetKey(x)===requirementTargetKey(input)&&hash(requirementMeaning(x))===hash(requirementMeaning(input))))return;
          insertResolvedRequirement(project,uc.id,existing.length+i,{...input,status:'open'});
        });
      }
      getDb().prepare("UPDATE decision_revisions SET state='documented' WHERE id=?").run(id);
      event(r,action,actor,{note,content_hash:expected,baselines:p.baselines,
        ...(p.payload_version===2?{resulting_dependencies:decisionDependencies(project,p)}:{}),
        resulting_baselines:Object.fromEntries(p.patches.map(x=>[x.use_case_id,baseline(project,x.use_case_id,r.id)])),
        execution_authorized:action==='approve_and_apply',verification:'not performed',
        ...(hasNative?{native_results:nativeResults,resulting_native_baselines:nativeDecisionBaselines(project,p.native_changes!),execution_status:'applied'}:{})});
    } else {
      getDb().prepare('UPDATE decision_revisions SET state=? WHERE id=?').run(action==='defer'?'deferred':'rejected',id);
      event(r,action,actor,{note,content_hash:expected});
    }
    return card(row(project,id));
  }).immediate();
}
