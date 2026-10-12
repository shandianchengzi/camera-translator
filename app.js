'use strict';
const KEY='camera-translator:v1';
const {formatPixels,parsePixels,migrateLens,targetFromPhoneZoom,targetForEdge}=CameraMath;
const defaults=()=>({version:2,target:200,targetSource:'focal',targetRef:'lens:main',targetZoom:200/23,cropCenter:{x:.5,y:.5},photoData:null,outputPreset:'16:9',output:{w:16,h:9},model:'linear',lenses:[{id:'main',name:'手机主摄',focal:23,totalPixels:50000000,sensorPreset:'1:1',sw:1,sh:1},{id:'tele',name:'手机长焦',focal:70,totalPixels:50000000,sensorPreset:'1:1',sw:1,sh:1}],demoId:'main'});
let state=defaults(),storageAvailable=true;
try {
  const saved=JSON.parse(localStorage.getItem(KEY));
  if(saved&&Array.isArray(saved.lenses)&&saved.lenses.length>=2&&saved.lenses.every(x=>x&&typeof x==='object')&&saved.output) {
    state={...state,...saved,version:2};delete state.refs;
    if(!state.cropCenter||![state.cropCenter.x,state.cropCenter.y].every(v=>Number.isFinite(v)))state.cropCenter={x:.5,y:.5};
    if(typeof state.photoData!=='string'||!/^data:image\/(jpeg|png|webp|avif|gif);base64,/.test(state.photoData))state.photoData=null;
    state.lenses=saved.lenses.slice(0,100).map((x,i)=>({...defaults().lenses[0],...migrateLens(x),id:String(x.id||i),name:String(x.name||'镜头').slice(0,60)}));
    if(!['linear','area'].includes(state.model))state.model='linear';
    if(saved.version!==2){state.targetSource='focal';state.targetZoom=Number(state.target)/Number(state.lenses[0].focal);}
  }
} catch(e) {storageAvailable=false;}
const $=s=>document.querySelector(s),fmt=(n,d=2)=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d});
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageAvailable=true;}catch(e){storageAvailable=false;}$('#save-status').textContent=storageAvailable?'已自动保存 · 下次继续':'浏览器存储不可用 · 当前仍可计算';}
function setupSettings(){
  for(const [id,value] of Object.entries({target:state.target,'target-zoom':Number.isFinite(Number(state.targetZoom))?Number(Number(state.targetZoom).toFixed(6)):'','output-preset':state.outputPreset,'output-w':state.output.w,'output-h':state.output.h,model:state.model}))$('#'+id).value=value;
  $('#output-w').disabled=$('#output-h').disabled=state.outputPreset!=='custom';
}
function referenceFocal(){
  return Number(state.lenses.find(l=>'lens:'+l.id===state.targetRef)?.focal);
}
function setupTargetSelect(){
  const select=$('#target-reference');select.replaceChildren();
  state.lenses.forEach(l=>{const option=document.createElement('option');option.value='lens:'+l.id;option.textContent=(l.name||'未命名镜头')+' · '+fmt(l.focal)+'mm';select.append(option);});
  if(!Array.from(select.options).some(o=>o.value===state.targetRef)){state.targetRef='lens:'+state.lenses[0].id;state.targetSource='focal';}
  select.value=state.targetRef;
}
function syncTarget(){
  const base=referenceFocal();
  if(state.targetSource==='zoom') {
    state.target=targetFromPhoneZoom(base,state.targetZoom);
    $('#target').value=Number.isFinite(state.target)?Number(state.target.toFixed(6)):'';
  } else {
    state.targetZoom=base>0?Number(state.target)/base:NaN;
    $('#target-zoom').value=Number.isFinite(state.targetZoom)?Number(state.targetZoom.toFixed(6)):'';
  }
}
function setTarget(value){
  state.targetSource='focal';state.target=value;
  $('#target').value=Number.isFinite(value)?Number(value.toFixed(6)):'';
  syncTarget();refresh();save();
}
function lensCard(id){return Array.from(document.querySelectorAll('.lens')).find(x=>x.dataset.id===id);}
function formatPixelInput(input){
  const raw=input.value, digits=raw.replace(/[,，\s]/g,'');
  if(!/^\d+$/.test(digits)||digits.length>12)return raw;
  const digitPosition=raw.slice(0,input.selectionStart??raw.length).replace(/[,，\s]/g,'').length;
  const formatted=formatPixels(digits);input.value=formatted;
  let cursor=0,count=0;
  while(cursor<formatted.length&&count<digitPosition){if(/\d/.test(formatted[cursor]))count++;cursor++;}
  input.setSelectionRange(cursor,cursor);
  return digits;
}
function setupLenses(){
  const parent=$('#lenses'),parameters=$('#lens-parameters');parent.replaceChildren();parameters.replaceChildren();
  state.lenses.forEach((lens,i)=>{
    const card=$('#lens-template').content.firstElementChild.cloneNode(true);card.dataset.id=lens.id;
    const param=document.createElement('article');param.className='panel lens-param';param.dataset.id=lens.id;
    param.append(card.querySelector('.lens-heading'),card.querySelector('.lens-inputs'));
    param.querySelector('.lens-number').textContent=String(i+1).padStart(2,'0');
    const heading=document.createElement('h3');heading.className='result-name';heading.textContent=lens.name;card.prepend(heading);
    param.querySelectorAll('[data-field]').forEach(input=>{
      const field=input.dataset.field;
      input.value=field==='totalPixels'&&Number.isFinite(parsePixels(lens[field]))?formatPixels(parsePixels(lens[field])):lens[field];
      input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>{
        lens[field]=field==='totalPixels'?formatPixelInput(input):input.value;
        if(field==='sensorPreset'&&input.value!=='custom'){
          [lens.sw,lens.sh]=input.value.split(':').map(Number);
          param.querySelector('[data-field="sw"]').value=lens.sw;param.querySelector('[data-field="sh"]').value=lens.sh;
        }
        param.querySelector('[data-field="sw"]').disabled=param.querySelector('[data-field="sh"]').disabled=lens.sensorPreset!=='custom';
        if(field==='name'){setupDemoSelect();setupTargetSelect();}
        if(field==='focal'){setupTargetSelect();syncTarget();}
        refresh();save();
      });
    });
    param.querySelector('[data-field="sw"]').disabled=param.querySelector('[data-field="sh"]').disabled=lens.sensorPreset!=='custom';
    const remove=param.querySelector('.remove');remove.disabled=state.lenses.length<=2;remove.title=state.lenses.length<=2?'至少保留两个镜头用于比较':'删除这个镜头';
    remove.addEventListener('click',()=>{state.lenses=state.lenses.filter(x=>x.id!==lens.id);setupLenses();setupDemoSelect();setupTargetSelect();syncTarget();refresh();save();});
    card.querySelector('.resolution-slider').addEventListener('input',e=>{try{setTarget(targetForEdge(lens,e.target.value,state.output,state.model));}catch(error){card.querySelector('.lens-error').textContent=error.message;}});
    parameters.append(param);parent.append(card);
  });
}
function setupDemoSelect(){
  const select=$('#demo-lens');select.replaceChildren();
  state.lenses.forEach(l=>{const option=document.createElement('option');option.value=l.id;option.textContent=l.name||'未命名镜头';select.append(option);});
  if(!state.lenses.some(l=>l.id===state.demoId))state.demoId=state.lenses[0].id;select.value=state.demoId;
}
function refresh(){
  const target=Number(state.target),base=referenceFocal();
  const validGlobal=Number.isFinite(target)&&target>0&&target<=100000&&[state.output.w,state.output.h].every(x=>Number.isFinite(Number(x))&&Number(x)>0&&Number(x)<=100);
  $('#global-error').textContent=validGlobal?'':'请检查目标焦距与成片比例，填写支持范围内的大于 0 的数字。';
  $('#target-equation').textContent=validGlobal&&base>0&&base<=100000?fmt(base)+'mm × '+fmt(target/base)+'倍 = 目标 '+fmt(target)+'mm':'请填写有效的基准焦距与放大倍数。';
  $('#model-note').textContent=state.model==='linear'?'简化估算：放大 2 倍，像素算作剩 1/2；这不符合真实裁切。判断数码裁切细节，推荐切换为数码裁切算法。':'数码裁切：放大 2 倍，宽、高各剩 1/2，像素剩 1/4；因此除以倍数²。';
  state.lenses.forEach(lens=>{
    const card=lensCard(lens.id);card.querySelector('.result-name').textContent=lens.name||'未命名镜头';
    try{
      const result=CameraMath.calculate(lens,state.target,state.output,state.model);
      card.querySelector('.lens-error').textContent='';card.querySelector('.results').hidden=false;
      const set=(selector,value)=>card.querySelector(selector).textContent=value;
      set('.zoom-value',fmt(result.zoom)+'×');set('.focal-path',fmt(lens.focal)+'mm → '+fmt(target)+'mm');
      set('.pixel-value',formatPixels(result.pixels));
      set('.sensor-dimensions','像素 · 未按成片比例裁切，传感器预算 '+fmt(Math.floor(result.sensorW),0)+' × '+fmt(Math.floor(result.sensorH),0));
      set('.dimensions',fmt(result.width,0)+' × '+fmt(result.height,0));
      set('.output-pixels','成片 '+formatPixels(result.width*result.height)+' 像素 · '+state.output.w+':'+state.output.h);
      set('.recommendation',result.recommendation);set('.resolution-class',result.classification);set('.k-value',fmt(result.k)+'K 长边');
      const covered=CameraMath.tiers.filter(x=>result.edge>=x.pixels).pop();
      set('.quality-summary',result.zoom<1?'目标视野比该镜头更广，不能直接用它实现。':covered?'像素长边已达到 '+covered.name+' 档位'+(result.edge>7680?'并超出 8K。':'；选择 '+result.recommendation+' 可容纳当前像素预算。'):'像素长边还没达到 1K；可选 1K 档位，但无法补回细节。');
      card.querySelector('.scale-fill').style.width=result.percent+'%';
      const slider=card.querySelector('.resolution-slider');slider.value=Math.max(1,Math.min(7680,result.edge));slider.setAttribute('aria-valuetext','当前 '+fmt(result.k)+'K 长边，目标焦距 '+fmt(target)+'mm');
      card.querySelector('.resolution-scale').setAttribute('aria-label','当前长边 '+result.edge+' 像素，'+fmt(result.k)+'K，建议 '+result.recommendation);
      set('.lens-note',result.zoom<1?'该镜头无法通过裁切获得更广视野，像素按原始值保留。':result.edge<1?'当前预算不足 1 像素，无法形成有效画面。':'原生像素长边上限 '+fmt(CameraMath.calculate(lens,lens.focal,state.output,state.model).edge,0)+'；超过上限会停在原生焦距，不能补出细节。建议档位向上取一档，不代表实拍一定清晰。');
      card.querySelector('.resolution-slider').title=card.querySelector('.lens-note').textContent;
    }catch(e){card.querySelector('.lens-error').textContent=e.message;card.querySelector('.results').hidden=true;}
  });refreshDemo();
}
function refreshDemo(){
  const lens=state.lenses.find(x=>x.id===state.demoId)||state.lenses[0],zoom=Number(state.target)/Number(lens.focal),valid=Number.isFinite(zoom)&&zoom>0,scale=valid?Math.max(1,zoom):1;
  const half=.5/scale,center={x:Math.max(half,Math.min(1-half,state.cropCenter.x)),y:Math.max(half,Math.min(1-half,state.cropCenter.y))};
  $('#crop-frame').style.left=(center.x*100)+'%';$('#crop-frame').style.top=(center.y*100)+'%';
  $('#base-label').textContent=fmt(lens.focal)+'mm';$('#zoom-label').textContent=valid?fmt(state.target)+'mm · '+fmt(zoom)+'×':'请填写有效焦距';
  $('#crop-frame').style.width=100/scale+'%';$('#crop-frame').style.height=100/scale+'%';$('#crop-label').textContent=fmt(scale)+'×';$('#zoom-image').style.transform='scale('+scale+') translate('+((.5-center.x)*100)+'%, '+((.5-center.y)*100)+'%)';
  const maxZoom=Math.max(100,valid?zoom:1);$('#view-zoom').max=maxZoom;$('#view-zoom').value=Math.max(1,valid?zoom:1);$('#view-zoom-value').textContent=valid?fmt(zoom)+'×':'—';$('#view-max-label').textContent=fmt(maxZoom)+'× · 更近';
  $('#demo-note').textContent=valid&&zoom<1?'目标比原始视野更广，原图无法显示取景框外的内容。':'取景框宽高均为原图的 1/'+fmt(scale)+'。'+(state.photoData?'正在使用自己的照片。':'示例图片：Unsplash；加载失败时显示本地风景示意图。')+'此处展示取景范围，不模拟实际镜头画质。';
}
$('#target-reference').addEventListener('change',e=>{state.targetRef=e.target.value;state.targetSource='focal';syncTarget();refresh();save();});
$('#target-zoom').addEventListener('input',e=>{state.targetSource='zoom';state.targetZoom=e.target.value;syncTarget();refresh();save();});
$('#target').addEventListener('input',e=>{state.targetSource='focal';state.target=e.target.value;syncTarget();refresh();save();});
$('#view-zoom').addEventListener('input',e=>{const lens=state.lenses.find(x=>x.id===state.demoId)||state.lenses[0];setTarget(Math.min(100000,Number(lens.focal)*Number(e.target.value)));});
$('#model').addEventListener('change',e=>{state.model=e.target.value;refresh();save();});
$('#output-preset').addEventListener('change',e=>{state.outputPreset=e.target.value;if(e.target.value!=='custom'){const [w,h]=e.target.value.split(':').map(Number);state.output={w,h};}setupSettings();refresh();save();});
['w','h'].forEach(axis=>$('#output-'+axis).addEventListener('input',e=>{state.output[axis]=e.target.value;refresh();save();}));
$('#add').addEventListener('click',()=>{state.lenses.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:'自定义镜头 '+(state.lenses.length+1),focal:20,totalPixels:50000000,sensorPreset:'1:1',sw:1,sh:1});setupLenses();setupDemoSelect();setupTargetSelect();syncTarget();refresh();save();});
$('#reset').addEventListener('click',()=>{if(confirm('恢复默认示例？这会替换当前保存的镜头与设置。')){state=defaults();initialize();showPhoto();save();}});
$('#demo-lens').addEventListener('change',e=>{state.demoId=e.target.value;refreshDemo();save();});
function initialize(){setupTargetSelect();setupSettings();setupLenses();setupDemoSelect();syncTarget();refresh();}
initialize();if(!storageAvailable)$('#save-status').textContent='保存数据无法读取 · 使用默认示例';
let samplePhoto='scene.svg';
function showPhoto(){
  document.querySelectorAll('.scene-img').forEach(img=>img.src=state.photoData||samplePhoto);
  $('#photo-status').textContent=state.photoData?'已使用自己的照片 · 仅保存在此浏览器':'照片只保存在此浏览器';
}
showPhoto();
const photo=new Image();photo.onload=()=>{samplePhoto=photo.src;if(!state.photoData)showPhoto();};photo.src='https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=85';
$('#photo-upload').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  if(!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)||file.size>20000000){$('#photo-status').textContent='请选择不超过 20MB 的 JPG、PNG、WebP、AVIF 或 GIF 图片。';e.target.value='';return;}
  $('#photo-status').textContent='正在处理照片…';
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=data;});
    // Downsize locally to fit typical localStorage quotas; never upload this photo.
    const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    state.photoData=canvas.toDataURL('image/jpeg',.85);state.cropCenter={x:.5,y:.5};showPhoto();refreshDemo();save();
    if(!storageAvailable)$('#photo-status').textContent='照片当前可用，但浏览器空间不足，无法保存到下次。';
  }catch(error){$('#photo-status').textContent='无法读取这张照片，请换一张常见格式图片。';}
  e.target.value='';
});
$('#reset-photo').addEventListener('click',()=>{state.photoData=null;state.cropCenter={x:.5,y:.5};showPhoto();refreshDemo();save();});
const scene=$('.base-scene');let drag=null;
function setCropPoint(x,y){
  const lens=state.lenses.find(l=>l.id===state.demoId)||state.lenses[0],zoom=Number(state.target)/Number(lens.focal),scale=Number.isFinite(zoom)?Math.max(1,zoom):1,half=.5/scale;
  state.cropCenter={x:Math.max(half,Math.min(1-half,x)),y:Math.max(half,Math.min(1-half,y))};refreshDemo();
}
scene.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;e.preventDefault();scene.setPointerCapture(e.pointerId);
  const bounds=scene.getBoundingClientRect(),frame=$('#crop-frame').getBoundingClientRect();
  const x=(e.clientX-bounds.left)/bounds.width,y=(e.clientY-bounds.top)/bounds.height;
  const inside=e.clientX>=frame.left&&e.clientX<=frame.right&&e.clientY>=frame.top&&e.clientY<=frame.bottom;
  const centerX=(frame.left+frame.width/2-bounds.left)/bounds.width,centerY=(frame.top+frame.height/2-bounds.top)/bounds.height;
  drag={id:e.pointerId,dx:inside?x-centerX:0,dy:inside?y-centerY:0};
  setCropPoint(x-drag.dx,y-drag.dy);$('#crop-frame').focus({preventScroll:true});
});
scene.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const b=scene.getBoundingClientRect();setCropPoint((e.clientX-b.left)/b.width-drag.dx,(e.clientY-b.top)/b.height-drag.dy);});
function endDrag(e){if(drag&&e.pointerId===drag.id){drag=null;save();}}
scene.addEventListener('pointerup',endDrag);scene.addEventListener('pointercancel',endDrag);
$('#crop-frame').addEventListener('keydown',e=>{
  const moves={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};if(!moves[e.key])return;e.preventDefault();
  const b=scene.getBoundingClientRect(),f=$('#crop-frame').getBoundingClientRect(),[dx,dy]=moves[e.key];
  setCropPoint((f.left+f.width/2-b.left)/b.width+dx,(f.top+f.height/2-b.top)/b.height+dy);save();
});

function toggleSidebar(open){
  document.body.classList.toggle('sidebar-open',open);$('#toggle-sidebar').setAttribute('aria-expanded',String(open));$('#sidebar-backdrop').hidden=!open;
}
$('#toggle-sidebar').addEventListener('click',()=>toggleSidebar(!document.body.classList.contains('sidebar-open')));
$('#close-sidebar').addEventListener('click',()=>toggleSidebar(false));
$('#sidebar-backdrop').addEventListener('click',()=>toggleSidebar(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleSidebar(false);});
