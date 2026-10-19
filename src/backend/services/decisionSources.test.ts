import {beforeEach,afterEach,it,expect} from 'vitest';
import {closeDb,getDb} from '../db';
import {createClient} from '../dal/client.dal';
import {createProject} from '../dal/project.dal';
import {createUseCase,getUseCaseOrThrow} from '../dal/use-case.dal';
import {previewDecision,importDecision,listDecisions,actOnDecision,previewDecisionSources,reviewDecisionSources} from './decisionInbox.service';
import {buildBackup} from './backup.service';
import {previewRestore,applyRestore} from './backupRestore.service';
import type {DecisionSeed,DecisionSourceInput} from '../../domain/decisionInbox';
let project:string,uc:string,id:string,decisionHash:string;
const a='a'.repeat(64),b='b'.repeat(64);
beforeEach(()=>{
  process.env.E3_DB_PATH=':memory:';closeDb();
  project=createProject({client_id:createClient({key:'source-test',name:'Synthetic source test'}).id,key:'source-test',name:'Synthetic source test'}).id;
  uc=createUseCase(project,{name:'Synthetic pricing',notes:'Original'}).id;
  const seed:DecisionSeed={key:'SYNTHETIC-01',audiences:['technical_consultant'],review_role:'technical_consultant',summary:'Review selected-option price',confidence:'high',rationale:'Synthetic evidence',impact:'Notes only',alternatives:'Review later',execution_plan:'Separately approve and verify',evidence:[1,2].map(n=>({label:'Synthetic message '+n,url:'https://example.invalid/thread/'+n,claim:'Synthetic claim',captured_at:'2026-10-17T00:00:00Z',source_hash:a})),patches:[{use_case_id:uc,append_notes:'Approved acceptance criteria',add_requirements:[]}]};
  const card=importDecision(project,seed,previewDecision(project,seed).content_hash);id=card.id;decisionHash=card.content_hash;
  actOnDecision(project,id,decisionHash,'approve_documentation','Synthetic human reviewer','Fixture acceptance',true);
});
afterEach(()=>{closeDb();delete process.env.E3_DB_PATH;});
function capture():DecisionSourceInput{return {source_key:'synthetic_chat',baseline_package_hash:a,package_hash:a,captured_at:'2026-10-17T00:00:00Z',complete:true,records:[1,2].map(n=>({url:'https://example.invalid/thread/'+n,author:'Synthetic author',occurred_at:'2026-10-16T00:00:00Z',text:'Synthetic original message '+n}))};}
function apply(input=capture()){return reviewDecisionSources(project,id,input,previewDecisionSources(project,id,input).content_hash,'Synthetic source operator');}
function changed(){const input=capture();input.package_hash=b;input.records[0].text='Synthetic report: correction needs retesting';return input;}
function card(){return listDecisions(project).find(c=>c.id===id)!;}
function count(){return (getDb().prepare('SELECT COUNT(*) n FROM decision_source_captures').get() as {n:number}).n;}

it('binds exact original cited content without documentation changes or new approvals',()=>{
  const notes=getUseCaseOrThrow(project,uc).notes;const p=previewDecisionSources(project,id,capture());expect(count()).toBe(0);expect(p.mode).toBe('bind_original');
  apply();expect(card().source_review.tracked).toBe(true);expect(card().stale).toBe(false);expect(getUseCaseOrThrow(project,uc).notes).toBe(notes);
  expect(card().history.filter(h=>h.action==='approve_documentation')).toHaveLength(1);
});
it('creates one visible unapproved follow-up and blocks planning from changed evidence',()=>{
  apply();const notes=getUseCaseOrThrow(project,uc).notes;const result=apply(changed());const parent=card(),follow=listDecisions(project).find(c=>c.id===result.followup_id)!;
  expect(parent.stale).toBe(true);expect(parent.state).toBe('documented');expect(parent.source_review.requires_review).toBe(true);
  expect(()=>actOnDecision(project,id,decisionHash,'request_execution_plan','Reviewer','',true)).toThrow('cited evidence changed');
  expect(follow.state).toBe('proposed');expect(follow.payload.rationale).toContain('Previously captured');expect(follow.payload.rationale).toContain('correction needs retesting');
  expect(follow.history.map(h=>h.action)).toEqual(['proposed','source_capture_recorded']);expect(follow.source_review.tracked).toBe(true);expect(follow.stale).toBe(false);expect(getUseCaseOrThrow(project,uc).notes).toBe(notes);
  expect(parent.history.filter(h=>h.action==='approve_documentation')).toHaveLength(1);
});
it('replays identical capture receipts without another proposal or event',()=>{
  apply();const input=changed(),preview=previewDecisionSources(project,id,input);const first=reviewDecisionSources(project,id,input,preview.content_hash,'Operator');
  const n=count(),events=card().history.length;const again=reviewDecisionSources(project,id,input,preview.content_hash,'Operator');
  expect(again.replay).toBe(true);expect(again.followup_id).toBe(first.followup_id);expect(count()).toBe(n);expect(card().history).toHaveLength(events);expect(listDecisions(project)).toHaveLength(2);
  expect(()=>reviewDecisionSources(project,id,input,'wrong','Operator')).toThrow('Preview');
});
it('keeps a partial changed scan from replacing complete evidence or creating false invalidation',()=>{
  apply();const partial=changed();partial.complete=false;partial.records=partial.records.slice(0,1);apply(partial);
  expect(card().source_review.partial_captures).toBe(1);expect(card().source_review.requires_review).toBe(false);expect(card().stale).toBe(false);expect(listDecisions(project)).toHaveLength(1);
});
it('rejects incomplete first bind, wrong original package and foreign cited URLs',()=>{
  const partial=capture();partial.complete=false;expect(()=>apply(partial)).toThrow('First bind');
  const wrong=capture();wrong.package_hash=b;expect(()=>apply(wrong)).toThrow('First bind');
  const foreign=capture();foreign.records[0].url='https://other.invalid/foreign';expect(()=>apply(foreign)).toThrow('outside');expect(count()).toBe(0);
});
it('rejects duplicate URLs, missing complete coverage and a reused package hash with different text',()=>{
  const duplicate=capture();duplicate.records[1]={...duplicate.records[0]};expect(()=>apply(duplicate)).toThrow('Duplicate');
  const missing=capture();missing.records.pop();expect(()=>apply(missing)).toThrow('every cited URL');
  apply();const forged=changed();forged.package_hash=a;expect(()=>apply(forged)).toThrow('same package hash');expect(count()).toBe(1);
});
it('ignores package changes outside the selected cited content',()=>{
  apply();const harmless=capture();harmless.package_hash=b;apply(harmless);expect(card().stale).toBe(false);expect(listDecisions(project)).toHaveLength(1);
});
it('keeps invalidation sticky across source reversion and drafts each actual content transition',()=>{
  apply();const first=apply(changed());const revert=capture();revert.package_hash='c'.repeat(64);apply(revert);expect(card().stale).toBe(true);
  const repeated=changed();repeated.package_hash='d'.repeat(64);const again=apply(repeated);expect(again.followup_id).not.toBe(first.followup_id);expect(listDecisions(project)).toHaveLength(4);
});
it('keeps the reviewed follow-up dependent on later changes to the same cited evidence',()=>{
  apply();const first=apply(changed());const follow=listDecisions(project).find(c=>c.id===first.followup_id)!;
  actOnDecision(project,follow.id,follow.content_hash,'approve_documentation','Synthetic reviewer','Reviewed the updated evidence',true);
  const newer=changed();newer.package_hash='e'.repeat(64);newer.records[0].text='Synthetic later change: previous correction needs another review';
  const next=apply(newer);const previous=listDecisions(project).find(c=>c.id===follow.id)!;
  expect(previous.stale).toBe(true);expect(previous.source_review.requires_review).toBe(true);expect(previous.source_review.followup_ids).toContain(next.followup_id);
  expect(()=>actOnDecision(project,previous.id,previous.content_hash,'request_execution_plan','Reviewer','',true)).toThrow('cited evidence changed');
});
it('preserves source invalidation through a wording amendment instead of clearing it',()=>{
  apply();const first=apply(changed());const follow=listDecisions(project).find(c=>c.id===first.followup_id)!;
  const newer=changed();newer.package_hash='f'.repeat(64);newer.records[0].text='Synthetic later evidence changes again';apply(newer);
  const {project_id:_,revision:__,baselines:___,payload_version:_v,dependency_snapshot:_d,...seed}=follow.payload;seed.summary='Amended wording with the same cited evidence';
  const amendment=actOnDecision(project,follow.id,follow.content_hash,'amend','Reviewer','Wording clarification',true,seed);
  expect(amendment.source_review.tracked).toBe(true);expect(amendment.source_review.requires_review).toBe(true);expect(amendment.stale).toBe(true);
  expect(()=>actOnDecision(project,amendment.id,amendment.content_hash,'approve_documentation','Reviewer','',true)).toThrow('cited evidence changed');
});
it('requires a sourced follow-up to replace tracked citation references',()=>{
  apply();const current=card();const {project_id:_,revision:__,baselines:___,payload_version:_v,dependency_snapshot:_d,...seed}=current.payload;
  // A documented decision is closed already. Use a pending, tracked source follow-up.
  const update=apply(changed());const follow=listDecisions(project).find(c=>c.id===update.followup_id)!;
  const {project_id:_p,revision:_r,baselines:_b,payload_version:_v2,dependency_snapshot:_d2,...amendment}=follow.payload;
  amendment.evidence=amendment.evidence.map(e=>({...e,source_hash:'e'.repeat(64)}));
  expect(()=>actOnDecision(project,follow.id,follow.content_hash,'amend','Reviewer','Replace citations',true,amendment)).toThrow('sourced follow-up');
  expect(seed.key).toBe('SYNTHETIC-01');
});
it('rejects a stale preview after another complete capture and isolates projects',()=>{
  apply();const update=changed(),preview=previewDecisionSources(project,id,update);const harmless=capture();harmless.package_hash='c'.repeat(64);apply(harmless);
  expect(()=>reviewDecisionSources(project,id,update,preview.content_hash,'Operator')).toThrow('baseline changed');
  const other=createProject({client_id:createClient({key:'other-source',name:'Other synthetic'}).id,key:'other-source',name:'Other'}).id;
  expect(()=>previewDecisionSources(other,id,capture())).toThrow();expect(count()).toBe(2);
});
it('rolls back the capture and draft together on failed draft creation',()=>{
  apply();const before=count();getDb().exec("CREATE TRIGGER fail_source_draft BEFORE INSERT ON decision_revisions WHEN NEW.decision_key LIKE '%-SRC-%' BEGIN SELECT RAISE(ABORT,'controlled draft failure'); END;");
  expect(()=>apply(changed())).toThrow('controlled draft failure');expect(count()).toBe(before);expect(card().stale).toBe(false);expect(listDecisions(project)).toHaveLength(1);
});
it('restores exact source history as read-only without transferring authority',async()=>{
  apply();apply(changed());const original=(getDb().prepare('SELECT payload_json,capture_hash FROM decision_source_captures ORDER BY rowid').all());
  const backup=await buildBackup(project),preview=previewRestore(backup);const restored=await applyRestore(backup,preview.payload_hash,{client_id:createClient({key:'restored-source',name:'Restored synthetic'}).id,key:'restored-source',name:'Restored'});
  expect(restored.warnings).toEqual([]);expect(getDb().prepare('SELECT payload_json,capture_hash FROM decision_source_captures WHERE project_id=? ORDER BY rowid').all(restored.project.id)).toEqual(original);
  const parent=listDecisions(restored.project.id).find(c=>c.key==='SYNTHETIC-01')!;expect(parent.restored).toBe(true);expect(()=>previewDecisionSources(restored.project.id,parent.id,capture())).toThrow('Restored history');
  expect(()=>actOnDecision(restored.project.id,parent.id,parent.content_hash,'request_execution_plan','Reviewer','',true)).toThrow('read-only');
});
