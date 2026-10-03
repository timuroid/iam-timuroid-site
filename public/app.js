import {initOrbs,refreshOrbs,activateOrb} from '/orb.js';
import {requestHaptic} from '/haptics.js';
const site = window.__SITE;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = { section: 'home', caseId: null, page: location.pathname };
let agentModule;
let toastTimer;
let caseAnimation;
let contactFlow=false;
const interviewMessages=[];
export function recordInterviewMessage(role,content){if(contactFlow){interviewMessages.push({role,content:String(content).slice(0,3000)});if(interviewMessages.length>40)interviewMessages.shift();}}

const arrow = '<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const chevron = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function visual(c) {
  if (c.visual === 'content') return `<div class="content-workflow"><div class="content-brief"><span class="window-label">Бриф и стиль</span><strong>Запуск новой<br>коллекции</strong><p>3 сторис для магазина</p><div class="brief-line"></div><div class="brief-line short"></div><div class="brief-chips"><span></span><span></span><span></span></div></div><div class="content-result"><div class="story-progress"><i></i><i></i><i></i></div><span>Новая коллекция</span><strong>Уже<br>в магазине.</strong><div class="story-link">Посмотреть</div></div></div>`;
  if (c.visual === 'knowledge') return `<div class="mini-window"><div class="mini-window-top">Документы команды<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="5" stroke="currentColor" stroke-width="1.6"/><path d="m14 14 5 5" stroke="currentColor" stroke-width="1.6"/></svg></div><div class="mini-query">Как оформить отпуск?</div><div class="mini-answer">Подайте заявку за 14 дней<br>до начала отпуска.</div><div class="mini-source">Правила команды · пункт 3</div></div>`;
  return `<div class="document-window"><div class="doc-heading">Сравнение условий</div><div class="doc-columns"><span></span><span>Договор А</span><span>Договор Б</span></div><div class="doc-row"><span>Срок</span><strong>30 дней</strong><strong>45 дней</strong></div><div class="doc-row"><span>Оплата</span><strong>50 / 50</strong><strong>100%</strong></div><div class="doc-highlight">Различия — на виду</div></div>`;
}
function renderCases(filter = 'all',animate=false) {
  const grid=$('#case-grid');caseAnimation?.cancel();
  grid.innerHTML = site.cases.filter(c => filter === 'all' || c.category === filter).map(c => `<a class="case-card ${c.id==='content-workspace'?'featured':''}" href="/cases/${escape(c.id)}" aria-label="Открыть кейс: ${escape(c.shortTitle)}"><div class="case-visual visual-${c.visual}">${visual(c)}</div><div class="case-copy"><span class="case-kind">${c.demo?'Демо-сценарий':'Прототип'}</span><h3>${escape(c.title)}</h3><p>${escape(c.description)}</p><div class="case-card-foot"><span>Открыть проект</span>${arrow}</div></div></a>`).join('');
  if(animate&&!reduced.matches)caseAnimation=grid.animate?.([{opacity:.3},{opacity:1}],{duration:240,easing:'ease-out'});
}
renderCases();
$('#service-grid').innerHTML = site.services.map((s,i) => `<div class="service-card" data-process-stage="${i+1}"><span class="service-number">${s.number}</span><h3>${escape(s.title)}</h3><p>${escape(s.text)}</p></div>`).join('');
$('#about-description').textContent = site.profile.about;
function roleCard(e){
  const isSteel=e.id==='digital-steel',isTeaching=e.id==='bmstu-teaching';
  if(!isSteel&&!isTeaching)return `<article class="experience-card research-role" id="${escape(e.id)}"><div><h3>${escape(e.title)}</h3><span class="role-place">${escape(e.place)}</span></div><p>${escape(e.description)}</p></article>`;
  const media=isSteel?'':`<div class="teaching-media"><video controls playsinline preload="none" poster="${escape(e.poster)}" aria-label="Фрагмент практикума «LLM на практике» в МГТУ имени Баумана"><source src="${escape(e.video)}" type="video/mp4">Ваш браузер не поддерживает видео. <a href="${escape(e.video)}">Открыть видео</a></video></div><div class="teaching-caption"><span>«LLM на практике»</span><span>Фрагмент занятия</span></div>`;
  return `<article class="experience-card primary-role" id="${escape(e.id)}"><div class="role-brand"><img class="${isSteel?'digital-logo':''}" src="${isSteel?'/logo-digital-steel-light.svg':'/logo-bmstu.png'}" alt="${escape(e.place)}" loading="lazy" width="240" height="61"></div><h3>${escape(e.title)}</h3><p>${escape(e.description)}</p>${media}</article>`;
}
$('#experience-list').innerHTML = [...site.experience].sort((a,b)=>['digital-steel','bmstu-teaching','bmstu-research'].indexOf(a.id)-['digital-steel','bmstu-teaching','bmstu-research'].indexOf(b.id)).map(roleCard).join('');
$('#career-list').innerHTML = [...site.career].reverse().map(c=>`<article class="career-card ${c.current?'current':''}" id="career-${escape(c.id)}"><span class="career-period">${escape(c.period)}</span><div class="career-content"><div class="career-brand"><span>${escape(c.company)}</span></div><h3>${escape(c.role)}</h3><p>${escape(c.description)}</p></div></article>`).join('');
$('#research-grid').innerHTML = site.research.map((r,i)=>r.url?`<div class="research-reference"><a href="${escape(r.url)}" target="_blank" rel="noopener"><span class="reference-number">[${i+1}]</span><span>${escape(r.originalTitle||r.title)}</span></a><p>${escape(r.meta)}</p></div>`:`<details class="research-reference"><summary><span class="reference-number">[${i+1}]</span><span>${escape(r.originalTitle||r.title)}</span></summary><p>${escape(r.meta)}. ${escape(r.description)}</p></details>`).join('');
$('#education-list').innerHTML = site.education.map(e=>`<div><h3>${escape(e.title)}</h3><p>${escape(e.description)}</p>${e.practice?`<p class="education-practice">${escape(e.practice)}</p>`:''}</div>`).join('');
$('#practice-grid').innerHTML = site.practice.map(p=>`<article class="practice-card"><h3>${escape(p.title)}</h3><p>${escape(p.description)}</p></article>`).join('');
const process=$('#service-grid');
function processProgress(e){const stage=e.target.closest('[data-process-stage]');if(stage)process.style.setProperty('--process-progress',String((Number(stage.dataset.processStage)-1)/2));}
process.addEventListener('pointerover',processProgress,{passive:true});process.addEventListener('focusin',processProgress);
process.addEventListener('pointerleave',()=>process.style.setProperty('--process-progress','0'),{passive:true});
$('#tool-grid').innerHTML = site.tools.map(t=>`<div class="tool-item"><h3>${escape(t.name)}</h3><p>${escape(t.description)}</p></div>`).join('');
if(site.profile.telegram) $('#direct-contacts').innerHTML += `<a class="direct-contact" href="https://t.me/${encodeURIComponent(site.profile.telegram.replace('@',''))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="m21 3-3.6 17.1c-.3 1.2-1 1.5-2 1L10 17l-2.6 2.5c-.3.3-.6.6-1 .6l.4-5.7L17.2 5c.5-.4-.1-.6-.7-.2L3.6 12.9l-5-1.6c-1.1-.3-1.1-1.1.2-1.6L20 2.1c1-.4 1.7.2 1  .9Z" transform="translate(1 0) scale(.95)"/></svg><span>Написать в Telegram</span></a>`;
if(site.profile.email) $('#direct-contacts').innerHTML += `<a class="direct-contact" href="mailto:${escape(site.profile.email)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span>Написать на почту</span></a>`;

function casePage(c) {
  const sections = [['task','Задача',c.task],['contribution','Мой вклад',c.contribution],['solution','Как устроено решение',c.solution],['result','Результат',c.result],['limitations','Что важно учитывать',c.limitations]];
  $('#case-view').innerHTML = `<a class="case-back" href="/#cases">${arrow}Все проекты</a><div class="case-detail-heading"><span class="case-kind">${c.demo?'Демо-сценарий':'Прототип'}</span><h1>${escape(c.title)}</h1><p>${escape(c.description)}</p></div><div class="case-visual visual-${c.visual}">${visual(c)}</div><div class="detail-metric"><strong>${escape(c.metric)}</strong><p>${escape(c.metricLabel)}</p></div><div class="detail-body"><aside aria-label="Разделы кейса">${sections.map(([id,title])=>`<a href="#${id}">${title}</a>`).join('')}</aside><div>${sections.map(([id,title,content])=>`<section class="detail-section" id="${id}"><h2>${title}</h2><p>${escape(content)}</p></section>`).join('')}</div></div><div class="case-cta"><h2>Есть похожая задача?<br><span class="serif-word">Давайте обсудим.</span></h2><a class="button primary" href="/#contact">Написать Тимуру</a></div>`;
}
function focusDestination(section){
  const target=section?.querySelector('h1,h2,h3');
  if(!target)return;
  if(!target.matches('input'))target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
}
function renderRoute({scroll=true,focus=false}={}) {
  state.page = location.pathname;
  state.caseId = null;
  const match = location.pathname.match(/^\/cases\/([^/]+)\/?$/);
  const c = match && site.cases.find(x=>x.id===match[1]);
  if(c||location.pathname==='/privacy')agentModule?.collapse({restoreOnHero:true});
  $('#home-view').hidden = Boolean(c || location.pathname === '/privacy');
  $('#case-view').hidden = !c;
  document.body.classList.toggle('reading-case',Boolean(c));
  $('#privacy-view').hidden = location.pathname !== '/privacy';
  if(c){casePage(c);state.caseId=c.id;state.section='cases';document.title=`${c.shortTitle} — TIMUROID`;document.body.classList.remove('hero-visible');}
  else if(location.pathname==='/privacy'){document.title='О данных — TIMUROID';document.body.classList.remove('hero-visible');}
  else document.title='TIMUROID — Тимур Кирибаев';
  $('.mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false');
  if(scroll){
    if(location.hash)requestAnimationFrame(()=>{const section=document.getElementById(decodeURIComponent(location.hash.slice(1)));section?.scrollIntoView({behavior:reduced.matches?'instant':'smooth'});if(focus)focusDestination(section);});
    else{window.scrollTo({top:0,behavior:'instant'});if(focus)requestAnimationFrame(()=>focusDestination(c?$('#case-view'):location.pathname==='/privacy'?$('#privacy-view'):$('#home')));}
  }
  window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()}));
  refreshOrbs();
}
function navigate(path,{focus=false,scroll=true}={}) {
  history.replaceState({...history.state,scrollY:window.scrollY},'',location.href);
  history.pushState({},'',path);
  renderRoute({focus,scroll});
}
window.addEventListener('popstate',()=>{renderRoute({scroll:false});requestAnimationFrame(()=>window.scrollTo({top:history.state?.scrollY??0,behavior:'instant'}));});
document.addEventListener('click', async e => {
  const open=e.target.closest('[data-open-agent]');
  if(open){requestHaptic(e);await openAgent({mode:open.dataset.agentMode||'voice',local:!open.closest('.hero-art')});return;}
  const prompt=e.target.closest('[data-agent-prompt]');
  if(prompt){requestHaptic(e);await openAgent({mode:'text',local:!prompt.closest('.hero-art')});agentModule.sendMessage(prompt.dataset.agentPrompt);return;}
  const filter=e.target.closest('[data-filter]');
  if(filter){requestHaptic(e,10);if(filter.classList.contains('active'))return;$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b===filter);b.setAttribute('aria-pressed',String(b===filter));});renderCases(filter.dataset.filter,true);return;}
  const link=e.target.closest('a[href]');
  if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||link.target==='_blank')return;
  const url=new URL(link.href,location.origin);
  if(url.origin!==location.origin||!['/','/privacy'].includes(url.pathname)&&!url.pathname.startsWith('/cases/'))return;
  const fromAgent=agentModule?.isOpen()||false;
  if(url.pathname===location.pathname&&url.hash){e.preventDefault();if(fromAgent)agentModule?.collapse({restoreOnHero:true});$('.mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false');history.replaceState({...history.state,scrollY:window.scrollY},'',location.href);history.pushState({},'',url.pathname+url.hash);requestAnimationFrame(()=>{const section=document.getElementById(decodeURIComponent(url.hash.slice(1)));section?.scrollIntoView({behavior:reduced.matches?'instant':'smooth'});if(fromAgent)focusDestination(section);});return;}
  e.preventDefault();if(fromAgent)agentModule?.collapse({restoreOnHero:true});navigate(url.pathname+url.hash,{focus:fromAgent});
});
$('.menu-toggle').addEventListener('click',e=>{requestHaptic(e,10);const open=$('.menu-toggle').getAttribute('aria-expanded')==='true';$('.menu-toggle').setAttribute('aria-expanded',String(!open));$('.mobile-nav').hidden=open;});
renderRoute({scroll:Boolean(location.hash)});
initOrbs();

const heroObserver=new IntersectionObserver(([e])=>document.body.classList.toggle('hero-visible',e.isIntersecting&&!$('#home-view').hidden),{threshold:.25});heroObserver.observe($('#home'));
const sectionObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting&&!$('#home-view').hidden){state.section=e.target.id;window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()}));}}},{rootMargin:'-20% 0px -55% 0px'});$$('#home-view>section').forEach(s=>sectionObserver.observe(s));
function contactContext(){
  const fields={name:$('#contact-form [name=name]').value.trim(),contact:$('#contact-form [name=contact]').value.trim(),message:$('#contact-form [name=message]').value.trim(),...Object.fromEntries(['process','goal','constraints'].map(key=>[key,$(`#contact-form [name=${key}]`).value.trim()]))};
  return {contact_request:contactFlow,contact_missing:Object.keys(fields).filter(key=>!fields[key]),...(contactFlow?{contact_draft:fields}:{})};
}
export function getContext(){return{current_page:state.page,visible_section:state.section,active_case:state.caseId,device:innerWidth<=650?'mobile':'desktop',...contactContext()};}
async function openAgent(options={}){activateOrb();if(!agentModule)agentModule=await import('/agent.js');agentModule.open(options);}
export function showToast(text){clearTimeout(toastTimer);$('#tour-toast').textContent=text;$('#tour-toast').hidden=false;toastTimer=setTimeout(()=>$('#tour-toast').hidden=true,6500);}
export function executeSiteAction(action,target='',summary='',draft={}) {
  const sections=['home','cases','services','experience','tools','contact','path','research','practice'];
  if(action==='none')return{ok:true};
  if(action==='cancel_contact_request'){contactFlow=false;window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()}));return{ok:true,contact_request:false};}
  if(action==='clear_contact_request'){
    const field=target||'all';
    if(!['all','name','contact','message'].includes(field))throw new Error('Неизвестное поле формы');
    const fields=field==='all'?['name','contact','message','process','goal','constraints']:[field];
    interviewMessages.length=0;
    for(const key of fields)$(`#contact-form [name=${key}]`).value='';
    $('#contact-form [name=consent]').checked=false;contactFlow=false;
    // Reuse the form's edit lifecycle; clearing a draft never submits a request.
    $('#contact-form').dispatchEvent(new Event('input',{bubbles:true}));
    $('#contact-form').dispatchEvent(new Event('contact-clear'));
    window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()}));
    return{ok:true,draftCleared:field,contact_request:false,scope:'draft'};
  }
  if(!['show_section','show_case','show_experience','show_career','begin_contact_request','open_contact','prepare_contact_request'].includes(action))throw new Error('Неизвестное действие');
  if(action==='show_case'){
    const c=site.cases.find(c=>c.id===target);if(!c)throw new Error('Неизвестный кейс');
    agentModule?.collapse({restoreOnHero:true});navigate(`/cases/${target}`,{focus:true});return{ok:true,page:`/cases/${target}`,display:'page'};
  }
  if(action==='show_experience'||action==='show_career'){
    const collection=action==='show_career'?site.career:site.experience;
    if(!collection.some(item=>item.id===target))throw new Error('Неизвестная карточка опыта');
    agentModule?.collapse({restoreOnHero:true});if(location.pathname!=='/')navigate('/',{scroll:false});
    const card=document.getElementById(action==='show_career'?`career-${target}`:target);
    card.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});focusDestination(card);
    return{ok:true,[action==='show_career'?'career':'experience']:target,display:'page'};
  }
  if(['open_contact','prepare_contact_request','begin_contact_request'].includes(action))target='contact';
  if(!sections.includes(target))throw new Error('Неизвестный раздел');
  if(action==='begin_contact_request'){if(!contactFlow)interviewMessages.length=0;contactFlow=true;}
  if(action==='prepare_contact_request'){
    const fields={name:draft.name,contact:draft.contact,message:summary,process:draft.process,goal:draft.goal,constraints:draft.constraints};
    if(!Object.values(fields).some(value=>typeof value==='string'&&value.trim()))throw new Error('Нет данных для формы');
    for(const [key,value] of Object.entries(fields)){
      if(typeof value!=='string'||!value.trim())continue;
      if(value.length>({name:100,contact:180,message:4000,process:2000,goal:2000,constraints:2000})[key])throw new Error('Слишком длинное поле');
    }
    for(const [key,value] of Object.entries(fields))if(typeof value==='string'&&value.trim())$(`#contact-form [name=${key}]`).value=value.trim();
    contactFlow=true;$('#contact-form').dispatchEvent(new Event('input',{bubbles:true}));
  }
  // Updating an already visible draft does not scroll or animate the page again.
  if(!(action==='prepare_contact_request'&&state.section==='contact'&&location.pathname==='/')){
    agentModule?.collapse({restoreOnHero:true});if(location.pathname!=='/')navigate('/',{scroll:false});
    const section=document.getElementById(target);section.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});focusDestination(section);
  }
  state.section=target;window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()}));
  return{ok:true,section:target,display:'page',draftPrepared:action==='prepare_contact_request',...contactContext()};
}

const form=$('#contact-form');let requestId=crypto.randomUUID();let submitted=false;
form.addEventListener('input',()=>{if(submitted){submitted=false;form.dataset.submitted='false';requestId=crypto.randomUUID();const button=$('button[type=submit]',form);button.disabled=form.dataset.dictating==='true'||form.dataset.pending==='true';button.textContent='Отправить сообщение';$('.form-status',form).textContent='';}});
form.addEventListener('contact-clear',()=>{
  submitted=false;form.dataset.submitted='false';requestId=crypto.randomUUID();
  const button=$('button[type=submit]',form),status=$('.form-status',form);
  button.disabled=form.dataset.pending==='true';button.textContent='Отправить сообщение';
  status.textContent='';status.className='form-status';
});
form.addEventListener('change',()=>window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()})));
form.addEventListener('submit',async e=>{
  e.preventDefault();if(form.dataset.pending==='true'||form.dataset.dictating==='true'||!form.reportValidity())return;
  const button=$('button[type=submit]',form),status=$('.form-status',form);const oldText=button.innerHTML;
  form.dataset.pending='true';form.dispatchEvent(new Event('contact-state'));button.disabled=true;button.textContent='Отправляю…';status.textContent='';status.className='form-status';
  try{
    const values=Object.fromEntries(new FormData(form));
    const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,conversation:interviewMessages,consent:values.consent==='on',requestId,source:state.caseId||'website'})});
    const result=await r.json();if(!r.ok)throw new Error(result.error||'Не удалось сохранить запрос.');
    const current=Object.fromEntries(new FormData(form));
    const changed=['name','contact','message','process','goal','constraints','consent'].some(key=>current[key]!==values[key]);
    if(!changed)contactFlow=false;submitted=!changed;form.dataset.submitted=String(submitted);status.classList.add('success');
    if(changed){requestId=crypto.randomUUID();status.textContent='Сообщение сохранено. Изменения в форме ещё не отправлены.';button.textContent='Отправить сообщение';}
    else{status.textContent='Спасибо! Сообщение сохранено.';button.textContent='Сообщение отправлено';}
  }
  catch(error){status.textContent=error.message+' Ваш текст остался в форме — можно попробовать ещё раз.';status.classList.add('error');button.disabled=false;button.innerHTML=oldText;}
  finally{form.dataset.pending='false';form.dispatchEvent(new Event('contact-state'));}
});

if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'navigate_timuroid',title:'Показать информацию о Тимуре',description:'Открыть раздел, кейс или карточку опыта на сайте Тимура. Не отправляет сообщения.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['show_section','show_case','show_experience','show_career','open_contact']},target:{type:'string'}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||!['show_section','show_case','show_experience','show_career','open_contact'].includes(input.action))throw new Error('Недопустимое действие');return executeSiteAction(input.action,input.target||'');}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
