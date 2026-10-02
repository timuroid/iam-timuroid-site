import {getContext,executeSiteAction,revealAgentHome} from '/app.js';
import {setOrbState,setOrbLevel,setOrbAudioReader,refreshOrbs} from '/orb.js';
import {requestHaptic} from '/haptics.js';

const $=s=>document.querySelector(s);
const panel=$('#agent-panel'),dock=$('#agent-dock'),hero=$('.hero-art');
const messages=$('#agent-messages'),input=$('#agent-input');
const history=[];
let viewportBaseline=window.visualViewport?.height||innerHeight;
let sessionActive=false,presentation='closed',pending=false,requestController;
let conversationGeneration=0,textTurns=0,returnFocus,suggestionSet=0,suggestionTimer;
let pc,channel,mic,audio,voiceTimer,voiceController,voiceGeneration=0;
let voiceActive=false,connecting=false,inputSpeaking=false,awaitingReply=false;
let responseInFlight=false,activeResponseId=null,outputPlaying=false,outputExpected=false,playbackResponseId=null,interruptedTurn=false,clearingOutput=false,clearingResponseId=null;
let continuationPending=false,toolFailed=false,audioContext=null,micMeter=null,outputMeter=null;
const meterGraphs=[],cancelledResponses=new Set(),audioResponses=new Set(),finishedAudioResponses=new Set(),cancelAwaitIds=new Set();
const suggestionGroups=[
  [['Покажи проекты Тимура','Проекты'],['Как устроен проект со сторис?','Кейс со сторис'],['Как Тимур использует ИИ каждый день?','ИИ в работе']],
  [['Чем Тимур занимается в Цифровой стали?','AI-разработка'],['Расскажи о преподавании Тимура в Бауманке','Преподавание'],['Что Тимур исследует?','Исследования']],
  [['С чего начать применение ИИ в моей работе?','С чего начать'],['Помоги описать мою задачу для Тимура','Моя задача'],['Как понять, нужен ли для моей задачи AI-ассистент?','Нужен ли ассистент']],
  [['Как можно поработать с Тимуром?','Сотрудничество'],['Какие форматы работы предлагает Тимур?','Формат работы'],['Как связаться с Тимуром?','Контакты']],
  [['Расскажи об опыте Тимура','Опыт'],['Расскажи об образовании Тимура','Образование'],['Что можно автоматизировать в работе с документами?','Документы']],
  [['Как применять ИИ в личных задачах?','Личные задачи'],['Как проверить пользу AI-прототипа?','Проверить идею'],['Какие рабочие процессы можно улучшить с помощью ИИ?','Рабочие процессы']]
];

function voiceBusy(){return voiceActive&&(assistantBusy()||inputSpeaking);}
function assistantBusy(){return awaitingReply||responseInFlight||outputPlaying||outputExpected||clearingOutput||cancelAwaitIds.size>0;}
function canInterrupt(){return voiceActive&&!clearingOutput&&!cancelAwaitIds.size&&(responseInFlight&&Boolean(activeResponseId)||outputPlaying||outputExpected);}
function updateControls(){
  const blocked=pending||connecting||voiceBusy();
  $('#agent-send').disabled=blocked;
  // Keep the field focusable: disabling it closes the mobile keyboard during each answer.
  input.readOnly=pending;
  $('#agent-suggestions').querySelectorAll('button').forEach(button=>button.disabled=blocked);
  const label=connecting?'Отменить подключение':voiceActive?'Выключить микрофон':'Поговорить голосом';
  const main=$('#agent-voice-toggle');main.disabled=pending;main.setAttribute('aria-label',label);main.title=label;main.setAttribute('aria-pressed',String(voiceActive||connecting));
  const interruptible=canInterrupt();
  $('#agent-interrupt').hidden=!interruptible;
  $('#voice-panel').hidden=!interruptible&&!$('.audio-unlock');
  const compact=$('#agent-dock-voice');compact.disabled=pending;compact.setAttribute('aria-label',interruptible?'Перебить ответ':label);compact.title=interruptible?'Перебить ответ':label;compact.setAttribute('aria-pressed',String(voiceActive||connecting));compact.classList.toggle('is-interrupt',interruptible);
  compact.querySelector('svg').innerHTML=interruptible?'<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>':main.querySelector('svg').innerHTML;
}
function setState(state,label){
  setOrbState(state);$('#agent-state').textContent=label;$('#agent-dock-state').textContent=label;
  updateControls();
}
function syncVoice(){
  // Silence the outgoing track while the assistant thinks or plays audio. VAD
  // cannot mistake an echo, a passing car or clothing noise for an interruption.
  const listening=voiceActive&&!assistantBusy();
  mic?.getAudioTracks().forEach(track=>{track.enabled=listening;});
  if(connecting)setState('thinking','Подключаюсь…');
  else if(voiceActive){
    if(clearingOutput||cancelAwaitIds.size)setState('thinking','Останавливаю ответ…');
    else if(outputPlaying||outputExpected)setState('speaking','Отвечаю · микрофон на паузе');
    else if(awaitingReply||responseInFlight)setState('thinking','Думаю · микрофон на паузе');
    else setState('listening',inputSpeaking?'Слушаю вас…':'Микрофон включён · слушаю');
  }else setState(pending?'thinking':$('#agent-error').hidden?'idle':'error',pending?'Думаю…':'Можно написать или поговорить');
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
  suggestionTimer=setInterval(()=>{if(presentation==='inline'&&!suggestionsPaused())updateSuggestions(suggestionSet+1);},8000);
}
function updateViewport(){
  const height=window.visualViewport?.height||innerHeight;
  if(document.activeElement!==input)viewportBaseline=Math.max(viewportBaseline,height);
  const typing=innerWidth<=650&&presentation==='inline'&&document.activeElement===input&&height<viewportBaseline-120;
  panel.classList.toggle('is-typing',typing);
  panel.style.setProperty('--agent-viewport-height',`${height}px`);
  panel.style.setProperty('--agent-viewport-top',`${window.visualViewport?.offsetTop||0}px`);
  refreshOrbs();
}
function showInline(){
  inlineSeen=false;presentation='inline';panel.hidden=false;dock.hidden=true;
  document.body.classList.add('agent-open');document.body.classList.remove('agent-collapsed');hero.classList.add('is-agent-active');
  revealAgentHome();updateViewport();startSuggestionRotation();
  requestAnimationFrame(()=>{
    if(presentation!=='inline')return;
    if(innerWidth<=650||hero.getBoundingClientRect().top<0||hero.getBoundingClientRect().top>innerHeight*.5)hero.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
    refreshOrbs();messages.scrollTop=messages.scrollHeight;
  });
}
export function isOpen(){return sessionActive;}
export function open(){
  if(!sessionActive){
    resetConversation();sessionActive=true;returnFocus=document.activeElement;updateSuggestions(suggestionSet,{force:true});
  }
  const fromDock=presentation==='dock';showInline();
  if(fromDock)$('#agent-title').focus({preventScroll:true});
}
export function collapse(){
  if(!sessionActive)return;
  const moveFocus=panel.contains(document.activeElement);input.blur();presentation='dock';panel.hidden=true;dock.hidden=false;hero.classList.remove('is-agent-active');
  inlineSeen=false;document.body.classList.remove('agent-open');document.body.classList.add('agent-collapsed');clearInterval(suggestionTimer);updateViewport();if(moveFocus)$('#agent-resume').focus({preventScroll:true});
}
export const minimize=collapse;
function resetConversation(){
  ++conversationGeneration;requestController?.abort();requestController=null;pending=false;stopVoice();
  history.length=0;textTurns=0;messages.replaceChildren();input.value='';error('');panel.classList.remove('has-conversation');
}
function close(){
  resetConversation();sessionActive=false;presentation='closed';panel.hidden=true;dock.hidden=true;
  hero.classList.remove('is-agent-active');document.body.classList.remove('agent-open','agent-collapsed');clearInterval(suggestionTimer);updateViewport();returnFocus?.focus?.({preventScroll:true});
}
function message(role,text){
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
    interruptedTurn=false;activeResponseId=null;error('');input.value='';message('user',text);history.push({role:'user',content:text});
    send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});
    awaitingReply=true;syncVoice();send({type:'response.create'});return;
  }
  error('');input.value='';message('user',text);history.push({role:'user',content:text});
  const thinking=message('thinking','Думаю…');setPending(true);
  const generation=conversationGeneration,controller=new AbortController();requestController=controller;
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-12),context:getContext(),turn:textTurns}),signal:controller.signal});
    const result=await response.json();if(generation!==conversationGeneration)return;
    if(!response.ok)throw new Error(result.error||'Агент пока не смог ответить.');
    thinking.remove();message('assistant',result.reply);history.push({role:'assistant',content:result.reply});textTurns++;updateSuggestions(suggestionSet+1);
    if(result.action&&result.action!=='none')executeSiteAction(result.action,result.target,result.summary);
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
  panel.dataset.mode=voiceActive||connecting?'voice':'text';$('#voice-panel').hidden=!(voiceActive||connecting);
  // The transcript remains the same conversation in both text and voice modes.
  messages.hidden=false;updateViewport();syncVoice();
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
      meter.level+=(target-meter.level)*(1-Math.exp(-dt/(target>meter.level?.09:.28)));return meter.level;
    });
  }catch{audioContext=null;}
}
function attachMeter(stream){
  if(!audioContext)return null;
  try{
    const source=audioContext.createMediaStreamSource(stream),analyser=audioContext.createAnalyser();analyser.fftSize=512;source.connect(analyser);
    const meter={source,analyser,samples:new Float32Array(analyser.fftSize),level:0,lastRead:performance.now()};meterGraphs.push(meter);return meter;
  }catch{return null;}
}
function send(event){if(channel?.readyState==='open')channel.send(JSON.stringify(event));}
async function startVoice(){
  if(pending||voiceActive||connecting||!sessionActive)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){error('В этом браузере голос недоступен. Напишите вопрос — агент ответит текстом.');return;}
  window.dispatchEvent(new CustomEvent('microphone-owner',{detail:'agent'}));
  const generation=++voiceGeneration;connecting=true;error('');voiceUI();createAudioContext();
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
      voiceActive=true;connecting=false;
      if(history.length)send({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Контекст предыдущего текстового разговора: '+JSON.stringify(history.slice(-8))+'. Сейчас слушай посетителя; не начинай приветствие.'}]}});
      // Opening the microphone starts listening. It never requests a greeting.
      voiceUI();
      voiceTimer=setTimeout(()=>{stopVoice();error('Голосовой сеанс завершён. Можно включить микрофон снова или продолжить текстом.');},5*60*1000);
    };
    peer.onconnectionstatechange=()=>{
      if(generation===voiceGeneration&&['failed','disconnected','closed'].includes(peer.connectionState)){stopVoice();error('Соединение прервалось. Можно включить микрофон снова или написать вопрос.');}
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
function interrupt(){
  if(!canInterrupt())return;
  interruptedTurn=true;clearingOutput=outputPlaying||outputExpected;
  clearingResponseId=clearingOutput?(playbackResponseId||[...audioResponses].at(-1)||activeResponseId):null;
  if(responseInFlight&&activeResponseId)cancelAwaitIds.add(activeResponseId);
  for(const id of audioResponses)cancelledResponses.add(id);
  if(activeResponseId)cancelledResponses.add(activeResponseId);
  if(responseInFlight)send({type:'response.cancel',...(activeResponseId?{response_id:activeResponseId}:{})});
  send({type:'output_audio_buffer.clear'});send({type:'input_audio_buffer.clear'});
  continuationPending=false;toolFailed=false;responseInFlight=false;activeResponseId=null;
  audioResponses.clear();playbackResponseId=null;outputPlaying=false;outputExpected=false;inputSpeaking=false;awaitingReply=false;syncVoice();
}
function hasAudio(response){return response?.output?.some(item=>item.content?.some(part=>['audio','output_audio'].includes(part.type)));}
function onVoiceEvent(event){
  let data;try{data=JSON.parse(event.data);}catch{return;}
  const responseId=data.response_id||data.response?.id;
  if(clearingOutput&&data.type==='output_audio_buffer.cleared'&&responseId===clearingResponseId){clearingOutput=false;clearingResponseId=null;syncVoice();}
  if(data.type==='response.done'&&cancelAwaitIds.delete(responseId))syncVoice();
  if(responseId&&cancelledResponses.has(responseId))return;
  if(data.type==='input_audio_buffer.speech_started'){
    if(!assistantBusy()){interruptedTurn=false;activeResponseId=null;inputSpeaking=true;syncVoice();}return;
  }
  if(data.type==='input_audio_buffer.speech_stopped'){
    if(!assistantBusy()){inputSpeaking=false;awaitingReply=true;syncVoice();}return;
  }
  if(data.type==='response.created'){
    if(interruptedTurn){if(responseId)cancelledResponses.add(responseId);send({type:'response.cancel',...(responseId?{response_id:responseId}:{})});send({type:'output_audio_buffer.clear'});return;}
    activeResponseId=data.response?.id||null;responseInFlight=true;awaitingReply=true;inputSpeaking=false;syncVoice();
  }
  if(data.type==='output_audio_buffer.started'){
    playbackResponseId=responseId||activeResponseId;if(playbackResponseId)audioResponses.add(playbackResponseId);
    outputPlaying=true;outputExpected=false;syncVoice();
  }
  if(['output_audio_buffer.stopped','output_audio_buffer.cleared'].includes(data.type)){
    const finishedId=responseId||playbackResponseId;
    if(finishedId){audioResponses.delete(finishedId);finishedAudioResponses.add(finishedId);}
    if(finishedId===playbackResponseId){playbackResponseId=null;outputPlaying=false;}
    outputExpected=audioResponses.size>0&&!outputPlaying;syncVoice();
  }
  if(data.type==='conversation.item.input_audio_transcription.completed'&&data.transcript){message('user',data.transcript);history.push({role:'user',content:data.transcript});}
  if(['response.audio_transcript.done','response.output_audio_transcript.done'].includes(data.type)&&data.transcript){
    message('assistant',data.transcript);history.push({role:'assistant',content:data.transcript});
  }
  if(data.type==='response.function_call_arguments.done'){
    if(responseId&&responseId!==activeResponseId)return;
    let result;
    try{const args=JSON.parse(data.arguments);result=executeSiteAction(data.name,args.section_id||args.case_id||args.experience_id||'',args.summary||'');}
    catch{result={ok:false,error:'Не удалось открыть информацию. Выберите раздел в меню.'};}
    send({type:'conversation.item.create',item:{type:'function_call_output',call_id:data.call_id,output:JSON.stringify(result)}});
    continuationPending=true;toolFailed=toolFailed||!result.ok;
  }
  if(data.type==='response.done'){
    if(!activeResponseId||data.response?.id!==activeResponseId)return;
    activeResponseId=null;responseInFlight=false;awaitingReply=false;
    // response.done means generation finished, not that WebRTC audio finished.
    if(responseId&&hasAudio(data.response)&&!finishedAudioResponses.has(responseId))audioResponses.add(responseId);
    outputExpected=audioResponses.size>0&&!outputPlaying;
    if(continuationPending){
      continuationPending=false;const failed=toolFailed;toolFailed=false;awaitingReply=true;
      send({type:'response.create',response:{instructions:failed?'Коротко сообщи, что открыть раздел не получилось.':'Подтверди показ одним коротким предложением. Не продолжай объяснение: дай посетителю спокойно читать.'}});
    }
    syncVoice();
  }
  if(data.type==='error'){
    if(['conversation_already_has_active_response','response_cancel_not_active'].includes(data.error?.code))return;
    stopVoice();error('Голосовой агент не смог продолжить. Можно написать вопрос или подключиться снова.');
  }
  updateControls();
}
function stopVoice(){
  ++voiceGeneration;voiceController?.abort();voiceController=null;clearTimeout(voiceTimer);voiceTimer=null;
  voiceActive=false;connecting=false;continuationPending=false;toolFailed=false;inputSpeaking=false;awaitingReply=false;
  responseInFlight=false;activeResponseId=null;outputPlaying=false;outputExpected=false;playbackResponseId=null;interruptedTurn=false;clearingOutput=false;clearingResponseId=null;cancelAwaitIds.clear();cancelledResponses.clear();audioResponses.clear();finishedAudioResponses.clear();
  setOrbAudioReader(null);setOrbLevel(0);
  for(const meter of meterGraphs.splice(0)){meter.source.disconnect();meter.analyser.disconnect();}micMeter=null;outputMeter=null;
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}$('.audio-unlock')?.remove();
  if(channel){channel.onmessage=null;channel.onopen=null;channel.close();channel=null;}
  if(pc){pc.onconnectionstatechange=null;pc.close();pc=null;}
  if(mic){mic.getTracks().forEach(track=>track.stop());mic=null;}
  if(audio){audio.pause();audio.srcObject=null;audio.remove();audio=null;}
  voiceUI();
}
function toggleVoice(){if(voiceActive||connecting)stopVoice();else startVoice();}
$('#agent-form').addEventListener('submit',e=>{e.preventDefault();sendMessage(input.value);});
$('#agent-voice-toggle').addEventListener('click',toggleVoice);
$('#agent-dock-voice').addEventListener('click',()=>{if(canInterrupt())interrupt();else toggleVoice();});
$('#agent-interrupt').addEventListener('click',interrupt);
$('#agent-resume').addEventListener('click',open);
$('#agent-collapse').addEventListener('click',collapse);
$('.close-agent').addEventListener('click',close);
for(const root of [panel,dock])root.addEventListener('click',e=>{if(e.target.closest('button'))requestHaptic(e);});
input.addEventListener('focus',updateViewport);input.addEventListener('blur',()=>queueMicrotask(updateViewport));
window.visualViewport?.addEventListener('resize',updateViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',updateViewport,{passive:true});window.addEventListener('resize',updateViewport,{passive:true});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&sessionActive){if(document.activeElement===input)input.blur();else collapse();}});
window.addEventListener('pagehide',()=>{++conversationGeneration;requestController?.abort();requestController=null;setPending(false);stopVoice();messages.querySelectorAll('.thinking').forEach(item=>item.remove());});
window.addEventListener('site-context',e=>{if(voiceActive)send({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Текущее состояние сайта: '+JSON.stringify(e.detail)}]}});});
window.addEventListener('microphone-owner',e=>{if(e.detail==='dictation')stopVoice();});

let inlineSeen=false;
const workspaceObserver=new IntersectionObserver(([entry])=>{
  if(presentation!=='inline'){inlineSeen=false;return;}
  if(entry.isIntersecting){inlineSeen=true;return;}
  if(inlineSeen&&!panel.classList.contains('is-typing'))collapse();
},{threshold:0});
workspaceObserver.observe(panel);
