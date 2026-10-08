(function(root,factory){
  const timing=typeof module==='object'&&module.exports?require('./orchestra-timing.js'):root&&root.OrchestraTiming;
  const data=typeof module==='object'&&module.exports?require('./orchestra-pulse-data.js'):root&&root.OrchestraPulseData;
  const api=factory(timing,data);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.OrchestraPulse=api;
})(typeof window!=='undefined'?window:null,function(timing,defaultData){
  'use strict';

  const LIMIT=5000,HOLD=/\b(?:fermata|hold|pause)\b/i;
  const unavailable=status=>({bar:null,beat:null,beatsPerBar:null,meter:null,phase:null,hold:false,
    movement:null,status:status||'unavailable',approximate:true});

  function label(value){return typeof value==='string'?value.slice(0,240):'';}
  function audioURL(path,playerUrl){
    if(typeof path!=='string'||!path||path.length>2048||/[\\\u0000-\u001f]/.test(path)||
      /^\/\//.test(path)||/^[a-z][a-z0-9+.-]*:/i.test(path))return null;
    try{
      const base=new URL(playerUrl),url=new URL(path,base),directory=new URL('.',base);
      if(!/^https?:$/.test(base.protocol)||url.origin!==base.origin||!url.pathname.startsWith(directory.pathname))return null;
      return url.href;
    }catch(_error){return null;}
  }
  function rhythm(raw,duration){
    if(!timing||!raw||!Array.isArray(raw.bars)||raw.bars.length>LIMIT)return null;
    if(raw.bars.some(row=>!row||!Array.isArray(row.beats)||row.beats.length>16))return null;
    try{return timing.normalizeRhythm(raw,duration);}catch(_error){return null;}
  }
  function numbered(row){
    if(Number.isInteger(row.bar)&&row.bar>0)return row.bar;
    const match=String(row.label||'').match(/\bbar\s*(\d{1,4})\b/i);
    return match?Number(match[1]):null;
  }
  function holds(bundle,clock){
    const out=[];
    for(const row of clock&&clock.bars||[]){
      if(Array.isArray(row.doubts)&&row.doubts.length<=64&&row.doubts.some(text=>HOLD.test(label(text))))
        out.push({bar:row.bar,start:row.time,end:row.end,meter:row.meter});
    }
    const spans=Array.isArray(bundle.spans)&&bundle.spans.length<=2000?bundle.spans:[];
    for(const span of spans){
      const bar=span&&numbered(span);
      if(bar&&HOLD.test(label(span.label))&&Number.isFinite(span.start)&&Number.isFinite(span.end)&&
        span.start>=0&&span.end>span.start&&span.end<=bundle.duration)
        out.push({bar,start:span.start,end:span.end,meter:null});
    }
    const markers=Array.isArray(bundle.markers)&&bundle.markers.length<=2000?bundle.markers:[];
    for(let i=0;i<markers.length;i++){
      const row=markers[i],bar=row&&numbered(row),end=i+1<markers.length?markers[i+1].time:bundle.duration;
      if(bar&&HOLD.test(label(row.label))&&Number.isFinite(row.time)&&Number.isFinite(end)&&
        row.time>=0&&end>row.time&&end<=bundle.duration)
        out.push({bar,start:row.time,end,meter:null});
    }
    return out.sort((a,b)=>a.start-b.start||a.end-b.end);
  }
  function guide(source,duration){
    if(!source||typeof source!=='object')return null;
    const clock=rhythm(source.rhythm,duration);
    if(!clock)return null;
    const extra=source.holds==null?[]:source.holds;
    if(!Array.isArray(extra)||extra.length>LIMIT)return null;
    const rawHolds=[...holds({...source,duration},clock),...extra];
    if(rawHolds.length>LIMIT||rawHolds.some(row=>!row||!Number.isInteger(row.bar)||
      row.bar<1||!Number.isFinite(row.start)||!Number.isFinite(row.end)||row.start<0||row.end<=row.start||row.end>duration))return null;
    return {id:label(source.id),label:label(source.label)||'Current movement',rhythm:clock,
      holds:rawHolds.map(row=>({...row,meter:typeof row.meter==='string'?row.meter:null}))};
  }
  function prepare(bundle,playerUrl,companion){
    const empty=status=>({guides:[],status:status||'unavailable',duration:bundle&&bundle.duration||0});
    if(!bundle||!Number.isFinite(bundle.duration)||bundle.duration<=0||bundle.duration>3600||bundle.rhythmFollowingDisabled)return empty();
    if(bundle.rhythm){
      const own=guide({...bundle,id:'current',label:bundle.title},bundle.duration);
      return own?{guides:[own],status:'estimate',duration:bundle.duration}:empty();
    }
    if(bundle.provenance&&Array.isArray(bundle.provenance.userTimingEdits)&&bundle.provenance.userTimingEdits.length)return empty('timing-edited');
    const data=companion===undefined?defaultData:companion;
    if(!data||data.schema!=='orchestra-pulse-companion-v1'||!Number.isFinite(data.fullDuration)||
      Math.abs(data.fullDuration-bundle.duration)>.000001||!Array.isArray(data.guides)||!data.guides.length||data.guides.length>24)return empty();
    const actual=audioURL(bundle.audioUrl,playerUrl),expected=audioURL(data.fullAudioPath,playerUrl);
    if(!actual||actual!==expected)return empty();
    let count=0,previousEnd=0;const guides=[];
    for(const source of data.guides){
      if(!source||typeof source!=='object'||!Number.isFinite(source.start)||!Number.isFinite(source.end)||source.start<previousEnd||
        source.end<=source.start||source.end>bundle.duration)return empty();
      const ready=guide(source,bundle.duration);
      if(!ready)return empty();
      count+=ready.rhythm.bars.length;
      if(count>LIMIT||ready.rhythm.bars.some(row=>row.time<source.start||row.end>source.end)||
        ready.holds.some(row=>row.start<source.start||row.end>source.end))return empty();
      guides.push({...ready,start:source.start,end:source.end});previousEnd=source.end;
    }
    return {guides,status:'estimate',duration:bundle.duration};
  }
  function units(row){
    const match=String(row.meter).match(/^(\d{1,2})\/(\d{1,2})$/);
    if(!match)return null;
    const numerator=Number(match[1]),denominator=Number(match[2]);
    if(numerator*8/denominator!==row.eighths)return null;
    let step=8/denominator;
    if(denominator===8&&numerator>=6&&numerator%3===0)step=3;
    if(!Number.isInteger(step)||step<1||row.eighths%step)return null;
    return {step,count:row.eighths/step};
  }
  function readout(prepared,seconds){
    if(!prepared||!Array.isArray(prepared.guides)||prepared.guides.length>24||!Number.isFinite(seconds)||
      seconds<0||seconds>=prepared.duration)return unavailable(prepared&&prepared.status==='timing-edited'?'timing-edited':undefined);
    for(const source of prepared.guides){
      if(source.start!=null&&(seconds<source.start||seconds>=source.end))continue;
      const held=source.holds.find(row=>seconds>=row.start&&seconds<row.end);
      if(held)return {bar:held.bar,beat:null,beatsPerBar:null,meter:held.meter,phase:null,hold:true,
        movement:source.label,status:'hold',approximate:true};
      const position=timing.rhythmAt(source.rhythm,seconds);
      if(!position)continue;
      const row=source.rhythm.bars.find(item=>item.bar===position.bar),unit=units(row);
      if(!unit)return {...unavailable(),bar:position.bar,meter:position.meter,movement:source.label};
      const index=Math.floor((position.beat-1)/unit.step),first=index*unit.step,next=first+unit.step;
      const start=row.beats[first],end=next<row.beats.length?row.beats[next]:row.end;
      return {bar:position.bar,beat:index+1,beatsPerBar:unit.count,meter:position.meter,
        phase:Math.max(0,Math.min(1,(seconds-start)/(end-start))),hold:false,movement:source.label,
        status:'estimate',approximate:true};
    }
    return unavailable(prepared.status==='timing-edited'?'timing-edited':undefined);
  }
  return {prepare,readout};
});
