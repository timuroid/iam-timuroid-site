const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sourcePath = require('node:path').resolve(__dirname,'../public/agent.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = source.replace(/^import .*?;\s*$/gm, '').replace(/^export\s+/gm, '') + `\n;globalThis.probe = {isOpen,open,close,collapse,startVoice,stopVoice,sendMessage,onVoiceEvent,voiceBusy,assistantBusy,updateViewport,toggleVoice,setVoiceEnabled,getAgentDiagnostics,state:()=>({mode,sessionActive,presentation,pending,conversationGeneration,textTurns,voiceGeneration,voiceActive,connecting,inputSpeaking,awaitingReply,responseInFlight,activeResponseId,outputPlaying,outputExpected,playbackResponseId,queuedVoiceTurns:[...pendingVoiceTurns],continuationPending,history:history.map(x=>({...x})),audioResponses:[...audioResponses],finishedAudioResponses:[...finishedAudioResponses],micEnabled:mic?.getAudioTracks().map(t=>t.enabled)??[],messages:messages.children.map(n=>n.textContent),error:document.querySelector('#agent-error').textContent})};`;

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
  querySelector(selector) { if(selector==='h1,h2,h3'||selector==='h1,h2')return this.children.find(n=>selector.split(',').includes(n.tagName.toLowerCase()))??null; if(selector==='button[type=submit]')return this.children.find(n=>n.tagName==='BUTTON')??null; if(selector==='[name=consent]')return this.children.find(n=>n.name==='consent')??null; if(selector==='svg'){if(!this.svg)this.svg=new Element('svg',this.ownerDocument);return this.svg;} return this.querySelectorAll(selector)[0]??null; }
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
function harness({nativeControls=false}={}){
  const doc={hidden:false,activeElement:null,createElement:tag=>new Element(tag,doc)};
  doc.body=new Element('body',doc);doc.activeElement=doc.body;
  const nodes=new Map();
  const buttons=new Set(['#agent-send','#agent-voice-toggle','#agent-interrupt','#agent-dock-voice','#agent-resume','#agent-voice-stop','#agent-to-text','.close-agent','.hero-orb-button']);
  for(const selector of ['#agent-panel','#agent-home-space','#agent-overlay','#agent-dock','.hero-art','.hero-orb-button','.agent-entry-actions','#home-view','#agent-messages','#agent-input','#agent-send','#agent-suggestions','#agent-voice-toggle','#agent-interrupt','#voice-panel','#voice-status','#voice-caption','#agent-voice-stop','#agent-to-text','#agent-dock-voice','#agent-state','#agent-dock-state','#agent-dock-label','#agent-title','#agent-resume','#agent-error','#agent-form','.close-agent','[data-live-orb=hero]','[data-live-orb=focus]','[data-live-orb=dock]'])nodes.set(selector,new Element(selector==='#agent-input'?'input':buttons.has(selector)?'button':selector.startsWith('[data-live-orb')?'canvas':'div',doc));
  nodes.get('#agent-error').hidden=true;
  for(const selector of ['#agent-messages','#agent-input','#agent-form','#agent-suggestions','#agent-voice-toggle','#agent-interrupt','#voice-panel','#voice-status','#voice-caption','#agent-voice-stop','#agent-to-text','#agent-state','#agent-title','.close-agent'])nodes.get('#agent-panel').append(nodes.get(selector));
  nodes.get('#agent-dock').append(nodes.get('#agent-resume'),nodes.get('#agent-dock-voice'));
  nodes.get('#agent-resume').append(nodes.get('[data-live-orb=dock]'),nodes.get('#agent-dock-label'),nodes.get('#agent-dock-state'));
  nodes.get('.hero-orb-button').append(nodes.get('[data-live-orb=hero]'));
  nodes.get('.hero-art').append(nodes.get('.hero-orb-button'),nodes.get('#agent-home-space'));
  nodes.get('#agent-home-space').append(nodes.get('.agent-entry-actions'));
  nodes.get('#agent-overlay').append(nodes.get('[data-live-orb=focus]'),nodes.get('#agent-panel'));
  nodes.get('#home-view').append(nodes.get('.hero-art'));
  doc.body.append(nodes.get('#home-view'),nodes.get('#agent-overlay'),nodes.get('#agent-dock'));
  doc.querySelector=selector=>selector==='.audio-unlock'?doc.body.querySelector(selector):nodes.get(selector)??null;
  const logs={sent:[],requests:[],peers:[],streams:[],orb:[],orbText:[],actions:[],observers:[],timers:new Map()};
  let timerId=0;
  const win={scrollY:0,scrollX:0,visualViewport:{height:844,offsetTop:0,addEventListener(){}},listeners:{},addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);},dispatchEvent(event){this.listeners[event.type]?.forEach(fn=>fn(event));}};
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
    if(url==='/api/agent-context')return Promise.resolve({ok:true,json:async()=>({instructions:'Interview '+options.body})});
    if(url==='/api/realtime'){logs.requests.push({url,options});return Promise.resolve({ok:true,text:async()=> 'mock-answer'});}
    const d=deferred();const request={url,options,...d};logs.requests.push(request);return d.promise;
  }
  const context=vm.createContext({document:doc,window:win,navigator,RTCPeerConnection:Peer,MediaStream:class{constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks;}},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},AbortController,AbortSignal,Float32Array,Set,Map,JSON,Math,String,Boolean,Promise,console,innerWidth:390,innerHeight:844,matchMedia:()=>({matches:false}),performance:{now:()=>0},queueMicrotask,requestAnimationFrame:callback=>{callback();return 1;},setTimeout:(callback,ms)=>{const id=++timerId;logs.timers.set(id,{callback,ms});return id;},clearTimeout:id=>logs.timers.delete(id),setInterval:(callback,ms)=>{const id=++timerId;logs.timers.set(id,{callback,ms,interval:true});return id;},clearInterval:id=>logs.timers.delete(id),IntersectionObserver:class{constructor(callback){this.callback=callback;logs.observers.push(this);}observe(target){this.target=target;}},recordInterviewMessage:()=>{},getContext:()=>({section:'hero'}),executeSiteAction:(...args)=>{logs.actions.push(args);return {ok:true};},revealAgentHome:()=>{},setOrbState:state=>logs.orb.push(state),setOrbLevel:()=>{},setOrbAudioReader:()=>{},feedOrbText:(text,options)=>logs.orbText.push({text,...options}),clearOrbText:()=>{logs.orbText.length=0;},refreshOrbs:()=>{},requestHaptic:()=>{},mountNativeHapticToggle:control=>{if(!nativeControls)return null;const native=new Element('input',doc);control.append(native);control.native=native;return native;}});
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
  const contactInput=new Element('input',h.doc);h.nodes.get('#contact').append(contactInput);for(const name of ['name','contact','message','consent','process','goal','constraints']){const node=name==='name'?contactInput:new Element(name==='message'?'textarea':'input',h.doc);h.nodes.set('#contact-form [name='+name+']',node);h.nodes.get('#contact-form').append(node);if(name==='message')h.nodes.set('#contact-form textarea',node);}
  const submit=new Element('button',h.doc),status=new Element('p',h.doc);status.className='form-status';h.nodes.get('#contact-form').append(submit,status);
  h.doc.getElementById=id=>h.nodes.get('#'+id)??null;
  let current=new URL('https://example.test/');const location={};for(const key of ['pathname','hash','href','origin'])Object.defineProperty(location,key,{get:()=>current[key]});
  const browserHistory={state:{},replaceState(state,title,path){this.state=state;if(path)current=new URL(path,current);},pushState(state,title,path){this.state=state;current=new URL(path,current);}};
  h.win.scrollY=0;h.win.scrollTo=({top})=>{h.win.scrollY=top;};
  const ctx=vm.createContext({document:h.doc,window:h.win,location,history:browserHistory,siteFixture:site,agentFixture:h.api,crypto,innerWidth:390,URL,Event,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout:()=>{},refreshOrbs:()=>{},activateOrb:()=>{},console});
  const prefix=`const site=siteFixture; const agentModule=agentFixture; const $=(s,root=document)=>root.querySelector(s); const escape=value=>String(value??''); const reduced={matches:false}; const state={section:'home',caseId:null,page:location.pathname}; let contactFlow=false; const interviewMessages=[]; const arrow=''; let toastTimer;`+take('export function recordInterviewMessage(', '\n').replace('export ','');
  const selected=prefix+take('function visual(', 'function renderCases(')+take('function casePage(', "document.addEventListener('click'")+take('function contactContext()', 'const form=')+take('const form=',"form.addEventListener('submit'");
  vm.runInContext(selected.replace(/^export\s+/gm,''),ctx,{filename:appPath});vm.runInContext('globalThis.actor={executeSiteAction,getContext,navigate,renderRoute,focusDestination,recordInterviewMessage,interviewTranscript:()=>interviewMessages.map(x=>({...x})),formState:()=>({requestId,submitted})};',ctx);
  h.context.executeSiteAction=ctx.actor.executeSiteAction;
  h.context.recordInterviewMessage=ctx.actor.recordInterviewMessage;
  return {actor:ctx.actor,site,location,contactInput,ctx,submit,status,appSha:crypto.createHash('sha256').update(app).digest('hex')};
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
  await check('microphone remains enabled during generation and playback',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});expect(h.api.state().micEnabled[0],'created did not mute');h.event('response.done',{response:audioResponse('r1')});expect(h.api.state().micEnabled[0]&&h.api.state().outputExpected,'generation done unmuted before audio');h.event('output_audio_buffer.started',{response_id:'r1'});expect(h.api.state().micEnabled[0]&&h.api.state().outputPlaying,'started did not mute');h.event('output_audio_buffer.stopped',{response_id:'r1'});expect(h.api.state().micEnabled[0]&&!h.api.assistantBusy(),'stopped did not unmute');
  });
  await check('late old stopped does not release a newer output',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});h.event('response.done',{response:audioResponse('r1')});h.event('output_audio_buffer.stopped',{response_id:'r1'});h.event('response.created',{response:{id:'r2'}});h.event('output_audio_buffer.started',{response_id:'r2'});h.event('response.done',{response:audioResponse('r2')});h.event('output_audio_buffer.stopped',{response_id:'r1'});expect(h.api.state().micEnabled[0]&&h.api.state().playbackResponseId==='r2'&&h.api.state().outputPlaying,'old stopped unlocked newer audio');
  });
  await check('speech while agent speaks is queued until audio finishes',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});
    h.event('input_audio_buffer.speech_started');expect(h.api.state().inputSpeaking&&h.api.state().micEnabled[0],'overlapping user speech ignored');
    h.event('input_audio_buffer.speech_stopped');h.event('input_audio_buffer.committed',{item_id:'u1'});
    expect(!h.logs.sent.some(e=>e.type==='response.create'||e.type==='response.cancel'||e.type==='output_audio_buffer.clear'),'overlap interrupted or answered early');
    h.event('response.done',{response:audioResponse('r1')});expect(!h.logs.sent.some(e=>e.type==='response.create'),'generation done answered before playback');
    h.event('output_audio_buffer.stopped',{response_id:'r1'});expect(h.logs.sent.filter(e=>e.type==='response.create').length===1,'queued turn not answered after output');
    h.event('input_audio_buffer.committed',{item_id:'u1'});expect(h.api.state().queuedVoiceTurns.length===0,'duplicate commit requeued old turn');
  });
  await check('output finishing during new speech waits for that speech commit',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});
    h.event('input_audio_buffer.speech_started');h.event('response.done',{response:audioResponse('r1')});h.event('output_audio_buffer.stopped',{response_id:'r1'});
    expect(!h.logs.sent.some(e=>e.type==='response.create'),'responded while visitor was speaking');h.event('input_audio_buffer.speech_stopped');h.event('input_audio_buffer.committed',{item_id:'u2'});
    expect(h.logs.sent.filter(e=>e.type==='response.create').length===1,'speech completion did not request response');
  });
  await check('multiple overlapping commits are combined into one next response',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});h.event('output_audio_buffer.started',{response_id:'r1'});
    for(const id of ['u1','u2']){h.event('input_audio_buffer.speech_started');h.event('input_audio_buffer.speech_stopped');h.event('input_audio_buffer.committed',{item_id:id});}
    h.event('response.done',{response:audioResponse('r1')});h.event('output_audio_buffer.stopped',{response_id:'r1'});
    expect(h.logs.sent.filter(e=>e.type==='response.create').length===1&&h.api.state().queuedVoiceTurns.length===0,'queued speech produced competing responses');
  });
  await check('voice screen has no interrupt control or transcript scroller',async()=>{
    const html=fs.readFileSync(sourcePath.replace('agent.js','index.html'),'utf8'),css=fs.readFileSync(sourcePath.replace('agent.js','styles.css'),'utf8');
    expect(!html.includes('agent-interrupt'),'interrupt button remains');expect(!/#voice-caption\{[^}]*overflow:auto/.test(css),'voice transcript scroll remains');
    const h=harness();await h.connect();h.event('response.output_audio_transcript.done',{response_id:'r1',transcript:'A very long spoken answer'});
    expect(!h.nodes.get('#voice-caption').textContent.includes('A very long'),'transcript rendered in voice mode');expect(h.api.state().history.at(-1).content==='A very long spoken answer','transcript lost from chat history');
  });
  await check('mobile chat focus alone stays local; viewport shrink typing; restored local',async()=>{
    const h=harness();h.api.open({mode:'text'});const panel=h.nodes.get('#agent-panel'),input=h.nodes.get('#agent-input');input.focus();h.api.updateViewport();expect(!panel.classList.contains('is-typing'),'focus without shrink entered typing');
    h.win.visualViewport.height=520;h.win.visualViewport.offsetTop=14;h.api.updateViewport();expect(panel.classList.contains('is-typing'),'keyboard shrink did not enter typing');expect(h.nodes.get('#agent-overlay').style['--agent-viewport-height']==='520px'&&h.nodes.get('#agent-overlay').style['--agent-viewport-top']==='14px','viewport CSS variables wrong');
    h.win.visualViewport.height=844;h.win.visualViewport.offsetTop=0;h.api.updateViewport();expect(!panel.classList.contains('is-typing')&&h.api.state().presentation==='overlay','restored viewport did not return local sheet');
  });
  await check('observer collapses only after seen; typing suppresses collapse; resume resets seen',async()=>{
    const h=harness();h.api.open({mode:'voice',activate:false});const observer=h.logs.observers.find(x=>x.target===h.nodes.get('.hero-art'));expect(h.api.state().presentation==='inline','initial open not inline');
    observer.callback([{isIntersecting:true}]);h.nodes.get('#agent-input').focus();h.win.visualViewport.height=520;h.api.updateViewport();observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='inline','keyboard typing triggered collapse');
    h.win.visualViewport.height=844;h.api.updateViewport();observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='dock'&&h.api.state().sessionActive,'seen workspace did not collapse');
    h.api.open({mode:'voice',activate:false});observer.callback([{isIntersecting:true}]);observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='dock','resumed observer no longer collapses');
  });
  for(const kind of ['typed','speech','tool'])await check(`stale done preserves pending ${kind} new response before created`,async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'r1'}});
    if(kind==='tool')h.event('response.function_call_arguments.done',{response_id:'r1',name:'show_section',call_id:'call1',arguments:'{"section_id":"cases"}'});
    h.event('response.done',{response:{id:'r1',status:'completed',output:[]}});
    if(kind==='typed')await h.api.sendMessage('Новый вопрос');else if(kind==='speech'){h.event('input_audio_buffer.speech_started');h.event('input_audio_buffer.speech_stopped');h.event('input_audio_buffer.committed',{item_id:'fresh'});}
    expect(h.api.state().awaitingReply&&h.api.state().activeResponseId===null&&h.api.state().micEnabled[0],'new turn not awaiting muted');const before=JSON.stringify(h.api.state());h.event('response.done',{response:{id:'r1',status:'completed',output:[]}});expect(JSON.stringify(h.api.state())===before,'stale done modified new awaiting response');h.event('response.created',{response:{id:'r2'}});expect(h.api.state().activeResponseId==='r2'&&h.api.state().responseInFlight,'fresh response not accepted');
  });
  await check('actual case actor collapses voice into dock; resume preserves conversation',async()=>{
    const h=harness(),app=installActor(h);await h.connect();const generation=h.api.state().voiceGeneration,caseId=app.site.cases[0].id;await h.api.sendMessage('Покажи кейс');h.event('response.created',{response:{id:'tool1'}});
    h.event('response.function_call_arguments.done',{response_id:'tool1',name:'show_case',call_id:'call1',arguments:JSON.stringify({case_id:caseId})});
    expect(app.location.pathname===`/cases/${caseId}`&&app.actor.getContext().active_case===caseId,'actor did not navigate to actual case');expect(h.api.state().presentation==='dock'&&h.api.state().sessionActive&&h.api.state().voiceActive,'case navigation ended live session');expect(h.nodes.get('#home-view').hidden&&!h.nodes.get('#case-view').hidden&&h.nodes.get('#case-view').innerHTML.includes(app.site.cases[0].title),'actual case page not rendered');expect(h.doc.activeElement.tagName==='H1','case focus not heading');
    h.event('response.done',{response:{id:'tool1',status:'completed',output:[]}});expect(h.api.state().awaitingReply&&h.api.state().micEnabled[0],'tool confirmation not gated');h.event('response.done',{response:{id:'tool1',status:'completed',output:[]}});expect(h.api.state().awaitingReply,'duplicate tool done cancelled continuation');h.event('response.created',{response:{id:'reply2'}});h.event('output_audio_buffer.started',{response_id:'reply2'});h.event('response.done',{response:audioResponse('reply2')});h.event('output_audio_buffer.stopped',{response_id:'reply2'});
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
    const h=harness();const {peer,track}=await h.connect();peer.connectionState='disconnected';peer.onconnectionstatechange();const timer=[...h.logs.timers.values()].find(t=>t.ms===8000&&!t.interval);timer.callback();expect(!h.api.state().voiceActive&&track.stopped&&peer.closed&&h.api.state().sessionActive,'recovery expiry leaked media/closed conversation');expect(h.nodes.get('#agent-dock').dataset.mic==='error'&&h.nodes.get('#agent-voice-stop').textContent==='Включить микрофон','expiry control not reset');expect(h.api.state().error.includes('Соединение прервалось'),'expiry error absent');
  });
  await check('hero reentry restores inline without scrolling or resetting mode',async()=>{
    const h=harness();h.api.open({mode:'voice',activate:false});const generation=h.api.state().conversationGeneration,observer=h.logs.observers.find(x=>x.target===h.nodes.get('.hero-art'));observer.callback([{isIntersecting:false}]);expect(h.api.state().presentation==='dock','hero exit did not dock');h.win.scrollY=0;observer.callback([{isIntersecting:true}]);expect(h.api.state().presentation==='inline'&&h.nodes.get('.hero-art').classList.contains('is-agent-active'),'hero reentry did not restore inline');expect(h.api.state().conversationGeneration===generation&&h.api.state().mode==='voice'&&h.win.scrollY===0,'reentry reset or scrolled');
  });
  await check('contact flow partial drafts preserve fields; cancel keeps draft; career action exists',async()=>{
    const h=harness(),app=installActor(h);h.api.open({mode:'text'});const a=app.actor.executeSiteAction('begin_contact_request');expect(a.contact_request,'begin contact flow absent');app.actor.executeSiteAction('prepare_contact_request','','Описание',{name:'Тест',contact:'@example'});app.actor.executeSiteAction('prepare_contact_request','','Уточнённая задача',{});const ctx=app.actor.getContext();expect(ctx.contact_draft.name==='Тест'&&ctx.contact_draft.contact==='@example'&&ctx.contact_draft.message==='Уточнённая задача','partial draft cleared fields');app.actor.executeSiteAction('cancel_contact_request');expect(!app.actor.getContext().contact_request&&!('contact_draft' in app.actor.getContext())&&h.nodes.get('#contact-form [name=name]').value==='Тест','cancel cleared draft or exposed inactive draft');const career=app.site.career.find(x=>x.id);const result=app.actor.executeSiteAction('show_career',career.id);expect(result.ok&&h.nodes.get('#career-'+career.id).scrolled,'career action unavailable');
  });
  await check('voice text fragments reach graph without showing a scrolling transcript',async()=>{
    const h=harness();await h.connect();h.event('response.created',{response:{id:'live-text'}});
    h.event('response.output_audio_transcript.delta',{response_id:'live-text',item_id:'reply-1',delta:'Разберём задачу'});
    h.event('conversation.item.input_audio_transcription.delta',{item_id:'input-1',delta:'Хочу сравнивать'});
    expect(h.logs.orbText.some(x=>x.role==='assistant'&&x.text==='Разберём задачу')&&h.logs.orbText.some(x=>x.role==='user'&&x.text==='Хочу сравнивать'),'real fragments not forwarded');
    const count=h.logs.orbText.length;h.event('response.output_audio_transcript.delta',{response_id:'old-response',item_id:'old',delta:'Old text'});expect(h.logs.orbText.length===count,'stale response painted tokens');
    expect(!h.nodes.get('#voice-caption').textContent.includes('Разберём'),'transcript exposed in voice caption');h.api.stopVoice();expect(h.logs.orbText.length===0,'stopped voice retained displayed tokens');
  });
  await check('voice context switches to interview and restores normal instructions',async()=>{
    const h=harness();await h.connect();h.event('session.created',{session:{instructions:'Original website helper instructions'}});
    h.win.dispatchEvent(new h.context.CustomEvent('site-context',{detail:{contact_request:true,contact_missing:['contact','message'],contact_draft:{name:'Тест',contact:'',message:''}}}));
    await tick();const active=h.logs.sent.filter(e=>e.type==='session.update').at(-1);expect(active.session.instructions.includes('Interview')&&active.session.instructions.includes('Тест')&&active.session.instructions.includes('Original website helper instructions'),'voice interview instructions or original knowledge absent');
    h.win.dispatchEvent(new h.context.CustomEvent('site-context',{detail:{contact_request:false}}));
    expect(h.logs.sent.filter(e=>e.type==='session.update').at(-1).session.instructions==='Original website helper instructions','normal voice instructions not restored');
  });
  await check('stable host and hysteresis prevent hero/dock oscillation',async()=>{
    const h=harness();h.api.open({mode:'voice',activate:false});const panel=h.nodes.get('#agent-panel'),host=panel.parentNode,hero=h.nodes.get('.hero-art'),foot=h.nodes.get('#agent-home-space');
    const children=[...hero.children];const observer=h.logs.observers.find(x=>x.target===hero);observer.callback([{isIntersecting:true,intersectionRatio:1}]);observer.callback([{isIntersecting:true,intersectionRatio:.1}]);
    expect(h.api.state().presentation==='dock','scroll exit did not dock');
    for(const ratio of [.2,.4,.65,.79,.6])observer.callback([{isIntersecting:true,intersectionRatio:ratio}]);
    expect(h.api.state().presentation==='dock','partial visibility oscillated to hero');
    observer.callback([{isIntersecting:true,intersectionRatio:.85}]);expect(h.api.state().presentation==='inline','fully visible stationary hero did not restore');
    for(const ratio of [.7,.5,.2])observer.callback([{isIntersecting:true,intersectionRatio:ratio}]);expect(h.api.state().presentation==='inline','hysteresis failed while moving away');
    h.api.collapse();observer.callback([{isIntersecting:true,intersectionRatio:1}]);expect(h.api.state().presentation==='dock','manual collapse instantly expanded again');h.resume();
    expect(panel.parentNode===host&&host===h.nodes.get('#agent-overlay'),'transition reparented panel');expect(hero.children.length===children.length&&hero.children.every((node,i)=>node===children[i])&&foot.parentNode===hero,'hero footprint nodes changed');
    expect(!source.includes('flight.animate')&&!source.includes('source.width')&&!source.includes('hero.insertBefore(panel'),'heavy canvas flight still present');
  });
  await check('native mic change applies desired state once and synchronizes every control',async()=>{
    const h=harness({nativeControls:true});h.api.open({mode:'voice',activate:false});const native=h.nodes.get('#agent-voice-stop').native;
    native.checked=true;native.dispatchEvent({type:'change'});await tick();const peer=h.logs.peers.at(-1);peer.channel.readyState='open';peer.channel.onopen();
    expect(h.api.state().voiceActive&&h.api.state().micEnabled[0],'native mic on not listening');native.dispatchEvent({type:'change'});await tick();expect(h.logs.peers.length===1&&h.api.state().voiceActive,'duplicate on event toggled off');
    expect(['#agent-voice-toggle','#agent-dock-voice','#agent-voice-stop'].every(id=>h.nodes.get(id).native.checked),'native controls not synchronized');
    native.checked=false;native.dispatchEvent({type:'change'});expect(!h.api.state().voiceActive&&h.logs.streams.at(-1).getTracks()[0].stopped,'native off leaked track');native.dispatchEvent({type:'change'});await tick();expect(h.logs.peers.length===1&&!h.api.state().connecting,'duplicate off event reconnected');
  });
  await check('voice stays active beyond five minutes with no application duration timer',async()=>{
    const h=harness();await h.connect();expect(![...h.logs.timers.values()].some(t=>!t.interval&&t.ms>=5*60*1000),'application ended voice after five minutes');expect(h.api.state().voiceActive,'active voice stopped');
  });
  await check('failed mic connection is visible in the collapsed dock and can retry',async()=>{
    const h=harness();h.api.open({mode:'voice',activate:false});h.api.collapse();const normal=h.context.fetch;h.context.fetch=async()=>({ok:false,json:async()=>({error:'Соединение временно недоступно'})});await h.api.startVoice();
    expect(!h.api.state().voiceActive&&!h.api.state().connecting&&h.logs.streams.at(-1).getTracks()[0].stopped,'failed start retained mic');expect(h.nodes.get('#agent-dock').dataset.mic==='error'&&h.nodes.get('#agent-dock-state').textContent.includes('повторить'),'dock hid failure as ordinary off');
    h.context.fetch=normal;await h.api.startVoice();const peer=h.logs.peers.at(-1);peer.channel.readyState='open';peer.channel.onopen();expect(h.api.state().voiceActive&&h.nodes.get('#agent-dock').dataset.mic==='listening'&&!h.api.state().error,'retry did not listen');
  });
  await check('clear contact draft empties fields and consent immediately without submit',async()=>{
    const h=harness(),app=installActor(h);h.api.open({mode:'text'});app.actor.executeSiteAction('prepare_contact_request','','Сравнение документов',{name:'Тест',contact:'@example'});h.nodes.get('#contact-form [name=consent]').checked=true;
    const form=h.nodes.get('#contact-form');let edits=0,submits=0;form.addEventListener('input',()=>edits++);form.addEventListener('submit',()=>submits++);const requests=h.logs.requests.length;
    const result=app.actor.executeSiteAction('clear_contact_request','all');expect(result.ok&&result.draftCleared==='all'&&result.scope==='draft','clear result absent');
    expect(['name','contact','message'].every(key=>h.nodes.get('#contact-form [name='+key+']').value==='')&&!h.nodes.get('#contact-form [name=consent]').checked,'fields or consent retained');expect(!app.actor.getContext().contact_request&&!('contact_draft' in app.actor.getContext()),'deleted draft retained in active context');expect(edits===1&&submits===0&&h.logs.requests.length===requests,'clear submitted or skipped lifecycle');
  });
  await check('clearing a draft resets actual submit lifecycle and stale status',async()=>{
    const h=harness(),app=installActor(h);app.actor.executeSiteAction('prepare_contact_request','','Описание',{name:'Тест',contact:'@example'});const old=app.actor.formState().requestId;
    vm.runInContext('submitted=true;form.dataset.submitted="true";',app.ctx);app.submit.disabled=true;app.submit.textContent='Сообщение отправлено';app.status.textContent='Спасибо! Сообщение сохранено.';
    app.actor.executeSiteAction('clear_contact_request','all');expect(!app.actor.formState().submitted&&app.actor.formState().requestId!==old,'clear retained submitted request identity');expect(!app.submit.disabled&&app.submit.textContent==='Отправить сообщение'&&!app.status.textContent,'clear retained old button or status');
  });
  await check('partial draft clearing preserves other fields and rejects unknown target atomically',async()=>{
    const h=harness(),app=installActor(h);app.actor.executeSiteAction('prepare_contact_request','','Сравнение документов',{name:'Тест',contact:'@example'});app.actor.executeSiteAction('clear_contact_request','contact');
    expect(h.nodes.get('#contact-form [name=name]').value==='Тест'&&h.nodes.get('#contact-form [name=message]').value==='Сравнение документов'&&h.nodes.get('#contact-form [name=contact]').value==='','partial clear erased other fields');
    let rejected=false;try{app.actor.executeSiteAction('clear_contact_request','database');}catch{rejected=true;}expect(rejected&&h.nodes.get('#contact-form [name=name]').value==='Тест','invalid target modified draft');
  });
  await check('real voice clear tool routes field and confirms without reopening interview',async()=>{
    const h=harness(),app=installActor(h);await h.connect();h.event('session.created',{session:{instructions:'Normal assistant instructions'}});app.actor.executeSiteAction('prepare_contact_request','','Сравнение документов',{name:'Тест',contact:'@example'});
    h.event('response.created',{response:{id:'clear1'}});h.event('response.function_call_arguments.done',{response_id:'clear1',name:'clear_contact_request',call_id:'call-clear',arguments:'{"field":"all"}'});h.event('response.done',{response:{id:'clear1',status:'completed',output:[]}});
    expect(h.nodes.get('#contact-form [name=contact]').value===''&&!app.actor.getContext().contact_request,'voice clear did not mutate form');const next=h.logs.sent.filter(e=>e.type==='response.create').at(-1);expect(next.response.instructions.includes('формы очищены')&&!next.response.instructions.includes('Как вас зовут'),'voice clear restarted interview');expect(h.logs.sent.filter(e=>e.type==='session.update').at(-1).session.instructions==='Normal assistant instructions','voice clear kept draft instructions');
  });
  await check('text interview stores its first question after beginning the flow',async()=>{
    const h=harness(),app=installActor(h);h.api.open({mode:'text'});
    const pending=h.api.sendMessage('Хочу обсудить задачу');
    h.logs.requests.at(-1).resolve({ok:true,json:async()=>({action:'begin_contact_request',reply:'Как вас зовут?'})});await pending;
    const transcript=app.actor.interviewTranscript();expect(transcript.length===1&&transcript[0].content==='Как вас зовут?','first interview question not captured');
  });
  await check('interview fields and transcript stay in draft and are erased together',async()=>{
    const h=harness(),app=installActor(h);app.actor.recordInterviewMessage('user','Ordinary chat');expect(app.actor.interviewTranscript().length===0,'ordinary chat recorded');
    app.actor.executeSiteAction('begin_contact_request');app.actor.recordInterviewMessage('user','Разбираю файлы вручную');
    app.actor.executeSiteAction('prepare_contact_request','','Задача',{process:'Вручную',goal:'Сводка',constraints:'Не уточняли'});
    expect(app.actor.getContext().contact_draft.goal==='Сводка'&&app.actor.interviewTranscript().length===1,'extended interview draft absent');
    app.actor.executeSiteAction('clear_contact_request','all');expect(app.actor.interviewTranscript().length===0&&['process','goal','constraints'].every(key=>!h.nodes.get('#contact-form [name='+key+']').value),'deleted interview data remains');
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
