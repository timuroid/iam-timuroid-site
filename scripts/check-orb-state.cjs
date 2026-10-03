const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../public/orb.js'),'utf8');
const compiled=source.replace(/^import .*?;\s*$/gm,'').replace(/^export\s+/gm,'')+`
globalThis.probe={render,refreshOrbs,setOrbState,getOrbDiagnostics,prepare(items){
  targets=items;initialized=true;engine={surface:{width:0,height:0},fallback:false,
  gl:{viewport(){},uniform2f(){},uniform1f(){},drawArrays(){}},uniforms:{}};
}};`;
let rectReads=0,styleReads=0,draws=0;
const body={classList:{contains:()=>false},parentElement:null};
let rect={left:20,right:330,top:200,bottom:510,width:310,height:310};
const node={width:560,height:560,parentElement:body,closest:()=>null,getBoundingClientRect(){rectReads++;return rect;}};
const context=vm.createContext({
  console,Math,Map,Set,Number,Float32Array,innerWidth:390,innerHeight:844,devicePixelRatio:3,
  document:{hidden:false,body,querySelector:()=>null,documentElement:{dataset:{}}},
  matchMedia:query=>({matches:query.includes('pointer: coarse')}),
  getComputedStyle:()=>{styleReads++;return{display:'block',visibility:'visible'};},
  requestAnimationFrame:()=>1,clearTimeout:()=>{},setTimeout:()=>1
});
vm.runInContext(compiled,context);
const p=context.probe;
p.prepare([{node,ctx:{clearRect(){},drawImage(){draws++;}}}]);
for(let n=1;n<=600;n++)p.render(n*17);
assert.equal(rectReads,1,'Animation measured layout on every frame');
assert.equal(styleReads,2,'Animation repeatedly walked ancestor styles');
assert(draws>100,'No animation frames were drawn');
assert.equal(node.width,419,'Mobile pixel ratio cap changed');
p.setOrbState('speaking');
for(let n=601;n<=900;n++)p.render(n*17);
assert.equal(rectReads,1,'Voice state change forced continuous layout reads');
rect={left:20,right:68,top:720,bottom:768,width:48,height:48};
p.refreshOrbs();p.render(16000,true);
assert.equal(rectReads,2,'Explicit presentation refresh did not measure new size');
assert.equal(node.width,65,'Compact orb kept large canvas backing');
const d=p.getOrbDiagnostics();
assert.equal(d.visibilityReads,2);
console.log(JSON.stringify({check:'orb layout caching',frames:d.frames,rectReads,styleReads,compactPixels:node.width,note:'Mock canvas and layout; no browser rendering or device FPS claim.'}));
