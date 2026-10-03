// Real 3D coordinates projected into a shared, transparent Canvas surface.
// Connections and node identities are stable; only projection and light move.
const tau=Math.PI*2;
const tokens=['▁по','мыс','▁как','за','ние','▁мы','дан','ость','▁я','про','ать','▁и','ток','смы','▁что','реш'];
export function createNetwork(count=186){
  const nodes=[];
  for(let i=0;i<count;i++){
    const y=1-2*(i+.5)/count,angle=i*Math.PI*(3-Math.sqrt(5));
    const radius=Math.sqrt(1-y*y),shell=i%9===0?.54:.94+.065*Math.sin(i*2.1)+.045*Math.cos(i*.73);
    nodes.push({x:Math.cos(angle)*radius*shell,y:y*shell,z:Math.sin(angle)*radius*shell,id:i,token:tokens[i%tokens.length],shell});
  }
  const edges=[];
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
    const a=nodes[i],b=nodes[j],distance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
    if(distance<.38&&(i%9!==0||j%9!==0))edges.push({a:i,b:j,phase:(i*.137+j*.073)%1});
  }
  // Long links weave through the core. Their identities remain stable while
  // the illuminated paths change, so the volume never collapses into a cage.
  for(let i=0;i<count;i+=9){
    edges.push({a:i,b:(i+Math.floor(count*.43))%count,phase:(i*.17)%1,inner:true});
    edges.push({a:i,b:(i+Math.floor(count*.71))%count,phase:(i*.23)%1,inner:true});
  }
  for(let i=4;i<count;i+=17)edges.push({a:i,b:(i+Math.floor(count*.49))%count,phase:(i*.31)%1,inner:true});
  return {nodes,edges};
}
export function paintNetwork(ctx,size,network,{time=0,energy=0,speechActivity,waveform=null,liveTokens=null,impulse=0,pointer=[0,0],reduced=false,state='idle'}={}){
  ctx.clearRect(0,0,size,size);
  const unit=size*.31,c=size/2,ay=time*.12+pointer[0]*.12,ax=-.22+pointer[1]*.12;
  const cy=Math.cos(ay),sy=Math.sin(ay),cx=Math.cos(ax),sx=Math.sin(ax);
  const activity=reduced?0:state==='speaking'?.36+energy*.65:state==='thinking'?.28:state==='listening'?.09+energy*.65:0;
  const speech=reduced?0:Number.isFinite(speechActivity)?speechActivity:state==='speaking'?1:0;
  const expansion=1+impulse*.025;
  const points=network.nodes.map(n=>{
    const burst=n.id%13===0?Math.pow((1+Math.sin(time*.72+n.id*.91))/2,5):0;
    const envelope=waveform?.length?waveform[n.id%waveform.length]:energy;
    const spoke=Math.pow((1+Math.sin(time*4.6+n.id*.83))/2,3);
    // Live audio stretches surface vertices into individual spikes. The inner
    // vertices move less, keeping long links readable through the open volume.
    const audioSpike=speech*Math.min(.38,Math.max(.025,envelope)*(.18+.5*spoke))*(n.shell>.7?1:.16);
    const breathing=reduced?1:1+.024*Math.sin(time*.65+n.id*.38)+activity*(.045*Math.sin(time*1.3+n.id*.53)+burst*.14)+audioSpike;
    const x=(n.x*cy+n.z*sy)*breathing,y=(n.y*cx-(-n.x*sy+n.z*cy)*sx)*breathing,z=(n.y*sx+(-n.x*sy+n.z*cy)*cx)*breathing;
    const perspective=3.8/(3.8-z);
    return {x:c+x*unit*perspective*expansion,y:c+y*unit*perspective*expansion,z,scale:perspective};
  });
  // No sphere fill or background: only a transparent, three-dimensional graph.
  for(let bin=0;bin<10;bin++){
    ctx.beginPath();
    for(const edge of network.edges){
      const a=points[edge.a],b=points[edge.b],depth=(a.z+b.z)*.5;
      if(Math.max(0,Math.min(9,Math.floor((depth+1)*5)))!==bin)continue;
      if(edge.inner&&Math.sin(time*.5+edge.phase*tau)<-.35)continue;
      ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
    }
    ctx.lineWidth=Math.max(.55,size*.0015);
    ctx.strokeStyle=`rgba(${bin>5?'17,43,69':'39,72,100'},${.1+bin*.055+energy*.06})`;ctx.stroke();
  }
  // The rear nodes are drawn first. Sparse glyphs are anchored to this graph.
  const ordered=points.map((p,i)=>({...p,id:i})).sort((a,b)=>a.z-b.z);
  const live=liveTokens?.some(Boolean),detailed=size>=200,step=size<200?3:1;
  for(const p of ordered){
    const slot=p.id%17===4?(p.id-4)/17:-1,label=slot>=0?liveTokens?.[slot]:null;
    if(p.id%step&&!label)continue;
    const front=Math.max(0,Math.min(1,(p.z+1)*.5)),active=(Math.sin(p.id*.91+time*.8)+1)*.5;
    const r=(.75+front*.85)*size/400*(1+energy*.22);
    ctx.fillStyle=`rgba(${p.id%19===0?'37,76,111':'11,32,54'},${.3+front*.7})`;
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.65,r),0,tau);ctx.fill();
    if(front>.57&&active>.7){
      ctx.fillStyle=`rgba(38,80,114,${(.12+energy*.16)*active})`;ctx.beginPath();ctx.arc(p.x,p.y,r*2.3,0,tau);ctx.fill();
      ctx.fillStyle='rgba(16,43,69,.95)';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.6,r*.6),0,tau);ctx.fill();
    }
    if((live?size>=150&&label:detailed&&p.id%13===0)&&p.z>-.45){
      ctx.font=`${Math.max(live?12:9,size*.029)}px ui-monospace,Menlo,monospace`;
      const opacity=(.5+front*.45)*(label?.alpha??1);
      ctx.fillStyle=`rgba(${label?.role==='user'?'126,90,59':'22,51,77'},${opacity})`;
      ctx.fillText(label?.text||network.nodes[p.id].token,p.x+size*.012,p.y-size*.009);
    }
  }
  if(!reduced)for(let i=0;i<network.edges.length;i+=activity>.25?19:37){
    const edge=network.edges[i],a=points[edge.a],b=points[edge.b];
    if((a.z+b.z)*.5<-.2)continue;
    const t=(time*(.11+activity*.27)+edge.phase)%1;
    const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    ctx.fillStyle=`rgba(29,73,108,${.5+energy*.4})`;ctx.beginPath();ctx.arc(x,y,Math.max(.7,size*.003),0,tau);ctx.fill();
  }
}
