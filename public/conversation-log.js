// Session identity is server-issued; messages are visible only in the owner panel.
let current=null,queue=[],busy=false,retryTimer=null,startChain=Promise.resolve();
try{queue=JSON.parse(sessionStorage.getItem('timuroid-conversation-outbox')||'[]');if(!Array.isArray(queue))queue=[];}catch{queue=[];}
function persist(){try{sessionStorage.setItem('timuroid-conversation-outbox',JSON.stringify(queue));}catch{}}
async function post(path,body){
  const response=await fetch('/api/conversations/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true,signal:AbortSignal.timeout(10000)});
  if(!response.ok){if([400,403,404].includes(response.status))return {rejected:true};throw new Error('Conversation archive '+response.status);}
  return response.json();
}
export function beginConversation(channel,context={}){
  const holder={id:null,ready:null,channel};current=holder;
  holder.ready=startChain.then(()=>post('start',{channel,page_path:context.current_page,device:context.device})).then(result=>{holder.id=result.id;return result.id}).catch(()=>null);startChain=holder.ready;
}
export async function getConversationId(){const holder=current;const id=holder?.id||await holder?.ready;if(holder&&!id)throw new Error('Не удалось открыть сессию. Повторите попытку.');return id||null;}
function enqueue(path,body){queue.push({path,body});persist();void flush();}
export function recordConversation(role,content,{event_id,model='',channel='voice',complete=true}={}){
  const holder=current;if(!holder||!content)return;
  const entry={role,content,channel,model,complete,event_id:event_id||crypto.randomUUID()};
  const save=id=>{if(id){for(let offset=0;offset<entry.content.length;offset+=30000)enqueue('message',{...entry,content:entry.content.slice(offset,offset+30000),event_id:entry.event_id+':'+offset,session_id:id});}};
  if(holder.id)save(holder.id);else void holder.ready.then(save);
}
export function endConversation(){
  const holder=current;current=null;if(!holder)return;
  if(holder.id)enqueue('end',{session_id:holder.id});else void holder.ready.then(id=>{if(id)enqueue('end',{session_id:id});});
}
async function flush(){
  if(busy)return;busy=true;clearTimeout(retryTimer);
  try{while(queue.length){const item=queue[0];await post(item.path,item.body);queue.shift();persist();}}
  catch{retryTimer=setTimeout(()=>void flush(),5000);}
  finally{busy=false;}
}
window.addEventListener('online',()=>void flush());
window.addEventListener('pagehide',()=>{for(const item of queue){try{fetch('/api/conversations/'+item.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.body),keepalive:true}).catch(()=>{});}catch{}}});
if(queue.length)void flush();
