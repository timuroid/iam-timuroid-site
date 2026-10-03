const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../public/orb.js'),'utf8');
const compiled=source.replace(/^import .*?;\s*$/gm,'').replace(/^export\s+/gm,'')+`
globalThis.probe={render,refreshOrbs,setOrbState,setOrbAudioReader,getOrbDiagnostics,prepare(items){
  targets=items;initialized=true;engine={surface:{width:0,height:0},ctx:{}};
}};`;
let rectReads=0,styleReads=0,draws=0,lastPaint;
const body={classList:{contains:()=>false},parentElement:null};
let rect={left:20,right:330,top:200,bottom:510,width:310,height:310};
const node={width:560,height:560,parentElement:body,closest:()=>null,getBoundingClientRect(){rectReads++;return rect;}};
const context=vm.createContext({
  console,Math,Map,Set,Number,Float32Array,createNetwork:()=>({nodes:[],edges:[]}),paintNetwork:(ctx,size,network,options)=>{lastPaint=options;},innerWidth:390,innerHeight:844,devicePixelRatio:3,
  document:{hidden:false,body,querySelector:()=>null,documentElement:{dataset:{}}},
  matchMedia:query=>({matches:query.includes('pointer: coarse')}),
  getComputedStyle:()=>{styleReads++;return{display:'block',visibility:'visible'};},
  requestAnimationFrame:()=>1,clearTimeout:()=>{},setTimeout:()=>1
});
const tokenSource=fs.readFileSync(path.resolve(__dirname,'../public/orb-tokens.js'),'utf8').replace(/^export\s+/gm,'');
vm.runInContext(tokenSource+'\nglobalThis.tokenProbe=createTokenFlow;',context);
vm.runInContext(compiled,context);
const p=context.probe;
p.prepare([{node,ctx:{clearRect(){},drawImage(){draws++;}}}]);
for(let n=1;n<=600;n++)p.render(n*17);
assert.equal(rectReads,1,'Animation measured layout on every frame');
assert.equal(styleReads,2,'Animation repeatedly walked ancestor styles');
assert(draws>100,'No animation frames were drawn');
assert.equal(node.width,372,'Mobile pixel ratio cap changed');
p.setOrbState('speaking');
for(let n=601;n<=900;n++)p.render(n*17);
assert.equal(rectReads,1,'Voice state change forced continuous layout reads');
rect={left:20,right:68,top:720,bottom:768,width:48,height:48};
p.refreshOrbs();p.render(16000,true);
assert.equal(rectReads,2,'Explicit presentation refresh did not measure new size');
assert.equal(node.width,58,'Compact orb kept large canvas backing');
const d=p.getOrbDiagnostics();
assert.equal(d.visibilityReads,2);
p.setOrbAudioReader(()=>({level:.5,waveform:Float32Array.from({length:32},()=>.8)}));p.render(17000,true);
assert.equal(lastPaint.waveform.length,32,'Live waveform was not passed to network');
p.setOrbAudioReader(null);p.render(17100,true);assert.equal(lastPaint.waveform,null,'Stopped audio left old waveform');
const graphSource=fs.readFileSync(path.resolve(__dirname,'../public/network-orb.js'),'utf8').replace(/^export\s+/gm,'');
vm.runInContext(graphSource+'\nglobalThis.graphProbe={createNetwork,paintNetwork};',context);
const graph=context.graphProbe.createNetwork();assert.equal(graph.nodes.length,186);assert(graph.edges.some(edge=>edge.inner),'No links through inner volume');
function extent(options){
  const positions=[];let background=0,gradientStops=[];
  const ctx={clearRect(){},beginPath(){},moveTo(x,y){positions.push([x,y]);},lineTo(x,y){positions.push([x,y]);},stroke(){},fill(){},arc(x,y){positions.push([x,y]);},fillText(){},fillRect(){background++;},createRadialGradient(){background++;return{addColorStop(offset,color){gradientStops.push(color);}};}};
  context.graphProbe.paintNetwork(ctx,400,graph,{time:3,...options});assert(background<=1,'Background gradient is recreated every frame');assert(gradientStops.every(color=>/rgba\([^)]*,(?:0|\.\d+)\)/.test(color)),'Background has an opaque color');assert(positions.every(p=>p.every(Number.isFinite)),'Invalid vertex coordinates');
  return Math.max(...positions.map(([x,y])=>Math.hypot(x-200,y-200)));
}
const idle=extent({state:'idle',energy:0}),speaking=extent({state:'speaking',energy:.65,waveform:Float32Array.from({length:32},()=>.9)});
assert(speaking>idle*1.12,'Speech does not push individual vertices outward');
assert.equal(extent({state:'speaking',reduced:true,waveform:Float32Array.from({length:32},()=>1)}),extent({state:'idle',reduced:true}),'Reduced motion still deforms with audio');
const flow=context.tokenProbe();flow.feed('Разберём задачу',{id:'reply',role:'assistant'},0);flow.read(1);const labels=flow.read(300).filter(Boolean);
assert(labels.some(x=>x.text.includes('Разбер')),'Received text did not become vertex fragments');
const queued=flow.diagnostics().queued;flow.feed('Разберём задачу',{id:'reply',role:'assistant',complete:true},350);assert.equal(flow.diagnostics().queued,queued,'Completed transcript repeated streamed fragments');
for(let i=0;i<100;i++)flow.feed('Мобильный быстрый сайт',{id:'reply-'+i,role:'user'},400);assert(flow.diagnostics().queued<=32&&flow.diagnostics().streams<=64,'Unbounded token queue');
assert(flow.read(401,{reduced:true}).some(x=>x?.role==='user'),'Reduced motion lost received text');flow.clear();assert.equal(flow.diagnostics().queued,0);assert(flow.read(1000).every(x=>x===null),'Cleared text still shown');
console.log(JSON.stringify({check:'orb layout caching',frames:d.frames,rectReads,styleReads,compactPixels:node.width,note:'Mock canvas and layout; no browser rendering or device FPS claim.'}));
console.log(JSON.stringify({check:'network voice shape',nodes:graph.nodes.length,edges:graph.edges.length,speechExpansion:Number((speaking/idle).toFixed(2)),transparentEdges:true,softDepth:true,reducedMotion:true}));
console.log('PASS: received text fragments, completion deduplication, bounded queue, reduced motion and clearing.');
