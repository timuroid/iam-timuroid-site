import {initOrbs,refreshOrbs,activateOrb} from '/orb.js';
import {initDictation} from '/dictation.js';
const site = window.__SITE;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = { section: 'home', caseId: null, page: location.pathname };
let agentModule;
let toastTimer;

const arrow = '<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const chevron = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function visual(c) {
  if (c.visual === 'content') return `<div class="content-workflow"><div class="content-brief"><span class="window-label">Бриф и стиль</span><strong>Запуск новой<br>коллекции</strong><p>3 сторис для магазина</p><div class="brief-line"></div><div class="brief-line short"></div><div class="brief-chips"><span></span><span></span><span></span></div></div><div class="content-result"><div class="story-progress"><i></i><i></i><i></i></div><span>Новая коллекция</span><strong>Уже<br>в магазине.</strong><div class="story-link">Посмотреть</div></div></div>`;
  if (c.visual === 'knowledge') return `<div class="mini-window"><div class="mini-window-top">Документы команды<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="5" stroke="currentColor" stroke-width="1.6"/><path d="m14 14 5 5" stroke="currentColor" stroke-width="1.6"/></svg></div><div class="mini-query">Как оформить отпуск?</div><div class="mini-answer">Подайте заявку за 14 дней<br>до начала отпуска.</div><div class="mini-source">Правила команды · пункт 3</div></div>`;
  return `<div class="document-window"><div class="doc-heading">Сравнение условий</div><div class="doc-columns"><span></span><span>Договор А</span><span>Договор Б</span></div><div class="doc-row"><span>Срок</span><strong>30 дней</strong><strong>45 дней</strong></div><div class="doc-row"><span>Оплата</span><strong>50 / 50</strong><strong>100%</strong></div><div class="doc-highlight">Различия — на виду</div></div>`;
}
function renderCases(filter = 'all') {
  $('#case-grid').innerHTML = site.cases.filter(c => filter === 'all' || c.category === filter).map(c => `<a class="case-card ${c.id==='content-workspace'?'featured':''}" href="/cases/${escape(c.id)}" aria-label="Открыть кейс: ${escape(c.shortTitle)}"><div class="case-visual visual-${c.visual}">${visual(c)}</div><div class="case-copy"><span class="case-kind">${c.demo?'Демо-сценарий':'Прототип'}</span><h3>${escape(c.title)}</h3><p>${escape(c.description)}</p><div class="case-card-foot"><span>Открыть проект</span>${arrow}</div></div></a>`).join('');
}
renderCases();
$('#service-grid').innerHTML = site.services.map(s => `<div class="service-card"><span class="service-number">${s.number}</span><h3>${escape(s.title)}</h3><p>${escape(s.text)}</p></div>`).join('');
$('#about-description').textContent = site.profile.about;
$('#career-list').innerHTML = site.career.map(c=>`<article class="career-card ${c.current?'current':''}"><div class="career-brand">${c.logo?`<img src="${escape(c.logo)}" alt="${escape(c.company)}" loading="lazy">`:`<span>${escape(c.company)}</span>`}<span class="career-period">${escape(c.period)}</span></div><div class="career-content"><h3>${escape(c.role)}</h3><p>${escape(c.description)}</p></div></article>`).join('');
$('#research-grid').innerHTML = site.research.map(r=>`<article class="research-card"><p class="research-meta">${escape(r.meta)}</p><h3>${escape(r.title)}</h3><p>${escape(r.description)}</p></article>`).join('');
$('#education-list').innerHTML = site.education.map(e=>`<div><h3>${escape(e.title)}</h3><p>${escape(e.description)}</p></div>`).join('');
$('#practice-grid').innerHTML = site.practice.map(p=>`<article class="practice-card"><h3>${escape(p.title)}</h3><p>${escape(p.description)}</p></article>`).join('');
initDictation();
$('#experience-list').innerHTML = site.experience.map((e,i) => `<div class="experience-card" id="${escape(e.id)}"><button class="experience-toggle" aria-expanded="${i===0}" aria-controls="experience-${e.id}"><span class="experience-main"><strong>${escape(e.title)}</strong><small>${escape(e.role)}</small></span><span class="experience-chevron">${chevron}</span></button><div class="experience-description" id="experience-${e.id}" ${i===0?'':'hidden'}>${escape(e.description)}</div></div>`).join('');
$('#tool-grid').innerHTML = site.tools.map(t=>`<div class="tool-item"><h3>${escape(t.name)}</h3><p>${escape(t.description)}</p></div>`).join('');
if(site.profile.telegram) $('#direct-contacts').innerHTML += `<a class="direct-contact" href="https://t.me/${encodeURIComponent(site.profile.telegram.replace('@',''))}" target="_blank" rel="noopener">Написать в Telegram</a>`;
if(site.profile.email) $('#direct-contacts').innerHTML += `<a class="direct-contact" href="mailto:${escape(site.profile.email)}">Написать на почту</a>`;

function casePage(c) {
  const sections = [['task','Задача',c.task],['contribution','Мой вклад',c.contribution],['solution','Как устроено решение',c.solution],['result','Результат',c.result],['limitations','Что важно учитывать',c.limitations]];
  $('#case-view').innerHTML = `<a class="case-back" href="/#cases">${arrow}Все проекты</a><div class="case-detail-heading"><span class="case-kind">${c.demo?'Демо-сценарий':'Прототип'}</span><h1>${escape(c.title)}</h1><p>${escape(c.description)}</p></div><div class="case-visual visual-${c.visual}">${visual(c)}</div><div class="detail-metric"><strong>${escape(c.metric)}</strong><p>${escape(c.metricLabel)}</p></div><div class="detail-body"><aside aria-label="Разделы кейса">${sections.map(([id,title])=>`<a href="#${id}">${title}</a>`).join('')}</aside><div>${sections.map(([id,title,content])=>`<section class="detail-section" id="${id}"><h2>${title}</h2><p>${escape(content)}</p></section>`).join('')}</div></div><div class="case-cta"><h2>Есть похожая задача?<br><span class="serif-word">Давайте обсудим.</span></h2><a class="button primary" href="/#contact">Написать Тимуру</a></div>`;
}
function renderRoute({scroll=true}={}) {
  state.page = location.pathname;
  state.caseId = null;
  const match = location.pathname.match(/^\/cases\/([^/]+)\/?$/);
  const c = match && site.cases.find(x=>x.id===match[1]);
  $('#home-view').hidden = Boolean(c || location.pathname === '/privacy');
  $('#case-view').hidden = !c;
  document.body.classList.toggle('reading-case',Boolean(c));
  $('#privacy-view').hidden = location.pathname !== '/privacy';
  if(c){casePage(c);state.caseId=c.id;state.section='cases';document.title=`${c.shortTitle} — TIMUROID`;document.body.classList.remove('hero-visible');}
  else if(location.pathname==='/privacy'){document.title='О данных — TIMUROID';document.body.classList.remove('hero-visible');}
  else document.title='TIMUROID — Тимур · Практический ИИ';
  $('.mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false');
  if(scroll){if(location.hash) requestAnimationFrame(()=>$(location.hash)?.scrollIntoView({behavior:reduced.matches?'instant':'smooth'}));else window.scrollTo({top:0,behavior:'instant'});}
  window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()}));
  refreshOrbs();
}
function navigate(path) {
  history.replaceState({...history.state,scrollY:window.scrollY},'',location.href);
  history.pushState({},'',path);
  renderRoute();
}
window.addEventListener('popstate',()=>{renderRoute({scroll:false});requestAnimationFrame(()=>window.scrollTo({top:history.state?.scrollY??0,behavior:'instant'}));});
document.addEventListener('click', async e => {
  const open=e.target.closest('[data-open-agent]');
  if(open){await openAgent();return;}
  const prompt=e.target.closest('[data-agent-prompt]');
  if(prompt){await openAgent();agentModule.sendMessage(prompt.dataset.agentPrompt);return;}
  const toggle=e.target.closest('.experience-toggle');
  if(toggle){const expanded=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!expanded));document.getElementById(toggle.getAttribute('aria-controls')).hidden=expanded;return;}
  const filter=e.target.closest('[data-filter]');
  if(filter){$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b===filter);b.setAttribute('aria-pressed',String(b===filter));});renderCases(filter.dataset.filter);return;}
  const link=e.target.closest('a[href]');
  if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||link.target==='_blank')return;
  const url=new URL(link.href,location.origin);
  if(url.origin!==location.origin||!['/','/privacy'].includes(url.pathname)&&!url.pathname.startsWith('/cases/'))return;
  if(url.pathname===location.pathname&&url.hash){e.preventDefault();$('.mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false');history.replaceState({...history.state,scrollY:window.scrollY},'',location.href);history.pushState({},'',url.pathname+url.hash);requestAnimationFrame(()=>document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView({behavior:reduced.matches?'instant':'smooth'}));return;}
  e.preventDefault();navigate(url.pathname+url.hash);
});
$('.menu-toggle').addEventListener('click',()=>{const open=$('.menu-toggle').getAttribute('aria-expanded')==='true';$('.menu-toggle').setAttribute('aria-expanded',String(!open));$('.mobile-nav').hidden=open;});
renderRoute({scroll:Boolean(location.hash)});
initOrbs();

const observer = new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}});},{threshold:.07});
$$('.section-heading,.service-card,.tool-item,.about-intro,.contact-intro,.career-card,.research-card,.practice-card').forEach(e=>{e.classList.add('reveal');observer.observe(e);});
const heroObserver=new IntersectionObserver(([e])=>document.body.classList.toggle('hero-visible',e.isIntersecting&&!$('#home-view').hidden),{threshold:.25});heroObserver.observe($('#home'));
const sectionObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting&&!$('#home-view').hidden){state.section=e.target.id;window.dispatchEvent(new CustomEvent('site-context',{detail:getContext()}));}}},{rootMargin:'-20% 0px -55% 0px'});$$('#home-view>section').forEach(s=>sectionObserver.observe(s));
export function getContext(){return{current_page:state.page,visible_section:state.section,active_case:state.caseId,device:innerWidth<650?'mobile':'desktop'};}
async function openAgent(){activateOrb();window.dispatchEvent(new CustomEvent('microphone-owner',{detail:'agent'}));if(!agentModule)agentModule=await import('/agent.js');agentModule.open();}
export function showToast(text){clearTimeout(toastTimer);$('#tour-toast').textContent=text;$('#tour-toast').hidden=false;toastTimer=setTimeout(()=>$('#tour-toast').hidden=true,6500);}
export function executeSiteAction(action,target='',summary='') {
  const sections=['home','cases','services','experience','tools','contact','path','research','practice'];
  if(action==='none')return{ok:true};
  if(action==='show_case'){
    if(!site.cases.some(c=>c.id===target))throw new Error('Неизвестный кейс');
    agentModule?.minimize();navigate(`/cases/${target}`);return{ok:true,page:`/cases/${target}`};
  }
  if(action==='show_experience'){
    if(!site.experience.some(e=>e.id===target))throw new Error('Неизвестная карточка опыта');
    agentModule?.minimize();if(location.pathname!=='/')navigate('/');
    const card=document.getElementById(target);const toggle=$('.experience-toggle',card);toggle.setAttribute('aria-expanded','true');document.getElementById(toggle.getAttribute('aria-controls')).hidden=false;
    card.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'center'});highlight(card);return{ok:true,experience:target};
  }
  if(action==='open_contact'||action==='prepare_contact_request')target='contact';
  if(!sections.includes(target))throw new Error('Неизвестный раздел');
  agentModule?.minimize();if(location.pathname!=='/')navigate('/');
  if(action==='prepare_contact_request'){
    if(typeof summary!=='string'||!summary.trim()||summary.length>4000)throw new Error('Нужно описание задачи');
    $('#contact-form textarea').value=summary;$('#contact-form').dispatchEvent(new Event('input',{bubbles:true}));
  }
  const section=document.getElementById(target);section.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});highlight(section);return{ok:true,section:target,draftPrepared:action==='prepare_contact_request'};
}
function highlight(el){el.classList.remove('tour-highlight');requestAnimationFrame(()=>el.classList.add('tour-highlight'));setTimeout(()=>el.classList.remove('tour-highlight'),2200);}

const form=$('#contact-form');let requestId=crypto.randomUUID();let submitted=false;
form.addEventListener('input',()=>{if(submitted){submitted=false;form.dataset.submitted='false';requestId=crypto.randomUUID();const button=$('button[type=submit]',form);button.disabled=form.dataset.dictating==='true'||form.dataset.pending==='true';button.textContent='Отправить Тимуру';$('.form-status',form).textContent='';}});
form.addEventListener('submit',async e=>{
  e.preventDefault();if(form.dataset.pending==='true'||form.dataset.dictating==='true'||!form.reportValidity())return;
  const button=$('button[type=submit]',form),status=$('.form-status',form);const oldText=button.innerHTML;
  form.dataset.pending='true';form.dispatchEvent(new Event('contact-state'));button.disabled=true;button.textContent='Сохраняю запрос…';status.textContent='';status.className='form-status';
  try{
    const values=Object.fromEntries(new FormData(form));
    const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,consent:values.consent==='on',requestId,source:state.caseId||'website'})});
    const result=await r.json();if(!r.ok)throw new Error(result.error||'Не удалось сохранить запрос.');
    const current=Object.fromEntries(new FormData(form));
    const changed=['name','contact','message','consent'].some(key=>current[key]!==values[key]);
    submitted=!changed;form.dataset.submitted=String(submitted);status.classList.add('success');
    if(changed){requestId=crypto.randomUUID();status.textContent='Запрос сохранён. Изменения в форме ещё не отправлены.';button.textContent='Отправить Тимуру';}
    else{status.textContent='Запрос сохранён. Тимур сможет ответить по указанному контакту.';button.textContent='Запрос сохранён ✓';}
  }
  catch(error){status.textContent=error.message+' Ваш текст остался в форме — можно попробовать ещё раз.';status.classList.add('error');button.disabled=false;button.innerHTML=oldText;}
  finally{form.dataset.pending='false';form.dispatchEvent(new Event('contact-state'));}
});

if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'navigate_timuroid',title:'Показать информацию о Тимуре',description:'Открыть раздел, кейс или карточку опыта на сайте Тимура. Не отправляет сообщения.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['show_section','show_case','show_experience','open_contact']},target:{type:'string'}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||!['show_section','show_case','show_experience','open_contact'].includes(input.action))throw new Error('Недопустимое действие');return executeSiteAction(input.action,input.target||'');}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
