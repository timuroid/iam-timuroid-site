// The graphite stroke begins once, when its place in the hero is visible.
// During the opening curtain it waits for the agent hint to appear.
export function initPencilArrow(){
  const arrow=document.querySelector('.agent-invite-arrow');
  if(!arrow)return;
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(reduced.matches){arrow.classList.add('is-drawn');return;}
  let visible=false,started=false;
  const ready=()=>!root.classList.contains('intro-pending')||root.classList.contains('intro-hint');
  function start(){
    if(started||!visible||!ready())return;
    started=true;
    arrow.classList.add('is-drawing');
    observer.disconnect();mutation.disconnect();
  }
  const observer=new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);
    start();
  },{threshold:.2});
  const mutation=new MutationObserver(start);
  mutation.observe(root,{attributes:true,attributeFilter:['class']});
  observer.observe(arrow);
}
