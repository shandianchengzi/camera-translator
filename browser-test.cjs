const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const {calculate,targetForEdge}=require('./calculator.js');
(async()=>{
  const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
  let browser;
  try{
    for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8765')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1366,height:768}});
    await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:8765')?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765');
    assert.equal(await page.locator('.lens').count(),2);
    assert.equal(await page.locator('.lens:not([hidden])').count(),1);
    assert.equal(await page.locator('#model').count(),0);
    assert.equal(await page.locator('#target-reference option').count(),2);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight));
    assert.ok(await page.locator('.base-scene').isVisible());
    assert.ok(await page.locator('.lens:not([hidden]) .resolution-slider').isVisible());
    assert.equal(await page.locator('[data-field="totalPixels"]').first().inputValue(),'5000,0000');
    await page.selectOption('#target-reference','lens:tele');
    await page.fill('#target-zoom','4');
    assert.equal(Number(await page.inputValue('#target')),280);
    assert.equal(await page.locator('.zoom-value').nth(1).textContent(),'4×');
    const move=async(selector,value)=>page.locator(selector).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await move('#view-zoom',10);
    assert.equal(Number(await page.inputValue('#target')),230);
    assert.ok(Math.abs(Number(await page.inputValue('#target-zoom'))-230/70)<1e-5);
    await move('.lens:first-child .resolution-slider',2048);
    const expected=targetForEdge({focal:23,totalPixels:50000000,sw:1,sh:1},2048,{w:16,h:9});
    assert.ok(Math.abs(Number(await page.inputValue('#target'))-expected)<1e-5);
    for(const edge of [1024,2048,3840]) {
      await page.click('.lens:not([hidden]) [data-edge="'+edge+'"]');
      const focal=targetForEdge({focal:23,totalPixels:50000000,sw:1,sh:1},edge,{w:16,h:9});
      assert.ok(Math.abs(Number(await page.inputValue('#target'))-focal)<1e-5);
      assert.equal(Number(await page.locator('.lens:not([hidden]) .resolution-slider').inputValue()),edge);
    }

    await page.click('#add');
    assert.equal(await page.locator('#target-reference option').count(),3);
    const third=page.locator('.lens-param').nth(2);
    await third.locator('[data-field="name"]').fill('自定义测试镜头');
    await third.locator('[data-field="focal"]').fill('100');
    await third.locator('[data-field="totalPixels"]').fill('200000000');
    assert.equal(await third.locator('[data-field="totalPixels"]').inputValue(),'2,0000,0000');
    const customId=await third.getAttribute('data-id');
    await page.selectOption('#target-reference','lens:'+customId);
    await page.fill('#target-zoom','3');assert.equal(Number(await page.inputValue('#target')),300);
    await third.locator('[data-field="focal"]').fill('120');assert.equal(Number(await page.inputValue('#target')),360);
    await page.selectOption('#output-preset','9:16');
    await page.selectOption('#demo-lens',customId);
    await move('.lens:nth-child(3) .resolution-slider',3840);
    const expectedPortrait=targetForEdge({focal:120,totalPixels:200000000,sw:1,sh:1},3840,{w:9,h:16});
    assert.ok(Math.abs(Number(await page.inputValue('#target'))-expectedPortrait)<1e-5);
    const photoBase64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#387663';ctx.fillRect(0,0,400,240);return c.toDataURL('image/png').split(',')[1];});
    await page.setInputFiles('#photo-upload',{name:'test-photo.png',mimeType:'image/png',buffer:Buffer.from(photoBase64,'base64')});
    await page.waitForFunction(()=>document.querySelector('#zoom-image').src.startsWith('data:image/jpeg;base64,'));
    const bounds=await page.locator('.base-scene').boundingBox();
    await page.locator('.base-scene').scrollIntoViewIfNeeded();
    const visibleBounds=await page.locator('.base-scene').boundingBox();
    await page.mouse.click(visibleBounds.x+visibleBounds.width*.3,visibleBounds.y+visibleBounds.height*.4);
    const savedCrop=await page.evaluate(()=>JSON.parse(localStorage.getItem('camera-translator:v1')).cropCenter);
    assert.ok(savedCrop.x<.5);
    assert.ok((await page.locator('#zoom-image').getAttribute('style')).includes('translate('));
    await page.reload();
    assert.equal(await page.locator('.lens').count(),3);
    assert.equal(await page.inputValue('#target-reference'),'lens:'+customId);
    assert.equal(await third.locator('[data-field="totalPixels"]').inputValue(),'2,0000,0000');
    assert.equal(await page.inputValue('#output-preset'),'9:16');
    assert.ok((await page.locator('#zoom-image').getAttribute('src')).startsWith('data:image/jpeg;base64,'));
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('camera-translator:v1')).cropCenter),savedCrop);
    await third.locator('summary').click();assert.equal(await third.getAttribute('open'),null);
    await third.locator('summary').click();
    await third.locator('.remove').click();assert.equal(await page.locator('.lens').count(),2);
    assert.equal(await page.inputValue('#target-reference'),'lens:main');
    await page.fill('#target','');assert.ok((await page.locator('#global-error').textContent()).length>0);
    await page.fill('#target','200');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    const old={target:200,outputPreset:'16:9',output:{w:16,h:9},model:'linear',refs:[{name:'人眼基准',focal:50},{name:'手机主摄',focal:23},{name:'Pocket 4',focal:20}],lenses:[{id:'main',name:'以前保存的主摄',focal:24,mp:200,sw:1,sh:1,sensorPreset:'1:1'},{id:'tele',name:'以前保存的长焦',focal:85,mp:50,sw:4,sh:3,sensorPreset:'4:3'}],demoId:'tele'};
    await page.evaluate(s=>localStorage.setItem('camera-translator:v1',JSON.stringify(s)),old);
    await page.reload();
    assert.equal(await page.locator('#target-reference option').count(),2);
    assert.equal(await page.locator('[data-field="totalPixels"]').first().inputValue(),'2,0000,0000');
    assert.equal(await page.locator('[data-field="focal"]').nth(1).inputValue(),'85');
    assert.equal(await page.inputValue('#demo-lens'),'tele');
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight));
    await page.click('#toggle-sidebar');
    assert.equal(await page.getAttribute('#toggle-sidebar','aria-expanded'),'true');
    await page.fill('#target','250');assert.equal(Number(await page.inputValue('#target')),250);
    await page.click('#close-sidebar');
    assert.equal(await page.getAttribute('#toggle-sidebar','aria-expanded'),'false');
    assert.ok(await page.locator('.base-scene').isVisible());
    assert.ok(await page.locator('.lens:not([hidden]) .resolution-slider').isVisible());
    for(const viewport of [{width:1280,height:720},{width:1440,height:900}]){
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight));
      const rects=await page.evaluate(()=>['.base-scene','.zoom-scene','.lens:not([hidden])'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {selector:s,top:r.top,bottom:r.bottom,height:r.height};}));
      console.log('Viewport bounds',JSON.stringify({viewport,rects}));
      for(const rect of rects){assert.ok(rect.height>20);assert.ok(rect.top>=0&&rect.bottom<=viewport.height+1,'Default view and results must fit in viewport: '+JSON.stringify({viewport,rect}));}
    }
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: arbitrary reference, linked sliders, full pixel input, add/delete, persistence, old settings migration, custom photo, crop movement, one-screen desktop layout and mobile parameter drawer.');
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
