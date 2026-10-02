// Optional tactile feedback, requested synchronously by a real user click.
// Direct taps on a real native switch use the browser's own tactile feedback.
// The hidden fallback is a compatibility attempt: newer WebKit deliberately
// blocks its untrusted forwarded click (fc1ef83eae10).
const handledClicks=new WeakSet();
let lastRequest=-Infinity;
let nativeBridge=null;
let cleanupAttached=false;

/** Returns whether the browser exposes native switch controls, not whether its device can vibrate. */
export function supportsNativeSwitch(){
  return typeof HTMLInputElement!=='undefined'&&'switch' in HTMLInputElement.prototype;
}

/** Enhance a real checkbox. Kept for callers that still use a native switch. */
export function enhanceNativeSwitch(input){
  if(typeof HTMLInputElement==='undefined'||!(input instanceof HTMLInputElement)||input.type!=='checkbox')return false;
  input.setAttribute('switch','');
  return supportsNativeSwitch();
}

/**
 * Opt in one microphone toggle to direct native activation. Call before binding
 * its behavior, then bind change on the returned input. No controls are mounted
 * automatically; unsupported browsers keep the original button and return null.
 */
export function mountNativeHapticToggle(button){
  if(!supportsNativeSwitch()||typeof HTMLButtonElement==='undefined')return null;
  if(typeof HTMLLabelElement!=='undefined'&&button instanceof HTMLLabelElement&&button.classList.contains('native-haptic-control'))return button.querySelector('input[type="checkbox"][switch]');
  if(!(button instanceof HTMLButtonElement))return null;
  const wrapper=document.createElement('label');
  for(const{name,value}of [...button.attributes]){
    if(name==='id'||name==='class'||name==='title'||name.startsWith('aria-')||name.startsWith('data-'))wrapper.setAttribute(name,value);
  }
  wrapper.classList.add('native-haptic-control');
  if(!wrapper.hasAttribute('data-mic'))wrapper.dataset.mic='';
  wrapper.style.position='relative';
  const visual=document.createElement('span');
  visual.className='native-haptic-visual';
  visual.setAttribute('aria-hidden','true');
  visual.style.cssText='display:contents;pointer-events:none;';
  while(button.firstChild)visual.append(button.firstChild);
  const input=document.createElement('input');
  input.type='checkbox';
  input.setAttribute('switch','');
  input.setAttribute('role','switch');
  for(const name of ['aria-label','aria-labelledby','aria-describedby','aria-controls']){
    const value=button.getAttribute(name);
    if(value!==null)input.setAttribute(name,value);
  }
  if(!input.hasAttribute('aria-label')&&!input.hasAttribute('aria-labelledby'))input.setAttribute('aria-label',button.title||visual.textContent.trim()||'Голосовое общение');
  input.checked=button.getAttribute('aria-pressed')==='true';
  input.disabled=button.disabled;
  // Opacity keeps this real control in WebKit's event regions. Visibility:hidden,
  // display:none, pointer-events:none or a programmatic click would defeat it.
  input.style.cssText='position:absolute;inset:0;box-sizing:border-box;width:100%;height:100%;margin:0;opacity:0;appearance:auto;pointer-events:auto;z-index:2;cursor:inherit;';
  wrapper.append(visual,input);
  button.replaceWith(wrapper);
  return input;
}

function isNativeSwitchControl(input){
  return supportsNativeSwitch()&&input instanceof HTMLInputElement&&input.type==='checkbox'&&input.hasAttribute('switch')&&!input.disabled;
}

/** Remove only the optional control owned by this module. No vibration is scheduled. */
export function cleanupHaptics(){
  nativeBridge?.label.remove();
  nativeBridge=null;
  lastRequest=-Infinity;
}

function nativeHost(event){
  const target=event.target instanceof Element?event.target:event.target?.parentElement;
  const dialog=target?.closest('dialog[open]');
  if(dialog)return dialog;
  // A modal dialog makes the rest of the document inert. Keep the helper within
  // the open dialog even when the initiating button has just opened it.
  const focusedDialog=document.activeElement?.closest('dialog[open]');
  if(focusedDialog)return focusedDialog;
  const dialogs=document.querySelectorAll('dialog[open]');
  return dialogs[dialogs.length-1]||document.body;
}

function requestNativeSwitch(event){
  if(!supportsNativeSwitch()||typeof document==='undefined')return false;
  const host=nativeHost(event);
  if(!host)return false;
  if(!nativeBridge){
    const label=document.createElement('label');
    const input=document.createElement('input');
    label.setAttribute('aria-hidden','true');
    // Keep a native renderer without a visible or focusable control. Do not use
    // an offscreen label: its default activation can otherwise scroll the page.
    label.style.cssText='position:fixed!important;left:0!important;top:0!important;width:1px!important;height:1px!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important;';
    input.type='checkbox';
    input.tabIndex=-1;
    input.setAttribute('switch','');
    input.style.cssText='appearance:auto!important;display:block!important;visibility:hidden!important;';
    const bridge={label,input,trustedForwardedClick:false};
    input.addEventListener('click',forwarded=>{
      bridge.trustedForwardedClick=forwarded.isTrusted;
      forwarded.stopPropagation();
    });
    // Stop bubbling only; preventing the default would prevent the switch tick.
    label.addEventListener('click',forwarded=>forwarded.stopPropagation());
    label.append(input);
    nativeBridge=bridge;
    if(!cleanupAttached){
      window.addEventListener('pagehide',cleanupHaptics);
      cleanupAttached=true;
    }
  }
  const {label,input}=nativeBridge;
  if(label.parentElement!==host)host.append(label);
  nativeBridge.trustedForwardedClick=false;
  const checkedBefore=input.checked;
  const focusBefore=document.activeElement;
  try{
    // This is intentionally a single compatibility attempt inside the original
    // trusted gesture. No timer, artificial trusted event or repeated pulse.
    label.click();
    return nativeBridge.trustedForwardedClick&&input.checked!==checkedBefore;
  }catch{
    return false;
  }finally{
    if(document.activeElement===input&&focusBefore?.isConnected){
      try{focusBefore.focus({preventScroll:true});}catch{/* Optional feedback must not affect the UI. */}
    }
  }
}

/**
 * Call synchronously from a trusted click handler. True means the vibration API
 * accepted a request or the native switch accepted a trusted activation; it does
 * not prove physical feedback. Native switches ignore the requested pattern and
 * can only produce their system tick. Unsupported/blocked paths return false.
 * For a transparent control over a microphone icon, use a real focusable input
 * with opacity:0 and appearance:auto, handle change, and keep click default
 * activation. Do not nest that input in a button or call its .click() method.
 */
export function requestHaptic(event,pattern=14){
  if(typeof Event==='undefined'||!(event instanceof Event)||event.type!=='click'||!event.isTrusted||handledClicks.has(event))return false;
  handledClicks.add(event);
  if(typeof navigator==='undefined'||navigator.userActivation?.isActive===false)return false;
  const now=performance.now();
  // Native switch activation already owns the tick. Never add a second hidden
  // switch activation or vibration request to this same real control click.
  if(isNativeSwitchControl(event.target)&&!event.defaultPrevented){lastRequest=now;return true;}
  // A click on a label can forward a second click to its input.
  if(now-lastRequest<100)return false;
  const values=Array.isArray(pattern)?pattern:[pattern];
  if(!values.length||values.length>7||values.some(value=>!Number.isFinite(value)||value<0||value>100)||!values.some((value,index)=>index%2===0&&value>0))return false;
  // Cool down attempts too: a blocked API must not cause duplicate requests.
  lastRequest=now;
  if(typeof navigator.vibrate==='function'){
    try{if(navigator.vibrate(Array.isArray(pattern)?values:values[0]))return true;}catch{/* Try the optional native path. */}
  }
  try{return requestNativeSwitch(event);}catch{return false;}
}
