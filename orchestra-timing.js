(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.OrchestraTiming=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';

  function number(value){
    if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))return NaN;
    return Number(value);
  }
  function assetPath(value){
    const path=String(value||'');
    if(!path||path.length>2048||/[\\\u0000-\u001f]/.test(path)||/^\/\//.test(path)||/^[a-z][a-z0-9+.-]*:/i.test(path))
      throw new Error('Media must use a local file served by this player.');
    const url=new URL(path,'http://localhost/');
    if(url.origin!=='http://localhost')throw new Error('Media must stay on this server.');
    return url.pathname+url.search;
  }
  function rect(value){
    if(!value||typeof value!=='object')throw new Error('A score marker has no page region.');
    const out={};
    for(const key of ['x','y','w','h']){
      out[key]=number(value[key]);
      if(!Number.isFinite(out[key])||out[key]<0||out[key]>1)throw new Error('A score marker has an invalid page region.');
    }
    if(out.w<=0||out.h<=0||out.x+out.w>1.000001||out.y+out.h>1.000001)
      throw new Error('A score marker lies outside its page.');
    return out;
  }
  function validateMarkers(markers,duration){
    const end=number(duration);
    if(!Number.isFinite(end)||end<=0)return {ok:false,error:'The recording duration is missing.'};
    if(!Array.isArray(markers)||!markers.length||markers.length>2000)
      return {ok:false,error:'The pairing needs a bounded list of score markers.'};
    const seen=new Set();let last=-1;
    for(const marker of markers){
      if(!marker||typeof marker.id!=='string'||!marker.id||seen.has(marker.id))
        return {ok:false,error:'Score marker names must be unique.'};
      seen.add(marker.id);
      const time=number(marker.time);
      if(!Number.isFinite(time)||time<0||time>=end||time<=last)
        return {ok:false,error:'Marker times must increase and stay inside the recording.'};
      last=time;
      if(!Number.isInteger(marker.page)||marker.page<1)return {ok:false,error:'A score marker has no valid page.'};
      try{rect(marker.rect);}catch(error){return {ok:false,error:error.message};}
    }
    return {ok:true};
  }
  function normalizeRhythm(raw,duration){
    if(raw==null)return null;
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.bars)||!raw.bars.length||raw.bars.length>5000)
      throw new Error('The recording has no usable rhythm clock.');
    let previous=null;
    const bars=raw.bars.map(row=>{
      if(!row||typeof row!=='object')throw new Error('A rhythm bar is invalid.');
      const bar=number(row.bar),time=number(row.time),end=number(row.end),eighths=number(row.eighths);
      if(!Number.isInteger(bar)||bar<1||!Number.isFinite(time)||!Number.isFinite(end)||time<0||end<=time||end>duration||
        !Number.isInteger(eighths)||eighths<1||eighths>16||!/^\d{1,2}\/\d{1,2}$/.test(String(row.meter||''))||
        (previous&&(bar!==previous.bar+1||time<previous.end-.000001)))throw new Error('The rhythm clock moves outside the score or recording.');
      const beats=Array.isArray(row.beats)?row.beats.map(number):Array.from({length:eighths},(_,i)=>time+(end-time)*i/eighths);
      if(beats.length!==eighths||Math.abs(beats[0]-time)>.000001||beats.some((beat,i)=>
        !Number.isFinite(beat)||beat<time||beat>=end||(i>0&&beat<=beats[i-1])))throw new Error('The subdivisions of a rhythm bar are invalid.');
      previous={bar,time,end};
      return {...row,bar,time,end,eighths,beats,meter:String(row.meter),basis:String(row.basis||'estimate')};
    });
    return {...raw,bars,totalBars:bars.length};
  }
  function normalizeBundle(raw){
    if(!raw||typeof raw!=='object')throw new Error('This pairing file is unreadable.');
    const duration=number(raw.duration);
    if(!Number.isFinite(duration)||duration<=0||duration>3600)throw new Error('Use a recording of at most one hour.');
    if(!Array.isArray(raw.partPages)||!raw.partPages.length||raw.partPages.length>64)
      throw new Error('The pairing has no usable score pages.');
    const partPages=raw.partPages.map((page,index)=>{
      if(!page||!(number(page.width)>0)||!(number(page.height)>0))throw new Error('A score page has no dimensions.');
      return {...page,url:assetPath(page.url),width:number(page.width),height:number(page.height),page:index+1};
    });
    const markers=(Array.isArray(raw.markers)?raw.markers:[]).map((marker,index)=>({
      ...marker,index,id:String(marker.id||''),label:String(marker.label||'Section '+(index+1)).slice(0,160),
      time:number(marker.time),page:number(marker.page),rect:rect(marker.rect),
      basis:String(marker.basis||'estimate').slice(0,240),checked:marker.checked===true,
      note:String(marker.note||'').slice(0,1000)
    }));
    const valid=validateMarkers(markers,duration);
    if(!valid.ok)throw new Error(valid.error);
    if(markers.some(marker=>marker.page>partPages.length))throw new Error('A marker refers to a missing score page.');
    if(raw.spans!=null&&(!Array.isArray(raw.spans)||raw.spans.length>2000))throw new Error('The page-following intervals are invalid.');
    let lastEnd=0;
    const spans=(raw.spans||[]).map((span,index)=>{
      if(!span||typeof span!=='object')throw new Error('A page-following interval is invalid.');
      const start=number(span.start),end=number(span.end),page=number(span.page);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<lastEnd-.000001||end<=start||end>duration||
        !Number.isInteger(page)||page<1||page>partPages.length)throw new Error('A page-following interval is outside the recording or score.');
      lastEnd=end;
      return {...span,id:String(span.id||'line-'+index),label:String(span.label||'Approximate location').slice(0,160),
        start,end,page,rect:rect(span.rect),note:String(span.note||'').slice(0,1000),checked:span.checked===true};
    });
    if(raw.rests!=null&&(!Array.isArray(raw.rests)||raw.rests.length>500))throw new Error('The printed-rest intervals are invalid.');
    lastEnd=0;
    const rests=(raw.rests||[]).map((rest,index)=>{
      if(!rest||typeof rest!=='object')throw new Error('A printed-rest interval is invalid.');
      const start=number(rest.start),end=number(rest.end),page=number(rest.page),printedBarCount=number(rest.printedBarCount);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<lastEnd-.000001||end<=start||end>duration||
        !Number.isInteger(page)||page<1||page>partPages.length||!Number.isInteger(printedBarCount)||printedBarCount<1||printedBarCount>500)
        throw new Error('A printed-rest interval is outside the recording or score.');
      lastEnd=end;
      return {...rest,id:String(rest.id||'rest-'+index),label:String(rest.label||'Rest').slice(0,160),start,end,page,
        printedBarCount,rect:rect(rest.rect),note:String(rest.note||'').slice(0,1000),checked:rest.checked===true};
    });
    if(raw.barRegions!=null&&(!Array.isArray(raw.barRegions)||raw.barRegions.length>5000))throw new Error('The printed bar regions are invalid.');
    let previousBar=0;
    const barRegions=(raw.barRegions||[]).map((region,index)=>{
      if(!region||typeof region!=='object')throw new Error('A printed bar region is invalid.');
      const barStart=number(region.barStart),barEndExclusive=number(region.barEndExclusive),page=number(region.page);
      if(!Number.isInteger(barStart)||!Number.isInteger(barEndExclusive)||barStart<1||barEndExclusive<=barStart||
        barStart<previousBar||!Number.isInteger(page)||page<1||page>partPages.length)
        throw new Error('A printed bar region lies outside the part or overlaps another bar.');
      previousBar=barEndExclusive;
      return {...region,id:String(region.id||'printed-bar-'+index),barStart,barEndExclusive,page,
        rect:rect(region.rect),geometryChecked:region.geometryChecked===true,
        label:String(region.label||'').slice(0,160),checked:region.checked===true};
    });
    return {...raw,title:String(raw.title||'Orchestra practice').slice(0,240),
      audioUrl:assetPath(raw.audioUrl),duration,partPages,markers,spans,rests,barRegions,rhythm:normalizeRhythm(raw.rhythm,duration)};
  }
  function markerAt(markers,time){
    const value=number(time);
    if(!Number.isFinite(value)||!Array.isArray(markers))return null;
    let low=0,high=markers.length;
    while(low<high){const mid=(low+high)>>1;if(markers[mid].time<=value)low=mid+1;else high=mid;}
    return low?markers[low-1]:null;
  }
  function sectionEnd(markers,index,duration){
    if(!Array.isArray(markers)||!Number.isInteger(index)||index<0||index>=markers.length)return null;
    return index+1<markers.length?markers[index+1].time:duration;
  }
  function timeFormat(seconds){
    const value=number(seconds),n=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
    return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
  }
  function rhythmAt(rhythm,seconds){
    if(!rhythm||!Array.isArray(rhythm.bars)||!rhythm.bars.length)return null;
    const time=number(seconds);
    if(!Number.isFinite(time))return null;
    const rows=rhythm.bars;let low=0,high=rows.length;
    while(low<high){const mid=(low+high)>>1;if(rows[mid].time<=time)low=mid+1;else high=mid;}
    const row=low?rows[low-1]:null;
    if(!row||time>=row.end)return null;
    const beats=Array.isArray(row.beats)?row.beats:Array.from({length:row.eighths},(_,i)=>row.time+(row.end-row.time)*i/row.eighths);
    let index=0;while(index+1<beats.length&&beats[index+1]<=time)index++;
    const next=index+1<beats.length?beats[index+1]:row.end;
    return {bar:row.bar,beat:index+1,beatsPerBar:row.eighths,meter:row.meter,
      progress:Math.max(0,Math.min(1,(time-row.time)/(row.end-row.time))),
      phase:Math.max(0,Math.min(1,(time-beats[index])/(next-beats[index]))),basis:row.basis||'estimate'};
  }
  function retimeBundle(raw,newMarkers){
    const base=normalizeBundle(raw),next=normalizeBundle({...base,markers:newMarkers});
    if(base.markers.length!==next.markers.length||base.markers.some((marker,i)=>marker.id!==next.markers[i].id))
      throw new Error('Timing corrections must refer to the same rehearsal marks.');
    const anchors=base.markers.map((marker,i)=>({from:marker.time,to:next.markers[i].time}));
    if(anchors[0].from>0)anchors.unshift({from:0,to:0});
    anchors.push({from:base.duration,to:base.duration});
    const edits=base.markers.flatMap((marker,i)=>Math.abs(marker.time-next.markers[i].time)>.0000001?
      [{id:marker.id,from:marker.time,to:next.markers[i].time,checked:next.markers[i].checked}]:[]);
    if(!edits.length)return next;
    function warp(time){
      let low=0,high=anchors.length;
      while(low<high){const mid=(low+high)>>1;if(anchors[mid].from<=time)low=mid+1;else high=mid;}
      const index=Math.max(0,Math.min(anchors.length-2,low-1)),left=anchors[index],right=anchors[index+1];
      return Math.round((left.to+(time-left.from)/(right.from-left.from)*(right.to-left.to))*1e6)/1e6;
    }
    const interval=row=>({...row,start:warp(row.start),end:warp(row.end),checked:false});
    next.spans=base.spans.map(interval);next.rests=base.rests.map(interval);
    if(base.rhythm){
      next.rhythm={...base.rhythm,
        accuracy:'Timing estimate adjusted to the player’s rehearsal markers.',
        bars:base.rhythm.bars.map(row=>({...row,time:warp(row.time),end:warp(row.end),beats:row.beats.map(warp),
          basis:'user-adjusted-estimate',subdivisionBasis:'user-adjusted-estimate',timingChecked:false}))};
      if(Array.isArray(base.rhythm.eighths))next.rhythm.eighths=base.rhythm.eighths.map(row=>({...row,time:warp(row.time),end:warp(row.end),basis:'user-adjusted-estimate'}));
      if(Array.isArray(base.rhythm.systems))next.rhythm.systems=base.rhythm.systems.map(row=>({...row,start:warp(row.start),end:warp(row.end),anchorsMusicallyChecked:false}));
      if(Number.isFinite(base.rhythm.start))next.rhythm.start=warp(base.rhythm.start);
      if(Number.isFinite(base.rhythm.end))next.rhythm.end=warp(base.rhythm.end);
    }
    next.lineFollowingDisabled=false;next.restFollowingDisabled=false;next.rhythmFollowingDisabled=false;
    next.provenance={...base.provenance,userTimingEdits:[...(base.provenance&&base.provenance.userTimingEdits||[]),...edits],
      userTimingBasis:'All guide times move together between the corrected rehearsal markers; intervening beats remain estimates.'};
    return normalizeBundle(next);
  }
  function barRegionAt(bundle,seconds){
    if(!bundle||!Array.isArray(bundle.barRegions)||!bundle.barRegions.length)return null;
    const position=rhythmAt(bundle.rhythm,seconds);
    if(!position)return null;
    let low=0,high=bundle.barRegions.length;
    while(low<high){const mid=(low+high)>>1;if(bundle.barRegions[mid].barStart<=position.bar)low=mid+1;else high=mid;}
    const region=low?bundle.barRegions[low-1]:null;
    if(!region||position.bar>=region.barEndExclusive)return null;
    return {...region,bar:position.bar,printedBarCount:region.barEndExclusive-region.barStart};
  }
  return {normalizeBundle,markerAt,sectionEnd,validateMarkers,timeFormat,rhythmAt,normalizeRhythm,retimeBundle,barRegionAt};
});
