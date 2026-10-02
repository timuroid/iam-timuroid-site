import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createInterface} from 'node:readline/promises';
import {serveMedia} from '../server/media.mjs';
await mkdir('.sites-runtime',{recursive:true});
const localDb=new DatabaseSync('.sites-runtime/preview.sqlite');
const {readdir}=await import('node:fs/promises');
localDb.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)');
for(const name of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort()){
  if(!localDb.prepare('SELECT name FROM __local_migrations WHERE name=?').get(name)){
    localDb.exec(await readFile(path.join('drizzle',name),'utf8'));
    localDb.prepare('INSERT INTO __local_migrations(name) VALUES (?)').run(name);
  }
}
const binding={prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return localDb.prepare(sql).get(...params)||null;},async run(){return localDb.prepare(sql).run(...params);}};}};
const secrets={OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_TEXT_MODEL:process.env.OPENAI_TEXT_MODEL,OPENAI_REALTIME_MODEL:process.env.OPENAI_REALTIME_MODEL};
if(process.argv.includes('--secret-stdin')){
  if(process.stdin.isTTY)process.stdin.setRawMode(true);
  const lines=createInterface({input:process.stdin,output:process.stdout,terminal:false});
  console.log('Ready for hidden preview configuration on stdin.');
  for await(const line of lines){Object.assign(secrets,JSON.parse(line));lines.close();if(process.stdin.isTTY)process.stdin.setRawMode(false);break;}
}
const server=http.createServer(async(req,res)=>{
  try{
    if(await serveMedia(req,res,path.resolve('public/media')))return;
    const assetRoot=path.resolve('public');const pathname=new URL(req.url,'http://localhost').pathname;
    const filePath=path.resolve(assetRoot,'.'+pathname);const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf'};
    if(filePath.startsWith(assetRoot+path.sep)&&types[path.extname(filePath)]&&req.method==='GET'){
      const data=await readFile(filePath);res.writeHead(200,{'Content-Type':types[path.extname(filePath)]});res.end(data);return;
    }
    const bytes=[];for await(const chunk of req)bytes.push(chunk);
    const worker=(await import('../dist/server/index.js?'+Date.now())).default;
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(bytes)}:{})});
    const response=await worker.fetch(request,{DB:binding,...secrets},{waitUntil(){}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end('Preview error: '+e.message);}
});
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`Local: http://${host}:${server.address().port}`));
