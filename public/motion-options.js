import {createNetwork,paintNetwork} from '/network-orb.js';

const variants=[
  {id:'a',number:'A / 01',name:'Тихий штрих',description:'Одна живая карандашная линия. Кнопки мягко проступают из воздуха.',
    stem:'M218 299 C265 287 284 268 284 238 C284 203 288 174 294 158',head:'M283 145 L294 158 L283 174',ghost:'M218 301 C267 288 286 266 286 238 C286 202 290 174 295 158'},
  {id:'b',number:'B / 02',name:'Быстрый набросок',description:'Два коротких пробных штриха и уверенная линия. Кнопки раскрываются из центра.',
    stem:'M213 303 C263 290 286 268 285 240 C283 208 290 177 294 158',head:'M283 145 L294 158 L283 174',ghost:'M208 307 C260 289 281 268 281 241 C280 207 285 180 291 160'},
  {id:'c',number:'C / 03',name:'Линия с нажимом',description:'Толщина штриха меняется как от руки. Кнопки собираются из мелких точек.',
    stem:'M220 304 C267 289 287 267 286 237 C285 205 290 175 294 158',head:'M283 145 L294 158 L283 175',ghost:'M220 306 C270 289 289 263 288 237 C287 204 291 174 295 158'}
];
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const container=document.querySelector('#options');
container.innerHTML=variants.map(v=>`<article class="option variant-${v.id}" data-variant="${v.id}">
  <div class="scene" aria-label="Анимированный эскиз: ${v.name}">
    <canvas class="orb" width="320" height="320" aria-hidden="true"></canvas>
    <svg class="pencil" viewBox="0 0 340 420" fill="none" aria-hidden="true">
      <defs><filter id="grain-${v.id}" x="-12%" y="-12%" width="124%" height="124%"><feTurbulence type="fractalNoise" baseFrequency=".035 .065" numOctaves="2" seed="${v.id.charCodeAt(0)}" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5"/></filter><linearGradient id="shade-${v.id}" x1="0" y1="1" x2="1" y2="0" gradientUnits="objectBoundingBox"><stop stop-color="#a28d7c"/><stop offset=".35" stop-color="#6d5a4e"/><stop offset=".64" stop-color="#8b7564"/><stop offset="1" stop-color="#67564c"/></linearGradient></defs>
      <path class="ghost" pathLength="100" d="${v.ghost}"/>
      <path class="stem" pathLength="100" d="${v.stem}"/>
      <path class="head" pathLength="100" d="${v.head}"/>
    </svg>
    <span class="invite">Спросить моего ИИ-агента</span>
    <div class="mini-actions"><span class="demo-button"><span>Посмотреть проекты</span></span><span class="demo-link"><span>Ближе познакомиться</span></span></div>
  </div>
  <div class="card-copy"><div class="card-top"><span class="number">${v.number}</span><button class="replay" type="button" aria-label="Повторить вариант ${v.id.toUpperCase()}">Повторить ↺</button></div><h2>${v.name}</h2><p>${v.description}</p></div>
</article>`).join('');

const cards=[...document.querySelectorAll('.option')].map(element=>{
  const canvas=element.querySelector('canvas');
  return {element,ctx:canvas.getContext('2d'),network:createNetwork(126),visible:true};
});
const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){const card=cards.find(item=>item.element===entry.target);if(card)card.visible=entry.isIntersecting;}
},{rootMargin:'80px'});
cards.forEach(card=>observer.observe(card.element));
let last=0;
function frame(now){
  if(!document.hidden&&now-last>(reduce.matches?1000:42)){
    for(const card of cards)if(card.visible)paintNetwork(card.ctx,320,card.network,{time:1.8+now/1200,reduced:reduce.matches});
    last=now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function replay(card){
  card.element.classList.remove('playing');
  void card.element.offsetWidth;
  card.element.classList.add('playing');
}
cards.forEach(card=>{replay(card);card.element.querySelector('.replay').addEventListener('click',()=>replay(card));});
document.querySelector('.replay-all').addEventListener('click',()=>cards.forEach(replay));
