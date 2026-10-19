import {afterAll,beforeAll,it,expect} from 'vitest';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {createApp} from '../../app';
import {closeDb} from '../../db';
import {createClient} from '../../dal/client.dal';
import {createProject} from '../../dal/project.dal';
import {createUseCase,getUseCaseOrThrow} from '../../dal/use-case.dal';
import {createEvent,attachPropertyToEvent} from '../../dal/event.dal';
import {createProperty} from '../../dal/property.dal';
import {listVariants} from '../../dal/variant.dal';
let server:http.Server,base:string,project:string,uc:string;
beforeAll(async()=>{process.env.E3_DB_PATH=':memory:';process.env.AUTH_MODE='local';process.env.DECISION_INBOX_ENABLED='true';closeDb();project=createProject({client_id:createClient({key:'p',name:'P'}).id,key:'p',name:'P'}).id;uc=createUseCase(project,{name:'Route test',notes:'Original'}).id;server=http.createServer(createApp());await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects/${project}/decision-inbox`;});
afterAll(async()=>{await new Promise<void>(r=>server.close(()=>r()));closeDb();delete process.env.E3_DB_PATH;delete process.env.AUTH_MODE;delete process.env.DECISION_INBOX_ENABLED;});
async function post(path:string,body:unknown){return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(base).origin},body:JSON.stringify(body)});}
it('uses the server actor, refuses a mismatched revision and does not expose staff decisions to shared visitors',async()=>{
 const proposal={key:'ROUTE-01',audiences:['project_manager'],review_role:'project_manager',summary:'Review notes',confidence:'high',rationale:'Source evidence',impact:'Notes only',alternatives:'Defer',execution_plan:'Separate review',evidence:[{label:'Source',url:'https://example.com',claim:'Source claim',captured_at:'2026-10-17T00:00:00Z',source_hash:'a'.repeat(64)}],patches:[{use_case_id:uc,append_notes:'Approved text',add_requirements:[]}]};
 const preview=await post('/preview',{proposal});expect(preview.status).toBe(200);const p=await preview.json();const imported=await post('/import',{proposal,content_hash:p.content_hash});expect(imported.status).toBe(200);const card=await imported.json();
 const stale=await post(`/${card.id}/actions`,{content_hash:'wrong',action:'approve_documentation',human_confirmed:true});expect(stale.status).toBe(409);expect(getUseCaseOrThrow(project,uc).notes).toBe('Original');
 const apply=await post(`/${card.id}/actions`,{content_hash:card.content_hash,action:'approve_documentation',human_confirmed:true,actor:'Forged client approver'});expect(apply.status).toBe(200);const approved=await apply.json();expect(approved.history.at(-1).actor).not.toBe('Forged client approver');
 const shared=await fetch(base.replace(`/projects/${project}/decision-inbox`,'/shared/not-a-token/decision-inbox'));expect(shared.status).toBe(404);
 process.env.AUTH_MODE='remote';const unauth=await fetch(base);expect(unauth.status).toBe(401);process.env.AUTH_MODE='local';
 process.env.DECISION_INBOX_ENABLED='false';expect((await fetch(base)).status).toBe(404);process.env.DECISION_INBOX_ENABLED='true';
});
it('approves and applies one native status change and five variants through HTTP with a server-authored replayable receipt',async()=>{
 const nativeUC=createUseCase(project,{name:'Synthetic native route',notes:'Original'}).id;
 const eventId=createEvent(project,{name:'native_route'}).id;
 const actionId=createProperty(project,{name:'native_action',scope:'event',data_type:'string',allowed_values_json:['a','b','c','d','e'].map(value=>({value}))}).id;
 attachPropertyToEvent(project,eventId,{property_id:actionId,role:'discriminator'});
 const proposal={key:'ROUTE-NATIVE-01',audiences:['technical_consultant'],review_role:'technical_consultant',summary:'Apply native changes',confidence:'high',rationale:'Synthetic evidence',impact:'Status and five variants',alternatives:'Defer',execution_plan:'Verify actual tracking separately',evidence:[{label:'Source',url:'https://example.invalid/native-route',claim:'Synthetic contract',captured_at:'2026-10-19T00:00:00Z',source_hash:'a'.repeat(64)}],patches:[{use_case_id:nativeUC,append_notes:'Approved contract; QA pending',add_requirements:[]}],native_changes:[{op:'use_case_status',use_case_id:nativeUC,from:null,to:'approved'},...['a','b','c','d','e'].map(value=>({op:'create_variant',event_id:eventId,conditions:[{property_id:actionId,operator:'equals',values:[value]}]}))]};
 const preview=await post('/preview',{proposal});expect(preview.status).toBe(200);const p=await preview.json();
 expect(listVariants(project,eventId)).toHaveLength(0);const imported=await post('/import',{proposal,content_hash:p.content_hash});expect(imported.status).toBe(200);const card=await imported.json();
 const body={content_hash:card.content_hash,action:'approve_and_apply',human_confirmed:true,actor:'Forged approver'};
 expect((await post(`/${card.id}/actions`,{...body,human_confirmed:false})).status).toBe(400);
 const applied=await post(`/${card.id}/actions`,body);expect(applied.status).toBe(200);const result=await applied.json();
 expect(getUseCaseOrThrow(project,nativeUC).status).toBe('approved');expect(listVariants(project,eventId)).toHaveLength(5);
 const receipt=result.history.at(-1);expect(receipt.actor).not.toBe('Forged approver');expect(receipt.detail.native_results).toHaveLength(6);expect(receipt.detail.execution_status).toBe('applied');
 const replay=await post(`/${card.id}/actions`,body);expect(replay.status).toBe(200);expect((await replay.json()).history).toEqual(result.history);expect(listVariants(project,eventId)).toHaveLength(5);
});
