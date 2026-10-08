// The graphite stroke begins once, when its place in the hero is visible.
// During the opening curtain it waits until the invitation text has finished
// appearing, so the visitor can actually see the pencil line being drawn.
export function initPencilArrow(){
  const arrow=document.querySelector('.agent-invite-arrow');
  if(!arrow)return;
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(reduced.matches){arrow.classList.add('is-drawn');return;}
  let visible=false,started=false,launchTimer;
  const ready=()=>!root.classList.contains('intro-pending')||root.classList.contains('intro-hint');
  function launch(){
    launchTimer=null;
    if(started)return;
    started=true;
    arrow.classList.add('is-drawing');
    observer.disconnect();mutation.disconnect();
  }
  function start(){
    if(started||launchTimer||!visible||!ready())return;
    // .agent-home-space fades in for 600ms. Starting immediately would draw
    // the line while the whole invitation is still transparent.
    const delay=root.classList.contains('intro-pending')?620:0;
    launchTimer=setTimeout(launch,delay);
  }
  const observer=new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);
    start();
  },{threshold:.2});
  const mutation=new MutationObserver(start);
  mutation.observe(root,{attributes:true,attributeFilter:['class']});
  observer.observe(arrow);
}
