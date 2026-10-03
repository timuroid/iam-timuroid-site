import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),hash=value=>createHash('sha256').update(value).digest('hex');
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...extra}});
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
async function verify(password,stored){
  const [scheme,salt,digest]=String(stored||'').split(':');
  if(scheme!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(digest))return false;
  const actual=await derive(password,salt,64);return timingSafeEqual(actual,Buffer.from(digest,'hex'));
}
export function createAdminHandler({sqlite,getSpecification,passwordHash,login='timuroid'}){
  const attempts=new Map();
  return async function admin(request,{ip='local',secure=false}={}){
    const url=new URL(request.url);if(!url.pathname.startsWith('/api/admin/'))return null;
    if(!passwordHash)return json({error:'Вход ещё не настроен на сервере.'},503);
    const cookieName=secure?'__Host-timuroid_admin':'timuroid_admin_local';
    const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
    const cookieHeader=(value,age)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
    if(!['GET','POST'].includes(request.method))return json({error:'Метод не поддерживается.'},405);
    if(request.method==='POST'){
      let origin;try{origin=new URL(request.headers.get('origin'));}catch{return json({error:'Откройте панель на этом сайте.'},403);}
      if(origin.host!==url.host)return json({error:'Откройте панель на этом сайте.'},403);
    }
    if(url.pathname==='/api/admin/login'&&request.method==='POST'){
      const now=Date.now(),prior=attempts.get(ip),counter=prior&&prior.until>now?prior:{count:0,until:now+15*60*1000};
      if(counter.count>=5)return json({error:'Слишком много попыток. Повторите через 15 минут.'},429);
      let body;try{const text=await request.text();if(text.length>2000)throw new Error();body=JSON.parse(text);}catch{return json({error:'Введите логин и пароль.'},400);}
      counter.count++;attempts.set(ip,counter);
      if(attempts.size>2000)for(const [key,value]of attempts)if(value.until<=now)attempts.delete(key);
      if(typeof body.password!=='string'||body.password.length>256||!equal(body.login,login)||!await verify(body.password,passwordHash))return json({error:'Логин или пароль не подходят.'},401);
      attempts.delete(ip);sqlite.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now);
      const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
      sqlite.prepare('INSERT INTO admin_sessions(token_hash,csrf,expires_at) VALUES(?,?,?)').run(hash(token),csrf,now+12*60*60*1000);
      return json({ok:true,csrf},200,{'Set-Cookie':cookieHeader(token,12*60*60)});
    }
    const session=cookie&&sqlite.prepare('SELECT csrf,expires_at FROM admin_sessions WHERE token_hash=?').get(hash(cookie));
    if(!session||session.expires_at<=Date.now())return json({error:'Войдите в панель.'},401);
    if(request.method==='POST'&&!equal(request.headers.get('x-csrf-token'),session.csrf))return json({error:'Обновите страницу и повторите действие.'},403);
    if(url.pathname==='/api/admin/session'&&request.method==='GET')return json({login,csrf:session.csrf});
    if(url.pathname==='/api/admin/logout'&&request.method==='POST'){
      sqlite.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hash(cookie));return json({ok:true},200,{'Set-Cookie':cookieHeader('',0)});
    }
    if(url.pathname==='/api/admin/spec'&&request.method==='GET')return json(getSpecification());
    if(url.pathname==='/api/admin/conversations'&&request.method==='GET'){
      const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
      const visitor=String(url.searchParams.get('visitor')||'');
      const query=String(url.searchParams.get('q')||'').slice(0,200);
      const where="WHERE (?='' OR s.visitor_label=?) AND (?='' OR EXISTS(SELECT 1 FROM conversation_messages m WHERE m.session_id=s.id AND instr(lower(m.content),lower(?))>0))";
      const values=[visitor,visitor,query,query];
      const items=sqlite.prepare(`SELECT s.id,s.visitor_label,s.started_at,s.updated_at,s.ended_at,s.channel,s.page_path,s.device,
        (SELECT COUNT(*) FROM conversation_messages m WHERE m.session_id=s.id) AS message_count,
        (SELECT content FROM conversation_messages m WHERE m.session_id=s.id AND m.role='user' ORDER BY id LIMIT 1) AS preview,
        (SELECT COUNT(*) FROM visitor_sessions v WHERE v.visitor_hash=s.visitor_hash) AS visitor_session_count
        FROM visitor_sessions s ${where} ORDER BY s.updated_at DESC,s.id DESC LIMIT 50 OFFSET ?`).all(...values,Math.floor(offset));
      const total=sqlite.prepare(`SELECT COUNT(*) AS count FROM visitor_sessions s ${where}`).get(...values).count;
      return json({items,total,next:offset+items.length<total?offset+items.length:null});
    }
    const conversationMatch=url.pathname.match(/^\/api\/admin\/conversations\/([a-f0-9-]{36})(?:\/(export))?$/i);
    if(conversationMatch&&request.method==='GET'){
      const session=sqlite.prepare('SELECT id,visitor_label,started_at,updated_at,ended_at,channel,page_path,device,user_agent FROM visitor_sessions WHERE id=?').get(conversationMatch[1]);
      if(!session)return json({error:'Диалог не найден.'},404);
      const after=Math.max(0,Number(url.searchParams.get('after'))||0),exporting=conversationMatch[2]==='export';
      const messages=sqlite.prepare('SELECT id,event_id,role,content,channel,model,source,is_final,created_at FROM conversation_messages WHERE session_id=? AND id>? ORDER BY id LIMIT ?').all(session.id,exporting?0:after,exporting?1000000:201);
      const next=!exporting&&messages.length>200?messages[199].id:null;
      return json({session,messages:exporting?messages:messages.slice(0,200),next},200,exporting?{'Content-Disposition':`attachment; filename="conversation-${session.id}.json"`}:{});
    }
    if(url.pathname==='/api/admin/leads'&&request.method==='GET'){
      const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
      const rows=sqlite.prepare('SELECT id,name,contact,message,source,created_at,review_status,interview_json FROM leads ORDER BY created_at DESC LIMIT 50 OFFSET ?').all(Math.floor(offset));
      const total=sqlite.prepare('SELECT COUNT(*) AS count FROM leads').get().count;
      return json({items:rows,total,next:offset+rows.length<total?offset+rows.length:null});
    }
    const match=url.pathname.match(/^\/api\/admin\/leads\/([a-f0-9-]{36})(?:\/(status|export))?$/i);
    if(match){
      const lead=sqlite.prepare('SELECT * FROM leads WHERE id=?').get(match[1]);if(!lead)return json({error:'Заявка не найдена.'},404);
      if(request.method==='POST'&&match[2]==='status'){
        let input;try{const text=await request.text();if(text.length>1000)throw new Error();input=JSON.parse(text);}catch{return json({error:'Не удалось прочитать статус.'},400);}
        if(!['new','read','archived'].includes(input.status))return json({error:'Неизвестный статус.'},400);
        sqlite.prepare('UPDATE leads SET review_status=? WHERE id=?').run(input.status,lead.id);return json({ok:true,status:input.status});
      }
      if(request.method==='GET')return json(lead,200,match[2]==='export'?{'Content-Disposition':`attachment; filename="interview-${lead.id}.json"`}:{});
    }
    return json({error:'Не найдено.'},404);
  };
}
