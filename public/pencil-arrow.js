// The graphite stroke begins once, when its place in the hero is visible.
// During the opening curtain it begins exactly after the invitation has faded in.
export function initPencilArrow(){
  const arrow=document.querySelector('.agent-invite-arrow');
  if(!arrow)return;
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(reduced.matches){arrow.classList.add('is-drawn');return;}
  const invitation=document.querySelector('.agent-home-space');
  let visible=false,started=false,launchTimer,stopWaiting;
  const ready=()=>!root.classList.contains('intro-pending')||root.classList.contains('intro-hint');
  function launch(){
    stopWaiting?.();stopWaiting=null;
    clearTimeout(launchTimer);
    launchTimer=null;
    if(started)return;
    started=true;
    arrow.classList.add('is-drawing');
    observer.disconnect();mutation.disconnect();
  }
  function waitForInvitation(){
    if(!invitation){launch();return;}
    let finished=false;
    const finish=()=>{
      if(finished)return;
      finished=true;
      invitation.removeEventListener('transitionend',onTransitionEnd);
      launch();
    };
    const onTransitionEnd=event=>{
      if(event.target===invitation&&event.propertyName==='opacity')finish();
    };
    stopWaiting=()=>{
      invitation.removeEventListener('transitionend',onTransitionEnd);
      clearTimeout(launchTimer);
    };
    invitation.addEventListener('transitionend',onTransitionEnd);
    // A fallback keeps the arrow available if a browser suppresses CSS
    // transition events in the background.
    launchTimer=setTimeout(finish,720);
  }
  function start(){
    if(started||launchTimer||!visible||!ready())return;
    if(root.classList.contains('intro-pending'))waitForInvitation();
    else launch();
  }
  const observer=new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);
    start();
  },{threshold:.2});
  const mutation=new MutationObserver(start);
  mutation.observe(root,{attributes:true,attributeFilter:['class']});
  observer.observe(arrow);
}
