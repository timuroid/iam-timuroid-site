import {getContext,executeSiteAction,recordInterviewMessage} from '/app.js';
import {setOrbState,setOrbLevel,setOrbAudioReader,refreshOrbs,feedOrbText,clearOrbText} from '/orb.js';
import {requestHaptic,mountNativeHapticToggle} from '/haptics.js';

const $=s=>document.querySelector(s);
const panel=$('#agent-panel'),dock=$('#agent-dock'),hero=$('.hero-art'),overlay=$('#agent-overlay');
const micInputs=new Map();
let mode='voice',expandedAtY=0,inlineSeen=false,restoreOnHero=false,scrollFrame=0,disconnectTimer=null,lastToolResult=null;
const diagnostics={responses:0,incomplete:0,disconnections:0,recoveries:0};
const messages=$('#agent-messages'),input=$('#agent-input');
const history=[];
let viewportBaseline=window.visualViewport?.height||innerHeight;
let sessionActive=false,presentation='closed',pending=false,requestController;
let conversationGeneration=0,textTurns=0,returnFocus,suggestionSet=0,suggestionTimer;
let pc,channel,mic,audio,voiceTimer,voiceController,voiceGeneration=0;
let voiceActive=false,connecting=false,inputSpeaking=false,awaitingReply=false;
let responseInFlight=false,activeResponseId=null,outputPlaying=false,outputExpected=false,playbackResponseId=null;
let continuationPending=false,toolFailed=false,audioContext=null,micMeter=null,outputMeter=null,baseVoiceInstructions='',sentVoiceInstructions='';
const pendingVoiceTurns=new Set(),seenVoiceTurns=new Set();
let queuedContinuation=null,voiceContextVersion=0;
const meterGraphs=[],audioResponses=new Set(),finishedAudioResponses=new Set();
const suggestionGroups=[
  [['Покажи проекты Тимура','Проекты'],['Как устроен проект со сторис?','Кейс со сторис'],['Как Тимур использует ИИ каждый день?','ИИ в работе']],
  [['Чем Тимур занимается в Цифровой стали?','AI-разработка'],['Расскажи о преподавании Тимура в Бауманке','Преподавание'],['Что Тимур исследует?','Исследования']],
  [['С чего начать применение ИИ в моей работе?','С чего начать'],['Помоги описать мою задачу для Тимура','Моя задача'],['Как понять, нужен ли для моей задачи AI-ассистент?','Нужен ли ассистент']],
  [['Как можно поработать с Тимуром?','Сотрудничество'],['Какие форматы работы предлагает Тимур?','Формат работы'],['Как связаться с Тимуром?','Контакты']],
  [['Расскажи об опыте Тимура','Опыт'],['Расскажи об образовании Тимура','Образование'],['Что можно автоматизировать в работе с документами?','Документы']],
  [['Как применять ИИ в личных задачах?','Личные задачи'],['Как проверить пользу AI-прототипа?','Проверить идею'],['Какие рабочие процессы можно улучшить с помощью ИИ?','Рабочие процессы']]
];

function voiceBusy(){return voiceActive&&(assistantBusy()||inputSpeaking);}
function assistantBusy(){return awaitingReply||responseInFlight||outputPlaying||outputExpected;}
function updateControls(){
  const blocked=pending||connecting||voiceBusy();
  $('#agent-send').disabled=blocked;input.readOnly=pending;
  $('#agent-suggestions').querySelectorAll('button').forEach(button=>button.disabled=blocked);
  const label=connecting?'Отменить подключение':voiceActive?'Выключить микрофон':'Включить микрофон';
  for(const id of ['agent-voice-toggle','agent-dock-voice','agent-voice-stop']){
    const control=$('#'+id),native=micInputs.get(id);
    control.setAttribute('aria-pressed',String(voiceActive||connecting));control.title=label;
    if(native){native.checked=voiceActive||connecting;native.disabled=pending;native.setAttribute('aria-label',label);}
    else{control.disabled=pending;control.setAttribute('aria-label',label);}
    control.classList.toggle('is-connecting',connecting);
  }
  const stop=$('#agent-voice-stop'),visual=stop.querySelector('.native-haptic-visual');
  (visual||stop).textContent=label;
  $('#voice-panel').hidden=mode!=='voice';
  $('#agent-title').textContent=mode==='voice'?'Голосовой разговор':'Чат';
  $('#agent-dock-label').textContent=mode==='voice'?'Разговор':'Чат';
}
function setState(state,label){
  setOrbState(state);$('#agent-state').textContent=label;$('#agent-dock-state').textContent=label;
  const micState=connecting?'connecting':voiceActive?(disconnectTimer?'paused':'listening'):state==='error'?'error':'off';
  panel.dataset.mic=micState;dock.dataset.mic=micState;
  $('#voice-status').textContent=disconnectTimer?'Восстанавливаю связь…':connecting?'Подключаюсь…':!voiceActive?'Микрофон выключен':inputSpeaking?'Слушаю вас':state==='speaking'?'Отвечаю…':state==='thinking'?'Думаю…':'Слушаю вас';
  updateControls();
}
function syncVoice(){
  const listening=voiceActive&&!disconnectTimer;
  mic?.getAudioTracks().forEach(track=>{track.enabled=listening;});
  $('#voice-caption').textContent=connecting?'':listening?'Можно говорить, пока я заканчиваю ответ.':'';
  if(disconnectTimer)setState('thinking','Восстанавливаю соединение · микрофон на паузе');
  else if(connecting)setState('thinking','Подключаюсь…');
  else if(voiceActive){
    if(outputPlaying||outputExpected)setState('speaking',inputSpeaking?'Слушаю вас · ответ продолжается':pendingVoiceTurns.size?'Отвечаю · следующий вопрос принят':'Отвечаю · микрофон включён');
    else if(awaitingReply||responseInFlight)setState('thinking',inputSpeaking?'Слушаю вас · готовлю ответ':'Думаю · микрофон включён');
    else setState('listening',inputSpeaking?'Слушаю вас…':'Слушаю · микрофон включён');
  }else setState(pending?'thinking':$('#agent-error').hidden?'idle':'error',pending?'Думаю…':!$('#agent-error').hidden?'Не подключён · можно повторить':mode==='voice'?'Микрофон выключен':'Можно написать вопрос');
}
function suggestionsPaused(){
  const root=$('#agent-suggestions');
  return pending||connecting||voiceBusy()||document.hidden||root.contains(document.activeElement)||(matchMedia('(hover:hover)').matches&&root.matches(':hover'))||Boolean(input.value.trim());
}
function updateSuggestions(index=suggestionSet,{force=false}={}){
  if(!force&&index!==suggestionSet&&suggestionsPaused())return;
  suggestionSet=((index%suggestionGroups.length)+suggestionGroups.length)%suggestionGroups.length;
  const root=$('#agent-suggestions');root.replaceChildren();
  for(const [prompt,label] of suggestionGroups[suggestionSet]){
    const button=document.createElement('button');button.type='button';button.dataset.agentPrompt=prompt;button.textContent=label;root.append(button);
  }
  root.scrollLeft=0;updateControls();
}
function startSuggestionRotation(){
  clearInterval(suggestionTimer);
  suggestionTimer=setInterval(()=>{if(['inline','overlay'].includes(presentation)&&mode==='text'&&!suggestionsPaused())updateSuggestions(suggestionSet+1);},8000);
}
function updateViewport(){
  const height=window.visualViewport?.height||innerHeight;
  if(document.activeElement!==input)viewportBaseline=Math.max(viewportBaseline,height);
  const typing=innerWidth<=650&&['inline','overlay'].includes(presentation)&&document.activeElement===input&&height<viewportBaseline-120;
  panel.classList.toggle('is-typing',typing);
  overlay.style.setProperty('--agent-viewport-height',`${height}px`);
  overlay.style.setProperty('--agent-viewport-top',`${window.visualViewport?.offsetTop||0}px`);
  if(presentation==='inline')positionInlinePanel();
  refreshOrbs();
}
function positionInlinePanel(){
  const bounds=$('#agent-home-space').getBoundingClientRect();
  overlay.style.setProperty('--agent-home-left',`${bounds.left+window.scrollX}px`);
  overlay.style.setProperty('--agent-home-top',`${bounds.top+window.scrollY}px`);
  overlay.style.setProperty('--agent-home-width',`${bounds.width}px`);
}
function showExpanded(local=false){
  // All states share one permanent host. Only composited surfaces change;
  // neither the hero footprint nor the live canvas dimensions are animated.
  local=local||mode==='text';
  hero.classList.toggle('is-orb-returning',presentation==='dock'&&!local);
  presentation=local?'overlay':'inline';expandedAtY=window.scrollY;restoreOnHero=false;
  const bounds=hero.getBoundingClientRect();inlineSeen=!local&&bounds.bottom>0&&bounds.top<innerHeight;
  overlay.dataset.presentation=presentation;
  panel.hidden=false;dock.hidden=true;overlay.hidden=false;
  document.body.classList.add('agent-open','agent-engaged');document.body.classList.remove('agent-collapsed');hero.classList.toggle('is-agent-active',!local);
  updateViewport();startSuggestionRotation();
  messages.scrollTop=messages.scrollHeight;
}
export function isOpen(){return sessionActive;}
export function open({mode:requested='voice',local=false,activate=true}={}){
  if(!sessionActive){resetConversation();sessionActive=true;returnFocus=document.activeElement;updateSuggestions(suggestionSet,{force:true});}
  if(requested==='text'&&(voiceActive||connecting))stopVoice();
  mode=requested==='text'?'text':'voice';voiceUI();showExpanded(local);
  $('#agent-title').focus({preventScroll:true});
  if(mode==='voice'&&activate)startVoice();
}
export function collapse({restoreOnHero:restore=false}={}){
  if(!sessionActive)return;
  if(presentation==='dock'){if(!restore)restoreOnHero=false;return;}
  const moveFocus=panel.contains(document.activeElement);input.blur();
  presentation='dock';restoreOnHero=restore;panel.hidden=true;overlay.hidden=true;dock.hidden=false;hero.classList.remove('is-agent-active','is-orb-returning');inlineSeen=false;
  document.body.classList.remove('agent-open');document.body.classList.add('agent-collapsed','agent-engaged');clearInterval(suggestionTimer);updateViewport();
  if(moveFocus)$('#agent-resume').focus({preventScroll:true});
}
export const minimize=collapse;
export function getAgentDiagnostics(){return{...diagnostics,presentation,mode,voiceActive,connecting,micEnabled:mic?.getAudioTracks().some(track=>track.enabled)||false};}
function resetConversation(){
  ++conversationGeneration;requestController?.abort();requestController=null;pending=false;stopVoice();
  history.length=0;textTurns=0;messages.replaceChildren();input.value='';$('#voice-caption').textContent='';error('');panel.classList.remove('has-conversation');
}
function close(){
  resetConversation();sessionActive=false;presentation='closed';restoreOnHero=false;panel.hidden=true;dock.hidden=true;overlay.hidden=true;
  hero.classList.remove('is-agent-active');document.body.classList.remove('agent-open','agent-collapsed','agent-engaged');clearInterval(suggestionTimer);updateViewport();returnFocus?.focus?.({preventScroll:true});
}
function message(role,text){
  if(['user','assistant'].includes(role))recordInterviewMessage(role,text);
  const item=document.createElement('div');item.className=`agent-message ${role}`;item.textContent=text;messages.append(item);
  messages.scrollTop=messages.scrollHeight;panel.classList.add('has-conversation');return item;
}
function error(text){$('#agent-error').textContent=text;$('#agent-error').hidden=!text;syncVoice();}
function setPending(value){pending=value;syncVoice();}
export async function sendMessage(text){
  text=String(text??'').trim();if(!sessionActive||!text||pending||connecting)return;
  if(text.length>1500){error('Напишите вопрос короче — до 1500 символов.');return;}
  if(voiceActive){
    if(voiceBusy()||channel?.readyState!=='open')return;
    feedOrbText(text,{role:'user',id:'text-'+conversationGeneration+'-'+history.length,complete:true});
    activeResponseId=null;error('');input.value='';message('user',text);history.push({role:'user',content:text});
    send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});
    awaitingReply=true;syncVoice();send({type:'response.create'});return;
  }
  feedOrbText(text,{role:'user',id:'text-'+conversationGeneration+'-'+history.length,complete:true});
  error('');input.value='';message('user',text);history.push({role:'user',content:text});
  const thinking=message('thinking','Думаю…');setPending(true);
  const generation=conversationGeneration,controller=new AbortController();requestController=controller;
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-12),context:getContext(),turn:textTurns}),signal:controller.signal});
    const result=await response.json();if(generation!==conversationGeneration)return;
    if(!response.ok)throw new Error(result.error||'Агент пока не смог ответить.');
    if(result.action&&result.action!=='none')executeSiteAction(result.action,result.target,result.summary,{name:result.draft_name,contact:result.draft_contact,...result.interview});
    feedOrbText(result.reply,{role:'assistant',id:'text-'+conversationGeneration+'-'+textTurns,complete:true});
    thinking.remove();message('assistant',result.reply);history.push({role:'assistant',content:result.reply});textTurns++;updateSuggestions(suggestionSet+1);
  }catch(e){
    if(generation!==conversationGeneration)return;
    thinking.remove();
    if(e.name!=='AbortError'){
      const item=message('assistant','Не удалось получить ответ. Можно повторить вопрос или написать Тимуру напрямую.');
      const retry=document.createElement('button');retry.type='button';retry.className='message-action';retry.textContent='Повторить';retry.onclick=()=>sendMessage(text);item.append(retry);error(e.message);history.pop();
    }
  }finally{if(generation===conversationGeneration){requestController=null;setPending(false);}}
}
function voiceUI(){
  panel.dataset.mode=mode;messages.hidden=mode==='voice';$('#voice-panel').hidden=mode!=='voice';updateViewport();syncVoice();
}
function createAudioContext(){
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
  try{
    audioContext=new Context();audioContext.resume().catch(()=>{});
    setOrbAudioReader(state=>{
      const meter=state==='speaking'?outputMeter:state==='listening'&&inputSpeaking?micMeter:null;if(!meter)return 0;
      meter.analyser.getFloatTimeDomainData(meter.samples);let sum=0;for(const sample of meter.samples)sum+=sample*sample;
      const rms=Math.sqrt(sum/meter.samples.length),now=performance.now(),dt=Math.min(.1,(now-meter.lastRead)/1000);meter.lastRead=now;
      const target=Math.max(0,Math.min(1,(rms-(state==='listening'?.025:.009))*5));
      meter.level+=(target-meter.level)*(1-Math.exp(-dt/(target>meter.level?.09:.28)));
      const stride=meter.samples.length/meter.waveform.length;
      for(let i=0;i<meter.waveform.length;i++){
        let peak=0;for(let j=Math.floor(i*stride);j<Math.floor((i+1)*stride);j++)peak=Math.max(peak,Math.abs(meter.samples[j]));
        const amplitude=Math.max(0,Math.min(1,(peak-.009)*4)),previous=meter.waveform[i];
        meter.waveform[i]=previous+(amplitude-previous)*(1-Math.exp(-dt/(amplitude>previous?.07:.2)));
      }
      meter.reading.level=meter.level;return meter.reading;
    });
  }catch{audioContext=null;}
}
function attachMeter(stream){
  if(!audioContext)return null;
  try{
    const source=audioContext.createMediaStreamSource(stream),analyser=audioContext.createAnalyser();analyser.fftSize=512;source.connect(analyser);
    const waveform=new Float32Array(32);
    const meter={source,analyser,samples:new Float32Array(analyser.fftSize),waveform,reading:{level:0,waveform},level:0,lastRead:performance.now()};meterGraphs.push(meter);return meter;
  }catch{return null;}
}
async function updateVoiceContext(context){
  const version=++voiceContextVersion,generation=voiceGeneration;
  if(!context.contact_request){
    if(baseVoiceInstructions&&baseVoiceInstructions!==sentVoiceInstructions){sentVoiceInstructions=baseVoiceInstructions;send({type:'session.update',session:{type:'realtime',instructions:baseVoiceInstructions}});}
    return;
  }
  try{
    const response=await fetch('/api/agent-context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)return;
    const data=await response.json();
    if(version!==voiceContextVersion||generation!==voiceGeneration||!voiceActive)return;
    const instructions=[baseVoiceInstructions,data.instructions].filter(Boolean).join('\n');
    if(instructions!==sentVoiceInstructions){sentVoiceInstructions=instructions;send({type:'session.update',session:{type:'realtime',instructions}});}
  }catch{/* The previous instructions remain valid during a transient update error. */}
}
function requestQueuedVoiceResponse(){
  if(!voiceActive||disconnectTimer||inputSpeaking||assistantBusy()||channel?.readyState!=='open')return;
  if(pendingVoiceTurns.size){
    pendingVoiceTurns.clear();queuedContinuation=null;awaitingReply=true;syncVoice();send({type:'response.create'});
  }else if(queuedContinuation){
    const instructions=queuedContinuation;queuedContinuation=null;awaitingReply=true;syncVoice();send({type:'response.create',response:{instructions}});
  }
}
function send(event){if(channel?.readyState==='open')channel.send(JSON.stringify(event));}
async function startVoice(){
  if(pending||voiceActive||connecting||!sessionActive)return;
  mode='voice';
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){error('В этом браузере голос недоступен. Напишите вопрос — агент ответит текстом.');return;}
  window.dispatchEvent(new CustomEvent('microphone-owner',{detail:'agent'}));
  const generation=++voiceGeneration;connecting=true;error('');voiceUI();createAudioContext();
  voiceTimer=setTimeout(()=>{if(generation===voiceGeneration){stopVoice();error('Подключение задерживается. Попробуйте включить микрофон снова или напишите вопрос.');}},30000);
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false}});
    if(generation!==voiceGeneration){stream.getTracks().forEach(track=>track.stop());return;}
    mic=stream;mic.getAudioTracks().forEach(track=>{track.enabled=false;});micMeter=attachMeter(stream);
    const peer=new RTCPeerConnection();pc=peer;
    const playback=document.createElement('audio');audio=playback;playback.autoplay=true;playback.setAttribute('playsinline','');playback.style.display='none';document.body.append(playback);
    peer.ontrack=e=>{
      if(generation!==voiceGeneration)return;
      const output=e.streams[0]||new MediaStream([e.track]);playback.srcObject=output;outputMeter=attachMeter(output);
      playback.play().catch(()=>{
        if(generation!==voiceGeneration)return;
        const button=document.createElement('button');button.className='text-link audio-unlock';button.textContent='Включить звук';
        button.onclick=()=>{audioContext?.resume().catch(()=>{});playback.play().then(()=>button.remove()).catch(()=>{});};$('#voice-panel').append(button);updateControls();
      });
    };
    mic.getTracks().forEach(track=>peer.addTrack(track,mic));
    channel=peer.createDataChannel('oai-events');channel.onmessage=e=>{if(generation===voiceGeneration)onVoiceEvent(e);};
    channel.onopen=()=>{
      if(generation!==voiceGeneration)return;
      voiceActive=true;connecting=false;clearTimeout(voiceTimer);voiceTimer=null;updateVoiceContext(getContext());
      if(history.length)send({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Контекст предыдущего текстового разговора: '+JSON.stringify(history.slice(-8))+'. Сейчас слушай посетителя; не начинай приветствие.'}]}});
      // Opening the microphone starts listening. It never requests a greeting.
      voiceUI();
    };
    peer.onconnectionstatechange=()=>{
      if(generation!==voiceGeneration)return;
      if(peer.connectionState==='connected'){
        if(disconnectTimer){clearTimeout(disconnectTimer);disconnectTimer=null;diagnostics.recoveries++;syncVoice();requestQueuedVoiceResponse();}return;
      }
      if(peer.connectionState==='disconnected'){
        if(!disconnectTimer){diagnostics.disconnections++;disconnectTimer=setTimeout(()=>{if(generation===voiceGeneration){stopVoice();error('Соединение прервалось. Включите микрофон снова или напишите вопрос.');}},8000);syncVoice();}return;
      }
      if(['failed','closed'].includes(peer.connectionState)){stopVoice();error('Соединение прервалось. Включите микрофон снова или напишите вопрос.');}
    };
    const offer=await peer.createOffer();if(generation!==voiceGeneration)return;
    await peer.setLocalDescription(offer);if(generation!==voiceGeneration)return;
    const controller=new AbortController();voiceController=controller;
    const response=await fetch('/api/realtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,context:getContext()}),signal:controller.signal});
    if(generation!==voiceGeneration)return;
    if(!response.ok){const body=await response.json();throw new Error(body.error||'Не удалось подключить голос.');}
    const answer=await response.text();if(generation!==voiceGeneration)return;
    await peer.setRemoteDescription({type:'answer',sdp:answer});
  }catch(e){
    if(generation!==voiceGeneration)return;stopVoice();
    const denied=['NotAllowedError','PermissionDeniedError'].includes(e.name);
    error(denied?'Разрешите микрофон в настройках браузера или напишите вопрос.':e.message||'Голос сейчас недоступен. Попробуйте текстом.');
  }
}
function hasAudio(response){return response?.output?.some(item=>item.content?.some(part=>['audio','output_audio'].includes(part.type)));}
function onVoiceEvent(event){
  let data;try{data=JSON.parse(event.data);}catch{return;}
  if(['session.created','session.updated'].includes(data.type)&&!baseVoiceInstructions&&data.session?.instructions){baseVoiceInstructions=data.session.instructions;updateVoiceContext(getContext());}
  const responseId=data.response_id||data.response?.id;
  if(['response.audio_transcript.delta','response.output_audio_transcript.delta','response.text.delta','response.output_text.delta'].includes(data.type)){
    if(responseId&&responseId!==activeResponseId)return;
    feedOrbText(data.delta,{role:'assistant',id:(responseId||'reply')+':'+(data.item_id||'audio')});return;
  }
  if(data.type==='conversation.item.input_audio_transcription.delta'){
    feedOrbText(data.delta,{role:'user',id:data.item_id||'input'});return;
  }
  // Audio packets carry no UI state. Painting/controls use the analyser and
  // lifecycle events rather than hundreds of DOM updates for media chunks.
  if(['response.audio.delta','response.output_audio.delta'].includes(data.type))return;
  if(data.type==='input_audio_buffer.speech_started'){
    inputSpeaking=true;syncVoice();return;
  }
  if(data.type==='input_audio_buffer.speech_stopped'){
    inputSpeaking=false;syncVoice();return;
  }
  if(data.type==='input_audio_buffer.committed'){
    const id=data.item_id||data.event_id;if(!id||seenVoiceTurns.has(id))return;
    seenVoiceTurns.add(id);if(seenVoiceTurns.size>500)seenVoiceTurns.delete(seenVoiceTurns.values().next().value);
    pendingVoiceTurns.add(id);requestQueuedVoiceResponse();syncVoice();return;
  }
  if(data.type==='response.created'){
    activeResponseId=data.response?.id||null;responseInFlight=true;awaitingReply=true;syncVoice();
  }
  if(data.type==='output_audio_buffer.started'){
    if(responseId&&finishedAudioResponses.has(responseId))return;
    playbackResponseId=responseId||activeResponseId;if(playbackResponseId)audioResponses.add(playbackResponseId);
    outputPlaying=true;outputExpected=false;syncVoice();
  }
  if(['output_audio_buffer.stopped','output_audio_buffer.cleared'].includes(data.type)){
    const finishedId=responseId||playbackResponseId;
    if(finishedId){audioResponses.delete(finishedId);finishedAudioResponses.add(finishedId);}
    if(finishedId===playbackResponseId){playbackResponseId=null;outputPlaying=false;}
    outputExpected=audioResponses.size>0&&!outputPlaying;syncVoice();requestQueuedVoiceResponse();
  }
  if(data.type==='conversation.item.input_audio_transcription.completed'&&data.transcript){feedOrbText(data.transcript,{role:'user',id:data.item_id||'input',complete:true});message('user',data.transcript);history.push({role:'user',content:data.transcript});}
  if(['response.audio_transcript.done','response.output_audio_transcript.done'].includes(data.type)&&data.transcript){
    feedOrbText(data.transcript,{role:'assistant',id:(responseId||'reply')+':'+(data.item_id||'audio'),complete:true});
    message('assistant',data.transcript);history.push({role:'assistant',content:data.transcript});
  }
  if(data.type==='response.function_call_arguments.done'){
    if(responseId&&responseId!==activeResponseId)return;
    let result;
    try{const args=JSON.parse(data.arguments);result=executeSiteAction(data.name,args.section_id||args.case_id||args.experience_id||args.career_id||args.field||'',args.summary||'',{name:args.name,contact:args.contact,process:args.process,goal:args.goal,constraints:args.constraints});}
    catch{result={ok:false,error:'Не удалось открыть информацию. Выберите раздел в меню.'};}
    send({type:'conversation.item.create',item:{type:'function_call_output',call_id:data.call_id,output:JSON.stringify(result)}});
    lastToolResult=result;continuationPending=true;toolFailed=toolFailed||!result.ok;
  }
  if(data.type==='response.done'){
    if(!activeResponseId||data.response?.id!==activeResponseId)return;
    activeResponseId=null;responseInFlight=false;awaitingReply=false;diagnostics.responses++;
    if(data.response?.status==='incomplete'){diagnostics.incomplete++;$('#agent-error').textContent='Ответ оборвался. Можно попросить продолжить.';$('#agent-error').hidden=false;}
    // response.done means generation finished, not that WebRTC audio finished.
    if(responseId&&hasAudio(data.response)&&!finishedAudioResponses.has(responseId))audioResponses.add(responseId);
    outputExpected=audioResponses.size>0&&!outputPlaying;
    if(continuationPending){
      continuationPending=false;const failed=toolFailed;toolFailed=false;
      const prompt=lastToolResult?.contact_missing?.length?{name:'Как вас зовут?',contact:'Как с вами связаться?',message:'Что хотите обсудить?',process:'Как вы решаете эту задачу сейчас?',goal:'Какого результата хотелось бы добиться?',constraints:'Есть сроки, ограничения или важные условия? Можно пропустить.'}[lastToolResult.contact_missing[0]]:'Черновик заполнен. Проверьте форму, отметьте согласие и нажмите «Отправить сообщение».';
      const next=lastToolResult?.draftCleared?'Подтверди, что указанные поля формы очищены. Не заполняй их из истории и не начинай новый контактный опрос. Не утверждай, что удалены ранее отправленные заявки.':lastToolResult?.contact_request?`Произнеси только эту фразу дословно: ${prompt} Не вызывай инструменты и ничего не добавляй.`:'Подтверди действие одним коротким предложением. Дай посетителю спокойно читать.';
      queuedContinuation=failed?'Коротко сообщи, что действие не получилось.':next;
    }
    syncVoice();requestQueuedVoiceResponse();
  }
  if(data.type==='error'){
    if(['conversation_already_has_active_response','response_cancel_not_active'].includes(data.error?.code))return;
    stopVoice();error('Голосовой агент не смог продолжить. Можно написать вопрос или подключиться снова.');
  }
  updateControls();
}
function stopVoice(){
  clearOrbText();
  ++voiceGeneration;++voiceContextVersion;pendingVoiceTurns.clear();seenVoiceTurns.clear();queuedContinuation=null;clearTimeout(disconnectTimer);disconnectTimer=null;voiceController?.abort();voiceController=null;clearTimeout(voiceTimer);voiceTimer=null;
  voiceActive=false;connecting=false;baseVoiceInstructions='';sentVoiceInstructions='';continuationPending=false;toolFailed=false;inputSpeaking=false;awaitingReply=false;
  responseInFlight=false;activeResponseId=null;outputPlaying=false;outputExpected=false;playbackResponseId=null;audioResponses.clear();finishedAudioResponses.clear();
  setOrbAudioReader(null);setOrbLevel(0);
  for(const meter of meterGraphs.splice(0)){meter.source.disconnect();meter.analyser.disconnect();}micMeter=null;outputMeter=null;
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}$('.audio-unlock')?.remove();
  if(channel){channel.onmessage=null;channel.onopen=null;channel.close();channel=null;}
  if(pc){pc.onconnectionstatechange=null;pc.close();pc=null;}
  if(mic){mic.getTracks().forEach(track=>track.stop());mic=null;}
  if(audio){audio.pause();audio.srcObject=null;audio.remove();audio=null;}
  voiceUI();
}
function setVoiceEnabled(enabled){mode='voice';if(enabled){if(!voiceActive&&!connecting)startVoice();}else if(voiceActive||connecting)stopVoice();voiceUI();}
function toggleVoice(){setVoiceEnabled(!voiceActive&&!connecting);}
$('#agent-form').addEventListener('submit',e=>{e.preventDefault();sendMessage(input.value);});
for(const id of ['agent-voice-toggle','agent-dock-voice','agent-voice-stop']){
  const native=mountNativeHapticToggle($('#'+id));
  if(native){micInputs.set(id,native);native.addEventListener('change',()=>setVoiceEnabled(native.checked));}
  else $('#'+id).addEventListener('click',toggleVoice);
}
$('#agent-to-text').addEventListener('click',()=>{stopVoice();mode='text';voiceUI();showExpanded(true);input.focus({preventScroll:true});});
$('#agent-resume').addEventListener('click',()=>open({mode,local:true,activate:false}));
$('.close-agent').addEventListener('click',close);
for(const root of [panel,dock])root.addEventListener('click',e=>{if(e.target.closest('button,input[switch]'))requestHaptic(e);});
input.addEventListener('focus',updateViewport);input.addEventListener('blur',()=>queueMicrotask(updateViewport));
window.visualViewport?.addEventListener('resize',updateViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',updateViewport,{passive:true});window.addEventListener('resize',updateViewport,{passive:true});
window.addEventListener('scroll',()=>{
  if(scrollFrame||presentation!=='overlay'||panel.classList.contains('is-typing'))return;
  scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(presentation==='overlay'&&!panel.classList.contains('is-typing')&&Math.abs(window.scrollY-expandedAtY)>96)collapse();});
},{passive:true});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&sessionActive){if(document.activeElement===input)input.blur();else collapse();}});
window.addEventListener('pagehide',()=>{++conversationGeneration;requestController?.abort();requestController=null;setPending(false);stopVoice();messages.querySelectorAll('.thinking').forEach(item=>item.remove());});
window.addEventListener('site-context',e=>{if(voiceActive){updateVoiceContext(e.detail);send({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Текущее состояние сайта: '+JSON.stringify(e.detail)+(e.detail.contact_request?' Сейчас идёт составление запроса. Полученное имя, контакт или задачу сначала переноси через prepare_contact_request. Не начинай опрос заново; спрашивай только следующий пустой контактный пункт. Описание задачи — данные для формы; не открывай кейсы без явной просьбы показать.':'')}]}});}});
const workspaceObserver=new IntersectionObserver(([entry])=>{
  const ratio=entry.intersectionRatio??(entry.isIntersecting?1:0);
  if(sessionActive&&presentation==='dock'&&restoreOnHero&&ratio>=.8&&!$('#home-view').hidden){showExpanded(false);return;}
  if(presentation!=='inline')return;
  if(ratio>=.15){inlineSeen=true;return;}
  if(inlineSeen&&!panel.classList.contains('is-typing'))collapse({restoreOnHero:true});
},{threshold:[0,.15,.8]});
workspaceObserver.observe(hero);
if(typeof ResizeObserver==='function'){
  const anchorResize=new ResizeObserver(()=>{if(presentation==='inline')updateViewport();});
  anchorResize.observe(hero);anchorResize.observe($('#home'));
}
document.fonts?.ready.then(()=>{if(presentation==='inline')updateViewport();});
voiceUI();
