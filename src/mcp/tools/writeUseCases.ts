import {z} from 'zod';
import * as UC from '../../backend/dal/use-case.dal';
import * as Assets from '../../backend/dal/use-case-asset-pointer.dal';
import {getActor} from '../../backend/context/actor';
import {resolveUseCase} from '../resolve';
import {publicHash} from '../readOptions';
import {publicUseCase} from './useCases';
import {publicUseCaseAssets} from '../useCaseAssets';
import {assetEnvironmentWarnings,type PublicAssetIdentity} from '../../domain/publicUseCaseAssets';
import {McpToolError} from '../errors';
import {USE_CASE_STATUSES,PRIORITIES} from '../../domain/enums';
import {pick,type WriteTool} from './writeCore';
const text=z.string().trim().max(200).nullable().optional();
const common={use_case:z.string().min(1),if_hash:z.string().regex(/^[a-f0-9]{64}$/).optional(),include:z.enum(['detail','body']).optional()};
const keys=['status','priority','owner_business','owner_technical','status_note'] as const;
function view(projectId:string,id:string,detail:boolean){const uc=UC.getUseCaseOrThrow(projectId,id);const full=publicUseCase(projectId,uc);return detail?full:pick(full,['id','code','name','status','priority','owner','owner_business','owner_technical','status_note','status_changed_by','status_changed_at','assets','created_at','updated_at']);}
function resolve(projectId:string,args:Record<string,unknown>){const uc=resolveUseCase(projectId,String(args.use_case));if(args.if_hash!==undefined){const full=publicUseCase(projectId,uc);const hash=publicHash({...full,state:full.status??null});if(args.if_hash!==hash)throw Object.assign(new McpToolError('STALE_HASH','Use case changed. Read it again and review the new diff.'),{status:409});}return uc;}
export const updateUseCaseTool:WriteTool={name:'update_use_case',description:'Update use-case lifecycle, priority, business/technical owners and status note. Existing statuses only; approved/live transitions require a note and agent_name. Does not approve decisions or change requirements/certification. if_hash guards the get_use_case public hash. Dry run by default.',shape:{...common,status:text,priority:text,owner_business:text,owner_technical:text,status_note:z.string().trim().max(500).nullable().optional()},prepare(projectId,args){
 const uc=resolve(projectId,args),patch=pick(args,keys);
 if(!Object.keys(patch).length)throw new McpToolError('VALIDATION_ERROR','Supply at least one use-case field.');
 if(patch.status!==undefined&&patch.status!==null&&!USE_CASE_STATUSES.includes(patch.status as any))throw new McpToolError('USE_CASE_STATUS_INVALID','status must be one of: '+USE_CASE_STATUSES.join(', ')+', or null.');
 if(patch.priority!==undefined&&patch.priority!==null&&!PRIORITIES.includes(patch.priority as any))throw new McpToolError('USE_CASE_PRIORITY_INVALID','priority must be one of: '+PRIORITIES.join(', ')+', or null.');
 if(patch.status!==uc.status&&['approved','live'].includes(String(patch.status))&&(!getActor().agent||!String(patch.status_note??'').trim()))throw new McpToolError('STATUS_NOTE_REQUIRED','Lifecycle declaration requires a status note and agent_name.');
 for(const k of ['owner_business','owner_technical','status_note'])if(patch[k]==='')patch[k]=null;
 const before=view(projectId,uc.id,!!args.include);
 return {entityType:'use_case',label:uc.code??uc.name,before,run(){if(Object.entries(patch).some(([k,v])=>(uc as any)[k]!==v))UC.updateUseCase(projectId,uc.id,patch);return {row:view(projectId,uc.id,!!args.include),entityId:uc.id};}};
}};
const asset={...common,system:z.literal('bloomreach'),asset_type:z.enum(['scenario','email_template','email_campaign','segmentation','catalog','other']),asset_id:z.string().trim().min(1).max(200),environment:z.enum(['staging','production']),label:text,role:z.enum(['primary','variant','qa']).optional()};
function pointerTool(remove:boolean):WriteTool{return {
 name:remove?'unlink_use_case_asset':'link_use_case_asset',
 description:(remove?'Remove an agent-maintained asset pointer. Existing evidence-backed reviewed mappings cannot be removed by this tool.':'Attach a deduplicated Bloomreach asset pointer; duplicates return unchanged with the existing link and preserve its metadata. Existence, deployment and operation are not verified.')+' Dry run by default; if_hash guards the use case. Environment conflicts are warnings, never automatic corrections.',
 shape:asset,
 prepare(projectId,args){
  const uc=resolve(projectId,args);
  const input=pick(args,['system','asset_type','asset_id','environment','label','role']) as Assets.PointerInput;
  const existing=Assets.pointers(projectId,uc.id).find(r=>r.system===input.system&&r.asset_type===input.asset_type&&r.asset_id===input.asset_id&&r.environment===input.environment);
  const metadataIgnored=!remove&&existing&&((input.label!==undefined&&input.label!==existing.label)||(input.role!==undefined&&input.role!==existing.role));
  return {
   entityType:'use_case',label:uc.code??uc.name,before:{id:uc.id,assets:publicUseCaseAssets(projectId,uc.id).assets},
   run(){Assets.changePointer(projectId,uc.id,input,remove);return {row:{id:uc.id,assets:publicUseCaseAssets(projectId,uc.id).assets},entityId:uc.id};},
   warnings:row=>[
    'pointer_only_not_verified: Asset pointers do not establish configuration, QA, sends, delivery or certification.',
    ...(metadataIgnored?[`ASSET_POINTER_METADATA_IGNORED: Existing link ${existing.id} retained its label and role. Review an explicit unlink/relink to change them.`]:[]),
    ...assetEnvironmentWarnings((row?.assets??[]) as PublicAssetIdentity[]).map(w=>`${w.code}: ${w.asset_type} ${w.asset_id}; ${w.links.map(l=>`${l.link_id}=${l.environment} (${l.environment_source})`).join('; ')}. Resolve the evidence before relying on this mapping; no environment was changed.`),
   ],
  };
 },
};}
export const linkUseCaseAssetTool=pointerTool(false),unlinkUseCaseAssetTool=pointerTool(true);
