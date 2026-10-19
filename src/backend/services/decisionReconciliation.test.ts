import {beforeEach,afterEach,it,expect} from 'vitest';
import {closeDb,getDb} from '../db';
import {createClient} from '../dal/client.dal';
import {createProject} from '../dal/project.dal';
import {createUseCase,getUseCaseOrThrow,updateUseCase} from '../dal/use-case.dal';
import {createProperty,getPropertyById,updateProperty} from '../dal/property.dal';
import {createEvent,attachPropertyToEvent,updateEventProperty} from '../dal/event.dal';
import {insertResolvedRequirement,listRequirements} from '../dal/requirement.dal';
import {createVariant,listVariants} from '../dal/variant.dal';
import {updateDefinition,getDefaultDefinitionId} from '../dal/property-definition.dal';
import {previewDecision,importDecision,listDecisions,actOnDecision,previewDecisionReconciliation,applyDecisionReconciliation,previewDecisionSources,reviewDecisionSources} from './decisionInbox.service';
import {decisionNoteBlock} from './decisionReconciliation.service';
import {payloadHash} from '../../domain/diff/hash';
import type {DecisionSeed,DecisionCard,DecisionPayload,NativeDecisionChange} from '../../domain/decisionInbox';

let project:string,uc:string,event:string,prop:string;
beforeEach(()=>{
  process.env.E3_DB_PATH=':memory:';closeDb();
  project=createProject({client_id:createClient({key:'reconcile',name:'Reconcile'}).id,key:'reconcile',name:'Reconcile'}).id;
  uc=createUseCase(project,{name:'Checkout',notes:'Original specification'}).id;
  event=createEvent(project,{name:'checkout'}).id;
  prop=createProperty(project,{name:'step',scope:'event',data_type:'string',allowed_values_json:[{value:'one'},{value:'two'}]}).id;
  attachPropertyToEvent(project,event,{property_id:prop,role:'discriminator'});
});
afterEach(()=>{closeDb();delete process.env.E3_DB_PATH;});
function seed(changes?:NativeDecisionChange[]):DecisionSeed {
  return {key:'RECON-01',audiences:['technical_consultant'],review_role:'technical_consultant',summary:'Review checkout contract',confidence:'high',rationale:'Supplied contract',impact:'Exact proposed changes',alternatives:'Defer',execution_plan:'Verify runtime separately',evidence:[{label:'Contract',url:'https://example.test/contract',claim:'Expected contract',captured_at:'2026-10-19T00:00:00Z',source_hash:'a'.repeat(64)}],patches:[{use_case_id:uc,append_notes:'Chosen checkout policy.',add_requirements:[]}],...(changes?{native_changes:changes}:{})};
}
function insert(s=seed()){return importDecision(project,s,previewDecision(project,s).content_hash);}
const current=(id:string)=>listDecisions(project).find(c=>c.id===id)!;
const approve=(c:DecisionCard)=>actOnDecision(project,c.id,c.content_hash,c.payload.native_changes?.length?'approve_and_apply':'approve_documentation','Reviewer','Reviewed',true);
const flag=():NativeDecisionChange=>({op:'event_property_required',event_id:event,property_id:prop,from:false,to:true});
const status=():NativeDecisionChange=>({op:'use_case_status',use_case_id:uc,from:null,to:'approved'});
function legacy(c:DecisionCard) {
  const {payload_version:_,dependency_snapshot:__,...p}=c.payload;
  const h=payloadHash(p);
  getDb().prepare('UPDATE decision_revisions SET payload_json=?,content_hash=? WHERE id=?').run(JSON.stringify(p),h,c.id);
  return current(c.id);
}
it('hash-binds readable v2 dependencies and ignores unrelated lifecycle, owner, descriptions and appended notes',()=>{
  const c=insert(seed([flag()]));
  expect(c.payload.payload_version).toBe(2);expect(c.payload.dependency_snapshot?.notes[uc]).toBe('Original specification');
  updateUseCase(project,uc,{status:'in_progress',owner:'New owner',notes:'Original specification\n\nAdditional context'});
  updateDefinition(project,prop,getDefaultDefinitionId(project,prop)!,{description:'Editorial wording'});
  expect(current(c.id).reconciliation?.status).toBe('ready');
  approve(c);expect(getUseCaseOrThrow(project,uc).notes).toContain('Additional context');expect(getUseCaseOrThrow(project,uc).status).toBe('in_progress');
});
it('required flags depend only on their target contract, not unrelated discriminators or sibling variants',()=>{
  const c=insert(seed([flag()]));
  const other=createProperty(project,{name:'other',scope:'event',data_type:'string',allowed_values_json:[{value:'x'}]}).id;
  attachPropertyToEvent(project,event,{property_id:other,role:'discriminator'});
  createVariant(project,event,{conditions:[{property_id:prop,operator:'equals',values:['two']}]});
  expect(current(c.id).reconciliation?.status).toBe('ready');approve(c);
});
it('reports exact replacement-note conflict and blocks every native write atomically',()=>{
  const c=insert(seed([status(),flag()]));updateUseCase(project,uc,{notes:'Replacement policy'});
  const r=current(c.id).reconciliation!;expect(r.status).toBe('conflict');expect(r.conflicts[0]).toMatchObject({path:`use_cases.${uc}.notes`,before:'Original specification',current:'Replacement policy'});
  expect(()=>approve(c)).toThrow('changed');expect(getUseCaseOrThrow(project,uc).status).toBe(null);expect(current(c.id).history).toHaveLength(1);
});
it('skips partial native satisfaction while applying remaining operations with explicit receipts',()=>{
  const c=insert(seed([status(),flag()]));updateUseCase(project,uc,{status:'approved'});
  expect(current(c.id).reconciliation).toMatchObject({status:'partially_satisfied',satisfied_operations:1,remaining_operations:2});
  const a=approve(c);expect(a.history.at(-1)?.detail.native_results).toMatchObject([{action:'already_present'},{action:'updated'}]);
  expect(approve(c).history).toEqual(a.history);
});
it('recognizes all exact effects as satisfied without inventing approval, or executing again',()=>{
  const c=insert(seed([status(),flag()]));
  updateUseCase(project,uc,{status:'approved',notes:'Original specification\n\n'+decisionNoteBlock(c.payload,c.payload.patches[0].append_notes)});
  updateEventProperty(project,event,prop,{required:true});
  const before=current(c.id),r=before.reconciliation!;
  expect(r).toMatchObject({status:'satisfied',can_approve:false,remaining_operations:0,satisfied_operations:3});
  expect(before.state).toBe('proposed');expect(before.history).toHaveLength(1);expect(()=>approve(c)).toThrow('already present');expect(current(c.id).history).toEqual(before.history);
});
it('never treats an unmarked text occurrence as documentation satisfaction',()=>{
  const c=insert();updateUseCase(project,uc,{notes:'Original specification\n\nChosen checkout policy.'});
  expect(current(c.id).reconciliation?.status).toBe('ready');approve(c);expect(getUseCaseOrThrow(project,uc).notes).toContain(decisionNoteBlock(c.payload,'Chosen checkout policy.'));
});
it('targets added requirements independently of other requirements and skips identical resolved targets',()=>{
  const s=seed();s.patches[0].add_requirements=[{target_kind:'event_property',event_id:event,property_id:prop,level:'R',note:'Required step'}];
  const c=insert(s);
  insertResolvedRequirement(project,uc,0,{target_kind:'event',event_id:event,level:'O',note:'Unrelated',status:'open'});
  expect(current(c.id).reconciliation?.status).toBe('ready');
  insertResolvedRequirement(project,uc,1,{...s.patches[0].add_requirements[0],status:'open'});
  expect(current(c.id).reconciliation?.status).toBe('partially_satisfied');approve(c);expect(listRequirements(project,uc)).toHaveLength(2);
});
it('conflicts on a target-specific requirement mismatch and unresolved/deleted targets',()=>{
  const s=seed();s.patches[0].add_requirements=[{target_kind:'event_property',event_id:event,property_id:prop,level:'R',note:'Required step'}];
  const c=insert(s);
  insertResolvedRequirement(project,uc,0,{target_kind:'event_property',event_id:event,property_id:prop,level:'O',note:'Different intent',status:'open'});
  expect(current(c.id).reconciliation?.conflicts[0].path).toContain('.requirements.');expect(()=>approve(c)).toThrow();
  getDb().prepare("UPDATE requirements SET level='R',note='Required step',status='gap' WHERE use_case_id=?").run(uc);
  expect(current(c.id).reconciliation?.conflicts[0].current).toBe('gap');
  getDb().prepare('UPDATE properties SET deleted_at=? WHERE id=?').run('2026-10-19T00:00:00Z',prop);
  expect(current(c.id).reconciliation?.status).toBe('conflict');expect(()=>approve(c)).toThrow();
});
it('detects a target type or named constraint change with exact dependency paths',()=>{
  const c=insert(seed([flag()]));updateProperty(project,prop,{data_type:'number'});
  const conflict=current(c.id).reconciliation!.conflicts.find(x=>x.path.endsWith('.data_type'))!;
  expect(conflict).toMatchObject({before:'string',current:'number'});expect(()=>approve(c)).toThrow('changed');
});
it('legacy drift is explained honestly and explicit refresh creates an unapproved immutable revision',()=>{
  const c=legacy(insert());const oldPayload=JSON.stringify(c.payload),oldHistory=c.history;
  updateUseCase(project,uc,{owner:'Unrelated edit'});
  expect(current(c.id).reconciliation).toMatchObject({status:'legacy_review',can_approve:false,can_reconcile:true,conflicts:[]});
  const p=previewDecisionReconciliation(project,c.id,c.content_hash);
  expect(listDecisions(project)).toHaveLength(1);expect(getUseCaseOrThrow(project,uc).notes).toBe('Original specification');
  const n=applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer');
  expect(n.revision).toBe(2);expect(n.state).toBe('proposed');expect(n.reconciliation?.status).toBe('ready');expect(n.history.every(h=>h.detail.approval===false)).toBe(true);
  const old=current(c.id);expect(JSON.stringify(old.payload)).toBe(oldPayload);expect(old.content_hash).toBe(c.content_hash);expect(old.history.slice(0,oldHistory.length)).toEqual(oldHistory);expect(old.reconciliation?.status).toBe('superseded');
  expect(applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer').id).toBe(n.id);
  expect(()=>applyDecisionReconciliation(project,c.id,c.content_hash,'wrong','Reviewer')).toThrow('replay');
});
it('reconcile token ignores unrelated metadata races but refuses changed relevant fields',()=>{
  const c=legacy(insert()),p=previewDecisionReconciliation(project,c.id,c.content_hash);
  updateUseCase(project,uc,{owner:'Concurrent owner',status:'in_progress'});
  expect(applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer').revision).toBe(2);
  const n=current(listDecisions(project).find(x=>x.revision===2)!.id),next=previewDecisionReconciliation(project,n.id,n.content_hash);
  updateUseCase(project,uc,{notes:'Replacement'});
  expect(()=>applyDecisionReconciliation(project,n.id,n.content_hash,next.content_hash,'Reviewer')).toThrow('changed after');
});
it('does not silently rewrite conflicting native intent during explicit reconciliation',()=>{
  const c=insert(seed([status()]));updateUseCase(project,uc,{status:'in_progress'});
  expect(()=>previewDecisionReconciliation(project,c.id,c.content_hash)).toThrow('status changed');expect(current(c.id).state).toBe('proposed');
});
it('restored and changed-source proposals cannot acquire authority through reconciliation',()=>{
  const c=insert();getDb().prepare('UPDATE decision_revisions SET restored=1 WHERE id=?').run(c.id);
  expect(current(c.id).reconciliation?.status).toBe('restored');expect(()=>previewDecisionReconciliation(project,c.id,c.content_hash)).toThrow('read-only');
  getDb().prepare('UPDATE decision_revisions SET restored=0 WHERE id=?').run(c.id);
  const capture={source_key:'contract',baseline_package_hash:'a'.repeat(64),package_hash:'a'.repeat(64),captured_at:'2026-10-19T01:00:00Z',complete:true,records:[{url:'https://example.test/contract',author:'Owner',occurred_at:'2026-10-19T00:00:00Z',text:'Original'}]};
  reviewDecisionSources(project,c.id,capture,previewDecisionSources(project,c.id,capture).content_hash,'Reviewer');
  const newer={...capture,package_hash:'b'.repeat(64),records:[{...capture.records[0],text:'Changed'}]};
  reviewDecisionSources(project,c.id,newer,previewDecisionSources(project,c.id,newer).content_hash,'Reviewer');
  expect(current(c.id).reconciliation?.status).toBe('source_review');expect(()=>previewDecisionReconciliation(project,c.id,c.content_hash)).toThrow('Cited evidence');
  const follow=listDecisions(project).find(x=>x.id!==c.id)!;expect(follow.payload.payload_version).toBe(2);expect(follow.payload.native_changes).toBeUndefined();
});
it('satisfied variants remain present and partial variant creation preserves exact receipt replay',()=>{
  const change:NativeDecisionChange={op:'create_variant',event_id:event,conditions:[{property_id:prop,operator:'equals',values:['one']}]};
  const c=insert(seed([change]));createVariant(project,event,{conditions:change.conditions});
  expect(current(c.id).reconciliation?.status).toBe('partially_satisfied');expect(approve(c).history.at(-1)?.detail.native_results).toMatchObject([{action:'already_present'}]);expect(listVariants(project,event)).toHaveLength(1);
});
function schemaSeed(derivation=false):DecisionSeed {
  return seed([{op:'property_schema',property_id:prop,from:{data_type:'string',item_schema_json:null,...(derivation?{derivation_json:null}:{})},to:{data_type:'array',item_schema_json:[{field:'product_id',data_type:'string',required:true}],...(derivation?{derivation_json:{source:'items',id_field:'product_id',form:'object_fields',fields:['product_id']}}:{})}}]);
}
it('previews global schema scope and applies exact schema via normal DAL history without inferred extra changes',()=>{
  const other=createEvent(project,{name:'payment'}).id;attachPropertyToEvent(project,other,{property_id:prop});
  const c=insert(schemaSeed());expect(c.native_targets?.find(x=>x.id===prop)).toMatchObject({scope:'global_property',affected_events:expect.arrayContaining([{id:event,name:'checkout'},{id:other,name:'payment'}])});
  const before=getPropertyById(project,prop)!;approve(c);const after=getPropertyById(project,prop)!;
  expect(after.data_type).toBe('array');expect(after.kind).toBe(before.kind);expect(after.derivation_json).toEqual(before.derivation_json);expect(after.item_schema_json).toEqual([{field:'product_id',data_type:'string',required:true}]);
  expect(getDb().prepare("SELECT COUNT(*) n FROM change_log WHERE source=? AND entity_type='property'").get('decision:'+c.id)).toEqual({n:1});
});
it('binds global schema affected links/definition constraints and skips satisfied schema changes',()=>{
  const c=insert(schemaSeed());const other=createEvent(project,{name:'other'}).id;attachPropertyToEvent(project,other,{property_id:prop});
  expect(current(c.id).reconciliation?.status).toBe('conflict');expect(()=>approve(c)).toThrow('changed');
  const p=previewDecisionReconciliation(project,c.id,c.content_hash),n=applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer');
  updateProperty(project,prop,{data_type:'array',item_schema_json:[{field:'product_id',data_type:'string',required:true}],kind:'event',derivation_json:null});
  expect(current(n.id).reconciliation?.status).toBe('partially_satisfied');expect(approve(n).history.at(-1)?.detail.native_results).toMatchObject([{action:'already_present'}]);
});
it('validates paired derivation changes and applies rich object derivation with the schema',()=>{
  updateProperty(project,prop,{kind:'state_list'});
  const c=insert(schemaSeed(true));approve(c);
  expect(getPropertyById(project,prop)?.derivation_json).toEqual({source:'items',id_field:'product_id',form:'object_fields',fields:['product_id']});
  const wrong=schemaSeed(true);(wrong.native_changes![0] as Extract<NativeDecisionChange,{op:'property_schema'}>).from={data_type:'array',item_schema_json:[]};wrong.key='WRONG';
  expect(()=>previewDecision(project,wrong)).toThrow('both');
});
it('rejects foreign schema targets, extra mutation fields and impossible item schema types',()=>{
  const s=schemaSeed();(s.native_changes![0] as Extract<NativeDecisionChange,{op:'property_schema'}>).property_id='missing';expect(()=>previewDecision(project,s)).toThrow('existing property');
  const unsafe={...schemaSeed(),native_changes:[{...schemaSeed().native_changes![0],status:'certified'}]};expect(()=>previewDecision(project,unsafe)).toThrow('Invalid');
  const impossible=schemaSeed();(impossible.native_changes![0] as Extract<NativeDecisionChange,{op:'property_schema'}>).to.data_type='number';expect(()=>previewDecision(project,impossible)).toThrow('array');
});
it('keeps unanswered business choices blocked until exact answers are saved in a fresh revision',()=>{
  const s=seed();s.questions=[{id:'window',label:'What is the agreed window?',answer:null}];const c=insert(s);
  expect(c.reconciliation).toMatchObject({status:'input_required',can_approve:false});expect(()=>approve(c)).toThrow('answers');
  const answered={...s,questions:[{id:'window',label:'What is the agreed window?',answer:'30 days'}]};
  const p=previewDecisionReconciliation(project,c.id,c.content_hash,answered);
  const n=applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer','Captured answer',answered);
  expect(n.state).toBe('proposed');expect(getUseCaseOrThrow(project,uc).notes).toBe('Original specification');
  approve(n);expect(getUseCaseOrThrow(project,uc).notes).toContain('Confirmed business answers\nWhat is the agreed window?\n30 days');
  expect(()=>previewDecision(project,{...s,key:'DUPLICATE',questions:[s.questions![0],s.questions![0]]})).toThrow('unique');
  expect(()=>previewDecision(project,{...s,key:'EMPTY',questions:[{...s.questions![0],answer:'  '}]})).toThrow('Invalid');
});
it('binds revised executable intent and rejects changed replay drafts and cross-key reconciliation',()=>{
  const c=legacy(insert()),revised=seed([flag()]);revised.summary='Exact executable change';
  const p=previewDecisionReconciliation(project,c.id,c.content_hash,revised);expect(p.intent_changed).toBe(true);
  expect(()=>applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer','',{...revised,summary:'Changed again'})).toThrow('changed after');
  expect(()=>previewDecisionReconciliation(project,c.id,c.content_hash,{...revised,key:'OTHER'})).toThrow('keep the decision key');
  const n=applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer','',revised);
  expect(n.payload.native_changes).toEqual([flag()]);expect(n.history[0].detail).toMatchObject({approval:false,execution_authorized:false,intent_changed:true});
  expect(()=>applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer','',seed())).toThrow('replay');
});
it('revised reconciliation cannot change tracked citation authority',()=>{
  const c=insert(),capture={source_key:'contract',baseline_package_hash:'a'.repeat(64),package_hash:'a'.repeat(64),captured_at:'2026-10-19T01:00:00Z',complete:true,records:[{url:'https://example.test/contract',author:'Owner',occurred_at:'2026-10-19T00:00:00Z',text:'Original'}]};
  reviewDecisionSources(project,c.id,capture,previewDecisionSources(project,c.id,capture).content_hash,'Reviewer');
  const revised=seed();revised.evidence[0].source_hash='c'.repeat(64);
  expect(()=>previewDecisionReconciliation(project,c.id,c.content_hash,revised)).toThrow('sourced follow-up');
  const valid=seed([flag()]),p=previewDecisionReconciliation(project,c.id,c.content_hash,valid),n=applyDecisionReconciliation(project,c.id,c.content_hash,p.content_hash,'Reviewer','',valid);
  expect(n.source_review.tracked).toBe(true);expect(n.source_review.requires_review).toBe(false);
});
