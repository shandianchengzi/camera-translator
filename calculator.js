(function (root) {
  'use strict';
  const tiers = [{name:'1K', pixels:1024}, {name:'2K', pixels:2048}, {name:'4K', pixels:3840}, {name:'8K', pixels:7680}];
  function calculate(lens, target, output, model = 'linear') {
    const values = [lens.focal,lens.mp,lens.sw,lens.sh,target,output.w,output.h].map(Number);
    if (!values.every(v => Number.isFinite(v) && v > 0)) throw new Error('请填写大于 0 的有效数字。');
    const [focal,mp,sw,sh,t,ow,oh] = values;
    if (focal>100000 || t>100000 || mp>10000 || [sw,sh,ow,oh].some(v=>v>100)) throw new Error('数值超出支持范围：焦距 ≤ 100000mm，像素 ≤ 10000MP，比例单边 ≤ 100。');
    const zoom=t/focal, crop=Math.max(1,zoom);
    const pixels=mp*1e6/Math.pow(crop,model==='area'?2:1);
    const sensorW=Math.sqrt(pixels*sw/sh), sensorH=Math.sqrt(pixels*sh/sw);
    const long=Math.max(sensorW,sensorH), short=Math.min(sensorW,sensorH);
    const availableW=ow>=oh?long:short, availableH=ow>=oh?short:long;
    const width=Math.max(0,Math.floor(Math.min(availableW,availableH*ow/oh)));
    const height=Math.max(0,Math.floor(Math.min(availableH,availableW*oh/ow)));
    const edge=Math.max(width,height), tier=tiers.find(x=>edge<=x.pixels)||tiers[3];
    const lower=tiers.filter(x=>edge>=x.pixels).pop();
    const classification=edge<1024?'低于 1K':edge>7680?'高于 8K':lower?lower.name+(edge===lower.pixels?'':' 以上'):'低于 1K';
    return {zoom,pixels,sensorW,sensorH,width,height,edge,k:edge/1024,recommendation:tier.name,classification,percent:Math.min(100,edge/7680*100)};
  }
  root.CameraMath={calculate,tiers};
  if(typeof module!=='undefined') module.exports=root.CameraMath;
})(typeof globalThis!=='undefined'?globalThis:this);
