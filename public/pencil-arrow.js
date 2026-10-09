// The graphite stroke begins once, when its place in the hero is visible.
// During the opening curtain it begins exactly after the invitation has faded in.
export function initPencilArrow(){
  const arrow=document.querySelector('.agent-invite-arrow');
  if(!arrow)return;
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(reduced.matches){
    arrow.classList.add('is-drawn');
    return;
  }
  const ns='http://www.w3.org/2000/svg';
  const defs=arrow.querySelector('defs');
  const artwork=document.createElementNS(ns,'g');
  const mask=document.createElementNS(ns,'mask');
  mask.setAttribute('id','pencil-reveal');
  mask.setAttribute('maskUnits','userSpaceOnUse');
  mask.setAttribute('x','-85');mask.setAttribute('y','-123');
  mask.setAttribute('width','510');mask.setAttribute('height','736');
  defs.append(mask);
  // Mask the finished graphite output, so its filter does not regenerate
  // against a changing partially drawn input on each frame.
  for(const group of [...arrow.children].filter(node=>node.tagName.toLowerCase()==='g'))artwork.append(group);
  artwork.setAttribute('mask','url(#pencil-reveal)');arrow.append(artwork);
  // Reveal the textured strokes through unscaled masks. Drawing on the artwork
  // itself mixes pathLength with non-scaling-stroke at small SVG sizes.
  function revealMask(kind){
    const strokes=[...arrow.querySelectorAll(`.arrow-${kind}`)];
    const line=document.createElementNS(ns,'path');
    line.setAttribute('id',`pencil-reveal-${kind}`);
    line.setAttribute('d',strokes[0].getAttribute('d'));
    line.setAttribute('fill','none');line.setAttribute('stroke','white');
    line.setAttribute('stroke-width','40');
    line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');
    mask.append(line);
    const length=line.getTotalLength();
    line.setAttribute('stroke-dasharray',`${length} ${length}`);
    line.setAttribute('stroke-dashoffset',String(length));
    line.setAttribute('opacity','0');
    return{line,length};
  }
  const body=revealMask('stem'),tip=revealMask('head');
  const frames=[[0,1],[.18,.76],[.52,.43],[.67,.24],[1,0]];
  function ease(value){
    let low=0,high=1;
    const curve=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
    for(let i=0;i<14;i++){const t=(low+high)/2;if(curve(t,.42,.58)<value)low=t;else high=t;}
    return curve((low+high)/2,0,1);
  }
  function drawPart(part,progress,points){
    if(progress<=0)return;
    if(progress>=1){part.line.setAttribute('opacity','1');part.line.setAttribute('stroke-dashoffset','0');return;}
    const t=ease(Math.min(1,progress));
    let offset=0;
    for(let i=1;i<points.length;i++){
      if(t<=points[i][0]){
        const [from,a]=points[i-1],[to,b]=points[i];
        offset=a+(b-a)*(t-from)/(to-from);break;
      }
    }
    part.line.setAttribute('opacity','1');
    part.line.setAttribute('stroke-dashoffset',String(part.length*offset));
  }
  const invitation=document.querySelector('.agent-home-space');
  let visible=false,started=false,launchTimer,stopWaiting;
  const ready=()=>!root.classList.contains('intro-pending')||root.classList.contains('intro-hint');
  function launch(){
    stopWaiting?.();stopWaiting=null;
    clearTimeout(launchTimer);
    launchTimer=null;
    if(started||!visible)return;
    started=true;
    arrow.classList.add('is-drawing');
    window.dispatchEvent(new Event('site-arrow-start'));
    let began;
    function draw(now){
      began??=now;
      const elapsed=now-began;
      drawPart(body,elapsed/780,frames);
      drawPart(tip,(elapsed-760)/240,[[0,1],[1,0]]);
      if(elapsed<1000)requestAnimationFrame(draw);
      else arrow.classList.add('is-drawn');
    }
    requestAnimationFrame(draw);
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
