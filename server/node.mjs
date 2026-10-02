import http from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';
import {serveMedia} from './media.mjs';

process.umask(0o077);
const databasePath=path.resolve(process.env.DB_PATH||'data/timuroid.sqlite');
await mkdir(path.dirname(databasePath),{recursive:true});
const sqlite=new DatabaseSync(databasePath);
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS __site_migrations (name TEXT PRIMARY KEY)');
const migrationDirectory=new URL('../dist/server/drizzle/',import.meta.url);
for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')).sort()){
  if(sqlite.prepare('SELECT name FROM __site_migrations WHERE name=?').get(name))continue;
  sqlite.exec('BEGIN');
  try{sqlite.exec(await readFile(new URL(name,migrationDirectory),'utf8'));sqlite.prepare('INSERT INTO __site_migrations(name) VALUES(?)').run(name);sqlite.exec('COMMIT');}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
}
const DB={prepare(sql){let parameters=[];return{bind(...values){parameters=values;return this;},async first(){return sqlite.prepare(sql).get(...parameters)||null;},async run(){return sqlite.prepare(sql).run(...parameters);}};}};
const runtime={DB,OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_TEXT_MODEL:process.env.OPENAI_TEXT_MODEL,OPENAI_REALTIME_MODEL:process.env.OPENAI_REALTIME_MODEL};
const server=http.createServer(async(req,res)=>{
  try{
    if(await serveMedia(req,res,new URL('../dist/media/',import.meta.url)))return;
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>10*1024*1024+10000){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Слишком большой запрос.'}));return;}chunks.push(chunk);}
    const host=req.headers.host||'localhost';
    const request=new Request('http://'+host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,runtime,{waitUntil(task){Promise.resolve(task).catch(()=>{});}});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error('HTTP request failed',error.name);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Сервис временно недоступен. Попробуйте ещё раз.'}));}
});
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`TIMUROID listening on ${host}:${port}`));
function shutdown(){server.close(()=>{sqlite.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
