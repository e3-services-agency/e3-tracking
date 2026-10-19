import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runWithActor} from '../backend/context/actor';
const state=vi.hoisted(()=>({call:vi.fn(),connect:vi.fn(),close:vi.fn(),transport:vi.fn(),rights:vi.fn()}));
vi.mock('@modelcontextprotocol/sdk/client/index.js',()=>({Client:class{callTool=state.call;connect=state.connect;close=state.close;}}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js',()=>({StreamableHTTPClientTransport:class{constructor(...args:unknown[]){state.transport(...args);}}}));
vi.mock('./httpContext',()=>({currentHttpRights:state.rights}));
import {verifyCortexReference} from './cortexVerification';
const ref={client:'fictional',project:'one',record_type:'document' as const,record_id:'a'.repeat(24),revision:2,content_hash:'b'.repeat(64)};
let tmp:string;
const verify=()=>runWithActor({actor:'verified@example.test',source:'mcp'},()=>verifyCortexReference(ref,'tracking-project'));
beforeEach(()=>{vi.clearAllMocks();tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cortex-delegation-'));process.env.E3_CORTEX_VERIFY_BINDINGS_FILE=path.join(tmp,'readers.json');fs.writeFileSync(process.env.E3_CORTEX_VERIFY_BINDINGS_FILE,JSON.stringify({bindings:[{actor:'verified@example.test',tracking_project:'tracking-project',client:'fictional',project:'one',token:'FICTIONAL-CORTEX-TOKEN'}]}));state.connect.mockResolvedValue(undefined);state.close.mockResolvedValue(undefined);state.call.mockResolvedValue({content:[{type:'text',text:JSON.stringify({scope:{client:'fictional',project:'one'},id:ref.record_id,revision:2,record:{content_hash:ref.content_hash}})}]});});
afterEach(()=>{delete process.env.E3_CORTEX_VERIFY_BINDINGS_FILE;for(const p of fs.readdirSync(tmp))fs.unlinkSync(path.join(tmp,p));fs.rmdirSync(tmp);});
it('uses only exact human/project/Cortex scope delegation and separate credentials',async()=>{
 expect(await verify()).toMatch(/^\d{4}-/);expect(state.call.mock.calls[0][0]).toEqual({name:'read_cortex_record',arguments:ref});expect(state.transport.mock.calls[0][1].requestInit.headers.Authorization).toBe('Bearer FICTIONAL-CORTEX-TOKEN');expect(state.rights).toHaveBeenCalledTimes(2);expect(state.close).toHaveBeenCalled();
});
it('fails closed when delegation is missing or a different human/project asks',async()=>{
 await expect(runWithActor({actor:'other@example.test',source:'mcp'},()=>verifyCortexReference(ref,'tracking-project'))).rejects.toHaveProperty('code','REFERENCE_VERIFICATION_UNAVAILABLE');
 await expect(runWithActor({actor:'verified@example.test',source:'mcp'},()=>verifyCortexReference(ref,'another-project'))).rejects.toHaveProperty('code','REFERENCE_VERIFICATION_UNAVAILABLE');expect(state.connect).not.toHaveBeenCalled();
});
it('checks exact scope, record ID, revision and content hash, never representation hashes',async()=>{
 for(const patch of [{scope:{client:'other',project:'one'}},{id:'c'.repeat(24)},{revision:3},{record:{content_hash:'0'.repeat(64)},hash:ref.content_hash}]){
  state.call.mockResolvedValue({content:[{type:'text',text:JSON.stringify({scope:{client:'fictional',project:'one'},id:ref.record_id,revision:2,record:{content_hash:ref.content_hash},...patch})}]});await expect(verify()).rejects.toHaveProperty('code','REFERENCE_HASH_MISMATCH');
 }
 state.call.mockResolvedValue({isError:true,content:[{type:'text',text:'content_hash_mismatch: exact guard refused'}]});await expect(verify()).rejects.toHaveProperty('code','REFERENCE_HASH_MISMATCH');
});
