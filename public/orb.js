import {requestHaptic} from '/haptics.js';

import {createNetwork,paintNetwork} from '/network-orb.js';
import {createTokenFlow} from '/orb-tokens.js';

const network=createNetwork();
const tokenFlow=createTokenFlow();
function makeEngine(){const surface=document.createElement('canvas');return{surface,ctx:surface.getContext('2d',{alpha:true})};}
const modes=['idle','thinking','listening','speaking','error'];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const coarse=matchMedia('(pointer: coarse)');
let mode='idle',level=0,phase=1.8,energy=0,speechActivity=0,speed=.93,tapDrive=0,impulse=0,flash=0;
let pointerScreen=null,smoothPointer=[0,0];
let frame=0,last=0,drawCount=0,settleTimer=0;
let engine,targets=[],initialized=false,audioReader=null,audioWaveform=null,targetCache=[],targetsDirty=true,visibilityReads=0;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const mobile=()=>coarse.matches||innerWidth<=650;

function visibleTargets(){
  if(!targetsDirty)return targetCache;
  targetsDirty=false;visibilityReads++;
  const modal=document.querySelector('dialog[open]');
  const styles=new Map();
  targetCache=targets.filter(target=>{
    const {node}=target;
    const dialog=node.closest('dialog');
    if(dialog&&!dialog.open||modal&&!dialog||node.closest('[hidden]'))return false;
    if(node.closest('.floating-agent')&&document.body.classList.contains('hero-visible'))return false;
    // Overlay/dock presentation hides the hero and launcher through CSS rather
    // than [hidden]. They must not enlarge the shared render or attract lighting.
    for(let ancestor=node;ancestor;ancestor=ancestor.parentElement){
      if(!styles.has(ancestor)){
        const style=typeof getComputedStyle==='function'?getComputedStyle(ancestor):null;
        styles.set(ancestor,style?{display:style.display,visibility:style.visibility}:null);
      }
      const style=styles.get(ancestor);
      if(style?.display==='none'||style?.visibility==='hidden'||style?.visibility==='collapse')return false;
    }
    const rect=node.getBoundingClientRect();
    target.rect=rect;target.width=rect.width;
    return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
  });
  return targetCache;
}
function render(now,force=false){
  frame=0;if(document.hidden)return;
  const active=visibleTargets();if(!active.length){last=0;return;}
  const compact=mobile();
  const responding=tapDrive>.02||impulse>.02||mode==='speaking'||mode==='listening';
  const interval=responding?(compact?28:20):(compact?42:32);
  if(!force&&!reduced.matches&&now-last<interval){schedule();return;}
  const dt=last?Math.min((now-last)/1000,.1):.033;last=now;
  const desiredSpeed={idle:.93,thinking:1.68,listening:1.13,speaking:1.56,error:.55}[mode];
  speed+=(desiredSpeed-speed)*Math.min(1,dt*5);
  try{
    const audio=audioReader?.(mode);
    if(Number.isFinite(audio)){level=clamp(audio);audioWaveform=null;}
    else if(audio&&Number.isFinite(audio.level)){level=clamp(audio.level);audioWaveform=audio.waveform||null;}
  }catch{audioReader=null;audioWaveform=null;level=0;}
  const stateEnergy=mode==='thinking'?.15:mode==='listening'?.045:mode==='speaking'?.07:0;
  const desiredEnergy=Math.max(stateEnergy,level);
  energy+=(desiredEnergy-energy)*Math.min(1,dt*(desiredEnergy>energy?14:6));
  const speechTarget=mode==='speaking'?1:0;
  speechActivity+=(speechTarget-speechActivity)*(1-Math.exp(-dt/(speechTarget>speechActivity?.12:.55)));
  if(!reduced.matches){
    // A tap adds a small drive, not a jump in geometry. Ease into it quickly,
    // then let the deformation follow the fading drive with a longer recovery.
    tapDrive*=Math.exp(-dt*1.75);
    impulse+=(tapDrive-impulse)*(1-Math.exp(-dt/(tapDrive>impulse?.11:.58)));
    const targetFlash=Math.min(1,impulse/.32)*.62;
    flash+=(targetFlash-flash)*(1-Math.exp(-dt/(targetFlash>flash?.075:.34)));
    if(tapDrive<.0005)tapDrive=0;
    if(impulse<.0005)impulse=0;
  }else{tapDrive=0;impulse=0;}
  const lightTarget=pointerLightTarget(active);
  const settling=Math.hypot(...lightTarget)<Math.hypot(...smoothPointer);
  const lightBlend=1-Math.exp(-dt/(settling?.35:.22));
  smoothPointer=smoothPointer.map((value,i)=>value+(lightTarget[i]-value)*lightBlend);
  if(!reduced.matches)phase+=dt*(speed+impulse*.38);
  else smoothPointer=lightTarget;
  const pixelRatio=Math.min(devicePixelRatio||1,compact?1.35:1.5),cap=compact?440:600;
  const size=Math.min(cap,Math.max(96,...active.map(({width})=>Math.ceil(width*pixelRatio))));
  if(engine.surface.width!==size||engine.surface.height!==size){engine.surface.width=size;engine.surface.height=size;}
  paintNetwork(engine.ctx,size,network,{time:phase,energy:reduced.matches?0:energy,speechActivity:reduced.matches?0:speechActivity,waveform:reduced.matches?null:audioWaveform,liveTokens:tokenFlow.read(now,{reduced:reduced.matches}),impulse:reduced.matches?0:impulse,pointer:smoothPointer,reduced:reduced.matches,state:mode});
  for(const{node,ctx,width}of active){
    const targetSize=Math.min(cap,Math.max(48,Math.round(width*pixelRatio)));
    if(node.width!==targetSize||node.height!==targetSize){node.width=targetSize;node.height=targetSize;}
    ctx.clearRect(0,0,targetSize,targetSize);ctx.drawImage(engine.surface,0,0,targetSize,targetSize);
  }
  drawCount++;if(!reduced.matches)schedule();
}
function schedule(){if(initialized&&!frame&&!document.hidden)frame=requestAnimationFrame(render);}
function orbFromEvent(event){
  const element=event.target instanceof Element?event.target:null;
  return element?.closest('[data-live-orb]')||element?.closest('.hero-orb-button,.agent-orb-button,.floating-agent')?.querySelector('[data-live-orb]');
}
function pointerLightTarget(active){
  if(!pointerScreen)return[0,0];
  let nearest=null;
  for(const{rect}of active){
    if(!rect.width||!rect.height)continue;
    const x=(pointerScreen.x-rect.left-rect.width/2)/(rect.width/2);
    const y=(rect.top+rect.height/2-pointerScreen.y)/(rect.height/2);
    const distance=Math.hypot(x,y);
    if(!nearest||distance<nearest.distance)nearest={x,y,distance};
  }
  if(!nearest)return[0,0];
  // Influence vanishes smoothly outside the orb, including its transparent margin.
  const t=clamp((nearest.distance-.35)/.8),influence=1-t*t*(3-2*t);
  return[clamp(nearest.x,-1,1)*influence*.4,clamp(nearest.y,-1,1)*influence*.4];
}
function pulse(){
  clearTimeout(settleTimer);
  if(reduced.matches){
    // Reduced motion receives one subtle, stationary lighting response.
    tapDrive=0;impulse=0;flash=.24;
    settleTimer=setTimeout(()=>{flash=0;schedule();},260);
  }else tapDrive=Math.max(tapDrive,.48);
  schedule();
}
export function initOrbs(){
  if(initialized)return;initialized=true;engine=makeEngine();
  targets=[...document.querySelectorAll('[data-live-orb]')].map(node=>({node,ctx:node.getContext('2d',{alpha:true})})).filter(target=>target.ctx);
  const observer=new IntersectionObserver(refreshOrbs);targets.forEach(target=>observer.observe(target.node));
  const resizeObserver=new ResizeObserver(refreshOrbs);targets.forEach(target=>resizeObserver.observe(target.node));
  // CSS presentation changes are infrequent. Never walk styles or measure the
  // layout at shader frame rate, including the frames skipped by throttling.
  const presentationObserver=new MutationObserver(refreshOrbs);
  for(const element of [document.body,document.querySelector('.hero-art'),document.querySelector('#agent-overlay'),document.querySelector('#agent-panel'),document.querySelector('#agent-dock')].filter(Boolean))presentationObserver.observe(element,{attributes:true,attributeFilter:['hidden','class','data-presentation']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else refreshOrbs();});
  window.addEventListener('resize',refreshOrbs,{passive:true});window.addEventListener('scroll',refreshOrbs,{passive:true});
  window.visualViewport?.addEventListener('resize',refreshOrbs,{passive:true});window.visualViewport?.addEventListener('scroll',refreshOrbs,{passive:true});
  document.fonts?.ready.then(refreshOrbs);
  document.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||event.isPrimary===false)return;
    pointerScreen={x:event.clientX,y:event.clientY};schedule();
  },{passive:true});
  document.addEventListener('pointerout',event=>{if(!event.relatedTarget){pointerScreen=null;schedule();}},{passive:true});
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch')pointerScreen=null;
    if(orbFromEvent(event))pulse();
  },{passive:true});
  document.addEventListener('pointercancel',()=>{pointerScreen=null;schedule();},{passive:true});
  document.addEventListener('click',event=>{
    if(!orbFromEvent(event))return;
    if(event.detail===0)pulse();
    requestHaptic(event);
  });
  window.addEventListener('blur',()=>{pointerScreen=null;schedule();});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);clearTimeout(settleTimer);frame=0;last=0;});
  window.addEventListener('pageshow',refreshOrbs);
  reduced.addEventListener('change',()=>{clearTimeout(settleTimer);last=0;tapDrive=0;impulse=0;flash=0;pointerScreen=null;smoothPointer=[0,0];schedule();});
  schedule();
}
export function setOrbState(next){mode=modes.includes(next)?next:'idle';document.documentElement.dataset.orbState=mode;schedule();}
export function setOrbLevel(value){level=clamp(Number(value)||0);schedule();}
export function setOrbAudioReader(reader){audioReader=typeof reader==='function'?reader:null;if(!audioReader){level=0;audioWaveform=null;}schedule();}
export function refreshOrbs(){targetsDirty=true;schedule();}
export function feedOrbText(text,options){tokenFlow.feed(text,options,performance.now());schedule();}
export function clearOrbText(){tokenFlow.clear();schedule();}
export function getOrbDiagnostics(){return{renderer:'network-canvas',state:mode,frames:drawCount,visibilityReads,energy,renderSize:engine?.surface.width,visible:visibleTargets().length,reducedMotion:reduced.matches,nodes:network.nodes.length,edges:network.edges.length,tokens:tokenFlow.diagnostics()};}
export function activateOrb(){pulse();}
