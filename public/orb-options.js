import {createNetwork,paintNetwork} from '/network-orb.js';

const SIZE=320;
const TAU=Math.PI*2;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const x=clamp(value);return x*x*(3-2*x);};

function blob(cx,cy,rx,ry,warp,time){
  const path=new Path2D();
  for(let i=0;i<=96;i++){
    const angle=i/96*TAU;
    const uneven=1+warp*(.58*Math.sin(angle*3+time*.8)+.3*Math.sin(angle*5-time*.6)+.12*Math.sin(angle*8+1.7));
    const x=cx+Math.cos(angle)*rx*uneven,y=cy+Math.sin(angle)*ry*uneven;
    if(i===0)path.moveTo(x,y);else path.lineTo(x,y);
  }
  path.closePath();
  return path;
}

function drawMasked(card,path,opacity=0){
  const ctx=card.ctx;
  ctx.save();ctx.clip(path);ctx.drawImage(card.surface,0,0);
  if(opacity>0){ctx.globalCompositeOperation='source-atop';ctx.fillStyle=`rgba(8,25,43,${opacity})`;ctx.fillRect(0,0,SIZE,SIZE);}
  ctx.restore();
}

function drawDroplets(card,progress,time){
  const ctx=card.ctx,growth=ease(progress),radius=9+150*growth;
  drawMasked(card,blob(144+16*growth,172-12*growth,radius,radius*(.84+.16*growth),.27*(1-growth),time),.4*(1-growth));
  const arrivals=[
    {x:81,y:121,r:8,start:.02,end:.72},
    {x:230,y:188,r:11,start:.13,end:.79},
    {x:111,y:238,r:6,start:.27,end:.87},
    {x:197,y:83,r:7,start:.39,end:.92}
  ];
  for(const drop of arrivals){
    const step=clamp((progress-drop.start)/(drop.end-drop.start));
    if(!step||step>=1)continue;
    const drift=ease(step),x=drop.x+(157-drop.x)*drift,y=drop.y+(160-drop.y)*drift;
    ctx.save();ctx.globalAlpha=Math.min(1,step*8)*(1-step*.75);
    ctx.fillStyle='#142b43';ctx.beginPath();ctx.ellipse(x,y,drop.r*(1-.35*step),drop.r*(.75+.2*Math.sin(time+drop.x)),step*.7,0,TAU);ctx.fill();ctx.restore();
  }
}

function drawInk(card,progress,time){
  const growth=ease(progress),radius=5+151*growth;
  const mask=blob(137+23*growth,148+12*growth,radius*(1.1-.1*growth),radius*(.78+.22*growth),.43*(1-growth),time);
  drawMasked(card,mask,.86*(1-ease((progress-.12)/.72)));
}

function drawMerge(card,progress,time){
  const approach=ease(progress/.74),mask=new Path2D();
  mask.addPath(blob(112+45*approach,144+16*approach,15+64*approach,18+60*approach,.19*(1-progress),time));
  mask.addPath(blob(214-54*approach,182-22*approach,24+61*approach,20+63*approach,.16*(1-progress),time+1.2));
  if(progress>.4){const join=ease((progress-.4)/.6);mask.addPath(blob(160,160,9+150*join,9+150*join,.12*(1-join),time));}
  drawMasked(card,mask,.6*(1-ease((progress-.2)/.75)));
}

const cards=[...document.querySelectorAll('.option')].map(element=>{
  const canvas=element.querySelector('canvas'),surface=document.createElement('canvas');
  surface.width=canvas.width=SIZE;surface.height=canvas.height=SIZE;
  return {element,ctx:canvas.getContext('2d'),surface,surfaceCtx:surface.getContext('2d'),network:createNetwork(126),mode:element.dataset.option,epoch:performance.now(),visible:true};
});

const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){const card=cards.find(item=>item.element===entry.target);if(card)card.visible=entry.isIntersecting;}
},{rootMargin:'100px'});
cards.forEach(card=>observer.observe(card.element));

function render(card,now){
  if(!card.visible)return;
  const elapsed=reduceMotion.matches?3200:(now-card.epoch)%4800;
  const progress=clamp((elapsed-180)/2500);
  const time=1.8+elapsed/1000;
  paintNetwork(card.surfaceCtx,SIZE,card.network,{time,reduced:reduceMotion.matches,reveal:1});
  card.ctx.clearRect(0,0,SIZE,SIZE);
  if(progress>=.995){card.ctx.drawImage(card.surface,0,0);return;}
  if(card.mode==='droplets')drawDroplets(card,progress,time);
  else if(card.mode==='ink')drawInk(card,progress,time);
  else drawMerge(card,progress,time);
}

let last=0;
function frame(now){
  if(!document.hidden&&now-last>=33){cards.forEach(card=>render(card,now));last=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.querySelector('.replay-all').addEventListener('click',()=>{const now=performance.now();cards.forEach(card=>card.epoch=now);});
cards.forEach(card=>card.element.querySelector('.replay').addEventListener('click',()=>{card.epoch=performance.now();}));
