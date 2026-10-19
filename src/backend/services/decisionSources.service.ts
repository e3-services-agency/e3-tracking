import {createHash} from 'node:crypto';
import {getDb} from '../db';
import {newId,nowIso} from '../db/util';
import {BadRequestError,ConflictError,NotFoundError} from '../errors';
import {decisionSourceInputSchema,type DecisionSourceInput,type DecisionSourceStatus,type DecisionSeed,type DecisionPayload} from '../../domain/decisionInbox';

type Capture={sequence:number;id:string;project_id:string;decision_id:string;source_key:string;capture_hash:string;preview_hash:string;source_package_hash:string;content_hash:string;payload_json:string;baseline_id:string|null;complete:number;changed:number;followup_decision_id:string|null;created_at:string};
type Decision={id:string;project_id:string;decision_key:string;revision:number;content_hash:string;payload_json:string;state:string;restored:number};
function canon(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canon).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canon((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
const hash=(value:unknown)=>createHash('sha256').update(canon(value)).digest('hex');
function captures(project:string,decision:string):Capture[]{
  return getDb().prepare('SELECT rowid AS sequence,* FROM decision_source_captures WHERE project_id=? AND decision_id=? ORDER BY rowid').all(project,decision) as Capture[];
}
function decisionRow(project:string,id:string):Decision {
  const r=getDb().prepare('SELECT * FROM decision_revisions WHERE project_id=? AND id=?').get(project,id) as Decision|undefined;
  if(!r)throw new NotFoundError('Decision',id);
  if(r.restored)throw new ConflictError('Restored history cannot bind current source authority.');
  const latest=getDb().prepare('SELECT id FROM decision_revisions WHERE project_id=? AND decision_key=? ORDER BY revision DESC LIMIT 1').get(project,r.decision_key) as {id:string};
  if(latest.id!==id||!['proposed','deferred','documented'].includes(r.state))throw new ConflictError('Source checks require the current open or documented decision.');
  return r;
}
export function decisionSourceStatus(project:string,id:string):DecisionSourceStatus {
  const rows=captures(project,id),complete=rows.filter(c=>c.complete),changed=rows.filter(c=>c.changed);
  const shared=getDb().prepare('SELECT rowid AS sequence,* FROM decision_source_captures WHERE project_id=? AND complete=1 AND inherited=0 ORDER BY rowid').all(project) as Capture[];
  for(const baseline of complete.filter((c,i,a)=>a.findIndex(v=>v.source_key===c.source_key)===i)){
    const original=(JSON.parse(baseline.payload_json) as DecisionSourceInput).records;
    const anchor=shared.find(c=>c.source_key===baseline.source_key&&c.capture_hash===baseline.capture_hash)?.sequence??baseline.sequence;
    for(const newer of shared.filter(c=>c.source_key===baseline.source_key&&c.sequence>anchor)){
      const current=(JSON.parse(newer.payload_json) as DecisionSourceInput).records;
      if(current.some(r=>original.some(o=>o.url===r.url&&hash(o)!==hash(r)))&&!changed.some(c=>c.id===newer.id))changed.push(newer);
    }
  }
  return {tracked:complete.length>0,requires_review:changed.length>0,
    source_count:new Set(complete.map(c=>c.source_key)).size,
    checked_at:complete.length?JSON.parse(complete[complete.length-1].payload_json).captured_at:null,
    partial_captures:rows.filter(c=>!c.complete).length,
    followup_ids:[...new Set(changed.map(c=>c.followup_decision_id).filter((id):id is string=>!!id))]};
}
function prepare(project:string,id:string,raw:unknown) {
  const decision=decisionRow(project,id),parsed=decisionSourceInputSchema.safeParse(raw);
  if(!parsed.success)throw new BadRequestError('Invalid cited-source capture.');
  const input={...parsed.data,records:[...parsed.data.records].sort((a,b)=>a.url.localeCompare(b.url))};
  if(new Set(input.records.map(r=>r.url)).size!==input.records.length)throw new BadRequestError('Duplicate source URL in capture.');
  const payload=JSON.parse(decision.payload_json) as DecisionPayload;
  const allowed=[...new Set(payload.evidence.filter(e=>e.source_hash===input.baseline_package_hash).map(e=>e.url))].sort();
  if(!allowed.length||input.records.some(r=>!allowed.includes(r.url)))throw new BadRequestError('Capture includes a source outside this decision citation group.');
  if(input.complete&&(input.records.length!==allowed.length||allowed.some(url=>!input.records.some(r=>r.url===url))))throw new BadRequestError('Complete capture must cover every cited URL in the package group.');
  const all=captures(project,id),rows=all.filter(c=>c.source_key===input.source_key),baseline=rows.find(c=>c.complete);
  if(all.some(c=>c.source_key!==input.source_key&&JSON.parse(c.payload_json).baseline_package_hash===input.baseline_package_hash))throw new ConflictError('This citation group already has a canonical source key.');
  if(baseline&&JSON.parse(baseline.payload_json).baseline_package_hash!==input.baseline_package_hash)throw new ConflictError('Source key belongs to another citation group.');
  if(!baseline&&(!input.complete||input.package_hash!==input.baseline_package_hash))throw new ConflictError('First bind requires complete evidence from the original cited package.');
  for(const previous of rows.filter(c=>c.source_package_hash===input.package_hash)){
    const old=JSON.parse(previous.payload_json) as DecisionSourceInput;
    if(input.records.some(r=>old.records.some(o=>o.url===r.url&&hash(o)!==hash(r))))throw new ConflictError('The same package hash cannot contain different cited content.');
  }
  const captureHash=hash(input),existing=rows.find(c=>c.capture_hash===captureHash),head=rows.filter(c=>c.complete).at(-1);
  const shared=(getDb().prepare('SELECT rowid AS sequence,* FROM decision_source_captures WHERE project_id=? AND source_key=? AND complete=1 AND inherited=0 ORDER BY rowid DESC').all(project,input.source_key) as Capture[]);
  const original=baseline?(JSON.parse(baseline.payload_json) as DecisionSourceInput).records:input.records;
  const before=baseline?input.records.map(record=>shared.flatMap(c=>(JSON.parse(c.payload_json) as DecisionSourceInput).records).find(r=>r.url===record.url)??original.find(r=>r.url===record.url)!):input.records;
  const changes=input.complete?input.records.flatMap(after=>{const old=before.find(r=>r.url===after.url);return old&&hash(old)!==hash(after)?[{url:after.url,before:old,after}]:[];}):[];
  const sharedHead=shared.find(c=>(JSON.parse(c.payload_json) as DecisionSourceInput).records.some(r=>allowed.includes(r.url)));
  const expected=hash({decision_hash:decision.content_hash,head_id:head?.id??null,shared_head_id:sharedHead?.id??null,input});
  return {decision,payload,input,rows,baseline,existing,captureHash,expected,contentHash:hash(input.records),changes};
}
export function previewDecisionSources(project:string,id:string,raw:unknown){
  const p=prepare(project,id,raw);
  return {content_hash:p.existing?.preview_hash??p.expected,replay:!!p.existing,
    mode:p.baseline?'check':'bind_original',complete:p.input.complete,
    changed_urls:p.changes.map(c=>c.url),before_after:p.changes,
    effect:p.input.complete?(p.changes.length?'Draft source re-review; retain approval and documentation; block planning on stale evidence.':'Retain cited-source check; no documentation change.'):'Retain incomplete-capture audit only; preserve complete evidence and create no invalidation.'};
}
export function inheritDecisionSourceBindings(project:string,from:string,to:string,actor:string){
  const rows=captures(project,from).filter(c=>c.complete);
  for(const baseline of rows.filter((c,i,a)=>a.findIndex(v=>v.source_key===c.source_key)===i)){
    getDb().prepare('INSERT INTO decision_source_captures(id,project_id,decision_id,source_key,capture_hash,preview_hash,source_package_hash,content_hash,payload_json,baseline_id,complete,inherited,changed,followup_decision_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,NULL,1,1,0,NULL,?)')
      .run(newId(),project,to,baseline.source_key,baseline.capture_hash,hash({from,to,capture:baseline.capture_hash}),baseline.source_package_hash,baseline.content_hash,baseline.payload_json,nowIso());
  }
  if(rows.length)getDb().prepare('INSERT INTO decision_events(id,project_id,decision_id,action,actor,detail_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(newId(),project,to,'source_dependencies_inherited',actor,JSON.stringify({from_decision_id:from,approval:false,execution_authorized:false}),nowIso());
}
export function applyDecisionSources(project:string,id:string,raw:unknown,expected:string,actor:string,makeDraft:(seed:DecisionSeed)=>string){
  return getDb().transaction(()=>{
    const p=prepare(project,id,raw);
    if(expected!==(p.existing?.preview_hash??p.expected))throw new ConflictError('Source or decision baseline changed. Preview the exact capture again.');
    if(p.existing)return {capture_id:p.existing.id,followup_id:p.existing.followup_decision_id,replay:true,changed:!!p.existing.changed};
    const captureId=newId();
    let followupId:string|null=null;
    if(p.changes.length){
      const diff=p.changes.map(c=>`Source: ${c.url}\nPreviously captured: ${c.before.text.slice(0,1600)}\nNewly captured: ${c.after.text.slice(0,1600)}`).join('\n\n').slice(0,14000);
      const {project_id:_,revision:__,baselines:___,native_baselines:____,native_changes:_____,...seed}=p.payload;
      followupId=makeDraft({...seed,key:`${p.payload.key.slice(0,40)}-SRC-${p.contentHash.slice(0,8)}-${p.captureHash.slice(0,8)}`,
        summary:`Review changed evidence for ${p.payload.key}: ${p.payload.summary}`.slice(0,20000),
        rationale:`Exact cited content changed. The previous approval remains historical; this draft does not interpret the change as a verified fix.\n\n${diff}`,
        impact:'Review source changes and decide whether the existing specification still applies. No existing documentation, QA status or execution authority is changed.',
        alternatives:'Keep the approved requirement after reviewing the new evidence, amend it explicitly, or defer pending observed QA.',
        execution_plan:'Review the exact before/after source text, obtain the required technical or business decision, then prepare any separate execution plan and observed verification. No execution is authorised.',
        evidence:p.payload.evidence.filter(e=>e.source_hash===p.input.baseline_package_hash).map(e=>({...e,source_hash:p.input.package_hash,captured_at:p.input.captured_at,claim:'Updated cited content requires review; compare the exact before/after text in this draft.'})),
        patches:p.payload.patches.map(patch=>({use_case_id:patch.use_case_id,add_requirements:[],append_notes:`SOURCE RE-REVIEW DRAFT for ${p.payload.key}\nReview changed evidence before relying on the prior planning basis. This does not claim a completed correction or replace the approved acceptance criteria.\n\n${diff}`}))});
    }
    getDb().prepare('INSERT INTO decision_source_captures(id,project_id,decision_id,source_key,capture_hash,preview_hash,source_package_hash,content_hash,payload_json,baseline_id,complete,changed,followup_decision_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(captureId,project,id,p.input.source_key,p.captureHash,expected,p.input.package_hash,p.contentHash,JSON.stringify(p.input),p.baseline?.id??null,Number(p.input.complete),Number(p.changes.length>0),followupId,nowIso());
    getDb().prepare('INSERT INTO decision_events(id,project_id,decision_id,action,actor,detail_json,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(newId(),project,id,p.changes.length?'source_review_required':'source_capture_recorded',actor,JSON.stringify({capture_id:captureId,complete:p.input.complete,changed_urls:p.changes.map(c=>c.url),followup_id:followupId,approval:false,execution_authorized:false}),nowIso());
    if(p.changes.length&&followupId&&!captures(project,followupId).some(c=>c.complete)){
      const source=p.input;
      const inherited={...source,baseline_package_hash:source.package_hash};
      const binding=prepare(project,followupId,inherited);
      applyDecisionSources(project,followupId,inherited,binding.expected,actor,makeDraft);
    }
    return {capture_id:captureId,followup_id:followupId,replay:false,changed:p.changes.length>0};
  }).immediate();
}
