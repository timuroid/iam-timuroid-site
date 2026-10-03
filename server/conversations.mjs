import {randomBytes,randomUUID,createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=/^[a-f0-9-]{36}$/i;
export function createConversationArchive(sqlite){
  function identity(request,secure){
    const name=secure?'__Host-timuroid_visitor':'timuroid_visitor_local';
    let token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
    let cookie;
    if(!/^[a-zA-Z0-9_-]{43}$/.test(token||'')){token=randomBytes(32).toString('base64url');cookie=`${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure?'; Secure':''}`;}
    const hash=digest(token);return{hash,label:hash.slice(0,8),cookie};
  }
  function create(request,visitor,body={}){
    const id=randomUUID(),now=new Date().toISOString();
    const page=String(body.page_path||body.context?.current_page||'/').split(/[?#]/)[0].slice(0,200);
    sqlite.prepare('INSERT INTO visitor_sessions(id,visitor_hash,visitor_label,started_at,updated_at,channel,page_path,device,user_agent) VALUES(?,?,?,?,?,?,?,?,?)').run(id,visitor.hash,visitor.label,now,now,body.channel==='voice'?'voice':'text',page,String(body.device||body.context?.device||'').slice(0,30),String(request.headers.get('user-agent')||'').slice(0,300));
    return sqlite.prepare('SELECT * FROM visitor_sessions WHERE id=?').get(id);
  }
  function owner(id,visitor){return uuid.test(String(id||''))?sqlite.prepare('SELECT * FROM visitor_sessions WHERE id=? AND visitor_hash=?').get(id,visitor.hash):null;}
  function append(session,entry){
    const now=new Date().toISOString(),content=String(entry.content||'').trim();
    if(!content||content.length>32000||!['user','assistant','tool','error'].includes(entry.role))return false;
    const eventId=String(entry.event_id||randomUUID()).slice(0,160),channel=entry.channel==='voice'?'voice':'text';
    sqlite.prepare(`INSERT INTO conversation_messages(session_id,event_id,role,content,channel,model,source,created_at,is_final) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id,event_id) DO UPDATE SET content=CASE WHEN conversation_messages.is_final=1 AND excluded.is_final=0 THEN conversation_messages.content ELSE excluded.content END,is_final=MAX(conversation_messages.is_final,excluded.is_final),source=CASE WHEN excluded.source='server' THEN 'server' ELSE conversation_messages.source END,model=CASE WHEN excluded.model<>'' THEN excluded.model ELSE conversation_messages.model END`).run(session.id,eventId,entry.role,content,channel,String(entry.model||'').slice(0,100),entry.source==='server'?'server':'browser',now,entry.complete===false?0:1);
    const mode=session.channel===channel?channel:'mixed';
    sqlite.prepare('UPDATE visitor_sessions SET updated_at=?,channel=? WHERE id=?').run(now,mode,session.id);session.channel=mode;
    return true;
  }
  const decorate=(response,visitor,session)=>{if(visitor.cookie)response.headers.set('Set-Cookie',visitor.cookie);if(session)response.headers.set('X-Conversation-Id',session.id);return response;};
  async function handle(request,{secure=false}={}){
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/api/conversations/'))return null;
    if(request.method!=='POST')return json({error:'Метод не поддерживается.'},405);
    if(request.headers.get('origin')!==(secure?'https://':'http://')+new URL(request.url).host)return json({error:'Откройте разговор на этом сайте.'},403);
    let body;try{const raw=await request.text();if(raw.length>40000)throw new Error();body=JSON.parse(raw);}catch{return json({error:'Не удалось прочитать сообщение.'},400);}
    const visitor=identity(request,secure);
    if(path==='/api/conversations/start'){
      const session=create(request,visitor,body);return decorate(json({id:session.id}),visitor,session);
    }
    const session=owner(body.session_id,visitor);if(!session)return json({error:'Сессия не найдена.'},404);
    if(path==='/api/conversations/message'){
      if(!append(session,{...body,source:'browser'}))return json({error:'Не удалось сохранить реплику.'},400);
      return json({ok:true});
    }
    if(path==='/api/conversations/end'){
      sqlite.prepare('UPDATE visitor_sessions SET ended_at=?,updated_at=? WHERE id=?').run(new Date().toISOString(),new Date().toISOString(),session.id);return json({ok:true});
    }
    return json({error:'Не найдено.'},404);
  }
  async function prepare(request,{secure=false}={}){
    const path=new URL(request.url).pathname;
    if(request.method!=='POST'||!['/api/chat','/api/realtime'].includes(path))return null;
    const origin=request.headers.get('origin');
    if(origin&&origin!==(secure?'https://':'http://')+new URL(request.url).host)return{response:json({error:'Откройте разговор на этом сайте.'},403)};
    let body;try{const raw=await request.clone().text();if(raw.length>50000)return null;body=JSON.parse(raw);}catch{return null;}
    const visitor=identity(request,secure);
    const session=body.session_id?owner(body.session_id,visitor):create(request,visitor,{...body,channel:path==='/api/realtime'?'voice':'text'});
    if(!session)return{response:json({error:'Сессия не найдена. Начните новый разговор.'},404)};
    return{session,decorate:response=>decorate(response,visitor,session),append:entry=>append(session,{...entry,source:'server'})};
  }
  return{handle,prepare};
}
