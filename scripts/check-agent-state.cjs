const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sourcePath = require('node:path').resolve(__dirname,'../public/agent.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = source.replace(/^import .*?;\s*$/gm, '').replace(/^export\s+/gm, '') + `\n;globalThis.probe = {isOpen,open,close,collapse,startVoice,stopVoice,interrupt,sendMessage,onVoiceEvent,voiceBusy,assistantBusy,canInterrupt,updateViewport,toggleVoice,getAgentDiagnostics,state:()=>({mode,sessionActive,presentation,pending,conversationGeneration,textTurns,voiceGeneration,voiceActive,connecting,inputSpeaking,awaitingReply,responseInFlight,activeResponseId,outputPlaying,outputExpected,playbackResponseId,interruptedTurn,clearingOutput,clearingResponseId,cancelAwaitIds:[...cancelAwaitIds],continuationPending,history:history.map(x=>({...x})),audioResponses:[...audioResponses],finishedAudioResponses:[...finishedAudioResponses],cancelledResponses:[...cancelledResponses],micEnabled:mic?.getAudioTracks().map(t=>t.enabled)??[],messages:messages.children.map(n=>n.textContent),error:document.querySelector('#agent-error').textContent})};`;

class ClassList {
  constructor() { this.items = new Set(); }
  add(...names) { names.forEach(x=>this.items.add(x)); }
  remove(...names) { names.forEach(x=>this.items.delete(x)); }
  contains(name) { return this.items.has(name); }
  toggle(name, force) { const value=force===undefined?!this.contains(name):force; value?this.add(name):this.remove(name); return value; }
}
class Element {
  constructor(tag='div', doc=null) { this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.classList=new ClassList();this.children=[];this.attributes={};this.style={setProperty:(key,value)=>{this.style[key]=value;}};this.dataset={};this.listeners={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.readOnly=false;this.scrollHeight=100;this.scrollTop=0;this.scrollLeft=0;this.className='';this.innerHTML='';this.parentNode=null;this.playCount=0;this.pauseCount=0; }
  append(...nodes) { for(const node of nodes){node.remove();this.children.push(node);node.parentNode=this;} }
  insertBefore(node,reference) {node.remove();const i=this.children.indexOf(reference);if(i<0)this.append(node);else{this.children.splice(i,0,node);node.parentNode=this;}return node;}
  replaceChildren(...nodes) { this.children.forEach(n=>n.parentNode=null);this.children=[];this.append(...nodes); }
  remove() { if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;} }
  addEventListener(type, callback) { (this.listeners[type]??=[]).push(callback); }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  getAttribute(key) { return this.attributes[key]??null; }
  querySelector(selector) { if(selector==='h1,h2,h3'||selector==='h1,h2')return this.children.find(n=>selector.split(',').includes(n.tagName.toLowerCase()))??null; if(selector==='svg'){if(!this.svg)this.svg=new Element('svg',this.ownerDocument);return this.svg;} return this.querySelectorAll(selector)[0]??null; }
  querySelectorAll(selector) { const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);if(selector==='*')return all;if(selector==='button')return all.filter(n=>n.tagName==='BUTTON');if(selector.startsWith('.'))return all.filter(n=>n.classList.contains(selector.slice(1))||n.className.split(/\s+/).includes(selector.slice(1)));return []; }
  contains(element) { return element===this||this.children.some(n=>n.contains(element)); }
  matches(selector) { return selector==='input'&&this.tagName==='INPUT'; }
  dispatchEvent(event) { (this.dispatched??=[]).push(event.type);this.listeners[event.type]?.forEach(fn=>fn(event));return true; }
  focus() { this.ownerDocument.activeElement=this; }
  blur() { if(this.ownerDocument.activeElement===this)this.ownerDocument.activeElement=this.ownerDocument.body; }
  getBoundingClientRect() { return this.bounds||{left:0,top:0,bottom:400,height:400,width:this.tagName==='CANVAS'?0:350}; }
  scrollIntoView() { this.scrolled=true; }
  play() { this.playCount++; return Promise.resolve(); }
  pause() { this.pauseCount++; }
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(){
  const doc={hidden:false,activeElement:null,createElement:tag=>new Element(tag,doc)};
  doc.body=new Element('body',doc);doc.activeElement=doc.body;
  const nodes=new Map();
  const buttons=new Set(['#agent-send','#agent-voice-toggle','#agent-interrupt','#agent-dock-voice','#agent-resume','#agent-voice-stop','#agent-to-text','.close-agent','.hero-orb-button']);
  for(const selector of ['#agent-panel','#agent-overlay','#agent-dock','.hero-art','.hero-orb-button','.agent-entry-actions','#home-view','#agent-messages','#agent-input','#agent-send','#agent-suggestions','#agent-voice-toggle','#agent-interrupt','#voice-panel','#voice-status','#voice-caption','#agent-voice-stop','#agent-to-text','#agent-dock-voice','#agent-state','#agent-dock-state','#agent-dock-label','#agent-title','#agent-resume','#agent-error','#agent-form','.close-agent','[data-live-orb=hero]','[data-live-orb=focus]','[data-live-orb=dock]'])nodes.set(selector,new Element(selector==='#agent-input'?'input':buttons.has(selector)?'button':selector.startsWith('[data-live-orb')?'canvas':'div',doc));
  nodes.get('#agent-error').hidden=true;
  for(const selector of ['#agent-messages','#agent-input','#agent-form','#agent-suggestions','#agent-voice-toggle','#agent-interrupt','#voice-panel','#voice-status','#voice-caption','#agent-voice-stop','#agent-to-text','#agent-state','#agent-title','.close-agent'])nodes.get('#agent-panel').append(nodes.get(selector));
  nodes.get('#agent-dock').append(nodes.get('#agent-resume'),nodes.get('#agent-dock-voice'));
  nodes.get('#agent-resume').append(nodes.get('[data-live-orb=dock]'),nodes.get('#agent-dock-label'),nodes.get('#agent-dock-state'));
  nodes.get('.hero-orb-button').append(nodes.get('[data-live-orb=hero]'));
  nodes.get('.hero-art').append(nodes.get('.hero-orb-button'),nodes.get('#agent-panel'),nodes.get('.agent-entry-actions'));
  nodes.get('#agent-overlay').append(nodes.get('[data-live-orb=focus]'));
  nodes.get('#home-view').append(nodes.get('.hero-art'));
  doc.body.append(nodes.get('#home-view'),nodes.get('#agent-overlay'),nodes.get('#agent-dock'));
  doc.querySelector=selector=>selector==='.audio-unlock'?doc.body.querySelector(selector):nodes.get(selector)??null;
  const logs={sent:[],requests:[],peers:[],streams:[],orb:[],actions:[],observers:[],timers:new Map()};
  let timerId=0;
  const win={scrollY:0,visualViewport:{height:844,offsetTop:0,addEventListener(){}},listeners:{},addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);},dispatchEvent(event){this.listeners[event.type]?.forEach(fn=>fn(event));}};
  class Peer {
    constructor(){this.connectionState='new';this.tracks=[];logs.peers.push(this);}
    addTrack(track,stream){this.tracks.push({track,stream});}
    createDataChannel(){this.channel={readyState:'connecting',send:data=>logs.sent.push(JSON.parse(data)),close(){this.readyState='closed';this.closed=true;}};return this.channel;}
    async createOffer(){return {type:'offer',sdp:'mock-offer'};}
    async setLocalDescription(value){this.localDescription=value;}
    async setRemoteDescription(value){this.remoteDescription=value;}
    close(){this.closed=true;this.connectionState='closed';}
  }
  win.RTCPeerConnection=Peer;
  const navigator={mediaDevices:{async getUserMedia(){const track={kind:'audio',enabled:true,stopped:false,stop(){this.stopped=true;this.enabled=false;}};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};logs.streams.push(stream);return stream;}}};
  function fetch(url,options){
    if(url==='/api/realtime'){logs.requests.push({url,options});return Promise.resolve({ok:true,text:async()=> 'mock-answer'});}
    const d=deferred();const request={url,options,...d};logs.requests.push(request);return d.promise;
  }
  const context=vm.createContext({document:doc,window:win,navigator,RTCPeerConnection:Peer,MediaStream:class{constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks;}},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},AbortController,Float32Array,Set,Map,JSON,Math,String,Boolean,Promise,console,innerWidth:390,innerHeight:844,matchMedia:()=>({matches:false}),performance:{now:()=>0},queueMicrotask,requestAnimationFrame:callback=>{callback();return 1;},setTimeout:(callback,ms)=>{const id=++timerId;logs.timers.set(id,{callback,ms});return id;},clearTimeout:id=>logs.timers.delete(id),setInterval:(callback,ms)=>{const id=++timerId;logs.timers.set(id,{callback,ms,interval:true});return id;},clearInterval:id=>logs.timers.delete(id),IntersectionObserver:class{constructor(callback){this.callback=callback;logs.observers.push(this);}observe(target){this.target=target;}},getContext:()=>({section:'hero'}),executeSiteAction:(...args)=>{logs.actions.push(args);return {ok:true};},revealAgentHome:()=>{},setOrbState:state=>logs.orb.push(state),setOrbLevel:()=>{},setOrbAudioReader:()=>{},refreshOrbs:()=>{},requestHaptic:()=>{},mountNativeHapticToggle:()=>null});
  vm.runInContext(compiled,context,{filename:sourcePath});
  context.fetch=fetch;
  const api=context.probe;
  function event(type,payload={}){api.onVoiceEvent({data:JSON.stringify({type,...payload})});}
  async function connect(){api.open({mode:'voice',activate:false});await api.startVoice();const channel=logs.peers.at(-1).channel;channel.readyState='open';channel.onopen();return {channel,track:logs.streams.at(-1).getTracks()[0],peer:logs.peers.at(-1)};}
  return {api,logs,nodes,doc,win,context,event,connect,resume:()=>nodes.get('#agent-resume').listeners.click[0]()};
}
function installActor(h){
  const appPath=sourcePath.replace('/agent.js','/app.js'),app=fs.readFileSync(appPath,'utf8'),site=JSON.parse(fs.readFileSync(sourcePath.replace('/public/agent.js','/content/site.json'),'utf8'));
  const take=(begin,end)=>app.slice(app.indexOf(begin),app.indexOf(end,app.indexOf(begin)));
  for(const selector of ['#home-view','#case-view','#privacy-view','#home','.mobile-nav','.menu-toggle','#tour-toast','#contact-form','#contact-form textarea']){const el=new Element(selector.endsWith('textarea')?'textarea':'div',h.doc);el.id=selector.startsWith('#')?selector.slice(1):'';h.nodes.set(selector,el);h.doc.body.append(el);}
  for(const id of ['home','cases','services','experience','tools','contact','path','research','practice',...site.experience.map(e=>e.id),...site.career.map(e=>'career-'+e.id)]){
    if(!h.nodes.has('#'+id)){const el=new Element('section',h.doc);el.id=id;h.nodes.set('#'+id,el);h.doc.body.append(el);}h.nodes.get('#'+id).append(new Element('h2',h.doc));
  }
  h.nodes.get('#case-view').append(new Element('h1',h.doc));h.nodes.get('#privacy-view').append(new Element('h1',h.doc));
  const contactInput=new Element('input',h.doc);h.nodes.get('#contact').append(contactInput);for(const name of ['name','contact','message']){const node=name==='name'?contactInput:new Element(name==='message'?'textarea':'input',h.doc);h.nodes.set('#contact-form [name='+name+']',node);h.nodes.get('#contact-form').append(node);if(name==='message')h.nodes.set('#contact-form textarea',node);}
  h.doc.getElementById=id=>h.nodes.get('#'+id)??null;
  let current=new URL('https://example.test/');const location={};for(const key of ['pathname','hash','href','origin'])Object.defineProperty(location,key,{get:()=>current[key]});
  const browserHistory={state:{},replaceState(state,title,path){this.state=state;if(path)current=new URL(path,current);},pushState(state,title,path){this.state=state;current=new URL(path,current);}};
  h.win.scrollY=0;h.win.scrollTo=({top})=>{h.win.scrollY=top;};
  const ctx=vm.createContext({document:h.doc,window:h.win,location,history:browserHistory,siteFixture:site,agentFixture:h.api,innerWidth:390,URL,Event,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout:()=>{},refreshOrbs:()=>{},activateOrb:()=>{},console});
  const prefix=`const site=siteFixture; const agentModule=agentFixture; const $=(s,root=document)=>root.querySelector(s); const escape=value=>String(value??''); const reduced={matches:false}; const state={section:'home',caseId:null,page:location.pathname}; let contactFlow=false; const arrow=''; let toastTimer;`;
  const selected=prefix+take('function visual(', 'function renderCases(')+take('function casePage(', "document.addEventListener('click'")+take('function contactContext()', 'const form=');
  vm.runInContext(selected.replace(/^export\s+/gm,''),ctx,{filename:appPath});vm.runInContext('globalThis.actor={executeSiteAction,getContext,navigate,renderRoute,focusDestination};',ctx);
  h.context.executeSiteAction=ctx.actor.executeSiteAction;
  return {actor:ctx.actor,site,location,contactInput,appSha:crypto.createHash('sha256').update(app).digest('hex')};
}
function expect(condition,message){if(!condition)throw new Error(message);}
const audioResponse=id=>({id,status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_audio',transcript:'Ответ'}]}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const results=[];
async function check(name,run){try{await run();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message});}}

(async()=>{
  await check('text collapse/resume preserves request and history; close resets',async()=>{
    const h=harness();h.api.open({mode:'text'});const pending=h.api.sendMessage('Первый вопрос');const request=h.logs.requests.at(-1),generation=h.api.state().conversationGeneration;
    h.api.collapse();expect(h.api.state().presentation==='dock','collapse did not dock');expect(!request.options.signal.aborted,'collapse aborted text');expect(h.api.state().pending,'collapse lost pending');
    request.resolve({ok:true,json:async()=>({reply:'Первый ответ'})});await pending;
    expect(h.api.state().history.length===2,'dock reply lost');h.api.open({mode:'text'});expect(h.api.state().conversationGeneration===generation,'resume reset generation');expect(h.api.state().history.length===2,'resume cleared history');
    h.api.close();expect(!h.api.state().sessionActive&&h.api.state().history.length===0&&!h.api.state().pending,'close did not reset');h.api.open({mode:'text'});expect(h.api.state().history.length===0,'fresh reopen retained history');
  });
  await check('voice collapse/resume preserves live session; close releases tracks',async()=>{
    const h=harness();const {track,peer,channel}=await h.connect(),generation=h.api.state().voiceGeneration;
    h.api.collapse();expect(h.api.state().voiceActive&&!track.stopped&&!peer.closed&&channel.readyState==='open','collapse released voice');h.resume();expect(h.api.state().voiceGeneration===generation,'resume restarted voice');
    h.api.close();expect(track.stopped&&peer.closed&&channel.closed,'close leaked media');expect(!h.api.state().voiceActive&&h.api.state().presentation==='closed','close retained voice state');
  });
  for(const outcome of ['success','error'])await check(`stale text ${outcome} after close cannot mutate new request`,async()=>{
    const h=harness();h.api.open({mode:'text'});const old=h.api.sendMessage('Старый вопрос'),oldRequest=h.logs.requests.at(-1);h.api.close();h.api.open({mode:'text'});const fresh=h.api.sendMessage('Новый вопрос'),freshRequest=h.logs.requests.at(-1),before=JSON.stringify(h.api.state());
    if(outcome==='success')oldRequest.resolve({ok:true,json:async()=>({reply:'Поздний старый ответ',action:'navigate',target:'contact'})});else oldRequest.reject(new Error('Поздняя старая ошибка'));
    await old;expect(JSON.stringify(h.api.state())===before,'stale callback mutated fresh state');expect(!h.logs.actions.length,'stale response executed action');expect(h.api.state().pending,'stale finally cleared pending');
    freshRequest.resolve({ok:true,json:async()=>({reply:'Новый ответ'})});await fresh;expect(h.api.state().history.length===2&&h.api.state().history[1].content==='Новый ответ','fresh request broken');
  });
  await check('new voice open is silent and starts listening',async()=>{
    const h=harness();h.api.open({mode:'voice',activate:false});await h.api.startVoice();expect(!h.logs.streams.at(-1).getTracks()[0].enabled,'mic enabled while connecting');const ch=h.logs.peers.at(-1).channel;ch.readyState='open';ch.onopen();
    expect(!h.logs.sent.some(e=>e.type==='response.create'),'opening requested greeting');expect(h.api.state().voiceActive&&h.api.state().micEnabled[0]&&!h.api.assistantBusy(),'opening did not listen');
  });
  await check('response.done with audio keeps mic disabled until stopped',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});expect(!h.api.state().micEnabled[0],'created did not mute');h.event('response.done',{response:audioResponse('r1')});expect(!h.api.state().micEnabled[0]&&h.api.state().outputExpected,'generation done unmuted before audio');h.event('output_audio_buffer.started',{response_id:'r1'});expect(!h.api.state().micEnabled[0]&&h.api.state().outputPlaying,'started did not mute');h.event('output_audio_buffer.stopped',{response_id:'r1'});expect(h.api.state().micEnabled[0]&&!h.api.assistantBusy(),'stopped did not unmute');
  });
  await check('late old stopped does not unmute a newer response',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});h.event('response.done',{response:audioResponse('r1')});h.event('output_audio_buffer.stopped',{response_id:'r1'});h.event('response.created',{response:{id:'r2'}});h.event('output_audio_buffer.started',{response_id:'r2'});h.event('response.done',{response:audioResponse('r2')});h.event('output_audio_buffer.stopped',{response_id:'r1'});expect(!h.api.state().micEnabled[0]&&h.api.state().playbackResponseId==='r2'&&h.api.state().outputPlaying,'old stopped unlocked newer audio');
  });
  for(const order of ['clear-then-done','done-then-clear'])await check(`actual cancellation barrier ${order}`,async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});h.api.interrupt();
    expect(h.api.state().clearingOutput&&h.api.state().clearingResponseId==='r1'&&h.api.state().cancelAwaitIds.includes('r1')&&!h.api.state().micEnabled[0],'interrupt missing cancellation barrier');
    const tail=h.logs.sent.slice(-3);expect(tail[0].type==='response.cancel'&&tail[1].type==='output_audio_buffer.clear','cancel/clear order incorrect');
    h.event('input_audio_buffer.speech_started');expect(!h.api.state().inputSpeaking&&h.api.state().interruptedTurn,'speech crossed cancel barrier');
    h.event('output_audio_buffer.cleared',{response_id:'wrong'});h.event('response.done',{response:{id:'wrong',status:'cancelled',output:[]}});expect(!h.api.state().micEnabled[0]&&h.api.state().clearingOutput&&h.api.state().cancelAwaitIds.includes('r1'),'wrong acknowledgments released barrier');
    const done=()=>h.event('response.done',{response:{id:'r1',status:'cancelled',output:[]}}),clear=()=>h.event('output_audio_buffer.cleared',{response_id:'r1'});
    (order==='clear-then-done'?clear:done)();expect(!h.api.state().micEnabled[0],'first acknowledgment released microphone too soon');(order==='clear-then-done'?done:clear)();expect(h.api.state().micEnabled[0]&&!h.api.assistantBusy(),'both acknowledgments did not unmute');
    h.event('input_audio_buffer.speech_started');expect(h.api.state().inputSpeaking&&!h.api.state().interruptedTurn,'new speech did not reset interruption after barrier');
  });
  await check('interrupt before response.created hidden and direct call is no-op',async()=>{
    const h=harness();await h.connect();h.event('input_audio_buffer.speech_started');h.event('input_audio_buffer.speech_stopped');
    expect(!h.api.canInterrupt()&&h.nodes.get('#agent-interrupt').hidden,'pre-created control visible');const before=JSON.stringify(h.api.state()),sent=h.logs.sent.length;h.api.interrupt();expect(JSON.stringify(h.api.state())===before&&h.logs.sent.length===sent,'direct pre-created interrupt was not no-op');
    h.event('response.created',{response:{id:'r1'}});expect(h.api.canInterrupt()&&!h.nodes.get('#agent-interrupt').hidden&&h.api.state().activeResponseId==='r1','later normal response not accepted');
    h.api.toggleVoice();expect(!h.api.state().voiceActive&&h.logs.streams.at(-1).getTracks()[0].stopped,'main mic toggle did not release voice');
  });
  await check('old cleared cannot release newer cancellation barrier',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});h.api.interrupt();h.event('output_audio_buffer.cleared',{response_id:'r1'});h.event('response.done',{response:{id:'r1',status:'cancelled',output:[]}});
    h.event('input_audio_buffer.speech_started');h.event('input_audio_buffer.speech_stopped');h.event('response.created',{response:{id:'r2'}});h.event('output_audio_buffer.started',{response_id:'r2'});h.api.interrupt();
    expect(h.api.state().clearingResponseId==='r2'&&h.api.state().cancelAwaitIds.includes('r2'),'second cancel missing barrier');h.event('output_audio_buffer.cleared',{response_id:'r1'});expect(h.api.state().clearingOutput&&!h.api.state().micEnabled[0],'old cleared unlocked pending clear of r2');
    h.event('response.done',{response:{id:'r2',status:'cancelled',output:[]}});expect(!h.api.state().micEnabled[0],'r2 done unmuted before matching clear');h.event('output_audio_buffer.cleared',{response_id:'r2'});expect(h.api.state().micEnabled[0],'r2 clear did not release gate');
  });
  for(const kind of ['typed','speech'])await check(`new ${kind} voice turn resets previous completed active id`,async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});h.event('response.done',{response:audioResponse('r1')});h.event('output_audio_buffer.stopped',{response_id:'r1'});
    if(kind==='typed')await h.api.sendMessage('Новый вопрос');else{h.event('input_audio_buffer.speech_started');h.event('input_audio_buffer.speech_stopped');}
    expect(h.api.state().activeResponseId===null&&!h.api.canInterrupt()&&h.nodes.get('#agent-interrupt').hidden,'new turn retained interrupt target r1');
    h.event('response.created',{response:{id:'r2'}});h.api.interrupt();expect(h.logs.sent.at(-3).response_id==='r2'&&h.api.state().cancelAwaitIds.includes('r2'),'new turn cancel did not target r2');
    h.event('response.done',{response:{id:'r2',status:'cancelled',output:[]}});expect(h.api.state().micEnabled[0],'cancel before audio did not unlock after done');
  });
  await check('mobile focus alone inline; viewport shrink typing; restored inline',async()=>{
    const h=harness();h.api.open({mode:'text'});const panel=h.nodes.get('#agent-panel'),input=h.nodes.get('#agent-input');input.focus();h.api.updateViewport();expect(!panel.classList.contains('is-typing'),'focus without shrink entered typing');
    h.win.visualViewport.height=520;h.win.visualViewport.offsetTop=14;h.api.updateViewport();expect(panel.classList.contains('is-typing'),'keyboard shrink did not enter typing');expect(panel.style['--agent-viewport-height']==='520px'&&panel.style['--agent-viewport-top']==='14px','viewport CSS variables wrong');
    h.win.visualViewport.height=844;h.win.visualViewport.offsetTop=0;h.api.updateViewport();expect(!panel.classList.contains('is-typing')&&h.api.state().presentation==='inline','restored viewport did not return inline');
  });
  await check('observer collapses only after seen; typing suppresses collapse; resume resets seen',async()=>{
    const h=harness();h.api.open({mode:'text'});const observer=h.logs.observers.find(x=>x.target===h.nodes.get('.hero-orb-button'));expect(h.api.state().presentation==='inline','initial open not inline');
    observer.callback([{isIntersecting:true}]);h.nodes.get('#agent-input').focus();h.win.visualViewport.height=520;h.api.updateViewport();observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='inline','keyboard typing triggered collapse');
    h.win.visualViewport.height=844;h.api.updateViewport();observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='dock'&&h.api.state().sessionActive,'seen workspace did not collapse');
    h.api.open({mode:'text'});observer.callback([{isIntersecting:true}]);observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='dock','resumed observer no longer collapses');
  });
  for(const kind of ['typed','speech','tool'])await check(`stale done preserves pending ${kind} new response before created`,async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});
    if(kind==='tool')h.event('response.function_call_arguments.done',{response_id:'r1',name:'show_section',call_id:'call1',arguments:'{"section_id":"cases"}'});
    h.event('response.done',{response:{id:'r1',status:'completed',output:[]}});
    if(kind==='typed')await h.api.sendMessage('Новый вопрос');else if(kind==='speech'){h.event('input_audio_buffer.speech_started');h.event('input_audio_buffer.speech_stopped');}
    expect(h.api.state().awaitingReply&&h.api.state().activeResponseId===null&&!h.api.state().micEnabled[0],'new turn not awaiting muted');const before=JSON.stringify(h.api.state());h.event('response.done',{response:{id:'r1',status:'completed',output:[]}});expect(JSON.stringify(h.api.state())===before,'stale done modified new awaiting response');h.event('response.created',{response:{id:'r2'}});expect(h.api.state().activeResponseId==='r2'&&h.api.state().responseInFlight,'fresh response not accepted');
  });
  await check('actual case actor collapses voice into dock; resume preserves conversation',async()=>{
    const h=harness(),app=installActor(h);await h.connect();const generation=h.api.state().voiceGeneration,caseId=app.site.cases[0].id;await h.api.sendMessage('Покажи кейс');h.event('response.created',{response:{id:'tool1'}});
    h.event('response.function_call_arguments.done',{response_id:'tool1',name:'show_case',call_id:'call1',arguments:JSON.stringify({case_id:caseId})});
    expect(app.location.pathname===`/cases/${caseId}`&&app.actor.getContext().active_case===caseId,'actor did not navigate to actual case');expect(h.api.state().presentation==='dock'&&h.api.state().sessionActive&&h.api.state().voiceActive,'case navigation ended live session');expect(h.nodes.get('#home-view').hidden&&!h.nodes.get('#case-view').hidden&&h.nodes.get('#case-view').innerHTML.includes(app.site.cases[0].title),'actual case page not rendered');expect(h.doc.activeElement.tagName==='H1','case focus not heading');
    h.event('response.done',{response:{id:'tool1',status:'completed',output:[]}});expect(h.api.state().awaitingReply&&!h.api.state().micEnabled[0],'tool confirmation not gated');h.event('response.done',{response:{id:'tool1',status:'completed',output:[]}});expect(h.api.state().awaitingReply,'duplicate tool done cancelled continuation');h.event('response.created',{response:{id:'reply2'}});h.event('output_audio_buffer.started',{response_id:'reply2'});h.event('response.done',{response:audioResponse('reply2')});h.event('output_audio_buffer.stopped',{response_id:'reply2'});
    h.resume();expect(app.location.pathname===`/cases/${caseId}`&&h.nodes.get('#home-view').hidden&&!h.nodes.get('#case-view').hidden,'local resume changed case route');expect(h.api.state().presentation==='overlay'&&h.api.state().voiceGeneration===generation&&h.api.state().history.length===1,'resume restarted or cleared conversation');
  });
  await check('section and experience actors collapse while preserving session',async()=>{
    const h=harness(),app=installActor(h);await h.connect();app.actor.executeSiteAction('show_section','research');expect(h.api.state().presentation==='dock'&&h.api.state().voiceActive&&app.actor.getContext().visible_section==='research','section action contract broken');expect(h.nodes.get('#research').scrolled&&h.doc.activeElement.tagName==='H2','section focus/scroll wrong');h.api.open({mode:'text'});const id=app.site.experience[0].id;app.actor.executeSiteAction('show_experience',id);expect(h.api.state().presentation==='dock'&&h.api.state().sessionActive&&h.nodes.get('#'+id).scrolled&&h.doc.activeElement.tagName==='H2','experience actor contract broken');
  });
  await check('prepare_contact fills textarea and input event only; no submit and no keyboard focus',async()=>{
    const h=harness(),app=installActor(h);await h.connect();const form=h.nodes.get('#contact-form');let inputEvents=0,submitEvents=0;form.addEventListener('input',()=>inputEvents++);form.addEventListener('submit',()=>submitEvents++);const requestCount=h.logs.requests.length;const result=app.actor.executeSiteAction('prepare_contact_request','','Описание моей задачи');
    expect(result.ok&&result.draftPrepared&&h.nodes.get('#contact-form textarea').value==='Описание моей задачи','draft not prepared');expect(inputEvents===1&&submitEvents===0&&h.logs.requests.length===requestCount,'prepare_contact submitted or requested network');expect(h.doc.activeElement!==app.contactInput&&h.doc.activeElement.tagName==='H2','contact action opened keyboard input');expect(h.api.state().presentation==='dock'&&h.api.state().voiceActive&&h.api.state().sessionActive,'contact action ended conversation');
  });
  await check('mode separation: text explicit, voice default and write stops microphone',async()=>{
    const h=harness();h.api.open({mode:'text'});expect(h.api.state().mode==='text'&&h.nodes.get('#agent-panel').dataset.mode==='text'&&h.nodes.get('#voice-panel').hidden&&!h.nodes.get('#agent-messages').hidden,'explicit text mode not shown');expect(!h.logs.streams.length,'text open captured microphone');
    h.api.close();h.api.open();await tick();const peer=h.logs.peers.at(-1);expect(peer&&h.api.state().mode==='voice'&&h.nodes.get('#agent-panel').dataset.mode==='voice'&&!h.nodes.get('#voice-panel').hidden&&h.nodes.get('#agent-messages').hidden,'default voice mode not shown/autostarted');peer.channel.readyState='open';peer.channel.onopen();
    h.nodes.get('#agent-to-text').listeners.click[0]();expect(h.api.state().mode==='text'&&!h.api.state().voiceActive&&h.logs.streams.at(-1).getTracks()[0].stopped,'write transition leaked microphone');expect(h.doc.activeElement===h.nodes.get('#agent-input')&&!h.nodes.get('#agent-messages').hidden&&h.nodes.get('#voice-panel').hidden,'write transition did not show input');
  });
  await check('dock resume opens local overlay without scrolling or resetting text',async()=>{
    const h=harness();h.win.scrollY=900;h.api.open({mode:'text',local:true});h.nodes.get('#agent-input').value='Черновик';h.api.collapse();const generation=h.api.state().conversationGeneration;h.nodes.get('#agent-resume').focus();h.resume();
    expect(h.api.state().presentation==='overlay'&&h.nodes.get('#agent-panel').parentNode===h.nodes.get('#agent-overlay')&&!h.nodes.get('#agent-overlay').hidden,'resume not local overlay');expect(h.win.scrollY===900&&!h.nodes.get('.hero-art').scrolled,'resume scrolled to hero');expect(h.nodes.get('#agent-input').value==='Черновик'&&h.api.state().conversationGeneration===generation,'resume cleared draft/session');expect(h.doc.body.classList.contains('agent-engaged')&&!h.nodes.get('.hero-art').classList.contains('is-agent-active'),'local overlay left active hero orb');
  });
  await check('overlay keyboard keeps same host and clears typing on viewport restore',async()=>{
    const h=harness();h.api.open({mode:'text',local:true});h.nodes.get('#agent-input').focus();h.api.updateViewport();expect(!h.nodes.get('#agent-panel').classList.contains('is-typing'),'focus alone fullscreen');h.win.visualViewport.height=420;h.win.visualViewport.offsetTop=12;h.api.updateViewport();expect(h.nodes.get('#agent-panel').classList.contains('is-typing')&&h.nodes.get('#agent-panel').parentNode===h.nodes.get('#agent-overlay'),'keyboard lost local host');h.win.visualViewport.height=844;h.api.updateViewport();expect(!h.nodes.get('#agent-panel').classList.contains('is-typing')&&h.api.state().presentation==='overlay','keyboard restore lost local overlay');
  });
  await check('dock mic is actual on/off control and preserves conversation',async()=>{
    const h=harness();const {track}=await h.connect();h.api.collapse();h.nodes.get('#agent-dock-voice').listeners.click[0]();expect(!h.api.state().voiceActive&&track.stopped&&h.api.state().sessionActive&&h.api.state().presentation==='dock','dock mic off ended conversation');expect(h.nodes.get('#agent-dock').dataset.mic==='off'&&h.nodes.get('#agent-dock-voice').getAttribute('aria-pressed')==='false','off state mismatch');h.nodes.get('#agent-dock-voice').listeners.click[0]();await tick();const peer=h.logs.peers.at(-1);peer.channel.readyState='open';peer.channel.onopen();expect(h.api.state().voiceActive&&h.api.state().presentation==='dock'&&h.nodes.get('#agent-dock').dataset.mic==='listening'&&h.nodes.get('#agent-dock-voice').getAttribute('aria-pressed')==='true','dock mic on not listening');
  });
  await check('transient disconnect pauses track and recovers same peer',async()=>{
    const h=harness();const {peer,track}=await h.connect();const generation=h.api.state().voiceGeneration;peer.connectionState='disconnected';peer.onconnectionstatechange();expect(h.api.state().voiceActive&&!track.enabled&&!track.stopped&&!peer.closed,'disconnect instantly closed media');expect(h.nodes.get('#agent-dock').dataset.mic==='paused'&&h.nodes.get('#agent-dock-state').textContent.includes('Восстанавливаю'),'disconnect not visibly paused');const timer=[...h.logs.timers.values()].find(t=>t.ms===8000&&!t.interval);expect(Boolean(timer),'recovery timer missing');peer.connectionState='connected';peer.onconnectionstatechange();expect(track.enabled&&h.api.state().voiceGeneration===generation&&h.api.getAgentDiagnostics().recoveries===1,'connected did not recover same session');expect(![...h.logs.timers.values()].some(t=>t.ms===8000&&!t.interval),'recovery timer retained');
  });
  await check('expired disconnect releases media and enables reconnect control',async()=>{
    const h=harness();const {peer,track}=await h.connect();peer.connectionState='disconnected';peer.onconnectionstatechange();const timer=[...h.logs.timers.values()].find(t=>t.ms===8000&&!t.interval);timer.callback();expect(!h.api.state().voiceActive&&track.stopped&&peer.closed&&h.api.state().sessionActive,'recovery expiry leaked media/closed conversation');expect(h.nodes.get('#agent-dock').dataset.mic==='off'&&h.nodes.get('#agent-voice-stop').textContent==='Включить микрофон','expiry control not reset');expect(h.api.state().error.includes('Соединение прервалось'),'expiry error absent');
  });
  await check('hero reentry restores inline without scrolling or resetting mode',async()=>{
    const h=harness();h.api.open({mode:'text'});const generation=h.api.state().conversationGeneration,observer=h.logs.observers.find(x=>x.target===h.nodes.get('.hero-orb-button'));observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='dock','hero exit did not dock');h.win.scrollY=0;observer.callback([{isIntersecting:true}]);expect(h.api.state().presentation==='inline'&&h.nodes.get('.hero-art').classList.contains('is-agent-active'),'hero reentry did not restore inline');expect(h.api.state().conversationGeneration===generation&&h.api.state().mode==='text'&&h.win.scrollY===0,'reentry reset or scrolled');
  });
  await check('contact flow partial drafts preserve fields; cancel keeps draft; career action exists',async()=>{
    const h=harness(),app=installActor(h);h.api.open({mode:'text'});const a=app.actor.executeSiteAction('begin_contact_request');expect(a.contact_request,'begin contact flow absent');app.actor.executeSiteAction('prepare_contact_request','','Описание',{name:'Тест',contact:'@example'});app.actor.executeSiteAction('prepare_contact_request','','Уточнённая задача',{});const ctx=app.actor.getContext();expect(ctx.contact_draft.name==='Тест'&&ctx.contact_draft.contact==='@example'&&ctx.contact_draft.message==='Уточнённая задача','partial draft cleared fields');app.actor.executeSiteAction('cancel_contact_request');expect(!app.actor.getContext().contact_request&&!('contact_draft' in app.actor.getContext())&&h.nodes.get('#contact-form [name=name]').value==='Тест','cancel cleared draft or exposed inactive draft');const career=app.site.career.find(x=>x.id);const result=app.actor.executeSiteAction('show_career',career.id);expect(result.ok&&h.nodes.get('#career-'+career.id).scrolled,'career action unavailable');
  });
  await check('voice context switches to interview and restores normal instructions',async()=>{
    const h=harness();await h.connect();h.event('session.created',{session:{instructions:'Original website helper instructions'}});
    h.win.dispatchEvent(new h.context.CustomEvent('site-context',{detail:{contact_request:true,contact_missing:['contact','message'],contact_draft:{name:'Тест',contact:'',message:''}}}));
    const active=h.logs.sent.filter(e=>e.type==='session.update').at(-1);expect(active.session.instructions.includes('Сейчас помогаешь составить контактный запрос')&&active.session.instructions.includes('Тест'),'voice interview instructions absent');
    h.win.dispatchEvent(new h.context.CustomEvent('site-context',{detail:{contact_request:false}}));
    expect(h.logs.sent.filter(e=>e.type==='session.update').at(-1).session.instructions==='Original website helper instructions','normal voice instructions not restored');
  });
  await check('contact rejects long field atomically and preserves previous draft',async()=>{
    const h=harness(),app=installActor(h);app.actor.executeSiteAction('prepare_contact_request','','Задача',{name:'Тест',contact:'@example'});
    let rejected=false;try{app.actor.executeSiteAction('prepare_contact_request','','',{name:'Новый',contact:'x'.repeat(181)});}catch{rejected=true;}
    expect(rejected&&app.actor.getContext().contact_draft.name==='Тест','invalid partial update changed an earlier field');
  });
  await tick();
  console.log(JSON.stringify({source:sourcePath,sha256:crypto.createHash('sha256').update(source).digest('hex'),node:process.version,results},null,2));
  process.exitCode=results.some(x=>!x.ok)?1:0;
})().catch(error=>{console.error(error);process.exitCode=2;});
