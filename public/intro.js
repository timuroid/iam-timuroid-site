import {refreshOrbs,setOrbIntro} from '/orb.js';

export function initHeroIntro(){
  const root=document.documentElement;
  if(!root.classList.contains('intro-pending'))return;
  const orb=document.querySelector('.hero-orb-button');
  const skip=document.querySelector('.intro-skip');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(!orb||!skip||reduced.matches){
    clearTimeout(window.__introFallback);
    root.classList.remove('intro-pending','intro-reveal','intro-hint');
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
    root.classList.remove('intro-pending','intro-reveal','intro-hint');
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
    const dy=innerHeight*.41-(rect.top+rect.height/2);
    const initial=`translate3d(${dx}px,${dy}px,0) scale(.86)`;
    orb.style.transform=initial;
    refreshOrbs();
    const started=performance.now();
    function form(now){
      if(stopped)return;
      const progress=Math.min(1,(now-started)/1280);
      setOrbIntro(progress*progress*(3-2*progress));
      if(progress<1){frame=requestAnimationFrame(form);return;}
      setOrbIntro(1);
      root.classList.add('intro-reveal');
      orb.style.transition='transform 960ms cubic-bezier(.19,.82,.21,1)';
      orb.style.transform='none';
      refreshOrbs();
      later(()=>root.classList.add('intro-hint'),560);
      later(finish,1680);
    }
    frame=requestAnimationFrame(form);
  }
  start();
}
