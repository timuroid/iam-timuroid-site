import {createNetwork,paintNetwork} from '/network-orb.js';

const SIZE=320,TAU=Math.PI*2;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

function blob(cx,cy,rx,ry,warp,time){
  const path=new Path2D();
  for(let i=0;i<=96;i++){
    const a=i/96*TAU;
    const edge=1+warp*(.55*Math.sin(a*3+time*.7)+.28*Math.sin(a*5-time*.48)+.17*Math.sin(a*8+2));
    const x=cx+Math.cos(a)*rx*edge,y=cy+Math.sin(a)*ry*edge;
    if(i)path.lineTo(x,y);else path.moveTo(x,y);
  }
  path.closePath();return path;
}

function sphere(ctx,x,y,r,alpha=1,blur=0){
  if(r<.5||alpha<=0)return;
  ctx.save();ctx.globalAlpha=alpha;
  if(blur)ctx.filter=`blur(${blur}px)`;
  ctx.beginPath();ctx.ellipse(x,y,r,r*.9,-.2,0,TAU);
  const fill=ctx.createRadialGradient(x-r*.3,y-r*.39,r*.04,x+r*.12,y+r*.08,r*1.25);
  fill.addColorStop(0,'#6d899f');fill.addColorStop(.3,'#31516c');fill.addColorStop(.68,'#152d45');fill.addColorStop(1,'#071526');
  ctx.fillStyle=fill;ctx.fill();
  if(r>8){
    ctx.beginPath();ctx.ellipse(x-r*.28,y-r*.34,r*.26,r*.12,-.55,0,TAU);
    ctx.fillStyle='rgba(221,236,245,.20)';ctx.fill();
  }
  ctx.restore();
}

function core(card,progress,time,stretch=0){
  const ctx=card.ctx,growth=ease(progress),r=5+111*growth;
  const shape=blob(154+6*growth,163-3*growth,r*(1+stretch),r*(.88+.12*growth),.17*(1-growth)+.027,time);
  ctx.save();ctx.clip(shape);
  const light=ctx.createRadialGradient(119,104,8,165,169,153);
  light.addColorStop(0,'#52718a');light.addColorStop(.42,'#1a3550');light.addColorStop(1,'#071423');
  ctx.fillStyle=light;ctx.fillRect(0,0,SIZE,SIZE);
  ctx.globalAlpha=ease((progress-.08)/.62);
  ctx.drawImage(card.surface,0,0);
  ctx.restore();
}

function depth(card,p,time){
  const back=[{x:81,y:111,r:16,z:-.8,start:.03,end:.72},{x:209,y:75,r:11,z:-.5,start:.22,end:.9}];
  const front=[{x:255,y:193,r:19,z:.85,start:.12,end:.83},{x:101,y:248,r:10,z:.35,start:.31,end:.96}];
  const drawDrop=d=>{
    const step=clamp((p-d.start)/(d.end-d.start));
    if(!step||step>=1)return;
    const travel=ease(step),x=mix(d.x,160,travel)+Math.sin(time*1.3+d.x)*2*(1-travel);
    const y=mix(d.y,160,travel)+Math.cos(time+d.y)*2*(1-travel);
    sphere(card.ctx,x,y,d.r*(1+d.z*.25)*(1-.35*travel),Math.min(1,step*9)*(1-ease((step-.74)/.26)),d.z<0?1.2:0);
  };
  back.forEach(drawDrop);core(card,p,time);front.forEach(drawDrop);
}

function orbit(card,p,time){
  const drops=[{start:.02,end:.79,angle:-2.4,r:14},{start:.16,end:.89,angle:.35,r:18},{start:.32,end:.97,angle:2.3,r:11}];
  const positions=drops.map(d=>{
    const step=clamp((p-d.start)/(d.end-d.start)),angle=d.angle+step*2.35;
    const radius=90*(1-ease(step))+8*ease(step),z=Math.sin(angle+.65);
    return {step,z,x:160+Math.cos(angle)*radius,y:160+Math.sin(angle)*radius*.57-9*z,r:d.r*(1+.32*z)*(1-.27*step)};
  });
  const drawDrop=d=>{if(d.step>0&&d.step<1)sphere(card.ctx,d.x,d.y,d.r,Math.min(1,d.step*9)*(1-ease((d.step-.78)/.22)),d.z<-.25?1:0);};
  positions.filter(d=>d.z<0).forEach(drawDrop);
  core(card,p,time);
  positions.filter(d=>d.z>=0).forEach(drawDrop);
}

function attraction(card,p,time){
  const ctx=card.ctx,small=clamp((p-.13)/.66);
  if(small>0&&small<1){
    const t=ease(small);
    sphere(ctx,mix(84,160,t),mix(105,160,t),14*(1-.2*t),Math.min(1,small*8)*(1-ease((small-.75)/.25)),1);
  }
  const stretch=Math.sin(Math.PI*clamp((p-.27)/.56))*.11;
  core(card,p,time,stretch);
  const step=clamp((p-.07)/.86);
  if(step>0&&step<1){
    const t=ease(step),x=mix(264,174,t),y=mix(227,166,t);
    if(step>.16&&step<.7){
      const bridge=ease((step-.16)/.16)*(1-ease((step-.53)/.17));
      const coreEdge=160+(5+111*ease(p))*.88;
      ctx.save();ctx.globalAlpha=bridge*.72;
      ctx.strokeStyle='#1a334d';ctx.lineWidth=mix(3,17,ease((step-.16)/.37));ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(coreEdge-8,169+18*step);ctx.quadraticCurveTo((coreEdge+x)/2,185,x-10,y-7);ctx.stroke();ctx.restore();
    }
    sphere(ctx,x,y,23*(1+.18*(1-t)),Math.min(1,step*9)*(1-ease((step-.82)/.18)));
  }
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
  const elapsed=reduceMotion.matches?3400:(now-card.epoch)%5600;
  const p=clamp((elapsed-160)/2950),time=1.8+elapsed/1000;
  paintNetwork(card.surfaceCtx,SIZE,card.network,{time,reduced:reduceMotion.matches,reveal:1});
  card.ctx.clearRect(0,0,SIZE,SIZE);
  if(p>=.995){card.ctx.drawImage(card.surface,0,0);return;}
  if(card.mode==='depth')depth(card,p,time);
  else if(card.mode==='orbit')orbit(card,p,time);
  else attraction(card,p,time);
}

let last=0;
function frame(now){
  if(!document.hidden&&now-last>=33){cards.forEach(card=>render(card,now));last=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.querySelector('.replay-all').addEventListener('click',()=>{const now=performance.now();cards.forEach(card=>card.epoch=now);});
cards.forEach(card=>card.element.querySelector('.replay').addEventListener('click',()=>{card.epoch=performance.now();}));
