import {beforeEach,afterEach,it,expect} from 'vitest';
import {getDb,closeDb} from '../db';
import {createClient} from '../dal/client.dal';
import {createProject} from '../dal/project.dal';
import {createUseCase,getUseCaseOrThrow,updateUseCase} from '../dal/use-case.dal';
import {createQaRun,updateQaRun} from '../dal/qa-run.dal';
import {previewAssetLinks,applyAssetLinks,projectImplementation} from './assetLinks.service';
import {buildBackup} from './backup.service';
import {previewRestore,applyRestore} from './backupRestore.service';
import type {AssetLinkPackage} from '../../domain/assetLinks';
const source='11111111-1111-4111-8111-111111111111',a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
let project:string,uc:string;
function asset(id='synthetic-a',status='active'){return {id,type:'scenarios',name:'Synthetic '+id,status:{status,archived:false},source_url:'https://synthetic.bloomreach.co/p/test/campaigns/'+id,config_hash:status};}
function capture(hash=a,date='2026-10-16T00:00:00Z',assets=[asset()],partial=false){
 const run=createQaRun(project,{kind:'manual',source:'extension',actor:'Synthetic fixture',manifest_json:{format:'e3-captured-evidence-v1',kind:'project_snapshot',source_sha256:hash,source_project_id:source,filename:'synthetic.zip',facts:{observed_at:date,partial,coverage:[{asset_type:'scenarios',listed:assets.length,collected:assets.length}]},assets,rows:[],checks:[]}});
 updateQaRun(project,run.id,{archived:true});return run.id;
}
function input():AssetLinkPackage{return {format:'e3-reviewed-asset-links-v1',source_project_id:source,review:{record_id:'synthetic-review',revision:1,content_hash:a},links:[{use_case_id:uc,use_case_code:'SYN-01',use_case_name:'Synthetic use case',asset_type:'scenarios',asset_id:'synthetic-a',relation:'implements',evidence_source_sha256:a,mapping_basis:'Synthetic exact asset review',coverage:'unverified'}]};}
function apply(v=input()){return applyAssetLinks(project,v,previewAssetLinks(project,v).payload_hash,'Synthetic reviewer',true);}
function row(id=uc,p=project){return projectImplementation(p).use_cases.find(u=>u.use_case_id===id)!;}
function counts(){return ['asset_link_imports','use_case_asset_links'].map(t=>(getDb().prepare('SELECT COUNT(*) n FROM '+t).get() as {n:number}).n);}
beforeEach(()=>{process.env.E3_DB_PATH=':memory:';closeDb();project=createProject({client_id:createClient({key:'links',name:'Synthetic links'}).id,key:'links',name:'Synthetic links'}).id;uc=createUseCase(project,{name:'Synthetic use case',code:'SYN-01',notes:'Original notes',status:'proposed'}).id;capture();});
afterEach(()=>{closeDb();delete process.env.E3_DB_PATH;});
it('previews exact additions without writes and requires explicit human confirmation',()=>{
 const preview=previewAssetLinks(project,input());expect(preview.additions).toBe(1);expect(counts()).toEqual([0,0]);
 expect(()=>applyAssetLinks(project,input(),preview.payload_hash,'Operator',false)).toThrow('confirmation');expect(counts()).toEqual([0,0]);
});
it('applies only links, preserves notes/lifecycle/QA and replays the retained receipt',async()=>{
 const before=await buildBackup(project),v=input(),p=previewAssetLinks(project,v),first=applyAssetLinks(project,v,p.payload_hash,'Reviewer',true);
 const after=await buildBackup(project);for(const table of ['use_cases','requirements','observations','findings','decision_events','qa_runs'] as const)expect(after[table]).toEqual(before[table]);
 expect(row().state).toBe('active');expect(row().coverage).toBe('unverified');expect(row().requirements_with_observations).toBe(0);
 const again=applyAssetLinks(project,v,p.payload_hash,'Reviewer',true);expect(again.id).toBe(first.id);expect(again.duplicate).toBe(true);expect(counts()).toEqual([1,1]);
 expect(previewAssetLinks(project,v).additions).toBe(0);expect(()=>applyAssetLinks(project,v,'wrong','Reviewer',true)).toThrow('hash');
});
it('rejects duplicate rows, unknown assets, foreign UCs and source-project mismatches',()=>{
 const dup=input();dup.links.push({...dup.links[0]});expect(()=>previewAssetLinks(project,dup)).toThrow('Duplicate');
 const missing=input();missing.links[0].asset_id='missing';expect(()=>previewAssetLinks(project,missing)).toThrow('missing');
 const other=createProject({client_id:createClient({key:'other',name:'Other'}).id,key:'other',name:'Other'}).id;
 const foreign=input();foreign.links[0].use_case_id=createUseCase(other,{name:'Synthetic use case',code:'SYN-01'}).id;expect(()=>previewAssetLinks(project,foreign)).toThrow('identity');
 const wrong=input();wrong.source_project_id='22222222-2222-4222-8222-222222222222';expect(()=>previewAssetLinks(project,wrong)).toThrow('binding');expect(counts()).toEqual([0,0]);
});
it('rejects malformed or unreviewed package fields',()=>{
 expect(()=>previewAssetLinks(project,{...input(),extra:'unreviewed'})).toThrow('Invalid');const v=input();v.links[0].coverage='complete' as any;expect(()=>previewAssetLinks(project,v)).toThrow('Invalid');
});
it('refuses a stale preview after a UC identity change',()=>{
 const v=input(),p=previewAssetLinks(project,v);updateUseCase(project,uc,{name:'Changed'});expect(()=>applyAssetLinks(project,v,p.payload_hash,'Reviewer',true)).toThrow('identity');expect(counts()).toEqual([0,0]);
});
it('refuses a stale preview after a newer source capture arrives',()=>{
 const v=input(),p=previewAssetLinks(project,v);capture(b,'2026-10-17T00:00:00Z');expect(()=>applyAssetLinks(project,v,p.payload_hash,'Reviewer',true)).toThrow('stale');expect(counts()).toEqual([0,0]);
});
it('does not silently replace an existing relation or mapping review',()=>{
 apply();const changed=input();changed.links[0].relation='supports';expect(()=>previewAssetLinks(project,changed)).toThrow('replacement');
 const review=input();review.review.record_id='another-review';expect(()=>previewAssetLinks(project,review)).toThrow('replacement');
});
it('uses source observation time instead of import order',()=>{
 apply();capture(b,'2026-10-20T00:00:00Z',[asset('synthetic-a','active')]);capture(c,'2026-10-10T00:00:00Z',[asset('synthetic-a','inactive')]);
 expect(row().state).toBe('active');expect(row().assets[0].captured_at).toBe('2026-10-20T00:00:00Z');
});
it('preserves prior asset evidence across a newer partial empty scan',()=>{
 apply();capture(b,'2026-10-20T00:00:00Z',[],true);const current=row();expect(current.state).toBe('active');expect(current.assets[0].missing_in_latest).toBe(true);expect(current.assets[0].captured_at).toBe('2026-10-16T00:00:00Z');
});
it('shows changed captured state without changing lifecycle or QA',()=>{
 apply();capture(b,'2026-10-20T00:00:00Z',[asset('synthetic-a','paused')],true);expect(row().state).toBe('paused');expect(row().assets[0].partial).toBe(true);expect(getUseCaseOrThrow(project,uc).status).toBe('proposed');expect(getUseCaseOrThrow(project,uc).notes).toBe('Original notes');
});
it('exposes simultaneous conflicting evidence as unknown',()=>{
 apply();capture(b,'2026-10-20T00:00:00Z',[asset('synthetic-a','active')]);capture(c,'2026-10-20T00:00:00Z',[asset('synthetic-a','inactive')]);expect(row().state).toBe('unknown');expect(row().assets[0].conflict).toBe(true);
});
it('reports mixed implementation assets without treating a supporting asset as whole-UC delivery',()=>{
 capture(b,'2026-10-17T00:00:00Z',[asset(),asset('synthetic-b','draft')]);const v=input();v.links[0].evidence_source_sha256=b;v.links.push({...v.links[0],asset_id:'synthetic-b'});apply(v);expect(row().state).toBe('mixed');expect(row().assets).toHaveLength(2);
});
it('keeps a support-only relation and unlinked UCs from claiming active implementation',()=>{
 const v=input();v.links[0].relation='supports';apply(v);expect(row().state).toBe('unknown');const other=createUseCase(project,{name:'Unlinked'});expect(row(other.id).state).toBe('unlinked');expect(row(other.id).assets).toEqual([]);
});
it('rolls back the import receipt and every link if one insert fails',()=>{
 capture(b,'2026-10-17T00:00:00Z',[asset(),asset('synthetic-b')]);const v=input();v.links[0].evidence_source_sha256=b;v.links.push({...v.links[0],asset_id:'synthetic-b'});
 getDb().exec("CREATE TRIGGER fail_link BEFORE INSERT ON use_case_asset_links WHEN NEW.asset_id='synthetic-b' BEGIN SELECT RAISE(ABORT,'Synthetic link failure'); END;");
 expect(()=>apply(v)).toThrow('Synthetic link failure');expect(counts()).toEqual([0,0]);
});
it('restores immutable mapping payloads as read-only history without transferring authority',async()=>{
 apply();const backup=await buildBackup(project),client=createClient({key:'restore',name:'Restore'});const p=previewRestore(backup),restored=await applyRestore(backup,p.payload_hash,{name:'Restored',key:'restore',client_id:client.id});
 const restoredUC=projectImplementation(restored.project.id).use_cases[0];expect(restoredUC.state).toBe('restored_history');expect(restoredUC.assets[0].restored).toBe(true);
 const copied=await buildBackup(restored.project.id);expect(copied.asset_link_imports[0].package_json).toEqual(backup.asset_link_imports[0].package_json);expect(copied.use_case_asset_links[0].link_json).toEqual(backup.use_case_asset_links[0].link_json);
 expect(copied.use_case_asset_links[0].use_case_id).not.toBe(uc);expect(()=>previewAssetLinks(restored.project.id,input())).toThrow('identity');
 const fresh=input();fresh.links[0].use_case_id=restoredUC.use_case_id;fresh.review.record_id='Fresh destination review';applyAssetLinks(restored.project.id,fresh,previewAssetLinks(restored.project.id,fresh).payload_hash,'Destination reviewer',true);
 expect(row(restoredUC.use_case_id,restored.project.id).state).toBe('active');expect(row(restoredUC.use_case_id,restored.project.id).assets).toHaveLength(1);
});

it('exposes undated evidence uncertainty and never renders unsafe source links',()=>{
 apply();capture(b,'not-a-date',[asset('synthetic-a','inactive')]);expect(row().state).toBe('active');expect(row().assets[0].undated_capture).toBe(true);
 const bad={...asset(),source_url:'javascript:alert(1)'};capture(c,'2026-10-21T00:00:00Z',[bad]);expect(row().assets[0].source_url).toBeNull();
});
