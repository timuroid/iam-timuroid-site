// Dictation creates an editable message; submission remains a separate action.
export function initDictation(){
  const button=document.querySelector('#dictate-request'),cancel=document.querySelector('#cancel-dictation'),status=document.querySelector('#dictation-status'),field=document.querySelector('#request-message'),form=document.querySelector('#contact-form');
  let recorder,stream,timer,controller,generation=0,mode='idle',chunks=[];
  function ui(next,text=''){
    mode=next;button.dataset.state=next;button.setAttribute('aria-pressed',String(next==='recording'));
    button.querySelector('span').textContent=next==='recording'?'Остановить':next==='processing'?'Расшифровываю…':next==='permission'?'Подключаюсь…':'Наговорить';
    form.dataset.dictating=String(next!=='idle');
    button.disabled=['permission','processing'].includes(next)||form.dataset.pending==='true';cancel.hidden=next==='idle';status.textContent=text;
    form.querySelector('button[type=submit]').disabled=next!=='idle'||form.dataset.submitted==='true'||form.dataset.pending==='true';
  }
  function release(){clearTimeout(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;}
  function reset(text=''){
    ++generation;controller?.abort();controller=null;
    if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}recorder=null;release();chunks=[];ui('idle',text);
  }
  async function transcribe(token,type){
    release();if(token!==generation)return;
    const blob=new Blob(chunks,{type});chunks=[];recorder=null;
    if(!blob.size){ui('idle','Запись не получилась. Попробуйте ещё раз.');return;}
    if(blob.size>10*1024*1024){ui('idle','Запись слишком большая. Попробуйте рассказать короче.');return;}
    ui('processing','Перевожу голос в текст…');controller=new AbortController();
    try{
      const data=new FormData();const extension=type.includes('mp4')?'mp4':type.includes('ogg')?'ogg':'webm';data.append('audio',blob,'message.'+extension);
      const response=await fetch('/api/transcribe',{method:'POST',body:data,signal:controller.signal});const result=await response.json();
      if(token!==generation)return;if(!response.ok)throw new Error(result.error||'Не удалось распознать запись.');
      const text=String(result.text||'').trim();if(!text)throw new Error('Не удалось разобрать речь. Попробуйте ещё раз.');
      const existing=field.value.trim();const combined=existing?existing+'\n\n'+text:text;
      field.value=combined.slice(0,4000);field.dispatchEvent(new Event('input',{bubbles:true}));
      ui('idle',combined.length>4000?'Текст добавлен до лимита 4000 символов. Проверьте его перед отправкой.':'Готово. Проверьте текст перед отправкой.');
    }catch(e){if(token===generation&&e.name!=='AbortError')ui('idle',e.message||'Не удалось распознать запись. Можно попробовать ещё раз.');}
    finally{if(token===generation)controller=null;}
  }
  async function start(){
    if(mode==='recording'){if(recorder?.state==='recording')recorder.stop();release();return;}
    if(mode!=='idle'||form.dataset.pending==='true')return;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){ui('idle','В этом браузере запись недоступна. Можно написать сообщение.');return;}
    window.dispatchEvent(new CustomEvent('microphone-owner',{detail:'dictation'}));const token=++generation;ui('permission','Разрешите доступ к микрофону.');
    try{
      const acquired=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;
      const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      recorder=new MediaRecorder(stream,type?{mimeType:type}:{});chunks=[];
      recorder.ondataavailable=e=>{if(token===generation&&e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>transcribe(token,recorder?.mimeType||type||'audio/webm');
      recorder.onerror=()=>{if(token===generation)reset('Запись прервалась. Попробуйте ещё раз.');};
      recorder.start(1000);ui('recording','Идёт запись. Нажмите «Остановить», когда закончите.');
      timer=setTimeout(()=>{if(token===generation&&recorder?.state==='recording'){recorder.stop();release();}},120000);
    }catch(e){if(token!==generation)return;release();ui('idle',e.name==='NotAllowedError'?'Доступ к микрофону не разрешён. Включите его в браузере или напишите сообщение.':'Не удалось включить микрофон. Можно попробовать ещё раз.');}
  }
  button.addEventListener('click',start);cancel.addEventListener('click',()=>reset('Запись отменена.'));
  window.addEventListener('microphone-owner',e=>{if(e.detail!=='dictation'&&mode!=='idle')reset('Запись остановлена.');});
  window.addEventListener('pagehide',()=>reset());
  form.addEventListener('contact-state',()=>ui(mode,status.textContent));
  window.addEventListener('site-context',e=>{if(e.detail.current_page!=='/'&&mode!=='idle')reset();});
}
