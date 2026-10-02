import {readFile,writeFile,mkdir,readdir,copyFile,cp,rm} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
await mkdir(path.join(root,'dist/server'),{recursive:true});
// Recreate only generated media output, so renamed source assets do not linger.
await rm(path.join(root,'dist/media'),{recursive:true,force:true});
const assets={};const types={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.ttf':'font/ttf'};
for(const entry of await readdir(path.join(root,'public'),{withFileTypes:true})){
  if(entry.name==='media'&&entry.isDirectory()){
    await cp(path.join(root,'public/media'),path.join(root,'dist/media'),{recursive:true});continue;
  }
  if(!entry.isFile()||entry.name==='index.html')continue;
  const bytes=await readFile(path.join(root,'public',entry.name));
  assets['/'+entry.name]={data:bytes.toString('base64'),type:types[path.extname(entry.name)]||'application/octet-stream'};
}
const html=await readFile(path.join(root,'public/index.html'),'utf8');
const site=JSON.parse(await readFile(path.join(root,'content/site.json'),'utf8'));
const knowledge=JSON.parse(await readFile(path.join(root,'content/agent-knowledge.json'),'utf8'));
const worker=await readFile(path.join(root,'server/worker.mjs'),'utf8');
const injection=`const SITE=${JSON.stringify(site)};\nconst AGENT_KNOWLEDGE=${JSON.stringify(knowledge)};\nconst HTML=${JSON.stringify(html.replace('<script type="module"','<!--SITE_DATA-->\n  <script type="module"'))};\nconst ASSETS=${JSON.stringify(assets)};`;
await writeFile(path.join(root,'dist/server/index.js'),worker.replace('// ASSET_IMPORT',injection));
await mkdir(path.join(root,'dist/server/drizzle'),{recursive:true});
for(const file of await readdir(path.join(root,'drizzle'))){if(file.endsWith('.sql'))await copyFile(path.join(root,'drizzle',file),path.join(root,'dist/server/drizzle',file));}
await writeFile(path.join(root,'dist/server/wrangler.json'),JSON.stringify({name:'timuroid',main:'index.js',compatibility_date:'2026-09-01',d1_databases:[{binding:'DB',database_name:'timuroid',database_id:'local-preview',migrations_dir:'drizzle'}]},null,2));
console.log('Built site API: dist/server/index.js; media: dist/media');
