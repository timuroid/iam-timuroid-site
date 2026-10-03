const $=selector=>document.querySelector(selector);
let csrf='',spec=null,items=[],next=null,selected=null,detailVersion=0;
function node(tag,text,className){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
const pretty=value=>JSON.stringify(value,null,2);
function parse(value,fallback){try{return JSON.parse(value);}catch{return fallback;}}
function date(value){return new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
async function api(path,options={}){
  const response=await fetch('/api/admin/'+path,{...options,headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});
  const result=await response.json();if(!response.ok){if(response.status===401)showLogin();throw new Error(result.error||'Не удалось получить данные.');}return result;
}
function error(text){$('#admin-error').textContent=text;$('#admin-error').hidden=!text;}
function showLogin(){csrf='';spec=null;items=[];selected=null;next=null;detailVersion++;$('#admin-view').hidden=true;$('#login-view').hidden=false;$('#lead-list').replaceChildren();$('#lead-detail').replaceChildren();$('#knowledge-content').replaceChildren();$('#prompt-content').replaceChildren();}
async function enter(){
  const session=await api('session');csrf=session.csrf;$('#login-view').hidden=true;$('#admin-view').hidden=false;$('#login-form [name=password]').value='';
  try{const results=await Promise.all([api('spec'),api('leads')]);spec=results[0];items=results[1].items;next=results[1].next;$('#inbox-count').textContent=results[1].total;renderLeads();renderKnowledge();renderPrompts();}catch(e){error(e.message);}
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('#login-error').textContent='';
  try{const values=Object.fromEntries(new FormData(event.currentTarget));const result=await api('login',{method:'POST',body:JSON.stringify(values)});csrf=result.csrf;await enter();}
  catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;}
});
$('#logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:'{}'});showLogin();}catch(e){error(e.message);}});
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>{
  for(const tab of document.querySelectorAll('[data-tab]')){if(tab===button)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');$('#tab-'+tab.dataset.tab).hidden=tab!==button;}
});
function renderLeads(){
  const list=$('#lead-list');list.replaceChildren();$('#more-leads').hidden=next===null;
  if(!items.length){list.append(node('p','Пока нет отправленных заявок. Они появятся здесь после согласия и отправки формы.','empty-state'));return;}
  for(const lead of items){
    const button=node('button',undefined,'lead-row'+(lead.review_status==='new'?' is-new':''));button.type='button';button.setAttribute('aria-current',String(lead.id===selected));
    button.append(node('strong',lead.name),node('span',date(lead.created_at)),node('p',lead.message));button.addEventListener('click',()=>showLead(lead.id));list.append(button);
  }
}
async function showLead(id){
  const version=++detailVersion;selected=id;renderLeads();error('');
  try{
    const lead=await api('leads/'+id);if(version!==detailVersion)return;
    const root=$('#lead-detail');root.replaceChildren();root.append(node('h2',lead.name),node('p',lead.contact,'lead-contact'),node('p',date(lead.created_at)+' • '+lead.source,'lead-date'));
    const actions=node('div',undefined,'lead-actions');
    for(const [status,label]of [['new','Новая'],['read','Просмотрена'],['archived','В архиве']]){
      const button=node('button',label);button.type='button';button.setAttribute('aria-pressed',String(lead.review_status===status));
      button.addEventListener('click',async()=>{button.disabled=true;try{await api('leads/'+id+'/status',{method:'POST',body:pretty({status})});const row=items.find(x=>x.id===id);if(row)row.review_status=status;await showLead(id);}catch(e){error(e.message);}finally{button.disabled=false;}});actions.append(button);
    }
    const download=node('a','Скачать JSON');download.href='/api/admin/leads/'+id+'/export';actions.append(download);root.append(actions);
    const interview=parse(lead.interview_json,{});
    for(const [label,value]of [['Задача',lead.message],['Текущий процесс',interview.process],['Желаемый результат',interview.goal],['Ограничения',interview.constraints]]){
      if(!value)continue;const field=node('section',undefined,'brief-field');field.append(node('h3',label),node('p',value));root.append(field);
    }
    const conversation=parse(lead.conversation_json,[]);
    if(conversation.length){
      const details=node('details');details.append(node('summary','Текст интервью ('+conversation.length+' реплик)'));
      const transcript=node('div',undefined,'transcript');for(const item of conversation){const message=node('div',undefined,'transcript-item');message.append(node('small',item.role==='user'?'Посетитель':'Агент'),node('p',item.content));transcript.append(message);}details.append(transcript);root.append(details);
    }else root.append(node('p','Текст интервью не прикреплён: заявка отправлена обычной формой либо до появления этого раздела.','source-note'));
    root.append(node('p','Согласие и отправка: '+date(lead.consent_at),'source-note'));
  }catch(e){error(e.message);}
}
async function loadMore(reset=false){try{const result=await api('leads?offset='+(reset?0:next||0));items=reset?result.items:[...items,...result.items];next=result.next;$('#inbox-count').textContent=result.total;renderLeads();if(selected&&reset)await showLead(selected);}catch(e){error(e.message);}}
$('#refresh-inbox').addEventListener('click',()=>loadMore(true));$('#more-leads').addEventListener('click',()=>loadMore());
function rawDetails(title,value){const details=node('details');details.append(node('summary',title),node('pre',typeof value==='string'?value:pretty(value)));return details;}
function renderKnowledge(){
  const root=$('#knowledge-content');root.replaceChildren();
  const notice=node('div',undefined,'notice');notice.append(node('h3','Что стоит дополнить'),node('p','Расширенные поля пока пустые. Для каждого проекта полезно подтвердить входные данные, результат, инструменты, вашу роль и ограничения. Числа и эффект добавляем только с подтверждением. Демонстрационные сценарии сохраняют явную пометку.'));root.append(notice);
  const cases=node('section',undefined,'knowledge-section');cases.append(node('h2','Проекты'));
  for(const item of spec.site.cases){
    const section=node('section',undefined,'case-knowledge');section.append(node('span',item.demo?'Демонстрационный сценарий':'Ранний прототип','kind'),node('h3',item.title),node('p',item.description));
    const hidden=spec.knowledge.cases?.find(x=>x.case_id===item.id);section.append(rawDetails('Полное публичное описание',item));
    section.append(rawDetails('Серверное описание для модели',hidden||spec.knowledge.sections.find(x=>x.section_id==='cases')));cases.append(section);
  }root.append(cases);
  const sections=node('section',undefined,'knowledge-section');sections.append(node('h2','Разделы сайта'));
  for(const section of spec.knowledge.sections){const details=node('details');details.append(node('summary',section.section_id),node('p',section.detail),node('p',section.additional_context||'Дополнительные подтверждённые сведения пока не заполнены.','source-note'),node('p','Источник: '+section.source_fields.join(', '),'source-note'));sections.append(details);}root.append(sections);
  root.append(rawDetails('Все публичные данные, передаваемые модели',spec.site),rawDetails('Все расширенные знания, передаваемые модели',spec.knowledge));
}
function renderPrompts(){
  const root=$('#prompt-content');root.replaceChildren();const models=node('dl',undefined,'model-settings');
  for(const [label,value]of [['Текстовая модель',spec.models.text],['Голосовая модель',spec.models.realtime],['Голос',spec.models.voice],['Распознавание',spec.models.transcription],['Предел голосового ответа',spec.models.voice_tokens],['Версия инструкций',spec.prompts.version]]){const field=node('div');field.append(node('dt',label),node('dd',String(value)));models.append(field);}root.append(models);
  root.append(node('p','Обычный разговор и аудиозапись не сохраняются в базе сайта. После ручного согласия и отправки сохраняются бриф и текст интервью. Черновик до отправки остаётся во вкладке. Ответ агента не обрывается новой речью; следующий вопрос ждёт завершения воспроизведения.','storage-note'));
  for(const [label,value]of [['Основной системный промпт',spec.prompts.general],['Промпт интервью',spec.prompts.interview],['Формат текстового ответа',spec.prompts.text_output]]){const block=node('section',undefined,'prompt-block');block.append(node('h2',label),node('pre',value));root.append(block);}
  root.append(rawDetails('Порядок и вопросы интервью',spec.prompts.questions),rawDetails('Инструменты управления сайтом',spec.tools),rawDetails('Настройки определения речи',spec.models.turn_detection));
  root.append(rawDetails('Полный системный промпт: знакомство',spec.assembled.general),rawDetails('Полный системный промпт: текстовый режим',spec.assembled.text),rawDetails('Полный системный промпт: текстовое интервью',spec.assembled.interview),rawDetails('Инструкции голосового интервью',spec.assembled.voice_interview));
  root.append(node('p',spec.assembled.context_note+' API-ключ и пароль панели здесь не отображаются.','source-note'));
}
enter().catch(e=>{if(e.message!=='Войдите в панель.')$('#login-error').textContent=e.message;});
