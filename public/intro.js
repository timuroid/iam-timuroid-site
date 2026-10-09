import {refreshOrbs,setOrbIntro} from '/orb.js';

export function initHeroIntro(){
  const root=document.documentElement;
  if(!root.classList.contains('intro-pending'))return;
  const orb=document.querySelector('.hero-orb-button');
  const skip=document.querySelector('.intro-skip');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(!orb||!skip||reduced.matches){
    clearTimeout(window.__introFallback);
    root.classList.remove('intro-pending','intro-reveal','intro-name','intro-role-one','intro-role-two','intro-personal','intro-hint','intro-cta');
    setOrbIntro(1);
    return;
  }

  let stopped=false,frame=0;
  const timers=[];
  const later=(callback,delay)=>timers.push(setTimeout(callback,delay));
  function finish(){
    if(stopped)return;
    stopped=true;
    cancelAnimationFrame(frame);
    for(const timer of timers)clearTimeout(timer);
    clearTimeout(window.__introFallback);
    orb.style.transition='none';
    orb.style.transform='none';
    root.classList.remove('intro-pending','intro-reveal','intro-name','intro-role-one','intro-role-two','intro-personal','intro-hint','intro-cta');
    setOrbIntro(1);refreshOrbs();
    requestAnimationFrame(()=>{orb.style.transition='';orb.style.transform='';});
    skip.removeEventListener('click',finish);
    document.querySelector('.skip-link')?.removeEventListener('click',finish);
    document.removeEventListener('click',finishForNavigation,true);
    window.removeEventListener('keydown',onKeydown);
    window.removeEventListener('resize',finish);
    window.removeEventListener('scroll',finish);
    window.removeEventListener('wheel',finish);
    window.removeEventListener('touchmove',finish);
    window.removeEventListener('pagehide',finish);
    window.removeEventListener('site-intro-timeout',finish);
    document.removeEventListener('visibilitychange',onVisibility);
    reduced.removeEventListener('change',onMotionChange);
  }
  function onKeydown(event){if(['Escape','ArrowDown','PageDown',' '].includes(event.key))finish();}
  function onMotionChange(){if(reduced.matches)finish();}
  function onVisibility(){if(document.hidden)finish();}
  function finishForNavigation(event){if(event.target instanceof Element&&event.target.closest('a[href],[data-open-agent]'))finish();}
  skip.addEventListener('click',finish);
  document.querySelector('.skip-link')?.addEventListener('click',finish);
  document.addEventListener('click',finishForNavigation,true);
  window.addEventListener('keydown',onKeydown);
  window.addEventListener('resize',finish);
  window.addEventListener('scroll',finish,{passive:true});
  window.addEventListener('wheel',finish,{passive:true});
  window.addEventListener('touchmove',finish,{passive:true});
  window.addEventListener('pagehide',finish);
  window.addEventListener('site-intro-timeout',finish);
  document.addEventListener('visibilitychange',onVisibility);
  reduced.addEventListener('change',onMotionChange);

  async function start(){
    // Font loading can change the final hero position. The white curtain is
    // already present, so wait briefly before measuring the real canvas host.
    await Promise.race([document.fonts?.ready||Promise.resolve(),new Promise(resolve=>setTimeout(resolve,650))]);
    if(stopped)return;
    const rect=orb.getBoundingClientRect();
    if(!rect.width||!rect.height){finish();return;}
    const dx=innerWidth/2-(rect.left+rect.width/2);
    const dy=innerHeight*.39-(rect.top+rect.height/2);
    const initial=`translate3d(${dx}px,${dy}px,0) scale(.86)`;
    orb.style.transform=initial;
    refreshOrbs();
    const started=performance.now();
    function form(now){
      if(stopped)return;
      const progress=Math.min(1,(now-started)/2500);
      setOrbIntro(progress);
      if(progress<1){frame=requestAnimationFrame(form);return;}
      setOrbIntro(1);
      root.classList.add('intro-reveal');
      orb.style.transition='transform 1350ms cubic-bezier(.19,.82,.21,1)';
      orb.style.transform='none';
      refreshOrbs();
      later(()=>root.classList.add('intro-name'),220);
      later(()=>root.classList.add('intro-role-one'),950);
      later(()=>root.classList.add('intro-role-two'),1430);
      later(()=>root.classList.add('intro-personal'),1850);
      later(()=>root.classList.add('intro-hint'),2290);
      // The invitation is visible first, then its hand-drawn arrow completes.
      // Action buttons only begin after that one-second drawing is complete.
      later(()=>root.classList.add('intro-cta'),3980);
      later(finish,5350);
    }
    frame=requestAnimationFrame(form);
  }
  start();
}
