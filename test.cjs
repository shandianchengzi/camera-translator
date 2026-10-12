const assert=require('node:assert/strict');
const {calculate,formatPixels,parsePixels,migrateLens,targetFromPhoneZoom,targetForEdge}=require('./calculator.js');
const lens={focal:23,totalPixels:50000000,sw:1,sh:1};
let r=calculate(lens,200,{w:16,h:9});
assert.ok(Math.abs(r.zoom-200/23)<1e-10);
assert.equal(r.pixels,5750000);
assert.equal(r.width,2397);assert.equal(r.height,1348);assert.equal(r.recommendation,'4K');
r=calculate({...lens,focal:70},200,{w:16,h:9});
assert.equal(r.pixels,17500000);assert.equal(r.width,4183);assert.equal(r.recommendation,'8K');
r=calculate({...lens,totalPixels:16000000},23,{w:16,h:9});
assert.equal(r.width,4000);assert.equal(r.height,2250);
r=calculate({...lens,totalPixels:16000000},23,{w:9,h:16});
assert.equal(r.width,2250);assert.equal(r.height,4000);
r=calculate({...lens,totalPixels:12000000,sw:4,sh:3},23,{w:16,h:9});
assert.equal(r.width,4000);assert.equal(r.height,2250);
r=calculate({...lens,totalPixels:12000000,sw:4,sh:3},23,{w:1,h:1});
assert.equal(r.width,r.height);assert.ok(r.width<=3000);
r=calculate(lens,46,{w:16,h:9},'area');assert.equal(r.pixels,12500000);
r=calculate(lens,10,{w:16,h:9});assert.equal(r.pixels,50000000);assert.ok(r.zoom<1);
r=calculate({...lens,totalPixels:100000},200,{w:16,h:9});assert.equal(r.recommendation,'1K');
for(const invalid of [0,-1,NaN,Infinity,''])assert.throws(()=>calculate({...lens,focal:invalid},200,{w:16,h:9}));
assert.throws(()=>calculate(lens,200,{w:0,h:9}));
assert.throws(()=>calculate(lens,200,{w:101,h:9}));
console.log('All focal length, pixel budget, aspect ratio and boundary tests passed.');

assert.equal(formatPixels(200000000),'2,0000,0000');
assert.equal(formatPixels(50000000),'5000,0000');
assert.equal(formatPixels(5750000),'575,0000');
assert.equal(parsePixels('2,0000,0000'),200000000);
assert.equal(parsePixels('5000，0000'),50000000);
assert.ok(Number.isNaN(parsePixels('50MP')));
assert.ok(Number.isNaN(parsePixels('1.5')));
const migrated=migrateLens({focal:70,mp:200,name:'自定义长焦'});
assert.equal(migrated.totalPixels,200000000);assert.equal(migrated.name,'自定义长焦');assert.equal(migrated.mp,undefined);
assert.equal(migrateLens({totalPixels:12345678,mp:200}).totalPixels,12345678);
assert.equal(migrateLens({totalPixels:''}).totalPixels,'');
assert.equal(targetFromPhoneZoom(23,10),230);
assert.ok(Number.isNaN(targetFromPhoneZoom(23,'')));
assert.equal(calculate({...lens,focal:70},targetFromPhoneZoom(23,10),{w:16,h:9}).zoom,230/70);
assert.equal(calculate({...lens,totalPixels:'5000,0000'},200,{w:16,h:9}).pixels,5750000);
console.log('Pixel digit grouping, previous settings migration and phone zoom tests passed.');

for(const model of ['linear','area']) {
  for(const sensor of [{sw:1,sh:1},{sw:4,sh:3},{sw:3,sh:2}]) {
    for(const output of [{w:16,h:9},{w:9,h:16},{w:1,h:1},{w:21,h:9}]) {
      const testLens={...lens,...sensor};
      for(const edge of [1024,2048,2560,3840]) {
        const target=targetForEdge(testLens,edge,output,model);
        const result=calculate(testLens,target,output,model);
        assert.ok(Math.abs(result.edge-edge)<=1,model+' resolution slider inversion');
      }
    }
  }
}
assert.equal(targetForEdge(lens,7680,{w:16,h:9}),lens.focal);
assert.equal(targetForEdge(lens,1,{w:16,h:9}),100000);
assert.throws(()=>targetForEdge(lens,0,{w:16,h:9}));
console.log('Resolution slider inversion, sensor ratios, portrait and native-pixel bounds passed.');
