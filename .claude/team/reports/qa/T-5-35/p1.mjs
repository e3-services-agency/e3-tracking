import http from "node:http";
import crypto from "node:crypto";
const ORIGIN="https://tracking.e3-services.com", HOST="tracking.e3-services.com";
const REDIR="https://claude.ai/api/mcp/auth_callback";
export const log=(...a)=>console.log(...a);
export function req(method,path,{headers={},body,origin,staff=false}={}){
  return new Promise((res,rej)=>{
    const h={Host:HOST,...headers};
    if(staff)h["X-Forwarded-Email"]="qa@e3-services.com";
    if(origin!==undefined)h.Origin=origin;
    if(body!==undefined)h["Content-Length"]=Buffer.byteLength(body);
    const r=http.request({host:"127.0.0.1",port:3105,method,path,headers:h},m=>{let d="";m.on("data",c=>d+=c);m.on("end",()=>res({status:m.statusCode,headers:m.headers,text:d}));});
    r.on("error",rej);if(body!==undefined)r.write(body);r.end();});
}
export const form=o=>new URLSearchParams(o).toString();
export const FORM={"Content-Type":"application/x-www-form-urlencoded"};
export const JSONH={"Content-Type":"application/json"};
const b64=b=>b.toString("base64url");
export const red=s=>s.replace(/"(access|refresh)_token":"[^"]+"/g,`"$1_token":"<redacted>"`);
export async function register(){
  return JSON.parse((await req("POST","/mcp/oauth/register",{headers:JSONH,body:JSON.stringify({client_name:"Claude QA",redirect_uris:[REDIR],token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"]}),origin:"https://claude.ai"})).text);
}
export async function authorize(client,scope,{method="S256"}={}){
  const verifier=b64(crypto.randomBytes(32));
  const challenge=method==="S256"?b64(crypto.createHash("sha256").update(verifier).digest()):verifier;
  const q=form({response_type:"code",client_id:client.client_id,redirect_uri:REDIR,code_challenge:challenge,code_challenge_method:method,resource:ORIGIN+"/mcp",scope,state:"st123"});
  const r=await req("GET","/mcp/oauth/authorize?"+q,{staff:true});
  return {r,verifier};
}
export async function fullFlow(client,scope){
  const {r,verifier}=await authorize(client,scope);
  if(r.status!==200){log("authorize status",r.status,r.headers.location,r.text.slice(0,300));return null;}
  const sc=[].concat(r.headers["set-cookie"]||[]);
  const cookie=sc.map(c=>c.split(";")[0]).join("; ");
  const csrf=/name="csrf"\s+value="([^"]+)"/.exec(r.text)?.[1]||/value="([^"]+)"\s+name="csrf"/.exec(r.text)?.[1];
  const pids=[...r.text.matchAll(/name="project"\s+value="([^"]+)"/g)].map(m=>m[1]);
  return {r,verifier,cookie,csrf,pids,setCookie:sc};
}
export async function approve(f,{write=false,pick=0,origin=ORIGIN,decision="approve"}={}){
  const p=new URLSearchParams({csrf:f.csrf,decision});p.append("project",f.pids[pick]);
  if(write)p.append("write","yes");
  return req("POST","/mcp/oauth/consent",{staff:true,headers:{...FORM,Cookie:f.cookie},body:p.toString(),origin});
}
export const token=(client,code,verifier)=>req("POST","/mcp/oauth/token",{headers:FORM,origin:"https://claude.ai",body:form({grant_type:"authorization_code",client_id:client.client_id,code,code_verifier:verifier,redirect_uri:REDIR,resource:ORIGIN+"/mcp"})});
export async function getToken(client,scope,write=false){
  const f=await fullFlow(client,scope);
  const a=await approve(f,{write});
  const code=new URL(a.headers.location).searchParams.get("code");
  const t=await token(client,code,f.verifier);
  return {f,a,code,t,tok:JSON.parse(t.text)};
}
export const rpc=(access,method,params,id=1)=>req("POST","/mcp",{headers:{...JSONH,Accept:"application/json, text/event-stream",Authorization:"Bearer "+access,"MCP-Protocol-Version":"2025-06-18"},body:JSON.stringify({jsonrpc:"2.0",id,method,params})});
export const parse=r=>{const t=r.text;const d=t.split("\n").find(l=>l.startsWith("data:"));try{return JSON.parse(d?d.slice(5):t);}catch{return {raw:t};}};
export const init={protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"qa",version:"1"}};
export {ORIGIN,REDIR};
