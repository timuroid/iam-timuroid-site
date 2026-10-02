import {getContext,executeSiteAction,showToast} from '/app.js';
import {setOrbState,setOrbLevel,setOrbAudioReader,refreshOrbs} from '/orb.js';
const $=s=>document.querySelector(s);
const dialog=$('#agent-dialog');
const messages=$('#agent-messages');
const history=[];
let pending=false,requestController,pc,channel,mic,audio,voiceTimer,voiceActive=false,connecting=false;
let previousOverflow='';let textTurns=0;let voiceGeneration=0;let returnFocus;let suggestionSet=0;
let continuationPending=false,toolFailed=false;
let audioContext=null,micMeter=null,outputMeter=null,outputPlaying=false;
let inputSpeaking=false,awaitingReply=false,activeResponseId=null;
const meterGraphs=[];

function createAudioContext(){
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)return;
  try{audioContext=new Context();audioContext.resume().catch(()=>{});setOrbAudioReader(state=>{const meter=state==='speaking'?outputMeter:state==='listening'?micMeter:null;if(!meter)return 0;meter.analyser.getFloatTimeDomainData(meter.samples);let sum=0;for(const sample of meter.samples)sum+=sample*sample;return Math.max(0,Math.min(1,(Math.sqrt(sum/meter.samples.length)-.008)*7));});}catch{audioContext=null;}
}
function attachMeter(stream){
  if(!audioContext)return null;
  try{const source=audioContext.createMediaStreamSource(stream),analyser=audioContext.createAnalyser();analyser.fftSize=256;source.connect(analyser);const meter={source,analyser,samples:new Float32Array(analyser.fftSize)};meterGraphs.push(meter);return meter;}catch{return null;}
}
function voiceState(next,label){setOrbState(next);$('#voice-status').textContent=label;}

const suggestionGroups=[
  [['Покажи проекты Тимура','Проекты'],['Помоги описать мою задачу для Тимура','Моя задача']],
  [['Чем Тимур занимается в Цифровой стали?','AI-разработка'],['Расскажи о преподавании Тимура в Бауманке','Преподавание']],
  [['Как устроен проект со сторис?','Кейс со сторис'],['Как Тимур использует ИИ каждый день?','ИИ в работе']],
  [['Как можно поработать с Тимуром?','Сотрудничество'],['С чего начать применение ИИ в моей работе?','С чего начать']],
  [['Расскажи об образовании и исследованиях Тимура','Образование'],['Как связаться с Тимуром?','Контакты']]
];
function updateSuggestions(index=suggestionSet){
  suggestionSet=((index%suggestionGroups.length)+suggestionGroups.length)%suggestionGroups.length;
  const root=$('#agent-suggestions');root.replaceChildren();
  for(const [prompt,label] of suggestionGroups[suggestionSet]){const button=document.createElement('button');button.type='button';button.dataset.agentPrompt=prompt;button.textContent=label;button.disabled=pending;root.append(button);}
  const refresh=document.createElement('button');refresh.type='button';refresh.id='refresh-suggestions';refresh.setAttribute('aria-label','Другие примеры вопросов');refresh.textContent='↻';refresh.disabled=pending;root.append(refresh);
}
$('#agent-suggestions').addEventListener('click',e=>{if(e.target.closest('#refresh-suggestions'))updateSuggestions(suggestionSet+1);});
function updateViewport(){
  if(innerWidth>650||!dialog.open){dialog.style.removeProperty('--agent-viewport-height');dialog.style.removeProperty('--agent-viewport-top');dialog.classList.remove('is-compact');return;}
  const height=window.visualViewport?.height||innerHeight;dialog.classList.toggle('is-compact',height<600);
  dialog.style.setProperty('--agent-viewport-height',`${height}px`);
  dialog.style.setProperty('--agent-viewport-top',`${window.visualViewport?.offsetTop||0}px`);refreshOrbs();
}
window.visualViewport?.addEventListener('resize',updateViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',updateViewport,{passive:true});
window.addEventListener('resize',updateViewport,{passive:true});
export function isOpen(){return dialog.open;}
export function presentCards(title,markup){
  const cards=$('#agent-cards');
  cards.innerHTML='<div class="agent-cards-heading"><strong></strong><button class="agent-cards-close" type="button">Скрыть</button></div>'+markup;
  cards.querySelector('strong').textContent=title;cards.hidden=false;cards.scrollTop=0;
  dialog.classList.add('has-preview');$('#agent-welcome').hidden=true;
  updateSuggestions(suggestionSet+1);refreshOrbs();
}
$('#agent-cards').addEventListener('click',e=>{if(!e.target.closest('.agent-cards-close'))return;$('#agent-cards').hidden=true;dialog.classList.remove('has-preview');if(!history.length&&!voiceActive&&!connecting)$('#agent-welcome').hidden=false;refreshOrbs();});
export function open(){
  if(dialog.open)return;
  returnFocus=document.activeElement;
  previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  dialog.showModal();updateViewport();updateSuggestions(suggestionSet);
  refreshOrbs();
  if(!voiceActive&&innerWidth>650)$('#agent-input').focus({preventScroll:true});
}
function hide({restoreFocus=true}={}){if(dialog.open)dialog.close();document.body.style.overflow=previousOverflow;updateViewport();refreshOrbs();if(restoreFocus)returnFocus?.focus?.({preventScroll:true});}
export function minimize(){requestController?.abort();stopVoice();hide({restoreFocus:false});}
function close(){requestController?.abort();stopVoice();hide();}
$('.close-agent').addEventListener('click',close);
dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
let swipeStart;
dialog.addEventListener('touchstart',e=>{if(e.target.closest('.sheet-handle,.agent-header'))swipeStart=e.touches[0].clientY;else swipeStart=null;},{passive:true});
dialog.addEventListener('touchend',e=>{if(swipeStart!==null&&swipeStart!==undefined&&e.changedTouches[0].clientY-swipeStart>65)close();swipeStart=null;},{passive:true});
function message(role,text){const item=document.createElement('div');item.className=`agent-message ${role}`;item.textContent=text;messages.append(item);messages.scrollTop=messages.scrollHeight;$('#agent-welcome').hidden=true;dialog.classList.add('has-conversation');refreshOrbs();return item;}
function error(text){$('#agent-error').textContent=text;$('#agent-error').hidden=!text;if(text)setOrbState('error');else if(!voiceActive&&!connecting&&!pending)setOrbState('idle');}
function setPending(value){pending=value;$('#agent-form button').disabled=value;$('#agent-input').disabled=value;$('#start-voice').disabled=value;$('#start-voice-inline').disabled=value;$('#agent-suggestions').querySelectorAll('button').forEach(b=>b.disabled=value);$('#agent-state').textContent=value?'Думаю…':'Обо мне, проектах и вашей задаче';setOrbState(value?'thinking':$('#agent-error').hidden?'idle':'error');}
export async function sendMessage(text){
  text=String(text??'').trim();if(!text||pending)return;
  if(text.length>1500){error('Напишите вопрос короче — до 1500 символов.');return;}
  if(voiceActive||connecting)stopVoice();
  error('');$('#agent-input').value='';message('user',text);history.push({role:'user',content:text});
  const thinking=message('thinking','Секунду, посмотрю…');setPending(true);requestController=new AbortController();
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-12),context:getContext(),turn:textTurns}),signal:requestController.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Агент пока не смог ответить.');
    thinking.remove();message('assistant',result.reply);history.push({role:'assistant',content:result.reply});textTurns++;updateSuggestions(suggestionSet+1);
    if(result.action&&result.action!=='none'){
      executeSiteAction(result.action,result.target,result.summary);showToast(result.reply);
    }
  }catch(e){thinking.remove();if(e.name!=='AbortError'){const item=message('assistant','Не удалось получить ответ. Можно повторить вопрос или написать Тимуру напрямую.');const retry=document.createElement('button');retry.type='button';retry.className='message-action';retry.textContent='Повторить вопрос';retry.onclick=()=>sendMessage(text);item.append(retry);error(e.message);history.pop();}}
  finally{setPending(false);if(dialog.open&&innerWidth>650)$('#agent-input').focus({preventScroll:true});}
}
$('#agent-form').addEventListener('submit',e=>{e.preventDefault();sendMessage($('#agent-input').value);});
$('#start-voice').addEventListener('click',startVoice);
$('#start-voice-inline').addEventListener('click',startVoice);
$('#agent-orb-toggle').addEventListener('click',()=>{if(voiceActive||connecting)stopVoice();else startVoice();});
$('#stop-voice').addEventListener('click',()=>{stopVoice();$('#agent-state').textContent='Разговор завершён';});
$('#switch-to-text').addEventListener('click',()=>{stopVoice();$('#agent-input').focus({preventScroll:true});});
function voiceUI(active){
  dialog.dataset.mode=active?'voice':'text';
  $('#voice-panel').hidden=!active;$('#agent-welcome').hidden=active||history.length>0||dialog.classList.contains('has-preview');messages.hidden=active;$('.agent-composer').hidden=active;$('#agent-orb-toggle').setAttribute('aria-label',active?'Завершить голосовой разговор':'Поговорить голосом');
  const floating=$('.floating-agent span');if(floating)floating.textContent=active?'Вернуться к разговору':'Спросить агента';
  refreshOrbs();
}
function send(event){if(channel?.readyState==='open')channel.send(JSON.stringify(event));}
async function startVoice(){
  if(pending||voiceActive||connecting)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){error('В этом браузере голос недоступен. Напишите вопрос — агент ответит текстом.');return;}
  window.dispatchEvent(new CustomEvent('microphone-owner',{detail:'agent'}));const generation=++voiceGeneration;connecting=true;voiceUI(true);error('');voiceState('thinking','Подключаюсь…');$('#voice-caption').textContent='Разрешите доступ к микрофону, чтобы поговорить.';createAudioContext();
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(generation!==voiceGeneration){stream.getTracks().forEach(t=>t.stop());return;}
    mic=stream;micMeter=attachMeter(stream);const peer=new RTCPeerConnection();pc=peer;audio=document.createElement('audio');audio.autoplay=true;audio.setAttribute('playsinline','');audio.style.display='none';document.body.append(audio);
    peer.ontrack=e=>{if(generation!==voiceGeneration||!audio)return;const stream=e.streams[0]||new MediaStream([e.track]);audio.srcObject=stream;outputMeter=attachMeter(stream);audio.play().catch(()=>{if(generation!==voiceGeneration)return;const button=document.createElement('button');button.className='text-link audio-unlock';button.textContent='Включить звук';button.onclick=()=>{audioContext?.resume().catch(()=>{});audio?.play().then(()=>button.remove()).catch(()=>{});};$('#voice-panel').append(button);});};
    mic.getTracks().forEach(track=>peer.addTrack(track,mic));
    channel=peer.createDataChannel('oai-events');channel.onmessage=e=>{if(generation===voiceGeneration)onVoiceEvent(e);};
    channel.onopen=()=>{if(generation!==voiceGeneration)return;voiceActive=true;connecting=false;voiceState('listening','Слушаю…');$('#voice-caption').textContent='Спросите о Тимуре, проектах или своей задаче.';$('#agent-state').textContent='Голосовой разговор';if(history.length)send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'Продолжим предыдущий диалог. Вот его контекст: '+JSON.stringify(history.slice(-8))}]}});send({type:'response.create',response:{instructions:history.length?'Скажи коротко, что готов продолжить разговор голосом. Учти предыдущий диалог.':'Поздоровайся одним коротким предложением: «Привет! Я AI-агент Тимура. Что показать: проекты, опыт или обсудим вашу задачу?»'}});voiceTimer=setTimeout(()=>{stopVoice();showToast('Продолжим с Тимуром? Можно передать ему вашу задачу.');executeSiteAction('open_contact');},5*60*1000);};
    peer.onconnectionstatechange=()=>{if(generation===voiceGeneration&&['failed','disconnected'].includes(peer.connectionState)){stopVoice();error('Соединение прервалось. Можно подключиться ещё раз или написать вопрос.');}};
    const offer=await peer.createOffer();if(generation!==voiceGeneration)return;await peer.setLocalDescription(offer);if(generation!==voiceGeneration)return;
    const r=await fetch('/api/realtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,context:getContext()})});
    if(generation!==voiceGeneration)return;
    if(!r.ok){const body=await r.json();throw new Error(body.error||'Не удалось подключить голос.');}
    const answer=await r.text();if(generation!==voiceGeneration)return;await peer.setRemoteDescription({type:'answer',sdp:answer});
  }catch(e){if(generation!==voiceGeneration)return;stopVoice();const denied=['NotAllowedError','PermissionDeniedError'].includes(e.name);error(denied?'Доступ к микрофону не разрешён. Можно включить его в настройках браузера или написать вопрос.':e.message||'Голос сейчас недоступен. Попробуйте текстовый режим.');}
}
async function onVoiceEvent(event){
  let data;try{data=JSON.parse(event.data);}catch{return;}
  if(data.type==='input_audio_buffer.speech_started'){inputSpeaking=true;awaitingReply=false;outputPlaying=false;activeResponseId=null;voiceState('listening','Слушаю…');}
  if(data.type==='input_audio_buffer.speech_stopped'){inputSpeaking=false;awaitingReply=true;voiceState('thinking','Думаю…');}
  if(data.type==='response.created'){activeResponseId=data.response?.id||null;awaitingReply=true;if(!outputPlaying&&!inputSpeaking)voiceState('thinking','Думаю…');}
  if(['output_audio_buffer.started','response.audio.delta','response.output_audio.delta'].includes(data.type)){outputPlaying=true;awaitingReply=false;if(!inputSpeaking)voiceState('speaking','Рассказываю…');}
  if(['output_audio_buffer.stopped','output_audio_buffer.cleared'].includes(data.type)){outputPlaying=false;voiceState(awaitingReply&&!inputSpeaking?'thinking':'listening',awaitingReply&&!inputSpeaking?'Думаю…':'Слушаю…');}
  if(data.type==='conversation.item.input_audio_transcription.completed'&&data.transcript){$('#voice-caption').textContent=data.transcript;message('user',data.transcript);history.push({role:'user',content:data.transcript});}
  if(['response.audio_transcript.done','response.output_audio_transcript.done'].includes(data.type)&&data.transcript){$('#voice-caption').textContent=data.transcript;message('assistant',data.transcript);history.push({role:'assistant',content:data.transcript});if(!dialog.open)showToast(data.transcript);}
  if(data.type==='response.done'){
    if(activeResponseId&&data.response?.id===activeResponseId&&!continuationPending)awaitingReply=false;
    if(!outputPlaying&&!awaitingReply&&!inputSpeaking)voiceState('listening','Слушаю…');
    if(continuationPending){continuationPending=false;const failed=toolFailed;toolFailed=false;send({type:'response.create',response:{instructions:failed?'Коротко сообщи, что действие не удалось, и предложи выбрать раздел вручную.':'Подтверди выполненное действие одним коротким предложением. Дай посетителю читать страницу.'}});}
  }
  if(data.type==='error'){if(['conversation_already_has_active_response','response_cancel_not_active'].includes(data.error?.code))return;stopVoice();error('Голосовой агент не смог продолжить. Попробуйте текстовый режим.');}
  if(data.type==='response.function_call_arguments.done'){
    let result;
    try{const args=JSON.parse(data.arguments);const action=data.name;const target=args.section_id||args.case_id||args.experience_id||'';result=executeSiteAction(action,target,args.summary||'');}
    catch{result={ok:false,error:'Не удалось открыть информацию. Выберите раздел в меню.'};}
    send({type:'conversation.item.create',item:{type:'function_call_output',call_id:data.call_id,output:JSON.stringify(result)}});
    continuationPending=true;toolFailed=toolFailed||!result.ok;
  }
}
function stopVoice(){
  ++voiceGeneration;clearTimeout(voiceTimer);voiceTimer=null;voiceActive=false;connecting=false;continuationPending=false;toolFailed=false;
  outputPlaying=false;inputSpeaking=false;awaitingReply=false;activeResponseId=null;setOrbAudioReader(null);setOrbLevel(0);setOrbState('idle');$('#agent-state').textContent='Обо мне, проектах и вашей задаче';
  for(const meter of meterGraphs.splice(0)){meter.source.disconnect();meter.analyser.disconnect();}micMeter=null;outputMeter=null;
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}$('.audio-unlock')?.remove();
  if(channel){channel.onmessage=null;channel.close();channel=null;}if(pc){pc.onconnectionstatechange=null;pc.close();pc=null;}
  if(mic){mic.getTracks().forEach(t=>t.stop());mic=null;}if(audio){audio.pause();audio.srcObject=null;audio.remove();audio=null;}voiceUI(false);
}
window.addEventListener('pagehide',()=>{requestController?.abort();stopVoice();});
window.addEventListener('site-context',e=>{if(voiceActive)send({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Текущее состояние сайта: '+JSON.stringify(e.detail)}]}});});

window.addEventListener('microphone-owner',e=>{if(e.detail==='dictation')stopVoice();});
