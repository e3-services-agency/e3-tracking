import type { NativeDecisionChange, NativeDecisionResult, NativeDecisionTarget } from '../../domain/decisionInbox';
import { payloadHash } from '../../domain/diff/hash';
import { buildConditionsKey, normalizeConditions, type VariantCondition } from '../../domain/variants';
import { getEventWithProperties } from '../dal/event.dal';
import { createVariant, listVariants } from '../dal/variant.dal';
import { getUseCaseOrThrow, updateUseCase } from '../dal/use-case.dal';
import { BadRequestError, ConflictError } from '../errors';

// Missing conditions are unconstrained. Positive equals/in predicates intersect unless
// a shared property has disjoint values; adding such variants makes first-match QA ambiguous.
function overlaps(a:VariantCondition[],b:VariantCondition[]):boolean {
  return !a.some(x=>{const y=b.find(y=>y.property_id===x.property_id);return y&&!x.values.some(v=>y.values.includes(v));});
}

export function nativeDecisionBaselines(project:string,changes:NativeDecisionChange[]):Record<string,string> {
  return Object.fromEntries(changes.map((change,i)=>[String(i),payloadHash(change.op==='use_case_status'
    ? getUseCaseOrThrow(project,change.use_case_id)
    : {...getEventWithProperties(project,change.event_id),variants:listVariants(project,change.event_id)})]));
}

export function nativeDecisionTargets(project:string,changes:NativeDecisionChange[]):NativeDecisionTarget[] {
  const targets=new Map<string,string>();
  for(const change of changes) {
    if(change.op==='use_case_status') {
      const uc=getUseCaseOrThrow(project,change.use_case_id);targets.set(uc.id,uc.name);
    } else {
      const {event,properties}=getEventWithProperties(project,change.event_id);targets.set(event.id,event.name);
      for(const p of properties)targets.set(p.property_id,p.property.name);
    }
  }
  return [...targets].map(([id,name])=>({id,name}));
}

/** Call only inside the inbox's validation savepoint or approval transaction. */
export function applyNativeDecisionChanges(project:string,changes:NativeDecisionChange[]):NativeDecisionResult[] {
  const seen=new Set<string>();
  return changes.map(change=>{
    if(change.op==='use_case_status') {
      const uc=getUseCaseOrThrow(project,change.use_case_id),key='status:'+uc.id;
      if(seen.has(key)||change.from===change.to)throw new BadRequestError('Use-case status changes must be distinct, with one transition per use case.');
      seen.add(key);
      if(uc.status!==change.from)throw new ConflictError('Use-case status changed. Review a fresh proposal.');
      const after=updateUseCase(project,uc.id,{status:change.to});
      return {op:change.op,action:'updated',entity_id:uc.id,entity_name:uc.name,before:uc.status,after:after.status};
    }
    const {event,properties}=getEventWithProperties(project,change.event_id);
    const conditions=normalizeConditions(change.conditions),key=event.id+':'+buildConditionsKey(conditions);
    if(seen.has(key))throw new BadRequestError('The proposal contains an equivalent variant more than once.');
    seen.add(key);
    // Native DAL checks global enums; also retain the narrower linked named-definition contract.
    for(const c of conditions) {
      const link=properties.find(p=>p.property_id===c.property_id);
      const globalAllowed=link?.property.allowed_values_json as {value:string}[]|null|undefined;
      if(link?.role!=='discriminator'||!globalAllowed?.length||c.values.some(v=>!globalAllowed.some(a=>a.value===v)))throw new BadRequestError('Variant conditions require current discriminator roles and allowed values.');
      const allowed=link?.definition?.allowed_values_json as {value:string}[]|null|undefined;
      if(allowed?.length&&c.values.some(v=>!allowed.some(a=>a.value===v)))throw new BadRequestError('Variant values must match the event property definition.');
    }
    const siblings=listVariants(project,event.id),existing=siblings.find(v=>v.conditions_key===buildConditionsKey(conditions));
    if(existing) {
      if(change.description!==undefined&&(change.description?.trim()||null)!==existing.description)throw new ConflictError('Equivalent variant exists with different documentation; propose an explicit amendment.');
      return {op:change.op,action:'already_present',entity_id:existing.id,entity_name:existing.name,event_id:event.id};
    }
    if(siblings.some(v=>overlaps(conditions,v.conditions_json)))throw new BadRequestError('Proposed variant overlaps an existing or earlier proposed variant. Resolve the predicates before approval.');
    const variant=createVariant(project,event.id,{conditions:change.conditions,description:change.description});
    return {op:change.op,action:'created',entity_id:variant.id,entity_name:variant.name,event_id:event.id};
  });
}
