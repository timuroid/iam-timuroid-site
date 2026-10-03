import {requestHaptic} from '/haptics.js';

// A shared renderer keeps the hero, floating button and agent orb in sync.
const fragment = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_impulse;
uniform float u_flash;
uniform float u_particles;
uniform vec2 u_pointer;
float seed(float x){return fract(sin(x*1.713+2.91)*1939.37);}
float smoothUnion(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
void main(){
  vec2 p=(2.*gl_FragCoord.xy-u_resolution)/min(u_resolution.x,u_resolution.y);
  float t=u_time;
  vec2 body=p;
  body*=vec2(1.+u_impulse*.052,1.-u_impulse*.046);
  float a=atan(body.y,body.x);
  float alive=.014*sin(a*3.+t*1.3)+.009*sin(a*5.-t*.94)+.004*sin(a*8.+t*1.61);
  float radius=.675+alive+u_energy*.026*sin(a*4.-t*2.8)+u_impulse*.038*sin(a*3.+t*4.7);
  float field=length(body)-radius;
  vec2 nearest=body;
  float nearestSize=radius;
  float nearestField=field;
  // Every droplet has its own direction, size and detachment rhythm.
  for(int i=0;i<12;i++){
    float f=float(i);
    if(f>=u_particles)continue;
    float s=seed(f+1.);
    float angle=s*6.283185+.29*sin(t*(.46+s*.48)+f*2.07)+.11*cos(t*.83-f*1.37);
    float wave=.5+.5*sin(t*(.79+s*.55)+f*2.39);
    float away=pow(wave,2.+s*1.3);
    float radial=min(.90,.665+(.206+s*.045+u_energy*.026)*away+u_impulse*.044*wave);
    vec2 center=vec2(cos(angle),sin(angle))*radial;
    center+=vec2(sin(t*.77+f*1.2),cos(t*1.07-f*.9))*.012*away;
    float dotRadius=.012+seed(f+8.3)*.022+u_energy*.009*wave;
    vec2 q=p-center;
    float d=length(q)-dotRadius;
    field=smoothUnion(field,d,.032+u_energy*.009);
    if(d<nearestField){nearestField=d;nearest=q;nearestSize=dotRadius;}
  }
  float edge=2./min(u_resolution.x,u_resolution.y);
  float alpha=1.-smoothstep(-edge,edge,field);
  if(alpha<.001){gl_FragColor=vec4(0.);return;}
  vec2 xy=nearest/nearestSize;
  float z=sqrt(max(0.,1.-dot(xy,xy)));
  vec3 n=normalize(vec3(xy,z));
  vec3 flow=vec3(sin(n.y*4.3+t*1.12),cos(n.x*3.8-t*.91),sin(n.x*2.1+n.y*1.7+t*.74));
  vec3 normal=normalize(n+flow*(.036+u_energy*.055+u_impulse*.04));
  vec3 light=normalize(vec3(-.53+u_pointer.x*.18,.71+u_pointer.y*.17,1.13));
  float diffuse=max(dot(normal,light),0.);
  vec3 color=vec3(.017,.038,.079)+vec3(.021,.049,.089)*diffuse;
  // Broad reflected light, a narrow moving lacquer streak and a white glint.
  vec3 reflectionDir=normalize(vec3(-.35+.18*sin(t*.79)+u_pointer.x*.21,.45+.14*cos(t*.67)+u_pointer.y*.17,1.));
  float reflected=max(dot(normal,reflectionDir),0.);
  color+=vec3(.105,.189,.29)*pow(reflected,8.)*.76;
  vec2 reflection=normal.xy-vec2(-.33+.12*sin(t*.79),.45+.1*cos(t*.67))-u_pointer*.13;
  float streakX=reflection.x*7.5+reflection.y*2.8;
  float streakY=reflection.y*14.;
  float streak=exp(-streakX*streakX-streakY*streakY);
  color+=vec3(.72,.82,.94)*streak*(.55+u_flash*.13+u_impulse*.12);
  color+=vec3(.88,.94,1.)*pow(reflected,155.)*(.62+u_energy*.25+u_impulse*.25);
  color+=vec3(.94,.98,1.)*pow(reflected,480.)*.37;
  vec3 second=normalize(vec3(.69+.11*sin(t*1.1),-.19+.18*cos(t*.89),.51));
  float side=max(dot(normal,second),0.);
  color+=vec3(.20,.35,.52)*pow(side,22.)*.56;
  color+=vec3(.68,.81,.93)*pow(side,170.)*.24;
  float rim=pow(1.-z,3.);
  color+=vec3(.045,.089,.155)*rim*(.8+.6*diffuse);
  gl_FragColor=vec4(clamp(color,0.,1.),alpha);
}`;
const vertex='attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}';
const modes=['idle','thinking','listening','speaking','error'];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const coarse=matchMedia('(pointer: coarse)');
let mode='idle',level=0,phase=1.8,energy=0,speed=.93,tapDrive=0,impulse=0,flash=0;
let pointerScreen=null,smoothPointer=[0,0];
let frame=0,last=0,drawCount=0,settleTimer=0;
let engine,targets=[],initialized=false,audioReader=null,targetCache=[],targetsDirty=true,visibilityReads=0;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const seed=x=>{const value=Math.sin(x*1.713+2.91)*1939.37;return value-Math.floor(value);};
const mobile=()=>coarse.matches||innerWidth<=650;

function makeEngine(){
  const surface=document.createElement('canvas');
  const gl=surface.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power',premultipliedAlpha:false});
  if(!gl)return{surface,fallback:true};
  try{
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw new Error('Orb shader unavailable');}
      return shader;
    };
    const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision;
    const shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,precision?fragment:fragment.replace('precision highp float;','precision mediump float;'))];
    const program=gl.createProgram();shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);shaders.forEach(shader=>gl.deleteShader(shader));
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Orb shader unavailable');
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const uniforms=Object.fromEntries(['resolution','time','energy','impulse','flash','particles','pointer'].map(key=>[key,gl.getUniformLocation(program,'u_'+key)]));
    surface.addEventListener('webglcontextlost',event=>{
      event.preventDefault();engine={surface:document.createElement('canvas'),fallback:true};schedule();
    });
    return{surface,gl,uniforms,fallback:false};
  }catch{return{surface:document.createElement('canvas'),fallback:true};}
}
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
function paintFallback(size,particles){
  const ctx=engine.surface.getContext('2d');
  const effectEnergy=reduced.matches?0:energy,effectImpulse=reduced.matches?0:impulse;
  const unit=size/2,radius=unit*.675;
  ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(unit,unit);
  for(let i=0;i<particles;i++){
    const s=seed(i+1),a=s*Math.PI*2+.29*Math.sin(phase*(.46+s*.48)+i*2.07)+.11*Math.cos(phase*.83-i*1.37);
    const wave=.5+.5*Math.sin(phase*(.79+s*.55)+i*2.39),away=wave**(2+s*1.3);
    const distance=unit*Math.min(.90,.665+(.206+s*.045+effectEnergy*.026)*away+effectImpulse*.044*wave);
    const r=unit*(.012+seed(i+8.3)*.022+effectEnergy*.009*wave);
    const x=Math.cos(a)*distance+Math.sin(phase*.77+i*1.2)*unit*.012*away;
    const y=-Math.sin(a)*distance-Math.cos(phase*1.07-i*.9)*unit*.012*away;
    const g=ctx.createRadialGradient(x-r*.3,y-r*.4,0,x,y,r);
    g.addColorStop(0,'#e0eaf5');g.addColorStop(.2,'#7898ba');g.addColorStop(.5,'#1b3455');g.addColorStop(1,'#071529');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  ctx.scale(1/(1+effectImpulse*.052),1/(1-effectImpulse*.046));
  ctx.beginPath();
  for(let i=0;i<=128;i++){
    const a=i/128*Math.PI*2;
    const r=radius+unit*(.014*Math.sin(a*3+phase*1.3)+.009*Math.sin(a*5-phase*.94)+.004*Math.sin(a*8+phase*1.61)+effectEnergy*.026*Math.sin(a*4-phase*2.8)+effectImpulse*.038*Math.sin(a*3+phase*4.7));
    const x=Math.cos(a)*r,y=-Math.sin(a)*r;
    if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
  }
  ctx.closePath();ctx.clip();
  const base=ctx.createRadialGradient(-radius*.35,-radius*.48,0,0,0,radius*1.2);
  base.addColorStop(0,'#28496e');base.addColorStop(.46,'#102745');base.addColorStop(1,'#040d1d');
  ctx.fillStyle=base;ctx.fillRect(-unit,-unit,size,size);
  const hx=(-.33+.15*Math.sin(phase*.79)+smoothPointer[0]*.15)*radius;
  const hy=(-.45-.13*Math.cos(phase*.67)-smoothPointer[1]*.15)*radius;
  const sheen=ctx.createRadialGradient(hx,hy,0,hx,hy,radius*.86);
  sheen.addColorStop(0,'#adc8e168');sheen.addColorStop(.38,'#7795b134');sheen.addColorStop(1,'#7795b100');
  ctx.fillStyle=sheen;ctx.fillRect(-unit,-unit,size,size);
  ctx.save();ctx.translate(hx,hy);ctx.rotate(-.35);ctx.scale(1,.5);
  const gloss=ctx.createRadialGradient(0,0,0,0,0,radius*.31);
  gloss.addColorStop(0,`rgba(242,247,255,${.82+flash*.15})`);gloss.addColorStop(.22,'#d7e9f2aa');gloss.addColorStop(.5,'#8aa9c654');gloss.addColorStop(1,'#8aa9c600');
  ctx.fillStyle=gloss;ctx.fillRect(-radius,-radius,radius*2,radius*2);
  const core=ctx.createRadialGradient(0,0,0,0,0,radius*.085);
  core.addColorStop(0,`rgba(255,255,255,${.85+flash*.14})`);core.addColorStop(1,'#ffffff00');
  ctx.fillStyle=core;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
  const side=ctx.createRadialGradient(radius*.58,radius*.21,0,radius*.64,radius*.24,radius*.42);
  side.addColorStop(0,'#a5c8e573');side.addColorStop(.18,'#4d79a552');side.addColorStop(1,'#4d79a500');
  ctx.fillStyle=side;ctx.fillRect(-unit,-unit,size,size);ctx.restore();
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
  try{const audio=audioReader?.(mode);if(Number.isFinite(audio))level=clamp(audio);}catch{audioReader=null;level=0;}
  const stateEnergy=mode==='thinking'?.15:mode==='listening'?.045:mode==='speaking'?.07:0;
  const desiredEnergy=Math.max(stateEnergy,level);
  energy+=(desiredEnergy-energy)*Math.min(1,dt*(desiredEnergy>energy?14:6));
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
  const particles=compact?7:12;
  if(engine.fallback)paintFallback(size,particles);
  else{
    const{gl,uniforms}=engine;gl.viewport(0,0,size,size);
    gl.uniform2f(uniforms.resolution,size,size);gl.uniform1f(uniforms.time,phase);
    gl.uniform1f(uniforms.energy,reduced.matches?0:energy);gl.uniform1f(uniforms.impulse,reduced.matches?0:impulse);
    gl.uniform1f(uniforms.flash,flash);gl.uniform1f(uniforms.particles,particles);gl.uniform2f(uniforms.pointer,...smoothPointer);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
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
export function setOrbAudioReader(reader){audioReader=typeof reader==='function'?reader:null;if(!audioReader)level=0;schedule();}
export function refreshOrbs(){targetsDirty=true;schedule();}
export function getOrbDiagnostics(){return{renderer:engine?.fallback?'canvas':'webgl',state:mode,frames:drawCount,visibilityReads,energy,renderSize:engine?.surface.width,visible:visibleTargets().length,reducedMotion:reduced.matches,particles:mobile()?7:12};}
export function activateOrb(){pulse();}
