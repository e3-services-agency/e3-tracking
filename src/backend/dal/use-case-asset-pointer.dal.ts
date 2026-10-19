import {getDb} from '../db';
import {getUseCaseOrThrow} from './use-case.dal';
import {newId,nowIso} from '../db/util';
import {getActor} from '../context/actor';
import {recordChange} from './change-log.dal';
export interface AssetPointer {id:string;project_id:string;use_case_id:string;system:'bloomreach';asset_type:string;asset_id:string;environment:'staging'|'production';label:string|null;role:'primary'|'variant'|'qa';actor:string;agent:string|null;created_at:string}
export type PointerInput=Pick<AssetPointer,'system'|'asset_type'|'asset_id'|'environment'> & Partial<Pick<AssetPointer,'label'|'role'>>;
export function pointers(projectId:string,useCaseId:string):AssetPointer[]{return getDb().prepare('SELECT * FROM use_case_asset_pointers WHERE project_id=? AND use_case_id=? ORDER BY created_at,id').all(projectId,useCaseId) as AssetPointer[];}
export function publicPointer(row:AssetPointer){const {project_id:_project,...rest}=row;return {...rest,link_id:row.id,environment_source:'declared',validation:'pointer_only_not_verified'};}
export function changePointer(projectId:string,useCaseId:string,input:PointerInput,remove:boolean){
 return getDb().transaction(()=>{
  const uc=getUseCaseOrThrow(projectId,useCaseId),before=pointers(projectId,useCaseId);
  const existing=before.find(r=>r.system===input.system&&r.asset_type===input.asset_type&&r.asset_id===input.asset_id&&r.environment===input.environment);
  if(!remove&&existing)return before;
  if(remove&&existing)getDb().prepare('DELETE FROM use_case_asset_pointers WHERE project_id=? AND id=?').run(projectId,existing.id);
  if(!remove&&!existing){const actor=getActor();getDb().prepare('INSERT INTO use_case_asset_pointers(id,project_id,use_case_id,system,asset_type,asset_id,environment,label,role,actor,agent,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(newId(),projectId,useCaseId,input.system,input.asset_type,input.asset_id,input.environment,input.label??null,input.role??'primary',actor.actor,actor.agent??null,nowIso());}
  const after=pointers(projectId,useCaseId);
  recordChange({projectId,entityType:'use_case',entityId:uc.id,entityLabel:uc.code??uc.name,action:'update',before:{asset_pointers:before.map(publicPointer)},after:{asset_pointers:after.map(publicPointer)}});
  return after;
 }).immediate();
}
