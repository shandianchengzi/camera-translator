(function (root) {
  'use strict';
  const tiers = [{name:'1K', pixels:1024}, {name:'2K', pixels:2048}, {name:'4K', pixels:3840}, {name:'8K', pixels:7680}];
  function parsePixels(value) {
    const digits=String(value).replace(/[,，\s]/g,'');
    return /^\d+$/.test(digits)?Number(digits):NaN;
  }
  function formatPixels(value) {
    if (!Number.isFinite(Number(value))) return '—';
    return String(Math.floor(Number(value))).replace(/\B(?=(\d{4})+(?!\d))/g,',');
  }
  function migrateLens(lens) {
    const next={...lens};
    if(!Object.prototype.hasOwnProperty.call(next,'totalPixels')) {
      next.totalPixels=Number.isFinite(Number(next.mp))?Number(next.mp)*1000000:50000000;
    }
    delete next.mp;
    return next;
  }
  function targetFromPhoneZoom(base, zoom) {
    const b=Number(base), z=Number(zoom);
    return Number.isFinite(b)&&Number.isFinite(z)&&b>0&&z>0?b*z:NaN;
  }
  function calculate(lens, target, output, model = 'linear') {
    const values = [lens.focal,parsePixels(lens.totalPixels),lens.sw,lens.sh,target,output.w,output.h].map(Number);
    if (!values.every(v => Number.isFinite(v) && v > 0)) throw new Error('请填写大于 0 的有效数字。');
    const [focal,totalPixels,sw,sh,t,ow,oh] = values;
    if (focal>100000 || t>100000 || totalPixels>10000000000 || [sw,sh,ow,oh].some(v=>v>100)) throw new Error('数值超出支持范围：焦距 ≤ 100000mm，总像素 ≤ 100,0000,0000，比例单边 ≤ 100。');
    const zoom=t/focal, crop=Math.max(1,zoom);
    const pixels=totalPixels/Math.pow(crop,model==='area'?2:1);
    const sensorW=Math.sqrt(pixels*sw/sh), sensorH=Math.sqrt(pixels*sh/sw);
    const long=Math.max(sensorW,sensorH), short=Math.min(sensorW,sensorH);
    const availableW=ow>=oh?long:short, availableH=ow>=oh?short:long;
    const exactWidth=Math.min(availableW,availableH*ow/oh),exactHeight=Math.min(availableH,availableW*oh/ow);
    const width=Math.max(0,Math.floor(exactWidth));
    const height=Math.max(0,Math.floor(exactHeight));
    const edge=Math.max(width,height), tier=tiers.find(x=>edge<=x.pixels)||tiers[3];
    const lower=tiers.filter(x=>edge>=x.pixels).pop();
    const classification=edge<1024?'低于 1K':edge>7680?'高于 8K':lower?lower.name+(edge===lower.pixels?'':' 以上'):'低于 1K';
    return {zoom,pixels,sensorW,sensorH,width,height,edge,continuousEdge:Math.max(exactWidth,exactHeight),k:edge/1024,recommendation:tier.name,classification,percent:Math.min(100,edge/7680*100)};
  }
  function targetForEdge(lens,edge,output,model='linear') {
    const native=calculate(lens,lens.focal,output,model);
    const requested=Number(edge);
    if(!Number.isFinite(requested)||requested<=0)throw new Error('请指定大于 0 的分辨率。');
    const achievable=Math.min(requested,native.continuousEdge);
    const target=Number(lens.focal)*Math.pow(native.continuousEdge/achievable,model==='area'?1:2);
    return Math.min(100000,Math.max(.01,target));
  }
  root.CameraMath={calculate,tiers,parsePixels,formatPixels,migrateLens,targetFromPhoneZoom,targetForEdge};
  if(typeof module!=='undefined') module.exports=root.CameraMath;
})(typeof globalThis!=='undefined'?globalThis:this);
