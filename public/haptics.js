// Optional tactile feedback, requested synchronously by a real user click.
// The hidden native-switch path is a compatibility attempt, not a vibration API:
// newer WebKit deliberately blocks its untrusted forwarded click (fc1ef83eae10).
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
 */
export function requestHaptic(event,pattern=14){
  if(typeof Event==='undefined'||!(event instanceof Event)||event.type!=='click'||!event.isTrusted||handledClicks.has(event))return false;
  handledClicks.add(event);
  if(typeof navigator==='undefined'||navigator.userActivation?.isActive===false)return false;
  const now=performance.now();
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
