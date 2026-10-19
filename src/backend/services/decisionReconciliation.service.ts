import type {DecisionSeed,DecisionPayload,DecisionDependencySnapshot,DecisionReconciliation} from '../../domain/decisionInbox';
import {payloadHash} from '../../domain/diff/hash';
import {getUseCaseOrThrow} from '../dal/use-case.dal';
import {listRequirements} from '../dal/requirement.dal';
import {nativeDecisionSnapshots} from './decisionNativeChanges.service';
import {getEventWithProperties} from '../dal/event.dal';
import {getPropertyById} from '../dal/property.dal';
import {BadRequestError} from '../errors';

type Target={target_kind:string;event_id?:string|null;property_id?:string|null};
export const requirementTargetKey=(r:Target)=>JSON.stringify([r.target_kind,r.event_id??null,r.property_id??null]);
export const requirementMeaning=(r:{level:string;note?:string|null})=>({level:r.level,note:r.note??null});
export function assertDecisionRequirementTarget(project:string,r:Target) {
  if(r.target_kind==='customer_property') {
    const p=r.property_id?getPropertyById(project,r.property_id):null;
    if(!p||p.scope!=='customer'||r.event_id)throw new BadRequestError('Requirement customer property must remain resolved in this project.');
  }else {
    if(!r.event_id)throw new BadRequestError('Requirement event must remain resolved in this project.');
    const {properties}=getEventWithProperties(project,r.event_id);
    if(r.target_kind==='event_property'&&(!r.property_id||!properties.some(p=>p.property_id===r.property_id)))throw new BadRequestError('Requirement property must remain linked to its event in this project.');
    if(r.target_kind==='event'&&r.property_id)throw new BadRequestError('An event requirement cannot specify a property.');
  }
}
export function decisionNoteBlock(p:Pick<DecisionPayload,'key'|'revision'|'questions'>,append:string) {
  const answers=p.questions?.length?'\n\nConfirmed business answers\n'+p.questions.map(q=>`${q.label}\n${q.answer??'[Answer required]'}`).join('\n\n'):'';
  return `Decision ${p.key} / revision ${p.revision} — documentation approved\n\n${append}${answers}`;
}
/** A whole recorded block, never a loose occurrence of the proposed text. */
export function hasDecisionNote(notes:string|null,p:DecisionPayload,append:string):boolean {
  const block=decisionNoteBlock(p,append),text=notes??'';
  return text===block||text.startsWith(block+'\n\n')||text.endsWith('\n\n'+block)||text.includes('\n\n'+block+'\n\n');
}
export function decisionDependencies(project:string,seed:DecisionSeed):DecisionDependencySnapshot {
  const notes:Record<string,string|null>={},requirements:Record<string,unknown>={};
  for(const patch of seed.patches) {
    notes[patch.use_case_id]=getUseCaseOrThrow(project,patch.use_case_id).notes;
    const current=listRequirements(project,patch.use_case_id);
    for(const r of patch.add_requirements) {
      assertDecisionRequirementTarget(project,r);
      const key=requirementTargetKey(r),found=current.find(x=>requirementTargetKey(x)===key);
      requirements[patch.use_case_id+':'+key]=found?requirementMeaning(found):null;
    }
  }
  return {notes,requirements,native:nativeDecisionSnapshots(project,seed.native_changes??[])};
}
const equal=(a:unknown,b:unknown)=>payloadHash(a)===payloadHash(b);
type Conflict=DecisionReconciliation['conflicts'][number];
/** Leaf changes provide exact, stable field paths without dumping unrelated records. */
function changes(path:string,label:string,before:unknown,current:unknown,intended:unknown):Conflict[] {
  if(equal(before,current))return [];
  if(Array.isArray(before)&&Array.isArray(current))return Array.from({length:Math.max(before.length,current.length)},(_,i)=>i).flatMap(i=>changes(path+'.'+i,label,before[i]??null,current[i]??null,intended));
  if(before&&current&&typeof before==='object'&&typeof current==='object'&&!Array.isArray(before)&&!Array.isArray(current)) {
    const a=before as Record<string,unknown>,b=current as Record<string,unknown>;
    return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>changes(path+'.'+k,label,a[k]??null,b[k]??null,intended));
  }
  return [{path,label,before:before??null,current:current??null,intended,resolution:'Review the changed field and prepare a fresh unapproved revision with the intended result.'}];
}
export function reconcileDecisionPayload(project:string,p:DecisionPayload):DecisionReconciliation {
  const result:DecisionReconciliation={status:'ready',can_approve:true,can_reconcile:true,remaining_operations:0,satisfied_operations:0,conflicts:[],summary:''};
  const snapshot=p.dependency_snapshot!;
  try {
    for(const patch of p.patches) {
      const uc=getUseCaseOrThrow(project,patch.use_case_id),base=snapshot.notes[patch.use_case_id];
      if(hasDecisionNote(uc.notes,p,patch.append_notes))result.satisfied_operations++;
      else {
        result.remaining_operations++;
        // Appending preserves a concurrently extended original document. Replacement or
        // removal can invalidate the policy the appended decision was based on.
        if(base && uc.notes!==base&&!uc.notes?.startsWith(base+'\n\n'))result.conflicts.push(...changes(`use_cases.${uc.id}.notes`,uc.name,base,uc.notes,decisionNoteBlock(p,patch.append_notes)));
      }
      const current=listRequirements(project,uc.id);
      for(const r of patch.add_requirements) {
        assertDecisionRequirementTarget(project,r);
        const key=requirementTargetKey(r),found=current.find(x=>requirementTargetKey(x)===key),meaning=found?requirementMeaning(found):null,intended=requirementMeaning(r);
        if(found?.status==='gap') {
          result.remaining_operations++;
          result.conflicts.push({path:`use_cases.${uc.id}.requirements.${key}.status`,label:`${uc.name} requirement`,before:snapshot.requirements[uc.id+':'+key]??null,current:'gap',intended,resolution:'Resolve the existing requirement gap explicitly; an existing unresolved target cannot count as a satisfied addition.'});
          continue;
        }
        if(equal(meaning,intended))result.satisfied_operations++;
        else {
          result.remaining_operations++;
          const before=snapshot.requirements[uc.id+':'+key];
          if(!equal(before,meaning))result.conflicts.push(...changes(`use_cases.${uc.id}.requirements.${key}`,`${uc.name} requirement`,before,meaning,intended));
        }
      }
    }
    const current=nativeDecisionSnapshots(project,p.native_changes??[]);
    for(const [i,change] of (p.native_changes??[]).entries()) {
      const base=snapshot.native[String(i)] as {value:unknown;contract:unknown},now=current[String(i)] as {value:unknown;contract:unknown};
      const intended=change.op==='create_variant'?{present:true,...(change.description!==undefined?{description:change.description?.trim()||null}:{})}:change.to;
      const path=`native_changes.${i}`,label=change.op==='use_case_status'?`Use-case ${change.use_case_id} lifecycle`:change.op==='event_property_required'?`Event ${change.event_id}, property ${change.property_id} required`:change.op==='property_schema'?`Global property ${change.property_id} schema`:`Event ${change.event_id} variant`;
      const contractConflicts=changes(path+'.contract',label,base.contract,now.contract,intended);
      result.conflicts.push(...contractConflicts);
      if(equal(now.value,intended)&&!contractConflicts.length)result.satisfied_operations++;
      else {
        result.remaining_operations++;
        if(!equal(now.value,base.value)&&!equal(now.value,intended))result.conflicts.push(...changes(path+'.value',label,base.value,now.value,intended));
      }
    }
  }catch {
    result.conflicts.push({path:'targets',label:'Proposal target',before:'Present at preparation',current:'Missing or no longer available in this project',intended:'Existing valid target',resolution:'Restore the target or amend this proposal to current project records.'});
  }
  result.status=result.conflicts.length?'conflict':!result.remaining_operations?'satisfied':result.satisfied_operations?'partially_satisfied':'ready';
  result.can_approve=result.status==='ready'||result.status==='partially_satisfied';
  result.summary=result.status==='conflict'?'Relevant fields changed. Review the exact differences before preparing a fresh revision.':result.status==='satisfied'?'Every proposed effect is already present. No approval or execution was recorded.':result.status==='partially_satisfied'?'Some effects are already present. Approval applies only the remaining changes.':'The relevant fields still match. Ready for review.';
  if(p.questions?.some(q=>q.answer===null)) {
    result.status='input_required';result.can_approve=false;
    result.summary='Business answers are required. Save the answers in a fresh unapproved revision before approval.';
  }
  return result;
}
