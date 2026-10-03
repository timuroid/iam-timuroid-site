import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {scryptSync,randomUUID} from 'node:crypto';
import {createConversationArchive} from '../server/conversations.mjs';
import {createAdminHandler} from '../server/admin.mjs';
const db=new DatabaseSync(':memory:');
for(const file of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile('drizzle/'+file,'utf8'));
const archive=createConversationArchive(db),checks=[];
async function check(name,fn){await fn();checks.push(name);}
const req=(path,body,cookie='',origin='https://example.test')=>new Request('http://example.test/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'User-Agent':'Synthetic test'},body:JSON.stringify(body)});
const first=await archive.handle(req('conversations/start',{channel:'voice',page_path:'/cases/test?secret=x',device:'mobile'}),{secure:true}),cookie=first.headers.get('set-cookie').split(';')[0],id=(await first.json()).id;
await check('visitor cookie is random Secure HttpOnly and hashes are stored',async()=>{assert.match(first.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.match(first.headers.get('set-cookie'),/Secure/);const row=db.prepare('SELECT * FROM visitor_sessions WHERE id=?').get(id);assert.notEqual(row.visitor_hash,cookie.split('=')[1]);assert.equal(row.page_path,'/cases/test');});
await check('foreign origin is refused behind HTTPS proxy',async()=>assert.equal((await archive.handle(req('conversations/start',{},cookie,'https://evil.test'),{secure:true})).status,403));
await check('voice messages persist without contact submission',async()=>{assert.equal((await archive.handle(req('conversations/message',{session_id:id,event_id:'voice:u',role:'user',content:'Как применить ИИ?',channel:'voice'},cookie),{secure:true})).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n,0);});
await check('repeated event updates transcript without duplicate',async()=>{await archive.handle(req('conversations/message',{session_id:id,event_id:'voice:u',role:'user',content:'Как применить ИИ к документам?',channel:'voice'},cookie),{secure:true});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,1);assert.match(db.prepare('SELECT content FROM conversation_messages').get().content,/документам/);});
await check('another visitor cannot append or end a session',async()=>{for(const path of ['message','end'])assert.equal((await archive.handle(req('conversations/'+path,{session_id:id,role:'user',content:'Intrusion'}),{secure:true})).status,404);});
const second=await archive.handle(req('conversations/start',{channel:'text'},cookie),{secure:true}),secondId=(await second.json()).id;
await check('same cookie links distinct sessions',async()=>{const rows=db.prepare('SELECT visitor_hash FROM visitor_sessions').all();assert.equal(rows.length,2);assert.equal(rows[0].visitor_hash,rows[1].visitor_hash);assert.notEqual(secondId,id);});
await check('server capture authenticates session ownership',async()=>{assert.equal((await archive.prepare(req('chat',{session_id:id}),{secure:true})).response.status,404);const capture=await archive.prepare(req('chat',{session_id:id},cookie),{secure:true});capture.append({event_id:'text:u',role:'user',content:'Нужен помощник',channel:'text'});capture.append({event_id:'text:a',role:'assistant',content:'Обсудим задачу.',channel:'text',model:'gpt-6-luna'});assert.equal(db.prepare('SELECT channel FROM visitor_sessions WHERE id=?').get(id).channel,'mixed');assert.equal(db.prepare("SELECT source FROM conversation_messages WHERE event_id='text:a'").get().source,'server');});
await check('close survives late final transcript',async()=>{await archive.handle(req('conversations/end',{session_id:id},cookie),{secure:true});await archive.handle(req('conversations/message',{session_id:id,event_id:'voice:a',role:'assistant',content:'Последняя фраза',channel:'voice'},cookie),{secure:true});assert(db.prepare('SELECT ended_at FROM visitor_sessions WHERE id=?').get(id).ended_at);});
const salt='0123456789abcdef0123456789abcdef',password='synthetic-password';
const admin=createAdminHandler({sqlite:db,getSpecification:()=>({}),passwordHash:'scrypt:'+salt+':'+scryptSync(password,salt,64).toString('hex')});
const login=await admin(req('admin/login',{login:'timuroid',password}),{secure:true}),adminCookie=login.headers.get('set-cookie').split(';')[0];
const get=path=>new Request('https://example.test/api/admin/'+path,{headers:{Cookie:adminCookie}});
await check('anonymous users cannot read transcripts',async()=>{assert.equal((await admin(new Request('https://example.test/api/admin/conversations/'+id),{secure:true})).status,401);assert.equal((await archive.handle(new Request('https://example.test/api/conversations/message'),{secure:true})).status,405);});
await check('owner sees sessions, search and visitor grouping',async()=>{const list=await(await admin(get('conversations'),{secure:true})).json();assert.equal(list.total,2);const label=list.items[0].visitor_label;assert.equal((await(await admin(get('conversations?visitor='+label),{secure:true})).json()).total,2);assert.equal((await(await admin(get('conversations?q=документам'),{secure:true})).json()).total,1);assert.equal((await(await admin(get('conversations?q='+encodeURIComponent("' OR 1=1 --")),{secure:true})).json()).total,0);});
await check('owner detail exposes text and model, not visitor credential',async()=>{const detail=await(await admin(get('conversations/'+id),{secure:true})).json();assert.equal(detail.messages.length,4);assert.equal(detail.messages.find(x=>x.event_id==='text:a').model,'gpt-6-luna');assert.equal(detail.session.visitor_hash,undefined);assert.equal(detail.session.id,id);});
await check('message pagination preserves every message',async()=>{const capture=await archive.prepare(req('chat',{session_id:secondId},cookie),{secure:true});for(let i=0;i<205;i++)capture.append({event_id:'page:'+i,role:'user',content:'Строка '+i,channel:'text'});const page=await(await admin(get('conversations/'+secondId),{secure:true})).json();assert.equal(page.messages.length,200);assert(page.next);const next=await(await admin(get('conversations/'+secondId+'?after='+page.next),{secure:true})).json();assert.equal(next.messages.length,5);assert.equal(next.next,null);});
await check('export includes the whole conversation',async()=>{const response=await admin(get('conversations/'+secondId+'/export'),{secure:true});assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal((await response.json()).messages.length,205);});
await check('additive migration leaves original tables usable',async()=>assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok'));
await check('partial transcripts cannot overwrite completed messages',async()=>{
  for(const [content,complete]of [['Начало',false],['Полная реплика',true],['Позднее начало',false]])await archive.handle(req('conversations/message',{session_id:id,event_id:'partial',role:'assistant',content,channel:'voice',complete},cookie),{secure:true});
  const row=db.prepare("SELECT content,is_final FROM conversation_messages WHERE event_id='partial'").get();assert.equal(row.content,'Полная реплика');assert.equal(row.is_final,1);
});
await check('browser outbox preserves session boundaries and retries offline messages',async()=>{
  const storage=new Map(),events={},timers=new Map();let visitorCookie=cookie,offline=false;
  const context=vm.createContext({crypto:{randomUUID},AbortSignal,JSON,Promise,console,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},window:{addEventListener:(type,fn)=>events[type]=fn},setTimeout:fn=>{timers.set(1,fn);return 1},clearTimeout:()=>{},fetch:async(path,options)=>{
    if(offline)throw new Error('Offline');const response=await archive.handle(req(path.replace('/api/',''),JSON.parse(options.body),visitorCookie),{secure:true});
    const next=response.headers.get('set-cookie');if(next)visitorCookie=next.split(';')[0];return response;
  }});
  const source=(await readFile('public/conversation-log.js','utf8')).replace(/^export /gm,'');vm.runInContext(source+'\nglobalThis.recorder={beginConversation,getConversationId,recordConversation,endConversation};',context);
  const r=context.recorder;async function settle(){for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));}
  r.beginConversation('voice',{device:'mobile'});const oldId=await r.getConversationId();r.recordConversation('user','Старая сессия',{event_id:'early'});r.endConversation();
  r.beginConversation('text',{});const freshId=await r.getConversationId();await settle();assert.notEqual(oldId,freshId);
  assert.equal(db.prepare('SELECT content FROM conversation_messages WHERE session_id=?').get(oldId).content,'Старая сессия');assert(db.prepare('SELECT ended_at FROM visitor_sessions WHERE id=?').get(oldId).ended_at);
  offline=true;r.recordConversation('user','Сохранить после восстановления сети',{event_id:'retry',channel:'text'});await settle();assert(JSON.parse(storage.get('timuroid-conversation-outbox')).length);
  offline=false;events.online();await settle();assert.equal(JSON.parse(storage.get('timuroid-conversation-outbox')).length,0);
  assert.equal(db.prepare('SELECT content FROM conversation_messages WHERE session_id=?').get(freshId).content,'Сохранить после восстановления сети');r.endConversation();await settle();
});
db.close();console.log(JSON.stringify({check:'anonymous conversations',passed:checks.length,checks}));
