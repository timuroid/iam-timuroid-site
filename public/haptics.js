// Optional tactile feedback. Native iPhone switch feedback comes from the
// browser's real checkbox activation; this module never synthesizes a click.
const handledClicks=new WeakSet();
let lastRequest=-Infinity;

/** Returns whether the browser exposes native switch controls, not whether its device can vibrate. */
export function supportsNativeSwitch(){
  return typeof HTMLInputElement!=='undefined'&&'switch' in HTMLInputElement.prototype;
}

/** Enhance a real, labelled checkbox. Keep it visible, focusable and directly tappable. */
export function enhanceNativeSwitch(input){
  if(typeof HTMLInputElement==='undefined'||!(input instanceof HTMLInputElement)||input.type!=='checkbox')return false;
  input.setAttribute('switch','');
  return supportsNativeSwitch();
}

/** Call synchronously from a trusted click handler. Returns whether vibration was accepted. */
export function requestHaptic(event,pattern=14){
  if(!(event instanceof Event)||event.type!=='click'||!event.isTrusted||handledClicks.has(event))return false;
  handledClicks.add(event);
  if(typeof navigator.vibrate!=='function'||navigator.userActivation?.isActive===false)return false;
  const now=performance.now();
  // A click on a label can forward a second click to its input.
  if(now-lastRequest<100)return false;
  const values=Array.isArray(pattern)?pattern:[pattern];
  if(!values.length||values.length>7||values.some(value=>!Number.isFinite(value)||value<0||value>100))return false;
  try{
    const accepted=navigator.vibrate(Array.isArray(pattern)?values:values[0]);
    if(accepted)lastRequest=now;
    return accepted;
  }catch{return false;}
}
