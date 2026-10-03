// Short fragments of received text, not the model's private token IDs.
// The queue is bounded and has no DOM nodes, timers or conversation storage.
export function createTokenFlow(){
  const queue=[],slots=Array(10).fill(null),streams=new Map();let sequence=0,nextAt=0;
  function feed(text,{role='assistant',id='message',complete=false}={},now=0){
    if(typeof text!=='string'||!text)return;
    const key=role+':'+id,prior=streams.get(key);
    if(prior?.closed||complete&&prior?.started){streams.set(key,{started:true,closed:true});return;}
    streams.set(key,{started:true,closed:complete});
    if(streams.size>64)streams.delete(streams.keys().next().value);
    for(const match of text.slice(0,4000).matchAll(/[\p{L}\p{N}_@]+|[^\s]/gu)){
      const characters=Array.from(match[0]);
      for(let i=0;i<characters.length;i+=6){
        const prefix=i===0&&match.index>0&&/\s/u.test(text[match.index-1])?'▁':'';
        queue.push({text:prefix+characters.slice(i,i+6).join(''),role,received:now});
      }
    }
    if(queue.length>32)queue.splice(0,queue.length-32);
  }
  function read(now,{reduced=false}={}){
    while(queue.length&&now-queue[0].received>3500)queue.shift();
    if(reduced){
      while(queue.length){const fragment=queue.shift();slots[sequence++%slots.length]={...fragment,born:now};}
      return slots.map(item=>item?{text:item.text,role:item.role,alpha:1}:null);
    }
    if(queue.length&&now>=nextAt){
      const count=queue.length>8?3:1;
      for(let i=0;i<count&&queue.length;i++)slots[sequence++%slots.length]={...queue.shift(),born:now};
      nextAt=now+140;
    }
    return slots.map(item=>{
      if(!item)return null;const age=now-item.born;
      const appear=Math.min(1,Math.max(0,age/220)),fade=Math.min(1,Math.max(0,(2800-age)/700));
      const alpha=appear*appear*(3-2*appear)*fade;
      return alpha>0?{text:item.text,role:item.role,alpha}:null;
    });
  }
  function clear(){queue.length=0;slots.fill(null);streams.clear();sequence=0;nextAt=0;}
  return{feed,read,clear,diagnostics:()=>({queued:queue.length,slots:slots.length,streams:streams.size})};
}
