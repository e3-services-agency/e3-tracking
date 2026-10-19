import {beforeEach,afterEach,it,expect} from 'vitest';
import {closeDb,getDb} from '../db';
import {createClient} from '../dal/client.dal';
import {createProject} from '../dal/project.dal';
import {createUseCase,getUseCaseOrThrow,updateUseCase} from '../dal/use-case.dal';
import {createProperty,updateProperty} from '../dal/property.dal';
import {createEvent,attachPropertyToEvent,updateEventProperty} from '../dal/event.dal';
import {createVariant,listVariants} from '../dal/variant.dal';
import {updateDefinition,getDefaultDefinitionId} from '../dal/property-definition.dal';
import {previewDecision,importDecision,listDecisions,actOnDecision,previewDecisionSources,reviewDecisionSources} from './decisionInbox.service';
import {buildBackup} from './backup.service';
import {previewRestore,applyRestore} from './backupRestore.service';
import type {DecisionSeed,DecisionCard,NativeDecisionChange,DecisionSourceInput} from '../../domain/decisionInbox';

let project:string,uc:string,eventId:string,actionId:string;
beforeEach(()=>{
  process.env.E3_DB_PATH=':memory:';closeDb();
  project=createProject({client_id:createClient({key:'native',name:'Native'}).id,key:'native',name:'Native'}).id;
  uc=createUseCase(project,{name:'Synthetic use case',notes:'Original'}).id;
  eventId=createEvent(project,{name:'synthetic_cart'}).id;
  actionId=createProperty(project,{scope:'event',name:'action',data_type:'string',allowed_values_json:['a','b','c','d','e','f'].map(value=>({value,label:value}))}).id;
  attachPropertyToEvent(project,eventId,{property_id:actionId,role:'discriminator'});
});
afterEach(()=>{closeDb();delete process.env.E3_DB_PATH;});
function variant(value:string):Extract<NativeDecisionChange,{op:'create_variant'}>{return {op:'create_variant',event_id:eventId,conditions:[{property_id:actionId,operator:'equals',values:[value]}]};}
function seed():DecisionSeed{return {key:'NATIVE-01',audiences:['technical_consultant'],review_role:'technical_consultant',summary:'Apply the exact native changes',confidence:'high',rationale:'Synthetic evidence',impact:'One status and five variants',alternatives:'Defer',execution_plan:'Verify actual payloads separately',evidence:[{label:'Synthetic source',url:'https://example.invalid/native',claim:'Synthetic contract',captured_at:'2026-10-19T00:00:00Z',source_hash:'a'.repeat(64)}],patches:[{use_case_id:uc,append_notes:'Reviewed native contract; runtime QA pending.',add_requirements:[]}],native_changes:[{op:'use_case_status',use_case_id:uc,from:null,to:'approved'},...['a','b','c','d','e'].map(variant)]};}
function insert(s=seed()){return importDecision(project,s,previewDecision(project,s).content_hash);}
function apply(c:DecisionCard){return actOnDecision(project,c.id,c.content_hash,'approve_and_apply','Synthetic reviewer','Reviewed exact changes',true);}
function counts(){return {variants:listVariants(project,eventId).length,status:getUseCaseOrThrow(project,uc).status,notes:getUseCaseOrThrow(project,uc).notes,changes:(getDb().prepare('SELECT COUNT(*) n FROM change_log').get() as {n:number}).n,events:(getDb().prepare('SELECT COUNT(*) n FROM decision_events').get() as {n:number}).n};}

it('preview/import retain no native writes; one approval changes status and creates five variants with an exact receipt',()=>{
  const before=counts(),s=seed(),preview=previewDecision(project,s);expect(counts()).toEqual(before);
  const c=importDecision(project,s,preview.content_hash);expect(counts().variants).toBe(0);expect(counts().status).toBe(null);
  const a=apply(c),receipt=a.history.at(-1)!;expect(counts().status).toBe('approved');expect(counts().variants).toBe(5);
  expect(a.stale).toBe(false);expect(a.state).toBe('documented');expect(receipt.action).toBe('approve_and_apply');
  expect(receipt.detail.execution_status).toBe('applied');expect(receipt.detail.verification).toBe('not performed');
  const results=receipt.detail.native_results as {entity_id:string}[];expect(results.map(r=>r.entity_id)).toEqual([uc,...listVariants(project,eventId).map(v=>v.id)]);
  expect(getDb().prepare('SELECT COUNT(*) n FROM observations').get()).toEqual({n:0});
  expect(getDb().prepare('SELECT DISTINCT actor,source,batch_id FROM change_log WHERE source=?').all('decision:'+c.id)).toEqual([{actor:'Synthetic reviewer',source:'decision:'+c.id,batch_id:c.id}]);
});
it('replays approval without duplicate records, including after an unrelated later edit',()=>{
  const c=insert(),first=apply(c),before=counts();expect(apply(c).history).toEqual(first.history);expect(counts()).toEqual(before);
  updateUseCase(project,uc,{owner:'Later owner'});const next=counts();const replay=apply(c);expect(counts()).toEqual(next);expect(replay.stale).toBe(true);expect(replay.history).toEqual(first.history);
  expect(insert().id).toBe(c.id);
});
it('refuses missing confirmation, mismatched hash, documentation-only approval and arbitrary native operations',()=>{
  const c=insert(),before=counts();expect(()=>actOnDecision(project,c.id,c.content_hash,'approve_and_apply','Reviewer','',false)).toThrow('confirmation');
  expect(()=>actOnDecision(project,c.id,'wrong','approve_and_apply','Reviewer','',true)).toThrow('mismatch');
  expect(()=>actOnDecision(project,c.id,c.content_hash,'approve_documentation','Reviewer','',true)).toThrow('Approve and apply');
  expect(()=>previewDecision(project,{...seed(),native_changes:[{op:'run_code',code:'anything'}]})).toThrow('Invalid');expect(counts()).toEqual(before);
});
it.each(['status','enum','role','sibling','named definition'])('refuses approval after a changed %s baseline',kind=>{
  const c=insert();
  if(kind==='status')updateUseCase(project,uc,{status:'in_progress'});
  if(kind==='enum')updateProperty(project,actionId,{allowed_values_json:['a','b','c','d','e','f','g'].map(value=>({value,label:value}))});
  if(kind==='role')updateEventProperty(project,eventId,actionId,{role:'normal'});
  if(kind==='sibling')createVariant(project,eventId,{conditions:[{property_id:actionId,operator:'equals',values:['f']}]});
  if(kind==='named definition')updateDefinition(project,actionId,getDefaultDefinitionId(project,actionId)!,{description:'Newer contract'});
  const before=counts();expect(listDecisions(project)[0].stale).toBe(true);expect(()=>apply(c)).toThrow('changed');expect(counts()).toEqual(before);
});
it('rolls back all native writes, notes, change history and approval when the fifth variant fails',()=>{
  const c=insert(),before=counts();getDb().exec("CREATE TRIGGER fail_fifth BEFORE INSERT ON variants WHEN NEW.name LIKE '%action=e%' BEGIN SELECT RAISE(ABORT, 'synthetic fifth failure'); END;");
  expect(()=>apply(c)).toThrow();expect(counts()).toEqual(before);expect(listDecisions(project)[0].state).toBe('proposed');
});
it('rolls back native execution when the later documentation write fails',()=>{
  const c=insert(),before=counts();getDb().exec("CREATE TRIGGER fail_notes BEFORE UPDATE ON use_cases WHEN NEW.notes <> OLD.notes BEGIN SELECT RAISE(ABORT, 'synthetic notes failure'); END;");
  expect(()=>apply(c)).toThrow();expect(counts()).toEqual(before);
});
it('rejects foreign target IDs in both native operations without retaining writes',()=>{
  const other=createProject({client_id:createClient({key:'other',name:'Other'}).id,key:'other',name:'Other'}).id;
  const foreignUC=createUseCase(other,{name:'Foreign'}).id,foreignEvent=createEvent(other,{name:'foreign'}).id;
  const before=counts(),s=seed();s.native_changes=[{op:'use_case_status',use_case_id:foreignUC,from:null,to:'approved'}];expect(()=>previewDecision(project,s)).toThrow();
  s.native_changes=[{...variant('a'),event_id:foreignEvent} as NativeDecisionChange];expect(()=>previewDecision(project,s)).toThrow();expect(counts()).toEqual(before);
});
it('rejects overlapping existing and proposed variants, duplicate transitions and unchanged status',()=>{
  createVariant(project,eventId,{conditions:[{property_id:actionId,operator:'in',values:['a','b']}]});
  const s=seed(),before=counts();s.native_changes=[variant('a')];expect(()=>previewDecision(project,s)).toThrow('overlaps');
  s.native_changes=[{...variant('c'),conditions:[{property_id:actionId,operator:'in',values:['c','d']}]},variant('d')];expect(()=>previewDecision(project,s)).toThrow('overlaps');
  s.native_changes=[{op:'use_case_status',use_case_id:uc,from:null,to:null}];expect(()=>previewDecision(project,s)).toThrow('distinct');
  s.native_changes=[{op:'use_case_status',use_case_id:uc,from:null,to:'approved'},{op:'use_case_status',use_case_id:uc,from:'approved',to:'live'}];expect(()=>previewDecision(project,s)).toThrow('one transition');expect(counts()).toEqual(before);
});
it('treats conditions on different properties as intersecting',()=>{
  const method=createProperty(project,{scope:'event',name:'method',data_type:'string',allowed_values_json:[{value:'x'}]}).id;attachPropertyToEvent(project,eventId,{property_id:method,role:'discriminator'});
  const s=seed();s.native_changes=[variant('a'),{op:'create_variant',event_id:eventId,conditions:[{property_id:method,operator:'equals',values:['x']}]}];expect(()=>previewDecision(project,s)).toThrow('overlaps');expect(listVariants(project,eventId)).toHaveLength(0);
});
it('retains equivalent existing variants with explicit already-present receipts',()=>{
  const existing=createVariant(project,eventId,{conditions:[{property_id:actionId,operator:'equals',values:['a']}]});const a=apply(insert());
  expect((a.history.at(-1)!.detail.native_results as {action:string;entity_id:string}[])[1]).toMatchObject({action:'already_present',entity_id:existing.id});expect(listVariants(project,eventId)).toHaveLength(5);
});
it('never converts a legacy documentation approval into execution',()=>{
  const s=seed();delete s.native_changes;const c=insert(s);actOnDecision(project,c.id,c.content_hash,'approve_documentation','Reviewer','',true);const before=counts();expect(()=>apply(c)).toThrow('new reviewed proposal');expect(counts()).toEqual(before);
});
it('amendment binds a fresh native baseline without changing the original proposal',()=>{
  const c=insert(),s=seed();s.summary='Revised status and variants';const amended=actOnDecision(project,c.id,c.content_hash,'amend','Reviewer','Reviewed revision',true,s);
  expect(amended.state).toBe('proposed');expect(amended.stale).toBe(false);expect(counts().variants).toBe(0);expect(()=>apply(c)).toThrow('superseded');expect(apply(amended).stale).toBe(false);
});
it('source-review follow-ups never inherit executable native changes',()=>{
  const c=apply(insert());const source:DecisionSourceInput={source_key:'native_source',baseline_package_hash:'a'.repeat(64),package_hash:'a'.repeat(64),captured_at:'2026-10-19T00:00:00Z',complete:true,records:[{url:'https://example.invalid/native',author:'Synthetic author',occurred_at:'2026-10-18T00:00:00Z',text:'Original synthetic contract'}]};
  reviewDecisionSources(project,c.id,source,previewDecisionSources(project,c.id,source).content_hash,'Operator');
  source.package_hash='b'.repeat(64);source.records[0].text='Changed synthetic contract';
  const receipt=reviewDecisionSources(project,c.id,source,previewDecisionSources(project,c.id,source).content_hash,'Operator');
  const follow=listDecisions(project).find(d=>d.id===receipt.followup_id)!;expect(follow.payload.native_changes).toBeUndefined();expect(follow.payload.native_baselines).toBeUndefined();expect(follow.state).toBe('proposed');expect(counts().variants).toBe(5);
});
it('backup/restore preserves execution receipts and hashes while prohibiting destination replay',async()=>{
  const c=apply(insert()),backup=await buildBackup(project),p=previewRestore(backup);const restored=await applyRestore(backup,p.payload_hash,{client_id:createClient({key:'restored',name:'Restored'}).id,key:'restored',name:'Restored'});
  const copy=listDecisions(restored.project.id)[0];expect(copy.content_hash).toBe(c.content_hash);expect(copy.history).toHaveLength(2);expect(copy.history[1].detail).toEqual(c.history[1].detail);expect(copy.restored).toBe(true);expect(()=>actOnDecision(restored.project.id,copy.id,copy.content_hash,'approve_and_apply','Reviewer','',true)).toThrow('read-only');
});
