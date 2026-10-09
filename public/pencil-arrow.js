// The graphite stroke begins once, when its place in the hero is visible.
// During the opening curtain it begins exactly after the invitation has faded in.
export function initPencilArrow(){
  const arrow=document.querySelector('.agent-invite-arrow');
  if(!arrow)return;
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const stems=[...arrow.querySelectorAll('.arrow-stem')];
  const heads=[...arrow.querySelectorAll('.arrow-head')];
  const paths=[...stems,...heads];
  const prepare=path=>{
    const length=path.getTotalLength();
    path.style.strokeDasharray=String(length);
    path.style.strokeDashoffset=String(length);
    return length;
  };
  if(reduced.matches){
    paths.forEach(path=>{prepare(path);path.style.strokeDashoffset='0';});
    arrow.classList.add('is-drawn');
    return;
  }
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
    // Variant 1: hand-drawn line. The stem starts at the bottom of the SVG
    // path; its speed changes slightly while the tip begins at 760ms.
    for(const path of stems){
      const length=prepare(path);
      path.animate([
        {strokeDashoffset:length,offset:0},
        {strokeDashoffset:length*.76,offset:.18},
        {strokeDashoffset:length*.43,offset:.52},
        {strokeDashoffset:length*.24,offset:.67},
        {strokeDashoffset:0,offset:1}
      ],{duration:780,easing:'ease-in-out',fill:'forwards'});
    }
    for(const path of heads){
      const length=prepare(path);
      path.animate([
        {strokeDashoffset:length,offset:0},
        {strokeDashoffset:0,offset:1}
      ],{duration:240,delay:760,easing:'ease-in-out',fill:'forwards'});
    }
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
