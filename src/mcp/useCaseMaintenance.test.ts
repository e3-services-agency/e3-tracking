import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {getDb,closeDb} from '../backend/db';
import {createClient} from '../backend/dal/client.dal';
import {createProject} from '../backend/dal/project.dal';
import * as UC from '../backend/dal/use-case.dal';
import * as OAuth from '../backend/dal/mcp-oauth.dal';
import {withHttpMcpContext,type HttpMcpContext} from './httpContext';
import {callTool} from './tools/writeTestUtil';
import {getUseCase} from './tools/useCases';
import {buildBackup} from '../backend/services/backup.service';
import {previewRestore,applyRestore} from '../backend/services/backupRestore.service';
import {createQaRun,updateQaRun} from '../backend/dal/qa-run.dal';
import {previewAssetLinks,applyAssetLinks} from '../backend/services/assetLinks.service';
const verify=vi.hoisted(()=>vi.fn());vi.mock('./cortexVerification',()=>({verifyCortexReference:verify}));
let project:string,clientId:string,uc:string,context:HttpMcpContext,foreign:string;
const key='wp-uc';
beforeEach(()=>{process.env.E3_DB_PATH=':memory:';closeDb();clientId=createClient({key,name:'Synthetic'}).id;project=createProject({key,name:'Synthetic',client_id:clientId}).id;foreign=createProject({key:'foreign-wp',name:'Other',client_id:clientId}).id;uc=UC.createUseCase(project,{code:'UC-ID-02',name:'Fictional EFT',status:'proposed',internal_notes:'PRIVATE'}).id;
 const c='fictional-client',resource='https://tracking.example/mcp',callback='https://claude.ai/api/mcp/auth_callback',scopes=['projects:read','projects:write'];getDb().prepare('INSERT INTO mcp_oauth_clients VALUES(?,?,?)').run(c,'{}',OAuth.now());const code=OAuth.createGrant('verified-human@example.test',c,resource,scopes,[project],callback,'challenge');const tokens=OAuth.exchangeCode(c,code,callback,resource);const grant=OAuth.access(tokens.access_token,resource).grant;context={token:tokens.access_token,resource,grantId:grant.id,owner:grant.owner,scopes};verify.mockReset();});
afterEach(()=>closeDb());
async function call(name:string,args:Record<string,unknown>={}){const r=await withHttpMcpContext(context,()=>callTool(name,{project_key:key,agent_name:'Claude',...args}));return {error:r.isError,text:r.text,data:r.data};}
const logs=()=>getDb().prepare("SELECT * FROM change_log WHERE entity_type='use_case' AND entity_id=? ORDER BY rowid").all(uc) as any[];
it('previews, applies, attributes verified human and agent, and replays without new history',async()=>{
 const before=logs().length,read=await getUseCase({project_key:key,use_case:uc});
 const args={use_case:uc,status:'in_progress',owner_business:'Business owner',owner_technical:'Tech owner',status_note:'Human-confirmed maintenance',if_hash:read.hash};
 const preview=await call('update_use_case',args);expect(preview.data.action).toBe('update');expect(preview.data.before.status).toBe('proposed');expect(UC.getUseCaseOrThrow(project,uc).status).toBe('proposed');expect(logs()).toHaveLength(before);
 const applied=await call('update_use_case',{...args,dry_run:false,idempotency_key:'update',actor:'forged'});expect(applied.error).toBe(false);expect(applied.data.batch_id).toBeTruthy();expect(logs().at(-1)).toMatchObject({actor:'verified-human@example.test',agent:'Claude',batch_id:applied.data.batch_id});expect(logs().at(-1).diff_json).toContain('status_note');expect(JSON.stringify(applied)).not.toContain('PRIVATE');
 const count=logs().length,replay=await call('update_use_case',{...args,dry_run:false,idempotency_key:'update',actor:'different-forgery'});expect(replay.data.action).toBe('unchanged');expect(replay.data.replayed).toBe(true);expect(replay.data.receipt_id).toBe(applied.data.receipt_id);expect(logs()).toHaveLength(count);
 expect((await call('update_use_case',{...args,status:'live'})).text).toMatch(/^STALE_HASH:/);
 expect((await call('update_use_case',{use_case:uc,status:'in_progress',dry_run:false})).data.action).toBe('unchanged');expect(logs()).toHaveLength(count);
});
it('keeps UI enums, refuses unsupported lifecycle, requires notes for approved/live and guards scopes',async()=>{
 for(const status of ['done','on_hold','signed_off','in_qa','deprecated'])expect((await call('update_use_case',{use_case:uc,status})).text).toContain('proposed, approved, in_progress, live, dropped');
 expect((await call('update_use_case',{use_case:uc,priority:'P1'})).text).toContain('critical, high, medium, low');
 expect((await call('update_use_case',{use_case:uc,status:'approved'})).text).toMatch(/^STATUS_NOTE_REQUIRED:/);
 expect((await call('update_use_case',{use_case:uc,status:'live',status_note:'Confirmed',agent_name:undefined})).text).toMatch(/^STATUS_NOTE_REQUIRED:/);
 const id=UC.createUseCase(foreign,{name:'Other'}).id;expect((await call('update_use_case',{use_case:id,status:'in_progress'})).text).toMatch(/^MCP_FORBIDDEN:/);
 const done=await call('update_use_case',{use_case:uc,status:'approved',status_note:'Human declared lifecycle',dry_run:false});expect(done.error).toBe(false);expect(UC.getUseCaseOrThrow(project,uc).status_changed_by).toBe(context.owner);
});
it('rolls back five previews and retains the existing partial-apply/replay contract',async()=>{
 const ids=[uc,...Array.from({length:4},(_,i)=>UC.createUseCase(project,{name:'Fictional '+i,status:'proposed'}).id)];const count=logs().length;
 const operations=ids.map(use_case=>({op:'update_use_case',use_case,status:'in_progress'}));
 const p=await call('batch_apply',{operations});expect(p.data.applied).toBe(5);expect(ids.map(id=>UC.getUseCaseOrThrow(project,id).status)).toEqual(Array(5).fill('proposed'));expect(logs()).toHaveLength(count);
 const applied=await call('batch_apply',{operations,dry_run:false,idempotency_key:'batch'});expect(applied.data.applied).toBe(5);const n=getDb().prepare('SELECT COUNT(*) n FROM change_log').get();expect((await call('batch_apply',{operations,dry_run:false,idempotency_key:'batch'})).data).toEqual(applied.data);expect(getDb().prepare('SELECT COUNT(*) n FROM change_log').get()).toEqual(n);
});
it('deduplicates asset pointers, updates hashes/counts/history and preserves pointer data through restore',async()=>{
 const read=await getUseCase({project_key:key,use_case:uc}),args={use_case:uc,system:'bloomreach',asset_type:'scenario',asset_id:uc,environment:'staging',label:'Fictional scenario',role:'primary'};
 expect((await call('link_use_case_asset',args)).data.after.assets[0].validation).toBe('pointer_only_not_verified');expect(getDb().prepare('SELECT COUNT(*) n FROM use_case_asset_pointers').get()).toEqual({n:0});
 expect((await call('link_use_case_asset',{...args,dry_run:false})).data.action).toBe('update');const count=logs().length;expect((await call('link_use_case_asset',{...args,dry_run:false})).data.action).toBe('unchanged');expect(logs()).toHaveLength(count);
 const next=await getUseCase({project_key:key,use_case:uc});expect(next.hash).not.toBe(read.hash);expect((await call('list_use_cases')).data.items[0].asset_count).toBe(1);expect((await call('get_history',{entity_type:'use_case',entity_id:uc,include:'detail'})).data.items[0].diff_json).toBeTruthy();
 const backup=await buildBackup(project),preview=previewRestore(backup),restored=await applyRestore(backup,preview.payload_hash,{client_id:clientId,key:'restored-wp',name:'Restored'});const pointer=getDb().prepare('SELECT * FROM use_case_asset_pointers WHERE project_id=?').get(restored.project.id) as any;expect(pointer.asset_id).toBe(uc);expect(pointer.use_case_id).not.toBe(uc);expect(pointer.actor).toBe(context.owner);
 expect((await call('unlink_use_case_asset',{...args,dry_run:false})).data.action).toBe('update');expect(((await getUseCase({project_key:key,use_case:uc})) as any).assets).toEqual([]);
});
it('warns for unverified references, never stores failed verifications, and stores verified timestamps only on apply',async()=>{
 const reference={system:'cortex',client:'fictional',project:'fictional',record_type:'document',record_id:'a'.repeat(24),revision:2,content_hash:'b'.repeat(64)};
 const args={target_kind:'use_case',target_id:uc,reference};const p=await call('add_reference',args);expect(p.data.warnings[0]).toMatch(/REFERENCE_NOT_VERIFIED/);
 verify.mockRejectedValue(Object.assign(new Error('wrong hash'),{code:'REFERENCE_HASH_MISMATCH'}));expect((await call('add_reference',{...args,verify:true,dry_run:false})).text).toMatch(/^REFERENCE_HASH_MISMATCH:/);expect(getDb().prepare('SELECT COUNT(*) n FROM external_references').get()).toEqual({n:0});
 verify.mockResolvedValue('2026-10-19T00:00:00Z');expect((await call('add_reference',{...args,verify:true})).data.reference.verified_at).toBe('2026-10-19T00:00:00Z');expect(getDb().prepare('SELECT COUNT(*) n FROM external_references').get()).toEqual({n:0});
 const applied=await call('add_reference',{...args,verify:true,dry_run:false});expect(applied.data.warnings).toEqual([]);expect(((await getUseCase({project_key:key,use_case:uc})) as any).references).toEqual([expect.objectContaining({verified_at:'2026-10-19T00:00:00Z'})]);
});
it('returns the existing pointer unchanged even with different optional metadata, without history or hash changes',async()=>{
 const args={use_case:uc,system:'bloomreach',asset_type:'scenario',asset_id:'fictional',environment:'staging',dry_run:false};
 const added=await call('link_use_case_asset',args),before=await getUseCase({project_key:key,use_case:uc}),count=logs().length;
 const id=added.data.after.assets[0].id;
 for(const dry_run of [true,false]){
  const result=await call('link_use_case_asset',{...args,label:'Attempted replacement',role:'qa',dry_run});
  expect(result.error).toBe(false);expect(result.data.action).toBe('unchanged');expect(result.data.differences).toEqual([]);
  expect(result.data.after.assets).toEqual([expect.objectContaining({id,link_id:id,label:null,role:'primary',environment:'staging'})]);
  expect(result.data.warnings).toContainEqual(expect.stringContaining('ASSET_POINTER_METADATA_IGNORED: Existing link '+id));
 }
 expect(logs()).toHaveLength(count);expect((await getUseCase({project_key:key,use_case:uc})).hash).toBe(before.hash);
});
it('normalizes reviewed assets and warns on cross-environment pointers on reads and previews without changing either',async()=>{
 const source='11111111-1111-4111-8111-111111111111',sha='a'.repeat(64),assetId='fictional-same-id';
 const run=createQaRun(project,{kind:'manual',source:'extension',actor:'Synthetic fixture',manifest_json:{format:'e3-captured-evidence-v1',kind:'project_snapshot',source_sha256:sha,source_project_id:source,filename:'synthetic.zip',facts:{observed_at:'2026-10-16T00:00:00Z',coverage:[{asset_type:'scenarios',listed:1,collected:1}]},assets:[{id:assetId,type:'scenarios',name:'Fictional',status:{status:'draft'},source_url:'https://synthetic.bloomreach.co/p/fictional-production/campaigns/'+assetId}],rows:[],checks:[]}});
 updateQaRun(project,run.id,{archived:true});
 const pkg={format:'e3-reviewed-asset-links-v1',source_project_id:source,review:{record_id:'synthetic-review',revision:1,content_hash:sha},links:[{use_case_id:uc,use_case_code:'UC-ID-02',use_case_name:'Fictional EFT',asset_type:'scenarios',asset_id:assetId,relation:'implements',evidence_source_sha256:sha,mapping_basis:'Synthetic exact review',coverage:'unverified'}]};
 applyAssetLinks(project,pkg,previewAssetLinks(project,pkg).payload_hash,'Synthetic reviewer',true);
 const reviewed=getDb().prepare('SELECT * FROM use_case_asset_links').all();
 const args={use_case:uc,system:'bloomreach',asset_type:'scenario',asset_id:assetId,environment:'staging'};
 const preview=await call('link_use_case_asset',args);expect(preview.data.warnings).toContainEqual(expect.stringContaining('ASSET_ENVIRONMENT_CONFLICT'));
 expect((await getUseCase({project_key:key,use_case:uc}) as any).assets).toHaveLength(1);
 await call('link_use_case_asset',{...args,dry_run:false});
 const pointers=getDb().prepare('SELECT * FROM use_case_asset_pointers').all(),count=logs().length;
 const read=await getUseCase({project_key:key,use_case:uc}) as any;
 expect(read.assets.map((a:any)=>a.asset_type)).toEqual(['scenario','scenario']);
 expect(read.assets[0]).toMatchObject({environment:'production',environment_source:'source_url_project_name',source_asset_type:'scenarios',validation:'reviewed_mapping_configuration_only'});
 expect(read.assets[1]).toMatchObject({environment:'staging',environment_source:'declared',validation:'pointer_only_not_verified'});
 expect(read.warnings).toEqual([expect.objectContaining({code:'ASSET_ENVIRONMENT_CONFLICT',asset_id:assetId,links:[expect.objectContaining({environment:'production'}),expect.objectContaining({environment:'staging'})]})]);
 const duplicate=await call('link_use_case_asset',{...args,label:'Different label'});expect(duplicate.data.action).toBe('unchanged');expect(duplicate.data.warnings).toContainEqual(expect.stringContaining('ASSET_ENVIRONMENT_CONFLICT'));
 expect((await getUseCase({project_key:key,use_case:uc,if_hash:read.hash})).unchanged).toBe(true);
 expect(getDb().prepare('SELECT * FROM use_case_asset_links').all()).toEqual(reviewed);expect(getDb().prepare('SELECT * FROM use_case_asset_pointers').all()).toEqual(pointers);expect(logs()).toHaveLength(count);
});
