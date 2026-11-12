import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { handle } from '../server/api.js';
import { handleReportImage } from '../server/report-images.js';
import { fixture } from '../test/fixture.js';
import { passwordHash, randomHex } from '../server/auth.js';
const app = fileURLToPath(new URL('../',import.meta.url)), root=path.resolve(app,'../..');
const demo=process.argv.includes('--demo'), port=Number(process.env.PORT || 8791);
const imageObjects=new Map();
const imageBucket={
  async get(key){const value=imageObjects.get(key);return value ? {body:value.body,size:value.body.byteLength,httpMetadata:value.httpMetadata,customMetadata:value.customMetadata} : null;},
  async put(key,body,options={}){imageObjects.set(key,{body:new Uint8Array(body),...options});},
  async delete(key){imageObjects.delete(key);}
};
const env=demo?{ LAB_SESSION_SECRET:randomHex(32),LAB_ADMIN_HASH:await passwordHash('teacher-demo-2026'),LAB_SHEETS_URL:'demo',LAB_SHEETS_SECRET:'demo',REPORT_IMAGES:imageBucket }:{...process.env,REPORT_IMAGES:imageBucket};
const f=demo?fixture():null;
if(f)for(const s of f.db.all('Students'))f.db.put('Students',{...s,passwordHash:await passwordHash('student-demo-2026')});
const repo=f?{execute:async(a,p,u)=>f.run(a,p,u || {})}:undefined;
const allowed=new Set(['index.html','app.js','styles.css','seed.js','autosave.js','roster.js','report-document.js','vendor/qrcode.mjs','vendor/xlsx.full.min.js','vendor/html2pdf.bundle.min.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost:'+port);
    if(url.pathname.startsWith('/api/lab/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks);
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body,duplex:'half'}:{})});
      const result=url.pathname.startsWith('/api/lab/report-image/')?await handleReportImage(request,env,repo):await handle(request,env,repo);
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    let file;
    if(url.pathname==='/fonts/PretendardVariable.woff2')file=path.join(root,'fonts/PretendardVariable.woff2');
    else {
      const name=url.pathname.replace(/^\/apps\/life-science-lab\/?/,'').replace(/^\//,'')||'index.html';
      if(!allowed.has(name)){res.writeHead(404);res.end('Not found');return;}file=name==='vendor/html2pdf.bundle.min.js'?path.join(app,'node_modules/html2pdf.js/dist/html2pdf.bundle.min.js'):path.join(app,name);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(500);res.end('Preview error');}
}).listen(port,'127.0.0.1',()=>{
  console.log('Local: http://localhost:'+port+'/apps/life-science-lab/');
  if(demo)console.log('DEMO ONLY — memory storage. Student 2026/2/1/1 가상연구자1 / student-demo-2026. Teacher / teacher-demo-2026');
});
