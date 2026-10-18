import React,{useState} from 'react';
import {fetchWithAuth} from '@/src/lib/api';
import {API_BASE} from '@/src/config/env';
import {Button} from '@/src/components/ui/Button';
import {FieldLabel,HintTh} from '@/src/components/ui/FieldHint';
export function AssetLinksImport({projectId}:{projectId:string}){
  const [raw,setRaw]=useState(''),[preview,setPreview]=useState<any>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
  const base=`${API_BASE}/api/projects/${projectId}/captured-evidence/links`;
  function change(value:string){setRaw(value);setPreview(null);setConfirmed(false);setDone('');setError('');}
  async function submit(apply:boolean){setBusy(true);setError('');try{
    const input=JSON.parse(raw);const res=await fetchWithAuth(base+(apply?'/apply':'/preview'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({package:input,...(apply?{payload_hash:preview.payload_hash,human_confirmed:confirmed}:{})})});
    const data=await res.json();if(!res.ok)throw Error(data.error??'Reviewed-link request failed');
    if(apply){setDone(data.duplicate?'Already recorded; no duplicate links or receipt.':`${data.added} reviewed links recorded. Scope, lifecycle and QA are unchanged.`);setPreview(null);setConfirmed(false);}else{setPreview(data);setConfirmed(false);setDone('');}
  }catch(e){setError((e as Error).message);if(apply){setPreview(null);setConfirmed(false);}}finally{setBusy(false);}}
  return <section className="border-t pt-4 space-y-3" data-testid="asset-links-import"><h3 className="font-semibold">Reviewed use-case asset links</h3>
    <p className="text-sm">Import an e3-reviewed-asset-links-v1 package after reviewing the exact UC/asset mapping. The review reference is retained as an operator-supplied reference, not independently authenticated client approval. Existing source snapshots are reused.</p>
    <FieldLabel hint="Reviewed mapping package" className="block">Reviewed mapping package
      <input aria-label="Reviewed mapping package file" type="file" accept=".json,application/json" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(file){if(file.size>1_000_000){setError('Mapping package exceeds 1 MB.');return;}change(await file.text());}}}/>
      <textarea aria-label="Reviewed mapping package JSON" className="block border rounded p-2 w-full font-mono text-xs" rows={5} disabled={busy} value={raw} onChange={e=>change(e.target.value)}/>
    </FieldLabel>
    <Button variant="outline" disabled={busy||!raw.trim()} onClick={()=>submit(false)}>Preview reviewed links</Button>
    {error&&<p role="alert" className="text-[var(--color-danger)]">{error}</p>}{done&&<p role="status">{done}</p>}
    {preview&&<div className="space-y-3"><p>{preview.additions} additions · {preview.existing} existing · {preview.restored_history} restored history rows. No changes to requirements, lifecycle, observations or QA.</p>
      <div className="overflow-x-auto"><table className="text-sm w-full"><thead><tr><HintTh>Use case</HintTh><HintTh>Asset</HintTh><HintTh>Relation</HintTh><HintTh>Action</HintTh></tr></thead><tbody>{preview.rows.map((r:any)=><tr key={r.use_case_id+r.asset_type+r.asset_id}><td className="p-2">{r.use_case_code} · {r.use_case_name}</td><td className="p-2">{r.asset_name??r.asset_id}<br/><small>{r.asset_type}/{r.asset_id}</small></td><td className="p-2">{r.relation}</td><td className="p-2">{r.action}</td></tr>)}</tbody></table></div>
      <small className="break-all">Exact preview: {preview.payload_hash}</small>
      <FieldLabel hint="Mapping confirmation" className="block"><input type="checkbox" aria-label="Mapping confirmation" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> I reviewed these exact mappings and their review reference; this does not certify delivery or QA.</FieldLabel>
      <Button disabled={busy||!confirmed} onClick={()=>submit(true)}>Apply reviewed links</Button>
    </div>}
  </section>;
}
