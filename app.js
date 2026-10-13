'use strict';
const KEY='camera-translator:v1';
const {formatPixels,parsePixels,migrateLens,targetFromPhoneZoom,targetForEdge}=CameraMath;
const defaults=()=>({version:2,target:200,targetSource:'focal',targetRef:'lens:main',targetZoom:200/23,cropCenter:{x:.5,y:.5},photoData:null,photoOriginal:null,photoCrop:null,outputPreset:'16:9',output:{w:16,h:9},lenses:[{id:'main',name:'手机主摄',focal:23,totalPixels:50000000,sensorPreset:'1:1',sw:1,sh:1},{id:'tele',name:'手机长焦',focal:70,totalPixels:50000000,sensorPreset:'1:1',sw:1,sh:1}],demoId:'main'});
let state=defaults(),storageAvailable=true;
try {
  const saved=JSON.parse(localStorage.getItem(KEY));
  if(saved&&Array.isArray(saved.lenses)&&saved.lenses.length>=2&&saved.lenses.every(x=>x&&typeof x==='object')&&saved.output) {
    state={...state,...saved,version:2};delete state.refs;delete state.model;
    if(!state.cropCenter||![state.cropCenter.x,state.cropCenter.y].every(v=>Number.isFinite(v)))state.cropCenter={x:.5,y:.5};
    if(typeof state.photoOriginal!=='string'||!/^data:image\/(jpeg|png|webp|avif|gif);base64,/.test(state.photoOriginal))state.photoOriginal=null;
    if(typeof state.photoData!=='string'||!/^data:image\/(jpeg|png|webp|avif|gif);base64,/.test(state.photoData))state.photoData=null;
    if(!state.photoOriginal&&state.photoData)state.photoOriginal=state.photoData;
    state.lenses=saved.lenses.slice(0,100).map((x,i)=>({...defaults().lenses[0],...migrateLens(x),id:String(x.id||i),name:String(x.name||'镜头').slice(0,60)}));
    if(saved.version!==2){state.targetSource='focal';state.targetZoom=Number(state.target)/Number(state.lenses[0].focal);}
  }
} catch(e) {storageAvailable=false;}
const $=s=>document.querySelector(s),fmt=(n,d=2)=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d});
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageAvailable=true;}catch(e){storageAvailable=false;}$('#save-status').textContent=storageAvailable?'已自动保存 · 下次继续':'浏览器存储不可用 · 当前仍可计算';}
function setupSettings(){
  for(const [id,value] of Object.entries({target:state.target,'target-zoom':Number.isFinite(Number(state.targetZoom))?Number(Number(state.targetZoom).toFixed(6)):'','output-preset':state.outputPreset,'output-w':state.output.w,'output-h':state.output.h}))$('#'+id).value=value;
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
  // Never rewrite an active input: doing so can replay mobile/IME edits.
  const raw=input.value,digits=raw.replace(/[,，\s]/g,'');
  return /^\d+$/.test(digits)&&digits.length<=12?digits:raw;
}
function setupLenses(){
  const parent=$('#lenses'),parameters=$('#lens-parameters');parent.replaceChildren();parameters.replaceChildren();
  state.lenses.forEach((lens,i)=>{
    const card=$('#lens-template').content.firstElementChild.cloneNode(true);card.dataset.id=lens.id;
    const param=document.createElement('details');param.className='panel lens-param';param.dataset.id=lens.id;param.open=!!lens.expanded;
    const summary=document.createElement('summary');summary.textContent=lens.name||'未命名镜头';param.append(summary);
    param.addEventListener('toggle',()=>{if(lens.expanded!==param.open){lens.expanded=param.open;save();}});
    param.append(card.querySelector('.lens-heading'),card.querySelector('.lens-inputs'));
    param.querySelector('.lens-number').textContent=String(i+1).padStart(2,'0');
    const heading=document.createElement('h3');heading.className='result-name';heading.textContent=lens.name;card.prepend(heading);
    param.querySelectorAll('[data-field]').forEach(input=>{
      const field=input.dataset.field;
      input.value=field==='totalPixels'&&Number.isFinite(parsePixels(lens[field]))?formatPixels(parsePixels(lens[field])):lens[field];
      if(field==='totalPixels'){
        input.addEventListener('blur',()=>{const value=parsePixels(input.value);if(Number.isFinite(value))input.value=formatPixels(value);});
        input.addEventListener('compositionend',()=>input.dispatchEvent(new Event('input',{bubbles:true})));
      }
      input.addEventListener(input.tagName==='SELECT'?'change':'input',event=>{
        if(field==='totalPixels'&&event.isComposing)return;
        lens[field]=field==='totalPixels'?formatPixelInput(input):input.value;
        if(field==='sensorPreset'&&input.value!=='custom'){
          [lens.sw,lens.sh]=input.value.split(':').map(Number);
          param.querySelector('[data-field="sw"]').value=lens.sw;param.querySelector('[data-field="sh"]').value=lens.sh;
        }
        param.querySelector('[data-field="sw"]').disabled=param.querySelector('[data-field="sh"]').disabled=lens.sensorPreset!=='custom';
        if(field==='name'){summary.textContent=lens.name||'未命名镜头';setupDemoSelect();setupTargetSelect();}
        if(field==='focal'){setupTargetSelect();syncTarget();}
        refresh();save();
      });
    });
    param.querySelector('[data-field="sw"]').disabled=param.querySelector('[data-field="sh"]').disabled=lens.sensorPreset!=='custom';
    const remove=param.querySelector('.remove');remove.disabled=state.lenses.length<=2;remove.title=state.lenses.length<=2?'至少保留两个镜头用于比较':'删除这个镜头';
    remove.addEventListener('click',()=>{state.lenses=state.lenses.filter(x=>x.id!==lens.id);setupLenses();setupDemoSelect();setupTargetSelect();syncTarget();refresh();save();});
    const edgeInput=card.querySelector('.long-edge-input');
    function applyLongEdge(){
      const value=Number(edgeInput.value);
      if(!edgeInput.value||!Number.isFinite(value)||value<=0||!Number.isInteger(value)){
        card.querySelector('.lens-error').textContent='长边像素请输入大于 0 的整数。';return false;
      }
      try{setTarget(targetForEdge(lens,value,state.output));return true;}
      catch(error){card.querySelector('.lens-error').textContent=error.message;return false;}
    }
    edgeInput.addEventListener('input',applyLongEdge);
    edgeInput.addEventListener('blur',()=>{if(applyLongEdge())edgeInput.value=CameraMath.calculate(lens,state.target,state.output).edge;});
    edgeInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();edgeInput.blur();}});
    card.querySelector('.resolution-slider').addEventListener('input',e=>{try{setTarget(targetForEdge(lens,e.target.value,state.output));}catch(error){card.querySelector('.lens-error').textContent=error.message;}});
    card.querySelectorAll('[data-edge]').forEach(button=>button.addEventListener('click',()=>{try{setTarget(targetForEdge(lens,button.dataset.edge,state.output));}catch(error){card.querySelector('.lens-error').textContent=error.message;}}));
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
  state.lenses.forEach(lens=>{
    const card=lensCard(lens.id);card.hidden=lens.id!==state.demoId;card.querySelector('.result-name').textContent=lens.name||'未命名镜头';
    try{
      const result=CameraMath.calculate(lens,state.target,state.output);
      card.querySelector('.lens-error').textContent='';card.querySelector('.results').hidden=false;
      const set=(selector,value)=>card.querySelector(selector).textContent=value;
      set('.compact-report',(lens.name||'镜头')+'：'+fmt(lens.focal)+'mm → '+fmt(target)+'mm（'+fmt(result.zoom)+'×）；剩余 '+formatPixels(result.pixels)+' 像素（推算），成片 '+fmt(result.width,0)+' × '+fmt(result.height,0)+'（'+formatPixels(result.width*result.height)+' 像素），长边 '+fmt(result.edge,0)+' 像素（'+result.classification+'），建议 '+result.recommendation+'。');
      set('.zoom-value',fmt(result.zoom)+'×');set('.focal-path',fmt(lens.focal)+'mm → '+fmt(target)+'mm');
      set('.pixel-value',formatPixels(result.pixels));
      set('.sensor-dimensions','像素 · 未按成片比例裁切，传感器预算 '+fmt(Math.floor(result.sensorW),0)+' × '+fmt(Math.floor(result.sensorH),0));
      set('.dimensions',fmt(result.width,0)+' × '+fmt(result.height,0));
      set('.output-pixels','成片 '+formatPixels(result.width*result.height)+' 像素 · '+state.output.w+':'+state.output.h);
      set('.recommendation',result.recommendation);set('.resolution-class',result.classification);set('.k-value',fmt(result.edge,0)+' 像素长边');
      const covered=CameraMath.tiers.filter(x=>result.edge>=x.pixels).pop();
      set('.quality-summary',result.zoom<1?'目标视野比该镜头更广，不能直接用它实现。':covered?'像素长边已达到 '+covered.name+' 档位'+(result.edge>7680?'并超出 8K。':'；选择 '+result.recommendation+' 可容纳当前像素预算。'):'像素长边还没达到 1K；可选 1K 档位，但无法补回细节。');
      card.querySelector('.scale-fill').style.width=result.percent+'%';
      const edgeInput=card.querySelector('.long-edge-input');if(document.activeElement!==edgeInput)edgeInput.value=result.edge;
      const native=CameraMath.calculate(lens,lens.focal,state.output);
      const warning=card.querySelector('.native-limit-warning');warning.hidden=result.edge<=native.edge;warning.textContent='已超过镜头原生上限：当前比例下长边最多 '+native.edge+' 像素。当前数值允许推算，但不会增加真实细节。';
      const slider=card.querySelector('.resolution-slider');slider.max=Math.max(7680,result.edge);slider.value=Math.max(1,result.edge);
      card.querySelector('.scale-fill').style.width=Math.min(100,result.edge/Number(slider.max)*100)+'%';
      card.querySelectorAll('[data-edge]').forEach(button=>{
        const edge=Number(button.dataset.edge),tier=CameraMath.tiers.find(t=>t.pixels===edge);
        const focal=targetForEdge(lens,edge,state.output),relativeZoom=focal/base;
        const beyond=edge>native.edge;
        button.replaceChildren();
        const label=document.createElement('span');label.textContent=tier.name;
        const zoom=document.createElement('span');zoom.className='tier-relative-zoom';zoom.textContent=Number.isFinite(relativeZoom)&&base>0?fmt(relativeZoom)+'×'+(beyond?'*':''):'—';
        button.append(label,zoom);
        button.title=tier.name+'：长边 '+edge+' 像素，目标焦距 '+fmt(focal)+'mm，相对所选基准镜头 '+fmt(relativeZoom)+' 倍'+(beyond?'；超过此镜头原生长边上限 '+native.edge+' 像素，仅为推算':'；这是该镜头保持此档像素时的最大相对倍数');
        button.setAttribute('aria-label',button.title);
        button.style.left=(edge/Number(slider.max)*100)+'%';button.style.transform=edge===Number(slider.max)?'translateX(-100%)':'translateX(-50%)';
      });
      const reference=state.lenses.find(l=>'lens:'+l.id===state.targetRef);
      card.querySelector('.resolution-class').textContent=result.classification+' · 刻度倍数相对 '+(reference?.name||'所选镜头')+'（'+fmt(base)+'mm）';
      slider.setAttribute('aria-valuetext','当前 '+result.classification+'，长边 '+result.edge+' 像素，目标焦距 '+fmt(target)+'mm');
      card.querySelector('.resolution-scale').setAttribute('aria-label','当前长边 '+result.edge+' 像素，'+result.classification+'，建议 '+result.recommendation);
      set('.lens-note',result.zoom<1?'当前目标超出镜头原生能力，已按公式继续推算；原生长边上限 '+native.edge+' 像素。':result.edge<1?'当前预算不足 1 像素，无法形成有效画面。':'原生像素长边上限 '+fmt(CameraMath.calculate(lens,lens.focal,state.output).edge,0)+'；允许超过上限，但不会补出真实细节。建议档位向上取一档，不代表实拍一定清晰。');
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
  fitPhotoViews();
  if(state.photoOriginal&&state.photoCrop&&Math.abs(state.photoCrop.ratio-Number(state.output.w)/Number(state.output.h))>1e-6)$('#photo-status').textContent='目标比例已改变，可点击“重新裁剪”调整照片。';
  $('#demo-note').textContent=valid&&zoom<1?'目标比原始视野更广，原图无法显示取景框外的内容。':'取景框宽高均为原图的 1/'+fmt(scale)+'。'+(state.photoData?'正在使用自己的照片。':'示例图片：Unsplash；加载失败时显示本地风景示意图。')+'此处展示取景范围，不模拟实际镜头画质。';
}
$('#target-reference').addEventListener('change',e=>{state.targetRef=e.target.value;state.targetSource='focal';syncTarget();refresh();save();});
$('#target-zoom').addEventListener('input',e=>{state.targetSource='zoom';state.targetZoom=e.target.value;syncTarget();refresh();save();});
$('#target').addEventListener('input',e=>{state.targetSource='focal';state.target=e.target.value;syncTarget();refresh();save();});
$('#view-zoom').addEventListener('input',e=>{const lens=state.lenses.find(x=>x.id===state.demoId)||state.lenses[0];setTarget(Math.min(100000,Number(lens.focal)*Number(e.target.value)));});
$('#output-preset').addEventListener('change',e=>{state.outputPreset=e.target.value;if(e.target.value!=='custom'){const [w,h]=e.target.value.split(':').map(Number);state.output={w,h};}setupSettings();refresh();save();});
['w','h'].forEach(axis=>$('#output-'+axis).addEventListener('input',e=>{state.output[axis]=e.target.value;refresh();save();}));
$('#add').addEventListener('click',()=>{state.lenses.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:'自定义镜头 '+(state.lenses.length+1),expanded:true,focal:20,totalPixels:50000000,sensorPreset:'1:1',sw:1,sh:1});setupLenses();setupDemoSelect();setupTargetSelect();syncTarget();refresh();save();});
$('#reset').addEventListener('click',()=>{if(confirm('恢复默认示例？这会替换当前保存的镜头与设置。')){state=defaults();initialize();showPhoto();save();}});
$('#demo-lens').addEventListener('change',e=>{state.demoId=e.target.value;refresh();save();});
function initialize(){setupTargetSelect();setupSettings();setupLenses();setupDemoSelect();syncTarget();refresh();}
initialize();if(!storageAvailable)$('#save-status').textContent='保存数据无法读取 · 使用默认示例';
let samplePhoto='scene.svg';
function showPhoto(){
  document.querySelectorAll('.scene-img').forEach(img=>img.src=state.photoData||samplePhoto);
  $('#recrop-photo').disabled=!state.photoOriginal;
  $('#photo-status').textContent=state.photoData?'已使用自己的照片 · 仅保存在此浏览器':'照片只保存在此浏览器';
}
showPhoto();
const photo=new Image();photo.onload=()=>{samplePhoto=photo.src;if(!state.photoData)showPhoto();};photo.src='https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=85';
async function loadPhoto(file){
  if(!file)return;
  if(!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)||file.size>20000000){$('#photo-status').textContent='请选择不超过 20MB 的 JPG、PNG、WebP、AVIF 或 GIF 图片。';return false;}
  $('#photo-status').textContent='正在处理照片…';
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=data;});
    // Downsize locally to fit typical localStorage quotas; never upload this photo.
    const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const original=canvas.toDataURL('image/jpeg',.85);
    if($('#photo-dialog').open)$('#photo-dialog').close();
    await openPhotoCrop(original);
    return true;
  }catch(error){$('#photo-status').textContent='无法读取这张照片，请换一张常见格式图片。';return false;}
}
async function applyPhoto(file){
  const ok=await loadPhoto(file);
  if(ok&&$('#photo-dialog').open)$('#photo-dialog').close();
  else if(!ok)$('#photo-dialog-status').textContent=$('#photo-status').textContent;
}
$('#photo-upload').addEventListener('change',async e=>{await applyPhoto(e.target.files[0]);e.target.value='';});
document.addEventListener('paste',e=>{
  const items=Array.from(e.clipboardData?.items||[]);
  const item=items.find(item=>item.kind==='file'&&item.type.startsWith('image/'));
  const file=item?.getAsFile()||Array.from(e.clipboardData?.files||[]).find(file=>file.type.startsWith('image/'));
  if(!file){if(e.target.id==='photo-paste-area')$('#photo-dialog-status').textContent='剪贴板中没有可用图片，请先复制图片本身，再粘贴。';return;}
  e.preventDefault();applyPhoto(file);
});
$('#reset-photo').addEventListener('click',()=>{state.photoData=null;state.photoOriginal=null;state.photoCrop=null;state.cropCenter={x:.5,y:.5};showPhoto();refreshDemo();save();});
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

$('#change-photo').addEventListener('click',()=>{
  $('#photo-dialog-status').textContent='可上传图片，或在粘贴区域按 Ctrl+V；图片不上传服务器。';
  $('#photo-paste-area').value='';$('#photo-dialog').showModal();$('#photo-paste-area').focus();
});
$('#close-photo-dialog').addEventListener('click',()=>$('#photo-dialog').close());
$('#choose-photo-file').addEventListener('click',()=>$('#photo-upload').click());
$('#read-photo-clipboard').addEventListener('click',async()=>{
  $('#photo-paste-area').focus();
  if(!navigator.clipboard?.read){$('#photo-dialog-status').textContent='此浏览器不支持按钮读取，请在下方区域按 Ctrl+V 粘贴图片。';return;}
  try{
    const items=await navigator.clipboard.read();
    for(const item of items){const type=item.types.find(type=>type.startsWith('image/'));if(type){const blob=await item.getType(type);await applyPhoto(new File([blob],'clipboard-image',{type}));return;}}
    $('#photo-dialog-status').textContent='剪贴板中没有图片。请复制图片本身，再点击粘贴或按 Ctrl+V。';
  }catch(error){$('#photo-dialog-status').textContent='浏览器未允许直接读取，请点击下方区域，再按 Ctrl+V 粘贴图片。';}
});

// Crop from the retained original, never from an already cropped preview.
let photoCropDraft=null,cropDragging=null;
async function openPhotoCrop(original=state.photoOriginal){
  if(!original)return;
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=original;});
  const ratio=Number(state.output.w)/Number(state.output.h);
  if(!Number.isFinite(ratio)||ratio<=0)throw new Error('请先填写有效的成片比例。');
  const width=Math.min(image.naturalWidth,image.naturalHeight*ratio),height=width/ratio;
  const previous=original===state.photoOriginal?state.photoCrop:null;
  const size=previous&&previous.ratio===ratio?Math.max(.1,Math.min(1,previous.width/width)):1;
  const cx=previous?(previous.x+previous.width/2):image.naturalWidth/2,cy=previous?(previous.y+previous.height/2):image.naturalHeight/2;
  photoCropDraft={original,image,ratio,maxWidth:width,maxHeight:height,width:width*size,height:height*size,x:cx-width*size/2,y:cy-height*size/2};
  $('#photo-crop-source').src=original;$('#photo-crop-size').value=size*100;
  $('#photo-crop-ratio').textContent=state.output.w+':'+state.output.h;
  if(!$('#crop-dialog').open)$('#crop-dialog').showModal();
  renderPhotoCrop();$('#photo-crop-box').focus({preventScroll:true});
}
function photoCropGeometry(){
  const draft=photoCropDraft,stage=$('#photo-crop-stage').getBoundingClientRect();
  const scale=Math.min(stage.width/draft.image.naturalWidth,stage.height/draft.image.naturalHeight);
  return {stage,scale,ox:(stage.width-draft.image.naturalWidth*scale)/2,oy:(stage.height-draft.image.naturalHeight*scale)/2};
}
function renderPhotoCrop(){
  if(!photoCropDraft||!$('#crop-dialog').open)return;
  const d=photoCropDraft;d.x=Math.max(0,Math.min(d.image.naturalWidth-d.width,d.x));d.y=Math.max(0,Math.min(d.image.naturalHeight-d.height,d.y));
  const g=photoCropGeometry(),box=$('#photo-crop-box');
  Object.assign(box.style,{left:(g.ox+d.x*g.scale)+'px',top:(g.oy+d.y*g.scale)+'px',width:(d.width*g.scale)+'px',height:(d.height*g.scale)+'px'});
  $('#crop-dimensions').textContent=Math.round(d.width)+' × '+Math.round(d.height);
}
$('#recrop-photo').addEventListener('click',()=>openPhotoCrop().catch(()=>$('#photo-status').textContent='原图读取失败，请重新上传。'));
$('#cancel-crop').addEventListener('click',()=>{$('#crop-dialog').close();showPhoto();});
$('#center-crop').addEventListener('click',()=>{if(!photoCropDraft)return;const d=photoCropDraft;d.x=(d.image.naturalWidth-d.width)/2;d.y=(d.image.naturalHeight-d.height)/2;renderPhotoCrop();});
$('#photo-crop-size').addEventListener('input',e=>{
  if(!photoCropDraft)return;const d=photoCropDraft,cx=d.x+d.width/2,cy=d.y+d.height/2;
  d.width=d.maxWidth*Number(e.target.value)/100;d.height=d.maxHeight*Number(e.target.value)/100;d.x=cx-d.width/2;d.y=cy-d.height/2;renderPhotoCrop();
});
$('#confirm-crop').addEventListener('click',()=>{
  if(!photoCropDraft)return;const d=photoCropDraft,canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(d.width));canvas.height=Math.max(1,Math.round(d.height));
  canvas.getContext('2d').drawImage(d.image,d.x,d.y,d.width,d.height,0,0,canvas.width,canvas.height);
  state.photoOriginal=d.original;state.photoData=canvas.toDataURL('image/jpeg',.85);
  state.photoCrop={x:d.x,y:d.y,width:d.width,height:d.height,ratio:d.ratio};state.cropCenter={x:.5,y:.5};
  $('#crop-dialog').close();showPhoto();refreshDemo();save();
  if(!storageAvailable)$('#photo-status').textContent='照片当前可用，但浏览器空间不足，无法保存到下次。';
});
const photoCropStage=$('#photo-crop-stage');
photoCropStage.addEventListener('pointerdown',e=>{
  if(!photoCropDraft||e.button!==0)return;e.preventDefault();photoCropStage.setPointerCapture(e.pointerId);
  const g=photoCropGeometry(),d=photoCropDraft,x=(e.clientX-g.stage.left-g.ox)/g.scale,y=(e.clientY-g.stage.top-g.oy)/g.scale;
  const inside=x>=d.x&&x<=d.x+d.width&&y>=d.y&&y<=d.y+d.height;
  cropDragging={id:e.pointerId,dx:inside?x-d.x:d.width/2,dy:inside?y-d.y:d.height/2};d.x=x-cropDragging.dx;d.y=y-cropDragging.dy;renderPhotoCrop();
});
photoCropStage.addEventListener('pointermove',e=>{
  if(!cropDragging||e.pointerId!==cropDragging.id)return;const g=photoCropGeometry();photoCropDraft.x=(e.clientX-g.stage.left-g.ox)/g.scale-cropDragging.dx;photoCropDraft.y=(e.clientY-g.stage.top-g.oy)/g.scale-cropDragging.dy;renderPhotoCrop();
});
for(const event of ['pointerup','pointercancel'])photoCropStage.addEventListener(event,()=>cropDragging=null);
$('#photo-crop-box').addEventListener('keydown',e=>{
  const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!photoCropDraft||!moves[e.key])return;e.preventDefault();const d=photoCropDraft,[x,y]=moves[e.key];d.x+=x*d.image.naturalWidth*.01;d.y+=y*d.image.naturalHeight*.01;renderPhotoCrop();
});
function fitPhotoViews(){
  const ratio=state.photoCrop?.ratio||Number(state.output.w)/Number(state.output.h)||16/9;
  document.querySelectorAll('.demo-grid>div').forEach(figure=>{
    const scene=figure.querySelector('.scene'),label=figure.querySelector('.demo-label');if(!scene)return;
    const maxW=figure.clientWidth,maxH=Math.max(1,figure.clientHeight-label.getBoundingClientRect().height-5),w=Math.min(maxW,maxH*ratio);
    scene.style.width=w+'px';scene.style.height=(w/ratio)+'px';
  });
}
const photoLayoutObserver=new ResizeObserver(()=>{fitPhotoViews();renderPhotoCrop();});
photoLayoutObserver.observe($('.demo-grid'));photoLayoutObserver.observe($('#photo-crop-stage'));

$('#crop-dialog').addEventListener('cancel',()=>showPhoto());
