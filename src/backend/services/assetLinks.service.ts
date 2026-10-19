import {createHash} from 'node:crypto';
import {getDb} from '../db';
import {pointers,publicPointer} from '../dal/use-case-asset-pointer.dal';
import {newId,nowIso} from '../db/util';
import {getProjectOrThrow} from '../dal/project.dal';
import {listUseCases} from '../dal/use-case.dal';
import {listCapturedEvidence} from './capturedEvidence.service';
import {computeUseCaseCoverage} from './useCaseCoverage.service';
import {BadRequestError,ConflictError,PayloadChangedError} from '../errors';
import {assetLinkPackageSchema,type AssetLinkPackage,type ConfigurationAsset,type ConfigurationState,type UseCaseImplementation} from '../../domain/assetLinks';
type Link={id:string;project_id:string;use_case_id:string;import_id:string;source_project_id:string;asset_type:string;asset_id:string;relation:ConfigurationAsset['relation'];link_json:string;restored:number};
type Receipt={id:string;input_hash:string;payload_hash:string;package_json:string;restored:number};
type Scan=ReturnType<typeof listCapturedEvidence>[number];
function canonical(v:any):string{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const key=(v:{use_case_id:string;asset_type:string;asset_id:string})=>canonical([v.use_case_id,v.asset_type,v.asset_id]);
function parse(raw:unknown):AssetLinkPackage{const p=assetLinkPackageSchema.safeParse(raw);if(!p.success)throw new BadRequestError('Invalid reviewed asset-link package.');const input={...p.data,links:[...p.data.links].sort((a,b)=>key(a).localeCompare(key(b)))};if(new Set(input.links.map(key)).size!==input.links.length)throw new BadRequestError('Duplicate UC/asset link in package.');return input;}
function links(project:string):Link[]{return getDb().prepare('SELECT * FROM use_case_asset_links WHERE project_id=? ORDER BY id').all(project) as Link[];}
function receipt(project:string,input:AssetLinkPackage){return getDb().prepare('SELECT * FROM asset_link_imports WHERE project_id=? AND input_hash=? AND restored=0').get(project,hash(input)) as Receipt|undefined;}
function scans(project:string){return listCapturedEvidence(project).filter(s=>s.kind==='project_snapshot'&&s.facts&&Array.isArray(s.assets));}
function stamp(s:Scan):number|null{const t=Date.parse(s.facts.observed_at);return Number.isFinite(t)?t:null;}
function prepare(project:string,input:AssetLinkPackage){
  const p=getProjectOrThrow(project),uc=listUseCases(project),source=scans(project),existing=links(project),bound=new Set(listCapturedEvidence(project).map(s=>s.source_project_id));
  if(bound.size!==1||!bound.has(input.source_project_id)||(p.bloomreach_project_token&&p.bloomreach_project_token!==input.source_project_id))throw new ConflictError('Source project binding differs from the reviewed mapping.');
  const rows=input.links.map(row=>{
    const u=uc.find(u=>u.id===row.use_case_id);
    if(!u||(u.code??'')!==row.use_case_code||u.name!==row.use_case_name)throw new ConflictError('UC identity changed or belongs to another project.');
    const s=source.find(s=>s.source_project_id===input.source_project_id&&s.source_sha256===row.evidence_source_sha256);
    const asset=s?.assets.find(a=>a.id===row.asset_id&&a.type===row.asset_type);
    if(!s||!asset||stamp(s)===null)throw new ConflictError('Exact asset is missing from the cited retained source capture.');
    const current=existing.find(l=>!l.restored&&key(l)===key(row)&&l.source_project_id===input.source_project_id);
    if(current&&(current.relation!==row.relation||current.link_json!==canonical({...row,review:input.review})))throw new ConflictError('Existing mapping differs; no silent replacement is allowed.');
    return {...row,asset_name:asset.name,source_url:asset.source_url??null,captured_at:s.facts.observed_at,action:current?'existing' as const:'add' as const};
  });
  const payload=hash({project,input,ucs:rows.map(r=>[r.use_case_id,r.use_case_code,r.use_case_name]),sources:source.map(s=>[s.id,s.source_sha256,s.source_project_id]).sort(),existing});
  return {payload,rows,existing};
}
export function previewAssetLinks(project:string,raw:unknown){
  getProjectOrThrow(project);const input=parse(raw),prior=receipt(project,input);
  if(prior)return {payload_hash:prior.payload_hash,duplicate:true,receipt_id:prior.id,rows:input.links.map(r=>({...r,action:'existing'})),additions:0,existing:input.links.length,restored_history:0};
  const p=prepare(project,input);
  return {payload_hash:p.payload,duplicate:false,receipt_id:null,rows:p.rows,additions:p.rows.filter(r=>r.action==='add').length,existing:p.rows.filter(r=>r.action==='existing').length,restored_history:p.existing.filter(l=>l.restored).length};
}
export function applyAssetLinks(project:string,raw:unknown,expected:string,actor:string,humanConfirmed:boolean){
  getProjectOrThrow(project);const input=parse(raw);
  if(humanConfirmed!==true)throw new BadRequestError('Explicit human mapping confirmation is required.');
  return getDb().transaction(()=>{
    const prior=receipt(project,input);
    if(prior){if(prior.payload_hash!==expected)throw new PayloadChangedError('Preview hash differs from the retained receipt.');return {id:prior.id,duplicate:true,added:0};}
    const p=prepare(project,input);if(p.payload!==expected)throw new PayloadChangedError('Mapping preview is stale; review the current diff.');
    const id=newId(),now=nowIso();
    getDb().prepare('INSERT INTO asset_link_imports(id,project_id,input_hash,payload_hash,package_json,actor,created_at) VALUES(?,?,?,?,?,?,?)').run(id,project,hash(input),expected,canonical(input),actor,now);
    for(const row of p.rows.filter(r=>r.action==='add'))getDb().prepare('INSERT INTO use_case_asset_links(id,project_id,use_case_id,import_id,source_project_id,asset_type,asset_id,relation,link_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(newId(),project,row.use_case_id,id,input.source_project_id,row.asset_type,row.asset_id,row.relation,canonical({...input.links.find(r=>key(r)===key(row)),review:input.review}),now);
    return {id,duplicate:false,added:p.rows.filter(r=>r.action==='add').length};
  }).immediate();
}
function safeUrl(value:unknown):string|null{try{const u=new URL(String(value));return u.protocol==='https:'&&/\.bloomreach\.(com|co)$/.test(u.hostname)?u.origin+u.pathname:null;}catch{return null;}}
function state(raw:any):ConfigurationState{if(raw&&typeof raw==='object'&&raw.archived===true)return 'inactive';const value=typeof raw==='string'?raw:raw?.status;return ['active','draft','inactive','paused'].includes(value)?value:'unknown';}
function observed(link:Link,source:Scan[]):ConfigurationAsset{
  const history=source.filter(s=>s.source_project_id===link.source_project_id&&stamp(s)!==null);
  const all=history.flatMap(s=>s.assets.filter(a=>a.type===link.asset_type&&a.id===link.asset_id).map(a=>({s,a,time:stamp(s)!})));
  const latest=Math.max(...all.map(x=>x.time));const at=all.filter(x=>x.time===latest).sort((a,b)=>a.s.source_sha256.localeCompare(b.s.source_sha256));const selected=at[0];
  const latestScans=history.filter(s=>(Array.isArray(s.facts.coverage)&&s.facts.coverage.some((c:any)=>c.asset_type===link.asset_type))||s.assets.some(a=>a.type===link.asset_type));
  const newest=Math.max(...latestScans.map(s=>stamp(s)!));
  const missing=latestScans.filter(s=>stamp(s)===newest).some(s=>!s.assets.some(a=>a.type===link.asset_type&&a.id===link.asset_id));
  const conflict=new Set(at.map(x=>hash({status:x.a.status,config:x.a.config_hash??x.a.payload_hash}))).size>1;
  return {link_id:link.id,asset_id:link.asset_id,asset_type:link.asset_type,relation:link.relation,name:selected?.a.name??link.asset_id,
    state:link.restored?'restored_history':!selected||conflict?'unknown':state(selected.a.status),raw_status:selected?.a.status??null,captured_at:selected?.s.facts.observed_at??null,
    source_url:safeUrl(selected?.a.source_url),source_sha256:selected?.s.source_sha256??null,partial:selected?selected.s.facts.partial!==false:true,missing_in_latest:missing,conflict,restored:!!link.restored,undated_capture:source.some(s=>s.source_project_id===link.source_project_id&&stamp(s)===null)};
}
export function projectImplementation(project:string):{use_cases:UseCaseImplementation[];scope:string}{
  getProjectOrThrow(project);const source=scans(project),all=links(project);
  const rows=listUseCases(project).map(uc=>{
    const own=all.filter(l=>l.use_case_id===uc.id);const effective=own.filter(l=>!l.restored||!own.some(a=>!a.restored&&key(a)===key(l)&&a.source_project_id===l.source_project_id));
    const assets=effective.map(l=>observed(l,source));
    const current=assets.filter(a=>!a.restored);const primary=current.filter(a=>a.relation==='implements');
    const considered=primary.length?primary:current;const values=[...new Set(considered.map(a=>a.state))];
    const aggregate:ConfigurationState=!assets.length?'unlinked':!current.length?'restored_history':!primary.length?'unknown':values.length===1?values[0]:'mixed';
    const coverage=computeUseCaseCoverage(project,uc.id);
    return {use_case_id:uc.id,state:aggregate,assets,asset_pointers:pointers(project,uc.id).map(publicPointer),requirements_with_observations:coverage.rows.filter(r=>r.observation_count>0).length,total_requirements:coverage.total_count,coverage:'unverified' as const};
  });
  return {use_cases:rows,scope:'Dated configuration of reviewed mapped assets; full UC delivery, sends and QA are not certified.'};
}
