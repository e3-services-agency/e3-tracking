import type { NativeDecisionChange, NativeDecisionResult, NativeDecisionTarget } from '../../domain/decisionInbox';
import { payloadHash } from '../../domain/diff/hash';
import { buildConditionsKey, normalizeConditions, type VariantCondition } from '../../domain/variants';
import { getEventWithProperties, updateEventProperty } from '../dal/event.dal';
import { createVariant, listVariants } from '../dal/variant.dal';
import { getUseCaseOrThrow, updateUseCase } from '../dal/use-case.dal';
import { BadRequestError, ConflictError } from '../errors';
import {getPropertyById,updateProperty,type PropertyRow} from '../dal/property.dal';
import {listDefinitions,listUsageByPropertyId} from '../dal/property-definition.dal';
import {validateDerivation} from '../../domain/codegen/derivation';

// Missing conditions are unconstrained. Positive equals/in predicates intersect unless
// a shared property has disjoint values; adding such variants makes first-match QA ambiguous.
function overlaps(a:VariantCondition[],b:VariantCondition[]):boolean {
  return !a.some(x=>{const y=b.find(y=>y.property_id===x.property_id);return y&&!x.values.some(v=>y.values.includes(v));});
}

export function nativeDecisionBaselines(project:string,changes:NativeDecisionChange[]):Record<string,string> {
  return Object.fromEntries(changes.map((change,i)=>[String(i),payloadHash(change.op==='use_case_status'
    ? getUseCaseOrThrow(project,change.use_case_id)
    : change.op==='property_schema'?nativeDecisionSnapshots(project,[change])['0']
    : {...getEventWithProperties(project,change.event_id),variants:listVariants(project,change.event_id)})]));
}

function schemaValue(p:PropertyRow,change:Extract<NativeDecisionChange,{op:'property_schema'}>):Record<string,unknown> {
  return {data_type:p.data_type,item_schema_json:p.item_schema_json,...(Object.hasOwn(change.to,'derivation_json')?{derivation_json:p.derivation_json}:{})};
}
function schemaProperty(project:string,id:string) {
  const p=getPropertyById(project,id);
  if(!p)throw new BadRequestError('Schema changes require an existing property in this project.');
  return p;
}
const enumValues=(v:unknown)=>Array.isArray(v)?v.map(x=>typeof x==='object'&&x!==null?String((x as {value:unknown}).value):String(x)).sort():v;

/** Only fields that determine this operation's meaning or applicability. Kept in the
 * immutable proposal so reconciliation can explain an actual field change. */
export function nativeDecisionSnapshots(project:string,changes:NativeDecisionChange[]):Record<string,unknown> {
  return Object.fromEntries(changes.map((change,i)=>{
    if(change.op==='use_case_status')return [String(i),{value:getUseCaseOrThrow(project,change.use_case_id).status,contract:null}];
    if(change.op==='property_schema') {
      const p=schemaProperty(project,change.property_id);
      const usage=listUsageByPropertyId(project).get(p.id)??[];
      return [String(i),{value:schemaValue(p,change),contract:{name:p.name,scope:p.scope,kind:p.kind,
        ...(Object.hasOwn(change.to,'derivation_json')?{}:{derivation_json:p.derivation_json}),
        allowed_values_json:enumValues(p.allowed_values_json),data_formats_json:p.data_formats_json,
        definitions:listDefinitions(project,p.id).map(d=>({id:d.id,allowed_values_json:enumValues(d.allowed_values_json),formats_json:d.formats_json})).sort((a,b)=>a.id.localeCompare(b.id)),
        affected_events:usage.map(u=>({id:u.id,role:u.role,definition_id:u.definition_id})).sort((a,b)=>a.id.localeCompare(b.id)),
      }}];
    }
    const {event,properties}=getEventWithProperties(project,change.event_id);
    const relevant=properties.filter(p=>change.op==='event_property_required'?p.property_id===change.property_id:change.conditions.some(c=>c.property_id===p.property_id));
    const links=relevant.map(p=>({property_id:p.property_id,role:p.role,payload_key:p.payload_key,definition_id:p.definition_id,
      property:{name:p.property.name,data_type:p.property.data_type,data_formats_json:p.property.data_formats_json,
        allowed_values_json:enumValues(p.property.allowed_values_json),value_schema_json:p.property.value_schema_json,item_schema_json:p.property.item_schema_json},
      definition:p.definition?{allowed_values_json:enumValues(p.definition.allowed_values_json),formats_json:p.definition.formats_json}:null,
    })).sort((a,b)=>a.property_id.localeCompare(b.property_id));
    const intendedKeys=new Set(changes.filter(c=>c.op==='create_variant'&&c.event_id===change.event_id).map(c=>buildConditionsKey(normalizeConditions((c as Extract<NativeDecisionChange,{op:'create_variant'}>).conditions))));
    const variants=listVariants(project,change.event_id);
    const siblings=variants.filter(v=>!intendedKeys.has(v.conditions_key)&&change.op==='create_variant'&&overlaps(normalizeConditions(change.conditions),v.conditions_json)).map(v=>({conditions_key:v.conditions_key})).sort((a,b)=>a.conditions_key.localeCompare(b.conditions_key));
    if(change.op==='event_property_required') {
      const link=properties.find(p=>p.property_id===change.property_id);
      if(!link)throw new BadRequestError('Required-field changes must target an existing property link in this project.');
      return [String(i),{value:link.required,contract:{event_name:event.name,links}}];
    }
    const existing=variants.find(v=>v.conditions_key===buildConditionsKey(normalizeConditions(change.conditions)));
    return [String(i),{value:existing?{present:true,...(change.description===undefined?{}:{description:existing.description})}:null,contract:{event_name:event.name,links,siblings}}];
  }));
}

export function nativeDecisionTargets(project:string,changes:NativeDecisionChange[]):NativeDecisionTarget[] {
  const targets=new Map<string,string>();
  for(const change of changes) {
    if(change.op==='use_case_status') {
      const uc=getUseCaseOrThrow(project,change.use_case_id);targets.set(uc.id,uc.name);
    } else if(change.op==='property_schema') {
      const p=schemaProperty(project,change.property_id);targets.set(p.id,p.name);
    } else {
      const {event,properties}=getEventWithProperties(project,change.event_id);targets.set(event.id,event.name);
      for(const p of properties)targets.set(p.property_id,p.property.name);
    }
  }
  const schemaIds=new Set(changes.filter(c=>c.op==='property_schema').map(c=>c.property_id));
  const usage=schemaIds.size?listUsageByPropertyId(project):null;
  return [...targets].map(([id,name])=>({id,name,...(schemaIds.has(id)?{scope:'global_property' as const,affected_events:(usage?.get(id)??[]).map(u=>({id:u.id,name:u.name}))}:{})}));
}

/** Call only inside the inbox's validation savepoint or approval transaction. */
export function applyNativeDecisionChanges(project:string,changes:NativeDecisionChange[],allowSatisfied=false):NativeDecisionResult[] {
  const seen=new Set<string>();
  return changes.map(change=>{
    if(change.op==='property_schema') {
      const p=schemaProperty(project,change.property_id),key='schema:'+p.id;
      if(seen.has(key)||payloadHash(change.from)===payloadHash(change.to))throw new BadRequestError('Schema changes must be distinct, with one transition per property.');
      seen.add(key);
      if(Object.hasOwn(change.from,'derivation_json')!==Object.hasOwn(change.to,'derivation_json'))throw new BadRequestError('A derivation change must include both the exact previous and intended derivation.');
      for(const side of [change.from,change.to]) {
        if(side.derivation_json!==undefined&&validateDerivation(side.derivation_json))throw new BadRequestError(validateDerivation(side.derivation_json)!);
        if(side.item_schema_json!==null&&side.data_type!=='array')throw new BadRequestError('Item schema requires array data type.');
      }
      const before=schemaValue(p,change);
      if(allowSatisfied&&payloadHash(before)===payloadHash(change.to))return {op:change.op,action:'already_present',entity_id:p.id,entity_name:p.name,property_id:p.id,before,after:before};
      if(payloadHash(before)!==payloadHash(change.from))throw new ConflictError('Property schema changed. Review a fresh proposal.');
      const after=updateProperty(project,p.id,{...change.to,kind:p.kind,derivation_json:Object.hasOwn(change.to,'derivation_json')?change.to.derivation_json:p.derivation_json});
      return {op:change.op,action:'updated',entity_id:p.id,entity_name:p.name,property_id:p.id,before,after:schemaValue(after,change)};
    }
    if(change.op==='use_case_status') {
      const uc=getUseCaseOrThrow(project,change.use_case_id),key='status:'+uc.id;
      if(seen.has(key)||change.from===change.to)throw new BadRequestError('Use-case status changes must be distinct, with one transition per use case.');
      seen.add(key);
      if(allowSatisfied&&uc.status===change.to)return {op:change.op,action:'already_present',entity_id:uc.id,entity_name:uc.name,before:uc.status,after:uc.status};
      if(uc.status!==change.from)throw new ConflictError('Use-case status changed. Review a fresh proposal.');
      const after=updateUseCase(project,uc.id,{status:change.to});
      return {op:change.op,action:'updated',entity_id:uc.id,entity_name:uc.name,before:uc.status,after:after.status};
    }
    const {event,properties}=getEventWithProperties(project,change.event_id);
    if(change.op==='event_property_required') {
      const link=properties.find(p=>p.property_id===change.property_id),key=`required:${event.id}:${change.property_id}`;
      if(!link)throw new BadRequestError('Required-field changes must target an existing property link in this project.');
      if(seen.has(key)||change.from===change.to)throw new BadRequestError('Required-field changes must be distinct, with one transition per event property.');
      seen.add(key);
      if(allowSatisfied&&link.required===change.to)return {op:change.op,action:'already_present',entity_id:`${event.id}:${change.property_id}`,entity_name:`${event.name}.${link.property.name}`,event_id:event.id,property_id:change.property_id,before:link.required,after:link.required};
      if(link.required!==change.from)throw new ConflictError('Event property requirement changed. Review a fresh proposal.');
      const after=updateEventProperty(project,event.id,change.property_id,{required:change.to});
      return {op:change.op,action:'updated',entity_id:`${event.id}:${change.property_id}`,entity_name:`${event.name}.${link.property.name}`,event_id:event.id,property_id:change.property_id,before:link.required,after:after.required};
    }
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
