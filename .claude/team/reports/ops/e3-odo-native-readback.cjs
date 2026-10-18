// Read-only native API receipt collector; run inside the existing app container.
const http = require('node:http');
const assert = require('node:assert/strict');
const prefix='/api/projects/c992ddce-ef2f-49c1-8275-84806f08f744/historical-files';
const get=path=>new Promise((resolve,reject)=>{
 assert(path.startsWith(prefix+'/'));
 const req=http.get({hostname:'127.0.0.1',port:3001,path,agent:false,headers:{host:'tracking.e3-services.com','x-forwarded-email':'jan.pan@e3-services.com',connection:'close'}},res=>{
  let size=0;const chunks=[];
  res.on('data',v=>{size+=v.length;if(size>10485760)res.destroy(new Error('Response limit'));else chunks.push(v)});
  res.on('error',reject);res.on('end',()=>{if(res.statusCode!==200)return reject(new Error('Read-only native API HTTP '+res.statusCode));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch(e){reject(e)}});
 });req.setTimeout(60000,()=>req.destroy(new Error('Timeout')));req.on('error',reject);
});
(async()=>{
 const reports=await get(prefix+'/reports');
 assert(Array.isArray(reports)&&reports.length===1,'Expected exactly one historical report');
 const id=reports[0].report_id;assert(/^[a-f0-9-]{36}$/.test(id));
 const pages=[];let offset=0;
 do{
  const page=await get(prefix+'/reports/'+id+'?offset='+offset+'&limit=100');
  assert(page.report_id===id&&page.offset===offset&&page.checks_total<=100000);
  pages.push(page);offset+=page.checks.length;
  if(offset>=page.checks_total)break;
  assert(page.checks.length>0&&pages.length<1000);
 }while(true);
 const first=pages[0];assert(offset===first.checks_total);
 process.stdout.write(JSON.stringify({reports,sources:await get(prefix+'/sources'),pages,checks:pages.flatMap(p=>p.checks)}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
