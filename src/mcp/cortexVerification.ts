import fs from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {getActor} from '../backend/context/actor';
import {currentHttpRights} from './httpContext';
import {McpToolError} from './errors';
type Ref={client:string;project:string;record_type:'entity'|'document'|'decision';record_id:string;revision:number;content_hash:string};
/** A Tracking grant is never forwarded to Cortex. Only explicit per-human/project/scope delegation is usable. */
export async function verifyCortexReference(ref:Ref,projectKey:string):Promise<string>{
 currentHttpRights();
 let binding:any;
 try{
  const file=process.env.E3_CORTEX_VERIFY_BINDINGS_FILE;if(!file)throw new Error();
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  binding=config.bindings?.find((b:any)=>b.actor===getActor().actor&&b.tracking_project===projectKey&&b.client===ref.client&&b.project===ref.project);
  if(!binding||typeof binding.token!=='string'||!binding.token)throw new Error();
 }catch{throw new McpToolError('REFERENCE_VERIFICATION_UNAVAILABLE','No explicitly delegated reader.');}
 const endpoint=new URL('https://cortex.e3-services.com/mcp');
 const client=new Client({name:'e3-tracking-reference-verifier',version:'1'});
 try{
  const transport=new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{Authorization:`Bearer ${binding.token}`},signal:AbortSignal.timeout(10000)}});
  await client.connect(transport,{timeout:10000});
  const result=await client.callTool({name:'read_cortex_record',arguments:{client:ref.client,project:ref.project,record_type:ref.record_type,record_id:ref.record_id,revision:ref.revision,content_hash:ref.content_hash}},undefined,{timeout:10000});
  const blocks=(result as any).content;if(!Array.isArray(blocks))throw new Error();
  if(result.isError){const code=String(blocks[0]?.text??'').split(':')[0];throw new McpToolError(/hash|revision|mismatch|conflict/i.test(code)?'REFERENCE_HASH_MISMATCH':'REFERENCE_NOT_FOUND','Exact Cortex guard/read was refused.');}
  const raw=blocks.find(c=>c.type==='text');if(!raw||typeof raw.text!=='string'||raw.text.length>262144)throw new Error();
  const body=JSON.parse(raw.text),record=body.record;
  if(body.scope?.client!==ref.client||body.scope?.project!==ref.project||body.id!==ref.record_id||body.revision!==ref.revision||record?.content_hash!==ref.content_hash)throw new McpToolError('REFERENCE_HASH_MISMATCH','Exact Cortex revision or content hash differs.');
  currentHttpRights();return new Date().toISOString();
 }catch(error){if(error instanceof McpToolError)throw error;throw new McpToolError('REFERENCE_NOT_FOUND','Exact scoped Cortex read failed.');}
 finally{await client.close().catch(()=>{});}
}
