// One shared renderer drives every orb. No image texture, video, or framework.
const fragment = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_impulse;
uniform vec2 u_pointer;
float smoothUnion(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
void main(){
  vec2 p=(2.*gl_FragCoord.xy-u_resolution)/min(u_resolution.x,u_resolution.y);
  float t=u_time;
  float a=atan(p.y,p.x);
  float alive=.011*sin(a*3.+t*.75)+.007*sin(a*5.-t*.53);
  float radius=.715+alive+u_energy*.018*sin(a*4.+t*2.1)+u_impulse*.022*sin(a*3.-t*4.);
  float field=length(p)-radius;
  float orbField=field;
  vec2 nearest=p;
  float nearestSize=radius;
  float nearestField=field;
  // Quiet motes detach and rejoin the body; no continuously orbiting ring.
  for(int i=0;i<4;i++){
    float f=float(i);
    float angle=f*1.61+.18*sin(t*.31+f*1.9);
    float away=.5-.5*cos(t*(.47+f*.018)+f*1.73);
    float orbit=.708+(.153+u_impulse*.055+u_energy*.025)*away;
    float dotRadius=.017+.009*(.5+.5*sin(f*2.4));
    vec2 center=vec2(cos(angle),sin(angle))*orbit;
    vec2 q=p-center;
    float d=length(q)-dotRadius;
    field=smoothUnion(field,d,.032);
    if(d<nearestField){nearestField=d;nearest=q;nearestSize=dotRadius;}
  }
  float alpha=1.-smoothstep(-.004,.006,field);
  if(alpha<.001){gl_FragColor=vec4(0.);return;}
  vec2 xy=nearest/nearestSize;
  float z=sqrt(max(0.,1.-dot(xy,xy)));
  vec3 n=normalize(vec3(xy,z));
  // One moving reflection and a polished highlight keep the surface navy.
  vec3 flow=vec3(sin(n.y*3.2+t*.62),cos(n.x*2.7-t*.47),sin(n.x+n.y+t*.38));
  vec3 normal=normalize(n+flow*(.04+u_energy*.045+u_impulse*.025));
  vec3 light=normalize(vec3(-.55+u_pointer.x*.12,.78+u_pointer.y*.12,1.15));
  float diffuse=max(dot(normal,light),0.);
  vec3 navy=vec3(.041,.080,.151);
  vec3 color=navy*(.60+.64*diffuse);
  vec3 reflectionDir=normalize(vec3(-.34+.15*sin(t*.43)+u_pointer.x*.08,.44+.13*cos(t*.38)+u_pointer.y*.08,1.));
  float reflected=max(dot(normal,reflectionDir),0.);
  float reflection=pow(reflected,9.);
  float glint=pow(reflected,125.);
  float core=pow(reflected,420.);
  color+=vec3(.115,.211,.322)*reflection*.68;
  color+=vec3(.64,.67,.71)*glint*(.60+u_energy*.04+u_impulse*.035);
  color+=vec3(.83,.87,.90)*core*.14;
  float rim=pow(1.-z,2.9);
  color+=vec3(.043,.083,.132)*rim*.65;
  color+=vec3(.13,.20,.26)*rim*pow(diffuse,2.)*.35;
  // A subtle crescent gives depth without a bright white/saturated candy edge.
  color+=vec3(.085,.142,.211)*pow(max(0.,dot(normal,normalize(vec3(.63,-.15,.22)))),8.)*.24;
  gl_FragColor=vec4(clamp(color,0.,1.),alpha);
}`;
const vertex='attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}';
let mode='idle',level=0,phase=0,energy=0,speed=.48,impulse=0;
let pointer=[0,0],smoothPointer=[0,0],frame=0,last=0,drawCount=0;
let engine,targets=[],initialized=false,audioReader=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');

function makeEngine(){
  const surface=document.createElement('canvas');
  const gl=surface.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power',premultipliedAlpha:false});
  if(!gl)return{surface,fallback:true};
  try{
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Orb shader unavailable');
    gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const uniforms=Object.fromEntries(['resolution','time','energy','impulse','pointer'].map(key=>[key,gl.getUniformLocation(program,'u_'+key)]));
    surface.addEventListener('webglcontextlost',e=>{e.preventDefault();engine.fallback=true;engine.surface=document.createElement('canvas');schedule();});
    return{surface,gl,uniforms,fallback:false};
  }catch{return{surface:document.createElement('canvas'),fallback:true};}
}
function visibleTargets(){
  const modal=document.querySelector('dialog[open]');
  return targets.filter(({node})=>{
    const dialog=node.closest('dialog');if(dialog&&!dialog.open)return false;
    if(modal&&!dialog)return false;
    if(node.closest('[hidden]'))return false;
    if(node.closest('.floating-agent')&&document.body.classList.contains('hero-visible'))return false;
    const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
  });
}
function paintFallback(size){
  const ctx=engine.surface.getContext('2d');
  ctx.clearRect(0,0,size,size);
  ctx.save();ctx.translate(size/2,size/2);
  const unit=size/2,radius=unit*.715;
  // Same particle positions as shader; draw underneath to merge quietly.
  for(let i=0;i<4;i++){
    const a=i*1.61+.18*Math.sin(phase*.31+i*1.9);
    const away=.5-.5*Math.cos(phase*(.47+i*.018)+i*1.73);
    const orbit=unit*(.708+(.153+impulse*.055+energy*.025)*away);
    const r=unit*(.017+.009*(.5+.5*Math.sin(i*2.4)));
    const x=Math.cos(a)*orbit,y=-Math.sin(a)*orbit;
    const g=ctx.createRadialGradient(x-r*.25,y-r*.35,0,x,y,r);
    g.addColorStop(0,'#668399');g.addColorStop(.3,'#243e59');g.addColorStop(1,'#0b172a');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  ctx.beginPath();
  for(let i=0;i<=100;i++){
    const a=i/100*Math.PI*2;
    const r=unit*(.715+.011*Math.sin(a*3+phase*.75)+.007*Math.sin(a*5-phase*.53)+energy*.018*Math.sin(a*4+phase*2.1)+impulse*.022*Math.sin(a*3-phase*4));
    const x=Math.cos(a)*r,y=-Math.sin(a)*r;
    if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
  }
  ctx.closePath();ctx.clip();
  const base=ctx.createRadialGradient(-radius*.32,-radius*.42,0,0,0,radius*1.23);
  base.addColorStop(0,'#284660');base.addColorStop(.45,'#152c44');base.addColorStop(1,'#071223');
  ctx.fillStyle=base;ctx.fillRect(-unit,-unit,size,size);
  const hx=(-.24+.1*Math.sin(phase*.43))*radius,hy=(-.4+.09*Math.cos(phase*.38))*radius;
  const sheen=ctx.createRadialGradient(hx,hy,0,hx,hy,radius*.75);
  sheen.addColorStop(0,'#55708948');sheen.addColorStop(.35,'#55708918');sheen.addColorStop(1,'#55708900');
  ctx.fillStyle=sheen;ctx.fillRect(-unit,-unit,size,size);
  // A small soft reflection gives Canvas the same glossy finish as WebGL.
  ctx.save();ctx.translate(hx,hy);ctx.rotate(-.38);ctx.scale(1,.64);
  const gloss=ctx.createRadialGradient(0,0,0,0,0,radius*.27);
  gloss.addColorStop(0,'#abc2d6cf');gloss.addColorStop(.18,'#849fb98a');gloss.addColorStop(.55,'#6786a642');gloss.addColorStop(1,'#6786a600');
  ctx.fillStyle=gloss;ctx.fillRect(-radius,-radius,radius*2,radius*2);
  const core=ctx.createRadialGradient(0,0,0,0,0,radius*.075);
  core.addColorStop(0,'#e3ecf573');core.addColorStop(1,'#e3ecf500');
  ctx.fillStyle=core;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();ctx.restore();
}
function render(now,force=false){
  frame=0;if(document.hidden)return;
  const active=visibleTargets();if(!active.length){last=0;return;}
  if(!force&&now-last<32){schedule();return;}
  const dt=last?Math.min((now-last)/1000,.1):.033;last=now;
  const desiredSpeed={idle:.52,thinking:1.13,listening:.68,speaking:1.05,error:.38}[mode]||.52;
  speed+=(desiredSpeed-speed)*Math.min(1,dt*3);
  const audio=audioReader?.(mode);if(Number.isFinite(audio))level=Math.max(0,Math.min(audio,1));
  energy+=(level-energy)*Math.min(1,dt*(level>energy?11:5));impulse*=Math.max(0,1-dt*2.8);
  smoothPointer=smoothPointer.map((v,i)=>v+(pointer[i]-v)*dt*3);
  if(!reduced.matches)phase+=dt*(speed+impulse*2.2);
  const pixelRatio=Math.min(devicePixelRatio||1,1.5);
  const size=Math.min(560,Math.max(96,...active.map(({node})=>Math.ceil(node.clientWidth*pixelRatio))));
  if(engine.surface.width!==size||engine.surface.height!==size){engine.surface.width=size;engine.surface.height=size;}
  if(engine.fallback)paintFallback(size);
  else{const{gl,uniforms}=engine;gl.viewport(0,0,size,size);gl.uniform2f(uniforms.resolution,size,size);gl.uniform1f(uniforms.time,phase);gl.uniform1f(uniforms.energy,reduced.matches?0:energy);gl.uniform1f(uniforms.impulse,reduced.matches?0:impulse);gl.uniform2f(uniforms.pointer,...smoothPointer);gl.drawArrays(gl.TRIANGLES,0,6);}
  for(const{node,ctx}of active){const targetSize=Math.min(560,Math.max(48,Math.round(node.clientWidth*pixelRatio)));if(node.width!==targetSize||node.height!==targetSize){node.width=targetSize;node.height=targetSize;}ctx.clearRect(0,0,targetSize,targetSize);ctx.drawImage(engine.surface,0,0,targetSize,targetSize);}
  drawCount++;if(!reduced.matches)schedule();
}
function schedule(){if(initialized&&!frame&&!document.hidden)frame=requestAnimationFrame(render);}
export function initOrbs(){
  if(initialized)return;initialized=true;engine=makeEngine();
  targets=[...document.querySelectorAll('[data-live-orb]')].map(node=>({node,ctx:node.getContext('2d',{alpha:true})})).filter(t=>t.ctx);
  const observer=new IntersectionObserver(schedule);targets.forEach(t=>observer.observe(t.node));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else schedule();});
  window.addEventListener('resize',schedule,{passive:true});window.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('pointermove',e=>{const node=e.target.closest?.('[data-live-orb]');if(!node)return;const r=node.getBoundingClientRect();pointer=[(e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2];schedule();},{passive:true});
  document.addEventListener('pointerout',e=>{if(e.target.matches?.('[data-live-orb]'))pointer=[0,0];},{passive:true});
  document.addEventListener('pointerdown',e=>{if(e.target.closest?.('[data-live-orb]')){impulse=1;schedule();}},{passive:true});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;last=0;});window.addEventListener('pageshow',schedule);
  reduced.addEventListener('change',()=>{last=0;schedule();});schedule();
}
export function setOrbState(next){mode=['idle','thinking','listening','speaking','error'].includes(next)?next:'idle';document.documentElement.dataset.orbState=mode;schedule();}
export function setOrbLevel(value){level=Math.max(0,Math.min(Number(value)||0,1));schedule();}
export function setOrbAudioReader(reader){audioReader=typeof reader==='function'?reader:null;if(!audioReader)level=0;}
export function refreshOrbs(){schedule();}
export function getOrbDiagnostics(){return{renderer:engine?.fallback?'canvas':'webgl',state:mode,frames:drawCount,energy,renderSize:engine?.surface.width,visible:visibleTargets().length};}

export function activateOrb(){impulse=1;pointer=[0,0];schedule();}
