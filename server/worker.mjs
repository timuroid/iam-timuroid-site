// ASSET_IMPORT
const responses = {
  json: (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
};
const toolDefinitions = [
  {type:'function',name:'show_section',description:'Показать раздел сайта. Только допустимые разделы.',parameters:{type:'object',properties:{section_id:{type:'string',enum:['home','cases','services','experience','tools','contact','path','research','practice']}},required:['section_id'],additionalProperties:false}},
  {type:'function',name:'show_case',description:'Открыть страницу проекта на сайте; разговор свернётся в компактную панель.',parameters:{type:'object',properties:{case_id:{type:'string',enum:['knowledge-assistant','content-workspace','document-review']}},required:['case_id'],additionalProperties:false}},
  {type:'function',name:'show_experience',description:'Показать профессиональный опыт в соответствующем разделе сайта.',parameters:{type:'object',properties:{experience_id:{type:'string',enum:['digital-steel','bmstu-research','bmstu-teaching']}},required:['experience_id'],additionalProperties:false}},
  {type:'function',name:'show_career',description:'Показать конкретное место работы, например Whistling Production Bureau.',parameters:{type:'object',properties:{career_id:{type:'string',enum:SITE.career.map(c=>c.id)}},required:['career_id'],additionalProperties:false}},
  {type:'function',name:'begin_contact_request',description:'Помочь составить запрос: открыть форму и спросить имя, контакт и задачу по одному. Ничего не отправляет.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'cancel_contact_request',description:'Прекратить сбор контакта по просьбе посетителя. Черновик остаётся в форме.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'clear_contact_request',description:'Удалить указанные данные из черновика контактной формы по явной просьбе посетителя. Реально очищает поля и снимает согласие; не удаляет уже отправленную заявку.',parameters:{type:'object',properties:{field:{type:'string',enum:['all','name','contact','message'],description:'all — все поля; name — имя; contact — способ связи; message — описание задачи.'}},required:['field'],additionalProperties:false}},
  {type:'function',name:'open_contact',description:'Открыть контактную форму. Ничего не отправляет.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'prepare_contact_request',description:'Заполнить подтверждённые посетителем имя, контакт или задачу в черновике формы. Передай только полученные поля; ничего не отправляет.',parameters:{type:'object',properties:{name:{type:'string',maxLength:100},contact:{type:'string',maxLength:180},process:{type:'string',maxLength:2000},goal:{type:'string',maxLength:2000},constraints:{type:'string',maxLength:2000},summary:{type:'string',maxLength:4000,description:'Только конкретная задача, названная посетителем. Если он сообщил только имя или контакт, не передавай summary. Не пиши общие слова вроде «Запрос» или «Заполнение формы».'}},additionalProperties:false}}
];
function safeContext(context={}){
  const fields={name:100,contact:180,message:4000,process:2000,goal:2000,constraints:2000};
  const draft=Object.fromEntries(Object.entries(fields).map(([key,max])=>[key,String(context.contact_draft?.[key]||'').slice(0,max)]));
  return{current_page:typeof context.current_page==='string'?context.current_page.slice(0,100):'/',visible_section:typeof context.visible_section==='string'?context.visible_section.slice(0,50):'home',active_case:SITE.cases.some(c=>c.id===context.active_case)?context.active_case:null,device:context.device==='mobile'?'mobile':'desktop',contact_request:context.contact_request===true,contact_missing:context.contact_request===true?AGENT_PROMPTS.question_order.filter(key=>!draft[key].trim()):[],contact_draft:context.contact_request===true?draft:undefined};
}
function contactInstructions(context={}){
  if(context.contact_request!==true)return '';
  const safe=safeContext(context),missing=safe.contact_missing;
  return `Составление запроса уже началось. Подтверждённый черновик: ${JSON.stringify(safe.contact_draft)}. Следующий вопрос: ${missing.length?AGENT_PROMPTS.questions[missing[0]]:'Проверка и ручная отправка формы'}. Не вызывай begin_contact_request повторно.`;
}
function instructions(context={}){
  const base=context.contact_request===true?AGENT_PROMPTS.interview:AGENT_PROMPTS.general;
  return `${base}\nДанные сайта: ${JSON.stringify(SITE)}. Подтверждённый расширенный контекст: ${JSON.stringify(AGENT_KNOWLEDGE)}. Состояние: ${JSON.stringify(safeContext(context))}. ${contactInstructions(context)}`;
}
export function getAgentSpecification(env={}){
  return{prompts:AGENT_PROMPTS,assembled:{general:instructions({}),text:instructions({})+' '+AGENT_PROMPTS.text_output,interview:instructions({contact_request:true})+' '+AGENT_PROMPTS.text_output,voice_interview:instructions({})+'\n'+AGENT_PROMPTS.interview+' '+contactInstructions({contact_request:true}),context_note:'Текущая страница и заполненные поля добавляются отдельно для каждого посетителя.'},models:{text:env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',realtime:env.OPENAI_REALTIME_MODEL||'gpt-realtime',voice:env.OPENAI_REALTIME_VOICE||'cedar',transcription:'gpt-4o-mini-transcribe',voice_tokens:'inf',text_tokens:2048,turn_detection:{type:'server_vad',threshold:.74,prefix_padding_ms:300,silence_duration_ms:950,create_response:false,interrupt_response:false}},tools:toolDefinitions,knowledge:AGENT_KNOWLEDGE,site:SITE,storage:{audio:false,ordinary_chat:false,interview:'Только после ручного согласия и отправки: поля брифа и текст реплик интервью.',draft:'В текущей вкладке до отправки.'}};
}
function db(env){if(!env.DB?.prepare)throw new Error('Хранилище временно недоступно.');return env.DB;}
async function rateLimit(request,env,scope,max){
  const hour=Math.floor(Date.now()/3600000);
  const identity=request.headers.get('cf-connecting-ip')||request.headers.get('oai-authenticated-user-id')||'local';
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${identity}:${scope}:${hour}`));
  const key=Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');
  const row=await db(env).prepare('INSERT INTO rate_limits (id, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1 RETURNING count').bind(key,(hour+2)*3600000).first();
  await db(env).prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(Date.now()).run();
  return row.count<=max;
}
async function parse(request,max=24000){if(Number(request.headers.get('content-length')||0)>max)throw new Error('Слишком большой запрос.');const text=await request.text();if(text.length>max)throw new Error('Слишком большой запрос.');try{return JSON.parse(text);}catch{throw new Error('Не удалось прочитать запрос.');}}
function originAllowed(request){const origin=request.headers.get('Origin');if(!origin)return true;try{return new URL(origin).host===new URL(request.url).host;}catch{return false;}}
function validAction(result){
  const sections=['home','cases','services','experience','tools','contact','path','research','practice'];
  if(result.action==='show_section'&&!sections.includes(result.target))result.action='none';
  if(result.action==='show_case'&&!SITE.cases.some(c=>c.id===result.target))result.action='none';
  if(result.action==='show_career'&&!SITE.career.some(c=>c.id===result.target))result.action='none';
  if(result.action==='show_experience'&&!SITE.experience.some(c=>c.id===result.target))result.action='none';
  if(result.action==='clear_contact_request'){
    if(!['all','name','contact','message'].includes(result.target))result.action='none';
    result.summary='';result.draft_name='';result.draft_contact='';result.interview={process:'',goal:'',constraints:''};
  }
  if(result.action==='prepare_contact_request'&&(![result.summary,result.draft_name,result.draft_contact,...Object.values(result.interview||{})].some(x=>typeof x==='string'&&x.trim())||String(result.summary||'').length>4000||String(result.draft_name||'').length>100||String(result.draft_contact||'').length>180||Object.values(result.interview||{}).some(value=>typeof value!=='string'||value.length>2000)))result.action='none';
  return result;
}
async function chat(request,env){
  const input=await parse(request);
  if(!Array.isArray(input.messages)||!input.messages.length||input.messages.length>12)return responses.json({error:'Напишите короткий вопрос.'},400);
  const history=input.messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,1500)}));
  if(!history.length||history.at(-1).role!=='user')return responses.json({error:'Напишите вопрос.'},400);
  if(!env.OPENAI_API_KEY)return responses.json({error:'Агент пока не подключён. Напишите Тимуру через форму.'},503);
  const schema={type:'object',properties:{interview:{type:'object',properties:{process:{type:'string'},goal:{type:'string'},constraints:{type:'string'}},required:['process','goal','constraints'],additionalProperties:false},reply:{type:'string'},action:{type:'string',enum:['none','show_section','show_case','show_experience','show_career','begin_contact_request','cancel_contact_request','clear_contact_request','open_contact','prepare_contact_request']},target:{type:'string',description:'Для clear_contact_request: all, name, contact или message. Для навигации — ID раздела, кейса или места работы.'},summary:{type:'string',description:'Задача из последнего сообщения посетителя. Для ответа только с именем или контактом — пустая строка. Не подставляй общую тему опроса.'},draft_name:{type:'string',description:'Только новое имя из последнего сообщения; ранее известное имя не повторяй.'},draft_contact:{type:'string',description:'Только новый контакт из последнего сообщения; ранее известный контакт не повторяй.'}},required:['reply','action','target','summary','draft_name','draft_contact','interview'],additionalProperties:false};
  let system=instructions(input.context);
  const upstream=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:system+' '+AGENT_PROMPTS.text_output},...history],temperature:0.2,max_tokens:2048,response_format:{type:'json_schema',json_schema:{name:'site_guide',strict:true,schema}}}),signal:AbortSignal.timeout(25000)});
  if(!upstream.ok){console.error('OpenAI text request failed',upstream.status);return responses.json({error:upstream.status===429?'У AI-сервиса сейчас нет доступного лимита. Можно оставить запрос Тимуру.':'AI-сервис временно недоступен. Можно оставить запрос Тимуру.'},503);}
  const data=await upstream.json();try{const result=validAction(JSON.parse(data.choices?.[0]?.message?.content));if(typeof result.reply!=='string'||!result.reply)return responses.json({error:'Попробуйте задать вопрос иначе.'},502);
    if(result.action==='begin_contact_request')result.reply=AGENT_PROMPTS.questions.name;
    if(result.action==='prepare_contact_request'&&input.context?.contact_request===true){
      const known=safeContext(input.context).contact_draft;
      const explicitSkip=/пропуст|не знаю|не хочу|неизвест|не уточн|пока нет|закончи|закончим|хватит|достаточно/i.test(history.at(-1).content);
      for(const key of ['process','goal','constraints']){if(result.interview?.[key]===known[key]||result.interview?.[key]==='Не уточняли'&&!explicitSkip)result.interview[key]='';}
      if(result.draft_name===known.name)result.draft_name='';if(result.draft_contact===known.contact)result.draft_contact='';
      const merged={name:result.draft_name||known.name,contact:result.draft_contact||known.contact,message:result.summary||known.message,...Object.fromEntries(['process','goal','constraints'].map(key=>[key,result.interview?.[key]||known[key]]))};
      const missing=AGENT_PROMPTS.question_order.filter(key=>!merged[key].trim());
      result.reply=missing.length?AGENT_PROMPTS.questions[missing[0]]:'Черновик заполнен. Проверьте форму, отметьте согласие и нажмите «Отправить сообщение».';
    }
    return responses.json(result);}catch{return responses.json({error:'Агент не смог подготовить ответ. Попробуйте ещё раз.'},502);}
}
async function realtime(request,env){
  const input=await parse(request,50000);
  if(typeof input.sdp!=='string'||!input.sdp.startsWith('v=0')||input.sdp.length>40000)return responses.json({error:'Не удалось подготовить голосовое соединение.'},400);
  if(!env.OPENAI_API_KEY)return responses.json({error:'Голосовой агент пока не подключён.'},503);
  const form=new FormData();form.set('sdp',input.sdp);form.set('session',JSON.stringify({type:'realtime',model:env.OPENAI_REALTIME_MODEL||'gpt-realtime',instructions:instructions({...input.context,contact_request:false}),max_output_tokens:'inf',audio:{input:{noise_reduction:{type:'far_field'},transcription:{model:'gpt-4o-mini-transcribe',language:'ru'},turn_detection:{type:'server_vad',threshold:.74,prefix_padding_ms:300,silence_duration_ms:950,create_response:false,interrupt_response:false}},output:{voice:env.OPENAI_REALTIME_VOICE||'cedar'}},tools:toolDefinitions,tool_choice:'auto'}));
  const upstream=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(25000)});
  if(!upstream.ok){console.error('OpenAI voice request failed',upstream.status);return responses.json({error:upstream.status===429?'Голосовой сервис сейчас не имеет доступного лимита. Попробуйте текстовый режим.':'Голосовой сервис пока недоступен. Попробуйте текстовый режим.'},503);}
  return new Response(await upstream.text(),{headers:{'Content-Type':'application/sdp','Cache-Control':'no-store'}});
}
async function transcribe(request,env){
  if(Number(request.headers.get('content-length')||0)>10*1024*1024+10000)return responses.json({error:'Запись слишком большая. Расскажите короче.'},413);
  let input;try{input=await request.formData();}catch{return responses.json({error:'Не удалось прочитать запись.'},400);}
  const audio=input.get('audio');
  if(!audio||typeof audio.arrayBuffer!=='function'||!audio.size)return responses.json({error:'Запись не получилась. Попробуйте ещё раз.'},400);
  if(audio.size>10*1024*1024)return responses.json({error:'Запись слишком большая. Расскажите короче.'},413);
  const type=audio.type.split(';')[0];
  if(!['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-wav'].includes(type))return responses.json({error:'Браузер создал неподдерживаемую запись. Можно написать сообщение.'},415);
  if(!await rateLimit(request,env,'dictation',8))return responses.json({error:'Лимит голосовых сообщений достигнут. Можно написать текст.'},429);
  if(!env.OPENAI_API_KEY)return responses.json({error:'Голосовой ввод пока недоступен. Можно написать сообщение.'},503);
  const body=new FormData();body.set('file',audio,audio.name||'message.webm');body.set('model','gpt-4o-mini-transcribe');body.set('language','ru');body.set('response_format','json');
  const upstream=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body,signal:AbortSignal.timeout(30000)});
  if(!upstream.ok){console.error('OpenAI transcription failed',upstream.status);return responses.json({error:'Не удалось распознать запись. Попробуйте ещё раз или напишите текст.'},503);}
  const result=await upstream.json();const text=typeof result.text==='string'?result.text.trim():'';
  if(!text)return responses.json({error:'Не удалось разобрать речь. Попробуйте ещё раз.'},422);
  return responses.json({text:text.slice(0,4000)});
}
async function lead(request,env){
  const input=await parse(request,180000);
  if(input.company_website)return responses.json({error:'Не удалось отправить форму.'},400);
  const name=typeof input.name==='string'?input.name.trim():'';
  const contact=typeof input.contact==='string'?input.contact.trim():'';
  const message=typeof input.message==='string'?input.message.trim():'';
  if(!name||name.length>100||contact.length<3||contact.length>180||message.length<5||message.length>4000||input.consent!==true)return responses.json({error:'Проверьте имя, контакт, описание задачи и согласие.'},400);
  if(typeof input.requestId!=='string'||!/^[\da-f-]{36}$/i.test(input.requestId))return responses.json({error:'Обновите страницу и попробуйте ещё раз.'},400);
  const existing=await db(env).prepare('SELECT id FROM leads WHERE request_id = ?').bind(input.requestId).first();if(existing)return responses.json({ok:true,id:existing.id});
  if(!await rateLimit(request,env,'lead',6))return responses.json({error:'Слишком много запросов. Попробуйте позже.'},429);
  const interview=Object.fromEntries(['process','goal','constraints'].map(key=>[key,typeof input[key]==='string'?input[key].trim().slice(0,2000):'']));
  const conversation=Array.isArray(input.conversation)?input.conversation.slice(-40).filter(item=>item&&['user','assistant'].includes(item.role)&&typeof item.content==='string').map(item=>({role:item.role,content:item.content.slice(0,3000)})):[];
  const id=crypto.randomUUID();
  await db(env).prepare('INSERT INTO leads (id, request_id, name, contact, message, source, consent_at, created_at, interview_json, conversation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING').bind(id,input.requestId,name,contact,message,typeof input.source==='string'?input.source.slice(0,100):'website',new Date().toISOString(),new Date().toISOString(),JSON.stringify(interview),JSON.stringify(conversation)).run();
  const saved=await db(env).prepare('SELECT id FROM leads WHERE request_id = ?').bind(input.requestId).first();return responses.json({ok:true,id:saved.id},201);
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function securityHeaders(contentType,cache='no-cache'){return{'Content-Type':contentType,'Cache-Control':cache,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'microphone=(self), camera=()','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.openai.com; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"};}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){
    if(request.method!=='POST')return responses.json({error:'Метод не поддерживается.'},405);
    if(!originAllowed(request))return responses.json({error:'Запрос должен прийти с этого сайта.'},403);
    try{if(url.pathname==='/api/agent-context'){const input=await parse(request);if(input.context?.contact_request!==true)return responses.json({error:'Контактный опрос не начат.'},400);return responses.json({instructions:AGENT_PROMPTS.interview+' '+contactInstructions(input.context)});}if(url.pathname==='/api/chat')return await chat(request,env);if(url.pathname==='/api/realtime')return await realtime(request,env);if(url.pathname==='/api/leads')return await lead(request,env);if(url.pathname==='/api/transcribe')return await transcribe(request,env);return responses.json({error:'Не найдено.'},404);}catch(e){console.error('Site request failed',url.pathname,e.name);return responses.json({error:e.name==='TimeoutError'?'Ответ задерживается. Попробуйте ещё раз.':'Сервис временно недоступен. Ваш запрос можно повторить.'},503);}
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const asset=ASSETS[url.pathname==='/admin'||url.pathname==='/admin/'?'/admin.html':url.pathname];
  if(asset){const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:securityHeaders(asset.type,asset.type.startsWith('text/')?'no-cache':'public, max-age=3600')});}
  const match=url.pathname.match(/^\/cases\/([^/]+)\/?$/);const c=match&&SITE.cases.find(x=>x.id===match[1]);
  if(!['/','/privacy'].includes(url.pathname)&&!c)return new Response('Страница не найдена. Вернуться: '+url.origin,{status:404,headers:securityHeaders('text/plain; charset=utf-8')});
  let html=HTML.replace('<!--SITE_DATA-->','<script>window.__SITE='+JSON.stringify(SITE).replace(/</g,'\\u003c')+'</script>');
  if(c){html=html.replace(/<title>[^<]*<\/title>/,`<title>${esc(c.shortTitle)} — TIMUROID</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(c.description)}">`);}
  if(url.pathname==='/privacy')html=html.replace(/<title>[^<]*<\/title>/,'<title>О данных — TIMUROID</title>');
  return new Response(request.method==='HEAD'?null:html,{headers:securityHeaders('text/html; charset=utf-8')});
}};
