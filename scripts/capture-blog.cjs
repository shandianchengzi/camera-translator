const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const {calculate,targetForEdge}=require('../calculator.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/images');
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
  let browser;
  try{
    for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8765')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
    // Keep the illustrative landscape repeatable; install CJK fonts in the runner.
    await context.route('https://images.unsplash.com/**',route=>route.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765');
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,'01-overview.png')});

    await page.fill('#target-zoom','4');
    const scene=await page.locator('.base-scene').boundingBox();
    await page.mouse.click(scene.x+scene.width*.64,scene.y+scene.height*.52);
    assert.equal(Number(await page.inputValue('#target')),92);
    await page.locator('.demo').screenshot({path:path.join(out,'02-framing.png')});

    // Rasterize the repository's example SVG before exercising the real upload/crop flow.
    const source=await page.evaluate(async()=>{
      const blob=await (await fetch('scene.svg')).blob(),url=URL.createObjectURL(blob);
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
      canvas.getContext('2d').drawImage(image,0,0,1600,1000);URL.revokeObjectURL(url);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.click('#change-photo');
    await page.setInputFiles('#photo-upload',{name:'example-landscape.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')});
    await page.waitForFunction(()=>document.querySelector('#crop-dialog').open);
    await page.locator('#photo-crop-size').evaluate(el=>{el.value='80';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.locator('#crop-dialog').screenshot({path:path.join(out,'03-photo-crop.png')});
    await page.click('#cancel-crop');

    await page.fill('#target','200');
    const tele=page.locator('.lens-param').nth(1);await tele.locator('summary').click();
    await tele.locator('[data-field="name"]').fill('候选 A · 五千万长焦');
    await tele.locator('[data-field="sensorPreset"]').selectOption('4:3');
    await page.click('#add');
    const candidate=page.locator('.lens-param').nth(2);
    await candidate.locator('[data-field="name"]').fill('候选 B · 两亿长焦');
    await candidate.locator('[data-field="focal"]').fill('70');
    await candidate.locator('[data-field="totalPixels"]').fill('200000000');
    await candidate.locator('[data-field="totalPixels"]').blur();
    await candidate.locator('[data-field="sensorPreset"]').selectOption('4:3');
    const id=await candidate.getAttribute('data-id');await page.selectOption('#demo-lens',id);
    await page.evaluate(()=>document.querySelector('.sidebar').scrollTop=330);
    const expected=calculate({focal:70,totalPixels:200000000,sw:4,sh:3},200,{w:16,h:9});
    assert.ok((await page.locator('.lens:not([hidden]) .compact-report').textContent()).includes('5,715 × 3,214'));
    assert.equal(expected.edge,5715);
    await page.waitForTimeout(100);
    await page.screenshot({path:path.join(out,'04-lens-comparison.png')});
    await page.locator('.lens:not([hidden]) [data-edge="3840"]').click();
    const zoom=Number(await page.inputValue('#target-zoom'));
    const maxZoom=targetForEdge({focal:70,totalPixels:200000000,sw:4,sh:3},3840,{w:16,h:9})/23;
    assert.ok(Math.abs(zoom-maxZoom)<1e-5);
    await page.locator('.comparison').screenshot({path:path.join(out,'05-4k-threshold.png')});
    assert.deepEqual(errors,[]);
    const metadata={sourceCommit:process.env.GITHUB_SHA||null,image:'repository scene.svg, not an actual concert photograph',examples:{defaultTarget:200,framing:{baseline:23,zoom:4,target:92},comparison:{baseline:23,focal:70,totalPixels:200000000,sensor:'4:3',output:'16:9',target:200,result:expected,maxRelative4K:maxZoom}}};
    fs.writeFileSync(path.join(out,'capture-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
    console.log('Screenshots and article examples verified:',JSON.stringify(metadata));
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
